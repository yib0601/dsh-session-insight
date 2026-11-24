/**
 * Behavioral test for the client-side model-catalog lane (the chunk's `models`
 * export): cache-first paint, background revalidation follow-ups, silent
 * replacement of the list, and the failure path that keeps the painted list.
 *
 * The chunk is a browser module, so the test installs the two globals it touches
 * (`window.__ModuleLoader__`, `window.localStorage`) plus a stub `react` module,
 * evaluates the factory, and then drives the store with a fake fetch. Run:
 * node --test test/
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../client.context.js', import.meta.url), 'utf8');

/** Minimal in-memory localStorage with the two methods the store uses. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    get size() { return map.size; },
  };
}

/** Load the chunk against stubbed browser globals and return its exports. */
function loadChunk(storage) {
  let definition;
  const window = { __ModuleLoader__: { load: (value) => { definition = value; } }, localStorage: storage };
  const document = { createElement: () => ({}), head: { appendChild: () => {} }, body: { appendChild: () => {} } };
  globalThis.window = window;
  globalThis.document = document;
  const navigator = { clipboard: { writeText: async () => true } };
  // The chunk only touches these three, passed explicitly so Node's own
  // read-only `navigator` global is left alone.
  new Function('window', 'document', 'navigator', source)(window, document, navigator);
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: (initial) => ({ current: initial }),
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  };
  const require = (id) => (id === 'react' ? react : id === 'react-dom' ? {} : {});
  return definition.factory(require);
}

/** The Host reply body: what `readModelsRoute` resolves to. */
const reply = (models, extra = {}) => ({
  route: 'ai-router', settingsNs: 'llm-pi-ai', baseURL: 'https://gw.example',
  models, count: models.length, syncedAt: null, stale: true, refreshing: false, last: null, ...extra,
});

const KIMI = { id: 'kimi-k3', name: 'WorkBuddy · 付费 · Kimi-K3 · 1M', input: ['text', 'image'], contextWindow: 1_000_000, maxTokens: 32_000 };
const GLM = { id: 'glm-5.3', name: 'WorkBuddy · 付费 · GLM-5.3 · 1M', input: ['text', 'image'], contextWindow: 1_000_000, maxTokens: 64_000 };

test('catalog store paints the cache, follows the background refresh, keeps a failed read', async () => {
  const storage = fakeStorage();
  const chunk = loadChunk(storage);
  const models = chunk.models;
  assert.equal(typeof chunk.apply, 'function');
  assert.equal(typeof models.createModelsStore, 'function');

  // ── helpers ───────────────────────────────────────────────────────────────
  assert.deepEqual(models.catalogCaps(KIMI), { image: true, text: true, levels: [] });
  assert.deepEqual(models.catalogCaps({ id: 'x', input: ['text'] }), { image: false, text: true, levels: [] });
  assert.deepEqual(models.catalogCaps({ id: 'y', reasoningEfforts: { off: null, low: 'low', high: 'high' } }).levels, ['low', 'high'],
    'off is not a thinking level');
  assert.equal(models.compactCapacity(1_000_000), '1M');
  assert.equal(models.compactCapacity(960_000), '960K');
  assert.equal(models.compactCapacity(undefined), '—');
  const t = (key) => ({
    modelsNeverSynced: 'never', modelsSyncedJustNow: 'just now', modelsSyncedAgo: '{age} ago',
    modelsAgeMinutes: '{n} min', modelsAgeHours: '{n} h', modelsAgeDays: '{n} d',
  })[key] ?? key;
  assert.equal(models.syncAgeLabel(t, null, 0), 'never');
  assert.equal(models.syncAgeLabel(t, 1_000, 1_500), 'just now');
  const base = 1_700_000_000_000;
  assert.equal(models.syncAgeLabel(t, base, base + 3 * 60_000), '3 min ago');
  assert.equal(models.syncAgeLabel(t, base, base + 5 * 3_600_000), '5 h ago');
  assert.equal(models.syncAgeLabel(t, base, base + 2 * 86_400_000), '2 d ago');

  // ── the two surfaces render without a browser ────────────────────────────
  // Calling a component function with stubbed hooks executes its render body:
  // enough to catch a missing helper, a bad class name or a wrong prop path.
  const texts = (node, out = []) => {
    if (node === null || node === undefined || node === false) return out;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
    if (typeof node === 'object' && Array.isArray(node.children)) for (const child of node.children) texts(child, out);
    return out;
  };
  const classes = (node, out = []) => {
    if (node === null || typeof node !== 'object') return out;
    if (Array.isArray(node)) { for (const child of node) classes(child, out); return out; }
    if (typeof node.props?.className === 'string') out.push(node.props.className);
    if (Array.isArray(node.children)) for (const child of node.children) classes(child, out);
    return out;
  };
  const surfaceStore = models.createModelsStore();
  assert.equal(models.ModelsChip({ t, catalog: surfaceStore }), null, 'a chip with nothing to say stays out of the header');
  surfaceStore.attach(async () => reply([KIMI], { refreshing: false, stale: false, syncedAt: 42 }));
  await surfaceStore.read(false);
  const chip = models.ModelsChip({ t, catalog: surfaceStore });
  assert.equal(chip.type, 'button');
  assert.equal(chip.props.className, 'tc-chip');
  assert.equal(chip.props['data-busy'], 'false');
  assert.ok(texts(chip).join(' ').includes('modelsChip'), 'the chip names the catalog');
  const section = models.ModelsSection({ t, catalog: surfaceStore });
  const sectionText = texts(section).join(' ');
  assert.ok(classes(section).some((value) => value.includes('tc-settings')), 'the page uses the settings layout');
  assert.ok(classes(section).includes('tc-model-list'), 'the page lists models');
  assert.ok(sectionText.includes('modelsTitle') && sectionText.includes('modelsSyncNow'));
  assert.ok(sectionText.includes('WorkBuddy · 付费 · Kimi-K3 · 1M'), 'the row shows the generated display name');
  assert.ok(sectionText.includes('kimi-k3'), 'the row shows the id');
  assert.ok(sectionText.includes('modelsCapImage'), 'the row shows the declared image modality');
  assert.ok(sectionText.includes('1M'), 'the row shows the context window');
  const cached = models.createModelsStore();
  assert.equal(cached.getSnapshot().phase, 'cache', 'a second store starts from the persisted paint');
  assert.equal(models.ModelsChip({ t, catalog: cached }).type, 'button', 'a cached catalog renders the chip before any read');
  storage.removeItem('dsh-session-insight:model-catalog');
  assert.equal(models.ModelsChip({ t, catalog: models.createModelsStore() }), null,
    'a browser with no cache and no route yet renders nothing');
  const unsupported = models.createModelsStore();
  unsupported.attach(async () => { throw new Error('http-404'); });
  await unsupported.read(false);
  assert.equal(models.ModelsChip({ t, catalog: unsupported }), null, 'a Host without the route keeps the header clean');

  // ── the route reader ─────────────────────────────────────────────────────
  const urls = [];
  const fetched = await models.readModelsRoute(false, (url) => {
    urls.push(url);
    return Promise.resolve({ ok: true, status: 200, json: async () => reply([KIMI]) });
  });
  assert.equal(urls[0], '/dsh-session-insight/models');
  assert.equal(fetched.models.length, 1);
  await models.readModelsRoute(true, (url) => { urls.push(url); return Promise.resolve({ ok: true, status: 200, json: async () => reply([]) }); });
  assert.equal(urls[1], '/dsh-session-insight/models?force=1', 'a forced check names itself');
  await assert.rejects(
    models.readModelsRoute(false, () => Promise.resolve({ ok: false, status: 503, json: async () => ({}) })),
    /http-503/u,
  );

  // ── one store: cache paint → read → follow-up → silent replacement ────────
  models.writeCachedCatalog({ ...models.emptyCatalog(), route: 'ai-router', models: [KIMI], count: 1, syncedAt: 7, at: Date.now() });
  const restored = models.readCachedCatalog(Date.now());
  assert.equal(restored.phase, 'cache');
  assert.deepEqual(restored.models.map((model) => model.id), ['kimi-k3'], 'a reload paints the last snapshot');

  const store = models.createModelsStore();
  assert.equal(store.getSnapshot().phase, 'cache', 'the store starts from the persisted paint');
  const seen = [];
  const unsubscribe = store.subscribe(() => { seen.push(store.getSnapshot().phase); });

  // 1. first read: the Host answers from its stored list and says a refresh runs
  let call = 0;
  store.attach(async (force) => {
    call += 1;
    if (call === 1) {
      assert.equal(force, false, 'opening a surface is not a forced check');
      return reply([KIMI], { refreshing: true, stale: true });
    }
    return reply([KIMI, GLM], { refreshing: false, stale: false, syncedAt: 42 });
  });
  const first = await store.read(false);
  assert.deepEqual(first.models.map((model) => model.id), ['kimi-k3']);
  assert.equal(first.refreshing, true);
  assert.deepEqual(first.addedIds, [], 'nothing is new on the first paint');
  assert.ok(seen.includes('loading'), 'the cached paint reports that a read is running');

  // 2. the follow-up (scheduled by the store, 1.5s later) brings the new model in
  await new Promise((resolve) => { setTimeout(resolve, 1_700); });
  const after = store.getSnapshot();
  assert.deepEqual(after.models.map((model) => model.id), ['kimi-k3', 'glm-5.3'], 'the refreshed list replaces the paint');
  assert.deepEqual(after.addedIds, ['glm-5.3'], 'the model the refresh brought in is marked new');
  assert.equal(after.syncedAt, 42);
  assert.equal(after.refreshing, false);
  assert.equal(call, 2, 'exactly one follow-up');
  assert.equal(JSON.parse(storage.getItem('dsh-session-insight:model-catalog')).models.length, 2,
    'the refreshed list becomes the next paint');

  // 3. a forced check goes straight out
  await store.force();
  assert.equal(call, 3);

  // 4. a failed read keeps the painted list and reports the reason
  store.attach(async () => { throw new Error('http-503'); });
  const failed = await store.read(true);
  assert.equal(failed.phase, 'stale');
  assert.deepEqual(failed.models.map((model) => model.id), ['kimi-k3', 'glm-5.3'], 'an unreachable Host does not empty the list');
  assert.match(failed.error, /http-503/u);
  unsubscribe();
  store.dispose();

  // ── cache expiry ─────────────────────────────────────────────────────────
  models.writeCachedCatalog({ ...models.emptyCatalog(), models: [KIMI], count: 1, at: Date.now() - 2 * 86_400_000 });
  assert.equal(models.readCachedCatalog(Date.now()), null, 'a two-day-old paint is not shown');
});

test('the gateway billing-source map decides the foot, not the rendered name', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000 });
  const storage = fakeStorage();
  const { models } = loadChunk(storage);

  // The Host states which plan pays per model, and the browser keeps that answer
  // so the first frame after a reload does not have to guess from a display name.
  const HOST_REPLY = {
    route: 'ai-router',
    quotaSources: { 'kimi-k3': 'workbuddy', 'glm-5.3': null, 'plain-id': 'opencode-go' },
    quotaSourcesAt: 1_000,
    models: [KIMI],
  };
  const read = await models.loadQuotaSources(async () => ({ ok: true, status: 200, json: async () => HOST_REPLY }), () => 1_000);
  assert.deepEqual(read, {
    route: 'ai-router',
    sources: { 'kimi-k3': 'workbuddy', 'glm-5.3': null, 'plain-id': 'opencode-go' },
    at: 1_000,
  });
  assert.equal(JSON.parse(storage.getItem(models.QUOTA_SOURCE_CACHE_KEY)).route, 'ai-router',
    'the map is persisted for the next page load');

  // A stored map is served without asking the Host again...
  const cached = models.readCachedQuotaSources(1_000);
  assert.deepEqual(cached.sources, read.sources);
  // ...but it does expire, and an expired map must not outlive its truth.
  assert.equal(models.readCachedQuotaSources(1_000 + models.QUOTA_SOURCE_TTL_MS + 1), null);

  // Per-route lookup: the same model id on another route is a different plan.
  assert.equal(models.quotaSourceIn(cached, 'ai-router', 'kimi-k3'), 'workbuddy');
  assert.equal(models.quotaSourceIn(cached, 'ai-router', 'glm-5.3'), null,
    'a null entry is the gateway saying nothing is readable');
  assert.equal(models.quotaSourceIn(cached, 'opencode-go', 'kimi-k3'), undefined,
    'another route is not this route: the caller keeps its own fallback');
  assert.equal(models.quotaSourceIn(cached, 'ai-router', 'unknown-model'), undefined,
    'a model the gateway did not classify has no opinion');
  assert.equal(models.quotaSourceIn(null, 'ai-router', 'kimi-k3'), undefined);
  assert.equal(models.quotaSourceIn({ route: 'ai-router', sources: null }, 'ai-router', 'kimi-k3'), undefined);

  // A Host that has no map yet (older build) yields no opinion rather than null:
  // "nobody said" must not be rendered as「无额度可查」.
  const empty = await models.loadQuotaSources(async () => ({ ok: true, status: 200, json: async () => ({ route: 'ai-router' }) }), () => 1_000);
  assert.equal(empty, null);
  // A failed read rejects (the hook swallows it and keeps the stored map): an
  // unreachable Host is not evidence that any plan changed.
  await assert.rejects(
    () => models.loadQuotaSources(async () => ({ ok: false, status: 503, json: async () => ({}) }), () => 1_000),
    /http-503/u,
  );
});
