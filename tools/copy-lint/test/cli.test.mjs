import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../bin/copy-lint.mjs';
import { globToRegExp, lintRepo } from '../lib/lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'copy-lint-'));
  const put = (p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); };
  put('funding/framework/facts/facts.json', readFileSync(join(ROOT, 'funding/framework/facts/facts.json'), 'utf8'));
  put('client/components/game/Win.tsx', 'export const W = () => <p>WIN $TAILS NOW</p>;\n');
  put('client/components/legacy/Old.tsx', 'export const O = () => <p>Airdrop soon</p>;\n');
  put('client/components/game/Win.test.tsx', 'export const T = () => <p>WIN $TAILS NOW</p>;\n');
  put('client/components/game/node_modules/x/y.tsx', 'export const T = () => <p>WIN $TAILS NOW</p>;\n');
  put('catnip-heist/src/ui/ui.ts', "const t = 'Every heist funds a real shelter';\n");
  put('backend/src/user/user.controller.ts', "throw new BadRequestException('Claimed 5 $TAILS');\n");
  put('client/public/badges/b.json', '{ "name": "Mystery box airdrop tier" }\n');
  return root;
}

test('globs', () => {
  assert.ok(globToRegExp('client/components/**/*.{ts,tsx}').test('client/components/a/b/C.tsx'));
  assert.ok(globToRegExp('client/components/**/*.{ts,tsx}').test('client/components/C.ts'));
  assert.ok(!globToRegExp('client/components/**/*.{ts,tsx}').test('client/components/C.json'));
  assert.ok(globToRegExp('**/vault/**').test('client/components/vault/Vault.tsx'));
});

test('lintRepo scans every target, skips tests, node_modules and exempts legacy tone', () => {
  const { findings, byTarget } = lintRepo(fixtureRepo());
  const where = findings.map((f) => `${f.file}:${f.rule}`).sort();
  assert.deepEqual(where, [
    'backend/src/user/user.controller.ts:R9',
    'catnip-heist/src/ui/ui.ts:R2',
    'catnip-heist/src/ui/ui.ts:R3',
    'client/components/game/Win.tsx:R9',
    'client/public/badges/b.json:R9',
  ]);
  assert.equal(byTarget.client.files, 2);
});

test('CLI exit codes: findings fail, --warn passes; github and markdown formats', () => {
  const root = fixtureRepo();
  const out = [];
  const log = (s) => out.push(s);
  assert.equal(main(['--root', root], { log, err: log }), 1);
  assert.equal(main(['--root', root, '--warn'], { log, err: log }), 0);
  out.length = 0;
  assert.equal(main(['--root', root, '--warn', '--format', 'github'], { log, err: log }), 0);
  assert.match(out[0], /^::warning file=backend\/src\/user\/user.controller.ts,line=1,title=copy-lint R9::/m);
  out.length = 0;
  assert.equal(main(['--root', root, '--format', 'github'], { log, err: log }), 1);
  assert.match(out[0], /^::error file=backend\/src\/user\/user.controller.ts,line=1,title=copy-lint R9::/m, 'fail mode annotates errors');
  const md = join(root, 'report.md');
  main(['--root', root, '--warn', '--format', 'markdown', '--out', md], { log: () => {}, err: log });
  assert.match(readFileSync(md, 'utf8'), /\| R9 \| Rescue tone/);
  assert.equal(main(['--root', root, 'client/components/game/Win.tsx'], { log: () => {}, err: log }), 1, 'file arguments limit the scan');
  assert.equal(main(['--root', root, 'client/components/legacy/Old.tsx'], { log: () => {}, err: log }), 0);
  assert.equal(main(['--bogus'], { log: () => {}, err: () => {} }), 2);
});

test('explicit files outside every target are reported as not scanned, not silently clean', () => {
  const root = fixtureRepo();
  const { skipped, files } = lintRepo(root, { only: ['client/components/game/Win.tsx', 'tools/copy-lint/fixtures/x.ts'] });
  assert.equal(files, 1);
  assert.deepEqual(skipped, ['tools/copy-lint/fixtures/x.ts']);
  const errs = [];
  const code = main(['--root', root, '--warn', 'tools/copy-lint/fixtures/x.ts'], { log: () => {}, err: (m) => errs.push(m) });
  assert.equal(code, 0);
  assert.match(errs.join('\n'), /not scanned .*tools\/copy-lint\/fixtures\/x\.ts/);
  assert.deepEqual(lintRepo(root).skipped, []);
});
