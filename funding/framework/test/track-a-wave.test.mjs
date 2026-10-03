// Track A deploy wave — hermetic: temp chains, programs, portfolio, deployments and a fake Foundry
// broadcast folder. Nothing is signed or sent; the generated script is only inspected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'fund-wave-'));
const project = join(tmp, 'shelter-split');
const programs = join(tmp, 'programs');
mkdirSync(join(project, 'out', 'ShelterSplit.sol'), { recursive: true });
mkdirSync(programs);
mkdirSync(join(tmp, 'applications'));
const USDC = '0x' + '11'.repeat(20);
const SPLIT = '0x' + 'ab'.repeat(20);
const TX = '0x' + 'cd'.repeat(32);
const PAY = '0x' + 'ef'.repeat(32);
const EURC = '0x' + '22'.repeat(20);
const SPLIT2 = '0x' + 'ba'.repeat(20);
const net = (chainId, rpcEnv, extra = {}) => ({ chainId, explorer: 'https://x', address: '{explorer}/address/{address}', tx: '{explorer}/tx/{tx}', usdc: USDC, usdcDecimals: 6, rpcEnv, ...extra });
writeFileSync(join(tmp, 'chains.json'), JSON.stringify({
  _readme: 'test',
  alpha: { name: 'Alpha', networks: { mainnet: net(111, 'RPC_ALPHA', { splitTokens: { EURC: { address: EURC, decimals: 6, verify: false } } }) } },
  beta: { name: 'Beta', networks: { mainnet: net(222, 'RPC_BETA', { verify: true, notes: "it's odd", splitTokens: { EURC: { address: null, verify: true, notes: 'no EURC here' } } }) } },
  musd: { name: 'Mu', networks: { mainnet: net(333, 'RPC_MU', { usdc: null, splitToken: { symbol: 'MUSD', address: null, decimals: 18 } }) } },
  idle: { name: 'Idle', networks: { mainnet: net(444, 'RPC_IDLE') } },
}));
writeFileSync(join(programs, 'big.json'), JSON.stringify({ program: 'Big', chain: 'beta', mainnet_required: true, deadline: 'rolling' }));
writeFileSync(join(programs, 'small.json'), JSON.stringify({ program: 'Small', chain: ['alpha', 'beta'], mainnet_required: true, deadline: 'rolling' }));
writeFileSync(join(programs, 'mu.json'), JSON.stringify({ program: 'Mu', chain: 'musd', mainnet_required: true, deadline: 'rolling' }));
writeFileSync(join(tmp, 'portfolio.json'), JSON.stringify({ opportunities: [
  { slug: 'big', success: 0.5, capital_mid_usd: 10000, verdict: 'COND' },
  { slug: 'small', success: 0.1, capital_mid_usd: 1000, verdict: 'DO' },
  { slug: 'mu', success: 0.4, capital_mid_usd: 200, verdict: 'COND' },
] }));
writeFileSync(join(tmp, 'deployments.json'), '[]\n');
const published = join(tmp, 'public-deployments.json');
writeFileSync(published, '[]\n');
process.env.FUND_A_PUBLISH = published;
Object.assign(process.env, {
  FUND_A_CHAINS: join(tmp, 'chains.json'), FUND_A_DEPLOYMENTS: join(tmp, 'deployments.json'), FUND_A_PROJECT: project,
  FUND_A_PROGRAMS: programs, FUND_PORTFOLIO: join(tmp, 'portfolio.json'), FUND_A_WAVE_DIR: join(tmp, 'wave'),
  FUND_APPS_DIR: join(tmp, 'applications'), FUND_TRACKER: join(tmp, 'TRACKER.md'),
});
for (const k of ['RPC_ALPHA', 'RPC_BETA', 'RPC_MU', 'RPC_IDLE']) delete process.env[k];

await import('../tracks/a-build/track.mjs'); // registers the wave commands; must load before wave.mjs
const W = await import('../tracks/a-build/wave.mjs');

test('ranking: chains ordered by the EV they unlock, chains nobody needs left out', async () => {
  const rows = await W.waveRanking({ env: { RPC_ALPHA: 'http://a' } });
  assert.deepEqual(rows.map((r) => r.chain), ['beta', 'alpha', 'musd']);
  assert.equal(rows[0].ev, 5000 + 100);
  assert.deepEqual(rows.find((r) => r.chain === 'alpha').missing, []);
  assert.ok(rows.find((r) => r.chain === 'beta').missing.includes('$RPC_BETA'));
  const mu = rows.find((r) => r.chain === 'musd');
  assert.equal(mu.token.symbol, 'MUSD');
  assert.ok(mu.missing.some((m) => m.startsWith('MUSD address')));
});

test('script: keystore signer, chain-id guard per chain, no private keys, dry run supported', async () => {
  const rows = await W.waveRanking({});
  const s = W.waveScript(rows, { project, root: tmp, date: '2026-09-28' });
  assert.match(s, /^#!\/usr\/bin\/env bash/);
  assert.doesNotMatch(s, /--private-key|PRIVATE_KEY/);
  assert.match(s, /SIGNER=\(--account "\$FUND_KEYSTORE"\)/);
  assert.match(s, /deploy beta 222 RPC_BETA '0x1{40}'/);
  assert.match(s, /deploy musd 333 RPC_MU ''/); // unknown token: the script skips it, never guesses
  assert.match(s, /EXPECTED_CHAIN_ID="\$id"/);
  assert.match(s, /DRY_RUN/);
  assert.match(s, /# beta: chains.json marks this network verify: true/);
  assert.match(s, /a:ingest --network mainnet/);
  assert.ok(s.indexOf('deploy beta') < s.indexOf('deploy alpha'));
});

test('a:wave writes an executable script and skips chains already deployed', async () => {
  const rc = await W.waveCommands['a:wave'].run({ args: [], flags: {} });
  assert.equal(rc, 0);
  const s = readFileSync(join(tmp, 'wave', 'deploy-mainnet.sh'), 'utf8');
  assert.match(s, /deploy alpha 111/);
});

test('ingest: records deploys and proof payouts from broadcasts, idempotent', async () => {
  const dep = join(project, 'broadcast', 'DeployShelterSplit.s.sol', '111');
  const pr = join(project, 'broadcast', 'ProofDisburse.s.sol', '111');
  mkdirSync(dep, { recursive: true });
  mkdirSync(pr, { recursive: true });
  writeFileSync(join(dep, 'run-latest.json'), JSON.stringify({ transactions: [{ transactionType: 'CREATE', contractName: 'ShelterSplit', contractAddress: SPLIT, hash: TX }] }));
  writeFileSync(join(pr, 'run-latest.json'), JSON.stringify({ transactions: [
    { transactionType: 'CALL', function: 'approve(address,uint256)', contractAddress: USDC, hash: '0x' + '01'.repeat(32) },
    { transactionType: 'CALL', function: 'disburse(uint256,string)', contractAddress: SPLIT, hash: PAY },
  ] }));
  const found = await W.scanBroadcasts({});
  assert.deepEqual(found.map((f) => [f.kind, f.chain, f.known]), [['deploy', 'alpha', false], ['proof', 'alpha', false]]);
  await W.waveCommands['a:ingest'].run({ args: [], flags: {} });
  let list = JSON.parse(readFileSync(join(tmp, 'deployments.json'), 'utf8'));
  assert.equal(list.length, 1);
  assert.equal(list[0].address, SPLIT);
  assert.equal(list[0].tx, TX);
  assert.deepEqual(list[0].proofTxs, [PAY]);
  const pub = JSON.parse(readFileSync(published, 'utf8'));
  assert.equal(pub.length, 1, 'mainnet list published for the payouts page and the heist');
  assert.equal(pub[0].address, SPLIT);
  assert.deepEqual(pub[0].proofTxs, [PAY]);
  assert.equal(pub[0].verified, undefined, 'only public fields are published');
  await W.waveCommands['a:ingest'].run({ args: [], flags: {} });
  list = JSON.parse(readFileSync(join(tmp, 'deployments.json'), 'utf8'));
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].proofTxs, [PAY]);
  assert.ok((await W.scanBroadcasts({})).every((f) => f.known));
  // alpha is deployed now, so the next wave leaves it out
  const rows = (await W.waveRanking({})).filter((r) => !r.deployed.length);
  assert.ok(!rows.some((r) => r.chain === 'alpha'));
});

test('splitToken: default token, a listed second token, and an unlisted one', () => {
  const n = { usdc: USDC, usdcDecimals: 6, splitTokens: { EURC: { address: EURC, decimals: 6, verify: false } } };
  assert.deepEqual(W.splitToken(n), { symbol: 'USDC', address: USDC, decimals: 6, alt: false, listed: true, verify: false });
  assert.deepEqual(W.splitToken(n, 'usdc'), W.splitToken(n));
  assert.deepEqual(W.splitToken(n, 'eurc'), { symbol: 'EURC', address: EURC, decimals: 6, alt: true, listed: true, verify: false });
  assert.deepEqual(W.splitToken(n, 'XYZ'), { symbol: 'XYZ', address: null, decimals: 6, alt: true, listed: false, verify: true });
  assert.equal(W.tokenSymbolOf(n, EURC.toUpperCase().replace('0X', '0x')), 'EURC');
  assert.equal(W.tokenSymbolOf(n, USDC), 'USDC');
  assert.equal(W.tokenSymbolOf(n, '0x' + '99'.repeat(20)), null);
});

test('--token EURC: only chains that list EURC, a null address is flagged, separate script file', async () => {
  const rows = await W.waveRanking({ token: 'EURC' });
  assert.deepEqual(rows.map((r) => r.chain), ['beta', 'alpha']); // musd has no EURC entry
  const beta = rows.find((r) => r.chain === 'beta');
  assert.ok(beta.missing.some((m) => m.startsWith('EURC address (chains.json beta.networks.mainnet.splitTokens.EURC)')));
  assert.equal(beta.needsCheck, true);
  // alpha already has a USDC deployment from the ingest test; the EURC instance is still to do
  const alpha = rows.find((r) => r.chain === 'alpha');
  assert.equal(alpha.token.address, EURC);
  assert.deepEqual(alpha.deployed, []);
  const s = W.waveScript(rows, { project, root: tmp, date: '2026-09-29', token: alpha.token });
  assert.match(s, /fund a:wave --token EURC/);
  assert.match(s, /SECOND instance per chain, paying out EURC/);
  assert.match(s, /deploy alpha 111 RPC_ALPHA '0x2{40}'/);
  assert.match(s, /deploy beta 222 RPC_BETA ''/);
  assert.match(s, /DRY_RUN=1 \.\/deploy-mainnet-eurc\.sh/);
  assert.equal(W.waveFile('mainnet', alpha.token), 'deploy-mainnet-eurc.sh');
  assert.equal(W.waveFile('mainnet', W.splitToken({ usdc: USDC })), 'deploy-mainnet.sh');
  const rc = await W.waveCommands['a:wave'].run({ args: [], flags: { token: 'eurc' } });
  assert.equal(rc, 0);
  assert.match(readFileSync(join(tmp, 'wave', 'deploy-mainnet-eurc.sh'), 'utf8'), /deploy alpha 111 RPC_ALPHA '0x2{40}'/);
});

test('ingest: records the payout token from the constructor argument; EURC wave then skips that chain', async () => {
  const dep = join(project, 'broadcast', 'DeployShelterSplit.s.sol', '111');
  writeFileSync(join(dep, 'run-latest.json'), JSON.stringify({ transactions: [{ transactionType: 'CREATE', contractName: 'ShelterSplit', contractAddress: SPLIT2, hash: '0x' + '02'.repeat(32), arguments: [EURC, '0x' + '33'.repeat(20), '0x' + '44'.repeat(20)] }] }));
  await W.waveCommands['a:ingest'].run({ args: [], flags: {} });
  const list = JSON.parse(readFileSync(join(tmp, 'deployments.json'), 'utf8'));
  assert.equal(list.length, 2);
  assert.equal(list[0].token, undefined); // the USDC instance recorded before token tracking
  assert.equal(list[1].address, SPLIT2);
  assert.equal(list[1].token, 'EURC');
  const eurcRows = (await W.waveRanking({ token: 'EURC' })).filter((r) => !r.deployed.length);
  assert.ok(!eurcRows.some((r) => r.chain === 'alpha'));
  const usdcAlpha = (await W.waveRanking({})).find((r) => r.chain === 'alpha');
  assert.deepEqual(usdcAlpha.deployed, [SPLIT]);
});

test('ingest: a deploy whose forge receipt failed or is missing is never recorded or published', async () => {
  const dep = join(project, 'broadcast', 'DeployShelterSplit.s.sol', '222');
  mkdirSync(dep, { recursive: true });
  const DEAD = '0x' + '5a'.repeat(20);
  const H = '0x' + '06'.repeat(32);
  const create = { transactionType: 'CREATE', contractName: 'ShelterSplit', contractAddress: DEAD, hash: H, arguments: [USDC, '0x' + '33'.repeat(20), '0x' + '44'.repeat(20)] };
  for (const receipts of [[{ transactionHash: H, status: '0x0' }], []]) {
    writeFileSync(join(dep, 'run-latest.json'), JSON.stringify({ transactions: [create], receipts }));
    const f = (await W.scanBroadcasts({})).find((x) => x.chain === 'beta');
    assert.equal(f.mined, receipts.length ? 'failed' : 'pending');
    await W.waveCommands['a:ingest'].run({ args: [], flags: {} });
    const list = JSON.parse(readFileSync(join(tmp, 'deployments.json'), 'utf8'));
    assert.ok(!list.some((d) => d.address === DEAD), 'failed deploy not recorded');
    assert.ok(!JSON.parse(readFileSync(published, 'utf8')).some((d) => d.address === DEAD), 'failed deploy not published');
  }
  writeFileSync(join(dep, 'run-latest.json'), JSON.stringify({ transactions: [create], receipts: [{ transactionHash: H, status: '0x1' }] }));
  assert.equal((await W.scanBroadcasts({})).find((x) => x.chain === 'beta').mined, 'ok');
});

test('publish: a second-token instance carries its symbol and decimals', () => {
  const pub = JSON.parse(readFileSync(published, 'utf8'));
  const eurc = pub.find((d) => d.address === SPLIT2);
  assert.equal(eurc.symbol, 'EURC');
  assert.equal(eurc.decimals, 6);
  assert.equal(pub.find((d) => d.address === SPLIT).symbol, undefined);
});

test('script: proof inputs checked up front, empty arrays safe under bash 3.2 set -u, re-run guard', async () => {
  const s = W.waveScript(await W.waveRanking({}), { project, root: tmp, date: '2026-10-02' });
  assert.match(s, /PROOF_SHELTER is set: export PROOF_AMOUNT/);
  assert.doesNotMatch(s, /"\$\{fa\[@\]\}"(?!\})/, 'macOS bash 3.2 aborts on "${fa[@]}" when fa is empty');
  assert.match(s, /\$\{fa\[@\]\+"\$\{fa\[@\]\}"\}/);
  assert.match(s, /FORCE_REDEPLOY/);
  assert.ok(s.indexOf('SELF=') < s.indexOf('cd "$PROJECT"'), 'SELF resolved before cd');
});

test('script: a re-run retries a missing proof payout on an already-deployed chain and still ingests', async () => {
  const s = W.waveScript(await W.waveRanking({}), { project, root: tmp, date: '2026-10-02' });
  const skip = s.slice(s.indexOf('skip: already deployed'), s.indexOf('if SHELTERSPLIT_TOKEN='));
  assert.match(skip, /PRIOR\+=\("\$chain"\)/);
  assert.match(skip, /! proof_done "\$id"; then maybe_proof/);
  assert.match(s, /proof_done\(\) \{/);
  assert.match(s, /maybe_proof\(\) \{[\s\S]*?tr A-F a-f[\s\S]*?proof needs the owner key/, 'owner check shared by both paths');
  assert.match(s, /\$\(\( \$\{#OK\[@\]\} \+ \$\{#PRIOR\[@\]\} \)\) -gt 0 \] && \(cd "\$FUND_ROOT" && node bin\/fund\.mjs a:ingest/);
});
