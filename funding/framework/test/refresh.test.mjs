import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_FACTS = join(HERE, '..', 'facts', 'FACTS.md');
const REAL_SOURCES = join(HERE, '..', 'facts', 'sources.json');
const tmp = mkdtempSync(join(tmpdir(), 'fund-refresh-'));
mkdirSync(join(tmp, 'apps'));
process.env.FUND_APPS_DIR = join(tmp, 'apps');
process.env.FUND_TRACKER = join(tmp, 'TRACKER.md');
process.env.FUND_FACTS = join(tmp, 'FACTS.md');
process.env.FUND_SOURCES = join(tmp, 'sources.json');
process.env.VERIFY_AI_MARKER = join(tmp, 'ai-called.txt');
process.env.FUND_AI_CMD = `node "${join(HERE, 'fixtures', 'verify-ai-stub.mjs')}"`;
process.env.FUND_NOW = '2026-10-02T09:00:00Z';
process.env.FUND_REFRESH_TIMEOUT_MS = '400';

const R = await import('../lib/facts-refresh.mjs');
const { main } = await import('../bin/fund.mjs');
const realFactsBefore = readFileSync(REAL_FACTS, 'utf8');

let stellarTotal = [1000000, 230000];
const server = createServer((req, res) => {
  const json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/stellar/cat') return json({ functions: stellarTotal.map((n, i) => ({ function: `f${i}`, invocations: n })) });
  if (req.url === '/stellar/blessing') return json({ functions: [{ invocations: 3 }] });
  if (req.url.startsWith('/itunes')) return json({ resultCount: 1, results: [{ sellerName: 'Token Tails, MB' }] });
  if (req.url === '/play') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>id=com.tokentails.app</html>'); }
  if (req.url === '/contracts') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>Contract not found</html>'); }
  if (req.url === '/broken') { res.writeHead(500); return res.end(); }
  if (req.url === '/hang') return; // never answers
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });

const SOURCES = {
  _readme: 'ignored',
  'F-007': { kind: 'json', url: `${base}/stellar/cat`, path: 'functions[*].invocations', reduce: 'sum', format: 'number', monotonic: 'increasing' },
  'F-008': { kind: 'json', url: `${base}/stellar/blessing`, path: 'functions.0.invocations', format: 'number' },
  'F-015': { kind: 'json', url: `${base}/itunes?id=1`, path: 'results.0.sellerName', match: 'Token Tails' },
  'F-016': { kind: 'contains', url: `${base}/play`, contains: ['com.tokentails.app'] },
  'F-009': { kind: 'contains', url: `${base}/contracts`, contains: ['CBHOJOPZ'] },
  'F-018': { kind: 'status', url: `${base}/broken` },
  'F-019': { kind: 'json', url: `${base}/hang`, path: 'x', format: 'number' },
};
beforeEach(() => {
  copyFileSync(REAL_FACTS, process.env.FUND_FACTS);
  writeFileSync(process.env.FUND_SOURCES, JSON.stringify(SOURCES));
  stellarTotal = [1000000, 230000];
});
const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));
const row = (text, id) => text.split('\n').find((l) => l.startsWith(`| ${id} |`));
async function quiet(fn) {
  const log = console.log; const out = [];
  console.log = (...a) => out.push(a.join(' '));
  try { return { code: await fn(), out: out.join('\n') }; } finally { console.log = log; }
}

test('helpers: first number, replace keeping format, dotted/wildcard paths, in-place row update', () => {
  assert.equal(R.firstNumber('1,218,693'), 1218693);
  assert.equal(R.firstNumber('3 / 5'), 3);
  assert.equal(R.firstNumber('542k users'), 542000);
  assert.equal(R.replaceFirstNumber('3 / 5', 4), '4 / 5');
  assert.equal(R.replaceFirstNumber('1,218,693', 1230000), '1,230,000');
  assert.deepEqual(R.getPath({ a: [{ b: 1 }, { b: 2 }] }, 'a[*].b'), [1, 2]);
  assert.equal(R.getPath({ results: [{ s: 'x' }] }, 'results.0.s'), 'x');
  const text = '| ID | x |\n| F-001 | A | 1 | s | 2026 | unverified |\n| F-002 | B | 2 | s | 2026 | verified |\n';
  const out = R.updateFactRow(text, 'F-002', { value: '3', date: '2026-10-02' });
  assert.equal(out.split('\n')[1], text.split('\n')[1]);
  assert.equal(out.split('\n')[2], '| F-002 | B | 3 | s | 2026-10-02 | verified |');
  assert.throws(() => R.updateFactRow(text, 'F-099', {}), /not found/);
});

test('refreshFacts reports CONFIRMED / DRIFT / FAILED and changes nothing without --write', async () => {
  const before = readFileSync(process.env.FUND_FACTS, 'utf8');
  const { results, wrote } = await R.refreshFacts({ now: new Date('2026-10-02T09:00:00Z') });
  const r = byId(results);
  assert.equal(r['F-007'].outcome, 'DRIFT');
  assert.match(r['F-007'].detail, /1,218,693 → 1,230,000/);
  assert.equal(r['F-008'].outcome, 'CONFIRMED');
  assert.equal(r['F-015'].outcome, 'CONFIRMED');
  assert.equal(r['F-016'].outcome, 'CONFIRMED');
  assert.equal(r['F-009'].outcome, 'DRIFT', 'page no longer contains the contract id');
  assert.equal(r['F-018'].outcome, 'FAILED');
  assert.match(r['F-018'].detail, /HTTP 500/);
  assert.equal(r['F-019'].outcome, 'FAILED');
  assert.match(r['F-019'].detail, /timeout/);
  assert.equal(wrote, 0);
  assert.equal(readFileSync(process.env.FUND_FACTS, 'utf8'), before);
});

test('--write updates value, date and status of probed rows only, byte-for-byte elsewhere', async () => {
  const before = readFileSync(process.env.FUND_FACTS, 'utf8');
  const { results, wrote } = await R.refreshFacts({ write: true, now: new Date('2026-10-02T09:00:00Z') });
  const after = readFileSync(process.env.FUND_FACTS, 'utf8');
  assert.equal(row(after, 'F-007'), '| F-007 | Stellar Cat contract invocations since 2025-01-12 | 1,230,000 | stellar.expert/explorer/public/contract/CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF | 2026-10-02 | verified |');
  assert.match(row(after, 'F-015'), /\| 2026-10-02 \| verified \|$/);
  assert.match(row(after, 'F-016'), /\| 2026-10-02 \| verified \|$/);
  assert.equal(row(after, 'F-009'), row(before, 'F-009'), 'yes/no drift is never auto-written');
  assert.equal(row(after, 'F-018'), row(before, 'F-018'));
  const changed = after.split('\n').filter((l, i) => l !== before.split('\n')[i]).map((l) => l.slice(0, 7));
  assert.deepEqual(changed.sort(), ['| F-007', '| F-008', '| F-015', '| F-016']);
  assert.equal(wrote, 4);
  assert.ok(results.find((x) => x.id === 'F-007').written);
});

test('a smaller number on a monotonic counter is DRIFT but never written', async () => {
  stellarTotal = [1000];
  const { results } = await R.refreshFacts({ write: true, only: ['F-007'] });
  assert.equal(results[0].outcome, 'DRIFT');
  assert.match(results[0].detail, /decreased/);
  assert.equal(results[0].written, false);
  assert.match(row(readFileSync(process.env.FUND_FACTS, 'utf8'), 'F-007'), /1,218,693/);
});

test('--only filters; unknown ids FAIL; --offline fetches nothing', async () => {
  const { results } = await R.refreshFacts({ only: ['F-015', 'F-024', 'F-999'] });
  const r = byId(results);
  assert.deepEqual(Object.keys(r).sort(), ['F-015', 'F-024', 'F-999']);
  assert.equal(r['F-015'].outcome, 'CONFIRMED');
  assert.match(r['F-024'].detail, /no probe/);
  assert.match(r['F-999'].detail, /no such fact/);
  const off = await R.refreshFacts({ offline: true });
  assert.ok(off.results.every((x) => x.outcome === 'SKIPPED'));
});

test('fund refresh command: exit codes and next-step lines', async () => {
  let { code, out } = await quiet(() => main(['refresh', '--offline']));
  assert.equal(code, 0);
  assert.match(out, /SKIPPED/);
  assert.match(out, /next: fund refresh /);
  ({ code, out } = await quiet(() => main(['refresh', '--only', 'F-007,F-015'])));
  assert.equal(code, 1, 'unwritten drift exits 1');
  assert.match(out, /! DRIFT\s+F-007/);
  assert.match(out, /✓ CONFIRMED F-015/);
  assert.match(out, /next: fund refresh --write/);
  ({ code, out } = await quiet(() => main(['refresh', '--only', 'F-007,F-015', '--write'])));
  assert.equal(code, 0, out);
  assert.match(out, /2 row\(s\) written/);
  assert.match(out, /next: fund verify --all/);
  ({ code } = await quiet(() => main(['refresh', '--only', 'F-018'])));
  assert.equal(code, 1, 'failed probe exits 1');
  const j = await quiet(() => main(['refresh', '--only', 'F-016', '--json']));
  assert.equal(JSON.parse(j.out).results[0].outcome, 'CONFIRMED');
  assert.ok(!existsSync(process.env.VERIFY_AI_MARKER), 'refresh must not call AI');
});

test('shipped facts/sources.json: valid probes for real facts, no keys in URLs, real FACTS.md untouched', () => {
  const src = JSON.parse(readFileSync(REAL_SOURCES, 'utf8'));
  const facts = R.readFactRows(REAL_FACTS);
  const ids = Object.keys(src).filter((k) => /^F-\d{3}$/.test(k));
  assert.ok(ids.length >= 4);
  for (const id of ids) {
    const p = src[id];
    assert.ok(facts.has(id), `${id} not in FACTS.md`);
    assert.ok(['json', 'contains', 'regex', 'status'].includes(p.kind || 'json'), id);
    assert.match(p.url, /^https:\/\//, id);
    assert.doesNotMatch(p.url, /[?&](api[_-]?key|apikey|token|key)=/i, `${id} url carries a key`);
  }
  // Live-tested on 2026-09-26 against stellar.expert: top-level invocations counter.
  assert.equal(src['F-007'].path, 'invocations');
  assert.ok(!src['F-007'].untested);
  assert.equal(readFileSync(REAL_FACTS, 'utf8'), realFactsBefore);
});

// ---------- regressions found by the adversarial validator ----------

test('regression: a wildcard path that matches nothing FAILS instead of writing 0', async () => {
  writeFileSync(process.env.FUND_SOURCES, JSON.stringify({ 'F-008': { kind: 'json', url: `${base}/itunes?x`, path: 'functions[*].invocations', reduce: 'sum', format: 'number' } }));
  const { results } = await R.refreshFacts({ write: true });
  assert.equal(results[0].outcome, 'FAILED');
  assert.match(results[0].detail, /not found/);
  assert.match(row(readFileSync(process.env.FUND_FACTS, 'utf8'), 'F-008'), /\| 3 \/ 5 \|/);
});

test('regression: malformed sources.json and invalid FUND_NOW give clear errors; --only without ids exits 2', async () => {
  writeFileSync(process.env.FUND_SOURCES, '{nope');
  await assert.rejects(R.refreshFacts({ offline: true }), /sources\.json is not valid JSON/);
  writeFileSync(process.env.FUND_SOURCES, '[]');
  await assert.rejects(R.refreshFacts({ offline: true }), /must be a JSON object/);
  writeFileSync(process.env.FUND_SOURCES, JSON.stringify(SOURCES));
  await assert.rejects(R.refreshFacts({ offline: true, now: new Date('garbage') }), /is not a date/);
  const log = console.error; console.error = () => {};
  try { assert.equal(await main(['refresh', '--only']), 2); } finally { console.error = log; }
});

