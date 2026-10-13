// match-desk.sh and fork-demo.sh: offline checks only. forge, cast and anvil are replaced by stubs that
// fail loudly, so no test can reach a network or a key; the refusals must happen before any tool runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(ROOT, 'match-desk.sh');

const SPLIT = '0x457c89e10a6e66633eda5bf82fd086febb5db147';
const SPENDER = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const AGENT = '0x3333333333333333333333333333333333333333';

const EXAMPLE = {
  schema: 'tt.match-desk.sponsor/v1',
  sponsor: { id: 'motored', name: 'Motored.lt', relatedParty: true, relation: "founder's company" },
  chainId: 5042,
  spender: { address: null, deployBlock: null, owner: null, agent: null },
  split: SPLIT,
  router: '0x937f13ce28294011567615330dbcb859a06a0bba',
  shelter: { name: 'Pink Paw (Rožinė pėdutė)', wallet: '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37', custody: 'held-by-token-tails' },
  policy: {
    ratioBps: 10000, perGiftMaxUsdc: '0.05', perDonorDailyMaxUsdc: '0.05', budgetUsdc: '1.00', minGiftUsdc: '0.01',
    maxGiftAgeHours: 48, validFrom: '2026-10-14T00:00:00Z',
    eligible: { chains: [5042], kinds: ['public', 'router-native', 'router-authorization'], senders: 'any', matchTreats: false, treatsDailyMaxUsdc: '0' },
    excludedSenders: [], farming: { maxGiftsPerDonorDay: 5 },
    pace: { from: '2026-10-15', to: '2026-11-15', floatLowUsdc: '0.10' },
    refund: { after: '2026-11-15', to: 'owner' }, plannedTtlMinutes: 30,
  },
};

function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'md-sh-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  for (const tool of ['forge', 'cast', 'anvil']) {
    const f = path.join(bin, tool);
    writeFileSync(f, `#!/bin/sh\necho "STUB ${tool} CALLED $*" >&2\nexit 99\n`);
    chmodSync(f, 0o755);
  }
  const example = path.join(dir, 'sponsor.example.json');
  writeFileSync(example, JSON.stringify(EXAMPLE, null, 2));
  const deployed = path.join(dir, 'sponsor.deployed.json');
  writeFileSync(deployed, JSON.stringify({ ...EXAMPLE, spender: { address: SPENDER, deployBlock: 123, owner: OWNER, agent: AGENT } }, null, 2));
  return { dir, bin, example, deployed };
}

function run(sb, args, env = {}) {
  const base = { ...process.env };
  delete base.CLAUDECODE;
  delete base.CONFIRM_MAINNET;
  delete base.MATCH_DESK_RPC;
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: '',
    env: {
      ...base,
      PATH: `${sb.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      MATCH_DESK_EXAMPLE: sb.example,
      ...env,
    },
  });
  assert.doesNotMatch(r.stderr, /STUB (forge|cast|anvil) CALLED/, 'no chain tool may run in these tests');
  return r;
}

test('both scripts parse (bash -n)', () => {
  for (const f of ['match-desk.sh', 'fork-demo.sh']) {
    const r = spawnSync('bash', ['-n', path.join(ROOT, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('fork-demo.sh keeps the old demo as the default and adds --match-desk', () => {
  const s = readFileSync(path.join(ROOT, 'fork-demo.sh'), 'utf8');
  assert.match(s, /if \[ "\$\{1:-\}" = "--match-desk" \]; then MODE=match-desk/);
  assert.match(s, /MATCH_DESK_API=off/);
  assert.match(s, /CAPPED_DAILY=200000000000000000/, 'runbook daily cap 0.20 in 18 decimals');
  assert.match(s, /CAPPED_PER_TX=50000000000000000/, 'runbook per-gift cap 0.05 in 18 decimals');
  assert.match(s, /forge script script\/DeployCappedSpender\.s\.sol .*--unlocked --sender "\$DEV0"/, 'the match-desk demo deploys through the deploy script');
  assert.match(s, /excludedSenders: example\.policy\.excludedSenders/, 'the fork sponsor file keeps the example exclusions');
  assert.match(s, /--out "\$STMT"/);
  assert.doesNotMatch(s, /client\/public\/match-desk/, 'the demo never writes the public statement');
  assert.doesNotMatch(s, /--send\b/, 'the demo never uses --send');
});

test('no subcommand or an unknown one is a usage error (exit 2)', () => {
  const sb = sandbox();
  assert.equal(run(sb, []).status, 2);
  const r = run(sb, ['launch']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown subcommand/);
});

test('init testnet writes chainId, eligible.chains and the testnet router', () => {
  const sb = sandbox();
  const out = path.join(sb.dir, 'sponsor.arc-testnet.json');
  const r = run(sb, ['init', 'testnet', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.chainId, 5042002);
  assert.deepEqual(j.policy.eligible.chains, [5042002]);
  assert.equal(j.router, '0xa1cf1db2042dea0f169b1acdab479d4f17852860');
  assert.equal(j.sponsor.relatedParty, true);
  assert.equal(j.spender.address, null);
  // refuses to overwrite without --force
  const again = run(sb, ['init', 'testnet', '--out', out]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /exists/);
  assert.equal(run(sb, ['init', 'testnet', '--out', out, '--force']).status, 0);
});

test('init mainnet keeps 5042 and the mainnet router; a bad network is refused', () => {
  const sb = sandbox();
  const out = path.join(sb.dir, 'sponsor.arc.json');
  assert.equal(run(sb, ['init', 'mainnet', '--out', out]).status, 0);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.chainId, 5042);
  assert.equal(j.router, '0x937f13ce28294011567615330dbcb859a06a0bba');
  const bad = run(sb, ['init', 'sepolia', '--out', path.join(sb.dir, 'x.json')]);
  assert.equal(bad.status, 2);
  assert.equal(existsSync(path.join(sb.dir, 'x.json')), false);
});

test('deploy refuses in an AI session and on mainnet without CONFIRM_MAINNET, before any tool runs', () => {
  const sb = sandbox();
  const args = ['deploy', 'testnet', '--account', 'tt-deployer', '--owner', OWNER, '--agent', AGENT];
  const ai = run(sb, args, { CLAUDECODE: '1' });
  assert.equal(ai.status, 2);
  assert.match(ai.stderr, /AI session/);
  const main = run(sb, ['deploy', 'mainnet', '--account', 'tt-deployer', '--owner', OWNER, '--agent', AGENT]);
  assert.equal(main.status, 2);
  assert.match(main.stderr, /CONFIRM_MAINNET=yes/);
  // usage problems are caught first
  assert.equal(run(sb, ['deploy', 'testnet', '--owner', OWNER, '--agent', AGENT]).status, 2);
  assert.equal(run(sb, ['deploy', 'testnet', '--account', '<keystore>', '--owner', OWNER, '--agent', AGENT]).status, 2);
  const same = run(sb, ['deploy', 'testnet', '--account', 'd', '--owner', OWNER, '--agent', OWNER]);
  assert.equal(same.status, 2);
  assert.match(same.stderr, /must differ/);
});

test('fund and gas refuse in an AI session and on mainnet without CONFIRM_MAINNET', () => {
  const sb = sandbox();
  for (const sub of ['fund', 'gas']) {
    const ai = run(sb, [sub, sb.deployed, '--account', 'owner', '--usdc', '1'], { CLAUDECODE: '1' });
    assert.equal(ai.status, 2, `${sub}: ${ai.stderr}`);
    assert.match(ai.stderr, /AI session/);
    const main = run(sb, [sub, sb.deployed, '--account', 'owner', '--usdc', '1']);
    assert.equal(main.status, 2, `${sub}: ${main.stderr}`);
    assert.match(main.stderr, /CONFIRM_MAINNET=yes/);
  }
  const badAmount = run(sb, ['fund', sb.deployed, '--account', 'owner', '--usdc', '0.0000001']);
  assert.equal(badAmount.status, 2);
  assert.match(badAmount.stderr, /at most 6 decimals/);
});

test('round --send refuses in an AI session', () => {
  const sb = sandbox();
  const r = run(sb, ['round', sb.deployed, '--send', '--keystore', 'tt-match-agent'], { CLAUDECODE: '1' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /AI session/);
});

test('check and fund need a deployed spender in the file', () => {
  const sb = sandbox();
  for (const sub of ['check', 'fund', 'verify']) {
    const r = run(sb, [sub, sb.example, '--account', 'o', '--usdc', '1']);
    assert.equal(r.status, 2, sub);
    assert.match(r.stderr, /spender\.address is null/);
  }
});

test('verify prints the Sourcify command with the 18-decimal caps (prints only)', () => {
  const sb = sandbox();
  const r = run(sb, ['verify', sb.deployed]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`forge verify-contract ${SPENDER} src/CappedSpender.sol:CappedSpender`));
  assert.match(r.stdout, /--chain-id 5042 --verifier sourcify/);
  assert.match(r.stdout, /constructor\(address,address,address,uint256,uint256,bool\)/);
  assert.match(r.stdout, new RegExp(`${SPLIT} ${AGENT} ${OWNER} 50000000000000000 200000000000000000 true`));
});

test('the runbook never handles a private key', () => {
  const s = readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(s, /--private-key|PRIVATE_KEY|--mnemonic/);
  assert.doesNotMatch(s, /\.env\b/);
  assert.doesNotMatch(s, /CAPPED_PER_TX=50000\b/);
});

test('statement on Arc mainnet re-checks the chain by default (read-only RPC; nothing written when it fails)', () => {
  const sb = sandbox();
  const pub = path.join(ROOT, '..', '..', 'client', 'public', 'match-desk');
  const before = ['index.html', 'statement.json'].map((f) => readFileSync(path.join(pub, f), 'utf8'));
  // A dead local port: the default --verify-onchain must try it and fail before anything is written.
  const r = run(sb, ['statement', sb.deployed], { MATCH_DESK_RPC: 'http://127.0.0.1:1', MATCH_DESK_DIR: path.join(sb.dir, 'state') });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /statement: .*fetch failed/);
  const after = ['index.html', 'statement.json'].map((f) => readFileSync(path.join(pub, f), 'utf8'));
  assert.deepEqual(after, before, 'the public placeholder is unchanged');
});

test('check on a local fork prints no explorer link (fork-only addresses exist on no explorer)', () => {
  const sb = sandbox();
  // A read-only cast stand-in that answers the check's calls with the expected values.
  writeFileSync(path.join(sb.bin, 'cast'), `#!/bin/sh
case "$1" in
  chain-id) echo 5042 ;;
  from-wei) echo 0 ;;
  call)
    case "$3" in
      "native()(bool)") echo true ;;
      "perTxCap()(uint256)") echo "50000000000000000 [5e16]" ;;
      "dailyCap()(uint256)") echo "200000000000000000 [2e17]" ;;
      "split()(address)") echo ${SPLIT} ;;
      "agent()(address)") echo ${AGENT} ;;
      "owner()(address)") echo ${OWNER} ;;
      *) echo 0 ;;
    esac ;;
  *) echo "STUB cast CALLED $*" >&2; exit 99 ;;
esac
`);
  chmodSync(path.join(sb.bin, 'cast'), 0o755);
  const local = run(sb, ['check', sb.deployed, '--rpc-url', 'http://127.0.0.1:8545']);
  assert.equal(local.status, 0, local.stderr + local.stdout);
  assert.match(local.stdout, /local fork: .* not on any explorer/);
  assert.doesNotMatch(local.stdout, /explorer\.(testnet\.)?arc\.io/);
  assert.match(local.stdout, /check passed/);
  const live = run(sb, ['check', sb.deployed, '--rpc-url', 'https://rpc.example.invalid']);
  assert.equal(live.status, 0, live.stderr);
  assert.match(live.stdout, new RegExp(`https://explorer\\.arc\\.io/address/${SPENDER}`));
});
