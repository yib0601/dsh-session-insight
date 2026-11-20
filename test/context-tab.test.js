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

console.log('ok — the Context tab aggregates the Agent family card; no fleet tab');
