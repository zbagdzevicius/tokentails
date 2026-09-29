// Track A (Build once, submit many) — hermetic tests for the JS side.
// Everything writes to temp dirs: applications, tracker, deployments registry, a fake Foundry
// project and a fake forge binary. The only "network" is a local node:http JSON-RPC server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, chmodSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'fund-track-a-'));
const apps = join(tmp, 'applications');
mkdirSync(apps);
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(tmp, 'TRACKER.md');
process.env.FUND_A_DEPLOYMENTS = join(tmp, 'deployments.json');
writeFileSync(process.env.FUND_A_DEPLOYMENTS, '[]\n');

// fake Foundry project + fake forge that logs its argv
const project = join(tmp, 'shelter-split');
mkdirSync(join(project, 'out', 'ShelterSplit.sol'), { recursive: true });
writeFileSync(join(project, 'out', 'ShelterSplit.sol', 'ShelterSplit.json'), JSON.stringify({
  bytecode: { object: '0x6080604052' }, deployedBytecode: { object: '0x60806040' }, metadata: { compiler: { version: '0.8.24+fake' } },
}));
const forgeLog = join(tmp, 'forge-argv.log');
const fakeForge = join(tmp, 'forge');
writeFileSync(fakeForge, `#!/usr/bin/env node
const fs = require('node:fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(forgeLog)}, JSON.stringify(a) + '\\n');
if (a[0] === '--version') { console.log('forge 0.0.0-fake'); process.exit(0); }
if (a[0] === 'build') { console.log('Compiler run successful!'); process.exit(0); }
if (a[0] === 'test') {
  const fail = process.env.FAKE_FORGE_FAIL === '1';
  const r = (s) => ({ status: s, reason: s === 'Failure' ? 'assert' : null, kind: { Unit: { gas: 1 } } });
  console.log('Compiling...');
  console.log(JSON.stringify({ 'test/S.t.sol:S': { test_results: {
    'test_a()': r('Success'), 'test_b()': r(fail ? 'Failure' : 'Success'),
    'testFuzz_c(uint256)': { status: 'Success', kind: { Fuzz: { runs: 512 } } } } } }));
  process.exit(fail ? 1 : 0);
}
if (a[0] === 'script') { console.log('Script ran successfully (simulation).'); process.exit(0); }
process.exit(3);
`);
chmodSync(fakeForge, 0o755);
process.env.FUND_A_PROJECT = project;
process.env.FORGE_BIN = fakeForge;

const { CORE } = await import('../lib/core.mjs');
const trackMod = await import('../tracks/a-build/track.mjs');
const track = trackMod.default;
const A = trackMod;
const { _internal: cmd } = trackMod;

const HASH = '0x' + 'ab'.repeat(32);
const ADDR = (n) => '0x' + String(n).padStart(40, '0');

function resetDeployments(list = []) { writeFileSync(process.env.FUND_A_DEPLOYMENTS, JSON.stringify(list)); }

function makeApp(slug, { call = {}, criteria = '| C1 | Impact | 100% | "impact" |\n', draft } = {}) {
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, track: 'A', status: 'drafting', deadline: 'rolling', frame: 'payout-rail', chain: 'arc', ...call }) + criteria);
  writeFileSync(join(dir, 'draft.md'), '---\nversion: 1\n---\n' + (draft ?? '## Summary <!-- criterion: C1 | limit: 280 -->\nThe Stellar contract has 1,218,693 invocations [F-007]. See [repo](https://example.org/x).\n\n## On-chain proof <!-- criterion: C1 -->\nPayouts are events.\n'));
  return dir;
}

function evidence(slug, { passed = true, ageDays = 0 } = {}) {
  const b = { generated: new Date(Date.now() - ageDays * 86400000).toISOString(), ok: passed, total: 3, passed: passed ? 3 : 2, failed: passed ? 0 : 1, bytecodeSha256: 'f'.repeat(64), runtimeBytes: 4, commit: 'abc', tree: 'clean', forge: 'fake', suites: [] };
  writeFileSync(join(apps, slug, 'build-evidence.md'), A.evidenceMarkdown(b, slug));
}

const trackResults = async (slug) => (await CORE.runChecks(slug)).results.filter((r) => r.name.startsWith('A:'));
const lvl = (rs, name) => rs.find((r) => r.name === `A:${name}`)?.level;

async function capture(fn) {
  const lines = [];
  const [log, err] = [console.log, console.error];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try { const code = await fn(); return { code, out: lines.join('\n') }; } finally { console.log = log; console.error = err; }
}

// ---------------------------------------------------------------- registry

test('chains.json has verified chain ids and no RPC URLs or secrets', () => {
  const chains = A.loadChains();
  assert.equal(chains.arc.networks.mainnet.chainId, 5042);
  assert.equal(chains.arc.networks.testnet.chainId, 5042002);
  assert.equal(chains.base.networks.mainnet.chainId, 8453);
  assert.equal(chains.arbitrum.networks.mainnet.chainId, 42161);
  const raw = readFileSync(join(REAL_ROOT, 'tracks', 'a-build', 'chains.json'), 'utf8');
  assert.doesNotMatch(raw, /"rpc(Url)?"\s*:\s*"http/i, 'RPC URLs must come from env');
  assert.doesNotMatch(raw, /0x[0-9a-f]{64}/i, 'no private keys or hashes');
  for (const c of Object.values(chains)) for (const n of Object.values(c.networks)) assert.match(n.rpcEnv, /^RPC_[A-Z_]+$/);
});

test('real deployments.json is a JSON array', () => {
  assert.ok(Array.isArray(JSON.parse(readFileSync(join(REAL_ROOT, 'tracks', 'a-build', 'deployments.json'), 'utf8'))));
});

test('a:record appends, validates and refuses duplicates', async () => {
  resetDeployments();
  const { code, out } = await capture(() => cmd.cmdRecord({ args: ['base', 'testnet', ADDR(1)], flags: { tx: HASH } }));
  assert.equal(code, 0);
  assert.match(out, /sepolia\.basescan\.org\/address\/0x0+1/);
  assert.match(out, /next: fund a:verify base testnet/);
  const list = A.loadDeployments();
  assert.equal(list.length, 1);
  assert.deepEqual({ chain: list[0].chain, network: list[0].network, chainId: list[0].chainId, tx: list[0].tx, verified: list[0].verified }, { chain: 'base', network: 'testnet', chainId: 84532, tx: HASH, verified: false });
  assert.throws(() => A.recordDeployment({ chain: 'base', network: 'testnet', address: ADDR(1) }), /already recorded/);
  assert.throws(() => A.recordDeployment({ chain: 'solana', network: 'mainnet', address: ADDR(2) }), /unknown chain/);
  assert.throws(() => A.recordDeployment({ chain: 'arc', network: 'devnet', address: ADDR(2) }), /unknown network/);
  assert.throws(() => A.recordDeployment({ chain: 'arc', network: 'mainnet', address: '0x123' }), /not a 0x-prefixed 20-byte address/);
  assert.throws(() => A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(2), tx: '0xdead' }), /tx hash/);
  assert.equal(A.loadDeployments().length, 1);
});

test('a:deployments lists explorer links', async () => {
  resetDeployments();
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(7), tx: HASH });
  const { out } = await capture(() => cmd.cmdDeployments({ flags: {} }));
  assert.match(out, /https:\/\/explorer\.arc\.io\/address\/0x0+7/);
  assert.match(out, new RegExp(`https://explorer\\.arc\\.io/tx/${HASH}`));
  assert.match(out, /next: fund a:verify arc mainnet/);
});

// ---------------------------------------------------------------- checks

test('mainnet_required warns while drafting and fails in review / ready', async () => {
  resetDeployments();
  makeApp('arc-draft', { call: { mainnet_required: true } });
  assert.equal(lvl(await trackResults('arc-draft'), 'mainnet'), 'warn');
  makeApp('arc-review', { call: { mainnet_required: true, status: 'in-review' } });
  assert.equal(lvl(await trackResults('arc-review'), 'mainnet'), 'error');
  // a testnet deploy does not satisfy a mainnet gate
  A.recordDeployment({ chain: 'arc', network: 'testnet', address: ADDR(3) });
  assert.equal(lvl(await trackResults('arc-review'), 'mainnet'), 'error');
  // a mainnet deploy on another chain does not either
  A.recordDeployment({ chain: 'base', network: 'mainnet', address: ADDR(4) });
  assert.equal(lvl(await trackResults('arc-review'), 'mainnet'), 'error');
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(5) });
  assert.notEqual(lvl(await trackResults('arc-review'), 'mainnet'), 'error');
});

test('chain lists: any listed chain satisfies the gate; unknown chain fails', async () => {
  resetDeployments([{ contract: 'ShelterSplit', chain: 'robinhood', network: 'mainnet', chainId: 4663, address: ADDR(9), verified: true }]);
  makeApp('multi', { call: { chain: ['base', 'robinhood'], mainnet_required: true, status: 'in-review' } });
  assert.equal(lvl(await trackResults('multi'), 'mainnet'), 'ok');
  makeApp('badchain', { call: { chain: 'solana' } });
  assert.equal(lvl(await trackResults('badchain'), 'chain'), 'error');
});

test('build evidence: missing or stale fails only at ready', async () => {
  resetDeployments();
  makeApp('ev', {});
  assert.equal(lvl(await trackResults('ev'), 'build-evidence'), 'warn');
  makeApp('ev-ready', { call: { status: 'ready', repo: 'https://github.com/example/shelter-split' } });
  assert.equal(lvl(await trackResults('ev-ready'), 'build-evidence'), 'error');
  evidence('ev-ready', { ageDays: 8 });
  const stale = await trackResults('ev-ready');
  assert.equal(lvl(stale, 'build-evidence'), 'error');
  assert.match(stale.find((r) => r.name === 'A:build-evidence').detail, /days old/);
  evidence('ev-ready', { ageDays: 1 });
  assert.equal(lvl(await trackResults('ev-ready'), 'build-evidence'), 'ok');
  evidence('ev-ready', { passed: false });
  assert.equal(lvl(await trackResults('ev-ready'), 'build-evidence'), 'error');
});

test('repo must be set (https) before ready', async () => {
  makeApp('repo-draft', {});
  assert.equal(lvl(await trackResults('repo-draft'), 'repo'), 'warn');
  makeApp('repo-ready', { call: { status: 'ready' } });
  assert.equal(lvl(await trackResults('repo-ready'), 'repo'), 'error');
  makeApp('repo-bad', { call: { repo: 'git@github.com:x/y' } });
  assert.equal(lvl(await trackResults('repo-bad'), 'repo'), 'error');
  makeApp('repo-ok', { call: { status: 'ready', repo: 'https://github.com/x/y' } });
  assert.equal(lvl(await trackResults('repo-ok'), 'repo'), 'ok');
});

test('closed applications skip track checks', async () => {
  makeApp('done', { call: { status: 'submitted', mainnet_required: true } });
  const rs = await trackResults('done');
  assert.deepEqual(rs.map((r) => r.level), ['ok']);
});

test('build window order is validated', async () => {
  makeApp('win', { call: { build_window_start: '2026-12-10', build_window_end: '2026-12-01' } });
  assert.equal(lvl(await trackResults('win'), 'build-window'), 'error');
});

// ---------------------------------------------------------------- matrix

test('a:matrix unblocks Arc only after an Arc mainnet deploy, and names the best next deploy', async () => {
  resetDeployments();
  for (const s of ['arc-app', 'base-app']) {
    makeApp(s, { call: { chain: s.startsWith('arc') ? 'arc' : 'base', mainnet_required: true, repo: 'https://github.com/x/y', deadline: '2099-01-01T00:00:00Z' } });
    evidence(s);
  }
  const pick = (rows, slug) => rows.find((r) => r.slug === slug);
  let rows = A.matrixRows(A.trackAApps());
  assert.equal(pick(rows, 'arc-app').unblocked, false);
  assert.match(pick(rows, 'arc-app').blockers[0].why, /arc mainnet/);
  assert.equal(pick(rows, 'arc-app').blockers[0].next, 'fund a:deploy arc mainnet');
  A.recordDeployment({ chain: 'arc', network: 'testnet', address: ADDR(11) });
  rows = A.matrixRows(A.trackAApps());
  assert.equal(pick(rows, 'arc-app').unblocked, false, 'testnet does not count');
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(12) });
  rows = A.matrixRows(A.trackAApps());
  assert.equal(pick(rows, 'arc-app').unblocked, true);
  assert.equal(pick(rows, 'base-app').unblocked, false);
  assert.ok(A.nextDeploys(rows).some((d) => d.chain === 'base' && d.slugs.includes('base-app')));
  const { code, out } = await capture(() => cmd.cmdMatrix({ flags: {} }));
  assert.equal(code, 0);
  assert.match(out, /arc-app .*UNBLOCKED/);
  assert.match(out, /base-app .*BLOCKED: needs base mainnet deploy/);
  assert.match(out, /next: /);
});

// ---------------------------------------------------------------- submission

test('a:submission renders profile sections, strips citations, keeps links, adds deployments and build', async () => {
  resetDeployments();
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(21), tx: HASH });
  const dir = makeApp('sub', { call: { repo: 'https://github.com/x/y' } });
  evidence('sub');
  writeFileSync(join(dir, 'submission.json'), JSON.stringify({ submission: {
    fields: { Track: 'Public Goods' },
    sections: [
      { title: 'Pitch', from: 'Summary', limit: 280 },
      { title: 'Proof', from: 'On-chain proof', auto: 'deployments' },
      { title: 'Build', auto: 'build' },
    ],
    checklist: ['Record the demo'],
  } }));
  const { code, out } = await capture(() => cmd.cmdSubmission({ args: ['sub'], flags: {} }));
  assert.equal(code, 0, out);
  assert.match(out, /next: fund check sub/);
  const text = readFileSync(join(dir, 'submission.md'), 'utf8');
  assert.match(text, /## Pitch {2}<!-- \d+\/280 chars -->/);
  assert.match(text, /1,218,693 invocations\./, 'citation stripped, punctuation kept');
  assert.doesNotMatch(text, /\[F-\d{3}\]/);
  assert.match(text, /\[repo\]\(https:\/\/example\.org\/x\)/, 'links preserved');
  assert.match(text, /https:\/\/explorer\.arc\.io\/address\/0x0+21/);
  assert.match(text, new RegExp(`explorer\\.arc\\.io/tx/${HASH}`));
  assert.match(text, /All 3\/3 Foundry tests pass/);
  assert.match(text, /\| Track \| Public Goods \|/);
  assert.match(text, /- \[ \] Record the demo/);
  assert.doesNotMatch(text, /\{\{[A-Z_]+\}\}/);
  // --keep-cites keeps them
  const kept = A.renderSubmission(CORE.loadApp('sub'), { keepCites: true }).text;
  assert.match(kept, /\[F-007\]/);
});

test('a:submission flags over-limit sections and missing draft sections (exit 1)', async () => {
  const dir = makeApp('sub-over', { draft: '## Summary <!-- criterion: C1 -->\n' + 'word '.repeat(80) + '\n' });
  writeFileSync(join(dir, 'submission.json'), JSON.stringify({ submission: { sections: [{ title: 'Pitch', from: 'Summary', limit: 100 }, { title: 'Team', from: 'Team' }] } }));
  const { code, out } = await capture(() => cmd.cmdSubmission({ args: ['sub-over'], flags: {} }));
  assert.equal(code, 1);
  assert.match(out, /"Pitch" is \d+\/100 chars/);
  assert.match(out, /no "## Team" section/);
});

test('without a profile the draft sections are used as-is', () => {
  const { text, problems, profile } = A.renderSubmission(CORE.loadApp('ev'));
  assert.equal(profile.found, false);
  assert.deepEqual(problems, []);
  assert.match(text, /## Summary/);
  assert.match(text, /## On-chain proof[\s\S]*No ShelterSplit deployment recorded|## On-chain proof[\s\S]*\| Network \|/);
});

test('stale submission.md is flagged by fund check', async () => {
  const dir = join(apps, 'sub');
  const old = new Date(Date.now() - 3600_000);
  utimesSync(join(dir, 'submission.md'), old, old);
  assert.equal(lvl(await trackResults('sub'), 'submission'), 'warn');
});

// ---------------------------------------------------------------- build

test('a:build runs forge build + test and writes build-evidence.md', async () => {
  makeApp('b1', {});
  writeFileSync(forgeLog, '');
  const { code, out } = await capture(() => cmd.cmdBuild({ flags: { slug: 'b1' } }));
  assert.equal(code, 0, out);
  assert.match(out, /3\/3 tests passing/);
  assert.match(out, /next: fund a:submission b1/);
  const calls = readFileSync(forgeLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls.slice(0, 2), [['build'], ['test', '--json']]);
  const ev = A.readEvidence(CORE.loadApp('b1'));
  assert.equal(String(ev.passed), 'true');
  assert.equal(ev.tests_total, 3);
  assert.equal(ev.bytecode_sha256.length, 64);
  assert.equal(lvl(await trackResults('b1'), 'build-evidence'), 'ok');
});

test('a:build records failures and exits 1', async () => {
  makeApp('b2', {});
  process.env.FAKE_FORGE_FAIL = '1';
  try {
    const { code, out } = await capture(() => cmd.cmdBuild({ flags: { slug: 'b2' } }));
    assert.equal(code, 1);
    assert.match(out, /2\/3 tests passing, 1 failing/);
    assert.match(out, /next: fix the failing tests in .*, then fund a:build --slug b2/, 'regression: a failing build must not point at a:submission');
    assert.doesNotMatch(out, /next: fund a:submission/);
  } finally { delete process.env.FAKE_FORGE_FAIL; }
  const ev = A.readEvidence(CORE.loadApp('b2'));
  assert.equal(String(ev.passed), 'false');
});

test('parseForgeJson tolerates leading compiler output', () => {
  const r = A.parseForgeJson('Compiling 3 files\n{"a:B":{"test_results":{"t()":{"status":"Success"},"u()":{"status":"Skipped"}}}}');
  assert.deepEqual([r.total, r.passed, r.skipped, r.failed], [2, 1, 1, 0]);
});

// ---------------------------------------------------------------- deploy + verify (never broadcasts)

test('a:deploy prints the command and --simulate never passes --broadcast to forge', async () => {
  const plan = A.deployPlan(A.loadChains(), 'arc', 'mainnet');
  assert.equal(plan.env.EXPECTED_CHAIN_ID, '5042');
  assert.equal(plan.env.SHELTERSPLIT_TOKEN, '0x3600000000000000000000000000000000000000');
  assert.ok(!plan.simulateArgs.includes('--broadcast'));
  writeFileSync(forgeLog, '');
  process.env.RPC_ARC_MAINNET = 'http://127.0.0.1:9/unused';
  try {
    const { code, out } = await capture(() => cmd.cmdDeploy({ args: ['arc', 'mainnet'], flags: { simulate: true } }));
    assert.equal(code, 0, out);
    assert.match(out, /next: fund a:record arc mainnet/);
  } finally { delete process.env.RPC_ARC_MAINNET; }
  const calls = readFileSync(forgeLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'script');
  assert.ok(!calls[0].includes('--broadcast'), 'simulation must not broadcast');
  assert.ok(!calls[0].some((a) => /private-key/.test(a)));
});

function rpcServer(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const { id, method, params } = JSON.parse(body);
        seen.push(method);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: handler(method, params) }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) }));
  });
}

test('a:verify checks chain id, code and deploy tx over read-only JSON-RPC', async () => {
  resetDeployments();
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(31), tx: HASH });
  const good = await rpcServer((m) => ({ eth_chainId: '0x13b2', eth_getCode: '0x6080', eth_getTransactionReceipt: { status: '0x1', contractAddress: ADDR(31) } })[m]);
  process.env.RPC_ARC_MAINNET = good.url;
  try {
    const { code, out } = await capture(() => cmd.cmdVerify({ args: ['arc', 'mainnet'], flags: {} }));
    assert.equal(code, 0, out);
    assert.match(out, /✓ arc mainnet/);
  } finally { delete process.env.RPC_ARC_MAINNET; await good.close(); }
  assert.deepEqual([...new Set(good.seen)].sort(), ['eth_chainId', 'eth_getCode', 'eth_getTransactionReceipt']);
  assert.equal(A.loadDeployments()[0].verified, true);

  const wrong = await rpcServer((m) => ({ eth_chainId: '0x2105', eth_getCode: '0x' })[m] ?? null);
  process.env.RPC_ARC_MAINNET = wrong.url;
  try {
    const { code, out } = await capture(() => cmd.cmdVerify({ args: ['arc', 'mainnet'], flags: {} }));
    assert.equal(code, 1);
    assert.match(out, /RPC is chain 8453, expected 5042/);
    assert.match(out, /no contract code/);
  } finally { delete process.env.RPC_ARC_MAINNET; await wrong.close(); }
  assert.equal(A.loadDeployments()[0].verified, false);
});

test('a:verify refuses to run without the RPC env var', async () => {
  const { code, out } = await capture(() => cmd.cmdVerify({ args: ['base', 'mainnet'], flags: {} }));
  assert.equal(code, 2);
  assert.match(out, /set RPC_BASE_MAINNET/);
});

// ---------------------------------------------------------------- scaffold + profiles

test('fund new / a:init fill chain, gates and criteria from the program profile', async () => {
  await CORE.scaffold('arc-microgrants', { track: 'A' });
  const fm = CORE.loadApp('arc-microgrants').call.fm;
  assert.equal(fm.program, 'Arc Microgrants');
  assert.equal(fm.chain, 'arc');
  assert.equal(fm.mainnet_required, true);
  assert.equal(fm.frame, 'payout-rail');
  const { code } = await capture(() => cmd.cmdInit({ args: ['colosseum-worlds-fair'], flags: { slug: 'cwf-copy' } }));
  assert.equal(code, 0);
  const app = CORE.loadApp('cwf-copy');
  // The profile is the source of truth for the chains (it changes when the chain decision does).
  const profile = JSON.parse(readFileSync(new URL('../tracks/a-build/programs/colosseum-worlds-fair.json', import.meta.url), 'utf8'));
  assert.deepEqual(app.call.fm.chain, [].concat(profile.chain));
  assert.equal(app.call.fm.profile, 'colosseum-worlds-fair');
  assert.equal(app.criteria.length, 6);
  // scaffolded skeleton is structurally valid (placeholders only warn while researching)
  const { ok } = await CORE.runChecks('cwf-copy');
  assert.equal(ok, true);
});

test('every program profile is valid and names known chains', () => {
  const chains = A.loadChains();
  const profiles = A.listProfiles();
  assert.ok(profiles.length >= 8);
  const banned = ['bga', 'mantle', 'stellar community fund', 'giveth'];
  for (const p of profiles) {
    const j = JSON.parse(readFileSync(join(REAL_ROOT, 'tracks', 'a-build', 'programs', `${p}.json`), 'utf8'));
    assert.ok(j.program, `${p}: program`);
    for (const c of [].concat(j.chain || [])) assert.ok(chains[c], `${p}: unknown chain ${c}`);
    assert.ok(!banned.some((b) => j.program.toLowerCase().includes(b)), `${p}: excluded program`);
    for (const s of j.submission?.sections || []) assert.ok(s.from || s.auto, `${p}: section ${s.title} needs from or auto`);
  }
});

test('the example application passes fund check', async () => {
  cpSync(join(REAL_ROOT, 'applications', 'colosseum-worlds-fair'), join(apps, 'colosseum-worlds-fair'), { recursive: true });
  resetDeployments();
  const { ok, results } = await CORE.runChecks('colosseum-worlds-fair');
  assert.equal(ok, true, results.filter((r) => r.level === 'error').map((r) => `${r.name}: ${r.detail}`).join('\n'));
  assert.equal(results.find((r) => r.name === 'A:mainnet').level, 'warn', 'no mainnet yet: warning while drafting');
  assert.equal(results.find((r) => r.name === 'criteria').level, 'ok');
  assert.ok(existsSync(join(apps, 'colosseum-worlds-fair', 'draft.md')));
});

// ---------------------------------------------------------------- regressions (adversarial validation)

test('regression: fund new <program-key> renders the program name, not the slug, into every file', async () => {
  await CORE.scaffold('team1-avalanche', { track: 'A' });
  const dir = join(apps, 'team1-avalanche');
  const call = readFileSync(join(dir, 'call.md'), 'utf8');
  const draft = CORE.loadApp('team1-avalanche').draft;
  assert.match(call, /^# Team1 Avalanche mini grants — call rules/m);
  assert.equal(draft.fm.program, 'Team1 Avalanche mini grants');
  assert.match(readFileSync(join(dir, 'source.md'), 'utf8'), /team1\.network\/grants/);
  assert.doesNotMatch(call + readFileSync(join(dir, 'draft.md'), 'utf8'), /# team1-avalanche —/);
  // a --program given on the command line still wins over the profile
  await CORE.scaffold('base-builder-grants', { track: 'A', program: 'Base Builder (custom)' });
  assert.match(readFileSync(join(apps, 'base-builder-grants', 'call.md'), 'utf8'), /^# Base Builder \(custom\) — call rules/m);
  assert.equal(CORE.loadApp('base-builder-grants').call.fm.chain, 'base');
});

test('regression: mainnet_required typos never switch the mainnet gate off', async () => {
  resetDeployments();
  makeApp('mr-yes', { call: { mainnet_required: 'yes' } });
  assert.equal(lvl(await trackResults('mr-yes'), 'mainnet'), 'warn');
  makeApp('mr-str', { call: { mainnet_required: 'True', status: 'ready' } });
  assert.equal(lvl(await trackResults('mr-str'), 'mainnet'), 'error');
  makeApp('mr-bad', { call: { mainnet_required: 'maybe' } });
  const bad = (await trackResults('mr-bad')).find((r) => r.name === 'A:mainnet');
  assert.equal(bad.level, 'error');
  assert.match(bad.detail, /not true or false/);
  const row = A.matrixRows([CORE.loadApp('mr-yes')])[0];
  assert.equal(row.mainnetRequired, true);
  assert.equal(A.mainnetRequired(CORE.loadApp(makeApp('mr-no', { call: { mainnet_required: 'no' } }) && 'mr-no')), false);
});

test('regression: chain names are case-insensitive', async () => {
  resetDeployments([{ chain: 'arc', network: 'mainnet', chainId: 5042, address: ADDR(77), verified: true }]);
  makeApp('case', { call: { chain: 'Arc', mainnet_required: true, status: 'in-review' } });
  const rs = await trackResults('case');
  assert.equal(lvl(rs, 'chain'), 'ok');
  assert.equal(lvl(rs, 'mainnet'), 'ok');
});

test('regression: malformed deployments.json names the file; an empty file is an empty registry', async () => {
  makeApp('dep', {});
  writeFileSync(process.env.FUND_A_DEPLOYMENTS, '{bad');
  try {
    const r = (await trackResults('dep')).find((x) => x.level === 'error');
    assert.ok(r.detail.includes(process.env.FUND_A_DEPLOYMENTS), r.detail);
    assert.match(r.detail, /not valid JSON/);
    writeFileSync(process.env.FUND_A_DEPLOYMENTS, '\n');
    assert.deepEqual(A.loadDeployments(), []);
  } finally { resetDeployments(); }
});

test('regression: build evidence from uncommitted source never cites a commit, and blocks ready', async () => {
  resetDeployments();
  makeApp('dirty', { call: { chain: 'arc', repo: 'https://github.com/example/x', profile: 'arc-microgrants' } });
  const b = { generated: new Date().toISOString(), ok: true, total: 3, passed: 3, failed: 0, bytecodeSha256: 'f'.repeat(64), runtimeBytes: 4, commit: 'deadbeef0000', tree: 'untracked, not committed yet', forge: 'fake', suites: [] };
  writeFileSync(join(apps, 'dirty', 'build-evidence.md'), A.evidenceMarkdown(b, 'dirty'));
  const { text } = A.renderSubmission(CORE.loadApp('dirty'), { deployments: [] });
  assert.doesNotMatch(text, /commit `deadbeef0000`/);
  assert.match(text, /uncommitted source/);
  assert.equal(lvl(await trackResults('dirty'), 'build-evidence'), 'ok', 'drafting: fine');
  CORE.updateFrontmatter(join(apps, 'dirty', 'call.md'), { status: 'in-review' });
  assert.equal(lvl(await trackResults('dirty'), 'build-evidence'), 'warn');
  CORE.updateFrontmatter(join(apps, 'dirty', 'call.md'), { status: 'ready' });
  assert.equal(lvl(await trackResults('dirty'), 'build-evidence'), 'error');
  writeFileSync(join(apps, 'dirty', 'build-evidence.md'), A.evidenceMarkdown({ ...b, tree: 'clean' }, 'dirty'));
  assert.match(A.renderSubmission(CORE.loadApp('dirty'), { deployments: [] }).text, /commit `deadbeef0000`/);
});

test('regression: a:verify times out on a silent RPC, keeps the record, never prints the URL', async () => {
  resetDeployments();
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(41) });
  const list = A.loadDeployments(); list[0].verified = true; writeFileSync(process.env.FUND_A_DEPLOYMENTS, JSON.stringify(list));
  const hang = createServer(() => {}); // accepts, never answers
  await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${hang.address().port}/v2/SECRETKEY123`;
  process.env.RPC_ARC_MAINNET = url;
  process.env.FUND_A_RPC_TIMEOUT_MS = '200';
  try {
    const { code, out } = await capture(() => cmd.cmdVerify({ args: ['arc', 'mainnet'], flags: {} }));
    assert.equal(code, 1);
    assert.match(out, /RPC from \$RPC_ARC_MAINNET failed: no answer/);
    assert.ok(!out.includes('SECRETKEY123'), out);
    assert.match(out, /next: check that \$RPC_ARC_MAINNET points at a working Arc mainnet RPC/);
    assert.equal(A.loadDeployments()[0].verified, true, 'an RPC outage does not flip a verified record');
  } finally { delete process.env.RPC_ARC_MAINNET; delete process.env.FUND_A_RPC_TIMEOUT_MS; hang.closeAllConnections(); await new Promise((r) => hang.close(r)); }
});

test('regression: a:verify notes when on-chain code size differs from the local build', async () => {
  resetDeployments();
  A.recordDeployment({ chain: 'arc', network: 'mainnet', address: ADDR(42) });
  // fake artifact runtime is 4 bytes; serve 2 bytes (e.g. the USDC address pasted by mistake)
  const srv = await rpcServer((m) => ({ eth_chainId: '0x13b2', eth_getCode: '0x6080' })[m]);
  process.env.RPC_ARC_MAINNET = srv.url;
  try {
    const { out } = await capture(() => cmd.cmdVerify({ args: ['arc', 'mainnet'], flags: {} }));
    assert.match(out, /code is 2 bytes but the local ShelterSplit build is 4 bytes/);
    const same = await A.verifyDeployment({ chainId: 5042, address: ADDR(42) }, { rpcUrl: srv.url });
    assert.equal(same.notes.length, 1);
  } finally { delete process.env.RPC_ARC_MAINNET; await srv.close(); }
});

test('regression: a:build rejects an unknown slug before running forge', async () => {
  writeFileSync(forgeLog, '');
  const { code, out } = await capture(() => cmd.cmdBuild({ flags: { slug: 'does-not-exist' } }));
  assert.equal(code, 2);
  assert.match(out, /no application "does-not-exist"/);
  assert.equal(readFileSync(forgeLog, 'utf8'), '', 'forge was not run');
});

test('regression: a:init --from reuses a sibling draft and drops criterion ids the new call lacks', async () => {
  makeApp('sib', { criteria: '| C1 | Impact | 100% | "impact" |\n| C2 | Tech | 0 | "tech" |\n', draft: '## Summary <!-- criterion: C1, C2 | limit: 280 -->\nsib Program pays shelters.\n\n## How it works <!-- criterion: C2 -->\nIt splits.\n' });
  CORE.updateFrontmatter(join(apps, 'sib', 'draft.md'), { program: 'sib' });
  const bad = await capture(() => cmd.cmdInit({ args: ['arc-microgrants'], flags: { slug: 'from-missing', from: 'nope' } }));
  assert.equal(bad.code, 2);
  assert.equal(existsSync(join(apps, 'from-missing')), false, 'nothing scaffolded on a bad --from');
  // colosseum profile has C1..C6; give the copy a call with only C1 by using a profile without criteria + a table
  const { code, out } = await capture(() => cmd.cmdInit({ args: ['colosseum-worlds-fair'], flags: { slug: 'from-ok', from: 'sib' } }));
  assert.equal(code, 0, out);
  const app = CORE.loadApp('from-ok');
  assert.deepEqual(app.sections.map((s) => s.criteria), [['C1', 'C2'], ['C2']]);
  assert.equal(app.draft.fm.copied_from, 'sib');
  assert.equal(app.draft.fm.program, "Colosseum Crypto World's Fair");
  // now a call with only C1: C2 is dropped, and a section left with no ids loses the empty key
  writeFileSync(join(apps, 'from-ok', 'call.md'), readFileSync(join(apps, 'from-ok', 'call.md'), 'utf8').replace(/^\| C[2-6] .*\n/gm, ''));
  const r = A.copyDraftFrom('sib', join(apps, 'from-ok'), 'X');
  assert.deepEqual(r.dropped, ['C2']);
  const again = CORE.loadApp('from-ok');
  assert.deepEqual(again.sections.map((s) => s.criteria), [['C1'], []]);
  assert.equal(again.sections[0].limit, 280, 'limit annotation kept');
  const { ok, results } = await CORE.runChecks('from-ok');
  assert.equal(ok, true, results.filter((x) => x.level === 'error').map((x) => `${x.name}: ${x.detail}`).join('\n'));
});
