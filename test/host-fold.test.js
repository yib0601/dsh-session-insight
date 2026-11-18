/** Pure Host fold tests — no DSH runtime needed. Run: node test/host-fold.test.js */
import assert from 'node:assert/strict';
import { beijingDay, isPeakBeijing } from '../host/schema.js';
import { contextProjections } from '../host/projections.js';

const byKey = Object.fromEntries(contextProjections.map(p => [p.key, p]));
for (const key of ['tcTimeline', 'tcHeaders', 'tcActivity']) {
  assert.ok(byKey[key], `${key} must exist`);
  assert.equal(typeof byKey[key].stateSchema.parse, 'function');
  assert.equal(typeof byKey[key].wire.viewSchema.parse, 'function');
}

// Beijing 2026-11-13 10:00 = 02:00 UTC
const t1 = Date.UTC(2026, 10, 13, 2, 0, 0);
const t2 = Date.UTC(2026, 10, 13, 12, 0, 0); // 20:00 Beijing, same day
const t3 = Date.UTC(2026, 10, 14, 2, 0, 0); // next day
assert.equal(beijingDay(t1), '2026-11-13');
assert.equal(beijingDay(t2), '2026-11-13');
assert.equal(beijingDay(t3), '2026-11-14');

// Peak window: Beijing Mon–Fri 09:00–12:00 / 14:00–18:00, nothing else.
assert.equal(isPeakBeijing(t1), true, 'Friday 10:00 Beijing is peak');
assert.equal(isPeakBeijing(t3), false, 'Saturday is off-peak all day');
assert.equal(isPeakBeijing(Date.UTC(2026, 10, 13, 1, 0, 0)), true, '09:00 Beijing is peak');
assert.equal(isPeakBeijing(Date.UTC(2026, 10, 13, 3, 59, 0)), true, '11:59 Beijing is peak');
assert.equal(isPeakBeijing(Date.UTC(2026, 10, 13, 4, 0, 0)), false, '12:00 Beijing (lunch) is off-peak');
assert.equal(isPeakBeijing(Date.UTC(2026, 10, 13, 5, 0, 0)), false, '13:00 Beijing is off-peak');
assert.equal(isPeakBeijing(Date.UTC(2026, 10, 13, 6, 0, 0)), true, '14:00 Beijing is peak');
assert.equal(isPeakBeijing(Date.UTC(2026, 10, 13, 10, 0, 0)), false, '18:00 Beijing is off-peak');

const events = [
  { type: 'request/header', seq: 1, time: t1, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash' } }, contextWindow: 1000000 } },
  { type: 'request/context', seq: 2, time: t1, data: { provider: 'deepseek-official', model: 'deepseek-flash', contextWindow: 1000000 } },
  { type: 'assistant/message', seq: 3, time: t1, data: { turn: 1, step: 1, usage: { inputTokens: 10000, outputTokens: 1000, cacheReadTokens: 5000, totalTokens: 16000 } } },
  { type: 'compaction/summary', seq: 4, time: t2, data: { turn: 1, step: 2, tokens: 2000 } },
  { type: 'tool/call', seq: 6, time: t2, data: { turn: 1, step: 2, name: 'read', arguments: JSON.stringify({ file_path: '/repo/a.ts' }) } },
  { type: 'tool/call', seq: 7, time: t2, data: { turn: 1, step: 2, name: 'edit', arguments: JSON.stringify({ file_path: '/repo/a.ts' }) } },
  { type: 'tool/call', seq: 8, time: t2, data: { turn: 1, step: 2, name: 'grep', arguments: JSON.stringify({ pattern: 'TODO' }) } },
  { type: 'tool/call', seq: 9, time: t2, data: { turn: 1, step: 2, name: 'get_weather', arguments: '{}' } },
  { type: 'tool/call', seq: 10, time: t2, data: { turn: 1, step: 2, name: 'apply_patch', arguments: JSON.stringify({ input: '*** Begin Patch\n*** Update File: /repo/b.ts\n@@\n-old line\n+new line\n+another line\n*** Add File: /repo/c.ts\n+hello\n*** End Patch' }) } },
  { type: 'assistant/message', seq: 5, time: t3, data: { turn: 2, step: 1, usage: { inputTokens: 2000, outputTokens: 500, cacheReadTokens: 1000, totalTokens: 3500 } } },
  { type: 'user/message', seq: 11, time: t3, data: { turn: 2, step: 1, role: 'user', content: [{ type: 'text', text: 'next' }] } },
  { type: 'tool/call', seq: 12, time: t3, data: { turn: 2, step: 1, callId: 'call_1', name: 'bash', arguments: JSON.stringify({ command: 'npm test -- --watch=false' }) } },
  { type: 'tool/result', seq: 13, time: t3 + 2500, data: { turn: 2, step: 1, toolCallId: 'call_1', message: { role: 'tool', toolCallId: 'call_1', content: [], isError: false } } },
  { type: 'tool/call', seq: 14, time: t3, data: { turn: 2, step: 1, callId: 'call_2', name: 'bash', arguments: JSON.stringify({ command: 'sudo env A=1 /usr/bin/git status' }) } },
  { type: 'tool/result', seq: 15, time: t3 + 300, data: { turn: 2, step: 1, toolCallId: 'call_2', message: { role: 'tool', toolCallId: 'call_2', content: [], isError: true } } },
  { type: 'tool/call', seq: 16, time: t3, data: { turn: 2, step: 1, name: 'skill', arguments: JSON.stringify({ name: 'modular-architecture' }) } },
];

let timeline = byKey.tcTimeline.init();
let headers = byKey.tcHeaders.init();
let activity = byKey.tcActivity.init();
for (const event of events) {
  timeline = byKey.tcTimeline.apply(timeline, event);
  headers = byKey.tcHeaders.apply(headers, event);
  activity = byKey.tcActivity.apply(activity, event);
}

const tv = byKey.tcTimeline.wire.view(timeline);
assert.equal(tv.requests.length, 2);
assert.equal(tv.requests[0].input, 10000);
assert.equal(tv.requests[0].cacheRead, 5000);
assert.equal(tv.requests[0].output, 1000);
assert.equal(tv.requests[0].totalTokens, 16000);
assert.equal(tv.requests[0].model, 'deepseek-flash', 'model comes from the preceding request/header');
assert.equal(tv.requests[0].provider, 'deepseek-official');
assert.equal(tv.events.length, 1, 'compaction recorded as a context event');
assert.equal(tv.events[0].kind, 'compact');

// File activity: read/edit/grep tracked, unrelated tools ignored, path bounded.
assert.equal(tv.files['/repo/a.ts'].reads, 1);
assert.equal(tv.files['/repo/a.ts'].writes, 1);
assert.equal(tv.files['TODO'].searches, 1);
assert.equal(tv.files['/repo/b.ts'].writes, 1, 'apply_patch Update File target is a write');
assert.equal(tv.files['/repo/c.ts'].writes, 1, 'apply_patch Add File target is a write');
assert.equal(Object.keys(tv.files).length, 4, 'tool without a path contributes nothing');
// Tool counters: every call is counted under its own name (bounded to 24 names).
assert.equal(tv.toolCalls.bash, 2);
assert.equal(tv.toolCalls.read, 1);
assert.equal(tv.toolCalls.apply_patch, 1);
assert.equal(tv.toolCalls.skill, 1);

// Command ledger: program extracted from the command line, wrappers skipped,
// and a tool/result settles status + wall time.
assert.equal(tv.commands.length, 2);
assert.equal(tv.commands[0].program, 'npm');
assert.equal(tv.commands[0].status, 'ok');
assert.equal(tv.commands[0].durationMs, 2500);
assert.equal(tv.commands[1].program, 'git', 'sudo/env wrappers are skipped to reach the program');

// Program extraction skips the harness's `cd <dir> &&` prefix and punctuation.
let prog = byKey.tcTimeline.init();
const bashCall = (seq, callId, command) => ({ type: 'tool/call', seq, time: t3, data: { turn: 1, step: 1, callId, name: 'bash', arguments: JSON.stringify({ command }) } });
for (const [seq, callId, command] of [
  [20, 'c1', 'cd /repo && npm test'],
  [21, 'c2', 'pwd; ls -la'],
  [22, 'c3', 'FOO=1 -x python3 -V'],
  [23, 'c4', '/usr/local/bin/node -e "1"'],
]) prog = byKey.tcTimeline.apply(prog, bashCall(seq, callId, command));
const programs = byKey.tcTimeline.wire.view(prog).commands.map(record => record.program);
assert.deepEqual(programs, ['npm', 'pwd', 'python3', 'node'], 'cd/env/flag prefixes are skipped, paths are basenames');
assert.equal(tv.commands[1].status, 'error', 'isError on the tool result marks the command failed');

// File-operation ledger: one entry per touched file, with line deltas.
assert.equal(tv.fileOps.length, 5, 'read + edit + grep + two apply_patch targets');
const opOf = (path) => tv.fileOps.filter(op => op.path === path);
assert.equal(opOf('/repo/a.ts').length, 2, 'a read op and a write op for the same file');
assert.equal(opOf('/repo/a.ts')[0].kind, 'read');
assert.equal(opOf('/repo/a.ts')[1].kind, 'write');
const patchB = tv.fileOps.find(op => op.path === '/repo/b.ts');
assert.deepEqual({ added: patchB.added, removed: patchB.removed }, { added: 2, removed: 1 }, 'line delta per patched file');
const patchC = tv.fileOps.find(op => op.path === '/repo/c.ts');
assert.deepEqual({ added: patchC.added, removed: patchC.removed }, { added: 1, removed: 0 });
// The per-file rollups the File Activity card reads.
assert.equal(tv.files['/repo/b.ts'].added, 2);
assert.equal(tv.files['/repo/b.ts'].removed, 1);
assert.equal(tv.files['/repo/c.ts'].added, 1);
assert.equal(tv.files['/repo/a.ts'].writes, 1);
assert.equal(tv.files['/repo/a.ts'].added, 0, 'an edit without text carries no line delta');

// Counters: user messages, final answers (attempts are retries), skill loads.
assert.equal(tv.counts.user, 1);
assert.equal(tv.counts.answers, 2);
assert.equal(tv.counts.skills, 1);

assert.deepEqual(byKey.tcTimeline.wire.viewSchema.parse(tv), tv);

const hv = byKey.tcHeaders.wire.view(headers);
assert.equal(hv.headers.length, 2);
assert.equal(hv.headers[0].model, 'deepseek-flash');
assert.equal(hv.headers[0].contextWindow, 1000000);

const av = byKey.tcActivity.wire.view(activity);
assert.equal(Object.keys(av.days).length, 2);
assert.equal(av.days['2026-11-13'].tokens, 16000);
assert.equal(av.days['2026-11-13'].requests, 1);
assert.equal(av.days['2026-11-14'].tokens, 3500);
assert.equal(av.days['2026-11-13'].buckets.cacheRead, 5000);
assert.ok(av.days['2026-11-13'].byModel['deepseek-flash'], 'activity buckets are attributed to the model');

// Billing tier is folded per request, so a historical day keeps the tier it was
// billed at instead of being re-priced at whatever tier the dashboard opens in.
assert.equal(av.days['2026-11-13'].peakBuckets.input, 10000, 'Friday 10:00 → peak buckets');
assert.equal(av.days['2026-11-13'].offPeakBuckets.input, 0);
assert.equal(av.days['2026-11-14'].offPeakBuckets.input, 2000, 'Saturday → off-peak buckets');
assert.equal(av.days['2026-11-14'].peakBuckets.input, 0);
assert.equal(av.days['2026-11-13'].byModel['deepseek-flash'].peak.input, 10000);
assert.equal(av.days['2026-11-13'].byModel['deepseek-flash'].offPeak.input, 0);
assert.equal(av.days['2026-11-14'].byModel['deepseek-flash'].offPeak.input, 2000);
assert.equal(byKey.tcActivity.stateVersion, 4, 'activity state version covers the tier split + tallies');
// Cross-session tallies: the activity projection records tool / program / skill
// usage per day so the dashboard can rank them without scanning every session.
const tallyAv = byKey.tcActivity.wire.view(activity);
assert.equal(tallyAv.days['2026-11-14'].tools.bash, 2, 'tool calls are tallied per day');
assert.equal(tallyAv.days['2026-11-14'].programs.git, 1, 'program tallies use the extracted program');
assert.equal(tallyAv.days['2026-11-14'].programs.npm, 1);
assert.equal(tallyAv.days['2026-11-14'].skills['modular-architecture'], 1, 'skill loads keep the skill name');
assert.equal(byKey.tcTimeline.stateVersion, 7, 'timeline state version covers the tool/command ledgers');

// A model switch is a context event: the envelope alone changes nothing, a new
// model id is what explains a different price row later in the session.
let switched = byKey.tcTimeline.init();
switched = byKey.tcTimeline.apply(switched, {
  type: 'request/header', seq: 1, time: t1,
  data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash' } } },
});
assert.equal(byKey.tcTimeline.wire.view(switched).events.length, 0, 'first model is not a switch');
switched = byKey.tcTimeline.apply(switched, {
  type: 'request/context', seq: 2, time: t1,
  data: { provider: 'deepseek-official', model: 'deepseek-flash' },
});
assert.equal(byKey.tcTimeline.wire.view(switched).events.length, 0, 'same model re-announced is not a switch');
switched = byKey.tcTimeline.apply(switched, {
  type: 'model/selection', seq: 3, time: t1, data: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
});
const switchedView = byKey.tcTimeline.wire.view(switched);
assert.equal(switchedView.events.length, 1, 'a changed model is recorded');
assert.equal(switchedView.events[0].kind, 'switch');
assert.equal(switchedView.events[0].label, 'deepseek-flash → claude-sonnet-5-5');

// Unknown events are ignored and never throw.
let s = byKey.tcTimeline.init();
for (const type of ['user/message', 'tool/call', 'tool/result', 'turn/start', 'turn/end']) {
  s = byKey.tcTimeline.apply(s, { type, seq: 1, time: t1, data: { turn: 1, step: 1 } });
}
assert.equal(byKey.tcTimeline.wire.view(s).requests.length, 0);

console.log('host-fold.test.js: all assertions passed');
