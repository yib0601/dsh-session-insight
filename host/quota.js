/**
 * Subscription quota for the sidebar foot.
 *
 * Responsibility: turn one vendor's official quota answer into one small,
 * cached JSON body and serve it on a same-origin route. Two sources are wired:
 * DeepSeek (a wallet balance) and OpenCode Go (rolling / weekly / monthly
 * consumption windows). Both answer the same envelope, so the Client renders one
 * shape and picks a source by what the session is actually running on.
 * Not responsible: rendering, display rules, pricing, or provider selection —
 * the Client owns all of that. Provider keys never leave the Host.
 *
 * A missing key reports `unconfigured`, a timeout or HTTP failure reports
 * `failed`, and only a parsed official body reports numbers. A failure is never
 * cached, so the next poll retries; a success is cached per source for
 * {@link CACHE_MS} so a page refresh does not hammer the vendor endpoint.
 */
import { randomUUID } from 'node:crypto';

/** Same-origin route the Client reads; nothing else is exposed. */
export const QUOTA_PATH = '/dsh-turn-cost/quota';
/** Freshness window for one successful read. */
export const CACHE_MS = 5 * 60 * 1000;
/** Vendor deadline; these endpoints are normally fast, occasionally slow. */
export const TIMEOUT_MS = 12_000;
/** Credential references per source. */
export const KEY_REFS = Object.freeze({
  deepseek: 'DEEPSEEK_API_KEY',
  'opencode-go': 'OPENCODE_GO_API_KEY',
});

/** DeepSeek wallet balance endpoint (Bearer provider key). */
export const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance';
/** OpenCode Go consumption windows (Bearer account key). */
export const USAGE_ENDPOINT = 'https://opencode.ai/zen/go/v1/usage';
/** Consumption windows the OpenCode endpoint reports, in label order. */
export const USAGE_WINDOWS = Object.freeze(['rolling', 'weekly', 'monthly']);

/** One server decimal, kept as the exact string the platform sent. */
function decimal(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?$/u.test(trimmed) ? trimmed : null;
}

/** One usage window's percent, clamped to 0–100; `null` when unusable. */
function percentOf(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, percent));
}

/**
 * Normalize one DeepSeek balance payload.
 * @param payload - parsed `{"is_available":bool,"balance_infos":[…]}` body.
 * @returns `{ kind:'balance', available, wallets }`, or `null` when the shape is
 *   unusable — a broken answer must not render as a zero balance.
 */
export function normalizeBalance(payload) {
  if (payload === null || typeof payload !== 'object') return null;
  const infos = payload.balance_infos;
  if (!Array.isArray(infos)) return null;
  const wallets = [];
  for (const info of infos) {
    if (info === null || typeof info !== 'object') continue;
    const total = decimal(info.total_balance);
    if (total === null) continue;
    wallets.push({
      currency: info.currency === 'USD' ? 'USD' : 'CNY',
      total,
      toppedUp: decimal(info.topped_up_balance) ?? '0.00',
      granted: decimal(info.granted_balance) ?? '0.00',
    });
  }
  return { kind: 'balance', available: payload.is_available === true, wallets };
}

/**
 * Normalize one OpenCode Go usage payload.
 * @param payload - parsed `{"usage":{"rolling":{…},"weekly":{…},"monthly":{…}}}` body.
 * @returns `{ kind:'windows', windows:[{key,percent,status,resetsAt}] }`, or
 *   `null` when no window carries a usable percentage.
 */
export function normalizeOpenCodeUsage(payload) {
  if (payload === null || typeof payload !== 'object') return null;
  const usage = payload.usage;
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const windows = [];
  for (const key of USAGE_WINDOWS) {
    const window = usage[key];
    if (window === null || typeof window !== 'object') continue;
    const percent = percentOf(window.percent);
    if (percent === null) continue;
    windows.push({
      key,
      percent,
      status: typeof window.status === 'string' ? window.status : 'ok',
      resetsAt: typeof window.resetsAt === 'string' ? window.resetsAt : null,
    });
  }
  return windows.length === 0 ? null : { kind: 'windows', windows };
}

/**
 * Wired sources. `headers` is called per request so a session identity is minted
 * fresh instead of being replayed.
 */
export const QUOTA_SOURCES = Object.freeze({
  deepseek: Object.freeze({
    id: 'deepseek',
    keyRef: KEY_REFS.deepseek,
    endpoint: BALANCE_ENDPOINT,
    normalize: normalizeBalance,
    headers: () => ({}),
  }),
  'opencode-go': Object.freeze({
    id: 'opencode-go',
    keyRef: KEY_REFS['opencode-go'],
    endpoint: USAGE_ENDPOINT,
    normalize: normalizeOpenCodeUsage,
    headers: () => ({
      'x-opencode-client': 'cli',
      'x-opencode-session': `session_${randomUUID()}`,
      'x-opencode-request': `req_${randomUUID()}`,
    }),
  }),
});

/** Default source when the caller does not name one. */
export const DEFAULT_SOURCE = 'deepseek';

/**
 * Build the quota reader.
 * @param options - injection points for tests; production uses the defaults.
 * @returns `{ read(sourceId, readKey, force), clear() }`.
 */
export function createQuotaReader(options = {}) {
  const cacheMs = options.cacheMs ?? CACHE_MS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  /** Last *successful* body per source; failures never overwrite it. */
  const cached = new Map();

  const read = async (sourceId, readKey, force) => {
    const source = QUOTA_SOURCES[sourceId];
    if (source === undefined) return { status: 'failed', reason: 'unknown-source', at: now() };
    const at = now();
    const hit = cached.get(sourceId);
    if (force !== true && hit !== undefined && at - hit.at < cacheMs) {
      return { ...hit.body, cached: true };
    }
    let key;
    try {
      key = await readKey(source.keyRef);
    } catch (error) {
      key = undefined;
    }
    if (typeof key !== 'string' || key === '') return { status: 'unconfigured', source: sourceId, at };
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(source.endpoint, {
        method: 'GET',
        headers: { authorization: `Bearer ${key}`, accept: 'application/json', ...source.headers() },
        signal: controller.signal,
      });
      if (!response.ok) return { status: 'failed', source: sourceId, reason: `http-${String(response.status)}`, at };
      const normalized = source.normalize(await response.json());
      if (normalized === null) return { status: 'failed', source: sourceId, reason: 'shape', at };
      const body = { status: 'ready', source: sourceId, ...normalized, at };
      cached.set(sourceId, { at, body });
      return body;
    } catch (error) {
      const aborted = controller.signal.aborted === true;
      return { status: 'failed', source: sourceId, reason: aborted ? 'timeout' : 'network', at };
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    read,
    clear() { cached.clear(); },
  };
}

/**
 * Register the same-origin route on the Host web server.
 * @param ctx - Host context providing `webServer`.
 * @param reader - {@link createQuotaReader} result.
 * @param readKey - resolves a credential reference on every read (never cached here).
 * @returns the route disposer.
 */
export function mountQuotaRoute(ctx, reader, readKey) {
  return ctx.webServer.register({
    kind: 'exact',
    path: QUOTA_PATH,
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      const url = new URL(request.url);
      const sourceId = url.searchParams.get('source') || DEFAULT_SOURCE;
      if (QUOTA_SOURCES[sourceId] === undefined) {
        return new Response(JSON.stringify({ status: 'failed', reason: 'unknown-source', source: sourceId }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      const force = url.searchParams.get('force') === '1';
      const body = await reader.read(sourceId, readKey, force);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    },
  });
}
