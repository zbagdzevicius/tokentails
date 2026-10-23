// The Pawlegends target (docs/plans/moba/POC.md §15 item 24): game copy carries no shelter, impact or money words
// (R13, store files exempt), no Tails rate (R8), no token words (R9), no chain or USDC words (R10).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TARGETS, lintRepo, lintSource, loadFacts, surfaceOf, targetFiles } from '../lib/lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const facts = loadFacts(ROOT);
const T = Object.fromEntries(TARGETS.map((t) => [t.name, t]));
const rules = (file, text) => lintSource(file, text, { facts, target: T.pawlegends }).map((f) => f.rule);

test('pawlegends is a target on the game surface with the app-build rules', () => {
  assert.ok(T.pawlegends);
  assert.equal(T.pawlegends.app, true);
  assert.equal(surfaceOf('pawlegends/src/ui/hud.ts'), 'game');
});

test('R13: no shelter, impact or money words in game copy', () => {
  for (const line of [
    "const t = 'Every win helps a shelter';",
    "const t = 'Play for impact';",
    "const t = 'Only $4.99 today';",
    "const t = 'Costs 9.99 EUR';",
    "const t = 'Donate after the match';",
  ]) {
    assert.ok(rules('pawlegends/src/ui/results.ts', line).includes('R13'), line);
  }
  assert.deepEqual(rules('pawlegends/src/ui/results.ts', "const t = 'Victory! Sir Brutus Biscuit coat unlocked';"), []);
  assert.deepEqual(rules('pawlegends/src/ui/hud.ts', "const t = 'Raise your pink paw shield';"), []);
});

test('R13: the store files may show prices; the other rules still apply there', () => {
  assert.deepEqual(rules('pawlegends/src/money/skus.ts', "const t = 'Founder: €9.99, VAT included';"), []);
  assert.deepEqual(rules('pawlegends/src/ui/store.ts', "const t = 'Starter $0.99';"), []);
  assert.ok(rules('pawlegends/src/ui/store.ts', "const t = 'Pay with USDC';").includes('R10'));
});

test('R8, R9 and R10 hold on every Pawlegends string: no Tails rate, token words or chain names', () => {
  assert.ok(rules('pawlegends/src/ui/hud.ts', "const t = '100 Tails = $1';").includes('R8'));
  assert.ok(rules('pawlegends/src/ui/hud.ts', "const t = 'Earn tokens every match';").includes('R9'));
  assert.ok(rules('pawlegends/src/ui/hud.ts', "const t = 'Stellar element';").includes('R10'));
  assert.deepEqual(rules('pawlegends/src/ui/hud.ts', "const t = 'Star element';"), []);
});

test('the target scans src/ (ts and lifted js) but never the sim or tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'copy-lint-pawlegends-'));
  for (const file of ['src/ui/hud.ts', 'src/render/fx/Particles.js', 'src/sim/index.ts', 'src/ui/hud.test.ts', 'tools/budget.mjs']) {
    const abs = join(root, 'pawlegends', file);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "export const t = 'A shelter';\n");
  }
  assert.deepEqual(targetFiles(root, T.pawlegends), ['pawlegends/src/render/fx/Particles.js', 'pawlegends/src/ui/hud.ts']);
  const { byTarget } = lintRepo(root, { targets: [T.pawlegends] });
  assert.equal(byTarget.pawlegends.files, 2);
  assert.equal(byTarget.pawlegends.findings, 2);
});
