/**
 * Independent test for the Host half of the subscription quota: payload
 * normalization for both sources, the per-source cached reader, and the route
 * contract.
 *
 * `host/quota.js` is plain ESM with no DSH imports, so it runs directly in Node
 * with an injected `fetch`. Run: node test/host-quota.test.js
 */
import assert from 'node:assert/strict';
import {
  BALANCE_ENDPOINT, CACHE_MS, QUOTA_PATH, QUOTA_SOURCES, TIMEOUT_MS, KEY_REFS,
  USAGE_ENDPOINT, USAGE_WINDOWS, DEFAULT_SOURCE,
  normalizeBalance, normalizeOpenCodeUsage, createQuotaReader, mountQuotaRoute,
} from '../host/quota.js';

// ── constants ───────────────────────────────────────────────────────────────
assert.equal(BALANCE_ENDPOINT, 'https://api.deepseek.com/user/balance');
assert.equal(USAGE_ENDPOINT, 'https://opencode.ai/zen/go/v1/usage');
assert.equal(QUOTA_PATH, '/dsh-turn-cost/quota');
assert.equal(KEY_REFS.deepseek, 'DEEPSEEK_API_KEY');
assert.equal(KEY_REFS['opencode-go'], 'OPENCODE_GO_API_KEY');
assert.equal(DEFAULT_SOURCE, 'deepseek');
assert.deepEqual([...USAGE_WINDOWS], ['rolling', 'weekly', 'monthly']);
assert.equal(CACHE_MS, 5 * 60 * 1000);
assert.equal(TIMEOUT_MS, 12_000);
assert.deepEqual(Object.keys(QUOTA_SOURCES).sort(), ['deepseek', 'opencode-go']);

// ── normalizeBalance (DeepSeek body) ────────────────────────────────────────
const official = {
  is_available: true,
  balance_infos: [{ currency: 'CNY', total_balance: '19.92', granted_balance: '0.00', topped_up_balance: '19.92' }],
};
assert.deepEqual(normalizeBalance(official), {
  kind: 'balance',
  available: true,
  wallets: [{ currency: 'CNY', total: '19.92', toppedUp: '19.92', granted: '0.00' }],
});
assert.deepEqual(normalizeBalance({ is_available: false, balance_infos: [] }), { kind: 'balance', available: false, wallets: [] },
  'an empty but valid body is a real zero, not a failure');
assert.deepEqual(
  normalizeBalance({ balance_infos: [{ currency: 'USD', total_balance: 3.5, topped_up_balance: 3.5 }] }),
  { kind: 'balance', available: false, wallets: [{ currency: 'USD', total: '3.50', toppedUp: '3.50', granted: '0.00' }] },
  'numeric amounts and a missing granted field degrade predictably',
);
assert.equal(normalizeBalance({ balance_infos: [{ currency: 'CNY', total_balance: 'oops' }] }).wallets.length, 0,
  'an unparseable amount is dropped, not zeroed');
assert.equal(normalizeBalance({ balance_infos: 'nope' }), null, 'a bad shape fails outright');
assert.equal(normalizeBalance(null), null);

// ── normalizeOpenCodeUsage (OpenCode Go body) ───────────────────────────────
const usageBody = {
  usage: {
    rolling: { status: 'ok', percent: 16, resetsAt: '2026-11-19T07:07:04.000Z' },
    weekly: { status: 'ok', percent: 24, resetsAt: '2026-11-23T00:00:00.000Z' },
    monthly: { status: 'ok', percent: 47, resetsAt: '2026-12-02T15:30:38.000Z' },
  },
};
assert.deepEqual(normalizeOpenCodeUsage(usageBody), {
  kind: 'windows',
  windows: [
    { key: 'rolling', percent: 16, status: 'ok', resetsAt: '2026-11-19T07:07:04.000Z' },
    { key: 'weekly', percent: 24, status: 'ok', resetsAt: '2026-11-23T00:00:00.000Z' },
    { key: 'monthly', percent: 47, status: 'ok', resetsAt: '2026-12-02T15:30:38.000Z' },
  ],
}, 'every window is kept in label order');
assert.deepEqual(
  normalizeOpenCodeUsage({ usage: { rolling: { percent: 130 }, weekly: { percent: -4 } } }).windows,
  [{ key: 'rolling', percent: 100, status: 'ok', resetsAt: null }, { key: 'weekly', percent: 0, status: 'ok', resetsAt: null }],
  'percentages clamp to 0–100 and missing fields degrade',
);
assert.equal(normalizeOpenCodeUsage({ usage: { rolling: { percent: 'nope' } } }), null,
  'no usable window is a failure, not zero consumption');
assert.equal(normalizeOpenCodeUsage({ usage: {} }), null);
assert.equal(normalizeOpenCodeUsage({ usage: [] }), null);
assert.equal(normalizeOpenCodeUsage({}), null);
assert.equal(normalizeOpenCodeUsage(null), null);

// OpenCode requests need a fresh session identity per call.
const headersA = QUOTA_SOURCES['opencode-go'].headers();
const headersB = QUOTA_SOURCES['opencode-go'].headers();
assert.equal(headersA['x-opencode-client'], 'cli');
assert.notEqual(headersA['x-opencode-session'], headersB['x-opencode-session'], 'a session id is minted per request');
assert.notEqual(headersA['x-opencode-request'], headersB['x-opencode-request']);
assert.deepEqual(QUOTA_SOURCES.deepseek.headers(), {});

// ── createQuotaReader ───────────────────────────────────────────────────────
let clock = 1_000;
const now = () => clock;
const calls = [];
const reader = createQuotaReader({
  fetch: async (url, init) => {
    calls.push({ url, ref: init.headers.authorization, session: init.headers['x-opencode-session'] });
    if (url === USAGE_ENDPOINT) return { ok: true, status: 200, json: async () => usageBody };
    return { ok: true, status: 200, json: async () => official };
  },
  now,
});
const readKey = async (ref) => 'sk-' + ref;
const seenRefs = [];
const trackingKey = async (ref) => { seenRefs.push(ref); return 'sk-' + ref; };

const deepseek = await reader.read('deepseek', trackingKey, false);
assert.equal(deepseek.status, 'ready');
assert.equal(deepseek.source, 'deepseek');
assert.equal(deepseek.kind, 'balance');
assert.equal(deepseek.wallets[0].total, '19.92');
assert.deepEqual(seenRefs, ['DEEPSEEK_API_KEY'], 'the source owns its credential reference');
assert.equal(calls[0].url, BALANCE_ENDPOINT);
assert.equal(calls[0].ref, 'Bearer sk-DEEPSEEK_API_KEY');

const opencode = await reader.read('opencode-go', trackingKey, false);
assert.equal(opencode.status, 'ready');
assert.equal(opencode.source, 'opencode-go');
assert.equal(opencode.kind, 'windows');
assert.equal(opencode.windows.length, 3);
assert.equal(seenRefs[1], 'OPENCODE_GO_API_KEY');
assert.equal(calls[1].url, USAGE_ENDPOINT);
assert.ok(calls[1].session.startsWith('session_'), 'OpenCode requests carry a session id');

// Cache is per source: reading one source never answers for the other.
assert.equal(calls.length, 2);
assert.equal((await reader.read('deepseek', readKey, false)).cached, true);
assert.equal((await reader.read('opencode-go', readKey, false)).cached, true);
assert.equal(calls.length, 2, 'both sources answer from their own cache entry');

clock += CACHE_MS + 1;
assert.equal((await reader.read('deepseek', readKey, false)).cached, undefined, 'the window expires');
assert.equal(calls.length, 3);
await reader.read('opencode-go', readKey, true);
assert.equal(calls.length, 4, 'force bypasses the cache');
reader.clear();
await reader.read('deepseek', readKey, false);
assert.equal(calls.length, 5, 'clear drops every cache entry');

// Unknown sources never reach the network.
const quiet = createQuotaReader({ fetch: async () => { throw new Error('should not be called'); } });
const unknown = await quiet.read('nope', readKey, false);
assert.equal(unknown.status, 'failed');
assert.equal(unknown.reason, 'unknown-source');

// Missing or empty keys are unconfigured, and never hit the network.
const noKey = createQuotaReader({ fetch: async () => { throw new Error('should not be called'); } });
assert.equal((await noKey.read('opencode-go', async () => undefined, false)).status, 'unconfigured');
assert.equal((await noKey.read('opencode-go', async () => '', false)).status, 'unconfigured');
assert.equal((await noKey.read('opencode-go', async () => { throw new Error('boom'); }, false)).status, 'unconfigured',
  'a throwing key reader is unconfigured, not a crash');

// HTTP failure and bad shapes fail without poisoning the cache.
const failing = createQuotaReader({ fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
const failed = await failing.read('opencode-go', readKey, false);
assert.equal(failed.status, 'failed');
assert.equal(failed.reason, 'http-403');
const brokenShape = createQuotaReader({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ usage: {} }) }) });
assert.equal((await brokenShape.read('opencode-go', readKey, false)).reason, 'shape');
const throwing = createQuotaReader({ fetch: async () => { throw new Error('offline'); } });
assert.equal((await throwing.read('deepseek', readKey, false)).reason, 'network');

// A failing read after a success keeps serving the cached success.
let mode = 'ok';
const flaky = createQuotaReader({
  fetch: async () => (mode === 'ok'
    ? { ok: true, status: 200, json: async () => usageBody }
    : { ok: false, status: 500, json: async () => ({}) }),
  now: () => 5_000,
});
await flaky.read('opencode-go', readKey, false);
mode = 'fail';
assert.equal((await flaky.read('opencode-go', readKey, true)).status, 'failed', 'a forced read reports the failure');
assert.equal((await flaky.read('opencode-go', readKey, false)).status, 'ready', 'the last good body still answers');

// A vendor hang is reported as a timeout.
const hanging = createQuotaReader({
  timeoutMs: 10,
  fetch: (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }),
});
assert.equal((await hanging.read('opencode-go', readKey, false)).reason, 'timeout');

// ── mountQuotaRoute ─────────────────────────────────────────────────────────
const registered = [];
const routeCtx = {
  webServer: {
    register(route) {
      registered.push(route);
      return () => { registered.splice(registered.indexOf(route), 1); };
    },
  },
};
const routeReader = {
  read: async (sourceId, readKeyFn, force) => ({ status: 'ready', source: sourceId, forced: force === true, key: await readKeyFn(sourceId) }),
};
const dispose = mountQuotaRoute(routeCtx, routeReader, async (ref) => 'key-for-' + ref);
assert.equal(registered.length, 1);
const route = registered[0];
assert.equal(route.kind, 'exact');
assert.equal(route.path, QUOTA_PATH);

const readRoute = (method, url) => route.resource(new Request(url, { method }));
const defaultBody = await (await readRoute('GET', 'http://127.0.0.1:3080' + QUOTA_PATH)).json();
assert.deepEqual(defaultBody, { status: 'ready', source: 'deepseek', forced: false, key: 'key-for-deepseek' },
  'the route defaults to the wallet source');
const opencodeBody = await (await readRoute('GET', 'http://127.0.0.1:3080' + QUOTA_PATH + '?source=opencode-go&force=1')).json();
assert.deepEqual(opencodeBody, { status: 'ready', source: 'opencode-go', forced: true, key: 'key-for-opencode-go' });
const unknownSource = await readRoute('GET', 'http://127.0.0.1:3080' + QUOTA_PATH + '?source=nope');
assert.equal(unknownSource.status, 400, 'an unknown source is refused, not silently defaulted');
assert.equal((await unknownSource.json()).reason, 'unknown-source');
const headResponse = await readRoute('HEAD', 'http://127.0.0.1:3080' + QUOTA_PATH);
assert.equal(headResponse.status, 200);
const postResponse = await readRoute('POST', 'http://127.0.0.1:3080' + QUOTA_PATH);
assert.equal(postResponse.status, 405);
assert.equal(postResponse.headers.get('allow'), 'GET, HEAD');
const okResponse = await readRoute('GET', 'http://127.0.0.1:3080' + QUOTA_PATH);
assert.equal(okResponse.headers.get('content-type'), 'application/json; charset=utf-8');
assert.equal(okResponse.headers.get('cache-control'), 'no-store', 'the page must never cache a quota read');

dispose();
assert.equal(registered.length, 0, 'the disposer unregisters the route');

console.log('host-quota.test.js: all assertions passed');
