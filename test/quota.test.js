/**
 * Independent test for the §2.5 subscription-quota module.
 *
 * `client.context.js` is a browser chunk (its factory needs React, react-dom and
 * DSH's window module loader), so this test extracts only the pure quota block
 * plus the one numeric helper it borrows from §2 (`safeCount`), then runs it in
 * a plain Node VM with no DOM and no network. Run: node test/quota.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.context.js'), 'utf8');

const quotaStart = source.indexOf('// ── §2.5 subscription quota');
const quotaEnd = source.indexOf('    function pct(part, whole) {');
assert.ok(quotaStart !== -1 && quotaEnd > quotaStart, '§2.5 section markers must exist');

const safeStart = source.indexOf('function safeCount(');
const safeEnd = source.indexOf('\n', source.indexOf('}', safeStart));
assert.ok(safeStart !== -1 && safeEnd > safeStart, 'safeCount must exist');

const block = source.slice(safeStart - 4, safeEnd + 1) + '\n' + source.slice(quotaStart, quotaEnd);
/** The chunk polls with `setInterval`; the VM gets counted timers instead of real ones. */
const timers = new Map();
let nextTimerId = 1;
/** In-memory stand-in for the browser's localStorage the source memory uses. */
const storage = new Map();
const sandbox = {
  setInterval: (fn, ms) => { const id = nextTimerId++; timers.set(id, { fn, ms }); return id; },
  clearInterval: (id) => { timers.delete(id); },
  URLSearchParams,
  window: {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)); },
      removeItem: (key) => { storage.delete(key); },
    },
  },
};
const ctx = runInNewContext(
  `${block}
   ({ money2, moneyList, clock, stampOf, windowShort, windowLong, sourceName,
      msUntil, remainText, remainTone, quotaCycleOf, windowLineOf, resetClauseOf,
      quotaSnapshotOf, quotaFigure, quotaDetail, quotaSubOf, quotaTileValue, sourceOfSessions,
      sourceOfRoute, routeOfSession, readStoredSource, storeSource, NO_SOURCE,
      createQuotaStore, readQuotaRoute, QUOTA_URL, QUOTA_POLL_MS, QUOTA_DEFAULT_SOURCE,
      QUOTA_SOURCE_KEY })`,
  sandbox,
);

const {
  money2, moneyList, clock, stampOf, windowShort, windowLong, sourceName,
  msUntil, remainText, remainTone, quotaCycleOf, windowLineOf, resetClauseOf,
  quotaSnapshotOf, quotaFigure, quotaDetail, quotaSubOf, quotaTileValue, sourceOfSessions,
  sourceOfRoute, routeOfSession, readStoredSource, storeSource, NO_SOURCE,
  createQuotaStore, readQuotaRoute, QUOTA_URL, QUOTA_POLL_MS, QUOTA_DEFAULT_SOURCE, QUOTA_SOURCE_KEY,
} = ctx;

/** Minimal dictionary so the formatters can be asserted without the locale service. */
const t = (key, params = {}) => {
  const table = {
    quotaTitle: '订阅额度', quotaTileOf: '{source} 额度',
    quotaSourceDeepseek: 'DeepSeek', quotaSourceOpencode: 'OpenCode Go',
    quotaWinRolling: '5h', quotaWinWeekly: '周', quotaWinMonthly: '月',
    quotaWinRollingLong: '5 小时', quotaWinWeeklyLong: '本周', quotaWinMonthlyLong: '本月',
    quotaWindowLine: '{label}：已用 {percent}%，{reset}',
    quotaLeftSuffix: '（{left}）',
    quotaWindowResets: '{time} 重置', quotaWindowResetUnknown: '重置时间未知',
    quotaCycleLine: '订阅周期 {time} 结束（{left}）',
    quotaCycleHint: '天数取最长额度窗口的重置时间',
    quotaRemainDays: '剩 {n} 天', quotaRemainHours: '剩 {n} 小时', quotaRemainMinutes: '剩 {n} 分',
    quotaExpired: '已到期',
    quotaTotal: '当前余额 {amount}', quotaSplit: '充值 {toppedUp} · 赠送 {granted}',
    quotaUnavailable: '余额不足，无法发起新任务',
    quotaUpdated: '{time} 更新', quotaLoading: '读取中…', quotaFailed: '额度不可用',
    quotaUnconfigured: '未配置密钥', quotaEmpty: '零余额', quotaRefresh: '点按刷新额度',
    quotaNoSource: '此供应商无额度可查',
    quotaNoSourceHint: '当前路由是自建网关：它按上游密钥分别计费，网关本身不设配额，所以没有可显示的额度或到期时间',
  };
  return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
};

// ── money2 / moneyList ──────────────────────────────────────────────────────
assert.equal(money2(12.3, 'CNY'), '¥12.30');
assert.equal(money2('19.92', 'CNY'), '¥19.92', 'server decimal strings format like numbers');
assert.equal(money2(0, 'USD'), '$0.00');
assert.equal(money2(12.345, 'CNY'), '¥12.35', 'two decimals, rounded');
assert.equal(money2('abc', 'CNY'), '', 'an unusable amount formats to nothing');
assert.equal(moneyList([{ currency: 'CNY', total: '3' }, { currency: 'USD', total: 1 }]), '¥3.00 · $1.00');
assert.equal(moneyList([{ currency: 'CNY', total: 'x' }]), '', 'a bad wallet is skipped, not zeroed');

// ── clock / stampOf ─────────────────────────────────────────────────────────
assert.equal(clock(Date.UTC(2026, 10, 19, 4, 44)), '12:44');
assert.equal(clock(Date.UTC(2026, 10, 19, 0, 5)), '08:05', 'zero-padded hour');
assert.equal(clock(undefined), '08:00', 'a missing timestamp still formats');
assert.equal(stampOf('2026-11-19T07:07:04.000Z'), '11-19 15:07', 'ISO reset times render in Beijing time');
assert.equal(stampOf('2026-11-23T00:00:00.000Z'), '11-23 08:00');
assert.equal(stampOf('nope'), '', 'an unusable reset time renders nothing');
assert.equal(stampOf(null), '');

// ── labels ──────────────────────────────────────────────────────────────────
assert.equal(windowShort('rolling', t), '5h');
assert.equal(windowShort('weekly', t), '周');
assert.equal(windowShort('monthly', t), '月');
assert.equal(windowShort('weird', t), 'weird', 'an unknown window keeps its key');
assert.equal(windowLong('weekly', t), '本周');
assert.equal(sourceName('opencode-go', t), 'OpenCode Go');
assert.equal(sourceName('deepseek', t), 'DeepSeek');

// ── countdown helpers ───────────────────────────────────────────────────────
const clockNow = Date.UTC(2026, 10, 19, 4, 44);
assert.equal(msUntil('2026-11-23T00:00:00.000Z', clockNow), 3 * 86400000 + 19 * 3600000 + 16 * 60000);
assert.equal(msUntil('2026-11-19T07:07:04.000Z', clockNow), 2 * 3600000 + 23 * 60000 + 4000);
assert.equal(msUntil('nope', clockNow), null, 'an unusable stamp has no span');
assert.equal(msUntil(null, clockNow), null);
assert.equal(remainText(13 * 86400000 + 5 * 3600000, t), '剩 13 天', 'days floor instead of rounding up');
assert.equal(remainText(2 * 3600000 + 1800000, t), '剩 2 小时', 'under a day counts hours');
assert.equal(remainText(39 * 60000, t), '剩 39 分', 'under an hour counts minutes');
assert.equal(remainText(30000, t), '剩 1 分', 'the last minute still reads as one');
assert.equal(remainText(-1000, t), '已到期', 'a passed instant reads as expired');
assert.equal(remainText(Number.NaN, t), '', 'an unknown span renders nothing');
assert.equal(remainText(null, t), '', 'a missing span renders nothing');
assert.equal(remainTone(2 * 86400000), 'crit', 'three days out is critical');
assert.equal(remainTone(5 * 86400000), 'warn', 'a week out warns');
assert.equal(remainTone(20 * 86400000), 'calm');
assert.equal(remainTone(-1), 'crit', 'expired is critical');
assert.equal(remainTone(null), 'calm', 'an unknown span stays neutral');

// ── quotaSnapshotOf: windows ────────────────────────────────────────────────
const windowsBody = {
  status: 'ready', source: 'opencode-go', kind: 'windows', at: 1_700_000_000_000,
  windows: [
    { key: 'rolling', percent: 16, status: 'ok', resetsAt: '2026-11-19T07:07:04.000Z' },
    { key: 'weekly', percent: 24.6, status: 'ok', resetsAt: '2026-11-23T00:00:00.000Z' },
    { key: 'monthly', percent: 47, status: 'ok', resetsAt: '2026-12-02T15:30:38.000Z' },
  ],
};
const windows = quotaSnapshotOf(windowsBody);
assert.equal(windows.status, 'ready');
assert.equal(windows.source, 'opencode-go');
assert.equal(windows.kind, 'windows');
assert.equal(windows.windows.length, 3);
assert.equal(windows.windows[0].percent, 16);
assert.equal(windows.windows[1].percent, 24.6);
assert.equal(quotaFigure(windows, t), '5h 16% · 周 25% · 月 47%', 'the foot figure names every window');
assert.equal(quotaTileValue(windows, t), '月 47%', 'the KPI tile leads with the tightest window');
/** Fixed clock so the countdown is asserted, not whatever today happens to be. */
const now = Date.UTC(2026, 10, 19, 4, 44);
assert.equal(quotaSubOf(windows, t, now), '剩 13 天 · 06:13 更新',
  'the KPI sub-line carries the countdown the tile value cannot show');
assert.equal(quotaSubOf(windows, t, Date.UTC(2026, 11, 3)), '已到期 · 06:13 更新',
  'a passed cycle reads as expired instead of a negative countdown');
const lines = quotaDetail(windows, t, now).split('\n');
assert.equal(lines[0], '订阅额度（OpenCode Go）');
assert.equal(lines[1], '订阅周期 12-02 23:30 结束（剩 13 天）', 'the cycle countdown answers when the paid time ends');
assert.equal(lines[2], '天数取最长额度窗口的重置时间');
assert.equal(lines[3], '5 小时：已用 16%，11-19 15:07 重置（剩 2 小时）', 'each window carries its own countdown');
assert.equal(lines[4], '本周：已用 25%，11-23 08:00 重置（剩 3 天）');
assert.equal(lines[5], '本月：已用 47%，12-02 23:30 重置（剩 13 天）');
assert.match(lines[6], /更新$/);
assert.equal(lines[7], '点按刷新额度');
// ── quotaCycleOf / window lines ─────────────────────────────────────────────
const cycle = quotaCycleOf(windows, clockNow);
assert.equal(cycle.window.key, 'monthly', 'the longest window anchors the billing period');
assert.equal(cycle.at, Date.parse('2026-12-02T15:30:38.000Z'));
assert.equal(cycle.ms, Date.parse('2026-12-02T15:30:38.000Z') - clockNow);
assert.equal(quotaCycleOf({ status: 'ready', source: 'deepseek', kind: 'balance', wallets: [] }), null,
  'a wallet source has no cycle');
assert.equal(quotaCycleOf({ status: 'failed' }), null);
assert.equal(quotaCycleOf(null), null);
assert.equal(quotaCycleOf({ status: 'ready', kind: 'windows', windows: [{ key: 'weekly', percent: 5 }] }), null,
  'a window without a reset stamp cannot anchor a cycle');
assert.equal(quotaCycleOf({ status: 'ready', kind: 'windows', windows: [{ key: 'monthly', percent: 5, resetsAt: 'nope' }] }), null);
assert.equal(resetClauseOf({ key: 'weekly', percent: 5 }, t, clockNow), '重置时间未知');
assert.equal(windowLineOf({ key: 'weekly', percent: 24.6, resetsAt: '2026-11-23T00:00:00.000Z' }, t, clockNow),
  '本周：已用 25%，11-23 08:00 重置（剩 3 天）');
assert.equal(windowLineOf({ key: 'rolling', percent: 16, resetsAt: '2026-11-19T07:07:04.000Z' }, t, clockNow),
  '5 小时：已用 16%，11-19 15:07 重置（剩 2 小时）');

assert.equal(
  quotaSnapshotOf({ status: 'ready', source: 'opencode-go', kind: 'windows', windows: [{ key: 'rolling', percent: 'x' }, null] }).windows.length,
  0,
  'unusable windows are dropped',
);
assert.equal(
  quotaFigure(quotaSnapshotOf({ status: 'ready', source: 'opencode-go', kind: 'windows', windows: [] }), t),
  '零余额',
  'an empty window list reads as no quota, not as a crash',
);
assert.equal(
  quotaDetail(quotaSnapshotOf({ status: 'ready', source: 'opencode-go', kind: 'windows', windows: [{ key: 'weekly', percent: 5 }] }), t).split('\n')[1],
  '本周：已用 5%，重置时间未知',
  'a window without a reset time says so',
);

// ── quotaSnapshotOf: balance ────────────────────────────────────────────────
const balance = quotaSnapshotOf({
  status: 'ready', source: 'deepseek', kind: 'balance', available: true, at: 1_700_000_000_000,
  wallets: [{ currency: 'CNY', total: '19.88', toppedUp: '19.88', granted: '0.00' }],
});
assert.equal(balance.kind, 'balance');
assert.equal(balance.wallets[0].total, 19.88);
assert.equal(quotaFigure(balance, t), '¥19.88');
assert.equal(quotaTileValue(balance, t), '¥19.88', 'a wallet source keeps its amount in the tile');
assert.equal(quotaDetail(balance, t).split('\n')[0], '订阅额度（DeepSeek）');
assert.equal(quotaDetail({ ...balance, available: false }, t).split('\n').includes('余额不足，无法发起新任务'), true);
assert.equal(quotaFigure(quotaSnapshotOf({ status: 'ready', source: 'deepseek', wallets: [] }), t), '零余额');

// ── status branches ─────────────────────────────────────────────────────────
assert.equal(quotaFigure({ status: 'idle' }, t), '', 'idle renders nothing at all');
assert.equal(quotaFigure({ status: 'loading' }, t), '读取中…');
assert.equal(quotaFigure({ status: 'failed' }, t), '额度不可用');
assert.equal(quotaFigure({ status: 'unconfigured' }, t), '未配置密钥');
assert.equal(quotaSnapshotOf({ status: 'failed', source: 'opencode-go' }).status, 'failed');
assert.equal(quotaSnapshotOf({ status: 'failed', source: 'opencode-go' }).source, 'opencode-go');
assert.equal(quotaSnapshotOf({ status: 'unconfigured' }).status, 'unconfigured');
assert.equal(quotaSnapshotOf(null).status, 'failed');
assert.equal(quotaSnapshotOf('nope').status, 'failed');
assert.deepEqual(quotaDetail({ status: 'failed' }, t).split('\n'), ['订阅额度', '额度不可用']);
assert.deepEqual(quotaDetail({ status: 'unconfigured' }, t).split('\n'), ['订阅额度', '未配置密钥']);

// ── sourceOfRoute: the provider decides, never the model id ────────────────
assert.equal(sourceOfRoute('opencode-go', 'deepseek-v4.1-flash'), 'opencode-go',
  'the OpenCode gateway serving a DeepSeek model draws on the OpenCode quota');
assert.equal(sourceOfRoute('ai-router', 'deepseek-v4.1-flash'), 'none',
  'a self-hosted gateway bills per upstream key and sets no allowance, so it has no quota to read');
assert.equal(sourceOfRoute('ai-router', 'OpenCode Go · 付费 · Qwen3.8-Max'), 'none',
  'the gateway keeps no quota even when it fronts an OpenCode account');
assert.equal(sourceOfRoute('some-other-gateway', 'deepseek-v4.1-flash'), 'none',
  'any unrecognised provider is treated as quota-less rather than guessed at');
assert.equal(sourceOfRoute('opencode', 'big-pickle'), 'opencode-go');
assert.equal(sourceOfRoute('deepseek', 'deepseek-v4.1-flash'), 'deepseek');
assert.equal(sourceOfRoute('deepseek-account', 'deepseek-v4.1-flash'), 'deepseek');
assert.equal(sourceOfRoute('', 'OpenCode Go · 付费 · Qwen3.8-Max · 1M'), 'opencode-go',
  'without a provider the OpenCode product name still classifies the model');
assert.equal(sourceOfRoute('', 'deepseek-v4.1-flash'), null,
  'a bare DeepSeek model name names no vendor: it is served by several accounts');

// ── sourceOfSessions ────────────────────────────────────────────────────────
assert.equal(QUOTA_DEFAULT_SOURCE, 'deepseek');
const session = (id, time, provider, model) => ({
  ids: [id],
  projectionsBySession: { [id]: { values: { tcTimeline: { requests: [{ time, provider, model }] } } } },
});
assert.equal(sourceOfSessions(undefined), null,
  'before the session list arrives nothing is guessed, so no wallet is painted');
assert.equal(sourceOfSessions({ ids: [], projectionsBySession: {} }), null, 'an empty list names no vendor');
assert.equal(sourceOfSessions(session('a', 100, 'opencode-go', 'deepseek-v4.1-flash')), 'opencode-go',
  'the provider decides even when the model id looks like DeepSeek');
assert.equal(sourceOfSessions(session('a', 100, 'deepseek', 'deepseek-v4.1-flash')), 'deepseek');
assert.equal(sourceOfSessions(session('a', 100, 'ai-router', 'deepseek-v4.1-flash')), 'none',
  'a gateway route settles on no quota instead of borrowing the OpenCode windows');
assert.equal(sourceOfSessions(session('a', 100, 'opencode', 'OpenCode Zen · 免费 · big-pickle · 200K')), 'opencode-go',
  'Zen shares the same account key, so it reads the Go windows');
// The newest request across sessions wins.
const mixed = {
  ids: ['a', 'b'],
  projectionsBySession: {
    a: { values: { tcTimeline: { requests: [{ time: 100, provider: 'deepseek', model: 'deepseek-v4.1-flash' }] } } },
    b: { values: { tcTimeline: { requests: [{ time: 100, provider: 'x', model: 'y' }, { time: 200, provider: 'ai-router', model: 'deepseek-v4.1-flash' }] } } },
  },
};
assert.equal(sourceOfSessions(mixed), 'none',
  'the newest request decides, and a gateway route answers "no quota"');
assert.equal(sourceOfSessions({ ids: ['a'], projectionsBySession: { a: { values: {} } } }), null,
  'a session without a timeline names no vendor');

// ── routeOfSession: a switch counts before it bills ─────────────────────────
const projections = id => ({ [id]: { values: { tcTimeline: {
  requests: [{ time: 100, provider: 'deepseek', model: 'deepseek-v4.1-flash' }],
  current: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', time: 300 },
} } } });
// Routes come out of the VM realm, so compare fields rather than prototypes.
const routeOf = (routes, id) => {
  const route = routeOfSession(routes, id);
  return route === undefined ? undefined : { time: route.time, provider: route.provider, model: route.model };
};
assert.deepEqual(routeOf(projections('a'), 'a'),
  { time: 300, provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
  'a model switch already recorded outranks the older billed request');
assert.deepEqual(
  routeOf({ a: { values: { tcTimeline: {
    requests: [{ time: 500, provider: 'opencode-go', model: 'x' }],
    current: { provider: 'deepseek', model: 'y', time: 100 },
  } } } }, 'a'),
  { time: 500, provider: 'opencode-go', model: 'x' },
  'a newer billed request outranks an older switch');
assert.equal(routeOf({ a: { values: {} } }, 'a'), undefined, 'no timeline means no route');
assert.equal(
  routeOf({ a: { values: { tcTimeline: { requests: [], current: { provider: 'p', model: '', time: 1 } } } } }, 'a'),
  undefined,
  'an empty current without requests names no route');
assert.equal(
  sourceOfSessions({ ids: ['a'], projectionsBySession: projections('a') }), 'opencode-go',
  'the quota follows a switch that has not been billed yet');

// ── source memory ───────────────────────────────────────────────────────────
assert.equal(readStoredSource(), null, 'nothing is remembered before the first session');
storeSource('opencode-go');
assert.equal(readStoredSource(), 'opencode-go');
assert.equal(sourceOfSessions({ ids: [], projectionsBySession: {} }), 'opencode-go',
  'a blank workspace opens on the vendor the last session used, not on DeepSeek');
assert.equal(storage.get(QUOTA_SOURCE_KEY), 'opencode-go');
storeSource(null);
assert.equal(readStoredSource(), 'opencode-go', 'an empty source is not remembered over a real one');

// ── readQuotaRoute ──────────────────────────────────────────────────────────
assert.equal(QUOTA_URL, '/dsh-turn-cost/quota');
const seen = [];
const okFetch = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ status: 'ready' }) }; };
assert.deepEqual(await readQuotaRoute('opencode-go', false, okFetch), { status: 'ready' });
assert.equal(seen[0].url, '/dsh-turn-cost/quota?source=opencode-go', 'the source is part of the read');
await readQuotaRoute('deepseek', true, okFetch);
assert.equal(seen[1].url, '/dsh-turn-cost/quota?source=deepseek&force=1', 'a press forces the Host cache');
await readQuotaRoute(undefined, false, okFetch);
assert.equal(seen[2].url, '/dsh-turn-cost/quota?source=deepseek', 'a missing source falls back to the default');
const badFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
await assert.rejects(() => readQuotaRoute('opencode-go', false, badFetch), /quota route 404/);

// ── createQuotaStore ────────────────────────────────────────────────────────
assert.equal(QUOTA_POLL_MS, 5 * 60 * 1000, 'the poll runs every five minutes');
const store = createQuotaStore();
assert.equal(store.getSnapshot().status, 'idle');
assert.equal(store.getSnapshot().source, null, 'a fresh store names no vendor');
assert.equal(await store.refresh(), false, 'without a reader there is nothing to refresh');

let notifications = 0;
const unsubscribe = store.subscribe(() => { notifications += 1; });
const reads = [];
store.attach(async (source, force) => {
  reads.push({ source, force });
  if (source === 'opencode-go') return windowsBody;
  return { status: 'ready', source: 'deepseek', kind: 'balance', available: true, at: 1, wallets: [{ currency: 'CNY', total: '3.00' }] };
});
assert.equal(await store.refresh(), false, 'a store with no vendor reads nothing at all');
assert.equal(reads.length, 0, 'guard: no vendor must not become a DeepSeek read');
assert.equal(store.getSnapshot().status, 'idle', 'and it stays blank instead of reporting a failure');
store.setSource('deepseek');
await store.refresh();
assert.deepEqual(reads[0], { source: 'deepseek', force: false }, 'the first read follows the named source without forcing');
assert.equal(store.getSnapshot().kind, 'balance');
assert.equal(quotaFigure(store.getSnapshot(), t), '¥3.00');
assert.ok(notifications >= 2, 'loading then ready both notify');
assert.equal(timers.size, 1, 'attach starts exactly one poll');
assert.equal([...timers.values()][0].ms, 5 * 60 * 1000);

// Switching the source drops the stale figure and reads the new one.
store.setSource('opencode-go');
await store.refresh();
assert.equal(store.getSnapshot().source, 'opencode-go');
assert.equal(store.getSnapshot().kind, 'windows');
assert.equal(quotaFigure(store.getSnapshot(), t), '5h 16% · 周 25% · 月 47%');
assert.equal(reads[reads.length - 1].source, 'opencode-go');
const countAfterSwitch = reads.length;
store.setSource('opencode-go');
assert.equal(reads.length, countAfterSwitch, 'setting the same source does not re-read');
store.setSource('deepseek');
await store.refresh();
assert.equal(store.getSnapshot().kind, 'balance', 'switching back re-reads the wallet source');

// Losing the vendor withdraws the figure and stops reading; it never falls back
// to another plan's numbers.
store.setSource(null);
assert.equal(store.getSnapshot().source, null);
assert.equal(store.getSnapshot().status, 'idle');
assert.equal(store.getSnapshot().kind, null, 'the stale window figure is dropped with the source');
assert.equal(quotaFigure(store.getSnapshot(), t), '', 'a store with no vendor renders nothing');
const countAfterClear = reads.length;
assert.equal(await store.refresh(), false, 'a cleared store does not poll a default vendor');
assert.equal(reads.length, countAfterClear, 'guard: clearing the source must not trigger a DeepSeek read');
store.setSource('deepseek');
await store.refresh();

// A provider with no quota settles once and is never polled again.
store.setSource(NO_SOURCE);
assert.equal(store.getSnapshot().status, 'nostore', 'a quota-less provider reports its own state');
assert.equal(store.getSnapshot().source, NO_SOURCE);
assert.equal(quotaFigure(store.getSnapshot(), t), '此供应商无额度可查',
  'the foot says there is no quota instead of showing a number');
assert.deepEqual(quotaDetail(store.getSnapshot(), t).split('\n').slice(0, 2),
  ['订阅额度', '此供应商无额度可查'], 'the hover text explains why');
const countBeforeNoSource = reads.length;
assert.equal(await store.refresh(), false, 'a quota-less provider is never read');
assert.equal(reads.length, countBeforeNoSource, 'guard: no read may be issued for it');
store.setSource(NO_SOURCE);
assert.equal(reads.length, countBeforeNoSource, 're-selecting the same quota-less source stays quiet');

// A press forces the Host read; the poll reuses its cache.
store.attach(async (source, force) => { reads.push({ source, force }); return { status: 'ready', source, kind: 'balance', at: 2, wallets: [] }; });
store.setSource('deepseek');    // leave the quota-less state first: it issues no reads
await store.refresh();          // let the attach read settle first
await store.refresh(true);
assert.equal(reads[reads.length - 1].force, true, 'a press forces the read');
await store.refresh();
assert.equal(reads[reads.length - 1].force, false, 'the poll does not force');

// A concurrent refresh joins the in-flight read instead of issuing a second one.
let slowCalls = 0;
store.attach(async (source) => {
  slowCalls += 1;
  return { status: 'ready', source, kind: 'balance', at: 3, wallets: [{ currency: 'CNY', total: '9.00' }] };
});
await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
assert.equal(slowCalls, 1, 'concurrent refreshes coalesce');

// A throwing reader surfaces as failed, not as zero.
store.attach(async () => { throw new Error('refused'); });
await store.refresh();
assert.equal(store.getSnapshot().status, 'failed');
assert.equal(quotaFigure(store.getSnapshot(), t), '额度不可用');

// An unconfigured Host says so instead of showing zero.
store.attach(async (source) => ({ status: 'unconfigured', source, at: 4 }));
await store.refresh();
assert.equal(store.getSnapshot().status, 'unconfigured');
assert.equal(quotaFigure(store.getSnapshot(), t), '未配置密钥');

// detach withdraws the reader but keeps subscribers for a re-provided route.
store.attach(async (source) => ({ status: 'ready', source, kind: 'balance', at: 5, wallets: [] }));
await store.refresh();
const before = notifications;
store.detach();
assert.equal(await store.refresh(), false, 'detached stores stop reading');
assert.equal(store.getSnapshot().status, 'ready', 'a detach does not wipe the last good figure');
assert.equal(notifications, before, 'detach itself notifies nobody');
assert.equal(timers.size, 0, 'detach clears the poll');

unsubscribe();
store.dispose();
assert.equal(await store.refresh(), false, 'a disposed store reads nothing');

console.log('quota.test.js: all assertions passed');
