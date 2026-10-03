import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, utimesSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'fund-verify-'));
const apps = join(tmp, 'apps');
mkdirSync(apps);
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(tmp, 'TRACKER.md');
process.env.FUND_FACTS = join(tmp, 'FACTS.md');
process.env.FUND_SOURCES = join(tmp, 'sources.json');
process.env.VERIFY_AI_MARKER = join(tmp, 'ai-called.txt');
process.env.FUND_AI_CMD = `node "${join(HERE, 'fixtures', 'verify-ai-stub.mjs')}"`;
process.env.FUND_NOW = '2026-09-26T12:00:00Z';
copyFileSync(join(HERE, '..', 'facts', 'FACTS.md'), process.env.FUND_FACTS);
writeFileSync(process.env.FUND_SOURCES, JSON.stringify({ 'F-007': { kind: 'json', url: 'http://127.0.0.1:1/x', path: 'n', format: 'number' } }));

const { CORE } = await import('../lib/core.mjs');
const V = await import('../lib/verify.mjs');
const { main } = await import('../bin/fund.mjs');

const CRIT = '## Scoring criteria\n\n| ID | Criterion | Weight | Verbatim quote |\n|---|---|---|---|\n| C1 | Impact | 100% | "impact" |\n';
function makeApp(slug, { call = {}, draft = '## Impact <!-- criterion: C1 -->\nA Vilnius team.\n', files = {}, body = CRIT } = {}) {
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, track: 'E', status: 'drafting', deadline: 'rolling', criteria: 'none', ...call }) + body);
  writeFileSync(join(dir, 'draft.md'), '---\nversion: 1\n---\n' + draft);
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); }
  return dir;
}
const lv = (rs, name) => rs.filter((r) => r.name === name).map((r) => r.level);
async function quiet(fn) {
  const log = console.log; const err = console.error; const out = [];
  console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push(a.join(' '));
  try { return { code: await fn(), out: out.join('\n') }; } finally { console.log = log; console.error = err; }
}

// ---------- local HTTP server for link checks ----------
let hits = 0;
const server = createServer((req, res) => {
  hits++;
  if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('fine'); }
  else if (req.url === '/moved') { res.writeHead(301, { location: '/ok' }); res.end(); }
  else if (req.url === '/forbidden') { res.writeHead(403); res.end(); }
  else if (req.url === '/hang') { /* never answers */ }
  else { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });

test('extractUrls strips trailing punctuation, dedupes and skips example/placeholder URLs', () => {
  const urls = V.extractUrls('See https://a.io/x. and (https://b.io/y), https://a.io/x, https://example.com/z https://c.io/{{SLUG}} [l](https://d.io/p)');
  assert.deepEqual(urls, ['https://a.io/x', 'https://b.io/y', 'https://d.io/p']);
});

test('checkLinks: 2xx ok, redirect warns, 403 warns, 404 and timeouts error, results cached per run', async () => {
  const cache = new Map();
  hits = 0;
  const res = await V.checkLinks([`${base}/ok`, `${base}/moved`, `${base}/forbidden`, `${base}/gone`, `${base}/hang`], { cache, timeoutMs: 300 });
  assert.equal(res.get(`${base}/ok`).level, 'ok');
  assert.equal(res.get(`${base}/moved`).level, 'warn');
  assert.match(res.get(`${base}/moved`).detail, /\/ok/);
  assert.equal(res.get(`${base}/forbidden`).level, 'warn');
  assert.equal(res.get(`${base}/gone`).level, 'error');
  assert.equal(res.get(`${base}/hang`).level, 'error');
  assert.match(res.get(`${base}/hang`).detail, /no response/);
  const before = hits;
  await V.checkLinks([`${base}/ok`, `${base}/gone`], { cache, timeoutMs: 300 });
  assert.equal(hits, before, 'cached URLs are not fetched again');
});

test('secrets and PII scan finds keys, tokens, RPC keys, JWTs, personal emails and phones — masked', () => {
  const stellarSecret = 'S' + 'A'.repeat(20) + 'B2C3D4E5F6G7'.repeat(2) + 'ABCDEFGHIJK';
  const apiKey = 'sk-' + 'ant-' + 'x9'.repeat(15);
  const jwt = 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + 'abcDEF123456ghiJKL';
  const text = [
    '-----BEGIN ' + 'EC PRIVATE KEY-----',
    `seed: ${stellarSecret}`,
    `key ${apiKey}`,
    `rpc https://eth-mainnet.g.alchemy.com/v2/${'Zk3'.repeat(8)}`,
    `token ${jwt}`,
    'mail jane.doe.example@gmail.com and hello@tokentails.com and dev@example.com',
    'call +370 600 00000 now',
    'Cat contract CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF has 1,218,693 invocations [F-007]',
  ].join('\n');
  const hits2 = V.scanText(text, 'x.md');
  const kinds = hits2.map((h) => h.kind);
  for (const k of ['private-key', 'stellar-secret', 'api-key', 'rpc-key-url', 'jwt', 'personal-email', 'phone']) assert.ok(kinds.includes(k), `missing ${k}: ${kinds.join(', ')}`);
  assert.equal(kinds.filter((k) => k === 'personal-email').length, 1, 'role mailbox and example.com are allowed');
  const shown = hits2.map((h) => h.shown).join(' ');
  for (const secret of [stellarSecret, apiKey, jwt, 'jonas.petraitis', '612 34567', 'Zk3Zk3Zk3Zk3']) assert.ok(!shown.includes(secret), `leaked ${secret.slice(0, 6)}`);
  assert.equal(hits2.find((h) => h.kind === 'phone').line, 7);
});

test('policy: excluded programs, investment/credits language, negations and relocation', () => {
  const pol = (slug, opts) => V.policyChecks(CORE.loadApp((makeApp(slug, opts), slug)));
  assert.deepEqual(lv(pol('p-bga', { call: { program: 'Blockchain for Good Alliance incubator' } }), 'excluded-program'), ['error']);
  assert.deepEqual(lv(pol('p-mantle', { call: { program: 'EcoFund', chain: ['base', 'mantle'] } }), 'excluded-program'), ['error']);
  assert.deepEqual(lv(pol('p-scf', { call: { url: 'https://communityfund.stellar.org/x' } }), 'excluded-program'), ['error']);
  assert.deepEqual(lv(pol('p-clean', { files: { 'source.md': 'An equity-free, non-dilutive grant. We take no equity. Fully remote; no relocation required.' } }), 'funding-type'), ['ok']);
  assert.deepEqual(lv(pol('p-clean', {}), 'remote-only'), ['ok']);
  assert.deepEqual(lv(pol('p-vc', { files: { 'source.md': 'We invest $500k in exchange for 7% equity via a SAFE note.' } }), 'funding-type'), ['error']);
  assert.deepEqual(lv(pol('p-credits', { files: { 'source.md': 'Winners get $100k in cloud credits.' } }), 'funding-type'), ['error']);
  assert.deepEqual(lv(pol('p-match', { files: { 'source.md': 'Projects receive matching funds from the pool.' } }), 'funding-type'), ['error']);
  assert.deepEqual(lv(pol('p-tokensale', { files: { 'fill.md': 'Our token sale opens in May.' } }), 'funding-type'), ['error']);
  assert.deepEqual(lv(pol('p-onsite', { files: { 'source.md': 'Founders must relocate to Austin for the in-person program.' } }), 'remote-only'), ['warn']);
});

test('fact dates parse in every FACTS.md style and age out after 90 days', () => {
  assert.equal(V.parseFactDate('2026-09-23').toISOString().slice(0, 10), '2026-09-23');
  assert.equal(V.parseFactDate('2026-04').toISOString().slice(0, 10), '2026-04-30');
  assert.equal(V.parseFactDate('2025–26').toISOString().slice(0, 10), '2026-12-31');
  assert.equal(V.parseFactDate('2024').toISOString().slice(0, 10), '2024-12-31');
  assert.equal(V.parseFactDate('soon'), null);
  makeApp('f-age', { call: { status: 'in-review' }, draft: '## A <!-- criterion: C1 -->\nWe have 542,000 users [F-001] and 1,218,693 invocations [F-007].\n', files: { 'fill.md': 'Followers: 4,700 [F-012].\n' } });
  const { facts } = CORE.loadFacts(process.env.FUND_FACTS);
  const rs = V.factChecks(CORE.loadApp('f-age'), CORE, { facts, sources: { 'F-007': {} }, now: CORE.now() });
  assert.deepEqual(lv(rs, 'facts-age'), ['warn']);
  assert.match(rs.find((r) => r.name === 'facts-age').detail, /F-001 \(2026-04, 148d\)/);
  assert.deepEqual(lv(rs, 'facts-status'), ['error'], 'unverified fact outside draft.md errors in a strict status');
  assert.match(rs.find((r) => r.name === 'facts-probe').detail, /F-001, F-012/);
});

test('renders(): rounded and floored prose numbers match, different numbers do not', () => {
  assert.ok(V.renders(1.2e6, 1218693));
  assert.ok(V.renders(1218693, 1218693));
  assert.ok(V.renders(542000, 542000));
  assert.ok(V.renders(300000, 307600));
  assert.ok(V.renders(1.21e6, 1218693));
  assert.ok(!V.renders(1.1e6, 1218693));
  assert.ok(!V.renders(1318693, 1218693));
});

test('portfolio: conflicting fact numbers error, overlapping deliverables warn, edits after submission warn', async () => {
  makeApp('pa', { call: { deliverables: ['ShelterSplit mainnet', 'Shelter dashboard'] }, draft: '## A <!-- criterion: C1 -->\nThe contract has 1.2M invocations [F-007].\n' });
  makeApp('pb', { call: { deliverables: ['shelter  dashboard'] }, draft: '## A <!-- criterion: C1 -->\nThe contract has 1.1M invocations [F-007] and a $25,000 ask.\n' });
  makeApp('pc', { call: { status: 'lost', deliverables: ['Shelter dashboard'] } });
  const dir = makeApp('pd', { call: { status: 'submitted', submitted: '2026-09-01' } });
  utimesSync(join(dir, 'call.md'), new Date('2026-08-30'), new Date('2026-08-30'));
  const { facts } = CORE.loadFacts(process.env.FUND_FACTS);
  const out = V.portfolioChecks(CORE, { facts, now: CORE.now() });
  const nums = out.find((o) => o.name === 'fact-numbers');
  assert.equal(nums.level, 'error');
  assert.deepEqual(nums.slugs, ['pb']);
  assert.match(nums.detail, /1\.1M in pb\/draft\.md/);
  const dbl = out.filter((o) => o.name === 'double-funding');
  assert.equal(dbl.length, 1, 'lost applications do not count');
  assert.deepEqual(dbl[0].slugs.sort(), ['pa', 'pb']);
  const changed = out.find((o) => o.name === 'changed-after-submit');
  assert.deepEqual(changed.slugs, ['pd']);
  assert.match(changed.detail, /draft\.md/);
  assert.doesNotMatch(changed.detail, /call\.md/);
});

test('pipeline: skipped when absent; stale done evidence errors; verify() re-checks only finished steps', async () => {
  const dir = makeApp('pipe');
  const missing = await V.pipelineChecks('pipe', { core: CORE, tracks: {}, loadPipeline: async () => { const e = new Error("Cannot find module '/x/lib/pipeline.mjs'"); e.code = 'ERR_MODULE_NOT_FOUND'; throw e; } });
  assert.deepEqual(lv(missing, 'pipeline'), ['ok']);
  let verified = [];
  const steps = [
    { id: 'draft', kind: 'ai', done: () => ({ done: true, reason: 'draft.md' }), verify: () => { verified.push('draft'); return { level: 'warn', detail: 'thin' }; } },
    { id: 'extract', kind: 'ai', done: () => ({ done: false, reason: 'no criteria table' }) },
    { id: 'fit', kind: 'ai', done: () => ({ done: false, reason: 'no verdict' }), verify: () => { verified.push('fit'); return { level: 'error', detail: 'no verdict' }; } },
    { id: 'human-read', kind: 'human', done: () => ({ done: false, reason: 'not read' }) },
  ];
  const state = { version: 1, steps: { extract: { status: 'done', doneAt: '2026-09-20T10:00:00Z' }, 'human-read': { status: 'done' } }, history: [] };
  const P = { resolvePipeline: async () => steps, makeCtx: ({ slug }) => ({ slug, dir, state }), readState: () => state };
  const rs = await V.pipelineChecks('pipe', { core: CORE, tracks: {}, loadPipeline: async () => P });
  assert.deepEqual(verified, ['draft']);
  assert.deepEqual(lv(rs, 'step:draft'), ['warn']);
  assert.deepEqual(lv(rs, 'evidence:extract'), ['error']);
  assert.match(rs.find((r) => r.name === 'evidence:extract').detail, /2026-09-20.*no criteria table.*fund run pipe --until extract/);
  assert.deepEqual(lv(rs, 'evidence:human-read'), ['warn']);
  assert.match(rs.find((r) => r.name === 'pipeline').detail, /1 done step\(s\).*1 re-verified.*1 still to do/);
});

test('fund verify <slug> --offline writes VERIFY.md, exits 0 on a clean app and never calls AI', async () => {
  makeApp('clean-app', { call: { url: `${base}/ok` }, draft: '## Impact <!-- criterion: C1 -->\nThe Stellar contract has 1,218,693 invocations [F-007]. Contact hello@tokentails.com.\n' });
  const { code, out } = await quiet(() => main(['verify', 'clean-app', '--offline']));
  assert.equal(code, 0, out);
  assert.match(out, /clean-app\s+✓ PASS/);
  assert.match(out, /next: fund next clean-app/);
  const md = readFileSync(join(apps, 'clean-app', 'VERIFY.md'), 'utf8');
  assert.match(md, /\*\*PASS\*\*/);
  assert.match(md, /skipped \(--offline\): 1 URL/);
  assert.ok(!existsSync(process.env.VERIFY_AI_MARKER), 'verify must not call AI');
});

test('fund verify online flags dead links; secrets fail with masked output; --json is machine-readable', async () => {
  const dir = makeApp('dirty-app', { call: { url: `${base}/gone` }, files: { 'submission.md': `Demo: ${base}/ok and ${base}/moved\nReach me at jane.doe.example@gmail.com\n` } });
  process.env.FUND_VERIFY_TIMEOUT_MS = '1000';
  try {
    const { code, out } = await quiet(() => main(['verify', 'dirty-app']));
    assert.equal(code, 1, out);
    assert.match(out, /✗ links\s+link\s+.*\/gone .*dead link \(HTTP 404\)/);
    assert.match(out, /! links\s+link\s+.*\/moved .*redirects/);
    assert.match(out, /✗ secrets\s+secrets-pii.*submission\.md:2 personal-email j\*\*\*@gmail\.com/s);
    assert.ok(!out.includes('jonas.petraitis'), 'personal email printed unmasked');
    assert.ok(!readFileSync(join(dir, 'VERIFY.md'), 'utf8').includes('jonas.petraitis'));
    assert.match(out, /next: fix the ✗ links item\(s\)/);
    const j = await quiet(() => main(['verify', 'dirty-app', '--json', '--offline']));
    const parsed = JSON.parse(j.out);
    assert.equal(parsed[0].slug, 'dirty-app');
    assert.equal(parsed[0].ok, false);
    assert.ok(parsed[0].results.some((r) => r.group === 'secrets' && r.level === 'error'));
  } finally { delete process.env.FUND_VERIFY_TIMEOUT_MS; }
});

test('fund verify --all covers every app and reports the cross-application conflict; unknown slug exits 2', async () => {
  const { code, out } = await quiet(() => main(['verify', '--all', '--offline']));
  assert.equal(code, 1);
  assert.match(out, /pb\s+✗ FAIL[\s\S]*portfolio\s+fact-numbers\s+F-007 written differently across applications/);
  assert.match(out, /\d+\/\d+ verified/);
  for (const s of CORE.listApps()) assert.ok(existsSync(join(apps, s, 'VERIFY.md')), s);
  assert.equal((await quiet(() => main(['verify', 'no-such-app']))).code, 2);
  assert.equal((await quiet(() => main(['verify']))).code, 2);
});

// ---------- regressions found by the adversarial validator ----------

test('regression: policy ignores DEI "equity", favicon.ico and film credits, still catches real investment/ICO/credits', () => {
  const pol = (slug, text) => lv(V.policyChecks(CORE.loadApp((makeApp(slug, { files: { 'source.md': text } }), slug))), 'funding-type');
  assert.deepEqual(pol('r-dei', 'We fund projects that advance gender equity and inclusion. Logo at https://x.io/favicon.ico. Partners appear in credits.'), ['ok']);
  assert.deepEqual(pol('r-ico', 'Projects planning an ICO are welcome.'), ['error']);
  assert.deepEqual(pol('r-cred', 'Each team gets $5,000 in credits.'), ['error']);
  assert.deepEqual(pol('r-eq', 'We take 7% equity from each startup.'), ['error']);
  assert.deepEqual(pol('r-eq2', 'The accelerator receives equity in every team.'), ['error']);
});

test('regression: URLs keep balanced parentheses; file names and money are not PII', () => {
  assert.deepEqual(V.extractUrls('See https://en.wikipedia.org/wiki/Cat_(film). Also [x](https://a.io/p) and (https://b.io/q).'), ['https://en.wikipedia.org/wiki/Cat_(film)', 'https://a.io/p', 'https://b.io/q']);
  const kinds = V.scanText('Asset logo@2x.png and hero@3x.webp. Budget +20 000 000 EUR. Growth +12.5%.', 'x.md').map((h) => h.kind);
  assert.deepEqual(kinds, []);
  assert.deepEqual(V.scanText('Call +370 600 00000', 'x.md').map((h) => h.kind), ['phone']);
});

test('regression: CRLF draft frontmatter is not read as prose by the portfolio check', () => {
  makeApp('r-crlf');
  writeFileSync(join(apps, 'r-crlf', 'draft.md'), '---\r\nnote: 1.1M [F-007]\r\n---\r\n## A <!-- criterion: C1 -->\r\nThe contract has 1,218,693 invocations [F-007].\r\n');
  const { facts } = CORE.loadFacts(process.env.FUND_FACTS);
  const claims = V.factClaims([CORE.loadApp('r-crlf')], CORE, facts);
  assert.deepEqual(claims.map((c) => [c.raw, c.ok]), [['1,218,693', true]]);
});

test('regression: symlinked directories are not followed (no loop), unknown done steps warn, hooks cannot invoke commands', async () => {
  const { symlinkSync } = await import('node:fs');
  const dir = makeApp('r-link');
  mkdirSync(join(dir, 'sub'));
  symlinkSync(dir, join(dir, 'sub', 'loop'));
  writeFileSync(join(dir, 'sub', 'notes.md'), 'reach jane.doe.example@gmail.com');
  const hitsFound = V.scanSecrets(dir);
  assert.equal(hitsFound.length, 1, 'the real file is scanned once, the symlink loop is skipped');
  let invoked = null;
  const steps = [{ id: 'draft', kind: 'ai', done: () => ({ done: true }), verify: async (ctx) => { try { await ctx.invoke(['run', 'r-link']); invoked = 'ran'; } catch (e) { invoked = e.message; } return { level: 'ok' }; } }];
  const state = { steps: { renamed: { status: 'done' }, draft: { status: 'done' } } };
  const P = { resolvePipeline: async () => steps, makeCtx: ({ invoke }) => ({ dir, invoke }), readState: () => state };
  const rs = await V.pipelineChecks('r-link', { core: CORE, tracks: {}, invoke: async () => 0, loadPipeline: async () => P });
  assert.match(invoked, /verify never runs other commands/);
  assert.deepEqual(lv(rs, 'state'), ['warn']);
  assert.match(rs.find((r) => r.name === 'state').detail, /renamed/);
});

test('regression: malformed sources.json is reported, not a crash; an invalid FUND_NOW fails with a clear message', async () => {
  const good = readFileSync(process.env.FUND_SOURCES, 'utf8');
  writeFileSync(process.env.FUND_SOURCES, '{broken');
  try {
    const { apps: out } = await V.verify({ slugs: ['clean-app'], core: CORE, tracks: {}, offline: true, write: false });
    assert.equal(out[0].ok, false);
    assert.match(out[0].results.find((r) => r.name === 'facts-sources').detail, /not valid JSON/);
  } finally { writeFileSync(process.env.FUND_SOURCES, good); }
  const prev = process.env.FUND_NOW;
  process.env.FUND_NOW = 'next tuesday';
  try { await assert.rejects(V.verify({ slugs: ['clean-app'], core: CORE, tracks: {}, offline: true, write: false }), /FUND_NOW="next tuesday" is not a date/); }
  finally { process.env.FUND_NOW = prev; }
});

test('regression: fund verify --all with no applications exits 0 with a next step', async () => {
  const cmd = (await import('../lib/commands/verify.mjs')).default;
  const { code, out } = await quiet(() => cmd.run({ args: [], flags: { all: true }, core: { ...CORE, listApps: () => [], PATHS: { apps: '/nowhere' } }, tracks: {} }));
  assert.equal(code, 0);
  assert.match(out, /no applications[\s\S]*next: fund new/);
});
