// Plan F11 / G11 acceptance: the seed fixtures (the old lines) fail, the rewritten lines pass.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TARGETS, lintSource, loadFacts } from '../lib/lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const facts = loadFacts(ROOT);
const target = (name) => TARGETS.find((t) => t.name === name);

function lintFixture(name, targetName = 'client') {
  const text = readFileSync(join(HERE, '..', 'fixtures', 'seed', name), 'utf8');
  // A path outside every surface, so R5 checks ids exist and may be shown but not the surface.
  return lintSource(`tools/copy-lint/fixtures/seed/${name}`, text, { facts, target: target(targetName) });
}

const rules = (findings) => [...new Set(findings.map((f) => f.rule))].sort();

test('ui.ts:274 (old Heist title footer) fails as an uncited present-tense impact claim', () => {
  const found = lintFixture('heist-ui-274.before.ts', 'heist');
  assert.deepEqual(rules(found), ['R2']);
  assert.ok(found.every((f) => f.line === 3));
});

test('ui.ts:732 (old win-screen small print and payouts link) fails on both strings', () => {
  const found = lintFixture('heist-ui-732.before.ts', 'heist');
  assert.deepEqual(rules(found), ['R2', 'R3']);
  const texts = found.map((f) => f.text);
  assert.ok(texts.includes('Play to save: heists help fund real shelter rescues.'));
  assert.ok(texts.includes('Every heist funds a real shelter: see payouts'));
});

test('AboutUsModal.tsx:51-53 fails: "Each card you collect and trade helps fund rescue operations"', () => {
  const found = lintFixture('AboutUsModal.before.tsx');
  assert.deepEqual(rules(found), ['R2', 'R3']);
  assert.match(found[0].text, /^Digital Trading Cards: Collect unique Token Tails cards/);
});

test('ProofSection.tsx:253-255 fails: "Every visit and every share routed real support to shelters"', () => {
  const found = lintFixture('ProofSection.before.tsx');
  assert.deepEqual(rules(found), ['R2', 'R3']);
  assert.ok(found.some((f) => /Every … routed/.test(f.message)));
});

for (const [name, t] of [['heist-ui.after.ts', 'heist'], ['AboutUsModal.after.tsx', 'client'], ['ProofSection.after.tsx', 'client']]) {
  test(`${name} passes`, () => {
    assert.deepEqual(lintFixture(name, t), []);
  });
}

test('the live seed lines in the tree are the rewritten ones', () => {
  const ui = readFileSync(join(ROOT, 'catnip-heist/src/ui/ui.ts'), 'utf8');
  assert.ok(!ui.includes('every heist helps real shelter cats'), 'ui.ts:274 still has the old present-tense claim');
  assert.ok(!ui.includes('heists help fund real shelter rescues'), 'ui.ts:732 still has the old present-tense claim');
});
