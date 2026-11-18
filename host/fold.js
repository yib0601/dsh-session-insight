/**
 * Pure folds behind the three `tc*` session projections.
 * No DSH imports: plain JSON state in, plain JSON state out.
 */
import { count, beijingDay, coordinates, isPeakBeijing } from './schema.js';

// 1200 requests covers essentially every real session; the client scales any
// remainder proportionally, so a longer log only loses per-request precision.
const MAX_REQUESTS = 1200;
const MAX_EVENTS = 800;
const MAX_HEADERS = 300;
const MAX_DAYS = 400;
// Command / file-op ledgers are bounded so a long session cannot grow the
// projection state without limit; the newest entries win.
const MAX_COMMANDS = 400;
const MAX_FILE_OPS = 400;
const MAX_TOOL_NAMES = 24;

function bucketsOf(usage) {
  return {
    input: count(usage?.inputTokens ?? usage?.uncachedInputTokens),
    cacheRead: count(usage?.cacheReadTokens),
    cacheWrite: count(usage?.cacheWriteTokens),
    output: count(usage?.outputTokens),
  };
}

function addBuckets(a, b) {
  return {
    input: a.input + b.input, cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite, output: a.output + b.output,
  };
}

const emptyBuckets = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });

/** Usage embedded in an assistant settlement (event.data.usage or stream chunk). */
function usageOf(event) {
  const data = event?.data;
  if (data === undefined || data === null) return undefined;
  if (data.usage !== undefined && data.usage !== null) return data.usage;
  const stream = data.stream;
  if (!Array.isArray(stream)) return undefined;
  let last;
  for (const record of stream) {
    const chunk = record?.chunk ?? record;
    if (chunk?.type === 'usage' && chunk.usage) last = chunk.usage;
  }
  return last;
}

function modelOf(event) {
  const data = event?.data;
  const config = data?.header?.config ?? data?.header ?? data;
  const provider = config?.provider ?? data?.provider ?? '';
  const model = config?.model ?? data?.model ?? '';
  return { provider: String(provider), model: String(model) };
}

function contextWindowOf(event) {
  const data = event?.data ?? {};
  const n = data.contextWindow ?? data.header?.config?.contextWindow;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

// ── tcTimeline ────────────────────────────────────────────────────────────────

export function initTimeline() {
  return {
    requests: [], events: [], files: {},
    commands: [], fileOps: [], toolCalls: {},
    counts: { user: 0, answers: 0, skills: 0 },
    last: null, current: { provider: '', model: '' },
  };
}

/** Parse a tool's JSON arguments once; `undefined` when they are not JSON. */
function argsOf(argumentsText) {
  if (typeof argumentsText !== 'string' || argumentsText === '') return undefined;
  try {
    const args = JSON.parse(argumentsText);
    return args !== null && typeof args === 'object' ? args : undefined;
  } catch { return undefined; }
}

/** Tools that execute a shell command / code, i.e. the "command executions". */
const COMMAND_TOOLS = new Set(['bash', 'bash-local', 'bash_local', 'terminal', 'run_code', 'execute', 'shell']);

/** Prefixes that wrap the real program (`sudo`, `env FOO=1`, `time`, `nohup`). */
const COMMAND_WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'command', 'exec', 'builtin']);

/**
 * Program name behind a shell command: the first meaningful token of its first
 * line, path- and punctuation-stripped. Wrappers that only set up the real
 * command (`sudo`, `env`, `FOO=1`, `cd dir &&`) are skipped, so a harness that
 * always starts with `cd <workspace> &&` still reports the real program.
 *
 * `pwd; ls -la` → `pwd` · `cd /repo && npm test` → `npm` · `sudo env A=1 git status` → `git`
 */
function programOf(command) {
  if (typeof command !== 'string' || command.trim() === '') return '';
  const firstLine = command.trim().split('\n')[0];
  const tokens = firstLine.split(/\s+/);
  const clean = token => token.replace(/^[("'`]+|[);&|"'`]+$/g, '');
  for (let index = 0; index < tokens.length; index += 1) {
    const token = clean(tokens[index]);
    if (token === '') continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;      // FOO=bar
    if (COMMAND_WRAPPERS.has(token)) continue;
    if (token.startsWith('-')) continue;                        // stray flag
    if (token === 'cd' || token === 'pushd') { index += 1; continue; }   // directory setup
    return token.split('/').pop() || token;
  }
  return '';
}

/** One-line, length-capped command summary for the ledger. */
function summaryOf(command) {
  if (typeof command !== 'string') return '';
  const one = command.trim().split('\n')[0].trim();
  return one.length > 96 ? one.slice(0, 96) + '…' : one;
}

/** Lines in a text blob; an empty string is zero lines, not one. */
function lineCount(text) {
  return typeof text === 'string' && text !== '' ? text.split('\n').length : 0;
}

/** Line delta implied by a file-writing tool call; `undefined` when unknown. */
function lineDeltaOf(name, args, patchInput) {
  if (name === 'edit' || name === 'str_replace_editor') {
    return {
      added: lineCount(args?.new_string ?? args?.newText),
      removed: lineCount(args?.old_string ?? args?.oldText),
    };
  }
  if (name === 'write') {
    return { added: lineCount(args?.content ?? args?.file_text), removed: 0 };
  }
  if (name === 'apply_patch') {
    const input = typeof patchInput === 'string' ? patchInput : '';
    let added = 0, removed = 0;
    for (const line of input.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) added += 1;
      else if (line.startsWith('-')) removed += 1;
    }
    return { added, removed };
  }
  return undefined;
}

/** Tools whose call carries a file path, and the activity kind each implies. */
const FILE_TOOLS = {
  read: 'read', read_image: 'read', write: 'write', edit: 'edit',
  str_replace_editor: 'edit', glob: 'search', grep: 'search',
};

/** `apply_patch` names its targets inside the patch text, not in a JSON field. */
const PATCH_PATH = /^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm;

/** Every file path an `apply_patch` input touches. */
function patchPaths(input) {
  if (typeof input !== 'string' || input === '') return [];
  const paths = [];
  for (const match of input.matchAll(PATCH_PATH)) {
    const path = (match[1] ?? match[2] ?? '').trim();
    if (path !== '' && !paths.includes(path)) paths.push(path);
  }
  return paths.slice(0, 24);
}

/** Best-effort path out of one tool's JSON arguments. */
function pathOf(argumentsText) {
  if (typeof argumentsText !== 'string' || argumentsText === '') return undefined;
  let args;
  try { args = JSON.parse(argumentsText); } catch { return undefined; }
  if (args === null || typeof args !== 'object') return undefined;
  for (const key of ['file_path', 'path', 'filePath', 'filename', 'notebook_path', 'target_file']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  for (const key of ['pattern', 'directory', 'glob', 'dir']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

/** Fold one file-touching tool call into `files`, bounded by count. */
function foldFile(state, event) {
  const data = event?.data ?? {};
  const time = count(event.time);

  // `apply_patch` may touch several files in one call.
  let touched = [];
  if (data.name === 'apply_patch') {
    try {
      const args = JSON.parse(String(data.arguments ?? '{}'));
      touched = patchPaths(args?.input).map(path => ({ path, kind: 'write' }));
    } catch { touched = []; }
  } else {
    const kind = FILE_TOOLS[data.name];
    const path = kind === undefined ? undefined : pathOf(data.arguments);
    if (path !== undefined) touched = [{ path, kind }];
  }
  if (touched.length === 0) return state;

  const files = { ...state.files };
  for (const { path, kind } of touched) {
    const prev = files[path] ?? { reads: 0, writes: 0, searches: 0, last: 0, added: 0, removed: 0 };
    files[path] = {
      reads: prev.reads + (kind === 'read' ? 1 : 0),
      writes: prev.writes + (kind === 'write' || kind === 'edit' ? 1 : 0),
      searches: prev.searches + (kind === 'search' ? 1 : 0),
      added: count(prev.added), removed: count(prev.removed),
      last: Math.max(prev.last, time),
    };
  }
  const keys = Object.keys(files);
  if (keys.length > 200) {
    keys.sort((a, b) => files[a].last - files[b].last);
    for (const k of keys.slice(0, keys.length - 200)) delete files[k];
  }
  return { ...state, files };
}

/** One `apply_patch` target with the line delta of its own section. */
function patchSections(input) {
  if (typeof input !== 'string' || input === '') return [];
  const marks = [];
  for (const match of input.matchAll(PATCH_PATH)) {
    marks.push({ index: match.index, path: (match[1] ?? match[2] ?? '').trim() });
  }
  const out = [];
  for (let index = 0; index < marks.length; index += 1) {
    const start = marks[index].index;
    const end = index + 1 < marks.length ? marks[index + 1].index : input.length;
    let added = 0, removed = 0;
    for (const line of input.slice(start, end).split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) added += 1;
      else if (line.startsWith('-')) removed += 1;
    }
    out.push({ path: marks[index].path, added, removed });
  }
  return out;
}

/** Ledger entries for the file-touching tools in one call. */
function fileOpsOf(data, args, time, co) {
  const name = String(data.name ?? '');
  const base = { seq: count(data.seq), time, turn: co?.turn ?? null, step: co?.step ?? null };
  const push = (path, kind, delta) => ({
    ...base, path, kind,
    added: delta?.added ?? 0, removed: delta?.removed ?? 0,
  });
  if (name === 'apply_patch') {
    return patchSections(args?.input).map(section => push(section.path, 'write', section));
  }
  const kind = FILE_TOOLS[name];
  if (kind === undefined) return [];
  const path = pathOf(data.arguments);
  if (path === undefined) return [];
  const writeKind = kind === 'edit' ? 'write' : kind;
  const delta = writeKind === 'write' ? lineDeltaOf(name, args) : undefined;
  return [push(path, writeKind, delta)];
}

/**
 * Fold one tool call: per-tool counters, the command ledger (shell / code
 * executions) and the file-operation ledger. Counters and metadata only — no
 * tool output text is stored.
 */
function foldTool(state, event) {
  const data = event?.data ?? {};
  const name = String(data.name ?? '');
  if (name === '') return state;
  const time = count(event.time);
  const co = coordinates(event);
  const args = argsOf(data.arguments);

  const next = foldFile(state, event);

  const toolCalls = { ...next.toolCalls };
  toolCalls[name] = (toolCalls[name] ?? 0) + 1;
  const names = Object.keys(toolCalls);
  if (names.length > MAX_TOOL_NAMES) {
    names.sort((a, b) => toolCalls[a] - toolCalls[b]);
    for (const k of names.slice(0, names.length - MAX_TOOL_NAMES)) delete toolCalls[k];
  }

  let commands = next.commands;
  if (COMMAND_TOOLS.has(name) && args !== undefined) {
    const command = String(args.command ?? args.code ?? args.script ?? '');
    const program = programOf(command);
    if (program !== '') {
      commands = [...commands, {
        seq: count(event.seq), time, turn: co?.turn ?? null, step: co?.step ?? null,
        callId: String(data.callId ?? ''), program,
        call: summaryOf(command), status: 'running', durationMs: null,
      }];
      if (commands.length > MAX_COMMANDS) commands.splice(0, commands.length - MAX_COMMANDS);
    }
  }

  const ops = fileOpsOf(data, args, time, co);
  let fileOps = next.fileOps;
  let files = next.files;
  if (ops.length > 0) {
    fileOps = [...fileOps, ...ops];
    if (fileOps.length > MAX_FILE_OPS) fileOps.splice(0, fileOps.length - MAX_FILE_OPS);
    // Line deltas are per file, so the card can show `+12 / −3` without
    // replaying the whole op ledger on every render.
    if (ops.some(op => op.added > 0 || op.removed > 0)) {
      files = { ...files };
      for (const op of ops) {
        const row = files[op.path];
        if (row === undefined) continue;
        files[op.path] = {
          ...row,
          added: count(row.added) + count(op.added),
          removed: count(row.removed) + count(op.removed),
        };
      }
    }
  }

  let counts = next.counts;
  if (name === 'skill' || name === 'load_skills') {
    counts = { ...counts, skills: counts.skills + 1 };
  }

  return { ...next, toolCalls, commands, fileOps, files, counts };
}

/** Close a command ledger entry when its tool result arrives. */
function settleCommand(state, event) {
  const data = event?.data ?? {};
  const message = data?.message;
  const callId = String(data?.toolCallId ?? message?.toolCallId ?? message?.source?.callId ?? '');
  if (callId === '') return state;
  const time = count(event.time);
  const commands = state.commands;
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const record = commands[index];
    if (record.callId !== callId || record.status !== 'running') continue;
    const isError = message?.isError === true || data?.isError === true;
    const next = commands.slice();
    next[index] = {
      ...record,
      status: isError ? 'error' : 'ok',
      durationMs: Math.max(0, time - record.time),
    };
    return { ...state, commands: next };
  }
  return state;
}

/**
 * One entry per model request (`assistant/message` / `assistant/attempt`),
 * carrying provider-exact token buckets and the model that served it, plus a
 * chronological log of the context-changing events.
 */
export function applyTimeline(state, event) {
  const type = event?.type;
  const time = count(event?.time) || (Number.isFinite(event?.time) ? event.time : 0);
  const seq = count(event?.seq) || (Number.isFinite(event?.seq) ? event.seq : 0);
  const co = coordinates(event);

  // A request envelope announces the model that serves the following steps.
  // A changed model is also a context event: the switch, not the envelope, is
  // what explains why later requests bill at a different price row.
  if (type === 'request/header' || type === 'request/context' || type === 'model/selection') {
    const next = modelOf(event);
    if (next.model === '') return state;
    const previous = state.current.model;
    const changed = previous !== '' && previous !== next.model;
    if (!changed) return { ...state, current: next };
    const events = [...state.events, {
      seq, time, kind: 'switch', turn: co?.turn ?? null, step: co?.step ?? null,
      label: `${previous} → ${next.model}`, tokens: 0,
    }];
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    return { ...state, current: next, events };
  }

  if (type === 'assistant/message' || type === 'assistant/attempt') {
    const usage = usageOf(event);
    if (usage === undefined) return state;
    const b = bucketsOf(usage);
    const own = modelOf(event);
    const route = own.model !== '' ? own : state.current;
    const request = {
      seq, time, turn: co?.turn ?? null, step: co?.step ?? null,
      provider: route.provider, model: route.model, contextWindow: contextWindowOf(event),
      ...b, totalTokens: count(usage.totalTokens) || b.input + b.cacheRead + b.cacheWrite + b.output,
    };
    const requests = [...state.requests, request];
    if (requests.length > MAX_REQUESTS) requests.splice(0, requests.length - MAX_REQUESTS);
    // Only a final assistant message is an "answer"; attempts are retries.
    const counts = type === 'assistant/message'
      ? { ...state.counts, answers: state.counts.answers + 1 }
      : state.counts;
    return { ...state, requests, last: request, counts };
  }

  if (type === 'user/message') {
    return { ...state, counts: { ...state.counts, user: state.counts.user + 1 } };
  }

  // Tool activity: per-tool counters, command ledger and file-op ledger.
  if (type === 'tool/call') return foldTool(state, event);
  if (type === 'tool/result') return settleCommand(state, event);

  // Context-changing events: injections, compactions, prunes, modes. Model
  // switches are recorded where the envelope is read (above), and file activity
  // rides the same fold so the tab needs no extra projection.
  const EVENT_KINDS = {
    'compaction/summary': 'compact', 'compaction/prune': 'prune',
    'plan/mode': 'mode', 'agent/inbox/spliced': 'inject', 'system/message': 'inject',
  };
  const kind = EVENT_KINDS[type];
  if (kind === undefined) return state;
  const data = event.data ?? {};
  const label = String(data.source?.name ?? data.source?.kind ?? data.name ?? data.reason ?? type);
  const rec = {
    seq, time, kind, turn: co?.turn ?? null, step: co?.step ?? null,
    label, tokens: count(data.tokens ?? data.removedTokens ?? data.reclaimedTokens),
  };
  const events = [...state.events, rec];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return { ...state, events };
}

export function viewTimeline(state) {
  return {
    requests: state.requests, events: state.events, files: state.files,
    commands: state.commands, fileOps: state.fileOps, toolCalls: state.toolCalls,
    counts: state.counts, last: state.last,
  };
}

// ── tcHeaders ─────────────────────────────────────────────────────────────────

export function initHeaders() {
  return { headers: [] };
}

/** Request-envelope metadata: model, provider, window capacity, tool names. */
export function applyHeaders(state, event) {
  const type = event?.type;
  if (type !== 'request/header' && type !== 'request/context') return state;
  const data = event.data ?? {};
  const { provider, model } = modelOf(event);
  const header = {
    seq: count(event.seq), time: count(event.time), provider, model,
    contextWindow: contextWindowOf(event),
    systemTokens: count(data.systemTokens ?? data.header?.systemTokens),
    tools: Array.isArray(data.header?.tools)
      ? data.header.tools.map(t => typeof t === 'string' ? t : String(t?.name ?? '?'))
      : [],
  };
  const headers = [...state.headers, header];
  if (headers.length > MAX_HEADERS) headers.splice(0, headers.length - MAX_HEADERS);
  return { ...state, headers };
}

export function viewHeaders(state) {
  return { headers: state.headers };
}

// ── tcActivity ────────────────────────────────────────────────────────────────

export function initActivity() {
  return { days: {}, current: { provider: '', model: '' } };
}

/** Per-Beijing-day billed tokens and per-model buckets (dashboard heatmap/chart). */
/** Bump a `{[name]: count}` map by one, bounded by name count. */
function tally(map, name, maxNames) {
  if (typeof name !== 'string' || name === '') return map;
  const next = { ...map };
  next[name] = (next[name] ?? 0) + 1;
  const names = Object.keys(next);
  if (names.length > maxNames) {
    names.sort((a, b) => next[a] - next[b]);
    for (const k of names.slice(0, names.length - maxNames)) delete next[k];
  }
  return next;
}

/**
 * Per-day tool / program / skill tallies for the cross-session dashboard. They
 * ride `applyActivity` so one projection answers every cross-session question;
 * names only, bounded to 40 per day.
 */
function foldActivityTally(state, event) {
  const time = count(event?.time);
  if (time <= 0) return state;
  const day = beijingDay(time);
  const row = state.days[day];
  if (row === undefined) return state;
  const data = event?.data ?? {};
  const name = String(data.name ?? '');
  if (name === '') return state;
  const next = { tools: row.tools ?? {}, programs: row.programs ?? {}, skills: row.skills ?? {} };
  if (event.type === 'tool/call') {
    const args = argsOf(data.arguments);
    next.tools = tally(next.tools, name, 40);
    if (COMMAND_TOOLS.has(name) && args !== undefined) {
      const program = programOf(String(args.command ?? args.code ?? args.script ?? ''));
      if (program !== '') next.programs = tally(next.programs, program, 40);
    }
    if (name === 'skill' || name === 'load_skills') {
      const skill = String(args?.name ?? args?.skill ?? '');
      if (skill !== '') next.skills = tally(next.skills, skill, 40);
    }
  }
  return { ...state, days: { ...state.days, [day]: { ...row, ...next } } };
}

export function applyActivity(state, event) {
  const type = event?.type;
  if (type === 'tool/call') return foldActivityTally(state, event);
  if (type === 'request/header' || type === 'request/context' || type === 'model/selection') {
    const next = modelOf(event);
    return next.model !== '' ? { ...state, current: next } : state;
  }
  if (type !== 'assistant/message' && type !== 'assistant/attempt') return state;
  const usage = usageOf(event);
  if (usage === undefined) return state;
  const b = bucketsOf(usage);
  const total = b.input + b.cacheRead + b.cacheWrite + b.output;
  if (total === 0) return state;
  const time = count(event.time);
  const day = beijingDay(time);
  const own = modelOf(event);
  const route = own.model !== '' ? own : state.current;
  const key = route.model || 'unknown';
  // The tier is folded in, not recomputed later: this projection stores a whole
  // day's buckets, so a request-level timestamp no longer survives. Without the
  // split every historical DeepSeek day would be priced at whatever tier the
  // dashboard happened to be opened in (up to 2x off).
  const peak = isPeakBeijing(time);
  const prev = state.days[day] ?? {
    tokens: 0, requests: 0, buckets: emptyBuckets(),
    peakBuckets: emptyBuckets(), offPeakBuckets: emptyBuckets(), byModel: {},
  };
  const byModel = { ...prev.byModel };
  const slot = byModel[key] ?? { peak: emptyBuckets(), offPeak: emptyBuckets() };
  byModel[key] = peak
    ? { peak: addBuckets(slot.peak, b), offPeak: slot.offPeak }
    : { peak: slot.peak, offPeak: addBuckets(slot.offPeak, b) };
  const days = {
    ...state.days,
    [day]: {
      tokens: prev.tokens + total, requests: prev.requests + 1,
      buckets: addBuckets(prev.buckets, b),
      peakBuckets: peak ? addBuckets(prev.peakBuckets ?? emptyBuckets(), b) : (prev.peakBuckets ?? emptyBuckets()),
      offPeakBuckets: peak ? (prev.offPeakBuckets ?? emptyBuckets()) : addBuckets(prev.offPeakBuckets ?? emptyBuckets(), b),
      byModel,
      tools: prev.tools ?? {}, programs: prev.programs ?? {}, skills: prev.skills ?? {},
    },
  };
  const keys = Object.keys(days);
  if (keys.length > MAX_DAYS) {
    keys.sort();
    for (const k of keys.slice(0, keys.length - MAX_DAYS)) delete days[k];
  }
  return { ...state, days };
}

export function viewActivity(state) {
  return { days: state.days };
}
