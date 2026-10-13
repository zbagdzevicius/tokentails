import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { matchRound, describeMatch, EXIT } from '../run.mjs';
import { makeFakeFetch } from '../lib/fake-llm.mjs';
import { sendGates, actMatch, runCastInteractive } from '../act.mjs';
import { validateSponsor, policyHashOf, GuardError } from '../lib/policy.mjs';
import { stateDir } from '../lib/receipt.mjs';
import { stubRpc, batchLog, agentGiftLog, sponsorRaw, w, txh, SPENDER, AGENT, NOW_MS } from '../test-support/helpers.mjs';

const E16 = 10n ** 16n;
const FAN = '0x' + 'f1'.repeat(20);
const LIVE = 'https://rpc.testnet.arc.io';
// The stub comes in through deps.llmFetch: --send refuses TREAT_AGENT_FAKE_LLM=1. No CLAUDECODE: the gates are
// tested through deps.env, never process.env.
const ENV = { ANTHROPIC_API_KEY: 'test' };

test('sendGates: AI session, --once, keystore, local RPC, chain allowlist, sponsor chain, CONFIRM_MAINNET', () => {
  const base = { rpc: LIVE, chainId: 5042002, sponsorChainId: 5042002, once: true, keystore: 'tt-match-agent', env: {} };
  assert.equal(sendGates(base), null);
  assert.match(sendGates({ ...base, env: { CLAUDECODE: '1' } }), /AI session/);
  assert.match(sendGates({ ...base, env: { TREAT_AGENT_FAKE_LLM: '1' } }), /offline stub/);
  assert.match(sendGates({ ...base, env: { TREAT_AGENT_FAKE_WRONG: '1' } }), /offline stub/);
  assert.match(sendGates({ ...base, once: false }), /--once/);
  assert.match(sendGates({ ...base, keystore: '<keystore>' }), /--keystore/);
  assert.match(sendGates({ ...base, keystore: undefined }), /--keystore/);
  assert.match(sendGates({ ...base, rpc: 'http://127.0.0.1:8545' }), /--fork/);
  assert.match(sendGates({ ...base, chainId: 31337, sponsorChainId: 31337 }), /only reaches chains 5042, 5042002/);
  assert.match(sendGates({ ...base, chainId: 5042 }), /!= sponsor.json chainId/);
  assert.match(sendGates({ ...base, chainId: 5042, sponsorChainId: 5042 }), /CONFIRM_MAINNET=yes/);
  assert.equal(sendGates({ ...base, chainId: 5042, sponsorChainId: 5042, env: { CONFIRM_MAINNET: 'yes' } }), null);
});

async function ctx({ chainId = 5042002, logs = [], rpc = {} } = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'md-send-'));
  const raw = sponsorRaw({ chainId, eligible: { chains: [chainId] } });
  const sponsor = validateSponsor(raw);
  const stub = stubRpc({ chainId, logs, ...rpc });
  const deps = { rpcFetch: stub.fetchImpl, logDir: path.join(base, 'logs'), stateBase: path.join(base, 'state'), statementFile: path.join(base, 'none.json'), api: 'off', env: ENV, llmFetch: makeFakeFetch() };
  const run = (opts = {}, more = {}) => matchRound({ sponsor, policyHash: policyHashOf(raw.policy), rpc: LIVE, rpcDisplay: LIVE, mode: 'send', keystore: 'tt-match-agent', once: true, now: NOW_MS, ...opts }, { ...deps, ...more });
  return { base, sponsor, deps, run, logs, dir: stateDir(deps.stateBase, chainId, SPENDER) };
}

/** A spawn() stand-in: records the call, prints `stdout`, exits with `code`. */
function fakeSpawn(stdout, code = 0) {
  const calls = [];
  const impl = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    setImmediate(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      child.emit('close', code);
    });
    return child;
  };
  return { impl, calls };
}
const neverSpawn = () => { throw new Error('nothing may be sent'); };
async function ackTx(c, tx) {
  const ack = await c.run({ mode: 'dry-run', ackOrphan: tx });
  assert.equal(ack.code, EXIT.OK);
  assert.match(describeMatch(ack), /acknowledged orphan/);
}
const gift = () => batchLog({ batchId: 1, payer: FAN, amount: 2n * E16, memo: 'fan gift', tx: txh(0xa1), block: 199_000 });

test('matchRound --send refuses before any RPC call: AI session, missing --once, missing keystore, local RPC', async () => {
  const c = await ctx({ logs: [gift()] });
  await assert.rejects(c.run({}, { env: { ...ENV, CLAUDECODE: '1' }, spawnImpl: neverSpawn }), (e) => e instanceof GuardError && /AI session/.test(e.message));
  await assert.rejects(c.run({ once: false }, { spawnImpl: neverSpawn }), /--once/);
  await assert.rejects(c.run({ keystore: '<keystore>' }, { spawnImpl: neverSpawn }), /--keystore/);
  await assert.rejects(c.run({ rpc: 'http://localhost:8545' }, { spawnImpl: neverSpawn }), /--fork/);
});

test('matchRound --send refuses a chain outside the allowlist and Arc mainnet without CONFIRM_MAINNET', async () => {
  const local = await ctx({ chainId: 31337, logs: [gift()] });
  await assert.rejects(local.run({}, { spawnImpl: neverSpawn }), /only reaches chains/);
  const main = await ctx({ chainId: 5042, logs: [gift()] });
  await assert.rejects(main.run({}, { spawnImpl: neverSpawn }), /CONFIRM_MAINNET=yes/);
});

test('--send runs cast with the keystore in the founder terminal (password prompt on the TTY) and records the tx', async () => {
  const c = await ctx({ logs: [gift()] });
  const sp = fakeSpawn(JSON.stringify({ transactionHash: txh(0xdd), status: '0x1', blockNumber: '0x30d41' }));
  const r = await c.run({}, { spawnImpl: sp.impl });
  assert.equal(r.code, EXIT.OK);
  assert.equal(sp.calls.length, 1);
  const { bin, args, opts } = sp.calls[0];
  assert.equal(bin, 'cast');
  assert.deepEqual(args, ['send', SPENDER, 'give(uint256,string)', '20000000000000000', r.envelope.memo, '--rpc-url', LIVE, '--account', 'tt-match-agent', '--json']);
  assert.deepEqual(opts.stdio, ['inherit', 'pipe', 'inherit']);
  assert.equal(r.envelope.status, 'sent');
  assert.equal(r.envelope.mode, 'send');
  assert.equal(r.envelope.tx.hash, txh(0xdd));
});

test('--send: cast exiting non-zero with no tx hash is an unknown outcome: the receipt stays sent and blocks its gifts', async () => {
  const logs = [gift()];
  const c = await ctx({ logs });
  const r = await c.run({}, { spawnImpl: fakeSpawn('', 1).impl });
  assert.equal(r.code, EXIT.FAILED);
  assert.equal(r.result.status, 'unknown');
  assert.equal(r.envelope.status, 'sent');
  assert.equal(r.envelope.tx.hash, null);
  assert.equal(r.envelope.tx.status, 'unknown');
  assert.match(describeMatch(r), /--release [0-9a-f]{12}/);
  const memo = r.envelope.memo;

  // The next round must not re-plan the gift (the tx may still land): a code hold, no model call, no send.
  const again = await c.run({}, { spawnImpl: neverSpawn, llmFetch: () => { throw new Error('the model must not be called'); } });
  assert.equal(again.decision.action, 'hold');
  assert.equal(again.obs.matchDesk.gifts[0].status, 'matched');
  assert.equal(again.obs.matchDesk.budget.committedMicro, 20_000n);

  // After the TTL it is reported as stuck, never released by itself.
  const late = await c.run({ witnessOnly: true, now: NOW_MS + 31 * 60_000 });
  assert.deepEqual(late.obs.matchDesk.witness.stuck, [r.envelope.sha256]);

  // The tx lands late: the witness reconciles it and nothing is planned again.
  logs.push(agentGiftLog({ amount: 2n * E16, memo, tx: txh(0xee), block: 199_600 }));
  const w2 = await c.run({}, { spawnImpl: neverSpawn, llmFetch: () => { throw new Error('the model must not be called'); } });
  assert.deepEqual(w2.obs.matchDesk.witness.reconciled, [r.envelope.sha256]);
  assert.deepEqual(w2.obs.matchDesk.witness.orphans, []);
  assert.equal(w2.decision.action, 'hold');
  const files = await readdir(path.join(c.dir, 'receipts'));
  assert.equal(files.length, 1);
  assert.equal(JSON.parse(await readFile(path.join(c.dir, 'receipts', files[0]), 'utf8')).status, 'reconciled');
});

test('--send: cast that never starts (spawn error) marks the receipt failed; the gift is eligible again', async () => {
  const c = await ctx({ logs: [gift()] });
  const r = await c.run({}, { spawnImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.code, EXIT.FAILED);
  assert.equal(r.result.status, 'not-sent');
  assert.equal(r.envelope.status, 'failed');
  const dry = await c.run({ mode: 'dry-run' });
  assert.equal(dry.decision.action, 'match');
});

test('--release clears only an unknown send; a later landing still reconciles the released receipt', async () => {
  const logs = [gift()];
  const c = await ctx({ logs });
  const r = await c.run({}, { spawnImpl: fakeSpawn('', 130).impl }); // Ctrl-C while waiting
  const sha = r.envelope.sha256;
  await assert.rejects(c.run({ mode: 'dry-run', release: 'zz' }), /at least 8 hex/);
  await assert.rejects(c.run({ mode: 'dry-run', release: 'ffffffff' }), /0 receipts match/);
  const rel = await c.run({ mode: 'dry-run', release: sha.slice(0, 12) });
  assert.equal(rel.code, EXIT.OK);
  assert.equal(rel.released.status, 'failed');
  assert.equal(rel.released.tx.status, 'released');
  assert.match(describeMatch(rel), /released: receipt/);
  await assert.rejects(c.run({ mode: 'dry-run', release: sha.slice(0, 12) }), /only clears a 'sent' receipt with no tx hash/);
  // Released: the gift is eligible again.
  const obs = await c.run({ mode: 'dry-run', witnessOnly: true });
  assert.equal(obs.obs.matchDesk.gifts[0].status, 'eligible');
  // It lands after all: the witness reconciles the failed receipt by memo, so it is not invisible.
  logs.push(agentGiftLog({ amount: 2n * E16, memo: r.envelope.memo, tx: txh(0xef), block: 199_700 }));
  const w2 = await c.run({ mode: 'dry-run', witnessOnly: true });
  assert.deepEqual(w2.obs.matchDesk.witness.reconciled, [sha]);
  assert.equal(w2.obs.matchDesk.gifts[0].status, 'matched');
});

test('idempotent skip: an AgentGift with the same memo and amount exists -> no send, receipt reconciled', async () => {
  // Learn the memo with a dry run in another state dir (same gifts + amount + policy = same memo).
  const probe = await ctx({ logs: [gift()] });
  const dry = await probe.run({ mode: 'dry-run' });
  const memo = dry.envelope.memo;
  const c = await ctx({ logs: [gift(), agentGiftLog({ amount: 2n * E16, memo, tx: txh(0xee), block: 199_500 })] });
  // An empty state dir with our memo on-chain is an orphan: a code hold until a human acknowledges it.
  const held = await c.run({}, { spawnImpl: neverSpawn, llmFetch: () => { throw new Error('the model must not be called'); } });
  assert.equal(held.decision.action, 'hold');
  assert.equal(held.decision.codeHold, true);
  assert.match(held.decision.rationale, /no local receipt/);
  assert.match(describeMatch(held), /--ack-orphan/);
  await ackTx(c, txh(0xee));
  const r = await c.run({}, { spawnImpl: neverSpawn });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.result.status, 'skipped-duplicate');
  assert.equal(r.envelope.status, 'reconciled');
  assert.equal(r.envelope.skipped, 'duplicate');
  assert.equal(r.envelope.witness.tx, txh(0xee));
  assert.deepEqual(r.obs.matchDesk.witness.orphans, [{ memo, tx: txh(0xee), acked: true }], 'before this round, the event had no receipt here');
  const files = await readdir(path.join(c.dir, 'receipts'));
  assert.equal(files.length, 1);
  const saved = JSON.parse(await readFile(path.join(c.dir, 'receipts', files[0]), 'utf8'));
  assert.equal(saved.status, 'reconciled');
});

test('idempotency mismatch: same memo, different amount -> mismatch, nothing sent, exit 1', async () => {
  const probe = await ctx({ logs: [gift()] });
  const memo = (await probe.run({ mode: 'dry-run' })).envelope.memo;
  const c = await ctx({ logs: [gift(), agentGiftLog({ amount: 1n, memo, tx: txh(0xee), block: 199_500 })] });
  await ackTx(c, txh(0xee));
  const r = await c.run({}, { spawnImpl: neverSpawn });
  assert.equal(r.code, EXIT.FAILED);
  assert.equal(r.envelope.status, 'mismatch');
});

test('--demo-overcap --send simulates with cast call (no key, nothing mined)', async () => {
  const c = await ctx({ rpc: { perTx: 5n * E16, daily: 20n * E16, remaining: 20n * E16 } });
  let callArgs;
  const execImpl = (_b, args, _o, cb) => {
    callArgs = args;
    cb(new Error('exit 1'), '', `Error: execution reverted, data: "0x734e76f9${w(10n * E16)}${w(5n * E16)}"`);
  };
  const r = await c.run({ demoOvercap: true }, { execImpl, spawnImpl: neverSpawn });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.result.status, 'refused-as-expected');
  assert.equal(r.result.simulated, true);
  assert.deepEqual(callArgs.slice(0, 5), ['call', SPENDER, 'give(uint256,string)', '100000000000000000', 'tt:agent:m:motored:demo-overcap']);
  assert.ok(callArgs.includes('--from') && callArgs.includes(AGENT));
  assert.ok(!callArgs.includes('--account'));
});

test('--demo-overcap --send --mined-revert sends with --gas-limit 300000, then reads the reason with cast call', async () => {
  const c = await ctx({ rpc: { perTx: 5n * E16, daily: 20n * E16, remaining: 20n * E16 } });
  const sp = fakeSpawn(JSON.stringify({ transactionHash: txh(0xbad), status: '0x0', blockNumber: '0x10' }));
  const execImpl = (_b, _a, _o, cb) => cb(new Error('exit 1'), '', `data: "0x734e76f9${w(10n * E16)}${w(5n * E16)}"`);
  const r = await c.run({ demoOvercap: true, minedRevert: true }, { execImpl, spawnImpl: sp.impl });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.result.status, 'refused-as-expected');
  assert.equal(r.result.txHash, txh(0xbad));
  assert.deepEqual(sp.calls[0].args.slice(-5), ['--account', 'tt-match-agent', '--gas-limit', '300000', '--json']);
  // A give that unexpectedly succeeds is exit 4.
  const ok = fakeSpawn(JSON.stringify({ transactionHash: txh(0xbad), status: '0x1' }));
  const bad = await c.run({ demoOvercap: true, minedRevert: true }, { execImpl, spawnImpl: ok.impl });
  assert.equal(bad.code, EXIT.DEMO);
});

test('actMatch send refuses a local RPC even if called directly; runCastInteractive survives a spawn error', async () => {
  await assert.rejects(actMatch({ amountRaw: 1n, memo: 'tt:agent:m:x:aaaaaaaa', mode: 'send', spender: SPENDER, rpc: 'http://127.0.0.1:8545', keystore: 'k' }), GuardError);
  const r = await runCastInteractive(['--version'], { spawnImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.code, -1);
});

test('orphan: our memo on-chain with an empty state dir holds every mode until --ack-orphan; a different subset is never matched twice', async () => {
  // Gift A was matched from another state dir (lost); gift B arrived later. Without the hold the model
  // could pick {A, B}: a new memo, so the on-chain duplicate check would not fire and A is matched twice.
  const probe = await ctx({ logs: [gift()] });
  const memo = (await probe.run({ mode: 'dry-run' })).envelope.memo;
  const giftB = batchLog({ batchId: 2, payer: '0x' + 'f2'.repeat(20), amount: 2n * E16, memo: 'second fan', tx: txh(0xa2), block: 199_100 });
  const c = await ctx({ logs: [gift(), giftB, agentGiftLog({ amount: 2n * E16, memo, tx: txh(0xee), block: 199_500 })] });
  const noModel = () => { throw new Error('the model must not be called'); };
  for (const mode of ['dry-run', 'fork', 'send']) {
    const opts = mode === 'fork' ? { mode, rpc: 'http://127.0.0.1:8545' } : { mode };
    const r = await c.run(opts, { spawnImpl: neverSpawn, execImpl: neverSpawn, llmFetch: noModel });
    assert.equal(r.decision.action, 'hold', mode);
    assert.equal(r.decision.codeHold, true, mode);
    assert.match(r.decision.rationale, new RegExp(`--ack-orphan ${txh(0xee)}`), mode);
    assert.equal(r.envelope, null, `${mode}: no receipt is planned`);
  }
  await assert.rejects(c.run({ mode: 'dry-run', ackOrphan: 'nope' }), /full tx hash/);
  await assert.rejects(c.run({ mode: 'dry-run', ackOrphan: txh(0xab) }), /found no orphan/);
  await ackTx(c, txh(0xee));
  const saved = JSON.parse(await readFile(path.join(c.dir, 'orphan-acks.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved), [txh(0xee)]);
  assert.equal(saved[txh(0xee)].memo, memo);
  const after = await c.run({ mode: 'dry-run' });
  assert.notEqual(after.decision.codeHold, true);
  assert.deepEqual(after.obs.matchDesk.witness.orphans, [{ memo, tx: txh(0xee), acked: true }]);
});

test('--send killed while cast runs (receipt left planned): committed past the TTL, then sent/unknown, never expired', async () => {
  const c = await ctx({ logs: [gift()] });
  // Simulate the process dying after the write-ahead save: cast never returns, so this round never
  // records an outcome (its promise is abandoned, as if Ctrl-C killed node together with cast).
  let spawned = false;
  const hang = () => { spawned = true; const child = new EventEmitter(); child.stdout = new EventEmitter(); return child; };
  c.run({}, { spawnImpl: hang });
  for (let i = 0; i < 200 && !spawned; i++) await new Promise((res) => setTimeout(res, 5));
  assert.ok(spawned, 'cast was started');
  const files = await readdir(path.join(c.dir, 'receipts'));
  assert.equal(files.length, 1);
  const env = JSON.parse(await readFile(path.join(c.dir, 'receipts', files[0]), 'utf8'));
  assert.equal(env.status, 'planned');
  assert.equal(env.mode, 'send');
  const noModel = () => { throw new Error('the model must not be called'); };
  // Within the TTL and long after it, the gift stays committed (no model call, no new receipt).
  const soon = await c.run({ mode: 'dry-run' }, { llmFetch: noModel });
  assert.equal(soon.decision.action, 'hold');
  assert.equal(soon.obs.matchDesk.gifts[0].status, 'pending');
  const late = await c.run({ mode: 'dry-run', now: NOW_MS + 31 * 60_000 }, { llmFetch: noModel });
  assert.equal(late.decision.action, 'hold');
  assert.deepEqual(late.obs.matchDesk.witness.expired, []);
  assert.deepEqual(late.obs.matchDesk.witness.stuck, [env.sha256]);
  assert.equal(late.obs.matchDesk.gifts[0].status, 'matched');
  const moved = JSON.parse(await readFile(path.join(c.dir, 'receipts', files[0]), 'utf8'));
  assert.equal(moved.status, 'sent');
  assert.equal(moved.tx.status, 'unknown');
  // A human can still release it after checking the agent's address.
  const rel = await c.run({ mode: 'dry-run', release: env.sha256.slice(0, 12), now: NOW_MS + 32 * 60_000 });
  assert.equal(rel.released.status, 'failed');
});

test('txRef: a fork tx is labelled local and never linked to an explorer; a real send links its chain explorer', async () => {
  const { txRef } = await import('../run.mjs');
  const h = txh(0x12);
  assert.equal(txRef('fork', 5042002, h), `${h} (local fork tx, not on any explorer)`);
  assert.equal(txRef('send', 5042002, h), `${h} https://explorer.testnet.arc.io/tx/${h}`);
  assert.equal(txRef('send', 31337, h), h);
});
