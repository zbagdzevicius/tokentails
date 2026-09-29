// Track pipelines (tracks/<dir>/pipeline.mjs) — hermetic end-to-end tests of `fund run` per track.
// Everything lives in a temp dir: applications, tracker, Track A deployments + a fake Foundry project
// and forge, Track E watchlist/state, and a local node:http server for E sources and A's JSON-RPC.
// $FUND_AI_CMD is a deterministic stub (test/fixtures/pipelines-ai.mjs). No network, no real AI.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = join(HERE, '..');
const root = mkdtempSync(join(tmpdir(), 'fund-track-pipelines-'));
const apps = join(root, 'apps');
mkdirSync(apps);
const aiLog = join(root, 'ai.log');

process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(root, 'TRACKER.md');
process.env.FUND_AI_CMD = `node "${join(HERE, 'fixtures', 'pipelines-ai.mjs')}"`;
process.env.PIPE_STUB_LOG = aiLog;
process.env.FUND_A_DEPLOYMENTS = join(root, 'deployments.json');
process.env.FUND_E_WATCHLIST = join(root, 'watchlist.json');
process.env.FUND_E_STATE = join(root, 'e-state.json');
process.env.FUND_E_CHANGES = join(root, 'E-CHANGES.md');
process.env.FUND_E_TRIAGE = join(root, 'E-TRIAGE.md');
process.env.FUND_PORTFOLIO = join(root, 'opportunities.json');
delete process.env.FUND_NOW;
for (const k of Object.keys(process.env)) if (/^RPC_/.test(k)) delete process.env[k];
writeFileSync(process.env.FUND_A_DEPLOYMENTS, '[]\n');
writeFileSync(process.env.FUND_E_WATCHLIST, '[]\n');

// fake Foundry project + fake forge (same shape as test/track-a.test.mjs)
const project = join(root, 'shelter-split');
mkdirSync(join(project, 'out', 'ShelterSplit.sol'), { recursive: true });
writeFileSync(join(project, 'out', 'ShelterSplit.sol', 'ShelterSplit.json'), JSON.stringify({
  bytecode: { object: '0x6080604052' }, deployedBytecode: { object: '0x60806040' }, metadata: { compiler: { version: '0.8.24+fake' } },
}));
const fakeForge = join(root, 'forge');
writeFileSync(fakeForge, `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('forge 0.0.0-fake'); process.exit(0); }
if (a[0] === 'build') { console.log('Compiler run successful!'); process.exit(0); }
if (a[0] === 'test') {
  const r = (s) => ({ status: s, reason: null, kind: { Unit: { gas: 1 } } });
  console.log(JSON.stringify({ 'test/S.t.sol:S': { test_results: { 'test_a()': r('Success'), 'test_b()': r('Success') } } }));
  process.exit(0);
}
process.exit(3);
`);
chmodSync(fakeForge, 0o755);
process.env.FUND_A_PROJECT = project;
process.env.FORGE_BIN = fakeForge;

// one local server: Track E sources (GET /e/*) and a read-only JSON-RPC for Track A (POST /rpc)
const ADDR = '0x' + '12'.repeat(20);
const HASH = '0x' + 'ab'.repeat(32);
const pages = { '/e/page.html': '<html><body><a href="/call/alpha-call">Alpha</a></body></html>' };
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { id, method } = JSON.parse(body);
      const result = method === 'eth_chainId' ? '0x' + (5042002).toString(16)
        : method === 'eth_getCode' ? '0x60806040'
          : method === 'eth_getTransactionReceipt' ? { contractAddress: ADDR, status: '0x1' } : null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
    return;
  }
  const page = pages[req.url];
  if (!page) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true }); });

const { CORE } = await import('../lib/core.mjs');
const P = await import('../lib/pipeline.mjs');
const { runAI, main } = await import('../bin/fund.mjs');
const TRACKS = await CORE.loadTracks();

// ---------- helpers ----------

async function quiet(fn) {
  const out = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  console.warn = (...a) => out.push(a.join(' '));
  try { const code = await fn(); return { code, text: out.join('\n') }; } finally { Object.assign(console, orig); }
}
const fund = (...argv) => quiet(() => main(argv));
const invoke = (argv) => main(argv);

async function scaffold(slug, track, opts = {}) {
  rmSync(join(apps, slug), { recursive: true, force: true });
  await quiet(() => CORE.scaffold(slug, { track, program: 'Stub Program', url: 'https://example.org/call', deadline: 'rolling', ...opts }));
  return join(apps, slug);
}

const SOURCE = `# Source text — Stub

Stub Program 2026 call. Remote teams welcome. Section 2: projects are scored on technical execution
(50%) and impact (50%). Section 4: the summary is limited to 280 characters. Deadline: rolling.
`;

const setFm = (slug, patch) => CORE.updateFrontmatter(join(apps, slug, 'call.md'), patch);
const aiCalls = () => (existsSync(aiLog) ? readFileSync(aiLog, 'utf8').trim().split('\n').filter(Boolean) : []);
const resetLog = () => rmSync(aiLog, { force: true });
const ids = (res) => res.ran.map((r) => r.id);

async function steps(slug) { return P.resolvePipeline({ slug, core: CORE, tracks: TRACKS }); }
function ctxFor(slug, flags = {}) { return P.makeCtx({ slug, core: CORE, runAI, invoke, tracks: TRACKS, flags }); }
async function rows(slug) { return P.evaluate(await steps(slug), ctxFor(slug)); }
async function row(slug, id) { return (await rows(slug)).find((r) => r.step.id === id); }
async function first(slug) { return P.firstActionable(await rows(slug)); }
async function run(slug, opts = {}, flags = {}) {
  const s = await steps(slug);
  return quiet(() => P.runPipeline(s, ctxFor(slug, flags), opts)).then((r) => r.code);
}

// ---------- contract ----------

test('every track pipeline resolves from its file and follows the step contract', async () => {
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    const slug = `contract-${letter.toLowerCase()}`;
    await scaffold(slug, letter);
    const s = await steps(slug);
    assert.ok(existsSync(join(TRACKS[letter].dir, 'pipeline.mjs')), `${letter} has a pipeline.mjs`);
    assert.notDeepEqual(s.map((x) => x.id), P.defaultSteps.map((x) => x.id), `${letter} customises the default pipeline`);
    const known = new Set(s.map((x) => x.id));
    for (const st of s) {
      assert.ok(['auto', 'ai', 'human'].includes(st.kind), `${letter}:${st.id} kind`);
      assert.equal(typeof st.done, 'function', `${letter}:${st.id} done()`);
      assert.equal(typeof st.estimate_h, 'number', `${letter}:${st.id} estimate_h`);
      assert.ok(st.title, `${letter}:${st.id} title`);
      if (st.kind === 'human') assert.ok(st.instructions, `${letter}:${st.id} has instructions`);
      else assert.equal(typeof st.run, 'function', `${letter}:${st.id} run()`);
      for (const n of st.needs || []) assert.ok(known.has(n), `${letter}:${st.id} needs unknown ${n}`);
    }
  }
});

test('the steps that sign, broadcast, post or submit are always human', async () => {
  const human = {};
  for (const letter of ['A', 'B', 'C', 'D', 'E']) human[letter] = (await steps(`contract-${letter.toLowerCase()}`)).filter((s) => s.kind === 'human').map((s) => s.id);
  assert.deepEqual(human.A, ['source', 'deploy', 'record', 'human-read', 'submit']);
  assert.deepEqual(human.B, ['form', 'human-read', 'submit']);
  assert.deepEqual(human.C, ['source', 'budget-lines', 'annex-files', 'human-read', 'submit']);
  assert.deepEqual(human.D, ['source', 'budget', 'post', 'sponsor-hunt', 'submit']);
  assert.deepEqual(human.E, ['watch-configured', 'wait', 'reopen']);
});

// ---------- Track A ----------

test('A: a fresh app waits for the call text; run does nothing and calls no AI', async () => {
  await scaffold('a-fresh', 'A');
  resetLog();
  const f = await first('a-fresh');
  assert.equal(f.step.id, 'source');
  assert.equal(f.status, 'human');
  const res = await run('a-fresh');
  assert.equal(res.reason, 'human');
  assert.equal(res.stoppedAt, 'source');
  assert.deepEqual(res.ran, []);
  assert.deepEqual(aiCalls(), []);
});

test('A: run goes extract → draft → (check passes) → build, stops at the human deploy with the exact a:deploy command', async () => {
  const dir = await scaffold('a-app', 'A');
  setFm('a-app', { chain: 'arc', mainnet_required: false, repo: 'https://example.org/shelter-split' });
  writeFileSync(join(dir, 'source.md'), SOURCE);
  resetLog();
  const res = await run('a-app');
  assert.deepEqual(ids(res), ['extract', 'draft', 'build'], JSON.stringify(res.ran));
  assert.ok(res.ran.every((r) => r.ok), JSON.stringify(res.ran));
  assert.equal(res.reason, 'human');
  assert.equal(res.stoppedAt, 'deploy');
  assert.match(res.message, /fund a:deploy arc testnet/);
  assert.match(res.message, /sign and broadcast it yourself/);
  assert.deepEqual(aiCalls(), ['extract', 'draft']);
  assert.match(readFileSync(join(dir, 'build-evidence.md'), 'utf8'), /passed: true/);

  // a person deploys; the record step cannot be faked with `fund done`, it needs a:record
  P.markHumanDone(dir, 'deploy', 'broadcast by hand');
  const r2 = await run('a-app');
  assert.equal(r2.stoppedAt, 'record');
  assert.match(r2.message, /fund a:record arc testnet <address> --tx <hash>/);
  const refused = await fund('done', 'a-app', 'record');
  assert.equal(refused.code, 1);

  assert.equal((await fund('a:record', 'arc', 'testnet', ADDR, '--tx', HASH)).code, 0);
  const vd = await row('a-app', 'verify-deploy');
  assert.equal(vd.done, true);
  assert.match(vd.reason, /skipped \(optional\): set RPC_ARC_TESTNET/);
  resetLog();
  const r3 = await run('a-app');
  assert.deepEqual(ids(r3), ['submission', 'review'], JSON.stringify(r3.ran));
  assert.equal(r3.stoppedAt, 'human-read');
  assert.deepEqual(aiCalls(), ['review']);
  assert.match(readFileSync(join(dir, 'submission.md'), 'utf8'), new RegExp(ADDR));
});

test('A: with an RPC env var verify-deploy runs a:verify (read-only) and refreshes submission.md', async () => {
  process.env.RPC_ARC_TESTNET = `${base}/rpc`;
  try {
    assert.equal((await row('a-app', 'verify-deploy')).done, false);
    const res = await run('a-app');
    assert.deepEqual(ids(res), ['verify-deploy', 'submission'], JSON.stringify(res.ran));
    assert.ok(res.ran.every((r) => r.ok), JSON.stringify(res.ran));
    assert.equal(res.stoppedAt, 'human-read');
    assert.equal(JSON.parse(readFileSync(process.env.FUND_A_DEPLOYMENTS, 'utf8'))[0].verified, true);
    assert.match((await row('a-app', 'verify-deploy')).reason, /verified on-chain/);
  } finally { delete process.env.RPC_ARC_TESTNET; }
});

test('A: ready re-runs the strict gates and refuses evidence built from uncommitted source', async () => {
  P.markHumanDone(join(apps, 'a-app'), 'human-read', 'read it');
  const res = await run('a-app');
  assert.equal(res.reason, 'failed');
  assert.equal(res.stoppedAt, 'ready');
  assert.match(res.message, /build-evidence/);
  assert.equal(CORE.loadApp('a-app').call.fm.status, 'drafting', 'status rolled back');
});

test('A: a second program reuses the sibling draft instead of an AI draft', async () => {
  const dir = await scaffold('a-sib', 'A');
  setFm('a-sib', { chain: 'arc', mainnet_required: false });
  writeFileSync(join(dir, 'source.md'), SOURCE);
  resetLog();
  const res = await run('a-sib', { until: 'draft' });
  assert.deepEqual(ids(res), ['extract', 'draft']);
  assert.match(res.ran[1].message, /copied draft\.md from applications\/a-app \(no AI call\)/);
  assert.deepEqual(aiCalls(), ['extract']);
  assert.match(readFileSync(join(dir, 'draft.md'), 'utf8'), /copied_from: a-app/);
});

test('regression A: at status in-review the pre-build check does not wait on the deployment (no build → deploy deadlock, no AI revise)', async () => {
  const dir = await scaffold('a-strict', 'A');
  setFm('a-strict', { chain: 'arc', mainnet_required: true, repo: 'https://example.org/shelter-split', status: 'in-review' });
  writeFileSync(join(dir, 'source.md'), SOURCE);
  resetLog();
  const res = await run('a-strict', {}, { 'no-copy': true });
  assert.deepEqual(ids(res), ['extract', 'draft', 'build'], JSON.stringify(res.ran));
  assert.equal(res.stoppedAt, 'deploy');
  assert.match(res.message, /fund a:deploy arc mainnet/);
  assert.deepEqual(aiCalls(), ['extract', 'draft'], 'no revise for A:mainnet, which only a deploy can fix');
  // the full gate still applies after the deployment: check-submission would report A:mainnet
  assert.equal((await row('a-strict', 'check-submission')).status, 'blocked');
});

test('regression A: a check error only a person can fix (unknown chain) stops the run without an AI rewrite', async () => {
  const dir = join(apps, 'a-strict');
  setFm('a-strict', { chain: 'nochain' });
  const before = readFileSync(join(dir, 'draft.md'), 'utf8');
  resetLog();
  const res = await run('a-strict');
  assert.equal(res.reason, 'failed');
  assert.equal(res.stoppedAt, 'check');
  assert.match(res.message, /needs a person: A:chain \(unknown chain/);
  assert.deepEqual(ids(res), ['check']);
  assert.deepEqual(aiCalls(), [], 'revise never runs for A:* errors');
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), before, 'draft.md untouched');
  assert.equal((await row('a-strict', 'revise')).done, true);
});

// ---------- Track B ----------

const FORM = `# Stub form

| id | label | type | limit | required | source |
|---|---|---|---|---|---|
| name | Project name | text | 60 | yes | answer |
| website | Website | url | 200 | yes | fm:website |
| pitch | What are you building | longtext | 500 | yes | answer |
`;

test('B: a fresh app waits for the form and the fm: values a person must decide', async () => {
  await scaffold('b-fresh', 'B');
  const f = await first('b-fresh');
  assert.equal(f.step.id, 'form');
  assert.equal(f.status, 'human');
  assert.match(f.reason, /set ask:, contact: in call\.md/);
  setFm('b-fresh', { ask: 5000, contact: 'hello@example.org' });
  const g = await first('b-fresh');
  assert.equal(g.step.id, 'form');
  assert.match(g.reason, /still the stock template/);
  P.markHumanDone(join(apps, 'b-fresh'), 'form', 'template matches the form');
  assert.equal((await first('b-fresh')).step.id, 'answer');
});

test('B: run answers and fills (check passes on evidence), stops at the human read; then ready, submit, record', async () => {
  const dir = await scaffold('b-app', 'B');
  writeFileSync(join(dir, 'form.md'), FORM);
  resetLog();
  const res = await run('b-app');
  assert.deepEqual(ids(res), ['answer', 'fill'], JSON.stringify(res.ran));
  assert.ok(res.ran.every((r) => r.ok), JSON.stringify(res.ran));
  assert.equal(res.stoppedAt, 'human-read');
  assert.deepEqual(aiCalls(), ['answer']);
  assert.match(readFileSync(join(dir, 'fill.md'), 'utf8'), /cat-rescue game studio/);

  P.markHumanDone(dir, 'human-read', 'read');
  const r2 = await run('b-app');
  assert.deepEqual(ids(r2), ['ready'], JSON.stringify(r2.ran));
  assert.equal(r2.stoppedAt, 'submit');
  assert.equal(CORE.loadApp('b-app').call.fm.status, 'ready');

  P.markHumanDone(dir, 'submit', 'pasted');
  const r3 = await run('b-app');
  assert.deepEqual(ids(r3), ['record-submission']);
  assert.equal(r3.reason, 'complete');
  assert.equal(CORE.loadApp('b-app').call.fm.status, 'submitted');
});

// ---------- Track C ----------

const DEADLINE_C = '2027-06-30T17:00:00+02:00';

test('C: a fresh app waits for the call text', async () => {
  await scaffold('c-fresh', 'C', { deadline: DEADLINE_C });
  const f = await first('c-fresh');
  assert.equal(f.step.id, 'source');
  assert.equal((await row('c-fresh', 'plan')).status, 'blocked');
});

test('C: run plans, drafts, scores, iterates with fund loop to the threshold, does the paperwork, stops at the budget', async () => {
  const dir = await scaffold('c-app', 'C', { deadline: DEADLINE_C });
  writeFileSync(join(dir, 'source.md'), SOURCE);
  process.env.PIPE_STUB_CREVIEW = '5';
  process.env.PIPE_STUB_LOOPSCORE = '9';
  resetLog();
  try {
    const res = await run('c-app');
    assert.deepEqual(ids(res), ['extract', 'plan', 'fit', 'draft', 'review', 'iterate', 'annexes', 'compliance'], JSON.stringify(res.ran, null, 1));
    assert.ok(res.ran.every((r) => r.ok), JSON.stringify(res.ran, null, 1));
    assert.equal(res.stoppedAt, 'budget-lines');
    assert.equal(res.reason, 'human');
    assert.deepEqual(aiCalls(), ['extract', 'fit', 'draft', 'c-review', 'autofix', 'review-scored', 'compliance']);
  } finally { delete process.env.PIPE_STUB_CREVIEW; delete process.env.PIPE_STUB_LOOPSCORE; }
  assert.ok(existsSync(join(dir, 'plan.md')));
  assert.match((await row('c-app', 'iterate')).reason, /score 90\.0 ≥ threshold 70/);
  assert.match(readFileSync(join(dir, 'annexes.md'), 'utf8'), /- \[x\] Budget table — budget\.csv/);

  writeFileSync(join(dir, 'budget.csv'), 'category,item,cost_eur,eligible\nstaff,Narrative lead,40000,yes\nstaff,Art,20000,yes\n');
  setFm('c-app', { max_grant: 100000 });
  const r2 = await run('c-app');
  assert.deepEqual(ids(r2), ['budget'], JSON.stringify(r2.ran));
  assert.equal(r2.stoppedAt, 'annex-files');
  assert.match(r2.message, /missing: annexes\/declaration-of-honour\.pdf/);

  mkdirSync(join(dir, 'annexes'), { recursive: true });
  writeFileSync(join(dir, 'annexes', 'declaration-of-honour.pdf'), '%PDF-stub');
  const r3 = await run('c-app');
  assert.deepEqual(ids(r3), ['annexes'], JSON.stringify(r3.ran));
  assert.equal(r3.stoppedAt, 'human-read');
});

test('regression C: a malformed loop_rounds / iterate_rounds in call.md falls back to the defaults instead of breaking iterate', async () => {
  const dir = await scaffold('c-rounds', 'C', { deadline: DEADLINE_C });
  writeFileSync(join(dir, 'source.md'), SOURCE);
  process.env.PIPE_STUB_CREVIEW = '5';
  process.env.PIPE_STUB_LOOPSCORE = '9';
  try {
    assert.equal((await run('c-rounds', { until: 'review' })).stoppedAt, 'review');
    setFm('c-rounds', { loop_rounds: 2.5, iterate_rounds: -1 });
    resetLog();
    const res = await run('c-rounds', { until: 'iterate' });
    assert.deepEqual(ids(res), ['iterate'], JSON.stringify(res.ran));
    assert.ok(res.ran[0].ok, res.ran[0].message);
    assert.deepEqual(aiCalls(), ['autofix', 'review-scored']);
    assert.match((await row('c-rounds', 'iterate')).reason, /score 90\.0 ≥ threshold 70/);
  } finally { delete process.env.PIPE_STUB_CREVIEW; delete process.env.PIPE_STUB_LOOPSCORE; }
});

// ---------- Track D ----------

const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

test('D: a fresh app waits for the guidance text', async () => {
  await scaffold('d-fresh', 'D');
  assert.equal((await first('d-fresh')).step.id, 'source');
});

test('D: run extracts, waits for the budget, then drafts, reviews and exports up to the human forum post', async () => {
  const dir = await scaffold('d-app', 'D');
  setFm('d-app', { dao: 'Nouns', eth_usd: 2500, min_budget: 1, max_budget: 25 });
  writeFileSync(join(dir, 'source.md'), SOURCE);
  resetLog();
  const res = await run('d-app');
  assert.deepEqual(ids(res), ['extract']);
  assert.equal(res.stoppedAt, 'budget');
  assert.match(res.message, /no "\| Item \| Amount \| Currency \|" rows/);

  writeFileSync(join(dir, 'budget.md'), readFileSync(join(dir, 'budget.md'), 'utf8') + '| Character art | 3 | ETH |\n| Shelter onboarding | 1.5 | ETH |\n');
  const r2 = await run('d-app');
  assert.deepEqual(ids(r2), ['draft', 'review', 'export'], JSON.stringify(r2.ran));
  assert.ok(r2.ran.every((r) => r.ok), JSON.stringify(r2.ran));
  assert.equal(r2.stoppedAt, 'post');
  assert.deepEqual(aiCalls(), ['extract', 'draft', 'review']);
  assert.match(readFileSync(join(dir, 'proposal.md'), 'utf8'), /Looking for a sponsor/);
});

test('D: after d:post, run refreshes proposal.md and the sponsor hunt repeats until CONTINUE; KILL says park it', async () => {
  const dir = join(apps, 'd-app');
  assert.equal((await fund('d:post', 'd-app', '--url', 'https://example.org/thread/1')).code, 0);
  const r1 = await run('d-app');
  assert.deepEqual(ids(r1), ['export'], 'the closing line changed, so export runs again');
  assert.equal(r1.stoppedAt, 'sponsor-hunt');
  assert.match(r1.message, /FIND SPONSOR: day 0 of 21/);
  assert.equal((await fund('done', 'd-app', 'sponsor-hunt')).code, 1, 'only a sponsor row in sponsors.md makes it done');

  // move the clock back past the kill window: blocked with the park instruction
  assert.equal((await fund('d:post', 'd-app', '--date', isoDay(Date.now() - 30 * 86400000))).code, 0);
  const kill = await row('d-app', 'sponsor-hunt');
  assert.equal(kill.done, false);
  assert.equal(kill.extra.kill, true);
  assert.match(kill.reason, /KILL: .*fund status d-app parked/);

  // regression: a KILL must not fail `check` and send revise rewriting the finished draft
  const draftBefore = readFileSync(join(dir, 'draft.md'), 'utf8');
  resetLog();
  const rk = await run('d-app');
  assert.deepEqual(ids(rk), ['export'], JSON.stringify(rk.ran));
  assert.equal(rk.reason, 'blocked', 'KILL is blocked (done() returns blocked: true), not an ordinary human action');
  assert.equal(rk.stoppedAt, 'sponsor-hunt');
  assert.match(rk.message, /KILL: .*park it: fund status d-app parked/);
  assert.deepEqual(aiCalls(), [], 'no AI call on KILL');
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), draftBefore, 'draft.md untouched');
  assert.equal((await row('d-app', 'check')).done, true);

  assert.equal((await fund('d:log', 'd-app', '--who', 'Noun owner', '--channel', 'Discord', '--ask', 'Sponsor the candidate?', '--response', 'yes, will sponsor')).code, 0);
  const r2 = await run('d-app');
  assert.deepEqual(ids(r2), ['export', 'ready'], JSON.stringify(r2.ran));
  assert.equal(r2.stoppedAt, 'submit');
  assert.match(readFileSync(join(dir, 'proposal.md'), 'utf8'), /\*\*Sponsored\.\*\*/);
  assert.equal(CORE.loadApp('d-app').call.fm.status, 'ready');
});

// ---------- Track E ----------

test('E: a fresh app waits for watch ids and a revisit date', async () => {
  await scaffold('e-fresh', 'E');
  const f = await first('e-fresh');
  assert.equal(f.step.id, 'watch-configured');
  assert.match(f.reason, /watch: is empty; revisit: is empty/);
});

test('E: scan runs from the pipeline, wait holds until a watched source changes, then reopen asks a person', async () => {
  writeFileSync(process.env.FUND_E_WATCHLIST, JSON.stringify([{ id: 'src-a', url: `${base}/e/page.html`, kind: 'html', extract: 'call/([a-z-]+)', feeds_track: 'C' }]));
  const dir = await scaffold('e-app', 'E');
  setFm('e-app', { watch: ['src-a'], revisit: '2099-01-01' });
  // Track E apps are parked by nature; scan opts in with runWhenParked, so the engine still runs it.
  assert.equal(CORE.loadApp('e-app').call.fm.status, 'parked');
  const res = await run('e-app');
  assert.deepEqual(ids(res), ['scan'], JSON.stringify(res.ran));
  assert.ok(res.ran[0].ok, res.ran[0].message);
  assert.equal(res.stoppedAt, 'wait');
  assert.match(res.message, /waiting: revisit 2099-01-01/);
  assert.equal(JSON.parse(readFileSync(process.env.FUND_E_STATE, 'utf8'))['src-a'].value.items[0], 'alpha-call');

  pages['/e/page.html'] += '<a href="/call/beta-call">Beta</a>';
  assert.equal((await fund('e:scan', '--only', 'src-a')).code, 0);
  const w = await row('e-app', 'wait');
  assert.equal(w.done, true);
  assert.match(w.reason, /src-a changed since/);
  const r2 = await run('e-app');
  assert.equal(r2.stoppedAt, 'reopen');
  assert.match(r2.message, /src-a changed/);

  P.markHumanDone(dir, 'reopen', 'moved to Track C');
  assert.equal((await run('e-app')).reason, 'complete');
});

test('E: the revisit date arriving completes wait on its own', async () => {
  await scaffold('e-due', 'E');
  setFm('e-due', { watch: ['src-a'], revisit: '2020-01-01' });
  const w = await row('e-due', 'wait');
  assert.equal(w.done, true);
  assert.match(w.reason, /revisit date 2020-01-01 has arrived/);
  assert.equal((await first('e-due')).step.id, 'reopen');
});

// ---------- the real example applications ----------

test('the example apps in applications/ evaluate and dry-run without throwing (temp copies)', async () => {
  const src = join(REAL_ROOT, 'applications');
  const examples = readdirSync(src).filter((d) => existsSync(join(src, d, 'call.md')));
  assert.ok(examples.length >= 5, `found ${examples.join(', ')}`);
  const expectFirst = { A: /deploy|record|source|draft|build|check/, B: /form|answer|fill|check|human-read/, C: /./, D: /./, E: /watch-configured|wait|reopen|scan/ };
  for (const slug of examples) {
    rmSync(join(apps, slug), { recursive: true, force: true });
    cpSync(join(src, slug), join(apps, slug), { recursive: true });
    const track = CORE.loadApp(slug).call.fm.track;
    const s = await steps(slug);
    assert.ok(existsSync(join(TRACKS[track].dir, 'pipeline.mjs')));
    const rs = await P.evaluate(s, ctxFor(slug));
    for (const r of rs) {
      assert.doesNotMatch(r.reason, /threw/, `${slug}:${r.step.id} ${r.reason}`);
      assert.ok(['done', 'next', 'blocked', 'pending', 'human'].includes(r.status));
    }
    const nx = P.firstActionable(rs);
    if (nx) assert.match(nx.step.id, expectFirst[track], `${slug} first step ${nx.step.id}`);
    const dry = await P.runPipeline(s, ctxFor(slug), { dry: true });
    assert.ok(dry.dry || dry.reason === 'closed', `${slug} dry run`);
  }
});
