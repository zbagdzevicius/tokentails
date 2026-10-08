// node --test funding/framework/tracks/a-build/router/lib.test.mjs  (hermetic: in-memory chains and deployments)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routerDryRun, rotateDryRun, findNetwork, usdcSplits, validateRouterDeployments, ROUTER_DEPLOYMENTS } from './lib.mjs';

const USDC = '0x3600000000000000000000000000000000000000';
const SPLIT_A = '0x' + 'aa'.repeat(20);
const SPLIT_B = '0x' + 'bb'.repeat(20);
const EURC_SPLIT = '0x' + 'ee'.repeat(20);
const OLD = '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37';
const NEW = '0x' + '12'.repeat(20);

const chains = {
  _readme: 'x',
  arc: { networks: {
    testnet: { chainId: 5042002, usdc: USDC, rpcEnv: 'RPC_ARC_TESTNET' },
    mainnet: { chainId: 5042, usdc: USDC, rpcEnv: 'RPC_ARC_MAINNET' },
  } },
  mezo: { networks: { testnet: { chainId: 31611, usdc: null, rpcEnv: 'RPC_MEZO_TESTNET' } } },
};
const deployments = [
  { contract: 'ShelterSplit', chainId: 5042002, address: SPLIT_A, token: 'USDC', recorded: '2026-10-01T00:00:00Z' },
  { contract: 'ShelterSplit', chainId: 5042002, address: EURC_SPLIT, token: 'EURC', recorded: '2026-10-03T00:00:00Z' },
  { contract: 'ShelterSplit', chainId: 5042002, address: SPLIT_B, token: 'USDC', recorded: '2026-10-02T00:00:00Z' },
];

test('findNetwork maps a chain id to its network', () => {
  assert.deepEqual(findNetwork(5042, chains), { chain: 'arc', network: 'mainnet', chainId: 5042, usdc: USDC, rpcEnv: 'RPC_ARC_MAINNET' });
  assert.equal(findNetwork(1, chains), null);
});

test('usdcSplits ignores EURC splits and sorts newest last', () => {
  assert.deepEqual(usdcSplits(5042002, deployments, USDC).map((d) => d.address), [SPLIT_A, SPLIT_B]);
  assert.deepEqual(usdcSplits(5042002, deployments, null), []);
});

test('routerDryRun prints simulate and manual broadcast commands, never broadcasting itself', () => {
  const r = routerDryRun({ chainId: 5042002, chains, deployments, routerDeployments: [] });
  assert.equal(r.ok, true, r.problems.join('; '));
  const text = r.lines.join('\n');
  assert.match(text, /SPLIT=0xbbbb/); // newest USDC split
  assert.match(text, new RegExp(`USDC=${USDC}`));
  assert.match(text, /EXPECTED_CHAIN_ID=5042002/);
  assert.match(text, /--rpc-url "\$RPC_ARC_TESTNET"\n/); // the simulate line has no --broadcast
  assert.match(text, /MANUAL founder step/);
  assert.match(text, /--account <keystore> --broadcast/);
  assert.doesNotMatch(text, /--private-key|PRIVATE_KEY|\.env/);
  assert.match(text, /canDonate/);
  assert.match(text, /recipientsHash\(uint256\)/);
  // EIP-3009 preflight comes before the simulate step and names the refusal.
  assert.ok(text.indexOf('authorizationState(address,bytes32)(bool)') > 0);
  assert.ok(text.indexOf('authorizationState') < text.indexOf('1. Simulate'));
  assert.match(text, /token has no EIP-3009; router would only support flush/);
});

test('routerDryRun refuses chains whose USDC has no EIP-3009 (Tempo TIP-20)', () => {
  const withTempo = { ...chains, tempo: { networks: { testnet: { chainId: 42431, usdc: '0x20c0000000000000000000000000000000000000', rpcEnv: 'RPC_TEMPO_TESTNET' } } } };
  const r = routerDryRun({ chainId: 42431, split: SPLIT_A, chains: withTempo, deployments: [], routerDeployments: [] });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /token has no EIP-3009; router would only support flush/);
});

test('routerDryRun honours --split and refuses unknown chains or chains without USDC', () => {
  assert.match(routerDryRun({ chainId: 5042002, split: SPLIT_A, chains, deployments, routerDeployments: [] }).lines.join('\n'), /SPLIT=0xaaaa/);
  assert.equal(routerDryRun({ chainId: 999, chains, deployments, routerDeployments: [] }).ok, false);
  assert.equal(routerDryRun({ chainId: 31611, chains, deployments, routerDeployments: [] }).ok, false);
  assert.equal(routerDryRun({ chainId: 5042, chains, deployments: [], routerDeployments: [] }).ok, false);
  assert.equal(routerDryRun({ chainId: 5042002, split: '0x12', chains, deployments, routerDeployments: [] }).ok, false);
});

test('routerDryRun flags mainnet and existing routers', () => {
  const r = routerDryRun({ chainId: 5042, split: SPLIT_A, chains, deployments: [], routerDeployments: [{ chainId: 5042, router: SPLIT_B }] });
  const text = r.lines.join('\n');
  assert.match(text, /mainnet: real money/);
  assert.match(text, /already has 1 router/);
});

test('rotateDryRun: pause, remove the old wallet before adding the new one, unpause, then preview', () => {
  const r = rotateDryRun({ chainId: 5042002, split: SPLIT_A, oldWallet: OLD, newWallet: NEW, name: 'Pink Paw (Rozine pedute)', chains });
  assert.equal(r.ok, true, r.problems.join('; '));
  const text = r.lines.join('\n');
  const at = (s) => text.indexOf(s);
  assert.ok(at('"pause()"') > 0);
  assert.ok(at('"removeShelter(address)"') > at('"pause()"'));
  assert.ok(at('"addShelter(address,uint16,string)"') > at('"removeShelter(address)"'), 'remove before add keeps totalBps <= 10000');
  assert.ok(at('"unpause()"') > at('"addShelter(address,uint16,string)"'));
  assert.ok(at('"preview(uint256)') > at('"unpause()"'));
  assert.match(text, new RegExp(`addShelter\\(address,uint16,string\\)" ${NEW} 10000 "Pink Paw \\(Rozine pedute\\)"`));
  assert.match(text, /toTreasury must be 0/);
  assert.match(text, /DRY RUN/);
  assert.match(text, new RegExp(`getShelter\\(address\\)\\(\\(address,uint16,bool,string\\)\\)" ${OLD}`));
  assert.doesNotMatch(text, /--private-key|--broadcast/);
});

test('rotateDryRun requires the name explicitly and says how to read the registered one', () => {
  const r = rotateDryRun({ chainId: 5042002, split: SPLIT_A, oldWallet: OLD, newWallet: NEW, chains });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /--name is required/);
  assert.match(r.problems.join('\n'), new RegExp(`cast call ${SPLIT_A} "getShelter`));
});

test('rotateDryRun refuses bad input', () => {
  const base = { chainId: 5042002, split: SPLIT_A, oldWallet: OLD, newWallet: NEW, name: 'Pink Paw', chains };
  assert.equal(rotateDryRun({ ...base, newWallet: OLD }).ok, false);
  assert.equal(rotateDryRun({ ...base, newWallet: '0x' + '00'.repeat(20) }).ok, false);
  assert.equal(rotateDryRun({ ...base, newWallet: 'nope' }).ok, false);
  assert.equal(rotateDryRun({ ...base, name: 'a'.repeat(65) }).ok, false);
  assert.equal(rotateDryRun({ ...base, name: 'x"; rm -rf ~; "' }).ok, false);
  assert.equal(rotateDryRun({ ...base, split: undefined }).ok, false);
});

test('validateRouterDeployments checks the schema; the shipped file is valid', () => {
  assert.deepEqual(validateRouterDeployments(JSON.parse(readFileSync(ROUTER_DEPLOYMENTS, 'utf8'))), []);
  assert.deepEqual(validateRouterDeployments([{ chainId: 5042002, network: 'testnet', router: SPLIT_A, split: SPLIT_B, usdc: USDC, deployTx: '0x' + 'cd'.repeat(32), deployedAt: '2026-10-04T10:00:00Z' }]), []);
  assert.equal(validateRouterDeployments([{ chainId: 'x', network: 'devnet' }]).length, 7);
  assert.deepEqual(validateRouterDeployments({}), ['router-deployments.json must be an array']);
});

test('S1: routerAlreadyRecorded keys on chain + network + router, not the address alone', async () => {
  const { routerAlreadyRecorded } = await import('./lib.mjs');
  const R = '0xe39742be' + '00'.repeat(16);
  const list = [{ chainId: 42161, network: 'mainnet', router: R }];
  assert.equal(routerAlreadyRecorded(list, { chainId: 42161, network: 'mainnet', router: R.toUpperCase().replace('0X', '0x') }), true);
  // Same CREATE address on another chain (same deployer nonce) is a new router.
  assert.equal(routerAlreadyRecorded(list, { chainId: 43114, network: 'mainnet', router: R }), false);
  assert.equal(routerAlreadyRecorded(list, { chainId: 8453, network: 'mainnet', router: R }), false);
  assert.equal(routerAlreadyRecorded(list, { chainId: 42161, network: 'testnet', router: R }), false);
});

test('S1: fund router record records an identical router address on a second chain', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync: wf, readFileSync: rf } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'router-rec-'));
  const R = '0x' + 'e3'.repeat(20);
  const S1 = '0x' + '11'.repeat(20), S2 = '0x' + '22'.repeat(20);
  const U1 = '0x' + 'a1'.repeat(20), U2 = '0x' + 'a2'.repeat(20);
  wf(join(dir, 'chains.json'), JSON.stringify({ arbitrum: { networks: { mainnet: { chainId: 42161, usdc: U1 } } }, avalanche: { networks: { mainnet: { chainId: 43114, usdc: U2 } } } }));
  wf(join(dir, 'deployments.json'), JSON.stringify([
    { contract: 'ShelterSplit', chainId: 42161, address: S1, token: 'USDC', recorded: '2026-10-05T00:00:00Z' },
    { contract: 'ShelterSplit', chainId: 43114, address: S2, token: 'USDC', recorded: '2026-10-05T00:00:00Z' },
  ]));
  const routers = join(dir, 'router-deployments.json');
  const client = join(dir, 'client-routers.json');
  wf(routers, '[]');
  for (const [id, split, usdc] of [[42161, S1, U1], [43114, S2, U2]]) {
    const b = join(dir, 'project', 'broadcast', 'DeployDonateRouter.s.sol', String(id));
    mkdirSync(b, { recursive: true });
    const hash = '0x' + String(id).padStart(64, '0');
    wf(join(b, 'run-latest.json'), JSON.stringify({ transactions: [{ transactionType: 'CREATE', contractName: 'DonateRouter', contractAddress: R, hash, arguments: [split, usdc] }], receipts: [{ transactionHash: hash, status: '0x1', blockNumber: '0x10' }] }));
  }
  const env = { ...process.env, FUND_A_CHAINS: join(dir, 'chains.json'), FUND_A_DEPLOYMENTS: join(dir, 'deployments.json'), FUND_A_ROUTER_DEPLOYMENTS: routers, FUND_A_CLIENT_ROUTERS: client, FUND_A_PROJECT: join(dir, 'project') };
  const fund = new URL('../../../bin/fund.mjs', import.meta.url).pathname;
  for (const id of [42161, 43114, 43114]) {
    const r = spawnSync(process.execPath, [fund, 'router', 'record', '--chain', String(id), '--token', 'USDC'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
  }
  const list = JSON.parse(rf(routers, 'utf8'));
  assert.deepEqual(list.map((x) => x.chainId), [42161, 43114]);
  // C1/S11: the client projection is written alongside.
  const pub = JSON.parse(rf(client, 'utf8'));
  assert.deepEqual(pub.map((x) => [x.chainId, x.router]), [[42161, R], [43114, R]]);
  assert.equal(pub[0].split, undefined);
});

test('C1: client/public/shelter-payouts/routers.json is the public projection of router-deployments.json', async () => {
  const { publicRouters, CLIENT_ROUTERS } = await import('./lib.mjs');
  const src = JSON.parse(readFileSync(ROUTER_DEPLOYMENTS, 'utf8'));
  const client = JSON.parse(readFileSync(CLIENT_ROUTERS, 'utf8'));
  const norm = (l) => l.map((x) => ({ ...x, router: x.router.toLowerCase(), usdc: x.usdc.toLowerCase() }));
  assert.deepEqual(norm(client), norm(publicRouters(src)));
});

test('routerEntryFromBroadcast: eip3009 is recorded only when the caller probed it', async () => {
  const lib = await import('./lib.mjs');
  const S = '0x' + '12'.repeat(20), U = '0x' + '34'.repeat(20), R = '0x' + '56'.repeat(20), H = '0x' + '78'.repeat(32);
  const run = { transactions: [{ transactionType: 'CREATE', contractName: 'DonateRouter', contractAddress: R, hash: H, arguments: [S, U] }], receipts: [{ transactionHash: H, status: '0x1', blockNumber: '0x10' }] };
  const base = { chainId: 8453, network: 'mainnet', chain: 'base', split: S, token: U, symbol: 'USDC' };
  assert.equal(lib.routerEntryFromBroadcast(run, base).entry.eip3009, undefined);
  const e = lib.routerEntryFromBroadcast(run, { ...base, eip3009: true }).entry;
  assert.equal(e.eip3009, true);
  assert.equal(lib.publicRouters([e])[0].eip3009, true);
});
