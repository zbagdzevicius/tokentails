// Source verification (fund a:verify-source and the a:ingest hook) — hermetic: forge and cast are
// replaced by an injected `run`, and the broadcast lives in a temp project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

await import('../tracks/a-build/track.mjs'); // registers the wave commands; must load before wave.mjs
const W = await import('../tracks/a-build/wave.mjs');

const project = mkdtempSync(join(tmpdir(), 'fund-verify-src-'));
const SPLIT = '0x' + 'ab'.repeat(20);
const ARGS = ['0x' + '11'.repeat(20), '0x' + '22'.repeat(20), '0x' + '33'.repeat(20)];
mkdirSync(join(project, 'broadcast', 'DeployShelterSplit.s.sol', '5042002'), { recursive: true });
writeFileSync(join(project, 'broadcast', 'DeployShelterSplit.s.sol', '5042002', 'run-latest.json'), JSON.stringify({
  transactions: [{ transactionType: 'CREATE', contractName: 'ShelterSplit', contractAddress: SPLIT, arguments: ARGS }],
}));
const entry = { chain: 'arc', network: 'testnet', chainId: 5042002, address: SPLIT };

function fakeRun(forgeOut) {
  const calls = [];
  const run = (cmd, argv) => {
    calls.push([cmd, argv]);
    if (argv[0] === 'abi-encode') return { status: 0, stdout: '0xdeadbeef\n', stderr: '' };
    if (argv[0] === 'verify-contract') return { status: 0, stdout: forgeOut, stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
  return { run, calls };
}

test('constructor arguments come from the deploy broadcast', () => {
  assert.deepEqual(W.constructorArgs(entry, { project }), { args: ARGS, from: 'broadcast' });
  assert.equal(W.constructorArgs({ ...entry, chainId: 1 }, { project }), null, 'no broadcast and no RPC');
});

test('blockscout verification passes the right flags and reads success', () => {
  const { run, calls } = fakeRun('Contract verification status:\nResponse: `OK`\nDetails: `Pass - Verified`\n');
  const r = W.verifySource(entry, { verifier: { type: 'blockscout', url: 'https://explorer.testnet.arc.io/api/' } }, { project, run });
  assert.equal(r.ok, true);
  const [, argv] = calls.find(([, a]) => a[0] === 'verify-contract');
  assert.deepEqual(argv.slice(0, 3), ['verify-contract', SPLIT, 'src/ShelterSplit.sol:ShelterSplit']);
  assert.ok(argv.includes('--watch'));
  assert.equal(argv[argv.indexOf('--chain-id') + 1], '5042002');
  assert.equal(argv[argv.indexOf('--constructor-args') + 1], '0xdeadbeef');
  assert.equal(argv[argv.indexOf('--verifier') + 1], 'blockscout');
  assert.ok(!argv.includes('--etherscan-api-key'));
  const [, enc] = calls.find(([, a]) => a[0] === 'abi-encode');
  assert.deepEqual(enc.slice(2), ARGS);
});

test('sourcify exact_match and routescan api key', () => {
  assert.equal(W.verifySource(entry, { verifier: { type: 'sourcify', url: 'https://contracts.tempo.xyz' } }, { project, run: fakeRun('Status: `exact_match`').run }).ok, true);
  assert.equal(W.verifySource(entry, { verifier: { type: 'sourcify', url: 'https://contracts.tempo.xyz' } }, { project, run: fakeRun('Contract source code already fully verified').run }).ok, true);
  const { run, calls } = fakeRun('Contract successfully verified');
  W.verifySource(entry, { verifier: { type: 'etherscan', url: 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan', apiKey: 'verifyContract' } }, { project, run });
  const [, argv] = calls.find(([, a]) => a[0] === 'verify-contract');
  assert.equal(argv[argv.indexOf('--etherscan-api-key') + 1], 'verifyContract');
});

test('failure and missing verifier are reported, never faked', () => {
  const bad = W.verifySource(entry, { verifier: { type: 'blockscout', url: 'x' } }, { project, run: fakeRun('Error: bytecode does not match').run });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /bytecode does not match/);
  const none = W.verifySource(entry, {}, { project, run: fakeRun('').run });
  assert.equal(none.skipped, true);
});
