// One-wallet funding (tracks/a-build/distribute.mjs): plan parsing, the recipient allowlist, top-up
// (idempotent skip) and shortfall math, the generated scripts run against a stub `cast`, and the
// mainnet refusal. Hermetic: temp files only; nothing is signed or sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const D = await import('../tracks/a-build/distribute.mjs');
const R = await import('../tracks/a-build/router/lib.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'fund-dist-'));
const DEPLOYER = '0x' + 'd0'.repeat(20);
const HOT = '0x' + 'a1'.repeat(20);
const AGENT = '0x' + 'a2'.repeat(20);
const USDC = '0x' + '11'.repeat(20);
const EURC = '0x' + '22'.repeat(20);
const PATH = '0x20c0000000000000000000000000000000000000';

const chains = {
  arc: { name: 'Arc', networks: {
    testnet: { chainId: 5042002, rpcEnv: 'RPC_ARC_T', publicRpc: 'http://arc-t', usdc: '0x3600000000000000000000000000000000000000', usdcDecimals: 6, splitTokens: { EURC: { address: EURC, decimals: 6 } } },
    mainnet: { chainId: 5042, rpcEnv: 'RPC_ARC_M', publicRpc: 'http://arc-m', usdc: '0x3600000000000000000000000000000000000000', usdcDecimals: 6 },
  } },
  base: { name: 'Base', networks: { testnet: { chainId: 84532, rpcEnv: 'RPC_BASE_T', publicRpc: 'http://base-t', usdc: USDC, usdcDecimals: 6 } } },
  tempo: { name: 'Tempo', networks: { testnet: { chainId: 42431, rpcEnv: 'RPC_TEMPO_T', publicRpc: 'http://tempo-t', usdc: USDC, forgeArgs: ['--tempo.fee-token', PATH, '--gas-estimate-multiplier', '500'] } } },
  robin: { name: 'Robin', networks: { testnet: { chainId: 46630, rpcEnv: 'RPC_R_T', publicRpc: 'http://r-t', usdc: null, splitToken: { symbol: 'USDG', address: '0x' + '33'.repeat(20), decimals: 6 } } } },
  // a "testnet" entry that is really a mainnet chain id: must be refused
  fake: { name: 'Fake', networks: { testnet: { chainId: 8453, rpcEnv: 'RPC_F', publicRpc: 'http://f', usdc: USDC } } },
};
const wallets = [
  { label: 'testnet-deployer', address: DEPLOYER, chains: ['arc', 'base', 'tempo', 'robin'] },
  { label: 'testnet-donate-hot-wallet', address: HOT, chains: ['arc', 'base', 'tempo', 'robin', 'fake'] },
  { label: 'testnet-agent-wallet', address: AGENT, chains: ['arc', 'base'] },
  { label: 'deployer', address: DEPLOYER, chains: ['arc'] },
  { label: 'donate-hot-wallet', address: HOT, chains: ['arc'] },
  { label: 'shelter-split-treasury', address: '0x' + '44'.repeat(20), chains: ['arc'] },
  { label: 'pink-paw-receiving', address: '0x' + '55'.repeat(20), chains: ['arc'] },
];
const plan = {
  testnet: {
    deploy: { chains: ['arc', 'base'], eurcChains: ['arc'], routerChains: ['arc', 'base'], eurcRouterChains: ['arc'] },
    chains: {
      arc: { nativeSymbol: 'USDC', gasPerTransfer: '0.01', deployer: { native: '1', tokens: { EURC: '1' }, reason: 'deploys' }, donatehot: { native: '2', reason: 'treats' }, agent: { native: '1', reason: 'x402' } },
      base: { nativeSymbol: 'ETH', gasPerTransfer: '0.0001', deployer: { native: '0.001', reason: 'deploys' }, donatehot: { native: '0.002', tokens: { USDC: '2' }, reason: 'treats' }, agent: { tokens: { USDC: '0.5' }, reason: 'x402' } },
      tempo: { nativeSymbol: null, tokens: { pathUSD: { address: PATH, decimals: 6 } }, gasAsset: 'pathUSD', gasPerTransfer: '0.01', donatehot: { tokens: { USDC: '2', pathUSD: '1' }, reason: 'treats + fees' } },
      robin: { nativeSymbol: 'ETH', donatehot: { native: '0.001', tokens: { USDG: '2' }, reason: 'treats in USDG' } },
    },
  },
  mainnet: {
    deploy: { chains: ['arc'], eurcChains: [], routerChains: ['arc'], eurcRouterChains: [] },
    chains: { arc: { nativeSymbol: 'USDC', gasPerTransfer: '0.01', donatehot: { native: '3', reason: 'treats' } } },
  },
};

test('amounts: plain decimals to raw units and back, never floats', () => {
  assert.equal(D.parseUnits('1.5', 6), '1500000');
  assert.equal(D.parseUnits('0.002', 18), '2000000000000000');
  assert.equal(D.parseUnits('3', 18), '3000000000000000000');
  assert.throws(() => D.parseUnits('1e3', 6), /plain decimal/);
  assert.throws(() => D.parseUnits('0.0000001', 6), /more than 6 decimals/);
  assert.equal(D.formatUnits('1500000', 6), '1.5');
  assert.equal(D.formatUnits('0', 18), '0');
});

test('plan parsing: per-chain rows and assets; Tempo is token-only, Arc native-only, Robinhood pays USDG', () => {
  const r = D.resolvePlan({ plan, chains, wallets, network: 'testnet' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.deployer, DEPLOYER);
  const arc = r.chains.find((c) => c.chain === 'arc');
  assert.deepEqual(arc.rows.map((x) => [x.role, x.asset, x.target]), [['donatehot', 'native', '2000000000000000000'], ['agent', 'native', '1000000000000000000']]);
  assert.equal(arc.assets.find((a) => a.key === 'native').reserve, '1000000000000000000');
  assert.equal(arc.assets.find((a) => a.key === EURC.toLowerCase()).reserve, '1000000');
  const tempo = r.chains.find((c) => c.chain === 'tempo');
  assert.ok(tempo.rows.every((x) => x.asset !== 'native'));
  assert.equal(tempo.gas.asset, PATH.toLowerCase());
  assert.equal(tempo.gas.perTransfer, '10000');
  assert.deepEqual(tempo.castArgs, ['--tempo.fee-token', PATH]); // the gas multiplier is a forge flag only
  const robin = r.chains.find((c) => c.chain === 'robin');
  assert.equal(robin.rows.find((x) => x.symbol === 'USDG').tokenAddress, '0x' + '33'.repeat(20));
});

test('plan parsing: bad entries are problems, never silently dropped', () => {
  const bad = structuredClone(plan);
  bad.testnet.chains.arc.agent = { tokens: { USDC: '1' }, reason: 'x' };       // Arc USDC is the native coin
  bad.testnet.chains.tempo.donatehot.native = '1';                             // no gas coin on Tempo
  bad.testnet.chains.base.donatehot.reason = '';                                // reason required
  bad.testnet.chains.base.agent.tokens = { DOGE: '1' };                         // unknown token
  bad.testnet.chains.robin.ghost = { native: '1', reason: 'x' };                // unknown role
  const r = D.resolvePlan({ plan: bad, chains, wallets, network: 'testnet' });
  const p = r.problems.join('\n');
  assert.match(p, /arc: USDC is the native coin/);
  assert.match(p, /tempo\.donatehot: no native coin/);
  assert.match(p, /base\.donatehot: give a short reason/);
  assert.match(p, /token DOGE has no address/);
  assert.match(p, /unknown role "ghost"/);
  assert.equal(r.chains.length, 0);
  assert.throws(() => D.distributeScript(r, { network: 'testnet' }), /funding plan problems/);
});

test('address allowlist: recipients only from wallets.public.json, on listed chains, never the deployer, right network ids', () => {
  const p1 = structuredClone(plan);
  p1.testnet.chains.robin.agent = { native: '0.1', reason: 'x' }; // agent does not list robin
  let r = D.resolvePlan({ plan: p1, chains, wallets, network: 'testnet' });
  assert.match(r.problems.join('\n'), /testnet-agent-wallet does not list chain "robin"/);

  r = D.resolvePlan({ plan, chains, wallets: wallets.filter((w) => w.label !== 'testnet-agent-wallet'), network: 'testnet' });
  assert.match(r.problems.join('\n'), /no "testnet-agent-wallet" entry/);

  r = D.resolvePlan({ plan, chains, wallets: wallets.map((w) => (w.label === 'testnet-donate-hot-wallet' ? { ...w, address: DEPLOYER } : w)), network: 'testnet' });
  assert.match(r.problems.join('\n'), /recipient is the deployer itself/);

  r = D.resolvePlan({ plan, chains, wallets: wallets.map((w) => (w.label === 'testnet-donate-hot-wallet' ? { ...w, address: null } : w)), network: 'testnet' });
  assert.match(r.problems.join('\n'), /has no 0x address/);

  const p2 = structuredClone(plan);
  p2.testnet.chains.fake = { nativeSymbol: 'ETH', donatehot: { native: '1', reason: 'x' } };
  r = D.resolvePlan({ plan: p2, chains, wallets, network: 'testnet' });
  assert.match(r.problems.join('\n'), /chain id 8453 is not a testnet chain id/);

  // The generated script's ALLOW list is exactly the plan's recipients.
  r = D.resolvePlan({ plan, chains, wallets, network: 'testnet' });
  const sh = D.distributeScript(r, { network: 'testnet', date: 'x' });
  assert.match(sh, new RegExp(`ALLOW=' ${HOT.toLowerCase()} ${AGENT.toLowerCase()} '`));
  assert.match(sh, /ALLOWED_IDS=' 5042002 42431 421614 84532 43113 46630 10143 '/);
});

test('top-up: send only the gap; within 1% of the target counts as funded (idempotent rerun)', () => {
  assert.equal(D.topUp('2000000', '0'), '2000000');
  assert.equal(D.topUp('2000000', '1500000'), '500000');
  assert.equal(D.topUp('2000000', '2000000'), '0');
  assert.equal(D.topUp('2000000', '5000000'), '0');
  assert.equal(D.topUp('2000000', '1980000'), '0');     // 99%: skip the dust
  assert.equal(D.topUp('2000000', '1979999'), '20001');
  assert.equal(D.topUp('2000000', '1980000', 0), '20000'); // tolerance off
  assert.equal(D.math('sub', ['5', '7']), '0');
  assert.equal(D.math('add', ['5', '7']), '12');
  assert.equal(D.math('fmt', ['1500000', '6']), '1.5');
});

test('shortfall math: per asset, top-ups + gas per send (+ the deploy reserve when asked)', () => {
  const r = D.resolvePlan({ plan, chains, wallets, network: 'testnet' });
  const base = r.chains.find((c) => c.chain === 'base');
  // rows: donatehot ETH 0.002, donatehot USDC 2, agent USDC 0.5
  const recipient = ['0', '1000000', '500000']; // agent already funded
  const t = D.shortfallTable(base, { recipient, deployer: { native: '1000000000000000', [USDC.toLowerCase()]: '0' } });
  const eth = t.find((x) => x.asset === 'native');
  const usdc = t.find((x) => x.asset === USDC.toLowerCase());
  // ETH: 0.002 top-up + 2 sends x 0.0001 gas = 0.0022; has 0.001
  assert.equal(eth.need, '2200000000000000');
  assert.equal(eth.short, '1200000000000000');
  assert.equal(eth.sends, 1);
  // USDC: donatehot 2 - 1 = 1; agent skipped
  assert.equal(usdc.need, '1000000');
  assert.equal(usdc.short, '1000000');
  assert.equal(usdc.sends, 1);
  const withRes = D.shortfallTable(base, { recipient, deployer: { native: '1000000000000000' }, withReserve: true });
  assert.equal(withRes.find((x) => x.asset === 'native').need, '3200000000000000'); // + 0.001 reserve
  const funded = D.shortfallTable(base, { recipient: ['2000000000000000', '2000000', '500000'], deployer: {} });
  assert.ok(funded.every((x) => x.need === '0' && x.short === '0'));
});

// ---- the generated script against a stub cast

const stubDir = mkdtempSync(join(tmp, 'stub-'));
const STUB = join(stubDir, 'cast');
const BAL = join(stubDir, 'balances.json');
const LOG = join(stubDir, 'sends.log');
writeFileSync(STUB, `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
const bal = JSON.parse(fs.readFileSync(${JSON.stringify(BAL)}, 'utf8'));
const rpc = a[a.indexOf('--rpc-url') + 1];
if (a[0] === 'wallet' && a[1] === 'address') { console.log(${JSON.stringify(DEPLOYER)}); process.exit(0); }
if (a[0] === 'chain-id') { console.log(bal.ids[rpc] || '0'); process.exit(0); }
if (a[0] === 'balance') { const v = bal[rpc + ':native:' + a[1].toLowerCase()]; console.log(v === undefined ? '0' : v); process.exit(0); }
if (a[0] === 'call') { const v = bal[rpc + ':' + a[1].toLowerCase() + ':' + a[3].toLowerCase()]; console.log((v === undefined ? '0' : v) + ' [1e6]'); process.exit(0); }
if (a[0] === 'send') {
  fs.appendFileSync(${JSON.stringify(LOG)}, a.join(' ') + '\\n');
  // apply the transfer so a rerun sees the new balance
  const to = (a[1].startsWith('0x') && a[2] === 'transfer(address,uint256)') ? a[3] : a[1];
  const key = a[2] === 'transfer(address,uint256)' ? rpc + ':' + a[1].toLowerCase() + ':' + to.toLowerCase() : rpc + ':native:' + to.toLowerCase();
  const amt = a[2] === 'transfer(address,uint256)' ? a[4] : a[a.indexOf('--value') + 1];
  bal[key] = (BigInt(bal[key] || '0') + BigInt(amt)).toString();
  fs.writeFileSync(${JSON.stringify(BAL)}, JSON.stringify(bal));
  console.log(JSON.stringify({ status: '0x1', transactionHash: '0x' + 'ab'.repeat(32) }));
  process.exit(0);
}
process.exit(1);
`);
chmodSync(STUB, 0o755);

const cleanEnv = () => {
  const e = { ...process.env, CAST_BIN: STUB };
  for (const k of Object.keys(e)) if (/^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|AI_AGENT|CONFIRM_MAINNET|DRY_RUN|CHAINS|CHECK_ONLY|WITH_RESERVE|FAILED_FILE|RPC_|FUND_KEYSTORE)/.test(k)) delete e[k];
  return e;
};
const run = (file, env = {}) => spawnSync('bash', [file], { encoding: 'utf8', env: { ...cleanEnv(), ...env } });

test('generated testnet script: dry run prints, real run tops up exactly the gap, rerun skips (stub cast)', () => {
  const only = ['base'];
  const r = D.resolvePlan({ plan, chains, wallets, network: 'testnet', only });
  const f = join(tmp, 'distribute-testnet.sh');
  writeFileSync(f, D.distributeScript(r, { network: 'testnet', date: 'x' }));
  writeFileSync(BAL, JSON.stringify({
    ids: { 'http://base-t': '84532' },
    [`http://base-t:native:${DEPLOYER}`]: '10000000000000000',
    [`http://base-t:${USDC.toLowerCase()}:${DEPLOYER}`]: '10000000',
    [`http://base-t:native:${HOT.toLowerCase()}`]: '0',
    [`http://base-t:${USDC.toLowerCase()}:${HOT.toLowerCase()}`]: '1500000',
    [`http://base-t:${USDC.toLowerCase()}:${AGENT.toLowerCase()}`]: '500000',
  }));
  writeFileSync(LOG, '');
  let o = run(f, { DRY_RUN: '1' });
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.match(o.stdout, /would run: .*send 0x(a1){20} --value 2000000000000000/);
  assert.match(o.stdout, /would run: .*transfer\(address,uint256\) 0x(a1){20} 500000/);
  assert.match(o.stdout, /skip base agent USDC/);
  assert.equal(readFileSync(LOG, 'utf8'), '', 'dry run sends nothing');

  o = run(f);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  const sends = readFileSync(LOG, 'utf8').trim().split('\n');
  assert.equal(sends.length, 2);
  assert.match(sends[0], /--value 2000000000000000/);
  assert.match(sends[1], /transfer\(address,uint256\) 0x(a1){20} 500000/);

  o = run(f); // idempotent rerun
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.equal(readFileSync(LOG, 'utf8').trim().split('\n').length, 2, 'rerun sends nothing');
  assert.match(o.stdout, /already funded: 3 transfer\(s\) skipped/);
});

test('generated script: a short deployer stops that chain (table + FAILED_FILE), other chains go on', () => {
  const r = D.resolvePlan({ plan, chains, wallets, network: 'testnet', only: ['base', 'arc'] });
  const f = join(tmp, 'distribute-short.sh');
  writeFileSync(f, D.distributeScript(r, { network: 'testnet', date: 'x' }));
  writeFileSync(BAL, JSON.stringify({
    ids: { 'http://base-t': '84532', 'http://arc-t': '5042002' },
    [`http://base-t:native:${DEPLOYER}`]: '0', // base: deployer empty
    [`http://arc-t:native:${DEPLOYER}`]: '100000000000000000000',
  }));
  writeFileSync(LOG, '');
  const ff = join(tmp, 'failed.txt');
  const o = run(f, { FAILED_FILE: ff });
  assert.equal(o.status, 1);
  assert.match(o.stdout, /base +ETH .*SHORT 0\.0023 ETH/); // 0.002 + 3 sends x 0.0001 gas
  assert.deepEqual(readFileSync(ff, 'utf8').trim().split('\n'), ['base']);
  const sends = readFileSync(LOG, 'utf8').trim().split('\n');
  assert.equal(sends.length, 2, 'arc still funded');
  assert.ok(sends.every((s) => s.includes('http://arc-t')));
  // CHECK_ONLY stops after the table
  writeFileSync(LOG, '');
  const c = run(f, { CHECK_ONLY: '1', CHAINS: 'arc' });
  assert.equal(c.status, 0, c.stdout);
  assert.equal(readFileSync(LOG, 'utf8'), '');
});

test('generated script: an RPC on the wrong chain or a mainnet id is refused before any send', () => {
  const r = D.resolvePlan({ plan, chains, wallets, network: 'testnet', only: ['base'] });
  const f = join(tmp, 'distribute-wrong.sh');
  writeFileSync(f, D.distributeScript(r, { network: 'testnet', date: 'x' }));
  writeFileSync(BAL, JSON.stringify({ ids: { 'http://base-t': '8453' } }));
  writeFileSync(LOG, '');
  const o = run(f);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /RPC answered chain 8453, expected 84532/);
  assert.equal(readFileSync(LOG, 'utf8'), '');
});

test('mainnet: both scripts refuse without CONFIRM_MAINNET=yes, and refuse inside an AI agent session', () => {
  const r = D.resolvePlan({ plan, chains, wallets, network: 'mainnet' });
  assert.deepEqual(r.problems, []);
  const dist = join(tmp, 'distribute-mainnet.sh');
  writeFileSync(dist, D.distributeScript(r, { network: 'mainnet', date: 'x' }));
  const all = join(tmp, 'mainnet-all.sh');
  writeFileSync(all, D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp }));
  writeFileSync(LOG, '');
  for (const f of [dist, all]) {
    let o = run(f);
    assert.equal(o.status, 3, f);
    assert.match(o.stdout, /refused: .* MAINNET\. Re-run with CONFIRM_MAINNET=yes/);
    o = run(f, { DRY_RUN: '1' });
    assert.equal(o.status, 3, 'a dry run needs the confirmation too');
    o = run(f, { CONFIRM_MAINNET: 'yes', CLAUDECODE: '1' });
    assert.equal(o.status, 3);
    assert.match(o.stdout, /must not be run by an AI agent/);
    o = run(f, { CONFIRM_MAINNET: 'yes', AI_AGENT: 'x' });
    assert.equal(o.status, 3);
  }
  assert.equal(readFileSync(LOG, 'utf8'), '', 'nothing reached cast');
  // The testnet script has no such gate, and a mainnet script cannot carry testnet ids.
  assert.doesNotMatch(D.distributeScript(D.resolvePlan({ plan, chains, wallets, network: 'testnet' }), { network: 'testnet' }), /CONFIRM_MAINNET/);
  assert.match(readFileSync(dist, 'utf8'), /ALLOWED_IDS=' 5042 4217 42161 43114 8453 4663 143 '/);
  // DonateRouters deploy on mainnet by default (decision 2026-10-05: no MAINNET_ROUTERS gate).
  assert.doesNotMatch(readFileSync(all, 'utf8'), /MAINNET_ROUTERS/);
});

test('run-order wrapper: steps in order, syntax-valid, public RPC defaults, refuses a chain from the wrong network', () => {
  const sh = D.runAllScript({ network: 'testnet', deploy: plan.testnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  const order = ['1. balance check', '2. ShelterSplit (primary', '3. ShelterSplit EURC', '4. DonateRouters', '5. a:ingest', '6. a:verify', '7. distribute', '8. fund fill', '9. commit'];
  let at = 0;
  for (const s of order) { const i = sh.indexOf(`step "${s}`); assert.ok(i > at, s); at = i; }
  assert.match(sh, /export RPC_ARC_T="\$\{RPC_ARC_T:-http:\/\/arc-t\}"/);
  assert.match(sh, /SHELTERSPLIT_TREASURY:-\}/); // no testnet treasury in this fixture: the person must export it
  const f = join(tmp, 'testnet-all.sh');
  writeFileSync(f, sh);
  assert.equal(spawnSync('bash', ['-n', f]).status, 0);
  assert.throws(() => D.runAllScript({ network: 'testnet', deploy: { chains: ['fake'] }, chains, wallets }), /chain id 8453 is not testnet/);
  assert.throws(() => D.runAllScript({ network: 'mainnet', deploy: { chains: ['base'] }, chains, wallets }), /not in chains.json/);
});

test('pending: only what is missing per chain (idempotent wrapper reruns)', () => {
  const dep = (chain, token, extra = {}) => ({ contract: 'ShelterSplit', chain, network: 'testnet', chainId: chains[chain].networks.testnet.chainId, address: '0x' + '99'.repeat(20), token, verified: true, sourceVerified: true, ...extra });
  const routers = [{ network: 'testnet', chainId: 84532, usdc: USDC, router: '0x' + '77'.repeat(20) }];
  let p = D.pendingSteps({ deploy: plan.testnet.deploy, network: 'testnet', chains, deployments: [], routers: [] });
  assert.deepEqual(p, { arc: ['usdc', 'eurc', 'router-usdc', 'router-eurc'], base: ['usdc', 'router-usdc'] });
  p = D.pendingSteps({ deploy: plan.testnet.deploy, network: 'testnet', chains, deployments: [dep('base', 'USDC'), dep('arc', 'USDC'), dep('arc', 'EURC', { verified: false })], routers });
  assert.deepEqual(p.base, []);
  assert.deepEqual(p.arc, ['router-usdc', 'router-eurc', 'verify']);
  // a primary instance recorded under another spelling (pathUSD, mUSDC) still counts
  const t = D.pendingSteps({ deploy: { chains: ['tempo'] }, network: 'testnet', chains, deployments: [dep('tempo', 'pathUSD')], routers: [] });
  assert.deepEqual(t.tempo, []);
});

test('router: --token EURC plans the EURC split, and a broadcast becomes a valid router-deployments entry', () => {
  const cj = { arc: { networks: { testnet: { chainId: 5042002, usdc: USDC, rpcEnv: 'RPC_ARC_T', splitTokens: { EURC: { address: EURC, decimals: 6 } } } } } };
  const S1 = '0x' + '5a'.repeat(20), S2 = '0x' + '5b'.repeat(20);
  const deployments = [
    { contract: 'ShelterSplit', chainId: 5042002, address: S1, token: 'USDC', recorded: '2026-10-01' },
    { contract: 'ShelterSplit', chainId: 5042002, address: S2, token: 'EURC', recorded: '2026-10-02' },
  ];
  const e = R.routerDryRun({ chainId: 5042002, token: 'EURC', chains: cj, deployments, routerDeployments: [] });
  assert.equal(e.ok, true, e.problems.join());
  assert.equal(e.plan.split, S2);
  assert.equal(e.plan.token, EURC);
  assert.deepEqual(e.plan.routers, []);
  const u = R.routerDryRun({ chainId: 5042002, chains: cj, deployments, routerDeployments: [{ chainId: 5042002, network: 'testnet', usdc: USDC, router: '0x' + '77'.repeat(20), split: S1 }] });
  assert.equal(u.plan.split, S1);
  assert.equal(u.plan.routers.length, 1);
  assert.equal(R.routerDryRun({ chainId: 5042002, token: 'EURC', chains: cj, deployments: [deployments[0]], routerDeployments: [] }).ok, false);

  const ROUTER = '0x' + '7c'.repeat(20), TX = '0x' + 'ee'.repeat(32);
  const run = { transactions: [{ transactionType: 'CREATE', contractName: 'DonateRouter', contractAddress: ROUTER, hash: TX, arguments: [S2, EURC] }], receipts: [{ transactionHash: TX, status: '0x1', blockNumber: '0x10' }] };
  const got = R.routerEntryFromBroadcast(run, { chainId: 5042002, network: 'testnet', chain: 'arc', split: S2, token: EURC, symbol: 'EURC', now: new Date('2026-10-04T00:00:00.000Z') });
  assert.equal(got.entry.router, ROUTER.toLowerCase());
  assert.equal(got.entry.fromBlock, 16);
  assert.equal(got.entry.deployedAt, '2026-10-04T00:00:00Z');
  assert.deepEqual(R.validateRouterDeployments([got.entry]), []);
  assert.match(R.routerEntryFromBroadcast(run, { chainId: 5042002, network: 'testnet', chain: 'arc', split: S1, token: USDC }).problem, /fronts/);
  const failed = { ...run, receipts: [{ transactionHash: TX, status: '0x0' }] };
  assert.match(R.routerEntryFromBroadcast(failed, { split: S2, token: EURC }).problem, /no successful receipt/);
});

test('the committed funding-plan.json resolves cleanly for both networks against the real chains and wallets', () => {
  const A = join(HERE, '..', 'tracks', 'a-build');
  const read = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));
  const realPlan = read('funding-plan.json');
  for (const network of ['mainnet', 'testnet']) {
    const r = D.resolvePlan({ plan: realPlan, chains: read('chains.json'), wallets: read('wallets.public.json').wallets, network });
    assert.deepEqual(r.problems, [], network);
    assert.ok(r.chains.length >= 5, network);
    for (const c of r.chains) assert.ok(D.NETWORK_IDS[network].includes(c.chainId));
    assert.ok(existsSync(join(A, 'funding-plan.json')));
  }
});

test('profiles: --plan topup replaces whole roles per chain and writes its own script; unknown profile is a problem', () => {
  const withTop = { ...plan, mainnet: { ...plan.mainnet, profiles: { topup: { chains: { arc: { donatehot: { native: '13', reason: 'a week' }, agent: { native: '0.6', reason: 'x402' } } } } } } };
  const w = [...wallets, { label: 'agent-wallet', address: AGENT, chains: ['arc'] }];
  const base = D.resolvePlan({ plan: withTop, chains, wallets: w, network: 'mainnet' });
  assert.deepEqual(base.problems, []);
  assert.deepEqual(base.chains[0].rows.map((r) => [r.role, r.amount]), [['donatehot', '3']]);
  const top = D.resolvePlan({ plan: withTop, chains, wallets: w, network: 'mainnet', profile: 'topup' });
  assert.deepEqual(top.problems, []);
  assert.deepEqual(top.chains[0].rows.map((r) => [r.role, r.amount]), [['donatehot', '13'], ['agent', '0.6']]);
  assert.equal(top.chains[0].gas.perTransfer, '10000000000000000', 'chain settings stay');
  assert.match(D.resolvePlan({ plan: withTop, chains, wallets: w, network: 'mainnet', profile: 'nope' }).problems.join(), /no "mainnet\.profiles\.nope"/);
  assert.equal(D.distributeFile('mainnet', 'topup'), 'distribute-mainnet-topup.sh');
  assert.equal(D.distributeFile('mainnet'), 'distribute-mainnet.sh');
  const sh = D.distributeScript(top, { network: 'mainnet', profile: 'topup', date: 'x' });
  assert.match(sh, /fund a:distribute --network mainnet --plan topup/);
  assert.match(sh, /refused: distribute-mainnet-topup\.sh touches MAINNET/);
});

test('wrapper: proof payout and Tempo memo default to 0.1 token on mainnet, 1 on testnet', () => {
  const m = D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  assert.match(m, /PROOF_AMOUNT="\$\{PROOF_AMOUNT:-100000\}"/);
  const t = D.runAllScript({ network: 'testnet', deploy: plan.testnet.deploy, chains: { ...chains, tempo: chains.tempo }, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  assert.match(t, /PROOF_AMOUNT="\$\{PROOF_AMOUNT:-1000000\}"/);
  assert.match(t, /approve\(address,uint256\)\\" \$TEMPO_SPLIT \$PROOF_AMOUNT/);
  assert.match(t, /disburseWithMemo\(uint256,bytes32\)\\" \$PROOF_AMOUNT/);
});

test('the committed mainnet plan is the minimal profile: per-chain balance check = the send-to-deployer table', () => {
  const A = join(HERE, '..', 'tracks', 'a-build');
  const read = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));
  const realPlan = read('funding-plan.json');
  const args = { plan: realPlan, chains: read('chains.json'), wallets: read('wallets.public.json').wallets, network: 'mainnet' };
  const need = (r) => Object.fromEntries(r.chains.map((c) => [c.chain, Object.fromEntries(D.shortfallTable(c, { withReserve: true }).map((x) => [x.symbol, D.formatUnits(x.need, x.decimals)]))]));
  const r = D.resolvePlan(args);
  assert.deepEqual(r.problems, []);
  // The table on FUNDING-RUN.html and USER-TODAY.md (Tempo's USDC is USDC.e).
  assert.deepEqual(need(r), {
    arc: { USDC: '0.7', EURC: '0.1' },
    tempo: { pathUSD: '0.15', USDC: '0.3' },
    arbitrum: { ETH: '0.0004', USDC: '0.2' },
    avalanche: { AVAX: '0.075', USDC: '0.2' },
    base: { ETH: '0.0007', USDC: '0.2' },
    robinhood: { ETH: '0.0004', USDG: '0.2' },
    monad: { MON: '2', USDC: '0.2' },
  });
  assert.deepEqual(realPlan.mainnet.deploy.eurcChains, ['arc']);
  assert.deepEqual(realPlan.mainnet.deploy.eurcRouterChains, ['arc']);
  assert.deepEqual(r.chains.filter((c) => c.rows.some((x) => x.role === 'agent')).map((c) => c.chain), ['arc'], 'agent on Arc only for now');
  // Every token amount on the deployer is the 0.1 proof (two on Tempo: proof + campaign memo).
  for (const c of r.chains) for (const a of c.assets) if (a.key !== 'native' && a.symbol !== 'pathUSD') assert.equal(a.reserve, c.chain === 'tempo' ? '200000' : '100000', `${c.chain} ${a.symbol}`);
  const top = D.resolvePlan({ ...args, profile: 'topup' });
  assert.deepEqual(top.problems, []);
  assert.ok(top.chains.every((c) => c.assets.every((a) => a.reserve === '0')), 'top-up keeps no deploy reserve');
  assert.ok(top.chains.find((c) => c.chain === 'base').rows.some((x) => x.role === 'agent'), 'the Base agent comes with the top-up');
});

// ---- mainnet-audit fixes (S2, S3, S4, S5, S7, S9, S10)

test('S3: pending lists a missing proof payout on a recorded mainnet split (primary and EURC), never on testnet', () => {
  const cj = { arc: { networks: { mainnet: { chainId: 5042, usdc: '0x3600000000000000000000000000000000000000', splitTokens: { EURC: { address: EURC } } }, testnet: chains.arc.networks.testnet } } };
  const dep = (network, token, extra = {}) => ({ contract: 'ShelterSplit', chain: 'arc', network, address: '0x' + '99'.repeat(20), token, verified: true, sourceVerified: true, ...extra });
  const deploy = { chains: ['arc'], eurcChains: ['arc'] };
  let p = D.pendingSteps({ deploy, network: 'mainnet', chains: cj, deployments: [dep('mainnet', 'USDC'), dep('mainnet', 'EURC', { proofTxs: ['0x1'] })], routers: [] });
  assert.deepEqual(p.arc, ['proof']);
  p = D.pendingSteps({ deploy, network: 'mainnet', chains: cj, deployments: [dep('mainnet', 'USDC', { proofTxs: ['0x1'] }), dep('mainnet', 'EURC')], routers: [] });
  assert.deepEqual(p.arc, ['proof-eurc']);
  p = D.pendingSteps({ deploy, network: 'testnet', chains: cj, deployments: [dep('testnet', 'USDC'), dep('testnet', 'EURC')], routers: [] });
  assert.deepEqual(p.arc, []);
  // the wrapper pays them before a:ingest, and only when PROOF_SHELTER is set
  const sh = D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  const i4b = sh.indexOf('step "4b. proof payouts'), i5 = sh.indexOf('step "5. a:ingest');
  assert.ok(i4b > sh.indexOf('step "4. DonateRouters') && i4b < i5);
  assert.match(sh, /PROOF_SHELTER is empty: no proof payouts/);
  assert.match(sh, /script\/ProofDisburse\.s\.sol:ProofDisburse/);
  assert.match(sh, /CASTP='  '/);
  const cast = { ...chains, arc: { ...chains.arc, networks: { ...chains.arc.networks, mainnet: { ...chains.arc.networks.mainnet, proofVia: 'cast' } } } };
  assert.match(D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains: cast, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp }), /CASTP=' arc '/, 'Arc pays its proof with cast sends (chains.json proofVia)');
});

test('S2: the deploy reserve is counted only on chains with a ShelterSplit still to deploy', () => {
  const sh = D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  const js = sh.match(/RES_CHAINS="\$\(node -e '([^']*)' "\$PEND"\)"/)[1];
  const res = (pend) => spawnSync(process.execPath, ['-e', js, JSON.stringify(pend)], { encoding: 'utf8' }).stdout.trim();
  assert.equal(res({ arc: ['router-usdc', 'proof', 'verify'], base: ['usdc', 'router-usdc'], avax: ['eurc'] }), 'base,avax');
  assert.equal(res({ arc: ['router-eurc'] }), '');
});

test('S5: a dry run plans routers after an unrecorded split instead of stopping the chain', () => {
  const sh = D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  assert.match(sh, /if \[ "\$DRY" = 1 \] && grep -q "ShelterSplit recorded" "\$rerr"; then echo "  \$c \$sym router: would deploy a DonateRouter/);
});

test('S7: the mainnet wrapper refuses a leftover PROOF_AMOUNT or treasury from the shell, before signing anything', () => {
  const all = join(tmp, 'mainnet-all-s7.sh');
  writeFileSync(all, D.runAllScript({ network: 'mainnet', deploy: plan.mainnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp }));
  assert.equal(spawnSync('bash', ['-n', all]).status, 0);
  let o = run(all, { CONFIRM_MAINNET: 'yes', PROOF_AMOUNT: '1000000' });
  assert.equal(o.status, 1);
  assert.match(o.stdout, /refused: PROOF_AMOUNT=1000000, but funding-plan\.json budgets 100000/);
  o = run(all, { CONFIRM_MAINNET: 'yes', SHELTERSPLIT_TREASURY: '0x' + '66'.repeat(20) });
  assert.equal(o.status, 1);
  assert.match(o.stdout, /refused: SHELTERSPLIT_TREASURY=.* is not the wallets\.public\.json treasury/);
  assert.match(readFileSync(all, 'utf8'), /export CONFIRM_MAINNET/);
});

test('S9 + S10: the Tempo memo prints the real signer flags, only with a proof shelter, from the env-resolved deployments file', () => {
  const t = D.runAllScript({ network: 'testnet', deploy: plan.testnet.deploy, chains, wallets, date: 'x', root: tmp, project: tmp, waveDir: tmp });
  assert.doesNotMatch(t, /--account \$FUND_KEYSTORE --tempo/);
  assert.match(t, /\$SIGNER_TXT --tempo\.fee-token/);
  assert.match(t, /if \[ -n "\$\{PROOF_SHELTER:-\}" \] && \[ -n "\$TEMPO_SPLIT" \]/);
  assert.match(t, /DEPLOYMENTS="\$\{FUND_A_DEPLOYMENTS:-\$FUND_ROOT\/tracks\/a-build\/deployments\.json\}"/);
  assert.match(t, /"\$DEPLOYMENTS" "\$NETWORK"\)"/);
  assert.doesNotMatch(t, /"\$FUND_ROOT\/tracks\/a-build\/deployments\.json" "\$NETWORK"/);
});

test('S4: with WITH_RESERVE=1 a chain with baseFeeCapGwei refuses a base fee above the cap (stub cast)', () => {
  const p2 = { mainnet: { deploy: plan.mainnet.deploy, chains: { arc: { ...plan.mainnet.chains.arc, baseFeeCapGwei: '10', deployer: { native: '0.01', reason: 'deploys' } } } } };
  const r = D.resolvePlan({ plan: p2, chains, wallets, network: 'mainnet' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.chains[0].baseFeeCap, '10000000000');
  const f = join(tmp, 'distribute-basefee.sh');
  writeFileSync(f, D.distributeScript(r, { network: 'mainnet', date: 'x' }));
  const fee = join(stubDir, 'cast-fee');
  writeFileSync(fee, `#!/usr/bin/env bash\nif [ "$1" = base-fee ]; then echo "\${FAKE_BASE_FEE}"; exit 0; fi\nexec ${JSON.stringify(STUB)} "$@"\n`);
  chmodSync(fee, 0o755);
  writeFileSync(BAL, JSON.stringify({ ids: { 'http://arc-m': '5042' }, [`http://arc-m:native:${DEPLOYER}`]: '100000000000000000000' }));
  writeFileSync(LOG, '');
  let o = run(f, { CONFIRM_MAINNET: 'yes', CAST_BIN: fee, CHECK_ONLY: '1', WITH_RESERVE: '1', FAKE_BASE_FEE: '20000000000' });
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /base fee is above what the deploy reserve covers/);
  o = run(f, { CONFIRM_MAINNET: 'yes', CAST_BIN: fee, CHECK_ONLY: '1', WITH_RESERVE: '1', FAKE_BASE_FEE: '5000000000' });
  assert.equal(o.status, 0, o.stdout);
  assert.match(o.stdout, /base fee 5 gwei \(the deploy reserve covers up to 10 gwei\)/);
  assert.equal(readFileSync(LOG, 'utf8'), '');
  // the committed plan caps Avalanche
  const real = JSON.parse(readFileSync(join(HERE, '..', 'tracks', 'a-build', 'funding-plan.json'), 'utf8'));
  assert.equal(real.mainnet.chains.avalanche.baseFeeCapGwei, '10');
});
