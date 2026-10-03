import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TARGETS, lintSource, loadFacts, scanMarkers, surfaceOf } from '../lib/lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const facts = loadFacts(ROOT);
const T = Object.fromEntries(TARGETS.map((t) => [t.name, t]));

const lint = (text, { file = 'client/components/x/Fixture.tsx', target = 'client', toneExempt = false } = {}) =>
  lintSource(file, text, { facts, target: T[target], toneExempt });
const rules = (text, opts) => lint(text, opts).map((f) => f.rule).sort();

test('R1: real-world magnitudes need a fact id within 3 lines', () => {
  assert.deepEqual(rules('const s = { value: "540K+", label: "Registered players, all time" };'), ['R1']);
  assert.deepEqual(rules('export const A = () => <p>We have 181,010 followers on X</p>;'), ['R1']);
  // Cited, labelled and dated: clean.
  assert.deepEqual(rules('// claim: F-001\nconst s = { value: "540K+", label: "Registered players, all time (Apr 2026, company-reported)" };', { file: 'client/components/landing/Proof.tsx' }), []);
  // Game numbers are not claims.
  assert.deepEqual(rules('export const A = () => <p>Top 100 players this season</p>;'), []);
  assert.deepEqual(rules('export const A = () => <p>Free the shelter cat for +50.</p>;'), []);
});

test('R2: a real-world noun with an impact verb needs a claim id or a fiction marker with a reason', () => {
  assert.deepEqual(rules('const t = "Every run helps real shelter cats";'), ['R2']);
  assert.ok(rules('const t = "Play games, help real shelter cats";').includes('R2'));
  assert.deepEqual(rules('// claim:fiction in-game rescue, no money moves\nconst t = "Play games, help real shelter cats";'), []);
  const bare = lint('// claim:fiction\nconst t = "Play games, help real shelter cats";');
  assert.ok(bare.some((f) => f.rule === 'R2' && /needs a reason/.test(f.message)));
  assert.ok(bare.some((f) => f.rule === 'R2' && /no claim id/.test(f.message)), 'a marker without a reason covers nothing');
});

test('R3: Token Tails is the subject of money verbs', () => {
  assert.ok(rules('const t = "Every heist funds a real shelter";').includes('R3'));
  assert.ok(rules('const t = "Your purchase pays for shelter food";').includes('R3'));
  assert.ok(!rules('// claim: C-004\nconst t = "Tap and Token Tails will send Pink Paw a treat from real shelter funds soon";', { file: 'catnip-heist/src/ui/x.ts', target: 'heist' }).includes('R3'));
  assert.ok(!rules('const t = "Send Pink Paw a rescue treat";').includes('R3'));
});

test('R4: a future-tense claim cannot say money moves now', () => {
  const payouts = { file: 'client/components/shelter-payouts/x.tsx' };
  assert.deepEqual(rules('// claim: C-001\nconst t = "Token Tails sends Pink Paw a treat every day";', payouts), ['R4']);
  assert.deepEqual(rules('// claim: C-001\nconst t = "From 2 Oct, Token Tails sends Pink Paw a treat every day";', payouts), []);
  // C-004 and C-005 are config amounts in the present tense; whether the rail is live is L-rail.
  assert.deepEqual(rules('// claim: C-004, L-rail\nconst t = "Tap and Token Tails sends Pink Paw a treat";', { file: 'catnip-heist/src/ui/x.ts', target: 'heist' }), []);
});

test('R5: cited ids exist, are public and list the surface', () => {
  assert.match(lint('// claim: F-999\nconst x = 1;')[0].message, /not in funding\/framework\/facts\/facts.json/);
  assert.match(lint('// claim: F-024\nconst x = 1;')[0].message, /unverified: it can't be shown/);
  assert.match(lint('// claim: F-017\nconst x = 1;')[0].message, /retired/);
  assert.match(lint('<p data-claim="F-011">x</p>', { file: 'catnip-heist/src/ui/x.ts', target: 'heist' })[0].message, /"heist" surface/);
  assert.deepEqual(lint('<p data-claim="F-011">x</p>', { file: 'client/components/landing/A.tsx' }), []);
});

test('R6: no giver counts', () => {
  assert.ok(rules('const t = "1,200 donors this month";').includes('R6'));
  assert.ok(rules('const t = "300 players have donated";').includes('R6'));
});

test('R7: a money goal cites its C- goal entry', () => {
  assert.ok(rules('const t = "Our goal: 500 USDC for Pink Paw";', { target: 'cms', file: 'cms/models/x.ts' }).includes('R7'));
  assert.deepEqual(rules('// claim: C-001\nconst t = "Our goal: 90 USDC for Pink Paw";', { target: 'cms', file: 'cms/models/x.ts' }), []);
});

test('R8: Tails-to-money rates are banned everywhere, even in legacy files', () => {
  assert.deepEqual(rules('const t = "1 badge = 300 Tails per month";', { toneExempt: true }), ['R8']);
  assert.deepEqual(rules('const t = "1000 Tails = €1 of rescue";', { toneExempt: true }), ['R8']);
  assert.deepEqual(rules("const t = \"Tails have no cash value. You can't buy, sell or withdraw them.\";"), []);
});

test('R9: G5 tone words, but not the brand, auth tokens, legacy or the Vault', () => {
  for (const w of ['$TAILS', 'airdrop', 'TGE', 'listing', 'MNT', 'allocation', 'tokens']) {
    assert.deepEqual(rules(`const t = "Win ${w} every week";`), ['R9'], w);
  }
  assert.deepEqual(rules('const t = "Token Tails is a rescue game";'), []);
  assert.deepEqual(rules('throw new UnauthorizedException("App Check token is invalid");', { target: 'backend', file: 'backend/src/user/user.controller.ts' }), []);
  assert.deepEqual(rules('const t = "Win $TAILS every week";', { toneExempt: true }), []);
});

test('R10: app-build words, except in isApp web branches and web-only files', () => {
  assert.deepEqual(rules('const t = "Each treat: 0.01 USDC";'), ['R10']);
  assert.deepEqual(rules('const t = "View on explorer";'), ['R10']);
  assert.deepEqual(rules('const t = "Tx 0xabc123def456 confirmed";'), ['R10']);
  assert.deepEqual(rules('export const A = () => <p>{isApp ? "Held by Token Tails" : "Held by Token Tails on Arc"}</p>;'), []);
  assert.deepEqual(rules('export const A = () => <div>{!isApp && <p>Split on-chain by ShelterSplit</p>}</div>;'), []);
  assert.deepEqual(rules('export const A = () => <div>{isApp && <p>Split on-chain by ShelterSplit</p>}</div>;'), ['R10']);
  assert.deepEqual(rules('// copy-lint: web-only the payouts explorer page is not in the app menu\nconst t = "View on explorer";'), []);
  assert.deepEqual(rules('const t = "View on explorer";', { target: 'backend', file: 'backend/src/x.ts' }), [], 'backend strings are not app-scoped');
});

test('R11 and R12: SEI history says SEI; company-reported and dated', () => {
  assert.deepEqual(rules('// copy-lint: web-only test\n// claim: F-003\nconst s = { value: "324K+", label: "active wallets in the peak week (Nov 2025)" };', { file: 'client/components/landing/A.tsx' }), ['R11']);
  assert.deepEqual(rules('// claim: F-001\nconst s = { value: "540K+", label: "registered players (Apr 2026)" };', { file: 'client/components/landing/A.tsx' }), ['R12']);
  assert.deepEqual(rules('// claim: F-011\nconst s = { value: "180K+", label: "on X" };', { file: 'client/components/landing/A.tsx' }), ['R12']);
});

test('copy-lint-ignore needs rule ids and a reason', () => {
  assert.deepEqual(rules('// copy-lint-ignore R10 the address copy button shows the user their own address\nconst t = "Wallet address copied";'), []);
  const bare = lint('// copy-lint-ignore R10\nconst t = "Wallet address copied";');
  assert.deepEqual(bare.map((f) => f.rule), ['R10', 'R10']);
});

test('JSON copy honours an object claim id', () => {
  const file = 'client/public/x/card.json';
  assert.deepEqual(lintSource(file, JSON.stringify({ title: 'Win $TAILS tokens today' }), { facts, target: T['client-json'] }).map((f) => f.rule), ['R9']);
  assert.deepEqual(lintSource(file, JSON.stringify({ claim: 'F-099', text: 'hello there friend' }), { facts, target: T['client-json'] }).map((f) => f.rule), ['R5']);
});

test('markers and surfaces', () => {
  const m = scanMarkers('// claim: F-003, F-004\n<p data-claim="F-011" />\nconst x = FACTS["C-001"];\n{/* claim:fiction in-game */}');
  assert.deepEqual(m.ids.map((x) => `${x.id}@${x.line}`), ['F-003@1', 'F-004@1', 'F-011@2', 'C-001@3']);
  assert.deepEqual(m.fiction, [{ line: 4, reason: 'in-game' }]);
  assert.equal(surfaceOf('client/pages/index.tsx'), 'landing');
  assert.equal(surfaceOf('client/components/shelter-payouts/GiveTreat.tsx'), 'shelter-payouts');
  assert.equal(surfaceOf('catnip-heist/src/ui/ui.ts'), 'heist');
  assert.equal(surfaceOf('client/components/codex/Codex.tsx'), 'game');
});
