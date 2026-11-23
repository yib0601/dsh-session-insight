/**
 * Keep one DSH route's declared model catalog equal to what its gateway serves.
 *
 * Responsibility: one sync cycle — resolve the route, read the gateway listing,
 * build the entries, compare them with what the profile stores, and write only on
 * a real difference. Not responsible: HTTP details (`listing.js`), field
 * semantics (`catalog.js`), naming (`naming.js`), scheduling or the settings
 * service (`mount.js`).
 *
 * Three refusals make it safe to run every few minutes without supervision:
 *   - an unreachable or malformed endpoint writes nothing (a gateway restart must
 *     not blank the model picker);
 *   - an empty listing writes nothing (same reason);
 *   - a listing whose generated names leave the naming contract writes nothing
 *     (one GUI must never show two naming styles for one catalog).
 * A no-change cycle also writes nothing, so the profile file is not rewritten —
 * and the provider not rebuilt — for nothing.
 */

import { buildCatalog } from './catalog.js';
import { fetchModels } from './listing.js';

/** A cycle that has not finished by now is abandoned, so the loop cannot wedge. */
export const CYCLE_TIMEOUT_MS = 90_000;

/** Reject after `ms`, leaving the abandoned promise to settle on its own. */
function withDeadline(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(label)); }, ms);
    if (typeof timer.unref === 'function') timer.unref();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Reasons one cycle can end with; `written` and `unchanged` are the healthy ones. */
export const SYNC_REASONS = Object.freeze([
  'written', 'unchanged', 'no-route', 'fetch-failed', 'empty-listing', 'name-contract', 'write-failed', 'timeout',
]);

/** Stable JSON for comparison: one key order, no whitespace. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Build the sync engine.
 * @param options - injection points; production wires them in `mount.js`.
 * @param options.readTarget - resolves the route to sync, or `null` when the
 *   profile has none: `{settingsNs, route, baseURL, api, apiKey, headers}`.
 * @param options.readStored - the models the profile currently stores for that
 *   route (`[]` when none).
 * @param options.writeModels - persists a complete `models` list for that route.
 * @param options.fetchImpl - `fetch` seam.
 * @param options.now - clock seam.
 * @param options.timeoutMs - listing deadline.
 * @param options.logger - `{info?, warn?}`; failures are logged, never thrown.
 * @returns `{ run(runOptions?), running, last }`.
 */
export function createModelSync(options) {
  const { readTarget, readStored, writeModels, fetchImpl, now = () => Date.now(), timeoutMs, logger } = options;
  let inFlight = null;
  let last = null;

  const cycle = async () => {
    const at = now();
    const target = await readTarget();
    if (target === null || target === undefined || typeof target.baseURL !== 'string' || target.baseURL === '') {
      return { at, ok: true, reason: 'no-route', count: 0, added: 0, removed: 0 };
    }
    let rows;
    try {
      rows = await fetchModels({
        baseURL: target.baseURL,
        api: target.api ?? 'openai-completions',
        apiKey: target.apiKey,
        headers: target.headers,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'fetch-failed';
      logger?.warn?.(`[dsh-turn-cost] model listing for ${target.route} failed: ${reason}`);
      return { at, ok: false, reason: 'fetch-failed', detail: reason, count: 0, added: 0, removed: 0 };
    }
    if (rows.length === 0) {
      logger?.warn?.(`[dsh-turn-cost] model listing for ${target.route} is empty; keeping the stored models`);
      return { at, ok: false, reason: 'empty-listing', count: 0, added: 0, removed: 0 };
    }
    const storedRaw = await readStored(target);
    const stored = Array.isArray(storedRaw) ? storedRaw : [];
    const storedById = new Map(stored.filter((entry) => typeof entry?.id === 'string').map((entry) => [entry.id, entry]));
    const { entries, invalid, quotaSources } = buildCatalog(rows, storedById);
    if (invalid.length > 0) {
      logger?.warn?.(`[dsh-turn-cost] model names left the naming contract (${invalid.slice(0, 3).map((row) => row.name).join(', ')}); keeping the stored models`);
      return { at, ok: false, reason: 'name-contract', count: entries.length, added: 0, removed: 0 };
    }
    const storedIds = new Set(stored.map((entry) => entry?.id));
    const nextIds = new Set(entries.map((entry) => entry.id));
    const added = entries.filter((entry) => !storedIds.has(entry.id)).length;
    const removed = stored.filter((entry) => !nextIds.has(entry?.id)).length;
    if (stable(entries) === stable(stored)) {
      return { at, ok: true, reason: 'unchanged', count: entries.length, added: 0, removed: 0, quotaSources };
    }
    try {
      await writeModels(target, entries);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger?.warn?.(`[dsh-turn-cost] writing the model catalog for ${target.route} failed: ${detail}`);
      return { at, ok: false, reason: 'write-failed', detail, count: entries.length, added, removed };
    }
    logger?.info?.(`[dsh-turn-cost] model catalog for ${target.route}: ${String(entries.length)} models (added ${String(added)}, removed ${String(removed)})`);
    return { at, ok: true, reason: 'written', count: entries.length, added, removed, quotaSources };
  };

  return {
    /**
     * Run one cycle, or join the one already running.
     * @param runOptions - reserved; every call runs a cycle (the scheduler owns
     *   cadence, the route owns the manual trigger).
     * @returns the cycle outcome, also kept as `last`.
     */
    async run(runOptions = {}) {
      void runOptions;
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        try {
          // A cycle that never settles (a credential or settings promise that does
          // not resolve, a socket that never fails) must not become the answer for
          // every later request: `run` is single-flight, so one wedged promise
          // would freeze the catalog — and the `quotaSources` map with it — until
          // the process restarts.
          const outcome = await withDeadline(cycle(), options.cycleTimeoutMs ?? CYCLE_TIMEOUT_MS, 'cycle-timeout');
          last = outcome;
          return outcome;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          const timedOut = detail === 'cycle-timeout';
          logger?.warn?.(`[dsh-turn-cost] model sync ${timedOut ? 'timed out' : 'failed'}: ${detail}`);
          last = {
            at: now(), ok: false, reason: timedOut ? 'timeout' : 'fetch-failed', detail,
            count: 0, added: 0, removed: 0,
          };
          return last;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    /** Whether a cycle is running right now. */
    get running() { return inFlight !== null; },
    /** Last outcome, or `null` before the first cycle. */
    get last() { return last; },
  };
}
