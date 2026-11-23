/**
 * DSH display-name semantics for a router `/v1/models` row.
 *
 * Responsibility: turn one listing row's platform (`backends`), billing tier and
 * capacity into the exact `name` string the DSH model picker shows, idempotently.
 * Not responsible: fetching, YAML/settings writing, capability fields.
 *
 * The name is a generated field with two writers in a DSH profile (this sync and
 * the settings page, which writes the upstream `name` back). So it must be
 * idempotent: `_stripGenerated` removes a prefix/tail this module itself emitted
 * before re-emitting it, otherwise a re-run stacks
 * `WorkBuddy · 付费 · WorkBuddy · 付费 · Hy4`.
 *
 * Contract: `<平台> · <计费> · <名字>[ · <窗口>]` for a single-platform row, or
 * `<名字> · <计费>自动降级[ · <窗口>]` for a row that fails over between
 * providers (`source_type: equiv`) — a drifting platform name would be a lie.
 * {@link nameOk} gates a whole listing before anything is written: a row missing
 * `backends`/`billing` (cold router) degrades to a plain model name, which the
 * gate accepts, while a legacy marker (` · Trae`) is refused so one GUI never
 * shows two naming styles.
 */

/** router `backends` id → platform label shown in the picker. */
export const PLATFORM_LABELS = Object.freeze({
  trae: 'Trae',
  'oc-zen': 'OpenCode Zen',
  'oc-go': 'OpenCode Go',
  openrouter: 'OpenRouter',
  siliconflow: 'SiliconFlow',
  inferencenet: 'Inference.net',
  chutes: 'Chutes',
  pollinations: 'Pollinations',
  gemini: 'Gemini',
  workbuddy: 'WorkBuddy',
  nvidia: 'NVIDIA NIM',
  mistral: 'Mistral',
  'github-models': 'GitHub Models',
  github_models: 'GitHub Models',
});

/** router `billing` tier → the label the settings surface shows. */
export const BILLING_LABELS = Object.freeze({
  free: '免费',
  free_pool: '免费池',
  mixed: '免费+付费',
  paid: '付费',
});

/** Legacy markers the router once appended to its own `name`; re-expressed here. */
const ROUTER_MARKERS = Object.freeze([' · Trae', ' · 付费源待命']);

/** Billing tiers whose label already means "free", so a `-free` tail is redundant. */
const FREE_BILLING_LABELS = new Set(['免费', '免费池']);
const FREE_SUFFIX = /^(?<base>.+?)[-_:.]free$/iu;

/** A listing row's positive integer field, or `undefined`. */
export function positiveInt(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && Number.isInteger(number) && number > 0 ? number : undefined;
}

/** Compact window spelling: `1000000 → 1M`, `960000 → 960K`, unset → `''`. */
export function fmtWindow(tokens) {
  const number = positiveInt(tokens);
  if (number === undefined) return '';
  if (number >= 1_000_000) {
    const million = number / 1_000_000;
    return Math.abs(million - Math.round(million)) < 0.005
      ? `${String(Math.round(million))}M`
      : `${million.toPrecision(2)}M`;
  }
  return `${String(Math.round(number / 1000))}K`;
}

/** Strip a redundant `-free` tail: "免费" is stated once, by the billing label. */
function stripFreeSuffix(base) {
  const match = FREE_SUFFIX.exec(base ?? '');
  return match === null ? base : match.groups.base;
}

/**
 * Whether a generated name is inside the contract.
 * @param name - candidate display name.
 * @returns `false` only for a legacy router marker; everything else is accepted,
 *   including the degraded plain-model-name form a cold router produces.
 */
export function nameOk(name) {
  const text = String(name ?? '');
  return !ROUTER_MARKERS.some((marker) => text.includes(marker));
}

/** Remove a prefix/tail this module previously emitted, so a re-run is a no-op. */
function stripGenerated(base, labels, billingLabel, window) {
  let text = base;
  for (const label of labels) {
    const prefix = `${label} · `;
    if (text.startsWith(prefix)) { text = text.slice(prefix.length); break; }
  }
  if (billingLabel !== '') {
    const prefix = `${billingLabel} · `;
    if (text.startsWith(prefix)) text = text.slice(prefix.length);
    if (FREE_BILLING_LABELS.has(billingLabel)) text = stripFreeSuffix(text);
  }
  if (window !== '' && text.endsWith(` · ${window}`)) text = text.slice(0, -window.length - 3).trimEnd();
  return text;
}

/**
 * Build the display name for one listing row.
 * @param id - model id the endpoint accepts.
 * @param row - that row of the `/v1/models` reply.
 * @returns the picker label: three segments for a direct row, two for a
 *   failover row, and the bare model name when the row states no platform.
 */
export function displayName(id, row) {
  const entry = row ?? {};
  let base = String(entry.name ?? '').trim() || id;
  const window = fmtWindow(entry.context_window ?? entry.contextWindow);
  for (const marker of ROUTER_MARKERS) {
    while (base.endsWith(marker)) base = base.slice(0, -marker.length).trimEnd();
  }
  const labels = [];
  for (const backend of Array.isArray(entry.backends) ? entry.backends : []) {
    const label = PLATFORM_LABELS[String(backend)] ?? String(backend);
    if (label !== '' && !labels.includes(label)) labels.push(label);
  }
  const billing = typeof entry.billing === 'string' ? entry.billing.trim().toLowerCase() : '';
  const billingLabel = billing === '' ? '' : (BILLING_LABELS[billing] ?? BILLING_LABELS.paid);
  base = stripGenerated(base, labels, billingLabel, window);
  if (FREE_BILLING_LABELS.has(billingLabel)) base = stripFreeSuffix(base);
  if (base === '') base = id;

  if (String(entry.source_type ?? '') === 'equiv') {
    const failover = billingLabel === '' ? '自动降级' : `${billingLabel}自动降级`;
    return [...[base, failover], ...(window === '' ? [] : [window])].join(' · ');
  }
  if (labels.length === 0) {
    // No platform: a bare model name beats half a format, which would read as
    // inconsistent next to fully labelled rows.
    return base;
  }
  const parts = [labels.join('/')];
  if (billingLabel !== '') parts.push(billingLabel);
  parts.push(base);
  if (window !== '') parts.push(window);
  return parts.join(' · ');
}
