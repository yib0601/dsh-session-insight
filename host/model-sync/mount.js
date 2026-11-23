/**
 * Wire model sync into a DSH Host: settings, credential, schedule and route.
 *
 * Responsibility: adapt the framework to {@link createModelSync} — read the route
 * out of the `llm-pi-ai` settings document, resolve its key through the credential
 * store, run the cycle on a boot delay plus an interval, and expose the outcome on
 * one same-origin route. Not responsible: HTTP, field semantics, naming, diffing.
 *
 * Why this is a plugin and not a profile script: a route the installed pi-ai
 * catalog does not describe has no runtime model directory — the stored `models`
 * list *is* the catalog. Keeping it equal to the gateway is therefore a
 * configuration write, and DSH's own settings service is the only writer that
 * validates the result, persists it to the profile patch and rebuilds the provider
 * in one transaction. The plugin owns the loop; nothing in DSH is patched.
 *
 * Zero configuration by default (`ai-router` every ten minutes). Environment
 * overrides exist for the odd deployment:
 *   `DSH_TURN_COST_MODEL_SYNC=0`     — disable the loop entirely
 *   `DSH_TURN_COST_MODEL_ROUTES`     — comma-separated provider routes
 *   `DSH_TURN_COST_MODEL_SYNC_MS`    — interval (default 600000)
 *   `DSH_TURN_COST_MODEL_BOOT_MS`    — first-run delay (default 20000)
 *   `DSH_TURN_COST_MODEL_STALE_MS`   — how old a read may be before a read revalidates (default 300000)
 *   `DSH_TURN_COST_SETTINGS_NS`      — settings entry id (default `llm-pi-ai`)
 */

import { createModelSync } from './sync.js';

/** Same-origin route the Client (or curl) reads for sync status. */
export const MODELS_PATH = '/dsh-turn-cost/models';
/** Settings entry that owns pi-ai provider profiles. */
export const DEFAULT_SETTINGS_NS = 'llm-pi-ai';
/** Provider route synced when nothing else is configured. */
export const DEFAULT_ROUTES = Object.freeze(['ai-router']);
/** Default interval between cycles. */
export const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
/** Default delay before the first cycle, so startup I/O is not competed with. */
export const DEFAULT_BOOT_MS = 20_000;
/**
 * Default age at which a cached catalog is stale.
 *
 * A read never waits for the gateway: it answers from the stored catalog and, when
 * the last successful cycle is older than this, revalidates in the background.
 * The window is sized so that opening settings repeatedly costs one gateway read,
 * not one per click, while a model added upstream still shows up on the next look.
 */
export const DEFAULT_STALE_MS = 5 * 60 * 1000;

/** Parse a positive integer from an environment value, or fall back. */
function positiveFromEnv(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/**
 * Resolve the loop's settings from the environment.
 * @param env - process environment (test seam).
 * @returns `{enabled, settingsNs, routes, intervalMs, bootMs}`.
 */
export function resolveSyncOptions(env = {}) {
  const disabled = String(env.DSH_TURN_COST_MODEL_SYNC ?? '').trim().toLowerCase();
  const routes = String(env.DSH_TURN_COST_MODEL_ROUTES ?? '')
    .split(',')
    .map((route) => route.trim())
    .filter((route) => route !== '');
  return {
    enabled: !(disabled === '0' || disabled === 'off' || disabled === 'false'),
    settingsNs: String(env.DSH_TURN_COST_SETTINGS_NS ?? '').trim() || DEFAULT_SETTINGS_NS,
    routes: routes.length > 0 ? routes : [...DEFAULT_ROUTES],
    intervalMs: positiveFromEnv(env.DSH_TURN_COST_MODEL_SYNC_MS, DEFAULT_INTERVAL_MS),
    bootMs: positiveFromEnv(env.DSH_TURN_COST_MODEL_BOOT_MS, DEFAULT_BOOT_MS),
    staleMs: positiveFromEnv(env.DSH_TURN_COST_MODEL_STALE_MS, DEFAULT_STALE_MS),
  };
}

/** Find the settings entry that carries `providers`, preferring the named one. */
function settingsEntry(descriptors, settingsNs) {
  const named = descriptors.find((row) => row.ns === settingsNs);
  if (named !== undefined) return named;
  return descriptors.find((row) => row.user?.providers !== undefined || row.value?.providers !== undefined);
}

/** The stored profile override of one route, then the effective profile. */
function routeProfile(descriptor, route) {
  const override = descriptor?.user?.providers?.[route];
  if (override !== undefined && typeof override === 'object') return override;
  const effective = descriptor?.value?.providers?.[route];
  return effective !== undefined && typeof effective === 'object' ? effective : undefined;
}

/**
 * Read the route's models from the profile override; falls back to the effective
 * profile so a catalog route's inherited list is not duplicated into the override
 * by the first write.
 */
function storedModels(descriptor, route) {
  const override = descriptor?.user?.providers?.[route]?.models;
  if (Array.isArray(override)) return override;
  const effective = descriptor?.value?.providers?.[route]?.models;
  return Array.isArray(effective) ? effective : [];
}

/**
 * Mount the sync loop and its status route.
 * @param scoped - Host context that can reach `settings` (and optionally
 *   `credentials` / `webServer`).
 * @param options - {@link resolveSyncOptions} result.
 * @returns `{sync, run, stop}`; `stop` is idempotent.
 */
export function mountModelSync(scoped, options) {
  const get = (name) => (typeof scoped.get === 'function' ? scoped.get(name) : scoped[name]);
  const settings = get('settings');
  const credentials = get('credentials');
  const readKey = async (ref) => {
    if (ref === undefined || ref === '' || credentials === undefined || typeof credentials.resolve !== 'function') return undefined;
    const resolved = await credentials.resolve(ref).catch(() => undefined);
    return resolved === undefined || resolved === null ? undefined : resolved.value;
  };

  /**
   * Resolve the route to sync.
   * @param needsKey - whether to resolve the credential; the catalog read only
   *   needs the profile, and a key resolution is a store round-trip.
   */
  const readTarget = async (needsKey = true) => {
    let descriptors;
    try {
      descriptors = settings.describe();
    } catch (error) {
      scoped.logger?.warn?.(`[dsh-turn-cost] settings describe failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const descriptor = settingsEntry(descriptors, options.settingsNs);
    if (descriptor === undefined) return null;
    const route = options.routes.find((candidate) => routeProfile(descriptor, candidate) !== undefined);
    if (route === undefined) return null;
    const profile = routeProfile(descriptor, route);
    if (typeof profile.baseURL !== 'string' || profile.baseURL === '') return null;
    return {
      settingsNs: descriptor.ns,
      route,
      baseURL: profile.baseURL,
      api: typeof profile.api === 'string' ? profile.api : 'openai-completions',
      apiKey: needsKey ? await readKey(profile.apiKeyEnv) : undefined,
      headers: profile.headers !== null && typeof profile.headers === 'object' ? profile.headers : undefined,
      descriptor,
    };
  };

  const sync = createModelSync({
    readTarget: () => readTarget(true),
    readStored: (target) => storedModels(target.descriptor, target.route),
    writeModels: async (target, models) => {
      // The settings service validates the provider, writes the profile patch and
      // rebuilds the route in one transaction; a rejected entry throws and the
      // stored catalog stays as it was.
      await settings.update(target.settingsNs, { providers: { [target.route]: { models } } });
    },
    logger: scoped.logger,
  });

  /**
   * Last cycle that left the stored catalog correct. Only a cycle that ended
   * `written` or `unchanged` counts: a failed read, an empty listing or a rejected
   * write proves nothing about the catalog and must not stop the next look from
   * revalidating.
   */
  let syncedAt = null;
  /** Set while a read-triggered revalidation is in flight, so the reply can say so. */
  let revalidating = false;

  const isStale = (at) => syncedAt === null || at - syncedAt > options.staleMs;

  /** Run one cycle for its side effect; the outcome is what the next read reports. */
  /**
   * Model id → the billing source the gateway stated, from the last healthy read.
   *
   * The stored catalog cannot carry this (pi-ai owns the entry shape), so the Host
   * remembers it and serves it beside the catalog: the Client needs it the moment
   * it decides which subscription the foot should display, and asking the gateway
   * again per render is not an option.
   */
  let quotaSources = null;
  let quotaSourcesAt = null;

  const cycle = async () => {
    const outcome = await sync.run();
    if (outcome.ok && (outcome.reason === 'written' || outcome.reason === 'unchanged')) {
      syncedAt = outcome.at;
      if (outcome.quotaSources !== null && typeof outcome.quotaSources === 'object') {
        quotaSources = { ...outcome.quotaSources };
        quotaSourcesAt = outcome.at;
      }
    }
    return outcome;
  };

  /**
   * Revalidate without making the caller wait. `sync.run` is single-flight, so two
   * settings opens in the same window still cost one gateway request.
   */
  const revalidate = () => {
    if (revalidating) return;
    revalidating = true;
    void cycle().finally(() => { revalidating = false; });
  };

  /**
   * The catalog the picker currently serves, plus how fresh it is.
   *
   * `models` is read from the stored profile rather than from a private cache: the
   * stored list *is* the cache — it is what DSH renders — so the reply is always
   * consistent with the picker, and a restart needs no warm-up.
   */
  const catalog = async () => {
    const target = await readTarget(false);
    const at = Date.now();
    if (target === null) {
      return {
        enabled: options.enabled, route: null, routes: [...options.routes], settingsNs: options.settingsNs,
        baseURL: null, models: [], count: 0, syncedAt, quotaSources, quotaSourcesAt,
        stale: isStale(at), refreshing: revalidating,
      };
    }
    const models = storedModels(target.descriptor, target.route);
    return {
      enabled: options.enabled,
      route: target.route,
      routes: [...options.routes],
      settingsNs: target.settingsNs,
      baseURL: target.baseURL,
      models,
      count: models.length,
      syncedAt,
      quotaSources,
      quotaSourcesAt,
      stale: isStale(at),
      refreshing: revalidating,
    };
  };

  /** Status summary used by `mountModelSync`'s return value and logs. */
  const status = () => ({
    enabled: options.enabled,
    settingsNs: options.settingsNs,
    routes: [...options.routes],
    intervalMs: options.intervalMs,
    staleMs: options.staleMs,
    running: sync.running,
    syncedAt,
    last: sync.last,
  });

  let stopped = false;
  let bootTimer;
  let intervalTimer;
  const start = () => {
    if (!options.enabled || options.intervalMs <= 0) return;
    bootTimer = setTimeout(() => { if (!stopped) void cycle(); }, options.bootMs);
    intervalTimer = setInterval(() => { if (!stopped) void cycle(); }, options.intervalMs);
    if (typeof bootTimer.unref === 'function') bootTimer.unref();
    if (typeof intervalTimer.unref === 'function') intervalTimer.unref();
  };
  const stop = () => {
    stopped = true;
    clearTimeout(bootTimer);
    clearInterval(intervalTimer);
  };
  start();
  scoped.effect(() => stop, 'dsh-turn-cost: model sync loop');

  const webServer = get('webServer');
  if (webServer !== undefined && webServer !== null && typeof webServer.register === 'function') {
    scoped.effect(() => webServer.register({
      kind: 'exact',
      path: MODELS_PATH,
      resource: async (request) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
        }
        const url = new URL(request.url);
        // Reading the catalog is what a surface does when it opens: answer from the
        // stored list immediately, and start a background revalidation when it is
        // older than `staleMs`. `force=1` is the explicit "check now" path and does
        // wait for the gateway, because a button press deserves an answer.
        if (url.searchParams.get('force') === '1') {
          revalidating = true;
          try { await cycle(); } finally { revalidating = false; }
        } else if (isStale(Date.now())) {
          revalidate();
        }
        const body = { ...await catalog(), last: sync.last, intervalMs: options.intervalMs, staleMs: options.staleMs };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      },
    }), 'dsh-turn-cost: model sync route');
  }

  return { sync, status, stop };
}
