/**
 * `tcSurface` — what the retained context is actually made of.
 *
 * DSH's own `contextBreakdown` projection answers *how big* the three buckets
 * are (system / tools / messages) but keeps no item detail: the system prompt
 * is a number, the tool schemas are a number, and every message is only a
 * delta. This projection keeps the item list for each of those buckets,
 * bounded:
 *
 * - `system`: the surviving system prompt, split into sections, each with its
 *   own heuristic price and a preview.
 * - `tools`: every tool definition of the latest request envelope with its own
 *   price, so an 86-tool header stops being one anonymous 17K.
 * - `kinds`: the surviving message nodes priced per kind (user input /
 *   assistant text / reasoning / tool arguments / tool results), maintained
 *   incrementally over surface appends and replacements.
 * - `top`: the heaviest surviving items, with a preview and their coordinates,
 *   so "what is actually filling the window" is answerable at a glance.
 *
 * Pricing uses the same fixed-density heuristic as DSH, imported from
 * `host/estimate.js` (one copy per side: the browser chunk keeps its own).
 * Pure folds: plain JSON in, plain JSON out, no DSH imports — this package is
 * a `link:` install, so Node cannot resolve the harness packages from the
 * profile's node_modules.
 */
import {
  estimateContent, estimateMessage, estimateSystemMessage, estimateToolsTokens,
  systemSectionsOf, systemTextOf, toolRowsOf, ROLE_OVERHEAD,
} from './estimate.js';
import { count } from './schema.js';

/** Priced nodes remembered for replacement arithmetic. */
const MAX_LEDGER = 1200;
/** Heaviest items kept for the "what fills the window" list. */
const MAX_TOP = 24;
/** `callId → tool name` memory used to label tool results. */
const MAX_CALLS = 400;
const PREVIEW = 140;

/** The message kinds the card reports, in display order. */
export const SURFACE_KINDS = ['user', 'assistant', 'reasoning', 'call', 'result', 'developer', 'other'];

function emptyKinds() {
  const kinds = {};
  for (const kind of SURFACE_KINDS) kinds[kind] = { count: 0, tokens: 0 };
  return kinds;
}

export function initSurface() {
  return {
    system: null, systemSeq: null, tools: null,
    kinds: emptyKinds(), tokens: 0,
    ledger: [], top: [], calls: {}, approximate: false,
    claim: null,
  };
}

/** A surface event carries an `append` marker or a `replace` range. */
function surfaceOpOf(event) {
  const op = event?.surfaceOp;
  if (op === undefined) return null;
  return op === 'append' ? 'append' : (op !== null && typeof op === 'object' ? op : null);
}

/** Split one assistant content-block list into per-kind prices. */
function assistantParts(blocks) {
  const parts = { assistant: 0, reasoning: 0, call: 0, other: 0 };
  if (!Array.isArray(blocks)) return parts;
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue;
    const price = estimateContent([block]);
    if (block.type === 'text') parts.assistant += price;
    else if (block.type === 'reasoning') parts.reasoning += price;
    else if (block.type === 'tool-call') parts.call += price;
    else parts.other += price;
  }
  // Role framing belongs to the message as a whole, so it rides the largest
  // bucket; the per-block sum plus this framing is the whole message's price.
  let owner = 'assistant';
  for (const kind of ['reasoning', 'call', 'other']) {
    if (parts[kind] > parts[owner]) owner = kind;
  }
  parts[owner] += ROLE_OVERHEAD;
  return parts;
}

/** One-line preview of a message's visible text, falling back to a block tag. */
function previewOf(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type === 'text' || block.type === 'reasoning') parts.push(String(block.text ?? ''));
    else if (block.type === 'tool-call') parts.push('→ ' + String(block.name ?? '') + ' ' + String(block.arguments ?? ''));
    else if (block.type === 'tool-result') parts.push(String(block.text ?? ''));
    else if (block.type === 'image') parts.push('[图片]');
  }
  const flat = parts.join(' ').replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW ? flat.slice(0, PREVIEW) + '…' : flat;
}

/** Tool name behind one result, from the `tool/call` memory (bounded). */
function toolNameOf(calls, callId) {
  const name = calls[String(callId ?? '')];
  return typeof name === 'string' && name !== '' ? name : 'tool';
}

/**
 * Price one surface event and classify it: either a system prompt (its own
 * bucket, with sections) or a message contributed to `kinds`.
 *
 * Shapes come from the session event map: `user/message` carries its message
 * fields inline, every other message-bearing event nests them under `message`.
 */
export function priceSurfaceEvent(type, data, calls) {
  if (type === 'system/message') {
    const text = systemTextOf(data?.message);
    return {
      system: {
        chars: text.length,
        tokens: estimateSystemMessage(data?.message),
        sections: systemSectionsOf(text),
      },
    };
  }
  // `label` carries only proper nouns (a tool name, a kind id): the card
  // localises around it, so no display copy lives on the Host side.
  if (type === 'developer/message') {
    return { parts: { developer: estimateMessage(data?.message) }, kind: 'developer', label: '', preview: previewOf(data?.message) };
  }
  if (type === 'user/message') {
    return { parts: { user: estimateMessage(data) }, kind: 'user', label: '', preview: previewOf(data) };
  }
  if (type === 'assistant/message') {
    if (data?.message === undefined || data?.message === null) return { parts: {} };
    const parts = assistantParts(data.message.content);
    let kind = 'assistant';
    for (const candidate of ['reasoning', 'call', 'other']) {
      if ((parts[candidate] ?? 0) > (parts[kind] ?? 0)) kind = candidate;
    }
    return { parts, kind, label: '', preview: previewOf(data.message) };
  }
  if (type === 'tool/result') {
    const message = data?.message;
    const name = toolNameOf(calls, message?.toolCallId ?? message?.source?.callId);
    return { parts: { result: estimateMessage(message) }, kind: 'result', label: name, preview: previewOf(message) };
  }
  return { parts: { other: estimateMessage(data?.message) }, kind: 'other', label: type, preview: previewOf(data?.message) };
}

/** Add (`sign` +1) or subtract (`sign` -1) one priced node's parts. */
function bump(kinds, parts, sign) {
  const next = {};
  let tokens = 0;
  for (const kind of SURFACE_KINDS) {
    const before = kinds[kind] ?? { count: 0, tokens: 0 };
    const delta = count(parts?.[kind]);
    next[kind] = {
      count: Math.max(0, before.count + (delta > 0 ? sign : 0)),
      tokens: Math.max(0, before.tokens + sign * delta),
    };
    tokens += next[kind].tokens;
  }
  return { kinds: next, tokens };
}

/** Total price of one priced node, for the replacement ledger. */
function partsTotal(parts) {
  let total = 0;
  for (const kind of Object.keys(parts ?? {})) total += count(parts[kind]);
  return total;
}

/**
 * Retract a price whose nodes are no longer in the ledger: the tokens left the
 * surface but their kinds are unknown, so take them from the largest buckets
 * first, and take node counts in proportion to the tokens withdrawn. The
 * totals stay honest (the window really did get smaller); only the split
 * becomes approximate, which the caller flags.
 */
function retract(kinds, amount, nodes) {
  let left = count(amount);
  let nodeBudget = count(nodes);
  const next = { ...kinds };
  const order = [...SURFACE_KINDS].sort((a, b) => count(next[b]?.tokens) - count(next[a]?.tokens));
  for (const kind of order) {
    if (left <= 0) break;
    const before = next[kind] ?? { count: 0, tokens: 0 };
    if (before.tokens <= 0) continue;
    const take = Math.min(before.tokens, left);
    const share = take / before.tokens;
    const dropNodes = Math.min(before.count, nodeBudget, Math.max(take > 0 ? 1 : 0, Math.round(before.count * share)));
    next[kind] = { count: before.count - dropNodes, tokens: before.tokens - take };
    left -= take;
    nodeBudget -= dropNodes;
  }
  let tokens = 0;
  for (const kind of SURFACE_KINDS) tokens += count(next[kind]?.tokens);
  return { kinds: next, tokens };
}

/** A priced node as the ledger remembers it: sequence + price per kind. */
function ledgerRow(seq, parts) {
  const kept = {};
  for (const kind of SURFACE_KINDS) {
    const value = count(parts?.[kind]);
    if (value > 0) kept[kind] = value;
  }
  return { seq, parts: kept, tokens: partsTotal(parts) };
}

/** Keep the heaviest `MAX_TOP` items, newest first on ties. */
function withTop(top, entry) {
  const next = [...top, entry].sort((a, b) => b.tokens - a.tokens).slice(0, MAX_TOP);
  return next;
}

/**
 * Fold one event onto the surface-composition state.
 *
 * Replacement arithmetic needs each shadowed node's price, so appended nodes
 * leave a `{seq, parts, tokens}` row in a bounded ledger. A range that shadows
 * nodes already trimmed out of the ledger keeps the total honest via the
 * compaction's own shadow price and flags `approximate`, which the card shows
 * instead of pretending the split is exact.
 */
export function applySurface(state, event) {
  const type = event?.type;

  // Remember tool names so a later result can be labelled by its tool.
  if (type === 'tool/call') {
    const callId = String(event?.data?.callId ?? '');
    const name = String(event?.data?.name ?? '');
    if (callId === '' || name === '') return { ...state, claim: null };
    const calls = { ...(state.calls ?? {}) };
    calls[callId] = name;
    const keys = Object.keys(calls);
    if (keys.length > MAX_CALLS) for (const key of keys.slice(0, keys.length - MAX_CALLS)) delete calls[key];
    return { ...state, claim: null, calls };
  }

  // A compaction arms the shadow price its immediately following replacement
  // consumes — the same protocol the harness' own metering uses.
  if (type === 'compaction/summary' || type === 'compaction/prune') {
    const range = event?.data?.shadowedRange;
    if (range === undefined || range === null) return { ...state, claim: null };
    return {
      ...state,
      claim: {
        start: count(range.start) || range.start,
        end: count(range.end) || range.end,
        tokens: count(event?.data?.shadowedTokenCount),
        seqs: Array.isArray(event?.data?.shadowedSeqs) ? event.data.shadowedSeqs : [],
      },
    };
  }

  // Tool schemas: the latest request envelope is the one the next request pays.
  if (type === 'request/header') {
    const header = event?.data?.header;
    const rows = toolRowsOf(header);
    const total = estimateToolsTokens(header);
    const tools = total === 0 && rows.length === 0
      ? null
      : { seq: count(event?.seq), time: count(event?.time), total, rows };
    return { ...state, claim: null, tools };
  }

  const op = surfaceOpOf(event);
  if (op === null) return state.claim === null ? state : { ...state, claim: null };
  const isAppend = op === 'append';

  const start = isAppend ? 0 : (count(op.startSeq) || op.startSeq);
  const end = isAppend ? 0 : (count(op.endSeq) || op.endSeq);
  const seq = count(event?.seq) || (Number.isFinite(event?.seq) ? event.seq : 0);
  const priced = priceSurfaceEvent(type, event?.data, state.calls ?? {});

  let kinds = state.kinds ?? emptyKinds();
  let tokens = count(state.tokens);
  let ledger = state.ledger ?? [];
  let top = state.top ?? [];
  let approximate = state.approximate === true;
  let system = state.system ?? null;
  let systemSeq = state.systemSeq ?? null;

  // ── replacement: retract what the shadowed range had contributed ──────────
  if (!isAppend) {
    const kept = [];
    for (const row of ledger) {
      if (row.seq >= start && row.seq <= end) {
        const after = bump(kinds, row.parts, -1);
        kinds = after.kinds;
        tokens = after.tokens;
        continue;
      }
      kept.push(row);
    }
    const matched = ledger.length - kept.length;
    ledger = kept;
    top = top.filter(entry => entry.seq < start || entry.seq > end);
    if (matched === 0) {
      // No ledger row matched. Two cases: the range held only nodes this
      // projection does not meter (a system-prompt rewrite), or its rows were
      // trimmed away. A metered claim proves the second: subtract its shadow
      // price from the largest buckets so the total does not silently keep
      // deleted text, and mark the split inexact.
      const claim = state.claim;
      const shadowed = claim !== null && claim !== undefined && claim.start === start && claim.end === end
        ? count(claim.tokens) : 0;
      if (shadowed > 0) {
        const claimNodes = Array.isArray(claim.seqs) && claim.seqs.length > 0 ? claim.seqs.length : 1;
        const after = retract(kinds, shadowed, claimNodes);
        kinds = after.kinds;
        tokens = after.tokens;
        approximate = true;
      }
    }
    // A range covering the system node leaves no system prompt behind unless
    // the replacement is itself a system message.
    if (systemSeq !== null && systemSeq >= start && systemSeq <= end && type !== 'system/message') {
      system = null;
      systemSeq = null;
    }
  }

  // ── the event's own contribution ──────────────────────────────────────────
  if (priced.system !== undefined) {
    system = { ...priced.system, seq, time: count(event?.time) };
    systemSeq = seq;
  } else {
    const after = bump(kinds, priced.parts ?? {}, +1);
    kinds = after.kinds;
    tokens = after.tokens;
    ledger = [...ledger, ledgerRow(seq, priced.parts)];
    if (ledger.length > MAX_LEDGER) ledger = ledger.slice(ledger.length - MAX_LEDGER);
    const price = partsTotal(priced.parts);
    if (price > 0) {
      const data = event?.data ?? {};
      top = withTop(top, {
        seq, time: count(event?.time),
        turn: count(data.turn) || null, step: count(data.step) || null,
        kind: priced.kind ?? 'other', label: priced.label ?? '',
        tokens: price, preview: priced.preview ?? '',
      });
    }
  }

  return { ...state, claim: null, kinds, tokens, ledger, top, approximate, system, systemSeq };
}

export function viewSurface(state) {
  return {
    system: state.system ?? null,
    tools: state.tools ?? null,
    kinds: state.kinds ?? emptyKinds(),
    tokens: count(state.tokens),
    top: state.top ?? [],
    approximate: state.approximate === true,
  };
}
