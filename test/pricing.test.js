/**
 * Independent test for the §1 pricing module.
 *
 * client.js is a browser bundle (it calls window.__ModuleLoader__.load at the
 * top level), so this test extracts only the pure pricing section and runs it
 * in a plain Node VM with no DOM, React or DSH. Run: node test/pricing.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const start = source.indexOf('const DEEPSEEK_SOURCE');
const end = source.indexOf('    // §1.5 preferences');
assert.ok(start !== -1 && end > start, 'pricing section markers must exist');
const pricingSource = source.slice(start, end);

const ctx = runInNewContext(
  `${pricingSource}\n({ OFFICIAL, isPeak, normalizeModelId, lookupPrice, computeTurnCost, formatUsd, formatMoney, moneyOf, computeSessionTotal, computeRequestsTotal, computeTurnRequestsTotal, priceBuckets, priceBucketsResult, USD_TO_CNY })`,
  Object.create(null),
);

const { OFFICIAL, isPeak, normalizeModelId, lookupPrice, computeTurnCost, formatUsd, formatMoney, moneyOf, computeSessionTotal, computeRequestsTotal, computeTurnRequestsTotal, priceBuckets, priceBucketsResult, USD_TO_CNY } = ctx;

// Beijing 2026-11-13 (Friday) 10:00 = 02:00 UTC -> peak
const peakMs = Date.UTC(2026, 10, 13, 2, 0, 0);
// Beijing 2026-11-15 (Sunday) 10:00 = 02:00 UTC -> off-peak (weekend)
const offPeakMs = Date.UTC(2026, 10, 15, 2, 0, 0);
// Beijing 2026-11-13 20:00 = 12:00 UTC -> off-peak
const eveningMs = Date.UTC(2026, 10, 13, 12, 0, 0);

assert.equal(isPeak(peakMs), true, 'Fri 10:00 Beijing is peak');
assert.equal(isPeak(offPeakMs), false, 'Sunday is off-peak');
assert.equal(isPeak(eveningMs), false, '20:00 Beijing is off-peak');

assert.equal(normalizeModelId('claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5');
assert.equal(normalizeModelId('anthropic/gpt-6.1-sol'), 'gpt-6.1-sol');
assert.equal(lookupPrice('deepseek-v4-flash')?.vendor, 'DeepSeek', 'legacy alias resolves');
assert.equal(lookupPrice('deepseek-v4.1-flash')?.vendor, 'DeepSeek', 'gateway version name resolves to the official model');
assert.equal(lookupPrice('DeepSeek-V4.1-Flash-1017')?.vendor, 'DeepSeek', 'versioned alias resolves');
assert.equal(lookupPrice('some-future-model'), undefined);
assert.equal(lookupPrice('hy4-flash')?.free, true, 'provider-marked free model');
assert.equal(lookupPrice('deepseek-v4.1-flash-free')?.free, true, 'free gateway variant');
assert.equal(lookupPrice('openrouter/free')?.free, true, 'bare free route');
assert.equal(lookupPrice('nvidia/nemotron-3.5-super-vl:free')?.free, true, ':free routes are free');
assert.equal(lookupPrice('hy4-preview')?.unpriced, true, 'credit-billed model has no token price');
assert.equal(lookupPrice('hy4-preview')?.free, undefined, 'unpriced is not the same as free');

// DeepSeek flash: 10k uncached input + 5k cache-hit + 1k output, peak
const usage = {
  uncachedInputTokens: 10000,
  outputTokens: 1000,
  totalTokens: 16000,
  cacheReadTokens: 5000,
  cacheWriteTokens: 0,
  routes: [{ provider: 'deepseek-official', model: 'deepseek-flash' }],
};
const peak = computeTurnCost(usage, peakMs);
const off = computeTurnCost(usage, offPeakMs);
assert.equal(peak.status, 'ok');
assert.equal(peak.peak, true);
assert.equal(peak.approximate, false);
const expectedPeak = (10000 * 0.30 + 5000 * 0.006 + 0 + 1000 * 1.20) / 1e6;
assert.ok(Math.abs(peak.usd - expectedPeak) < 1e-12, `peak ${peak.usd} != ${expectedPeak}`);
assert.ok(Math.abs(off.usd - expectedPeak / 2) < 1e-12, 'off-peak is exactly half');
assert.ok(Math.abs(peak.cny - (10000 * 2 + 5000 * 0.04 + 1000 * 8) / 1e6) < 1e-12, 'official CNY');

// Missing cache bucket: unaccounted prompt tokens priced at cache-read rate, flagged ≈
const partial = {
  uncachedInputTokens: 10000, outputTokens: 1000, totalTokens: 16000,
  routes: [{ provider: 'deepseek-official', model: 'deepseek-flash' }],
};
const approx = computeTurnCost(partial, offPeakMs);
assert.equal(approx.approximate, true);
assert.equal(approx.parts.cacheRead, 5000);
assert.ok(Math.abs(approx.usd - (10000 * 0.15 + 5000 * 0.003 + 1000 * 0.60) / 1e6) < 1e-12);

// Anthropic: cache write priced separately, no peak tier
const anth = computeTurnCost({
  uncachedInputTokens: 10000, outputTokens: 1000, totalTokens: 14000,
  cacheReadTokens: 2000, cacheWriteTokens: 1000,
  routes: [{ provider: 'anthropic', model: 'claude-opus-4-5' }],
}, peakMs);
assert.ok(Math.abs(anth.usd - (10000 * 5 + 2000 * 0.50 + 1000 * 6.25 + 1000 * 25) / 1e6) < 1e-12);
assert.equal(anth.peak, undefined, 'no peak tier on Anthropic');
assert.equal(anth.cny, undefined, 'no official CNY rate');

// reasoningTokens is an output subset, must not double count
const withReasoning = computeTurnCost({ ...usage, reasoningTokens: 800 }, peakMs);
assert.ok(Math.abs(withReasoning.usd - peak.usd) < 1e-12);

// A provider-marked free model costs $0 and is flagged, not "unknown".
const free = computeTurnCost({ ...usage, routes: [{ provider: 'ai-router', model: 'hy4-flash' }] }, peakMs);
assert.equal(free.status, 'ok');
assert.equal(free.usd, 0);
assert.equal(free.free, true);

// A credit-billed model reports unknown with a reason, never $0.
const credit = computeTurnCost({ ...usage, routes: [{ provider: 'ai-router', model: 'hy4-preview' }] }, peakMs);
assert.equal(credit.status, 'unknown');
assert.equal(credit.unpriced, true);
assert.ok(credit.note.includes('credits'));

// Unknown model never silently costs zero
assert.equal(computeTurnCost({ ...usage, routes: [{ provider: 'x', model: 'mystery-1' }] }, peakMs).status, 'unknown');
assert.equal(computeTurnCost(undefined, peakMs).status, 'no-usage');
assert.equal(computeTurnCost({ outputTokens: 1 }, peakMs).status, 'no-route');

// Mixed routes are flagged
assert.deepEqual(computeTurnCost({
  ...usage,
  routes: [{ provider: 'deepseek', model: 'deepseek-flash' }, { provider: 'anthropic', model: 'claude-opus-4-5' }],
}, peakMs).mixedRoutes, ['deepseek-flash', 'claude-opus-4-5']);

assert.equal(formatUsd(0.0032), '$0.0032');
assert.equal(formatUsd(0.045), '$0.045');
assert.equal(formatUsd(0.0067), '$0.0067');
assert.equal(formatUsd(0.00001), '<$0.0001');

// ── display currency: CNY is the default, official rows win, USD-only vendors
// are converted (and flagged) so a converted number never poses as a list price.
assert.equal(formatUsd(12.3), '$12.30');
assert.equal(formatMoney(0.2031, 'CNY'), '¥0.2031');
assert.equal(formatMoney(0.0352, 'CNY'), '¥0.0352');
assert.equal(formatMoney(0.03527, 'CNY'), '¥0.0353');
assert.equal(formatMoney(12.3, 'CNY'), '¥12.30');
assert.equal(formatMoney(12, 'CNY'), '¥12.00');
assert.equal(formatMoney(0, 'CNY'), '¥0');
assert.equal(formatMoney(0.00001, 'CNY'), '<¥0.0001');
assert.equal(formatMoney(0.2031, 'USD'), '$0.2031');

// DeepSeek publishes an official CNY row: exact, never converted.
assert.ok(Math.abs(peak.amount - (10000 * 2 + 5000 * 0.04 + 1000 * 8) / 1e6) < 1e-12, 'CNY default is the official row');
assert.equal(peak.currency, 'CNY');
assert.equal(peak.fx, false);
assert.ok(Math.abs(peak.displayRates.input - 2) < 1e-12, 'rate rows follow the display currency');
const peakUsd = computeTurnCost(usage, peakMs, undefined, undefined, 'USD');
assert.equal(peakUsd.currency, 'USD');
assert.ok(Math.abs(peakUsd.amount - peakUsd.usd) < 1e-12);

// A USD-only vendor converts at the documented rate and says so.
const anthCny = computeTurnCost({
  uncachedInputTokens: 10000, outputTokens: 1000, totalTokens: 14000,
  cacheReadTokens: 2000, cacheWriteTokens: 1000,
  routes: [{ provider: 'anthropic', model: 'claude-opus-4-5' }],
}, peakMs, undefined, undefined, 'CNY');
assert.ok(Math.abs(anthCny.amount - anth.usd * USD_TO_CNY) < 1e-12, 'USD amount x FX');
assert.equal(anthCny.fx, true, 'converted amount is flagged');
assert.ok(Math.abs(anthCny.displayRates.input - 5 * USD_TO_CNY) < 1e-12, 'converted rate rows');

// A free model stays 0 in every currency and is never "converted".
const freeMoney = computeTurnCost({ ...usage, routes: [{ provider: 'ai-router', model: 'hy4-flash' }] }, peakMs, undefined, undefined, 'CNY');
assert.equal(freeMoney.amount, 0);
assert.equal(freeMoney.fx, false, 'a zero amount needs no conversion note');
assert.ok(Object.keys(OFFICIAL).length >= 20, 'official price rows present');
for (const key of ['deepseek-flash', 'deepseek-v4-pro', 'claude-opus-5-5', 'gpt-6.1-sol', 'gemini-4-carbon']) {
  assert.ok(OFFICIAL[key] !== undefined, `${key} must be priced`);
}

// Whole-session total: completed turns priced exactly, in-progress remainder
// priced at the session average rate so the number tracks a running turn too.
const t1 = { usage, time: peakMs };
const t2 = { usage: {
  uncachedInputTokens: 5000, outputTokens: 500, totalTokens: 8000,
  cacheReadTokens: 2500, cacheWriteTokens: 0,
  routes: [{ provider: 'deepseek-official', model: 'deepseek-flash' }],
}, time: offPeakMs };
const turns = [t1, t2];
const exactSum = computeTurnCost(t1.usage, t1.time).usd + computeTurnCost(t2.usage, t2.time).usd;
const cumulative = {
  uncachedInputTokens: 10000 + 5000, outputTokens: 1000 + 500,
  cacheReadTokens: 5000 + 2500, cacheWriteTokens: 0,
};
const exactTotal = computeSessionTotal(turns, cumulative, 'deepseek-flash', peakMs);
assert.equal(exactTotal.status, 'ok');
assert.equal(exactTotal.countedTurns, 2);
assert.equal(exactTotal.approximate, false);
assert.ok(Math.abs(exactTotal.usd - exactSum) < 1e-12, 'total equals the sum of turn badges');

// The same session in CNY sums the official CNY rows of both turns.
const cnyTurns = (10000 * 2 + 5000 * 0.04 + 1000 * 8) / 1e6
  + (5000 * 1 + 2500 * 0.02 + 500 * 4) / 1e6;
const exactCny = computeSessionTotal(turns, cumulative, 'deepseek-flash', peakMs, undefined, 'CNY');
assert.equal(exactCny.currency, 'CNY');
assert.equal(exactCny.fx, false);
assert.ok(Math.abs(exactCny.amount - cnyTurns) < 1e-12, 'CNY session total equals the CNY turn sum');
assert.ok(Math.abs(computeSessionTotal(turns, cumulative, 'deepseek-flash', peakMs, undefined, 'USD').amount - exactSum) < 1e-12);
// A mixed-vendor session flags the conversion so the panel can explain it.
const mixedVendor = computeSessionTotal([
  t1,
  { usage: { uncachedInputTokens: 10000, outputTokens: 1000, totalTokens: 14000,
    cacheReadTokens: 2000, cacheWriteTokens: 1000,
    routes: [{ provider: 'anthropic', model: 'claude-opus-4-5' }] }, time: peakMs },
], undefined, 'deepseek-flash', peakMs, undefined, 'CNY');
assert.equal(mixedVendor.fx, true, 'a USD-only turn marks the CNY total as converted');

const running = computeSessionTotal(turns, {
  uncachedInputTokens: 15000 + 3000, outputTokens: 1500 + 300,
  cacheReadTokens: 7500 + 1500, cacheWriteTokens: 0,
}, 'deepseek-flash', peakMs);
assert.equal(running.approximate, true, 'running remainder flagged ≈');
assert.ok(running.missingTokens > 0);
assert.ok(running.usd > exactTotal.usd, 'running total grows with the live turn');

const noTurns = computeSessionTotal([], cumulative, 'deepseek-flash', peakMs);
assert.equal(noTurns.status, 'ok');
assert.ok(noTurns.usd > 0, 'a running session with no completed turn still shows a total');
assert.equal(noTurns.approximate, true);
assert.equal(computeSessionTotal([], undefined, null, peakMs).status, 'empty');
assert.equal(computeSessionTotal([], cumulative, 'mystery-model', peakMs).status, 'unknown');
assert.equal(priceBuckets({ input: 1000, cacheRead: 0, cacheWrite: 0, output: 100 }, 'deepseek-flash', peakMs) > 0, true);

// A turn whose log omitted the provider/model route falls back to the session
// current model instead of becoming an unpriced "$0" hole.
const noRoute = { usage: {
  uncachedInputTokens: 10000, outputTokens: 1000, totalTokens: 16000,
  cacheReadTokens: 5000, cacheWriteTokens: 0,
}, time: peakMs };
assert.equal(computeTurnCost(noRoute.usage, peakMs).status, 'no-route');
const inferred = computeTurnCost(noRoute.usage, peakMs, 'deepseek-flash');
assert.equal(inferred.status, 'ok');
assert.equal(inferred.inferredModel, true);
assert.equal(inferred.approximate, true);
const sessionInferred = computeSessionTotal([noRoute], cumulative, 'deepseek-flash', peakMs);
assert.equal(sessionInferred.inferredTurns, 1);
assert.ok(sessionInferred.usd > 0, 'route-less turn is priced via the current model');

// Provider-marked free model: $0 with an explicit free flag, never "unknown".
const freeSession = computeSessionTotal([], cumulative, 'hy4-flash', peakMs);
assert.equal(freeSession.status, 'ok');
assert.equal(freeSession.usd, 0);
assert.equal(freeSession.free, true);

// Billing-tier preference: 'peak' / 'offPeak' override the time-of-day guess,
// 'auto' (undefined) keeps using `isPeak(time)`.
assert.ok(Math.abs(computeTurnCost(usage, offPeakMs, undefined, 'peak').usd - expectedPeak) < 1e-12);
assert.equal(computeTurnCost(usage, offPeakMs, undefined, 'peak').peak, true);
assert.ok(Math.abs(computeTurnCost(usage, peakMs, undefined, 'offPeak').usd - expectedPeak / 2) < 1e-12);
assert.equal(computeTurnCost(usage, peakMs, undefined, 'offPeak').peak, false);
assert.equal(computeTurnCost(usage, peakMs, undefined, 'auto').peak, true, 'auto defers to the clock');
// Vendors without time tiers ignore the preference entirely.
assert.ok(Math.abs(computeTurnCost({
  uncachedInputTokens: 10000, outputTokens: 1000, totalTokens: 14000,
  cacheReadTokens: 2000, cacheWriteTokens: 1000, routes: [{ provider: 'anthropic', model: 'claude-opus-4-5' }],
}, peakMs, undefined, 'offPeak').usd - anth.usd) < 1e-12);

// Exact session total from the Host request log (whole log, not a loaded page).
const requests = [
  { seq: 1, time: peakMs, turn: 1, step: 1, provider: 'deepseek-official', model: 'deepseek-flash',
    input: 10000, cacheRead: 5000, cacheWrite: 0, output: 1000, totalTokens: 16000 },
  { seq: 9, time: offPeakMs, turn: 2, step: 1, provider: 'deepseek-official', model: 'deepseek-flash',
    input: 5000, cacheRead: 2500, cacheWrite: 0, output: 500, totalTokens: 8000 },
];
const fromRequests = computeRequestsTotal(requests, undefined, 24000);
assert.equal(fromRequests.status, 'ok');
assert.equal(fromRequests.source, 'requests');
assert.equal(fromRequests.countedTurns, 2);
assert.equal(fromRequests.approximate, false, 'complete log is not approximate');
assert.ok(Math.abs(fromRequests.usd - exactSum) < 1e-12, 'request total equals per-turn sum');
assert.equal(fromRequests.cumulativeTokens, 24000);
const fromRequestsCny = computeRequestsTotal(requests, undefined, 24000, 'CNY');
assert.equal(fromRequestsCny.currency, 'CNY');
assert.ok(Math.abs(fromRequestsCny.amount - cnyTurns) < 1e-12, 'request total in CNY uses the official rows');
// A durable total larger than the folded requests leaves an unpriced remainder.
const withGap = computeRequestsTotal(requests, undefined, 30000);
assert.equal(withGap.missingTokens, 6000);
assert.equal(withGap.approximate, true);
// Unknown models are counted, never silently priced at 0.
const mixed = computeRequestsTotal([
  ...requests,
  { seq: 12, time: peakMs, turn: 3, step: 1, model: 'mystery-1', input: 1, cacheRead: 0, cacheWrite: 0, output: 1, totalTokens: 2 },
], undefined, 24002);
assert.equal(mixed.unknownTurns, 1);
assert.equal(mixed.approximate, true);
assert.ok(Math.abs(mixed.usd - exactSum) < 1e-12, 'priced rows still add up');
// Nothing priceable -> null so the caller can fall back to the turn-tail path.
assert.equal(computeRequestsTotal([], undefined, 0), null);
assert.equal(computeRequestsTotal(undefined, undefined, 0), null);
assert.equal(computeRequestsTotal([{ seq: 1, time: peakMs, model: 'mystery-1', totalTokens: 2 }], undefined, 2), null);

// ── per-turn request total: the source the turn badge uses, so the badge and
// the session pill price the same work the same way ──────────────────────────
const turnRows = [
  { seq: 1, time: peakMs, turn: 1, step: 1, provider: 'deepseek-official', model: 'deepseek-flash',
    input: 10000, cacheRead: 5000, cacheWrite: 0, output: 1000, totalTokens: 16000 },
  { seq: 2, time: peakMs, turn: 1, step: 2, provider: 'deepseek-official', model: 'deepseek-flash',
    input: 5000, cacheRead: 2500, cacheWrite: 0, output: 500, totalTokens: 8000 },
];
const secondUsd = (5000 * 0.30 + 2500 * 0.006 + 500 * 1.20) / 1e6;
const perTurn = computeTurnRequestsTotal(turnRows, 1, undefined, 'USD');
assert.equal(perTurn.status, 'ok');
assert.equal(perTurn.source, 'requests');
assert.equal(perTurn.approximate, false, 'a complete request log is exact');
assert.ok(Math.abs(perTurn.usd - (expectedPeak + secondUsd)) < 1e-12, 'turn total equals its requests');
assert.equal(perTurn.parts.input, 15000);
assert.equal(perTurn.parts.cacheRead, 7500);
assert.equal(perTurn.parts.cacheWrite, 0);
assert.equal(perTurn.parts.output, 1500);
assert.equal(perTurn.models.length, 1);
assert.ok(perTurn.displayRates !== undefined, 'one model + one tier keeps the rate rows');
const perTurnCny = computeTurnRequestsTotal(turnRows, 1, undefined, 'CNY');
assert.ok(Math.abs(perTurnCny.amount - ((10000 * 2 + 5000 * 0.04 + 1000 * 8) / 1e6
  + (5000 * 2 + 2500 * 0.04 + 500 * 8) / 1e6)) < 1e-12, 'turn total in the official CNY rows');

// The Host keeps only the newest 1200 requests: an under-covered turn defers to
// the aggregated tail instead of showing a silently low number.
assert.equal(computeTurnRequestsTotal(turnRows, 1, undefined, 'USD', 48000), null, 'truncated log');
assert.equal(computeTurnRequestsTotal(turnRows, 1, undefined, 'USD', 24000).status, 'ok', 'covered log');
// A turn whose rows are all unpriced cannot replace the tail result.
assert.equal(computeTurnRequestsTotal([
  { time: peakMs, turn: 4, model: 'hy4-preview', input: 1, output: 1, totalTokens: 2 },
], 4, undefined, 'USD'), null);
assert.equal(computeTurnRequestsTotal(turnRows, 9, undefined, 'USD'), null, 'no rows for that turn');
assert.equal(computeTurnRequestsTotal([], 1, undefined, 'USD'), null);

// Mixed models keep the summed money but drop the single rate row.
const mixedModels = computeTurnRequestsTotal([
  turnRows[0],
  { time: peakMs, turn: 1, step: 3, provider: 'anthropic', model: 'claude-opus-4-5',
    input: 1000, cacheRead: 0, cacheWrite: 0, output: 100, totalTokens: 1100 },
], 1, undefined, 'CNY');
assert.equal(mixedModels.status, 'ok');
assert.equal(mixedModels.displayRates, undefined, 'no single rate row for mixed models');
assert.equal(mixedModels.tierMixed, true);
assert.equal(mixedModels.models.length, 2);
assert.equal(mixedModels.fx, true, 'the USD-only row marks the CNY turn as converted');

// Mixed tiers (peak + off-peak inside one turn) sum both, no single rate row.
const mixedTiers = computeTurnRequestsTotal([turnRows[0], { ...turnRows[1], time: offPeakMs }], 1, undefined, 'USD');
assert.equal(mixedTiers.tierMixed, true);
assert.equal(mixedTiers.displayRates, undefined);
assert.ok(Math.abs(mixedTiers.usd - (expectedPeak + secondUsd / 2)) < 1e-12);

// Two gateway names for one model price exactly: no spurious `≈` / mixed note.
const twoNames = computeTurnCost({
  ...usage,
  routes: [
    { provider: 'deepseek-official', model: 'deepseek-flash' },
    { provider: 'ai-router', model: 'deepseek-v4.1-flash' },
  ],
}, peakMs);
assert.equal(twoNames.approximate, false, 'one price row means no approximation');
assert.equal(twoNames.mixedRoutes, undefined, 'one price row means no mixed-model note');
assert.ok(Math.abs(twoNames.usd - expectedPeak) < 1e-12);

// ── §1.5 preferences: a persisted external store with strict validation ──────
const prefStart = source.indexOf('    // §1.5 preferences');
const prefEnd = source.indexOf('    // ─────────────────────────────────────────────────────────────────────────\n    // §2 presentation');
assert.ok(prefStart !== -1 && prefEnd > prefStart, 'preference section markers must exist');
// The preference store validates against the pricing module's currency list,
// so splice in that (small) pure block before running the pref slice.
const currencyStart = source.indexOf('    /**\n     * Display currencies.');
const currencyEnd = source.indexOf('    /**\n     * Routes the provider itself lists as free');
assert.ok(currencyStart !== -1 && currencyEnd > currencyStart, 'currency block markers must exist');
const store = new Map();
const prefCtx = runInNewContext(
  `${source.slice(currencyStart, currencyEnd)}${source.slice(prefStart, prefEnd)}\n({ prefs, sanitizePrefs, PREF_DEFAULTS, PREF_KEY })`,
  { window: { localStorage: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
  } } },
);
const { prefs: prefStore, sanitizePrefs, PREF_DEFAULTS, PREF_KEY } = prefCtx;

assert.deepEqual({ ...PREF_DEFAULTS },
  { badge: true, pill: true, tier: 'auto', currency: 'CNY', budget: 0 }, 'defaults');
assert.deepEqual({ ...sanitizePrefs({ badge: 'yes', tier: 'bogus', extra: 1 }) },
  { badge: true, pill: true, tier: 'auto', currency: 'CNY', budget: 0 }, 'invalid input falls back to defaults');
assert.equal(sanitizePrefs({ tier: 'offPeak' }).tier, 'offPeak');
assert.equal(sanitizePrefs({ currency: 'USD' }).currency, 'USD');
assert.equal(sanitizePrefs({ currency: 'EUR' }).currency, 'CNY', 'an unknown currency falls back to CNY');
assert.equal(sanitizePrefs({ budget: 5 }).budget, 5, 'a positive budget is kept');
assert.equal(sanitizePrefs({ budget: -3 }).budget, 0, 'a negative budget means off');
assert.equal(sanitizePrefs({ budget: 'x' }).budget, 0, 'a non-numeric budget means off');
assert.equal(sanitizePrefs({ budget: 0.123 }).budget, 0.12, 'a budget keeps two decimals');
assert.equal(prefStore.getSnapshot().badge, true, 'starts from the stored (empty) value');

let notifications = 0;
const unsubscribe = prefStore.subscribe(() => { notifications += 1; });
prefStore.set({ badge: false });
assert.equal(prefStore.getSnapshot().badge, false);
assert.equal(notifications, 1, 'a real change notifies');
assert.deepEqual(JSON.parse(store.get(PREF_KEY)),
  { badge: false, pill: true, tier: 'auto', currency: 'CNY', budget: 0 }, 'persisted');
prefStore.set({ badge: false });
assert.equal(notifications, 1, 'a no-op set does not notify');
prefStore.set({ tier: 'peak' });
assert.equal(prefStore.getSnapshot().tier, 'peak');
prefStore.reset();
assert.deepEqual({ ...prefStore.getSnapshot() }, { ...PREF_DEFAULTS }, 'reset restores defaults');
unsubscribe();
prefStore.set({ pill: false });
assert.equal(notifications, 3, 'unsubscribed listener is not called');

console.log(`pricing.test.js: all assertions passed (${Object.keys(OFFICIAL).length} official price rows)`);
