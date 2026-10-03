// The registry's own public wording passes the claims rules on every surface it lists, so a
// component that renders FACTS[id].display with its id cited can never fail the lint because of
// the registry.
//
// R10 (app builds): on the web surfaces (landing, impact, shelter-payouts) money and chain words
// render through the F7.2 app-build rule (USD equivalent, HELD BY labels), which the client's Claim
// component owns, so the display is checked without R10. The app surfaces (game, heist, store) have
// no Claim component (the Heist is plain DOM), so there the wording the app shows, appDisplay when
// present, is checked with R10, and display is checked as a web-only branch.
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TARGETS, lintSource, loadFacts } from '../lib/lint.mjs';
import { APP_WORDS } from '../lib/rules.mjs';
import { APP_SURFACES, APP_WORDS as SCHEMA_APP_WORDS } from '../../../funding/framework/lib/facts/schema.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const facts = loadFacts(ROOT);
const T = Object.fromEntries(TARGETS.map((t) => [t.name, t]));

const FILE_FOR = {
  landing: ['client/components/landing/RegistryCheck.tsx', 'client'],
  game: ['client/components/game/RegistryCheck.tsx', 'client'],
  impact: ['client/components/impact/RegistryCheck.tsx', 'client'],
  'shelter-payouts': ['client/components/shelter-payouts/RegistryCheck.tsx', 'client'],
  store: ['client/components/store/RegistryCheck.tsx', 'client'],
  heist: ['catnip-heist/src/ui/registry-check.ts', 'heist'],
};

const surfaced = [...facts.values()].filter((f) => f.surfaces.length && !['unverified', 'retired'].includes(f.status));

test('the registry has surfaced entries to check', () => {
  assert.ok(surfaced.length >= 5, `only ${surfaced.length} surfaced entries`);
});

for (const f of surfaced) {
  for (const surface of f.surfaces) {
    const onApp = APP_SURFACES.includes(surface);
    test(`${f.id} display passes the claims rules on "${surface}"${onApp ? ' (app build, R10 included)' : ''}`, () => {
      const [file, target] = FILE_FOR[surface];
      const src = onApp
        ? `// claim: ${f.id}\nexport const text = isWebHost ? ${JSON.stringify(f.display)} : ${JSON.stringify(f.appDisplay || f.display)};\n`
        : `// claim: ${f.id}\nexport const text = ${JSON.stringify(f.display)};\n`;
      const found = lintSource(file, src, { facts, target: T[target] }).filter((x) => onApp || x.rule !== 'R10');
      assert.deepEqual(found.map((x) => `${x.rule}: ${x.message}`), []);
    });
  }
}

test('the registry schema and the copy lint share one app-build word list', () => {
  const show = (list) => list.map((w) => `${w.re} ${w.what}`);
  assert.deepEqual(show(SCHEMA_APP_WORDS), show(APP_WORDS));
});

test('an uncited display still fails, so the check above is not vacuous', () => {
  const f = facts.get('F-011');
  const found = lintSource('client/components/landing/RegistryCheck.tsx', `export const text = ${JSON.stringify(`We have ${f.value.toLocaleString('en-US')} followers`)};\n`, { facts, target: T.client });
  assert.deepEqual(found.map((x) => x.rule), ['R1']);
});
