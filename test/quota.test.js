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
      sourceOfRoute, routeOfSession, selectedRouteOfSession, activeRouteOfSession,
      currentSessionIdOf, runningOfSession, createSourceSettler,
      QUOTA_SOURCE_DEBOUNCE_MS,
      readStoredSource, storeSource, NO_SOURCE,
      windowName, planOf, totalsOf, credits,
      createQuotaStore, readQuotaRoute, QUOTA_URL, QUOTA_POLL_MS, QUOTA_DEFAULT_SOURCE,
      QUOTA_SOURCE_KEY, QUOTA_CACHE_KEY, QUOTA_CACHE_TTL_MS,
      readCachedQuota, writeCachedQuota })`,
  sandbox,
);

const {
  money2, moneyList, clock, stampOf, windowShort, windowLong, sourceName,
  msUntil, remainText, remainTone, quotaCycleOf, windowLineOf, resetClauseOf,
  quotaSnapshotOf, quotaFigure, quotaDetail, quotaSubOf, quotaTileValue, sourceOfSessions,
  sourceOfRoute, routeOfSession, selectedRouteOfSession, activeRouteOfSession,
  currentSessionIdOf, runningOfSession, createSourceSettler,
  QUOTA_SOURCE_DEBOUNCE_MS,
  readStoredSource, storeSource, NO_SOURCE,
  windowName, planOf, totalsOf, credits,
  createQuotaStore, readQuotaRoute, QUOTA_URL, QUOTA_POLL_MS, QUOTA_DEFAULT_SOURCE, QUOTA_SOURCE_KEY,
  QUOTA_CACHE_KEY, QUOTA_CACHE_TTL_MS, readCachedQuota, writeCachedQuota,
} = ctx;

/** Minimal dictionary so the formatters can be asserted without the locale service. */
const t = (key, params = {}) => {
  const table = {
    quotaTitle: '订阅额度', quotaTileOf: '{source} 额度',
    quotaSourceDeepseek: 'DeepSeek', quotaSourceOpencode: 'OpenCode Go',
    quotaSourceWorkbuddy: 'WorkBuddy', quotaCreditsLine: '积分剩 {remain} / {total}',
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
    quotaStale: '显示的是上次成功读数，正在后台重试',
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
assert.equal(windowLong({ key: 'weekly' }, t), '本周', 'a known key translates');
assert.equal(windowLong({ key: 'plan_base', label: '套餐积分' }, t), '套餐积分', 'a vendor label wins over its key');
assert.equal(windowName({ key: 'benefit', label: '奖励积分' }, t), '奖励积分');
assert.equal(windowName({ key: 'rolling' }, t), '5h', 'no label falls back to the key vocabulary');
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
assert.equal(cycle.kind, 'window', 'an OpenCode cycle is inferred from a window, so the hint explains it');
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
assert.equal(sourceOfRoute('ai-router', 'OpenCode Go · 付费 · Qwen3.8-Max'), 'opencode-go',
  'a gateway row locked to one platform names the account that pays, so its allowance is readable');
assert.equal(sourceOfRoute('ai-router', 'WorkBuddy · 付费 · DeepSeek-V4.1-Flash · 1M'), 'workbuddy',
  'a WorkBuddy-backed gateway row reads WorkBuddy credits, not「无额度可查」');
assert.equal(sourceOfRoute('ai-router', 'kimi-k3', 'WorkBuddy · 付费 · kimi-k3'),
  'workbuddy', 'the display name carries the platform when the model id does not');
assert.equal(sourceOfRoute('ai-router', 'OpenRouter · 付费 · gpt-5', ''),
  'none', 'a platform with no readable allowance stays quota-less rather than borrowing another plan');
assert.equal(sourceOfRoute('', 'nvidia · 免费 · llama-4'), 'none',
  'an unreadable platform is settled even without a provider id');
assert.equal(sourceOfRoute('some-other-gateway', 'deepseek-v4.1-flash'), 'none',
  'any unrecognised provider is treated as quota-less rather than guessed at');
assert.equal(sourceOfRoute('opencode', 'big-pickle'), 'opencode-go');
assert.equal(sourceOfRoute('deepseek', 'deepseek-v4.1-flash'), 'deepseek');
assert.equal(sourceOfRoute('deepseek-account', 'deepseek-v4.1-flash'), 'deepseek');
assert.equal(sourceOfRoute('', 'OpenCode Go · 付费 · Qwen3.8-Max · 1M'), 'opencode-go',
  'without a provider the OpenCode product name still classifies the model');
assert.equal(sourceOfRoute('', 'deepseek-v4.1-flash'), null,
  'a bare DeepSeek model name names no vendor: it is served by several accounts');

assert.equal(sourceOfRoute('workbuddy', 'kimi-k3'), 'workbuddy',
  'the WorkBuddy gateway holds one account token in its shim, so its allowance is readable');
assert.equal(sourceOfRoute('workbuddy-shim', 'hy4'), 'workbuddy');

// ── WorkBuddy: vendor-named buckets, a real plan expiry, lump totals ────────
const workbuddy = quotaSnapshotOf({
  status: 'ready', source: 'workbuddy', kind: 'windows', at: 1_700_000_000_000,
  windows: [
    { key: 'plan_base', label: '套餐积分', percent: 0, status: 'ok', resetsAt: '2026-12-22T17:46:03Z', total: 4000, remain: 4000 },
    { key: 'benefit', label: '奖励积分', percent: 93.9, status: 'ok', resetsAt: '2026-12-15T20:38:18Z', total: 3700, remain: 226.16 },
  ],
  plan: { name: '高级版', code: '', paid: true, expiresAt: '2026-12-22T17:46:03Z' },
  totals: { total: 12700, remain: 9226.16, used: 3473.84, unit: 'credits' },
});
assert.equal(workbuddy.source, 'workbuddy');
assert.equal(workbuddy.windows[1].label, '奖励积分');
assert.equal(quotaFigure(workbuddy, t), '套餐积分 0% · 奖励积分 94%',
  'the foot names the credit buckets the vendor actually has');
assert.equal(quotaTileValue(workbuddy, t), '奖励积分 94%', 'the tightest bucket leads the tile');
// The cycle comes from the declared plan expiry, not from "the longest window".
const wbCycle = quotaCycleOf(workbuddy, now);
assert.equal(wbCycle.kind, 'plan');
assert.equal(wbCycle.at, Date.parse('2026-12-22T17:46:03Z'));
const wbLines = quotaDetail(workbuddy, t, now).split('\n');
assert.equal(wbLines[0], '订阅额度（WorkBuddy）');
assert.equal(wbLines[1], '高级版', 'the paying plan is named');
assert.match(wbLines[2], /^订阅周期 12-23 01:46 结束（剩 \d+ 天）$/u);
assert.equal(wbLines[3], '套餐积分：已用 0%，12-23 01:46 重置（剩 33 天）', 'a declared expiry needs no inference hint');
assert.equal(wbLines[4], '奖励积分：已用 94%，12-16 04:38 重置（剩 26 天）');
assert.equal(wbLines[5], '积分剩 9226 / 12700', 'one lump credit figure, rounded: the hundredths never change a decision');
assert.equal(credits(226.16), '226.16', 'small amounts keep their decimals');
assert.equal(credits(4000), '4000', 'whole amounts drop the trailing zeros');
assert.equal(credits('nope'), '', 'an unusable amount renders nothing');
assert.equal(quotaSubOf(workbuddy, t, now).startsWith('剩 '), true,
  'the KPI sub-line still answers "how long is left"');
assert.equal(quotaSnapshotOf({ status: 'ready', source: 'workbuddy', kind: 'windows', windows: [{ key: 'a', percent: 1 }] }).plan, null,
  'a body without a plan keeps plan null');

// ── sourceOfSessions ────────────────────────────────────────────────────────
assert.equal(QUOTA_DEFAULT_SOURCE, 'deepseek');
// A row the main view retains is the conversation the foot answers for, so the
// classification cases below are stated on a focused session — the landing view
// deliberately derives nothing (see the cross-session case further down).
const session = (id, time, provider, model) => ({
  ids: [id],
  byId: { [id]: { id, retainedBy: { mainView: 1 } } },
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
// With nothing retained in the main view the remembered vendor stands in, and no
// other conversation is scanned: several sessions run at once on different plans,
// so "the newest request anywhere" flips every few seconds and the foot used to
// alternate between one subscription's windows and「此供应商无额度可查」.
const mixed = {
  ids: ['a', 'b'],
  byId: { a: { id: 'a', retainedBy: { mainView: 0 } }, b: { id: 'b', retainedBy: { mainView: 0 } } },
  projectionsBySession: {
    a: { values: { tcTimeline: { requests: [{ time: 100, provider: 'deepseek', model: 'deepseek-v4.1-flash' }] } } },
    b: { values: { tcTimeline: { requests: [{ time: 100, provider: 'x', model: 'y' }, { time: 200, provider: 'ai-router', model: 'deepseek-v4.1-flash' }] } } },
  },
};
assert.equal(sourceOfSessions(mixed), null,
  'the landing view names no vendor: another session\'s newer route does not decide');
assert.equal(sourceOfSessions({ ids: ['a'], byId: { a: { id: 'a', retainedBy: { mainView: 1 } } }, projectionsBySession: { a: { values: {} } } }),
  null, 'a focused session without a timeline names no vendor');

// ── main-view focus: running vs idle decides which route answers ────────────
// A conversation the user is looking at is a row retained by the main view; the
// quota answers for it, not for whichever background session billed last.
const focused = (id, values, extra = {}) => ({
  ids: [id],
  byId: { [id]: { id, retainedBy: { mainView: 1 }, running: extra.running === true } },
  projectionsBySession: { [id]: { values } },
});
const selectionValues = (lastUsed, next) => ({ modelSelection: { lastUsed, next } });
const workbuddyLast = { provider: 'workbuddy', model: 'wb-flash' };
const opencodeNext = { provider: 'opencode-go', model: 'oc-flash' };
const statusOf = (id, running, pending) => new Map([[id, {
  running, pendingInteraction: pending,
}]]);

assert.equal(sourceOfSessions(focused('a', selectionValues(workbuddyLast, opencodeNext)), statusOf('a', true, undefined)),
  'workbuddy', 'mid-turn the billed route pays, even though the composer points at OpenCode');
assert.equal(sourceOfSessions(focused('a', selectionValues(workbuddyLast, opencodeNext)), statusOf('a', false, undefined)),
  'opencode-go', 'once the turn ends the composer choice is what the next message bills');
assert.equal(sourceOfSessions(focused('a', selectionValues(workbuddyLast, opencodeNext)), statusOf('a', true, { key: 'q', kind: 'ask', sessionId: 'a' })),
  'workbuddy', 'a pending question is not the end of the turn: the same route keeps paying');
assert.equal(sourceOfSessions(focused('a', selectionValues(workbuddyLast, opencodeNext)), statusOf('a', false, { key: 'q', kind: 'ask', sessionId: 'a' })),
  'workbuddy', 'waiting on the user is still work in progress');
assert.equal(sourceOfSessions(focused('a', selectionValues(workbuddyLast, opencodeNext)), undefined),
  'opencode-go', 'without a status map the session counts as idle, which is the composer choice');

// A switch that has not billed answers for an idle session, but never overrides
// the route a running turn is paying for.
const switched = { modelSelection: { lastUsed: null, next: opencodeNext } };
assert.equal(sourceOfSessions(focused('b', switched), statusOf('b', false, undefined)), 'opencode-go',
  'a never-billed switch still points an idle session at its new plan');
// A gateway route carries its real platform only in the model's display name, so
// a running turn backed by WorkBuddy through `ai-router` must read WorkBuddy's
// credits — the case where a provider-id-only rule showed「无额度可查」.
const gatewayRunning = focused('c', {
  modelSelection: { lastUsed: { provider: 'ai-router', model: 'deepseek-v4.1-flash' }, next: null },
});
const catalogLabel = () => 'WorkBuddy · 付费 · DeepSeek-V4.1-Flash · 1M';
assert.equal(sourceOfSessions(gatewayRunning, statusOf('c', true, undefined), null, catalogLabel),
  'workbuddy', 'the catalog names the platform behind a gateway route');
assert.equal(sourceOfSessions(gatewayRunning, statusOf('c', true, undefined), null, () => ''),
  'none', 'with no label the gateway stays quota-less rather than borrowing another plan');
assert.equal(sourceOfSessions(gatewayRunning, statusOf('c', true, undefined), null, () => 'OpenRouter · 付费 · x'),
  'none', 'an unreadable platform behind the gateway is a settled answer');

// The gateway states the answer itself (`/v1/models` row `quota.source`, from
// `ai-shim`'s `router/quota_source.py`), which outranks every local guess: it is
// the party that bills, and it resolved the row's backends instead of rendering
// them into a name. This is what makes the foot correct before the catalog loads.
assert.equal(sourceOfRoute('ai-router', 'deepseek-v4.1-flash', '', 'workbuddy'), 'workbuddy',
  'a gateway-stated source wins with no display name at all');
assert.equal(sourceOfRoute('ai-router', 'deepseek-v4.1-flash', 'WorkBuddy · 付费 · DeepSeek-V4.1-Flash · 1M'),
  'workbuddy', 'without a stated source the display name still classifies the route');
assert.equal(sourceOfRoute('opencode-go', 'deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', null), 'none',
  'a stated "no readable allowance" is settled even for a provider that normally maps');
assert.equal(sourceOfRoute('ai-router', 'x', 'OpenRouter · 付费 · x', 'deepseek'), 'deepseek',
  'the stated source outranks a rendering that disagrees with it');
assert.equal(sourceOfRoute('', '', '', 'workbuddy'), 'workbuddy',
  'the stated source needs no provider id either');
assert.equal(sourceOfSessions(gatewayRunning, statusOf('c', true, undefined), null,
  () => '', (provider, model) => (provider === 'ai-router' && model === 'deepseek-v4.1-flash' ? 'workbuddy' : undefined)),
  'workbuddy', 'the map answers a running gateway turn whose catalog has not loaded');
assert.equal(sourceOfSessions(gatewayRunning, statusOf('c', true, undefined), null,
  () => '', () => null),
  'none', 'a map entry of null is the gateway saying there is nothing to read');
assert.equal(sourceOfSessions(gatewayRunning, statusOf('c', true, undefined), null,
  () => '', () => undefined),
  'none', 'a route the map does not cover falls back to the display name, which is empty here');
// Only the main-view session decides; a newer route elsewhere does not win.
const twoSessions = {
  ids: ['a', 'b'],
  byId: { a: { id: 'a', retainedBy: { mainView: 1 } }, b: { id: 'b', retainedBy: { mainView: 0 } } },
  projectionsBySession: {
    a: { values: { tcTimeline: { requests: [{ time: 100, provider: 'workbuddy', model: 'wb-flash' }] } } },
    b: { values: { tcTimeline: { requests: [{ time: 900, provider: 'opencode-go', model: 'oc-flash' }] } } },
  },
};
assert.equal(sourceOfSessions(twoSessions, new Map()), 'workbuddy',
  'a background session that billed later does not take over the foot');
assert.equal(currentSessionIdOf(twoSessions), 'a', 'the retained row is the main-view conversation');
assert.equal(currentSessionIdOf({ ids: [], byId: {} }), null, 'an empty catalog has no main view');
assert.equal(currentSessionIdOf(undefined), null);

// ── createSourceSettler: no halfway figure is ever painted ──────────────────
// The derived source walks through intermediate values while the list hydrates,
// so only a candidate that survives the settle window is committed.
assert.equal(QUOTA_SOURCE_DEBOUNCE_MS, 1200, 'the settle window covers a hydration pass');
const pendingTimers = [];
const timer = (fn, ms) => {
  const handle = pendingTimers.length + 1;
  pendingTimers.push({ handle, fn, ms });
  return handle;
};
const clearTimer = (handle) => {
  const index = pendingTimers.findIndex(entry => entry.handle === handle);
  if (index >= 0) pendingTimers.splice(index, 1);
};
const fireAll = () => {
  const due = pendingTimers.splice(0, pendingTimers.length);
  for (const entry of due) entry.fn();
};

let candidate = 'opencode-go';
const settler = createSourceSettler(() => candidate, {
  timer, clearTimer, materialize: value => value !== null,
});
// Nothing is painted until something settles: the remembered vendor seeds the
// first paint, and a candidate that arrives with the list never does.
assert.equal(settler.read(), null, 'a halfway candidate is not painted on the first render');

const mixedSettler = createSourceSettler(() => candidate, {
  timer, clearTimer, materialize: value => value !== null, initial: 'workbuddy',
});
assert.equal(mixedSettler.read(), 'workbuddy', 'the remembered vendor is what the first paint shows');
mixedSettler.schedule();
assert.equal(mixedSettler.read(), 'workbuddy', 'a new candidate waits out the settle window');
assert.equal(pendingTimers.length, 1, 'exactly one commit is armed');
// The armed timer resolves the *then-current* candidate, so a value that was
// only true for two frames cannot win by scheduling first.
candidate = 'workbuddy';
fireAll();
assert.equal(mixedSettler.read(), 'workbuddy', 'the settled answer is committed');

// A source with nothing to show commits at once: there is no figure to keep on
// screen, so there is no flash to avoid.
let noneCandidate = 'deepseek';
const clearing = createSourceSettler(() => noneCandidate, {
  timer, clearTimer, materialize: value => value !== null, initial: 'deepseek',
});
assert.equal(clearing.read(), 'deepseek');
noneCandidate = null;
clearing.schedule();
assert.equal(clearing.read(), null, 'no source is an answer, not a flash: it commits immediately');
assert.equal(pendingTimers.length, 0, 'an unshowable candidate never arms a timer');
// ...and coming back to a real source waits again.
noneCandidate = 'opencode-go';
const settleEvents = [];
clearing.subscribe(() => settleEvents.push(clearing.read()));
clearing.schedule();
assert.equal(clearing.read(), null, 'the return still settles before it is painted');
fireAll();
assert.equal(clearing.read(), 'opencode-go');
assert.deepEqual(settleEvents, ['opencode-go'], 'subscribers are told exactly once, on commit');
// A schedule whose candidate did not actually change disarms the pending commit.
candidate = 'opencode-go';
const steady = createSourceSettler(() => candidate, { timer, clearTimer, materialize: v => v !== null, initial: 'opencode-go' });
steady.schedule();
assert.equal(pendingTimers.length, 0, 'an unchanged answer schedules nothing');
assert.equal(steady.read(), 'opencode-go');

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
  sourceOfSessions({
    ids: ['a'],
    byId: { a: { id: 'a', retainedBy: { mainView: 1 } } },
    projectionsBySession: projections('a'),
  }), 'opencode-go',
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
storeSource(NO_SOURCE);
assert.equal(readStoredSource(), 'opencode-go',
  '"this route has no allowance" is a fact about one conversation, not a vendor to reopen on');
storage.set(QUOTA_SOURCE_KEY, NO_SOURCE);
assert.equal(readStoredSource(), null, 'a value an older build persisted is dropped on read');
storage.set(QUOTA_SOURCE_KEY, 'deepseek');
assert.equal(readStoredSource(), 'deepseek', 'a real remembered vendor still reads back');
storage.delete(QUOTA_SOURCE_KEY);

// ── readQuotaRoute ──────────────────────────────────────────────────────────
assert.equal(QUOTA_URL, '/dsh-session-insight/quota');
const seen = [];
const okFetch = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ status: 'ready' }) }; };
assert.deepEqual(await readQuotaRoute('opencode-go', false, okFetch), { status: 'ready' });
assert.equal(seen[0].url, '/dsh-session-insight/quota?source=opencode-go', 'the source is part of the read');
await readQuotaRoute('deepseek', true, okFetch);
assert.equal(seen[1].url, '/dsh-session-insight/quota?source=deepseek&force=1', 'a press forces the Host cache');
await readQuotaRoute(undefined, false, okFetch);
assert.equal(seen[2].url, '/dsh-session-insight/quota?source=deepseek', 'a missing source falls back to the default');
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

// A throwing reader on a surface that has nothing yet surfaces as failed, not as zero.
const empty = createQuotaStore();
empty.attach(async () => { throw new Error('refused'); });
empty.setSource('deepseek');
await empty.refresh();
assert.equal(empty.getSnapshot().status, 'failed');
assert.equal(quotaFigure(empty.getSnapshot(), t), '额度不可用');
empty.dispose();

// ...but a good figure is never thrown away by one failed read: it stays up and
// is flagged stale, so the foot keeps answering instead of flashing「额度不可用」.
store.attach(async () => { throw new Error('refused'); });
await store.refresh();
assert.equal(store.getSnapshot().status, 'ready', 'the last good figure survives a failed read');
assert.equal(store.getSnapshot().stale, true, 'and it is marked as a stale reading');
assert.ok(quotaFigure(store.getSnapshot(), t).includes('¥'), 'the figure still renders');
assert.ok(quotaDetail(store.getSnapshot(), t).includes('显示的是上次成功读数'), 'the hover text owns up to it');
// A later success clears the flag.
store.attach(async (source) => ({ status: 'ready', source, kind: 'balance', at: 6, wallets: [{ currency: 'CNY', total: '7.00' }] }));
await store.refresh();
assert.equal(store.getSnapshot().stale, undefined, 'a successful read clears the stale flag');
assert.equal(quotaFigure(store.getSnapshot(), t), '¥7.00');

// A Host-side `failed` body (HTTP 200, vendor broken) is treated the same way.
store.attach(async (source) => ({ status: 'failed', source, reason: 'timeout', at: 7 }));
await store.refresh();
assert.equal(store.getSnapshot().status, 'ready', 'a Host-reported failure does not blank a good figure either');
assert.equal(store.getSnapshot().stale, true);

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

// ── persisted last-good figure ──────────────────────────────────────────────
// The store is rebuilt empty every time the chunk reloads, so a figure the
// previous load had is kept in localStorage and painted before the first read.
storage.delete(QUOTA_CACHE_KEY);
assert.equal(readCachedQuota('deepseek'), null, 'nothing cached before the first success');

const t0 = 1_700_000_000_000;
const goodBalance = quotaSnapshotOf({
  status: 'ready', source: 'deepseek', kind: 'balance', available: true, at: t0,
  wallets: [{ currency: 'CNY', total: '12.30', toppedUp: '12.30', granted: '0.00' }],
});
writeCachedQuota(goodBalance);
const painted = readCachedQuota('deepseek', t0 + 60_000);
assert.equal(painted.status, 'ready');
assert.equal(painted.cached, true, 'a persisted figure is flagged as one');
assert.equal(quotaFigure(painted, t), '¥12.30', 'and it renders the same figure as the live one');
assert.equal(readCachedQuota('opencode-go'), null, 'another vendor is not answered by this one');
assert.equal(readCachedQuota(null), null, 'no vendor means nothing to cache');
assert.equal(readCachedQuota(NO_SOURCE), null, 'a quota-less provider has no figure to remember');

// State that is not a real reading is never persisted: caching it would make
// the next load paint「额度不可用」as if it were the account's balance.
writeCachedQuota({ status: 'failed', source: 'opencode-go', at: t0 });
writeCachedQuota({ status: 'loading', source: 'opencode-go', at: t0 });
writeCachedQuota({ status: 'nostore', source: 'opencode-go', at: t0 });
writeCachedQuota({ status: 'ready', source: 'opencode-go', kind: 'windows', windows: [], at: 0 });
assert.equal(readCachedQuota('opencode-go'), null, 'failed / loading / nostore / undated are not cached');

// A day-old percentage is worse than a spinner: it claims the plan sits where
// it no longer does.
assert.equal(readCachedQuota('deepseek', t0 + QUOTA_CACHE_TTL_MS + 1), null, 'an expired figure is dropped');
assert.ok(readCachedQuota('deepseek', t0 + QUOTA_CACHE_TTL_MS - 1) !== null, 'and the boundary still holds');

// View flags never travel to the next load.
writeCachedQuota({ ...goodBalance, cached: true, stale: true });
const clean = readCachedQuota('deepseek', t0 + 1000);
assert.equal(clean.stale, undefined, 'a stale flag from the last load is not remembered');

// A window whose reset has already passed describes a period that ended, so its
// percentage must not be carried into the new period.
const t1 = Date.UTC(2026, 10, 19, 4, 44);
const windowed = quotaSnapshotOf({
  status: 'ready', source: 'opencode-go', kind: 'windows', at: t1,
  windows: [
    { key: 'rolling', percent: 47, status: 'ok', resetsAt: '2026-11-19T07:07:04.000Z' },
    { key: 'monthly', percent: 59, status: 'ok', resetsAt: '2026-12-02T15:30:38.000Z' },
  ],
});
writeCachedQuota(windowed);
assert.ok(readCachedQuota('opencode-go', t1 + 60_000) !== null, 'a live window figure is painted');
assert.equal(readCachedQuota('opencode-go', Date.parse('2026-11-19T07:07:05.000Z')), null,
  'once the shortest window has reset, the whole cached figure is dropped');
assert.ok(readCachedQuota('opencode-go', Date.parse('2026-11-19T07:07:03.000Z')) !== null,
  'and it is kept right up to that reset');

// A corrupt entry is a miss, not a crash.
storage.set(QUOTA_CACHE_KEY, '{not json');
assert.equal(readCachedQuota('deepseek'), null, 'unparsable storage reads as nothing cached');
storage.set(QUOTA_CACHE_KEY, '[]');
assert.equal(readCachedQuota('deepseek'), null, 'a non-object table reads as nothing cached');
storage.delete(QUOTA_CACHE_KEY);

// The store paints that figure on `setSource` and never flashes「读取中…」.
writeCachedQuota(goodBalance);
const warm = createQuotaStore({ now: () => t0 + 120_000 });
warm.attach(() => new Promise(() => {}));   // a read that never answers
warm.setSource('deepseek');
assert.equal(warm.getSnapshot().status, 'ready', 'a remembered figure is up before any read answers');
assert.equal(warm.getSnapshot().cached, true);
assert.equal(quotaFigure(warm.getSnapshot(), t), '¥12.30');
warm.dispose();

// Without one it still says it is reading, exactly as before.
storage.delete(QUOTA_CACHE_KEY);
const cold = createQuotaStore({ now: () => t0 });
cold.attach(() => new Promise(() => {}));
cold.setSource('deepseek');
assert.equal(cold.getSnapshot().status, 'loading', 'nothing cached still shows the loader');
cold.dispose();

// A successful read is written through, so the next reload is warm.
const writer = createQuotaStore({ now: () => t0 });
writer.attach(async () => ({ status: 'ready', source: 'deepseek', kind: 'balance', at: t0, wallets: [{ currency: 'CNY', total: '4.40' }] }));
writer.setSource('deepseek');
await writer.refresh();
assert.equal(quotaFigure(readCachedQuota('deepseek', t0 + 1000), t), '¥4.40', 'a good read is remembered for the next load');
writer.dispose();

// Switching the model while a read is in flight: the old answer must not land on
// the new vendor's card, and the new vendor is still read.
storage.delete(QUOTA_CACHE_KEY);   // start cold, or the cached figure hides the loader
const switching = createQuotaStore({ now: () => t0 });
let releaseSlow;
const slowAnswers = new Map();
switching.attach((source) => new Promise((resolve) => { slowAnswers.set(source, resolve); }));
switching.setSource('deepseek');
assert.equal(switching.getSnapshot().status, 'loading', 'the first read starts on the named vendor');
await new Promise((resolve) => setImmediate(resolve));
assert.ok(slowAnswers.has('deepseek'), 'the read reached the DeepSeek source');
switching.setSource('opencode-go');
await new Promise((resolve) => setImmediate(resolve));
assert.ok(slowAnswers.has('opencode-go'), 'the new vendor is read instead of waiting for the old one');
assert.equal(switching.getSnapshot().source, 'opencode-go', 'the card moves to the new vendor at once');
slowAnswers.get('deepseek')({ status: 'ready', source: 'deepseek', kind: 'balance', at: t0, wallets: [{ currency: 'CNY', total: '99.00' }] });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(switching.getSnapshot().source, 'opencode-go', 'the late DeepSeek answer does not take the card back');
assert.notEqual(quotaFigure(switching.getSnapshot(), t), '¥99.00', 'and its wallet is not painted on the OpenCode card');
slowAnswers.get('opencode-go')(windowsBody);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(switching.getSnapshot().kind, 'windows', 'the new vendor is read on its own');
assert.equal(quotaFigure(switching.getSnapshot(), t), '5h 16% · 周 25% · 月 47%');
switching.dispose();

// revalidate() re-reads the named source but stays quiet when nothing is named.
let revalidations = 0;
const revisiting = createQuotaStore({ now: () => t0 });
revisiting.attach(async (source) => { revalidations += 1; return { status: 'ready', source, kind: 'balance', at: t0, wallets: [] }; });
assert.equal(await revisiting.revalidate(), false, 'nothing named yet: nothing to revalidate');
revisiting.setSource('deepseek');
await revisiting.refresh();
const beforeRevalidate = revalidations;
await revisiting.revalidate();
assert.equal(revalidations, beforeRevalidate + 1, 'coming back to the tab re-reads the live figure');
revisiting.dispose();

console.log('quota.test.js: all assertions passed');
