/**
 * Subscription quota for the sidebar foot.
 *
 * Responsibility: turn one vendor's official quota answer into one small,
 * cached JSON body and serve it on a same-origin route. Three sources are wired:
 * DeepSeek (a wallet balance), OpenCode Go (rolling / weekly / monthly
 * consumption windows) and WorkBuddy (credit packages behind the user's own
 * gateway shim). They answer the same envelope, so the Client renders one shape
 * and picks a source by what the session is actually running on.
 * Not responsible: rendering, display rules, pricing, or provider selection —
 * the Client owns all of that. Provider keys never leave the Host.
 *
 * A missing key reports `unconfigured`, a timeout or HTTP failure reports
 * `failed`, and only a parsed official body reports numbers. A failure is never
 * cached, so the next poll retries; a success is cached per source for
 * {@link CACHE_MS} so a page refresh does not hammer the vendor endpoint.
 *
 * When `DSH_TURN_COST_GATEWAY_URL` names the self-hosted gateway (`ai-shim`), a
 * fourth reader answers **first**: `GET /v1/quota?backend=<id>` on that origin,
 * authenticated with the same bearer the `ai-router` provider uses. The gateway
 * already runs every probe (it is the only party holding the WorkBuddy account
 * token and the only one that knows which backend a router row bills), so this
 * path needs no vendor keys, no shim tunnel, and no per-source endpoint table.
 * Every failure falls through to the vendor reads below — the gateway is an
 * upgrade, never a new single point of failure.
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
  /**
   * WorkBuddy's allowance is not read from the vendor directly: the desktop
   * gateway's billing API needs the account's access token, which only the
   * local shim holds. So this source reads the shim's own `/quota` — the shim
   * does the four billing calls and hands back one normalized envelope. The
   * ref below is a *bearer for that local route*, not a vendor key.
   */
  workbuddy: 'WORKBUDDY_SHIM_TOKEN',
});

/**
 * The self-hosted gateway (`ai-shim`) as the **preferred** reader.
 *
 * The gateway is what this DSH instance actually talks to, so it is the only
 * party that knows two things this plugin would otherwise have to guess:
 *
 *   - which backend a route bills (`/v1/models` rows carry `quota.source`,
 *     derived from the row's `backends` — see `router/quota_source.py`), and
 *   - how much is left on it (`/v1/quota` returns the gateway's own per-backend
 *     probe: shim credit packages, OpenCode windows, wallets).
 *
 * Reading through it also removes two local failure modes: the WorkBuddy shim
 * only listens on the *gateway's* loopback (this machine needs a tunnel to reach
 * it), and each vendor wants its own key. With a gateway URL configured the Host
 * asks one origin with one bearer instead.
 *
 * Unset = off: the three vendor reads below stay exactly as they were, so an
 * installation without a gateway behaves identically.
 */
export const GATEWAY_URL_ENV = 'DSH_TURN_COST_GATEWAY_URL';
/** Bearer ref for that gateway — the same key the `ai-router` provider uses. */
export const GATEWAY_KEY_REF = 'AI_ROUTER_API_KEY';
/** `source=backend` pairs overriding the default source → backend names. */
export const GATEWAY_BACKENDS_ENV = 'DSH_TURN_COST_GATEWAY_BACKENDS';
/** Path the gateway serves per-backend quota on (Bearer, same key as /v1/models). */
export const GATEWAY_QUOTA_PATH = '/v1/quota';
/**
 * Which gateway backend answers for each source. Defaults match the deployment
 * this plugin was written against; `DSH_TURN_COST_GATEWAY_BACKENDS` overrides
 * any of them (`workbuddy=wb,opencode-go=ocgo`) without a code change.
 */
export const GATEWAY_BACKEND_OF_SOURCE = Object.freeze({
  workbuddy: 'workbuddy',
  'opencode-go': 'oc-go',
  deepseek: 'deepseek-official',
});

/** DeepSeek wallet balance endpoint (Bearer provider key). */
export const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance';
/** OpenCode Go consumption windows (Bearer account key). */
export const USAGE_ENDPOINT = 'https://opencode.ai/zen/go/v1/usage';
/**
 * WorkBuddy credit packages, as answered by the gateway shim.
 *
 * The shim is the only holder of the account token, and in production it runs on
 * the gateway host, not next to this plugin (it listens on 127.0.0.1 *there*).
 * So the base URL is configurable: a local SSH forward, an internal address, or
 * a shim running on the same machine all work by changing one variable.
 * `DSH_TURN_COST_WORKBUDDY_QUOTA_URL` wins; the loopback default suits a host
 * that tunnels or co-locates the shim.
 */
export const WORKBUDDY_QUOTA_ENDPOINT = (() => {
  const configured = typeof process !== 'undefined' && process.env
    ? process.env.DSH_TURN_COST_WORKBUDDY_QUOTA_URL
    : undefined;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  return 'http://127.0.0.1:8898/quota';
})();
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

/** One finite non-negative number, or `null`. */
function amountOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Normalize the local shim's `/quota` envelope into the shared window shape.
 *
 * The shim answers for the user's own WorkBuddy gateway, so its body carries
 * three things the vendor endpoints never send and the Client needs:
 *
 *   - `windows[].label` — the credit bucket's own name (`套餐积分` / `奖励积分`),
 *     because WorkBuddy has no fixed rolling/weekly/monthly vocabulary;
 *   - `plan` — the subscription behind the account (`高级版`, expiry instant), the
 *     only place a "how long do I have left" countdown can come from;
 *   - `totals` — one number for "how much credit is left across every bucket".
 *
 * `models` (the shim's per-model free-pool evidence) is deliberately dropped:
 * it describes probe-time free buckets, not the subscription, and mixing them
 * into one percent would average two different things.
 *
 * @param payload - the shim body, `{supported, kind, windows, plan, totals}`.
 * @returns `{kind:'windows', windows, plan, totals}`, or `null` when the shim
 *   reports no subscription allowance (it then answers `supported:false`).
 */
export function normalizeWorkbuddyQuota(payload) {
  if (payload === null || typeof payload !== 'object') return null;
  if (payload.supported === false) return null;
  if (!Array.isArray(payload.windows)) return null;
  const windows = [];
  for (const window of payload.windows) {
    if (window === null || typeof window !== 'object') continue;
    const percent = percentOf(window.percent);
    if (percent === null) continue;
    const label = typeof window.label === 'string' && window.label !== '' ? window.label : null;
    const row = {
      key: typeof window.key === 'string' && window.key !== '' ? window.key : `bucket-${String(windows.length)}`,
      percent,
      status: typeof window.status === 'string' ? window.status : 'ok',
      resetsAt: typeof window.resetsAt === 'string' ? window.resetsAt : null,
    };
    if (label !== null) row.label = label;
    const total = amountOf(window.total);
    const remain = amountOf(window.remain);
    if (total !== null) row.total = total;
    if (remain !== null) row.remain = remain;
    windows.push(row);
  }
  if (windows.length === 0) return null;
  const planRaw = payload.plan === null || typeof payload.plan !== 'object' ? null : payload.plan;
  let plan = null;
  if (planRaw !== null) {
    const name = typeof planRaw.name === 'string' ? planRaw.name : '';
    const code = typeof planRaw.code === 'string' ? planRaw.code : '';
    const expiresAt = typeof planRaw.expiresAt === 'string' ? planRaw.expiresAt
      : (typeof planRaw.expires_at === 'string' ? planRaw.expires_at : null);
    // A plan row is only worth rendering when it says something the windows do
    // not: its name or its expiry. `{paid:true}` alone would be a blank line.
    if (name !== '' || code !== '' || expiresAt !== null) {
      plan = { name, code, paid: planRaw.paid === true, expiresAt };
    }
  }
  const rawTotals = payload.totals === null || typeof payload.totals !== 'object' ? null : payload.totals;
  let totals = null;
  if (rawTotals !== null) {
    const total = amountOf(rawTotals.total);
    const remain = amountOf(rawTotals.remain);
    const used = amountOf(rawTotals.used);
    if (total !== null || remain !== null) {
      totals = {
        total,
        remain,
        used,
        unit: typeof rawTotals.unit === 'string' && rawTotals.unit !== '' ? rawTotals.unit : 'credits',
      };
    }
  }
  return { kind: 'windows', windows, plan, totals };
}


// ── gateway (`ai-shim`) reader ──────────────────────────────────────────────

/**
 * Read the gateway configuration out of the environment.
 *
 * @param env - `process.env` (or a test double).
 * @returns `{baseURL, keyRef, backends}` or `null` when no gateway is configured.
 */
export function resolveGateway(env) {
  const source = env ?? (typeof process !== 'undefined' ? process.env : undefined);
  if (source === undefined || source === null) return null;
  const raw = source[GATEWAY_URL_ENV];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const baseURL = raw.trim().replace(/\/+$/u, '');
  const backends = { ...GATEWAY_BACKEND_OF_SOURCE };
  const pairs = source[GATEWAY_BACKENDS_ENV];
  if (typeof pairs === 'string') {
    for (const pair of pairs.split(',')) {
      const [sourceId, backend] = pair.split('=').map((part) => part.trim());
      if (sourceId === '' || sourceId === undefined) continue;
      if (backend === undefined || backend === '') delete backends[sourceId];
      else backends[sourceId] = backend;
    }
  }
  return { baseURL, keyRef: source.DSH_TURN_COST_GATEWAY_KEY_REF ?? GATEWAY_KEY_REF, backends };
}

/** The gateway's per-backend quota URL, or `null` when that source has no backend. */
export function gatewayQuotaUrl(gateway, sourceId, force) {
  const backend = gateway?.backends?.[sourceId];
  if (typeof backend !== 'string' || backend === '') return null;
  const params = new URLSearchParams({ backend });
  if (force === true) params.set('refresh', '1');
  return `${gateway.baseURL}${GATEWAY_QUOTA_PATH}?${params.toString()}`;
}

/**
 * The gateway's answer → the plugin's one envelope, or `null` to fall back.
 *
 * `null` is the important part: the gateway reports `supported:false` for a
 * backend whose vendor exposes no allowance (a Trae shim, a Gemini key), and a
 * source it does not route at all simply is not in the array. Both mean "this
 * reader cannot answer here", so the vendor path still gets its turn instead of
 * the card going blank.
 *
 * @param backendId - the gateway backend this source reads (`workbuddy`, `oc-go`).
 * @param payload - the parsed `/v1/quota` body (`{data:{backends:[…]}}`).
 * @returns `{kind:'windows', windows, plan, totals}` or `null`.
 */
export function normalizeGatewayQuota(backendId, payload) {
  const backends = payload?.data?.backends;
  if (!Array.isArray(backends) || typeof backendId !== 'string' || backendId === '') return null;
  const rows = backends.filter((row) => row?.backend === backendId);
  const entry = rows.length === 1 ? rows[0] : null;
  if (entry === null || entry.supported !== true || entry.kind !== 'windows') return null;
  const windows = [];
  for (const window of Array.isArray(entry.windows) ? entry.windows : []) {
    const percent = Number(window?.percent);
    if (!Number.isFinite(percent)) continue;
    const row = {
      key: typeof window.name === 'string' && window.name !== '' ? window.name : `bucket-${String(windows.length)}`,
      percent: Math.max(0, Math.min(100, percent)),
      status: typeof window.status === 'string' && window.status !== '' ? window.status : 'ok',
      resetsAt: typeof window.resets_at === 'string' ? window.resets_at : null,
    };
    if (typeof window.label === 'string' && window.label !== '') row.label = window.label;
    const total = amountOf(window.total);
    const remain = amountOf(window.remain);
    if (total !== null) row.total = total;
    if (remain !== null) row.remain = remain;
    windows.push(row);
  }
  if (windows.length === 0) return null;
  const rawPlan = entry.plan !== null && typeof entry.plan === 'object' ? entry.plan : null;
  const plan = rawPlan === null ? null : {
    name: typeof rawPlan.name === 'string' ? rawPlan.name : '',
    code: typeof rawPlan.code === 'string' ? rawPlan.code : '',
    paid: rawPlan.paid === true,
    expiresAt: typeof rawPlan.expires_at === 'string' ? rawPlan.expires_at
      : (typeof rawPlan.expiresAt === 'string' ? rawPlan.expiresAt : null),
  };
  const rawTotals = entry.totals !== null && typeof entry.totals === 'object' ? entry.totals : null;
  const totals = rawTotals === null ? null : {
    total: amountOf(rawTotals.total),
    remain: amountOf(rawTotals.remain),
    used: amountOf(rawTotals.used),
    unit: typeof rawTotals.unit === 'string' && rawTotals.unit !== '' ? rawTotals.unit : 'credits',
  };
  const keeper = plan !== null && (plan.name !== '' || plan.code !== '' || plan.expiresAt !== null) ? plan : null;
  return { kind: 'windows', windows, plan: keeper, totals };
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
  workbuddy: Object.freeze({
    id: 'workbuddy',
    keyRef: KEY_REFS.workbuddy,
    endpoint: WORKBUDDY_QUOTA_ENDPOINT,
    normalize: normalizeWorkbuddyQuota,
    headers: () => ({}),
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

  /**
   * One read through the gateway, or `null` when it cannot answer.
   *
   * @param sourceId - the source being read.
   * @param readKey - credential resolver, the same one the vendor path uses.
   * @param force - bypass the Host cache on the gateway side too.
   * @returns the ready body, or `null` (never throws, never caches a failure).
   */
  const readViaGateway = async (sourceId, readKey, force) => {
    const gateway = options.gateway;
    const url = gatewayQuotaUrl(gateway, sourceId, force);
    if (url === null) return null;
    let key;
    try {
      key = await readKey(gateway.keyRef);
    } catch (error) {
      return null;
    }
    if (typeof key !== 'string' || key === '') return null;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const normalized = normalizeGatewayQuota(gateway.backends[sourceId], await response.json());
      if (normalized === null) return null;
      const at = now();
      const body = { status: 'ready', source: sourceId, ...normalized, at, via: 'gateway' };
      cached.set(sourceId, { at, body });
      return body;
    } catch (error) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const read = async (sourceId, readKey, force) => {
    const source = QUOTA_SOURCES[sourceId];
    if (source === undefined) return { status: 'failed', reason: 'unknown-source', at: now() };
    const at = now();
    const hit = cached.get(sourceId);
    if (force !== true && hit !== undefined && at - hit.at < cacheMs) {
      return { ...hit.body, cached: true };
    }
    // The gateway answers first: it is the party this client actually talks to,
    // so it knows both which backend a route bills and how much is left. Any
    // failure (no key, unreachable, `supported:false`, an unreadable platform)
    // falls through to the vendor read below — a gateway that is down must not
    // be able to blank a figure that a direct read can still produce.
    const gateway = options.gateway ?? null;
    if (gateway !== null) {
      const viaGateway = await readViaGateway(sourceId, readKey, force);
      if (viaGateway !== null) return viaGateway;
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
