/**
 * Turn one `/v1/models` row into the DSH model entry it should produce.
 *
 * Responsibility: the capability half of a `llm-pi-ai` `models` entry — display
 * name, input modalities, capacities, thinking levels and the two pi-ai compat
 * switches anthropic-messages gateways need. Not responsible: fetching,
 * comparing against what is stored, writing settings.
 *
 * Two rules keep this safe to run unattended:
 *   - **Never invent a capability.** A row that states no `input` keeps the
 *     entry's existing modalities; a row that states no reasoning levels keeps
 *     the existing levels. Declaring `image` for a text-only model fails after
 *     the message is durable; declaring `text` for a vision model silently drops
 *     attachments. Unknown stays unknown.
 *   - **A hand-tuned `reasoningEfforts` block is the user's.** If the stored
 *     block does not look like the one generated here (extra keys, wire values
 *     that differ from the level), both `reasoningEfforts` and `compat` are left
 *     exactly as they are; only the other generated fields refresh.
 */

import { displayName, nameOk, positiveInt } from './naming.js';

/** pi-ai modalities (llm-pi-ai's schema accepts exactly these two). */
export const MODALITIES = Object.freeze(['text', 'image']);

/** Canonical thinking levels, weakest first; matches the router's own vocabulary. */
export const REASONING_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/** compat switches this sync owns (anthropic-messages gateways only). */
export const GENERATED_COMPAT = Object.freeze({
  // Send `output_config.effort` instead of a budget-token conversion, so a level
  // is not truncated into its neighbour.
  forceAdaptiveThinking: true,
  // Gateway-returned thinking blocks carry no Anthropic signature.
  allowEmptySignature: true,
});

const OWNED_FIELDS = new Set(['id', 'name', 'input', 'contextWindow', 'maxTokens', 'reasoningEfforts', 'compat']);

/**
 * The row's input modalities, in pi-ai's vocabulary.
 * @param row - listing row.
 * @returns `['text','image']`-style list, or `undefined` when the row is silent
 *   (unknown, not "text only").
 */
export function modalitiesOf(row) {
  const raw = (row ?? {}).input;
  if (!Array.isArray(raw)) return undefined;
  const picked = MODALITIES.filter((modality) => raw.includes(modality));
  return picked.length === 0 ? undefined : picked;
}

/**
 * The row's declared thinking levels, canonicalised and ordered.
 * @param row - listing row.
 * @returns level list, or `undefined` when the row states none.
 */
export function reasoningLevelsOf(row) {
  const reasoning = (row ?? {}).reasoning;
  if (reasoning === null || typeof reasoning !== 'object' || !Array.isArray(reasoning.levels)) return undefined;
  const levels = REASONING_LEVELS.filter((level) => reasoning.levels.includes(level));
  return levels.length === 0 ? undefined : levels;
}

/**
 * Whether a stored `reasoningEfforts` block was produced by this module.
 * @param value - stored entry field.
 * @returns `true` for absent, or for `off: null` plus `level: level` pairs with
 *   no foreign keys and at least one non-`off` level.
 */
export function isGeneratedReasoning(value) {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const pairs = Object.entries(value);
  if (pairs.length === 0) return true;
  for (const [level, wire] of pairs) {
    if (!REASONING_LEVELS.includes(level)) return false;
    if (wire === null || wire === '') {
      if (level !== 'off') return false;
      continue;
    }
    if (wire !== level) return false;
  }
  return pairs.some(([level]) => level !== 'off');
}

/** `reasoningEfforts` value for one level: `off` is expressed as `null`. */
function wireOf(level) {
  return level === 'off' ? null : level;
}

/**
 * Apply levels plus the two compat switches to an entry under construction.
 * @param target - object being built (mutated).
 * @param levels - canonical levels from the row.
 * @param existing - stored entry, for the user's own compat switches.
 */
function applyReasoning(target, levels, existing) {
  if (levels === undefined) return;
  const active = levels.filter((level) => level !== 'off');
  if (active.length === 0) {
    // A model that cannot think has no block to configure.
    delete target.reasoningEfforts;
    applyCompat(target, false, existing);
    return;
  }
  target.reasoningEfforts = Object.fromEntries(levels.map((level) => [level, wireOf(level)]));
  applyCompat(target, true, existing);
}

/**
 * Add or remove this sync's compat switches, keeping the user's other switches.
 * @param target - object being built (mutated).
 * @param want - whether the model can think at all.
 * @param existing - stored entry.
 */
function applyCompat(target, want, existing) {
  const current = existing?.compat;
  if (current !== undefined && (current === null || typeof current !== 'object' || Array.isArray(current))) {
    // A scalar `compat` (whole-protocol shorthand) is not this module's shape.
    delete target.compat;
    return;
  }
  const next = { ...(current ?? {}) };
  for (const key of Object.keys(GENERATED_COMPAT)) if (!want) delete next[key];
  if (want) Object.assign(next, GENERATED_COMPAT);
  if (Object.keys(next).length === 0) delete target.compat;
  else target.compat = next;
}

/**
 * Build one `models` entry from a listing row.
 * @param id - model id the endpoint accepts.
 * @param row - that row of the `/v1/models` reply.
 * @param existing - the stored entry of the same id, if any; fields this module
 *   does not own survive untouched.
 * @returns the entry to store, with owned fields first in canonical order.
 */
export function buildEntry(id, row, existing) {
  const entry = { id, name: displayName(id, row) };
  const modalities = modalitiesOf(row);
  if (modalities !== undefined) entry.input = [...modalities];
  else if (Array.isArray(existing?.input) && existing.input.length > 0) entry.input = [...existing.input];
  const context = positiveInt((row ?? {}).context_window ?? (row ?? {}).contextWindow);
  if (context !== undefined) entry.contextWindow = context;
  else if (positiveInt(existing?.contextWindow) !== undefined) entry.contextWindow = positiveInt(existing.contextWindow);
  const maxTokens = positiveInt((row ?? {}).max_tokens ?? (row ?? {}).maxTokens);
  if (maxTokens !== undefined) entry.maxTokens = maxTokens;
  else if (positiveInt(existing?.maxTokens) !== undefined) entry.maxTokens = positiveInt(existing.maxTokens);
  const levels = reasoningLevelsOf(row);
  if (levels !== undefined && isGeneratedReasoning(existing?.reasoningEfforts)) {
    applyReasoning(entry, levels, existing);
  } else {
    if (existing?.reasoningEfforts !== undefined) entry.reasoningEfforts = existing.reasoningEfforts;
    if (existing?.compat !== undefined) entry.compat = existing.compat;
  }
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (OWNED_FIELDS.has(key) || value === undefined) continue;
    entry[key] = value;
  }
  return entry;
}

/**
 * The billing source the gateway states for one row, or `undefined` when it says
 * nothing.
 *
 * `/v1/models` rows carry `quota: {source, basis, backends}` (`ai-shim`'s
 * `router/quota_source.py`), which is the machine-readable answer to "whose
 * subscription pays for this model". A DSH model entry cannot carry it — the
 * pi-ai schema owns that shape — so it is lifted out here and served beside the
 * catalog on the Host's own route, keyed by model id.
 *
 * `null` is a settled answer, not a missing one: the gateway looked at the row's
 * backends and no allowance can be read (`mixed` — two different plans could pay,
 * or a backend with no quota API). The Client renders「此供应商无额度可查」from it
 * instead of guessing from a display name.
 *
 * @param row - one listing row.
 * @returns a source id, `null` (settled "no readable allowance"), or `undefined`
 *   (the gateway did not say — an older build, or a plain OpenAI endpoint).
 */
export function quotaSourceOf(row) {
  const quota = row?.quota;
  if (quota === null || typeof quota !== 'object') return undefined;
  const source = quota.source;
  if (typeof source === 'string' && source !== '') return source;
  return null;
}

/**
 * Build the whole `models` list, in the endpoint's own order.
 * @param rows - listing rows (`{id, row}`), already de-duplicated.
 * @param stored - stored entries keyed by id.
 * @returns `{ entries, invalid, quotaSources }` — `invalid` names the ids whose
 *   generated name left the naming contract, so the caller can refuse to write
 *   the listing; `quotaSources` maps model id → the source the gateway stated
 *   (only ids the gateway actually classified appear).
 */
export function buildCatalog(rows, stored = new Map()) {
  const entries = [];
  const invalid = [];
  const quotaSources = {};
  for (const { id, row } of rows) {
    const entry = buildEntry(id, row, stored.get(id));
    if (!nameOk(entry.name)) invalid.push({ id, name: entry.name });
    entries.push(entry);
    const source = quotaSourceOf(row);
    if (source !== undefined) quotaSources[id] = source;
  }
  return { entries, invalid, quotaSources };
}
