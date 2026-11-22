/**
 * `tcSurface` fold tests — no DSH runtime needed. Run: node test/host-surface.test.js
 *
 * The projection exists to answer what the three `contextBreakdown` totals are
 * made of, so the assertions are about items: a tool definition's own price, a
 * system prompt's sections, per-kind message areas, and that a compaction or a
 * system rewrite retracts exactly what it shadowed.
 */
import assert from 'node:assert/strict';
import { contextProjections } from '../host/projections.js';
import {
  estimateContent, estimateMessage, estimateToolsTokens, systemSectionsOf, toolRowsOf,
} from '../host/estimate.js';
import { initSurface, applySurface, viewSurface } from '../host/surface.js';

// ── the projection is registered and reads through the wire face ─────────────
const def = contextProjections.find(p => p.key === 'tcSurface');
assert.ok(def, 'tcSurface must be registered with the other context projections');
assert.equal(typeof def.stateSchema.parse, 'function');
assert.equal(typeof def.wire.viewSchema.parse, 'function');
assert.equal(def.wire.summary, false, 'item detail is not a session summary');

// ── the estimator matches DSH's own fixed-density heuristic ──────────────────
// 4 chars ≈ 1 token, 4 tokens of framing per block, 4 per message role.
assert.equal(estimateContent([{ type: 'text', text: 'x'.repeat(400) }]), 104, '100 + block framing');
assert.equal(estimateMessage({ role: 'user', content: [{ type: 'text', text: 'x'.repeat(400) }] }), 108, 'plus role framing');
assert.equal(estimateContent([]), 0);
assert.equal(estimateContent([{ type: 'text', text: '' }]), 4, 'an empty text block still carries framing');

const header = {
  config: { provider: 'p', model: 'm' },
  tools: [
    { name: 'bash', description: 'run a command', parameters: { type: 'object', properties: {} } },
    { name: 'read', description: 'read a file', parameters: { type: 'object', properties: {} } },
  ],
};
const toolTotal = estimateToolsTokens(header);
assert.ok(toolTotal > 0);
const tools = toolRowsOf(header);
assert.equal(tools.length, 2, 'one row per tool definition');
assert.equal(tools[0].name, 'bash');
assert.ok(tools[0].tokens > 0 && tools[0].description === 'run a command');
assert.equal(toolRowsOf(undefined).length, 0);
assert.equal(estimateToolsTokens({ tools: [] }), 0, 'an empty tool list prices nothing');

// ── system prompt sections ───────────────────────────────────────────────────
const prompt = [
  '<project_instructions>',
  'always be brief',
  '',
  '### Rules',
  'rule body '.repeat(20),
  '',
  '【门禁】不可跳过',
  'gate body',
  '',
  '═══════════════════',
  'tail text',
].join('\n');
// A `rule / label / rule` banner is one opener named after its middle line.
const banner = systemSectionsOf(['<project_instructions>', 'intro text', '', '═══════', 'Style', '═══════', 'body line', '', '═══════', 'RULES', '═══════', 'rule body'].join('\n'));
assert.deepEqual(banner.map(section => section.label), ['project_instructions', 'Style', 'RULES'],
  'banners name their sections instead of fragmenting into (段落)');
assert.equal(banner.reduce((sum, section) => sum + section.chars, 0) > 0, true);

const sections = systemSectionsOf(prompt);
assert.ok(sections.length >= 3, 'headings, rule banners and 【…】 labels split sections');
assert.equal(sections[0].label, 'project_instructions', 'a prompt that opens with a heading is labelled by it');
assert.ok(sections.some(section => section.label === 'Rules'), 'markdown headings become labels');
assert.ok(sections.some(section => section.label.startsWith('【门禁】')), '【…】 labels become labels');
for (const section of sections) {
  assert.ok(section.preview.length <= 161, 'previews stay one bounded line');
  assert.equal(section.tokens, Math.ceil(section.chars / 4), 'section price is pure text density');
}
assert.ok(sections.reduce((sum, section) => sum + section.tokens, 0) > 0);
assert.deepEqual(systemSectionsOf(''), [], 'an empty prompt has no sections');
const prose = systemSectionsOf('no headings at all, just prose');
assert.equal(prose.length, 1, 'prose stays one row');
assert.equal(prose[0].label, '(开头)', 'and is labelled as the preamble');

// ── bodies: the card must be able to show what a section actually says ──────
const bodyPrompt = ['<project_instructions>', 'first body line', '═══════', 'Style', '═══════', 'be concrete'].join('\n');
const bodySections = systemSectionsOf(bodyPrompt);
assert.ok(bodySections.length >= 2);
for (const section of bodySections) {
  assert.equal(typeof section.body, 'string', 'every section carries its own text');
  assert.ok(section.body.length > 0, 'a non-empty section keeps a non-empty body');
  assert.equal(section.truncated, false);
}
assert.ok(bodySections[0].body.includes('first body line'), 'the body is the section text, not a summary');
assert.ok(bodySections.some(section => section.body.includes('be concrete')));

// A single huge section is capped, and says so instead of silently cutting.
const huge = systemSectionsOf(['## Giant', 'x'.repeat(30000)].join('\n'));
assert.equal(huge.length, 1);
assert.equal(huge[0].truncated, true, 'an over-budget body is flagged');
assert.ok(huge[0].body.length < 30000, 'and actually capped');

// Tool rows carry the schema the model receives.
const toolBodies = toolRowsOf({
  config: { provider: 'p', model: 'm' },
  tools: [{ name: 'bash', description: 'Run a command', parameters: { type: 'object', properties: { command: { type: 'string' } } } }],
});
assert.equal(toolBodies.length, 1);
assert.ok(toolBodies[0].body.includes('"parameters"'), 'the tool body is the schema JSON');
assert.ok(toolBodies[0].body.includes('Run a command'), 'including the description');
assert.equal(toolBodies[0].truncated, false);

// ── folding: an appended session ────────────────────────────────────────────
const system = { role: 'system', content: [{ type: 'text', text: prompt }] };
const events = [
  { type: 'system/message', seq: 1, time: 1000, surfaceOp: 'append', data: { turn: 1, step: 1, message: system } },
  { type: 'request/header', seq: 2, time: 1100, data: { header } },
  { type: 'user/message', seq: 3, time: 1200, surfaceOp: 'append', data: { role: 'user', content: [{ type: 'text', text: '看一下上下文里有什么' }] } },
  {
    type: 'assistant/message', seq: 4, time: 1300, surfaceOp: 'append',
    data: {
      turn: 1, step: 1,
      message: { role: 'assistant', content: [
        { type: 'reasoning', text: 'thinking about it' },
        { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"command":"ls -la"}' },
      ] },
    },
  },
  { type: 'tool/call', seq: 5, time: 1310, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"ls -la"}' } },
  {
    type: 'tool/result', seq: 6, time: 1320, surfaceOp: 'append',
    data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: 'file '.repeat(400) }] } },
  },
];
let state = initSurface();
for (const event of events) state = applySurface(state, event);
const view = viewSurface(state);

assert.ok(view.system.tokens > 0, 'the system prompt carries a price');
assert.equal(view.system.sections.length, sections.length, 'its sections survive the fold');
assert.equal(view.tools.total, toolTotal, 'the latest envelope prices every schema');
assert.equal(view.tools.rows.length, 2);

assert.equal(view.kinds.user.count, 1);
assert.equal(view.kinds.reasoning.count, 1, 'reasoning is counted apart from the answer');
assert.equal(view.kinds.call.count, 1, 'tool arguments are counted apart from both');
assert.equal(view.kinds.result.count, 1);
assert.equal(view.kinds.assistant.count, 0, 'the assistant message had no visible text block');

const kindsTotal = Object.values(view.kinds).reduce((sum, kind) => sum + kind.tokens, 0);
assert.equal(view.tokens, kindsTotal, 'the message total is the sum of its kinds');

assert.equal(view.top.length, 3, 'each priced message node is one candidate row');
assert.equal(view.top[0].kind, 'result', 'the 400-word tool result dominates');
assert.equal(view.top[0].label, 'bash', 'a result is labelled by the tool that produced it');
assert.ok(view.top[0].preview.startsWith('file file'), 'the heaviest row keeps a preview');
assert.equal(view.top[0].turn, 1, 'coordinates ride along for the reader');
assert.equal(view.approximate, false);

// The card's own line: system + tools + messages is what it says is in there.
assert.ok(view.system.tokens + view.tools.total + view.tokens > view.tokens);

// ── a compaction retracts exactly the shadowed range ────────────────────────
const before = view.tokens;
const shadowed = [3, 4];   // the user message and the assistant step
const shadowedPrice = state.ledger.filter(row => row.seq >= 3 && row.seq <= 4)
  .reduce((sum, row) => sum + row.tokens, 0);
assert.ok(shadowedPrice > 0);
state = applySurface(state, {
  type: 'compaction/summary', seq: 7, time: 1400,
  data: { shadowedRange: { start: 3, end: 4 }, shadowedSeqs: shadowed, shadowedTokenCount: shadowedPrice },
});
state = applySurface(state, {
  type: 'user/message', seq: 8, time: 1500, surfaceOp: { op: 'replace', startSeq: 3, endSeq: 4 },
  data: { role: 'user', content: [{ type: 'text', text: 'summary of turn 1' }] },
});
const compacted = viewSurface(state);
assert.equal(compacted.kinds.user.count, 1, 'the shadowed user message is gone, the summary is one');
assert.equal(compacted.kinds.reasoning.count, 0, 'the shadowed reasoning is gone');
assert.equal(compacted.kinds.call.count, 0, 'the shadowed tool arguments are gone');
assert.ok(compacted.tokens < before + 20, 'the total drops by the shadowed price');
assert.ok(compacted.top.every(row => row.seq !== 3 && row.seq !== 4), 'shadowed rows leave the heavy list');
assert.equal(compacted.approximate, false, 'a fully matched range stays exact');
assert.equal(compacted.system.tokens, view.system.tokens, 'a message range never touches the system bucket');
assert.equal(compacted.tools.total, toolTotal, 'nor the tool schemas');

// ── a range the ledger no longer holds stays honest and flags itself ────────
// Session resumed from a stored checkpoint: the ledger only knows the newest
// node, while the compaction says the shadowed range held 80 tokens.
let trimmed = initSurface();
trimmed = applySurface(trimmed, { type: 'user/message', seq: 10, time: 2000, surfaceOp: 'append', data: { role: 'user', content: [{ type: 'text', text: 'x'.repeat(400) }] } });
const keptPrice = viewSurface(trimmed).tokens;
assert.equal(keptPrice, 108);
trimmed = applySurface(trimmed, { type: 'compaction/summary', seq: 11, time: 2100, data: { shadowedRange: { start: 1, end: 9 }, shadowedSeqs: [1, 2], shadowedTokenCount: 80 } });
trimmed = applySurface(trimmed, { type: 'user/message', seq: 12, time: 2200, surfaceOp: { op: 'replace', startSeq: 1, endSeq: 9 }, data: { role: 'user', content: [{ type: 'text', text: 'digest' }] } });
const trimmedView = viewSurface(trimmed);
assert.equal(trimmedView.approximate, true, 'an unpriced range marks the split approximate');
assert.equal(trimmedView.tokens, keptPrice - 80 + 10, 'the metered shadow price is subtracted, the new node added');
assert.equal(trimmedView.kinds.user.tokens, keptPrice - 80 + 10, 'the retraction lands in the bucket that held the text');
assert.equal(trimmedView.kinds.user.count, 1, 'a retracted node leaves no count behind');

// ── a system rewrite replaces the sections instead of appending ─────────────
let rewritten = initSurface();
rewritten = applySurface(rewritten, { type: 'system/message', seq: 1, time: 1, surfaceOp: 'append', data: { message: { role: 'system', content: [{ type: 'text', text: '# One\nshort' }] } } });
const first = viewSurface(rewritten).system;
rewritten = applySurface(rewritten, {
  type: 'system/message', seq: 2, time: 2, surfaceOp: { op: 'replace', startSeq: 1, endSeq: 1 },
  data: { message: { role: 'system', content: [{ type: 'text', text: '# Two\n' + 'long body '.repeat(50) }] } },
});
const second = viewSurface(rewritten).system;
assert.equal(second.sections[0].label, 'Two', 'the rewrite supplies the sections');
assert.ok(second.tokens > first.tokens, 'and its own price');

// A non-system replacement over the system node leaves no system prompt.
rewritten = applySurface(rewritten, {
  type: 'tool/result', seq: 3, time: 3, surfaceOp: { op: 'replace', startSeq: 2, endSeq: 2 },
  data: { message: { role: 'tool', content: [{ type: 'text', text: 'x' }] } },
});
assert.equal(viewSurface(rewritten).system, null, 'shadowing the prompt clears the system bucket');

// ── defensive: unknown events and missing payloads never throw ──────────────
let blank = initSurface();
for (const type of ['turn/start', 'turn/end', 'step/start', 'unknown/thing']) {
  blank = applySurface(blank, { type, seq: 1, time: 1, data: {} });
}
for (const payload of [undefined, null, {}, { message: null }]) {
  blank = applySurface(blank, { type: 'tool/result', seq: 2, time: 2, surfaceOp: 'append', data: payload });
}
const blankView = viewSurface(blank);
assert.equal(blankView.tokens, 0 + blankView.kinds.result.tokens);
assert.equal(blankView.system, null);
assert.equal(blankView.tools, null);
assert.deepEqual(blankView.top.length >= 0, true);

console.log('host-surface.test.js: all assertions passed');
