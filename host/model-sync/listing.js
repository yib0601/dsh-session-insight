/**
 * Read the model listing of one gateway route.
 *
 * Responsibility: one HTTP GET, authenticated per protocol, parsed into rows this
 * plugin can turn into DSH entries. Not responsible: what the rows mean, whether
 * the result should be stored, or any scheduling.
 *
 * Protocol handling mirrors what DSH itself does when it interrogates a route:
 * Anthropic Messages lists at `{root}/v1/models` with `x-api-key` +
 * `anthropic-version` (gateway documentation publishes both `{root}` and
 * `{root}/v1` as the base, so one trailing `/v1` is normalised away), OpenAI
 * protocols at `{base}/models` with a bearer token, Gemini at `{base}/models`
 * with `x-goog-api-key`.
 *
 * The reply is bounded: the endpoint is whatever the profile configured, so a
 * runaway body is refused rather than buffered.
 */

/** Reply larger than this is refused; a truncated listing is unparseable anyway. */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/** Anthropic's required API version header. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** Default per-request deadline for a listing read. */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** Listing page size asked of endpoints that paginate. */
const PAGE_LIMIT = 1000;

/**
 * Where this route lists its models.
 * @param baseURL - the route's configured endpoint.
 * @param api - the route's wire protocol.
 * @returns the absolute listing URL.
 */
export function listingUrl(baseURL, api) {
  const base = String(baseURL).replace(/\/+$/u, '');
  if (api === 'google-generative-ai') return `${base}/models?pageSize=${String(PAGE_LIMIT)}`;
  if (api !== 'anthropic-messages') return `${base}/models`;
  const root = base.endsWith('/v1') ? base.slice(0, -3) : base;
  return `${root}/v1/models?limit=${String(PAGE_LIMIT)}`;
}

/** Auth headers for one protocol; a keyless route still gets `accept`. */
function authHeaders(api, apiKey) {
  if (api === 'anthropic-messages') {
    return apiKey === undefined
      ? { 'anthropic-version': ANTHROPIC_VERSION }
      : { 'anthropic-version': ANTHROPIC_VERSION, 'x-api-key': apiKey };
  }
  if (api === 'google-generative-ai') return apiKey === undefined ? {} : { 'x-goog-api-key': apiKey };
  return apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` };
}

/**
 * Fill a single-platform listing's missing `backends`.
 *
 * A cold gateway answers rows without `backends`, which would degrade every name
 * to a bare model name. When the whole listing names one platform there is no
 * ambiguity to guess about; with two or more, the rows are left as they are.
 * @param rows - parsed rows (mutated in place).
 */
export function fillMissingPlatforms(rows) {
  const platforms = [];
  for (const row of rows) {
    for (const backend of Array.isArray(row.backends) ? row.backends : []) {
      if (!platforms.includes(backend)) platforms.push(backend);
    }
  }
  if (platforms.length !== 1) return;
  for (const row of rows) {
    if (!Array.isArray(row.backends) || row.backends.length === 0) row.backends = [...platforms];
  }
}

/**
 * Parse one listing reply.
 * @param body - parsed JSON body.
 * @returns de-duplicated `{id, row}` pairs in endpoint order.
 * @throws TypeError when the body carries neither a `data` array nor a `models` map.
 */
export function parseListing(body) {
  const listing = body !== null && typeof body === 'object' ? body : {};
  let rows;
  if (Array.isArray(listing.data)) {
    rows = listing.data;
  } else if (listing.models !== null && typeof listing.models === 'object' && !Array.isArray(listing.models)) {
    // Enriched gateways key one object per model id.
    rows = Object.entries(listing.models)
      .filter(([, value]) => value !== null && typeof value === 'object' && !Array.isArray(value))
      // The map key is the alias requests accept, so it wins over a nested id.
      .map(([id, value]) => ({ ...value, id }));
  } else {
    throw new TypeError('model listing has neither a "data" array nor a "models" map');
  }
  const seen = new Set();
  const pairs = [];
  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    pairs.push({ id, row: raw });
  }
  fillMissingPlatforms(pairs.map((pair) => pair.row));
  return pairs;
}

/**
 * Fetch and parse one route's listing.
 * @param options - `baseURL`, `api`, optional `apiKey`/`headers`, plus test seams
 *   (`fetchImpl`, `timeoutMs`, `maxBytes`).
 * @returns de-duplicated `{id, row}` pairs in endpoint order.
 * @throws Error naming the failure (`http-404`, `timeout`, `network`, `oversized`,
 *   `shape`) — the caller decides whether to keep the stored list.
 */
export async function fetchModels(options) {
  const {
    baseURL, api = 'openai-completions', apiKey, headers = {},
    fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES,
  } = options;
  const url = listingUrl(baseURL, api);
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
  let text;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...authHeaders(api, apiKey), ...headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`http-${String(response.status)}`);
      error.status = response.status;
      throw error;
    }
    const declared = Number(response.headers?.get?.('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error('oversized');
    text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('oversized');
  } catch (error) {
    if (controller.signal.aborted === true) {
      const timeout = new Error('timeout');
      timeout.cause = error;
      throw timeout;
    }
    if (error instanceof Error && (error.status !== undefined || error.message === 'oversized')) throw error;
    const network = new Error('network');
    network.cause = error;
    throw network;
  } finally {
    clearTimeout(timer);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    const shape = new Error('shape');
    shape.cause = error;
    throw shape;
  }
  return parseListing(body);
}
