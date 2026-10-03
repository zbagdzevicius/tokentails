// Findings of the third 2c review: giver counts from variables, "Explorer Tier" metadata, NFT
// metadata excluded, client lib/constants/context/hooks scanned, `+` joins read as one string.
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractTs } from '../lib/extract.mjs';
import { TARGETS, lintSource, loadFacts, targetFiles } from '../lib/lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const facts = loadFacts(ROOT);
const T = Object.fromEntries(TARGETS.map((t) => [t.name, t]));
const lint = (text, { file = 'client/components/x/Fixture.tsx', target = 'client' } = {}) => lintSource(file, text, { facts, target: T[target] });
const rules = (text, opts) => lint(text, opts).map((f) => f.rule).sort();

test('R6: a giver count from a JSX expression is still a giver count', () => {
  assert.ok(rules('export const A = ({ n }) => <p>{n} donors chipped in</p>;').includes('R6'));
  assert.ok(rules('export const A = ({ n }) => <p>{n.toLocaleString()} supporters</p>;').includes('R6'));
});

test('R6: a giver count from a template span or a + join is still a giver count', () => {
  assert.ok(rules('const t = `${n} players donated to the cause`;').includes('R6'));
  assert.ok(rules('const t = n + " players donated to the cause";').includes('R6'));
  // Counting what Token Tails sent is fine.
  assert.ok(!rules('// claim: L-treats\nconst t = `Token Tails sent ${n} treats`;').includes('R6'));
});

test('R10: "Explorer" as a tier name is not a block explorer; explorer links still are', () => {
  assert.ok(!rules('const t = { name: "Mystery Box - Explorer Tier", description: "Open it for a cat" };').includes('R10'));
  assert.deepEqual(rules('const t = "View on explorer";'), ['R10']);
  assert.deepEqual(rules('const t = "Open the block explorer";'), ['R10']);
  assert.deepEqual(rules('const t = "Explorer link below";'), ['R10']);
  assert.deepEqual(rules('const t = "Check it on stellar.expert";'), ['R10']);
});

test('client-json skips minted NFT metadata', () => {
  const files = targetFiles(ROOT, T['client-json']);
  assert.ok(!files.some((f) => f.startsWith('client/public/utilities/mystery-boxes/')), 'mystery-box metadata is excluded');
  assert.ok(!files.some((f) => f.startsWith('client/public/catnip-chaos/badges/')), 'badge metadata is excluded');
});

test('client target scans lib, constants, context and hooks, never the generated facts', () => {
  const files = targetFiles(ROOT, T.client);
  for (const dir of ['client/lib/', 'client/context/']) assert.ok(files.some((f) => f.startsWith(dir)), `${dir} is scanned`);
  assert.ok(!files.includes('client/lib/facts.generated.ts'));
});

test('extract: a + chain of strings is one copy unit, its other operands are still visited', () => {
  const units = extractTs('x.ts', 'const t = "Every heist " + "funds real shelter cats";\nconst u = a + (b ? "Second sentence here" : "Third one here");');
  assert.deepEqual(units.map((u) => u.text), ['Every heist funds real shelter cats', 'Second sentence here', 'Third one here']);
  assert.ok(rules('const t = "Every heist " + "funds real shelter cats";').includes('R3'));
  // Arithmetic and class names are not copy.
  assert.deepEqual(extractTs('x.ts', 'const w = width + 10; const c = "px-" + size;'), []);
});

test('backend: a + chain in a message is one unit, read once', () => {
  const units = extractTs('backend/src/x.ts', 'throw new BadRequestException("Your heist " + "funds the shelter");', { ruleset: 'backend' });
  assert.deepEqual(units.map((u) => u.text), ['Your heist funds the shelter']);
});
