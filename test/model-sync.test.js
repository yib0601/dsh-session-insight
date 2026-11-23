/**
 * Independent test for the model-catalog sync: display-name semantics, row →
 * DSH entry mapping, listing parsing, and the sync cycle's refusals.
 *
 * `host/model-sync/*.js` is plain ESM with no DSH imports, so it runs directly in
 * Node with an injected `fetch`. Run: node --test test/
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BILLING_LABELS, displayName, fmtWindow, nameOk, PLATFORM_LABELS } from '../host/model-sync/naming.js';
import {
  GENERATED_COMPAT, MODALITIES, REASONING_LEVELS, buildCatalog, buildEntry, isGeneratedReasoning,
  quotaSourceOf,
  modalitiesOf, reasoningLevelsOf,
} from '../host/model-sync/catalog.js';
import {
  ANTHROPIC_VERSION, MAX_RESPONSE_BYTES, fetchModels, fillMissingPlatforms, listingUrl, parseListing,
} from '../host/model-sync/listing.js';
import { createModelSync } from '../host/model-sync/sync.js';
import {
  DEFAULT_BOOT_MS, DEFAULT_INTERVAL_MS, DEFAULT_ROUTES, DEFAULT_SETTINGS_NS, MODELS_PATH, mountModelSync, resolveSyncOptions,
  createModelsSurface,
} from '../host/model-sync/mount.js';

// ── constants ───────────────────────────────────────────────────────────────
assert.equal(MODELS_PATH, '/dsh-turn-cost/models');
assert.equal(DEFAULT_SETTINGS_NS, 'llm-pi-ai');
assert.deepEqual([...DEFAULT_ROUTES], ['ai-router']);
assert.equal(DEFAULT_INTERVAL_MS, 600_000);
assert.equal(DEFAULT_BOOT_MS, 20_000);
assert.deepEqual([...MODALITIES], ['text', 'image']);
assert.equal(REASONING_LEVELS.at(-1), 'max');
assert.equal(ANTHROPIC_VERSION, '2023-06-01');
assert.equal(MAX_RESPONSE_BYTES, 4 * 1024 * 1024);
assert.equal(PLATFORM_LABELS.workbuddy, 'WorkBuddy');
assert.equal(BILLING_LABELS.free_pool, '免费池');

// ── naming ──────────────────────────────────────────────────────────────────
assert.equal(fmtWindow(1_000_000), '1M');
assert.equal(fmtWindow(960_000), '960K');
assert.equal(fmtWindow(192_000), '192K');
assert.equal(fmtWindow(undefined), '');
assert.equal(fmtWindow(0), '');

const direct = { name: 'Kimi-K3', backends: ['workbuddy'], billing: 'paid', context_window: 1_000_000 };
assert.equal(displayName('kimi-k3', direct), 'WorkBuddy · 付费 · Kimi-K3 · 1M');
assert.equal(displayName('kimi-k3', { ...direct, source_type: 'equiv' }), 'Kimi-K3 · 付费自动降级 · 1M',
  'a failover row names no platform');
assert.equal(displayName('mystery', { name: 'Mystery' }), 'Mystery',
  'no platform and no capacity degrades to the bare model name');
assert.equal(displayName('x', { name: 'X · Trae' }), 'X', 'legacy router marker is stripped');
assert.equal(displayName('x', { name: 'X', backends: ['oc-go', 'oc-zen'], billing: 'free' }),
  'OpenCode Go/OpenCode Zen · 免费 · X');
assert.equal(displayName('flint-40b', { name: 'flint-40b-free', backends: ['oc-zen'], billing: 'free' }),
  'OpenCode Zen · 免费 · flint-40b', 'a "-free" tail is not repeated beside 免费');

// idempotent: feeding the generated name back yields the same string
for (const [id, row] of [
  ['kimi-k3', direct],
  ['hy4-flash', { name: 'Hy4-Flash', backends: ['workbuddy'], billing: 'free', context_window: 960_000 }],
  ['hy4flash-free', { name: 'Hy4-flash 限免', backends: ['workbuddy'], billing: 'free_pool', context_window: 960_000 }],
  ['auto', { name: 'auto', backends: ['workbuddy'], billing: 'free', context_window: 256_000 }],
]) {
  const once = displayName(id, row);
  assert.equal(displayName(id, { ...row, name: once }), once, `idempotent for ${id}`);
}

assert.equal(nameOk('WorkBuddy · 付费 · Kimi-K3 · 1M'), true);
assert.equal(nameOk('Hy4 · 付费源待命'), false);
assert.equal(nameOk('Kimi-K3'), true, 'a degraded plain name is still inside the contract');

// ── catalog: row → entry ────────────────────────────────────────────────────
const row = {
  id: 'kimi-k3',
  name: 'Kimi-K3',
  backends: ['workbuddy'],
  billing: 'paid',
  input: ['text', 'image'],
  context_window: 1_000_000,
  max_tokens: 32_000,
  reasoning: { levels: ['off', 'low', 'high', 'max'], default: 'high' },
};
assert.deepEqual(modalitiesOf(row), ['text', 'image']);
assert.equal(modalitiesOf({}), undefined, 'an undeclared modality list stays unknown');
assert.deepEqual(reasoningLevelsOf(row), ['off', 'low', 'high', 'max']);
assert.equal(reasoningLevelsOf({ reasoning: { effort: 'medium' } }), undefined);

assert.equal(isGeneratedReasoning(undefined), true);
assert.equal(isGeneratedReasoning({ off: null, low: 'low' }), true);
assert.equal(isGeneratedReasoning({ off: null }), false, 'an all-off block is not this module\'s output');
assert.equal(isGeneratedReasoning({ low: 'light' }), false, 'a foreign wire value marks a hand-tuned block');
assert.equal(isGeneratedReasoning({ turbo: 'turbo' }), false);

const entry = buildEntry('kimi-k3', row);
assert.deepEqual(entry, {
  id: 'kimi-k3',
  name: 'WorkBuddy · 付费 · Kimi-K3 · 1M',
  input: ['text', 'image'],
  contextWindow: 1_000_000,
  maxTokens: 32_000,
  reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
  compat: { ...GENERATED_COMPAT },
});

// a hand-tuned reasoning block survives: only the other generated fields refresh
const handTuned = {
  id: 'kimi-k3',
  name: 'Kimi-K3',
  input: ['text'],
  reasoningEfforts: { low: 'light', high: 'high' },
  compat: { forceAdaptiveThinking: false, custom: true },
  maxRequestImages: 8,
};
const kept = buildEntry('kimi-k3', row, handTuned);
assert.deepEqual(kept.reasoningEfforts, { low: 'light', high: 'high' });
assert.deepEqual(kept.compat, { forceAdaptiveThinking: false, custom: true });
assert.deepEqual(kept.input, ['text', 'image'], 'declared modalities still refresh');
assert.equal(kept.name, 'WorkBuddy · 付费 · Kimi-K3 · 1M');
assert.equal(kept.maxRequestImages, 8, 'fields this module does not own survive');

// a silent row keeps what the entry already declared
const silent = buildEntry('kimi-k3', { backends: ['workbuddy'], billing: 'paid' }, { id: 'kimi-k3', input: ['text'], contextWindow: 123 });
assert.deepEqual(silent.input, ['text'], 'an undeclared modality list is not overwritten with a guess');
assert.equal(silent.contextWindow, 123);

// a non-thinking model drops the block and the compat switches it needed
const flat = buildEntry('flat', { name: 'Flat', backends: ['workbuddy'], billing: 'free', reasoning: { levels: ['off'] } }, { compat: { ...GENERATED_COMPAT } });
assert.equal(flat.reasoningEfforts, undefined);
assert.equal(flat.compat, undefined);

// the two compat switches leave a user's other switches alone
const mixed = buildEntry('mix', { name: 'Mix', reasoning: { levels: ['low'] } }, { compat: { allowEmptySignature: false, extra: true } });
assert.deepEqual(mixed.compat, { allowEmptySignature: true, extra: true, forceAdaptiveThinking: true });

const { entries, invalid } = buildCatalog([
  { id: 'a', row: { name: 'A', backends: ['workbuddy'], billing: 'paid', context_window: 1000 } },
  { id: 'b', row: { name: 'B · Trae' } },
], new Map());
assert.equal(entries.length, 2);
assert.deepEqual(invalid, [], 'the legacy marker is stripped before the gate runs');

const refused = buildCatalog([{ id: 'c', row: { name: 'C' } }], new Map());
assert.deepEqual(refused.invalid, []);

// The gateway states which plan pays per row (`ai-shim`'s `quota.source`); a DSH
// model entry cannot carry that field, so the sync lifts it out and the Host
// serves it beside the catalog.
const withQuota = buildCatalog([
  { id: 'wb', row: { name: 'WB', quota: { source: 'workbuddy', basis: 'single' } } },
  { id: 'mixed', row: { name: 'M', quota: { source: null, basis: 'mixed' } } },
  { id: 'silent', row: { name: 'S' } },
  { id: 'plain', row: { name: 'P', quota: 'nonsense' } },
], new Map());
assert.deepEqual(withQuota.quotaSources, { wb: 'workbuddy', mixed: null },
  'a stated source and a stated "nothing readable" both survive; silence is not a verdict');
assert.equal(withQuota.entries.some((entry) => 'quota' in entry), false,
  'the entry itself stays inside the pi-ai schema');
assert.deepEqual(quotaSourceOf({ quota: { source: 'oc', basis: 'single' } }), 'oc');
assert.equal(quotaSourceOf({ quota: { source: null, basis: 'unreadable' } }), null);
assert.equal(quotaSourceOf({ name: 'no quota field' }), undefined);

// ── listing ─────────────────────────────────────────────────────────────────
assert.equal(listingUrl('https://gw.example', 'anthropic-messages'), 'https://gw.example/v1/models?limit=1000');
assert.equal(listingUrl('https://gw.example/v1', 'anthropic-messages'), 'https://gw.example/v1/models?limit=1000',
  'one trailing /v1 is normalised away, not doubled');
assert.equal(listingUrl('https://gw.example/v1/', 'openai-completions'), 'https://gw.example/v1/models');
assert.equal(listingUrl('https://gw.example/v1beta', 'google-generative-ai'), 'https://gw.example/v1beta/models?pageSize=1000');

assert.deepEqual(parseListing({ data: [{ id: 'a' }, { id: 'a' }, { id: 'b' }, { no: 'id' }] }).map((pair) => pair.id), ['a', 'b']);
assert.deepEqual(parseListing({ models: { m1: { id: 'ignored' }, m2: { name: 'M2' } } }).map((pair) => pair.id), ['m1', 'm2'],
  'an enriched models map keys the id');
assert.throws(() => parseListing({ nope: true }), /neither a "data" array nor a "models" map/u);

const cold = [{ id: 'a' }, { id: 'b', backends: [] }, { id: 'c', backends: ['workbuddy'] }];
fillMissingPlatforms(cold);
assert.deepEqual(cold.map((row2) => row2.backends), [['workbuddy'], ['workbuddy'], ['workbuddy']],
  'a single-platform listing fills the rows a cold gateway left blank');
const twoPlatforms = [{ id: 'a', backends: ['workbuddy'] }, { id: 'b', backends: ['oc-zen'] }, { id: 'c' }];
fillMissingPlatforms(twoPlatforms);
assert.equal(twoPlatforms[2].backends, undefined, 'two platforms: no guessing');

const fakeResponse = (body, init = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  headers: { get: (name) => (name === 'content-length' ? (init.length ?? null) : null) },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

{
  let seenUrl;
  let seenHeaders;
  const rows = await fetchModels({
    baseURL: 'https://gw.example',
    api: 'anthropic-messages',
    apiKey: 'sk-test',
    fetchImpl: async (url, init) => { seenUrl = url; seenHeaders = init.headers; return fakeResponse({ data: [{ id: 'a', name: 'A', backends: ['workbuddy'], billing: 'paid' }] }); },
  });
  assert.equal(seenUrl, 'https://gw.example/v1/models?limit=1000');
  assert.equal(seenHeaders['x-api-key'], 'sk-test');
  assert.equal(seenHeaders['anthropic-version'], ANTHROPIC_VERSION);
  assert.equal(rows[0].id, 'a');
}

{
  let seenUrl;
  await fetchModels({
    baseURL: 'https://gw.example/v1',
    api: 'openai-completions',
    apiKey: 'sk-test',
    fetchImpl: async (url) => { seenUrl = url; return fakeResponse({ data: [] }); },
  });
  assert.equal(seenUrl, 'https://gw.example/v1/models', 'OpenAI protocols keep the base path');
}

await assert.rejects(
  fetchModels({ baseURL: 'https://gw.example', api: 'openai-completions', fetchImpl: async () => fakeResponse({}, { ok: false, status: 401 }) }),
  (error) => error.message === 'http-401',
);
await assert.rejects(
  fetchModels({ baseURL: 'https://gw.example', api: 'openai-completions', fetchImpl: async () => fakeResponse('not json') }),
  (error) => error.message === 'shape',
);
await assert.rejects(
  fetchModels({ baseURL: 'https://gw.example', api: 'openai-completions', maxBytes: 8, fetchImpl: async () => fakeResponse('{"data":[{"id":"a"}]}') }),
  (error) => error.message === 'oversized',
);
await assert.rejects(
  fetchModels({ baseURL: 'https://gw.example', api: 'openai-completions', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }),
  (error) => error.message === 'network',
);

// ── sync cycle ──────────────────────────────────────────────────────────────
const target = { settingsNs: 'llm-pi-ai', route: 'ai-router', baseURL: 'https://gw.example', api: 'anthropic-messages', apiKey: 'sk-test' };
const listing = { data: [
  { id: 'kimi-k3', name: 'Kimi-K3', backends: ['workbuddy'], billing: 'paid', input: ['text', 'image'], context_window: 1_000_000, max_tokens: 32_000 },
] };
const makeSync = (overrides = {}) => {
  const writes = [];
  const warnings = [];
  const sync = createModelSync({
    readTarget: async () => target,
    readStored: () => [],
    writeModels: async (routeTarget, models) => { writes.push({ routeTarget, models }); },
    fetchImpl: async () => fakeResponse(listing),
    now: () => 1,
    logger: { warn: (message) => warnings.push(message), info: () => {} },
    ...overrides,
  });
  return { sync, writes, warnings };
};

{
  const { sync, writes } = makeSync();
  const outcome = await sync.run();
  assert.equal(outcome.reason, 'written');
  assert.equal(outcome.count, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].models[0].name, 'WorkBuddy · 付费 · Kimi-K3 · 1M');
  assert.deepEqual(writes[0].models[0].input, ['text', 'image']);
  assert.equal(sync.last.reason, 'written');
  assert.equal(sync.running, false);
}

{
  const stored = buildEntry('kimi-k3', listing.data[0]);
  const { sync, writes } = makeSync({ readStored: () => [stored] });
  const outcome = await sync.run();
  assert.equal(outcome.reason, 'unchanged', 'an identical catalog is not rewritten');
  assert.equal(writes.length, 0);
}

{
  const { sync, writes } = makeSync({ readTarget: async () => null });
  assert.equal((await sync.run()).reason, 'no-route');
  assert.equal(writes.length, 0);
}

{
  const { sync, writes } = makeSync({ fetchImpl: async () => fakeResponse({ data: [] }) });
  const outcome = await sync.run();
  assert.equal(outcome.reason, 'empty-listing');
  assert.equal(writes.length, 0, 'an empty listing never blanks the picker');
}

{
  const { sync, writes, warnings } = makeSync({ fetchImpl: async () => fakeResponse({}, { ok: false, status: 503 }) });
  const outcome = await sync.run();
  assert.equal(outcome.reason, 'fetch-failed');
  assert.equal(outcome.detail, 'http-503');
  assert.equal(writes.length, 0);
  assert.match(warnings.at(-1), /http-503/u);
}

{
  // A row whose generated name would leave the contract refuses the whole listing.
  const { sync, writes } = makeSync({
    fetchImpl: async () => fakeResponse({ data: [{ id: 'x', name: 'X · 付费源待命', backends: ['workbuddy'], billing: 'paid' }] }),
  });
  const outcome = await sync.run();
  assert.equal(outcome.reason, 'written', 'the marker is stripped before the gate, so the listing is writable');
  assert.equal(writes[0].models[0].name, 'WorkBuddy · 付费 · X');
}

{
  const { sync } = makeSync({ writeModels: async () => { throw new Error('Config field "providers" is not volatile'); } });
  const outcome = await sync.run();
  assert.equal(outcome.reason, 'write-failed');
  assert.match(outcome.detail, /not volatile/u);
}

{
  // single flight: two callers share one cycle
  let fetches = 0;
  const { sync } = makeSync({ fetchImpl: async () => { fetches += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return fakeResponse(listing); } });
  const [first, second] = await Promise.all([sync.run(), sync.run()]);
  assert.equal(fetches, 1);
  assert.deepEqual(first, second);
}

{
  // added/removed are reported for the log line
  const stored = buildEntry('old-model', { name: 'Old', backends: ['workbuddy'], billing: 'paid' });
  const { sync } = makeSync({ readStored: () => [stored] });
  const outcome = await sync.run();
  assert.equal(outcome.added, 1);
  assert.equal(outcome.removed, 1);
}

// ── environment options ─────────────────────────────────────────────────────
assert.deepEqual(resolveSyncOptions({}), {
  enabled: true, settingsNs: 'llm-pi-ai', routes: ['ai-router'], intervalMs: 600_000, bootMs: 20_000, staleMs: 300_000,
});
assert.equal(resolveSyncOptions({ DSH_TURN_COST_MODEL_STALE_MS: '1000' }).staleMs, 1_000);
assert.equal(resolveSyncOptions({ DSH_TURN_COST_MODEL_SYNC: '0' }).enabled, false);
assert.equal(resolveSyncOptions({ DSH_TURN_COST_MODEL_SYNC: 'off' }).enabled, false);
assert.deepEqual(resolveSyncOptions({ DSH_TURN_COST_MODEL_ROUTES: ' ai-router , other ' }).routes, ['ai-router', 'other']);
assert.equal(resolveSyncOptions({ DSH_TURN_COST_MODEL_SYNC_MS: '60000' }).intervalMs, 60_000);
assert.equal(resolveSyncOptions({ DSH_TURN_COST_MODEL_SYNC_MS: 'soon' }).intervalMs, 600_000);
assert.equal(resolveSyncOptions({ DSH_TURN_COST_SETTINGS_NS: 'llm-pi-ai-2' }).settingsNs, 'llm-pi-ai-2');

// ── framework glue: cache-first read, background revalidation ──────────────
{
  // A fake Host: settings document (whose stored list the update mutates, like
  // DSH does), credential store, web server, and the route it registers.
  const routeProfile = {
    displayName: 'AI Router', api: 'anthropic-messages', baseURL: 'https://gw.example', apiKeyEnv: 'AI_ROUTER_API_KEY',
    models: [{ id: 'kimi-k3', name: 'Kimi-K3' }],
  };
  const descriptor = {
    ns: 'llm-pi-ai',
    user: { providers: { 'ai-router': routeProfile } },
    value: { providers: { 'ai-router': routeProfile } },
  };
  const updates = [];
  const creds = [];
  let registered;
  const disposers = [];
  const scoped = {
    get: (name) => ({
      settings: {
        describe: () => [descriptor],
        update: async (ns, patch) => {
          updates.push({ ns, patch });
          routeProfile.models = patch.providers['ai-router'].models;
        },
      },
      credentials: { resolve: async (ref) => { creds.push(ref); return { value: 'sk-live' }; } },
      webServer: { register: (definition) => { registered = definition; return () => {}; } },
    })[name],
    effect: (callback, name) => { disposers.push({ name, dispose: callback() }); },
    logger: { info: () => {}, warn: () => {} },
  };

  const originalFetch = globalThis.fetch;
  const calls = [];
  const listing = { data: [
    { id: 'kimi-k3', name: 'Kimi-K3', backends: ['workbuddy'], billing: 'paid', input: ['text', 'image'], context_window: 1_000_000, max_tokens: 32_000, quota: { source: 'workbuddy', basis: 'single', backends: { workbuddy: 'workbuddy' } } },
    { id: 'glm-5.3', name: 'GLM-5.3', backends: ['workbuddy'], billing: 'paid', input: ['text', 'image'], context_window: 1_000_000, max_tokens: 64_000, quota: { source: 'workbuddy', basis: 'single', backends: { workbuddy: 'workbuddy' } } },
  ] };
  let release = () => {};
  let gate = null;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (gate !== null) await gate;
    return fakeResponse(listing);
  };

  const read = () => registered.resource(new Request('http://127.0.0.1:3080/dsh-turn-cost/models'));
  const timeout = (ms, label) => new Promise((_, reject) => { setTimeout(() => { reject(new Error(label)); }, ms); });

  try {
    const mounted = mountModelSync(scoped, {
      enabled: true, settingsNs: 'llm-pi-ai', routes: ['ai-router'], intervalMs: 0, bootMs: 0, staleMs: 300_000,
    });

    // 1. The first look paints the stored list and answers before the gateway does.
    gate = new Promise((resolve) => { release = resolve; });
    const first = await Promise.race([read(), timeout(1_000, 'a plain read blocked on the gateway')]);
    const painted = await first.json();
    assert.deepEqual(painted.models.map((model) => model.id), ['kimi-k3'], 'the stored catalog is the cache');
    assert.equal(painted.stale, true, 'never synced yet');
    assert.equal(painted.refreshing, true, 'the background revalidation is already running');
    assert.equal(painted.route, 'ai-router');
    assert.equal(painted.baseURL, 'https://gw.example');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://gw.example/v1/models?limit=1000');
    assert.equal(calls[0].headers['x-api-key'], 'sk-live', 'the route key is resolved through the credential store');
    assert.deepEqual(new Set(creds), new Set(['AI_ROUTER_API_KEY']), 'the route key comes from the credential store');

    // 2. The revalidation lands: it writes the drift through settings, and the next
    //    read shows the refreshed catalog as a cache, not as a wait.
    release();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].ns, 'llm-pi-ai');
    assert.deepEqual(Object.keys(updates[0].patch), ['providers']);
    assert.deepEqual(updates[0].patch.providers['ai-router'].models.map((entry) => entry.id), ['kimi-k3', 'glm-5.3']);
    assert.deepEqual(updates[0].patch.providers['ai-router'].models[0].input, ['text', 'image']);
    gate = null;

    const before = calls.length;
    const second = await (await read()).json();
    assert.deepEqual(second.models.map((model) => model.id), ['kimi-k3', 'glm-5.3']);
    assert.equal(second.stale, false, 'the successful cycle marks the catalog fresh');
    assert.equal(second.refreshing, false);
    assert.equal(second.last.reason, 'written');
    assert.equal(calls.length, before, 'a fresh read does not hit the gateway again');
    // The route also carries the gateway's own「哪个模型在哪份订阅上」map: model
    // entries cannot hold it, and the Client needs it before it can decide what
    // the sidebar foot should display.
    assert.deepEqual(second.quotaSources, { 'kimi-k3': 'workbuddy', 'glm-5.3': 'workbuddy' });
    assert.equal(typeof second.quotaSourcesAt, 'number');

    // 3. `force=1` is the explicit path and does wait for the gateway.
    const forced = await (await registered.resource(new Request('http://127.0.0.1:3080/dsh-turn-cost/models?force=1'))).json();
    assert.equal(calls.length, before + 1);
    assert.equal(forced.last.reason, 'unchanged', 'no drift now, so nothing is rewritten');
    assert.equal(updates.length, 1);

    // 4. A POST is refused; the route is read-only.
    const rejected = await registered.resource(new Request('http://127.0.0.1:3080/dsh-turn-cost/models', { method: 'POST' }));
    assert.equal(rejected.status, 405);

    mounted.stop();
    assert.deepEqual(disposers.map((row) => row.name), [
      'dsh-turn-cost: model sync loop',
      'dsh-turn-cost: model sync route',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  // No settings entry, no route, or a disabled loop: mounting is still harmless.
  const empty = { get: () => undefined, effect: () => {}, logger: { info: () => {}, warn: () => {} } };
  const mounted = mountModelSync(empty, { enabled: true, settingsNs: 'llm-pi-ai', routes: ['ai-router'], intervalMs: 0, bootMs: 0, staleMs: 300_000 });
  assert.equal((await mounted.sync.run()).reason, 'no-route');
  mounted.stop();
}

test('the models route is claimed before settings exists', async () => {
  // Regression: the route used to be registered only from inside
  // `inject(['settings'])`. When that pass never runs the path 404s forever while
  // every other route of the same plugin works, and the client can only report an
  // error. It is now claimed as soon as `webServer` exists, answers
  // `syncUnavailable` with a reason until the loop attaches, and serves the live
  // catalog afterwards.
  let registered = null;
  const web = {
    get: (name) => ({ webServer: { register: (definition) => { registered = definition; return () => { registered = null; }; } } })[name],
    logger: { info: () => {}, warn: () => {} },
  };
  const options = { enabled: true, settingsNs: 'llm-pi-ai', routes: ['ai-router'], intervalMs: 0, bootMs: 0, staleMs: 300_000 };
  const surface = createModelsSurface(web, options);
  assert.equal(registered?.path, MODELS_PATH, 'the path is claimed immediately');
  assert.equal(surface.mounted, false);

  const read = async (method = 'GET') => {
    const response = await registered.resource(new Request('http://127.0.0.1:3080' + MODELS_PATH, { method }));
    const text = await response.text();
    // A 405 answers plain text (`method not allowed`); only the JSON bodies parse.
    return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text };
  };
  const empty = await read();
  assert.equal(empty.status, 200, 'no 404: the route exists before the loop does');
  assert.equal(empty.body.syncUnavailable, true);
  assert.equal(empty.body.reason, 'settings-unavailable', 'the reason is actionable, not a silent gap');
  assert.deepEqual(empty.body.models, []);
  assert.equal((await read('POST')).status, 405, 'still read-only');

  surface.attach({
    catalog: async () => ({ ...empty.body, syncUnavailable: undefined, route: 'ai-router', models: [{ id: 'kimi-k3' }], count: 1, quotaSources: { 'kimi-k3': 'workbuddy' } }),
    sync: { last: { reason: 'written' } },
    status: () => ({}),
  });
  assert.equal(surface.mounted, true);
  const live = await read();
  assert.equal(live.body.route, 'ai-router');
  assert.deepEqual(live.body.quotaSources, { 'kimi-k3': 'workbuddy' });
  assert.equal(live.body.last.reason, 'written');
  surface.dispose();
  assert.equal(registered, null, 'disposal releases the path');
});

test('model sync test suite completed', () => {});
