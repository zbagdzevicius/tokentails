// Findings of the fifth 2c review (fixed in pass 6): a `claim:fiction` marker needs a real reason,
// and the CLI never prints "clean" when it scanned nothing.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../bin/copy-lint.mjs';
import { TARGETS, fictionReasonOk, lintSource, loadFacts } from '../lib/lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const facts = loadFacts(ROOT);
const client = TARGETS.find((t) => t.name === 'client');
const lint = (text) => lintSource('client/components/x/Fixture.tsx', text, { facts, target: client });
const CLAIM = "const t = 'Every game you play funds a real shelter';";

test('claim:fiction: a short reason covers nothing and is reported', () => {
  for (const marker of ['// claim:fiction x', '// claim:fiction ok', '// claim:fiction game story', '// claim:fiction a b c']) {
    const found = lint(`${marker}\n${CLAIM}\n`);
    assert.ok(found.some((f) => f.rule === 'R2' && /too short/.test(f.message)), `${marker}: the marker is reported`);
    assert.ok(found.some((f) => f.rule === 'R2' && /real-world impact claim/.test(f.message)), `${marker}: the claim is still caught`);
  }
});

test('claim:fiction: a reason of 3+ words and 10+ characters suppresses R2', () => {
  for (const marker of ['// claim:fiction in-game rescue, no money moves', '{/* claim:fiction Tails are in-game points */}']) {
    assert.deepEqual(lint(`${marker}\n${CLAIM}\n`).filter((f) => f.rule === 'R2'), [], marker);
  }
  assert.equal(fictionReasonOk('in-game story only'), true);
  assert.equal(fictionReasonOk('- - - -'), false);
  assert.equal(fictionReasonOk(''), false);
});

function io() {
  const out = []; const errs = [];
  return { out, errs, opts: { log: (s) => out.push(s), err: (s) => errs.push(s) } };
}

test('cli: naming only files outside the targets prints "no files scanned", never "clean"', () => {
  const seed = 'tools/copy-lint/fixtures/seed/AboutUsModal.before.tsx';
  const a = io();
  assert.equal(main([seed, '--root', ROOT], a.opts), 2);
  assert.match(a.errs.join('\n'), /no files scanned/);
  assert.doesNotMatch(a.out.join('\n'), /clean/);
  const b = io();
  assert.equal(main([seed, '--root', ROOT, '--allow-empty'], b.opts), 0);
  assert.match(b.out.join('\n'), /no files scanned/);
  const c = io();
  const out = join(mkdtempSync(join(tmpdir(), 'copy-lint-')), 'r.md');
  assert.equal(main([seed, '--root', ROOT, '--warn', '--out', out], c.opts), 0);
  assert.match(readFileSync(out, 'utf8'), /no files scanned/);
});

test('cli: a scan with no file list and no findings still says clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'copy-lint-'));
  writeFileSync(join(root, 'x.txt'), '');
  const a = io();
  assert.equal(main(['--root', root], a.opts), 0);
  assert.match(a.out.join('\n'), /clean/);
});
