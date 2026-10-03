// Holes found in the task 2c review: fiction markers hiding real numbers, unrelated ids clearing R1,
// the plan's own Heist rail copy failing, short strings skipped, level copy unscanned, R3 subjects
// after a colon.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractJson, extractTs } from '../lib/extract.mjs';
import { TARGETS, lintRepo, lintSource, loadFacts, targetFiles } from '../lib/lint.mjs';
import { unitMatches } from '../lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const facts = loadFacts(ROOT);
const T = Object.fromEntries(TARGETS.map((t) => [t.name, t]));
const lint = (text, { file = 'client/components/x/Fixture.tsx', target = 'client' } = {}) => lintSource(file, text, { facts, target: T[target] });
const rules = (text, opts) => lint(text, opts).map((f) => f.rule).sort();
const heist = { file: 'catnip-heist/src/ui/x.ts', target: 'heist' };
const landing = { file: 'client/components/landing/X.tsx' };

// ---------- R1 is not cleared by a fiction marker or an unrelated id ----------

test('R1: a claim:fiction marker does not hide a real-world number', () => {
  const found = lint('// claim:fiction game\nexport const A = () => <p>800+ strays saved</p>;', landing);
  assert.ok(found.some((f) => f.rule === 'R1' && /fiction marker does not cover numbers/.test(f.message)), JSON.stringify(found));
  // The same marker still clears R2 on copy with no number.
  assert.deepEqual(rules('// claim:fiction in-game rescue, no money moves\nconst t = "Play games, help real shelter cats";'), []);
});

test('R1: the cited entry must count the same thing as the number', () => {
  const found = lint('// claim: F-011\nexport const A = () => <p>800+ strays saved (Sep 2026)</p>;', landing);
  assert.ok(found.some((f) => f.rule === 'R1' && /counts strays, but the cited F-011 \(followers\)/.test(f.message)), JSON.stringify(found));
  // Players and users count the same people.
  assert.ok(!rules('// claim: F-001\nexport const A = () => <p>540K+ registered users, all time (Apr 2026, company-reported)</p>;', landing).includes('R1'));
  assert.ok(!rules('// claim: F-011\nexport const A = () => <p>181,010 followers on X (Sep 2026)</p>;', landing).includes('R1'));
  // A P- product claim is not a count of anything real.
  assert.ok(rules('// claim: P-001\nexport const A = () => <p>540K+ players</p>;', landing).includes('R1'));
});

test('unit matching: singulars, plurals and groups', () => {
  assert.ok(unitMatches('countries', 'countries'));
  assert.ok(unitMatches('partner countries', 'countries'));
  assert.ok(unitMatches('influencer cats', 'cats'));
  assert.ok(unitMatches('strays', 'cats'));
  assert.ok(unitMatches('users', 'players'));
  assert.ok(!unitMatches('strays', 'followers'));
  assert.ok(!unitMatches('wallets', null));
});

// ---------- the plan's Heist live-rail copy passes ----------

test('the G11 live-rail line passes in a Heist web-only branch, cited to C-004 and L-rail', () => {
  const src = `// claim: C-004, L-rail
export const railLine = () => (isWebHost ? 'Tap and Token Tails sends Pink Paw a treat on Arc' : 'Tap and Token Tails sends Pink Paw a treat');`;
  assert.deepEqual(rules(src, heist), []);
  // Without the branch the app build would show a chain name.
  assert.deepEqual(rules("// claim: C-004, L-rail\nexport const railLine = () => 'Tap and Token Tails sends Pink Paw a treat on Arc';", heist), ['R10']);
});

test('web flags: isWebHost, HEIST_WEB, !isAppHost and if (isWeb) mark web-only text', () => {
  const units = extractTs('x.ts', `const a = HEIST_WEB ? 'Paid on Arc today' : 'Paid today';
    const b = !isAppHost && 'See the wallet page';
    if (cfg.isWebHost) { note = 'Explorer link below'; }`);
  assert.deepEqual(units.map((u) => [u.text, u.webOnly]), [['Paid on Arc today', true], ['Paid today', false], ['See the wallet page', true], ['Explorer link below', true]]);
});

// ---------- short strings get the word rules ----------

test('R8 and R10 read short strings that do not look like prose', () => {
  assert.deepEqual(rules('const rate = "100 Tails = $1";'), ['R8']);
  assert.deepEqual(rules('const rate = "1 USDC = 100 Tails";'), ['R10', 'R8']);
  assert.deepEqual(rules('const r = `${n} Tails = $${usd}`;'), []); // no literal digits: nothing to rate
  assert.deepEqual(rules('const chip = "0.01 USDC";', heist), ['R10']);
  // One-word strings stay out: they are keys, symbols and class names.
  assert.deepEqual(extractTs('x.ts', 'const s = "USDC"; const k = "wallet";'), []);
  // Spaces inside template spans are code, and the hyphenated brand is not the tone word.
  assert.deepEqual(extractTs('x.ts', 'const f = `token-tails-receipt-${data.txHash.slice(2, 10)}.png`;'), []);
  assert.deepEqual(rules('const t = "Share your token-tails receipt card";'), []);
  // Short strings never get the claim rules.
  assert.deepEqual(rules('const t = "800+ strays";'), []);
});

test('JSON short values get the word rules too', () => {
  const units = extractJson('x.json', '{ "rate": "100 Tails = $1", "id": "abc" }');
  assert.deepEqual(units.map((u) => [u.text, !!u.short]), [['100 Tails = $1', true]]);
});

// ---------- Heist level copy ----------

const LEVEL = JSON.stringify({
  meta: {
    title: 'Heist 99: Test Vault',
    objectives: ['Every heist funds real shelters'],
    hints: [{ x0: 1, y0: 1, text: 'Press {swap} to swap cats.' }],
    notTalked: 'Every heist funds real shelters',
  },
  tiles: ['#### ####', '#  S  E #'],
}, null, 2);

test('level files: only meta.title, meta.objectives[] and meta.hints[].text are read', () => {
  const units = extractJson('heist-99.json', LEVEL, { paths: T['heist-levels'].jsonPaths });
  assert.deepEqual(units.map((u) => u.text), ['Heist 99: Test Vault', 'Every heist funds real shelters', 'Press {swap} to swap cats.']);
  const found = lintSource('catnip-heist/src/levels/heist-99.json', LEVEL, { facts, target: T['heist-levels'] });
  assert.deepEqual([...new Set(found.map((f) => f.rule))].sort(), ['R2', 'R3']);
  assert.ok(found.every((f) => f.line === 5), 'only the objective line fails');
});

test('the heist-levels target scans level files but not solutions', () => {
  const root = mkdtempSync(join(tmpdir(), 'copy-lint-levels-'));
  mkdirSync(join(root, 'catnip-heist/src/levels'), { recursive: true });
  writeFileSync(join(root, 'catnip-heist/src/levels/heist-99.json'), LEVEL);
  writeFileSync(join(root, 'catnip-heist/src/levels/heist-99.solution.json'), '{ "note": "Every heist funds real shelters" }');
  assert.deepEqual(targetFiles(root, T['heist-levels']), ['catnip-heist/src/levels/heist-99.json']);
  const { byTarget } = lintRepo(root);
  assert.equal(byTarget['heist-levels'].files, 1);
  assert.ok(byTarget['heist-levels'].findings > 0);
});

// ---------- R3 after a colon ----------

test('R3: the real-world subject can come before a colon', () => {
  assert.ok(rules('const t = "Shelter treats: every heist funds them.";').includes('R3'));
  assert.ok(rules('const t = "Real shelter treats open soon: heists will help fund them.";', heist).includes('R3'));
  // Game-only copy with a money verb is not R3.
  assert.ok(!rules('const t = "Stats: every heist pays out coins.";').includes('R3'));
});
