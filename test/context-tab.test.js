/** Surface contract tests for the context chunk — no DSH runtime needed. Run: node test/context-tab.test.js */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../client.context.js', import.meta.url), 'utf8');

// One session tab only: the Agent family is a card inside the Context tab, so no
// second `conversation.view` registration may come back.
assert.ok(!src.includes("'tc-fleet'"), 'no separate fleet tab id');
assert.ok(!src.includes("label: () => t('fleetTab')"), 'no separate fleet tab label');

// The family card is what the Context tab renders in place of the child-only list.
assert.ok(src.includes('function familyRows('), 'family row builder exists');
assert.ok(
  /h\(AgentNetworkCard, \{\s*t, pricing, tier, currency,\s*sessions:/.test(src),
  'AgentNetworkCard receives pricing, tier and currency',
);
assert.ok(src.includes("t('fleetSelf')") && src.includes("t('fleetParent')") && src.includes("t('fleetChild')"),
  'family roles are labelled');

// Locale hygiene: keys the aggregated card uses stay, the page-only keys are gone.
for (const key of ['fleetCost', 'fleetSelf', 'fleetParent', 'fleetChild', 'fleetTaskNote']) {
  assert.equal(src.split(`${key}:`).length - 1, 2, `${key} must exist in both dictionaries`);
}
for (const key of ['fleetTab', 'fleetTitle', 'fleetMembers', 'fleetRunning', 'fleetChildren',
  'fleetTokens', 'fleetNetwork', 'fleetTimeline', 'fleetEvents', 'fleetEmpty', 'fleetNoEvents']) {
  assert.ok(!src.includes(`${key}:`), `${key} is unused after the merge`);
}

// ── context items card (v1.11) ────────────────────────────────────────────────
// The card is mounted in both Context surfaces (session tab + `/context` modal)
// and fed by the Host's `tcSurface` projection; it must never be re-derived in
// the browser, because the Host prices with the same estimator DSH uses.
assert.equal(src.split("useOptional(useProjection, 'tcSurface')").length - 1, 1,
  'the session tab reads tcSurface from the projection');
assert.equal(src.split("useOptional(props.useProjection, 'tcSurface')").length - 1, 1,
  'the /context modal reads tcSurface too');
assert.equal(src.split('h(SurfaceCard, { t, surface })').length - 1, 2,
  'both surfaces mount the card exactly once');
assert.ok(!src.includes("from '@deepseek-ai/dsh-token-meter"),
  'the browser chunk never imports the Host estimator');
assert.ok(!/estimateSystemMessage\(/.test(src) && !/systemSectionsOf\(/.test(src),
  'pricing and sectioning live on the Host, not in the chunk');

// Locale hygiene for every new key: both dictionaries, one each.
for (const key of ['surfaceTitle', 'surfacePending', 'surfaceSystem', 'surfaceSystemEmpty',
  'surfaceTools', 'surfaceToolsEmpty', 'surfaceKinds', 'surfaceTop', 'surfaceTopEmpty',
  'surfaceKindUser', 'surfaceKindAssistant', 'surfaceKindReasoning',
  'surfaceKindCall', 'surfaceKindResult', 'surfaceKindDeveloper', 'surfaceKindOther',
  'surfaceSim', 'surfaceApprox', 'surfaceSearch', 'surfaceSortTokens', 'surfaceSortName',
  'surfaceCompose', 'surfaceOfContext', 'surfaceOfBucket', 'surfaceUnitChars',
  'surfaceUnitSections', 'surfaceUnitTools', 'surfaceUnitItems',
  'surfaceColName', 'surfaceColTokens', 'surfaceColShare']) {
  assert.equal(src.split(`${key}:`).length - 1, 2, `${key} must exist in both dictionaries`);
  // Kind labels are reached through the `kindLabels` map, so a bare string
  // literal counts as a use alongside a direct `t('…')` call.
  assert.ok(src.includes(`t('${key}')`) || src.includes(`'${key}'`), `${key} must be used`);
}

// The card must let the reader read the item, not just its size: every row is
// an expandable button whose body is the item's own text, and the body is
// searched along with the label so "where does it say X" works.
assert.ok(src.includes('tc-item-head'), 'item rows are expandable buttons');
assert.ok(/'aria-expanded': expanded/.test(src), 'rows expose their open state');
assert.ok(src.includes('tc-item-text') && src.includes('tc-item-body'),
  'the expanded row renders the item body');
assert.ok(/\.tc-item-text\{/.test(src), 'the body gets its own monospace, scrollable style');
for (const key of ['surfaceTapHint', 'surfaceBodyEmpty', 'surfaceBodyTruncated']) {
  assert.equal(src.split(`${key}:`).length - 1, 2, `${key} must exist in both dictionaries`);
}
// Searching covers the body, not only the label.
assert.ok(/hit\(row, row\.text, row\.hint, row\.body\)/.test(src),
  'the filter matches the body text too');
// All three tabs render the expandable rows, so no tab silently loses the body.
assert.equal((src.match(/renderRows\((toolList|sectionRows|topRows)/g) || []).length, 3,
  'every tab renders expandable rows');
// The system tab is the default: "what does the prompt say" is the question the
// card exists to answer.
assert.ok(/React\.useState\('system'\)/.test(src), 'the system-prompt tab opens by default');

// ── visual hierarchy (v1.12) ─────────────────────────────────────────────────
// Four levels, each answering a different question, in reading order:
// whole window → which bucket → the bucket's own scale → the item.
assert.ok(src.includes("className: 'tc-compose'") && /tc-compose\{/.test(src.replace(/\n/g, '')),
  'level 1: one band for the whole window');
assert.ok(src.includes("className: 'tc-tabbar'") && src.includes("className: 'tc-tab'"),
  'level 2: the bucket selector is its own tab bar');
assert.ok(src.includes("className: 'tc-subbar'"), 'level 3: the current bucket shows its own total');
assert.ok(src.includes("className: 'tc-item-cols'"),
  'level 4: labelled columns, so the right-hand numbers are not anonymous');
// Each row carries both a relative magnitude (bar vs the biggest row) and an
// absolute share (of the bucket), computed from the bucket total, not the row max.
assert.ok(src.includes("className: 'tc-item-share'") && /pct\(row\.value, tabTotal\)/.test(src),
  'each row states its share of the bucket');
assert.ok(/width: pct\(row\.value, rows\[0\]\?\.value \|\| 1\)/.test(src),
  'each row bar is relative to the biggest row');
// The lead row keeps full-strength treatment so the list has a head.
assert.ok(/data-lead/.test(src) && /\.tc-item\[data-lead='true'\]/.test(src),
  'the largest row is visually the lead');
// A hint column answers "what is in it" without opening the row.
assert.ok(src.includes("className: 'tc-item-hint'") && /function hintOf\(text, label\)/.test(src),
  'rows carry a normalized one-line gist');
assert.ok(/raw\.replace\(HINT_RULES/.test(src), 'the gist strips the section banner decoration');
// Narrow is a container fact: the same card is full-width in the tab and ~380px
// in the right sidebar, so degradation must come from container queries.
assert.ok(/container-type:\s*inline-size/.test(src), 'the card body is a size container');
assert.ok(/@container \(max-width:460px\)/.test(src) && /@container \(max-width:820px\)/.test(src),
  'narrow layouts drop the gist, then the bar');
// The two summary blocks must not both claim to be "the window": kinds is the
// message bucket's own breakdown and only shows on that tab.
assert.ok(/tab !== 'top'/.test(src), 'message-kind split belongs to the messages tab');

// ── card rows fill edge to edge ──────────────────────────────────────────────
// A 12-column grid leaves a hole whenever a row's spans do not add up to 12: a
// lone col-4 after a card that rendered nothing, or col-4 + col-4 with nothing
// after it. Rows are flex instead, the span is the grow weight, and the leftover
// width of a short row goes back to the cards in it.
assert.match(src, /\.tc-grid\{display:flex;flex-wrap:wrap/, 'card rows are flex, not a 12-column grid');
assert.ok(!src.includes('grid-column:span'), 'no grid-column spans left behind');
for (const span of ['3', '4', '6', '8', '9', '12']) {
  assert.ok(src.includes(`.tc-col-${span}{flex:${span} 1 `), `col-${span} keeps its span as a flex weight`);
}
assert.match(src, /@media \(max-width:820px\)\{\.tc-grid>\*\{flex-basis:100%/,
  'phones drop to one card per row by basis, not by a grid span override');

console.log('ok — the Context tab aggregates the Agent family card; no fleet tab');
