/**
 * Minimal projection schema shim.
 *
 * `sessionProjections` only ever calls `.parse(value)` on `stateSchema` and
 * `wire.viewSchema` (dsh-session-projection/src/index.ts:216-220, 676, 680,
 * 738, 750, 927, 954). We own every value we write, so an identity schema is
 * enough and avoids a runtime `zod` dependency (this package is a `link:`
 * install, so Node cannot resolve `zod` from the profile's node_modules).
 */
export const identitySchema = { parse: (value) => value };

/** A non-negative safe integer, or 0 for missing/invalid values. */
export function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Chinese public holidays in the Beijing calendar (`YYYY-MM-DD`). Mirrors
 * `client.js#HOLIDAYS_UTC8`: the Host half and the Client half cannot share a
 * module (browser window module vs. Node), so both copies must be edited
 * together. Empty means "no holiday data", i.e. the weekday rule only.
 */
export const BEIJING_HOLIDAYS = [];

/**
 * DeepSeek peak-window test: Beijing Mon–Fri 09:00–12:00 and 14:00–18:00,
 * public holidays excluded; every other hour bills at the off-peak half price.
 *
 * The activity projection has to store the tier split itself: its buckets are
 * aggregated per day, so the Client can no longer derive the tier from a
 * request timestamp the way `tcTimeline` rows do. Mirrors `client.js#isPeak`.
 *
 * @param {number} ms epoch milliseconds
 * @returns {boolean}
 */
export function isPeakBeijing(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const bj = new Date(ms + 8 * 3600 * 1000);
  const day = bj.getUTCDay();                    // 0=Sun .. 6=Sat
  if (day === 0 || day === 6) return false;
  if (BEIJING_HOLIDAYS.indexOf(bj.toISOString().slice(0, 10)) !== -1) return false;
  const hour = bj.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** Beijing (UTC+8) calendar day, `YYYY-MM-DD`. */
export function beijingDay(ms) {
  const d = new Date(ms + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Best-effort turn/step coordinates from any durable event. */
export function coordinates(event) {
  const d = event && event.data;
  if (d === undefined || d === null || typeof d !== 'object') return null;
  const turn = count(d.turn) || (Number.isFinite(d.turn) ? d.turn : null);
  const step = count(d.step) || (Number.isFinite(d.step) ? d.step : null);
  return turn === null ? null : { turn, step: step ?? 0 };
}
