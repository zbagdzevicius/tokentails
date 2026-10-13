import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { matchRound, describeMatch, EXIT } from '../run.mjs';
import { observeMatchDesk, makeRpc } from '../observe.mjs';
import { overcapPlan } from '../act.mjs';
import { promptFactsMatch, matchCodeHold } from '../decide.mjs';
import { validateSponsor, policyHashOf, GuardError } from '../lib/policy.mjs';
import { stateDir } from '../lib/receipt.mjs';
import { readFile as rf } from 'node:fs/promises';
import {
  stubRpc, batchLog, agentGiftLog, routerLog, sponsorRaw, httpStub, llmReply, w, txh,
  SPENDER, AGENT, OWNER, ROUTER, NOW_MS,
} from '../test-support/helpers.mjs';

const E16 = 10n ** 16n;
const FAN = '0x' + 'f1'.repeat(20);
const FAN2 = '0x' + 'f2'.repeat(20);
const TREASURY = '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A';
const HOT = '0x' + '11'.repeat(20);
const LOCAL = 'http://127.0.0.1:8548';

const fanGift = (n, { payer = FAN, amount = 2n * E16, memo = 'fan gift', block = 199_000 + n, logIndex = 0, native = true } = {}) =>
  batchLog({ batchId: n, payer, amount, memo, tx: txh(0xa000 + n), block, logIndex, native });

async function ctx({ logs = [], rpc = {}, raw = sponsorRaw(), env = {}, api = 'off', http } = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'md-round-'));
  const sponsor = validateSponsor(raw);
  const policyHash = policyHashOf(raw.policy);
  const stub = stubRpc({ logs, ...rpc });
  const deps = {
    rpcFetch: stub.fetchImpl, logDir: path.join(base, 'logs'), stateBase: path.join(base, 'state'),
    statementFile: path.join(base, 'no-statement.json'), api, httpFetch: http, env: { TREAT_AGENT_FAKE_LLM: '1', ...env },
  };
  const dir = stateDir(deps.stateBase, sponsor.chainId, sponsor.spender.address);
  const run = (opts = {}, more = {}) => matchRound({ sponsor, policyHash, rpc: LOCAL, rpcDisplay: LOCAL, mode: 'dry-run', keystore: 'tt-match-agent', once: true, now: NOW_MS, ...opts }, { ...deps, ...more });
  const observe = (more = {}) => observeMatchDesk({ rpc: makeRpc(LOCAL, { fetchImpl: stub.fetchImpl }), sponsor, policyHash, now: NOW_MS, dir, api, fetchImpl: http, statementFile: deps.statementFile, ...more });
  return { base, sponsor, policyHash, stub, logs, deps, dir, run, observe };
}

const receiptsIn = async (dir) => {
  try {
    return await Promise.all((await readdir(path.join(dir, 'receipts'))).map(async (f) => JSON.parse(await readFile(path.join(dir, 'receipts', f), 'utf8'))));
  } catch {
    return [];
  }
};
const noLlm = async () => { throw new Error('the model must not be called'); };

// ------------------------------------------------------------------ observe

test('observe: statuses for each kind of gift (RPC is the truth for donors)', async () => {
  const raw = sponsorRaw({ router: ROUTER, policy: { validFrom: '2026-10-03T03:51:00Z' } });
  const routerTx = txh(0xb001);
  const flushTx = txh(0xb002);
  const logs = [
    fanGift(1), // eligible
    fanGift(2, { payer: TREASURY }), // excluded-sender
    fanGift(3, { amount: 5n * 10n ** 15n }), // too-small
    fanGift(4, { memo: 'x402:abc' }), // kind-off (x402 not in kinds)
    batchLog({ batchId: 5, payer: ROUTER, amount: 2n * E16, memo: 'via router', tx: routerTx, block: 199_005 }), // router-backend (API off)
    routerLog({ donor: FAN2, batchId: 5, amount: 2n * E16, path: 1, memo: 'via router', tx: routerTx, block: 199_005 }),
    batchLog({ batchId: 6, payer: ROUTER, amount: 2n * E16, memo: 'flush', tx: flushTx, block: 199_006 }), // router-flush: kind-off
    fanGift(7, { block: 198_850 }), // 03:50:25, inside the read margin but before validFrom (03:51:00): too-old
    fanGift(8, { payer: HOT, memo: 'tt:heist:12345678', amount: 10_000n, native: false }), // treat: kind-off
    fanGift(9, { payer: FAN2 }), // matched by an old-style trusted match memo below
    batchLog({ batchId: 10, payer: SPENDER, amount: 2n * E16, memo: `tt:agent:match-${txh(0xa009).slice(2, 10)}`, tx: txh(0xc000), block: 199_010 }),
    fanGift(11, { payer: SPENDER, memo: 'tt:agent:m:motored:aaaaaaaa' }), // our own money: not a gift
  ];
  const c = await ctx({ raw, logs, env: {} });
  const obs = await c.observe({ ttSenders: HOT });
  const st = Object.fromEntries(obs.matchDesk.gifts.map((g) => [g.tx, g.status]));
  assert.equal(st[txh(0xa001)], 'eligible');
  assert.equal(st[txh(0xa002)], 'excluded-sender');
  assert.equal(st[txh(0xa003)], 'too-small');
  assert.equal(st[txh(0xa004)], 'kind-off');
  assert.equal(st[routerTx], 'router-backend');
  assert.equal(st[flushTx], 'kind-off');
  assert.equal(st[txh(0xa007)], 'too-old');
  assert.equal(st[txh(0xa008)], 'kind-off');
  assert.equal(st[txh(0xa009)], 'matched');
  assert.equal(st[txh(0xa00b)], undefined, 'gifts paid by the spender are never gifts');
  const r = obs.matchDesk.gifts.find((g) => g.tx === routerTx);
  assert.equal(r.donor, FAN2, 'router gifts: the donor is RouterDonation.donor, not the router');
  assert.equal(r.kind, 'router-native');
  const g1 = obs.matchDesk.gifts.find((g) => g.tx === txh(0xa001));
  assert.equal(g1.id, `${txh(0xa001)}:0`);
  assert.equal(g1.day, '2026-10-03');
  assert.equal(g1.giftMicro, 20_000n);
  assert.equal(obs.matchDesk.sponsor.label, "related-party sponsor (founder's company)");
  assert.equal(obs.matchDesk.caps.perTxMicro, 50_000n);
  assert.equal(obs.matchDesk.caps.unitDecimals, 18);
  assert.equal(obs.matchDesk.backend.routerBlocked, true);
  assert.equal(obs.last24h.unmatchedPublicGifts.length, 1);
});

test('observe: with the backend matcher off, router gifts are eligible; with it live they are not', async () => {
  const raw = sponsorRaw({ router: ROUTER, chainId: 5042002, eligible: { chains: [5042002] } });
  const tx = txh(0xb001);
  const logs = [
    batchLog({ batchId: 5, payer: ROUTER, amount: 2n * E16, memo: 'r', tx, block: 199_005 }),
    routerLog({ donor: FAN2, batchId: 5, amount: 2n * E16, path: 0, memo: 'r', tx, block: 199_005 }),
  ];
  const fx = async (n) => JSON.parse(await rf(new URL(`./fixtures/match-desk/${n}`, import.meta.url), 'utf8'));
  for (const [file, want] of [['match-status-off.json', 'eligible'], ['match-status-live.json', 'router-backend']]) {
    const http = httpStub({ payouts: await fx('payouts.json'), donate: await fx('donate-status.json'), match: await fx(file) }).fetchImpl;
    const c = await ctx({ raw, logs, rpc: { chainId: 5042002 }, api: 'https://api.example', http });
    const obs = await c.observe();
    assert.equal(obs.matchDesk.gifts[0].status, want, file);
    assert.equal(obs.matchDesk.gifts[0].kind, 'router-authorization');
    assert.equal(obs.matchDesk.backend.donateStatus.splitMatches, true);
  }
});

test('observe guards: chain, split, agent, owner and an init-state sponsor.json', async () => {
  const c = await ctx();
  await assert.rejects(observeMatchDesk({ rpc: makeRpc(LOCAL, { fetchImpl: stubRpc({ chainId: 5042002 }).fetchImpl }), sponsor: c.sponsor, now: NOW_MS, api: 'off' }), (e) => e instanceof GuardError && /eth_chainId/.test(e.message));
  for (const [opt, re] of [[{ split: '0x' + '99'.repeat(20) }, /split/], [{ agent: '0x' + '98'.repeat(20) }, /agent/], [{ owner: '0x' + '97'.repeat(20) }, /owner/]]) {
    await assert.rejects(observeMatchDesk({ rpc: makeRpc(LOCAL, { fetchImpl: stubRpc(opt).fetchImpl }), sponsor: c.sponsor, now: NOW_MS, api: 'off' }), (e) => e instanceof GuardError && re.test(e.message));
  }
  const init = validateSponsor(sponsorRaw({ spender: { address: null, deployBlock: null, owner: null, agent: null } }));
  await assert.rejects(matchRound({ sponsor: init, rpc: LOCAL }, { env: {} }), (e) => e instanceof GuardError && /init state/.test(e.message));
});

test('observe: farming signal (more than 5 gifts from one donor in a day), pace, float and refund facts', async () => {
  const logs = Array.from({ length: 6 }, (_, i) => fanGift(i + 1, { payer: FAN2, amount: E16 }));
  const c = await ctx({ logs, rpc: { float: 5n * E16 } });
  const obs = await c.observe();
  const md = obs.matchDesk;
  assert.equal(md.farmingSignals.length, 1);
  assert.equal(md.farmingSignals[0].donor, FAN2);
  assert.equal(md.farmingSignals[0].gifts, 6);
  assert.equal(md.farmingSignals[0].giftIds.length, 6);
  assert.equal(md.floatLow, true, 'float 0.05 < floatLow 0.10');
  assert.equal(md.refundAllowed, false);
  assert.equal(md.pace.status, 'behind');
  assert.equal(md.pace.daysLeft, 29);
  const facts = promptFactsMatch(obs);
  assert.equal(facts.ratio, '1:1');
  assert.equal(facts.per_tx_cap_usdc, '0.05');
  assert.equal(facts.eligible_gifts[0].match_if_alone_usdc, '0.01');
  assert.match(facts.sponsor_label, /related-party sponsor \(founder's company\)/);
  assert.match(facts.the_rule, /exactly/);
});

// ------------------------------------------------------------------ rounds

test('one full dry-run round: planned receipt (write-ahead), printed command, log line with matchDesk', async () => {
  const c = await ctx({ logs: [fanGift(1), fanGift(2, { payer: FAN2, amount: 3n * E16 })] });
  const r = await c.run({ rpcDisplay: '"$TREAT_AGENT_RPC"' });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.decision.action, 'match');
  assert.equal(r.decision.amountUsdc, '0.03', 'the newest eligible gift');
  assert.match(r.decision.memo, /^tt:agent:m:motored:[0-9a-f]{8}$/);
  assert.equal(r.result.command, `cast send ${SPENDER} 'give(uint256,string)' 30000000000000000 ${r.decision.memo} --rpc-url '"$TREAT_AGENT_RPC"' --account tt-match-agent`);
  const [env] = await receiptsIn(c.dir);
  assert.equal(env.status, 'planned');
  assert.equal(env.mode, 'dry-run');
  assert.equal(env.memo, r.decision.memo);
  assert.equal(env.receipt.amountRaw, '30000000000000000');
  assert.equal(env.decision.checker.ok, true);
  assert.match(env.decision.observationHash, /^sha256:/);
  const line = JSON.parse((await readFile(r.file, 'utf8')).trim().split('\n').pop());
  assert.equal(line.matchDesk.sponsor, 'motored');
  assert.equal(line.matchDesk.receiptSha256, env.sha256);
  assert.equal(line.matchDesk.memo, env.memo);
  assert.equal(line.matchDesk.policyHash, c.policyHash);
  assert.deepEqual(Object.keys(line.matchDesk.witness).sort(), ['failed', 'orphans', 'reconciled']);
  assert.doesNotMatch(JSON.stringify(line), /127\.0\.0\.1/);
  assert.match(describeMatch(r), /MATCH 0.03 USDC/);

  // Round 2: the planned gift is pending; the next gift is matched; then nothing is left (code hold, no model call).
  const r2 = await c.run();
  assert.equal(r2.decision.amountUsdc, '0.02');
  const pending = r2.obs.matchDesk.gifts.find((g) => g.tx === txh(0xa002));
  assert.equal(pending.status, 'pending');
  const r3 = await c.run({}, { llmFetch: noLlm });
  assert.equal(r3.decision.action, 'hold');
  assert.match(r3.decision.rationale, /Held by code: no eligible gift/);
  // After the TTL the dry-run receipts expire and the gifts are eligible again.
  const r4 = await c.run({ now: NOW_MS + 31 * 60_000 });
  assert.equal(r4.obs.matchDesk.witness.expired.length, 2);
  assert.equal(r4.decision.action, 'match');
});

test('fork round: sent, then witness reconciles from the AgentGift event; budget and donor room follow', async () => {
  const logs = [fanGift(1)];
  let castArgs;
  const execImpl = (_bin, args, _o, cb) => {
    castArgs = args;
    cb(null, JSON.stringify({ transactionHash: txh(0xdd), status: '0x1', blockNumber: '0x30d41' }), '');
  };
  const c = await ctx({ logs });
  const r = await c.run({ mode: 'fork' }, { execImpl });
  assert.equal(r.code, EXIT.OK);
  assert.deepEqual(castArgs.slice(0, 5), ['send', SPENDER, 'give(uint256,string)', '20000000000000000', r.envelope.memo]);
  assert.ok(castArgs.includes('--unlocked') && castArgs.includes(AGENT));
  assert.equal(r.envelope.status, 'sent');
  assert.equal(r.envelope.tx.hash, txh(0xdd));
  logs.push(agentGiftLog({ amount: 2n * E16, memo: r.envelope.memo, tx: txh(0xdd), block: 200_001 - 1 }));
  const w = await c.run({ witnessOnly: true });
  assert.equal(w.code, EXIT.OK);
  assert.deepEqual(w.obs.matchDesk.witness.reconciled, [r.envelope.sha256]);
  assert.match(describeMatch(w), /reconciled\s+fork/);
  const [env] = await receiptsIn(c.dir);
  assert.equal(env.status, 'reconciled');
  assert.equal(env.witness.amountRaw, '20000000000000000');
  const obs = await c.observe();
  assert.equal(obs.matchDesk.budget.committedMicro, 20_000n);
  assert.equal(obs.matchDesk.donorUsedMicro[`${FAN}|2026-10-03`], 20_000n);
  assert.equal(obs.matchDesk.gifts[0].status, 'matched');
});

test('fork revert before mining marks the receipt failed and exits 1 (gifts eligible again)', async () => {
  const data = '0x68de5ce4';
  const execImpl = (_b, _a, _o, cb) => cb(new Error('exit 1'), '', `execution reverted, data: "${data}"`);
  const c = await ctx({ logs: [fanGift(1)] });
  const r = await c.run({ mode: 'fork' }, { execImpl });
  assert.equal(r.code, EXIT.FAILED);
  assert.equal(r.envelope.status, 'failed');
  assert.equal(r.result.revert.name, 'SplitPaused');
  const obs = await c.observe();
  assert.equal(obs.matchDesk.gifts[0].status, 'eligible');
});

test('TREAT_AGENT_FAKE_WRONG: the checker rejects the 1-micro difference; nothing is planned or sent', async () => {
  let ran = false;
  const c = await ctx({ logs: [fanGift(1)], env: { TREAT_AGENT_FAKE_WRONG: '1' } });
  const r = await c.run({ mode: 'fork' }, { execImpl: () => { ran = true; } });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.decision.action, 'hold');
  assert.equal(r.decision.rationale, `Checker rejected: model proposed 0.020001 USDC, policy gives 0.02 USDC for ${txh(0xa001)}:0`);
  assert.equal(r.record.matchDesk.checker.ok, false);
  assert.equal(r.record.matchDesk.checker.expectedMicro, '20000');
  assert.equal(r.record.matchDesk.checker.proposedMicro, '20001');
  assert.equal(ran, false);
  assert.equal((await receiptsIn(c.dir)).length, 0);
});

test('code-only holds skip the model: paused, nothing left today, empty float, used budget, split mismatch', async () => {
  const cases = [
    [{ paused: true }, /split is paused/],
    [{ remaining: 0n }, /cap is used up/],
    [{ float: 0n }, /float is empty/],
  ];
  for (const [rpc, re] of cases) {
    const c = await ctx({ logs: [fanGift(1)], rpc });
    const r = await c.run({}, { llmFetch: noLlm });
    assert.equal(r.decision.action, 'hold');
    assert.match(r.decision.rationale, re);
  }
  const raw = sponsorRaw({ chainId: 5042002, eligible: { chains: [5042002] } });
  const fx = async (n) => JSON.parse(await rf(new URL(`./fixtures/match-desk/${n}`, import.meta.url), 'utf8'));
  const donate = await fx('donate-status.json');
  donate.chains[1].splitAddress = '0x' + '77'.repeat(20);
  const http = httpStub({ donate, match: await fx('match-status-off.json') }).fetchImpl;
  const c = await ctx({ raw, logs: [fanGift(1)], rpc: { chainId: 5042002 }, api: 'https://api.example', http });
  const r = await c.run({}, { llmFetch: noLlm });
  assert.match(r.decision.rationale, /different ShelterSplit/);
  // budget used up: a reconciled receipt worth the whole budget
  const c2 = await ctx({ logs: [fanGift(1), fanGift(2)], raw: sponsorRaw({ policy: { budgetUsdc: '0.02', perGiftMaxUsdc: '0.02' } }) });
  const first = await c2.run();
  assert.equal(first.decision.action, 'match');
  const second = await c2.run({}, { llmFetch: noLlm });
  assert.match(second.decision.rationale, /budget is used up/);
  assert.equal(matchCodeHold(second.obs), "the sponsor's budget is used up");
});

test('flag farming writes flagged.json and the gifts are excluded until a human removes them', async () => {
  const logs = Array.from({ length: 6 }, (_, i) => fanGift(i + 1, { payer: FAN2, amount: E16 }));
  const c = await ctx({ logs });
  const r = await c.run();
  assert.equal(r.decision.action, 'flag');
  assert.equal(r.decision.kind, 'farming');
  const flagged = JSON.parse(await readFile(path.join(c.dir, 'flagged.json'), 'utf8'));
  assert.equal(Object.keys(flagged).length, 6);
  assert.equal(r.record.matchDesk.flag.kind, 'farming');
  const obs = await c.observe();
  assert.ok(obs.matchDesk.gifts.every((g) => g.status === 'flagged'));
});

test('propose_refund: rejected before refund.after; afterwards it writes the owner-only command and never sends', async () => {
  const before = await ctx({ logs: [fanGift(1)] });
  const r1 = await before.run({}, { llmFetch: llmReply('propose_refund', { rationale: 'Campaign over.' }) });
  assert.equal(r1.decision.action, 'hold');
  assert.match(r1.decision.rationale, /Rejected model output: propose_refund before/);
  const after = await ctx({ logs: [], raw: sponsorRaw({ policy: { refund: { after: '2026-10-01', to: 'owner' } } }) });
  let ran = false;
  const r2 = await after.run({ mode: 'fork' }, { llmFetch: llmReply('propose_refund', { rationale: 'Campaign over.' }), execImpl: () => { ran = true; } });
  assert.equal(r2.decision.action, 'propose_refund');
  assert.equal(ran, false);
  const p = JSON.parse(await readFile(path.join(after.dir, 'refund-proposal.json'), 'utf8'));
  assert.equal(p.owner, OWNER);
  assert.equal(p.floatUsdc, '1');
  assert.equal(p.command, `cast send ${SPENDER} 'withdraw(address)' ${OWNER} --rpc-url ${LOCAL} --account <sponsor-keystore>`);
});

test('a match that would leave treasury dust is held before any receipt', async () => {
  const c = await ctx({ logs: [fanGift(1)], rpc: { toTreasury: 1n } });
  const r = await c.run();
  assert.equal(r.decision.action, 'hold');
  assert.equal(r.decision.heldForDust, true);
  assert.equal((await receiptsIn(c.dir)).length, 0);
});

test('receipts published in statement.json for this spender keep their gifts matched', async () => {
  const c = await ctx({ logs: [fanGift(1)] });
  const r = await c.run();
  const [env] = await receiptsIn(c.dir);
  // Lose the local state; the published statement still holds the receipt (reconciled).
  const reconciled = { ...env, status: 'reconciled' };
  const stmt = path.join(c.base, 'statement.json');
  await writeFile(stmt, JSON.stringify({ contract: { spender: SPENDER }, receipts: [reconciled] }));
  const fresh = await c.observe({ dir: path.join(c.base, 'empty'), statementFile: stmt });
  assert.equal(fresh.matchDesk.gifts[0].status, 'matched');
  assert.equal(fresh.matchDesk.budget.committedMicro, 20_000n);
  assert.ok(r);
});

test('an API error exits 3', async () => {
  const c = await ctx({ logs: [fanGift(1)], env: { TREAT_AGENT_FAKE_LLM: '0', ANTHROPIC_API_KEY: 'k' } });
  const r = await c.run({}, { llmFetch: async () => ({ ok: false, status: 529, text: async () => 'overloaded' }) });
  assert.equal(r.code, EXIT.API);
  assert.equal(r.meta.apiError, true);
});

// ------------------------------------------------------------------ over-cap demo

test('overcapPlan: auto, tx and day amounts', () => {
  const caps = { perTx: 5n * E16, daily: 20n * E16, remaining: 20n * E16, spent: 0n };
  assert.deepEqual(overcapPlan(caps, 'auto').expect, { name: 'OverTxCap', args: { amount: '100000000000000000', cap: '50000000000000000' } });
  assert.equal(overcapPlan(caps, 'tx').amountRaw, 10n * E16);
  assert.throws(() => overcapPlan(caps, 'day'), (e) => e instanceof GuardError && /spend the day first/.test(e.message));
  const spentDay = { perTx: 5n * E16, daily: 20n * E16, remaining: 0n, spent: 20n * E16 };
  const day = overcapPlan(spentDay, 'auto');
  assert.equal(day.kind, 'day');
  assert.equal(day.amountRaw, 5n * E16);
  assert.deepEqual(day.expect, { name: 'OverDailyCap', args: { wouldSpend: '250000000000000000', cap: '200000000000000000' } });
  assert.throws(() => overcapPlan(caps, 'week'), GuardError);
});

const revertWith = (hex) => (_b, _a, _o, cb) => cb(new Error('exit 1'), '', `Error: execution reverted, data: "${hex}"`);

test('--demo-overcap on a fork: success only on the expected error; no model call, no receipt', async () => {
  const rpc = { perTx: 5n * E16, daily: 20n * E16, remaining: 0n, spent: 20n * E16 };
  const c = await ctx({ logs: [fanGift(1)], rpc });
  const ok = await c.run({ mode: 'fork', demoOvercap: true, overcapKind: 'day' }, { llmFetch: noLlm, execImpl: revertWith('0x92ec8899' + w(25n * E16) + w(20n * E16)) });
  assert.equal(ok.code, EXIT.OK);
  assert.equal(ok.result.status, 'refused-as-expected');
  assert.equal(ok.decision.memo, 'tt:agent:m:motored:demo-overcap');
  assert.equal(ok.record.result.status, 'refused-as-expected');
  assert.match(describeMatch(ok), /OverDailyCap\(0\.25, 0\.2\)/);
  assert.equal((await receiptsIn(c.dir)).length, 0);
  const wrong = await c.run({ mode: 'fork', demoOvercap: true, overcapKind: 'day' }, { execImpl: revertWith('0x734e76f9' + w(5n * E16) + w(5n * E16)) });
  assert.equal(wrong.code, EXIT.DEMO);
  const success = await c.run({ mode: 'fork', demoOvercap: true, overcapKind: 'day' }, { execImpl: (_b, _a, _o, cb) => cb(null, JSON.stringify({ transactionHash: '0x1', status: '0x1' }), '') });
  assert.equal(success.code, EXIT.DEMO);
  const fresh = await ctx({ rpc: { perTx: 5n * E16, daily: 20n * E16, remaining: 20n * E16 } });
  await assert.rejects(fresh.run({ mode: 'fork', demoOvercap: true, overcapKind: 'day' }), /spend the day first/);
  const tx = await fresh.run({ mode: 'fork', demoOvercap: true }, { execImpl: revertWith('0x734e76f9' + w(10n * E16) + w(5n * E16)) });
  assert.equal(tx.code, EXIT.OK);
  assert.equal(tx.result.demo, 'tx');
});

test('--demo-overcap dry run prints both the simulation and the mined-revert command', async () => {
  const c = await ctx();
  const r = await c.run({ demoOvercap: true });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.result.status, 'printed');
  assert.equal(r.result.command, `cast call ${SPENDER} 'give(uint256,string)' 100000000000000000 tt:agent:m:motored:demo-overcap --rpc-url ${LOCAL} --from ${AGENT}`);
  assert.match(r.result.minedCommand, /--account tt-match-agent --gas-limit 300000$/);
});

// ------------------------------------------------------------------ request shape, tool validation, CLI

test('match-desk request: same call shape, its own system prompt and four strict tools', async () => {
  const c = await ctx({ logs: [fanGift(1)], env: { TREAT_AGENT_FAKE_LLM: '0', ANTHROPIC_API_KEY: 'k' } });
  const r = await c.run({}, { llmFetch: llmReply('hold', { rationale: 'Waiting.' }) });
  assert.equal(r.decision.action, 'hold');
  const body = llmReply.lastBody;
  assert.equal(body.model, 'claude-opus-5-5');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.tool_choice.disable_parallel_tool_use, true);
  assert.deepEqual(body.tools.map((t) => t.name), ['match_gift', 'hold', 'flag', 'propose_refund']);
  assert.ok(body.tools.every((t) => t.strict === true && t.input_schema.additionalProperties === false));
  assert.match(body.system, /match desk/);
  assert.match(body.messages[0].content, /^Observation:\n\{/);
  assert.match(body.messages[0].content, /\n\nDecide now: /);
  assert.match(body.messages[0].content, /"match_if_alone_usdc": "0.02"/);
});

test('tool validation: exact keys, types, flag rules; failures are rejected holds', async () => {
  const c = await ctx({ logs: [fanGift(1)], env: { TREAT_AGENT_FAKE_LLM: '0', ANTHROPIC_API_KEY: 'k' } });
  const id = `${txh(0xa001)}:0`;
  const bad = [
    ['match_gift', { gift_ids: [id], amount_usdc: 0.02, rationale: 'r' }, /decimal string/],
    ['match_gift', { gift_ids: id, amount_usdc: '0.02', rationale: 'r' }, /array of strings/],
    ['match_gift', { gift_ids: [id], amount_usdc: '0.02', rationale: 'r', to: '0x' }, /keys/],
    ['match_gift', { gift_ids: [id], amount_usdc: '0.02', rationale: ' ' }, /rationale/],
    ['flag', { kind: 'farming', gift_ids: [], rationale: 'r' }, /needs gift_ids/],
    ['flag', { kind: 'farming', gift_ids: ['nope'], rationale: 'r' }, /not an eligible gift/],
    ['flag', { kind: 'spam', gift_ids: [], rationale: 'r' }, /farming, pace or float_low/],
    ['give_treat', { amount_usdc: 1, memo_suffix: 'x', rationale: 'r' }, /unknown tool/],
  ];
  for (const [name, input, re] of bad) {
    const r = await c.run({}, { llmFetch: llmReply(name, input) });
    assert.equal(r.decision.action, 'hold', name);
    assert.match(r.decision.rationale, re, JSON.stringify(input));
    assert.equal(r.meta.rejected, true);
  }
  const pace = await c.run({}, { llmFetch: llmReply('flag', { kind: 'pace', gift_ids: [], rationale: 'Behind pace.' }) });
  assert.equal(pace.decision.action, 'flag');
  assert.equal(pace.record.matchDesk.flag.kind, 'pace');
});

test('CLI: the committed example (init state) exits 2 before any network call; bad flags exit 2', async () => {
  const { execFile } = await import('node:child_process');
  const runCli = (args, env = {}) => new Promise((resolve) => {
    execFile(process.execPath, ['run.mjs', ...args], { cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env.PATH, MATCH_DESK_API: 'off', ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
  const init = await runCli(['--sponsor', 'sponsor.example.json', '--rpc', 'http://127.0.0.1:9', '--once']);
  assert.equal(init.code, 2);
  assert.match(init.stderr, /init state/);
  assert.equal((await runCli(['--sponsor', 'sponsor.example.json', '--fork', '--send'])).code, 2);
  assert.equal((await runCli(['--sponsor', 'sponsor.example.json', '--overcap-kind', 'week'])).code, 2);
  assert.equal((await runCli(['--sponsor', 'sponsor.example.json', '--mined-revert'])).code, 2);
  assert.equal((await runCli(['--sponsor', 'missing.json'])).code, 2);
});

// ------------------------------------------------------------------ review fixes (Oct 13)

test('a --fork/--send round right after a dry run is not held by the dry-run receipt', async () => {
  const logs = [fanGift(1)];
  const execImpl = (_bin, _args, _o, cb) => cb(null, JSON.stringify({ transactionHash: txh(0xdd), status: '0x1', blockNumber: '0x30d41' }), '');
  const c = await ctx({ logs });
  const dry = await c.run();
  assert.equal(dry.envelope.status, 'planned');
  // Another dry run within the TTL still sees the gift as pending.
  const again = await c.run({}, { llmFetch: noLlm });
  assert.equal(again.decision.action, 'hold');
  assert.equal(again.obs.matchDesk.gifts[0].status, 'pending');
  // The fork round does not: same gifts and amount give the same memo, and it sends.
  const r = await c.run({ mode: 'fork' }, { execImpl });
  assert.equal(r.code, EXIT.OK);
  assert.equal(r.decision.action, 'match');
  assert.equal(r.envelope.memo, dry.envelope.memo);
  assert.equal(r.envelope.sha256, dry.envelope.sha256);
  assert.equal(r.envelope.status, 'sent');
  assert.equal(r.envelope.mode, 'fork');
  assert.equal((await receiptsIn(c.dir)).length, 1, 'one receipt file per sha');
});

test('a dry-run command the founder ran by hand is caught by the memo before a send round', async () => {
  const logs = [fanGift(1)];
  const c = await ctx({ logs });
  const dry = await c.run();
  logs.push(agentGiftLog({ amount: 2n * E16, memo: dry.envelope.memo, tx: txh(0xd1), block: 199_900 }));
  const r = await c.run({ mode: 'fork' }, { execImpl: () => { throw new Error('nothing may be sent'); }, llmFetch: noLlm });
  assert.equal(r.decision.action, 'hold', 'the witness reconciled it: the gift is matched');
  assert.deepEqual(r.obs.matchDesk.witness.reconciled, [dry.envelope.sha256]);
  assert.equal(r.obs.matchDesk.gifts[0].status, 'matched');
});

test('observe: the shelter wallet and tt:agent:/tt:match: memos from any payer are never matched', async () => {
  const SHELTER = '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37';
  const STRANGER = '0x' + 'f3'.repeat(20);
  const c = await ctx({
    logs: [
      fanGift(1, { payer: SHELTER }),
      fanGift(2, { payer: STRANGER, memo: 'tt:agent:x402' }),
      fanGift(3, { payer: STRANGER, memo: 'tt:match:1234abcd' }),
      fanGift(4, { payer: STRANGER, memo: 'tt:heist:1234abcd' }),
    ],
  });
  const obs = await c.observe();
  const st = Object.fromEntries(obs.matchDesk.gifts.map((g) => [g.tx, g.status]));
  assert.equal(st[txh(0xa001)], 'excluded-sender');
  assert.equal(st[txh(0xa002)], 'tt-internal');
  assert.equal(st[txh(0xa003)], 'tt-internal');
  assert.equal(st[txh(0xa004)], 'eligible', 'another tt:* memo from a stranger is still public money');
});

test('--demo-overcap --mined-revert never sends the day kind (a real give that only the daily cap stops)', async () => {
  const c = await ctx({ rpc: { perTx: 5n * E16, daily: 20n * E16, remaining: 1n * E16, spent: 19n * E16 } });
  await assert.rejects(c.run({ mode: 'fork', demoOvercap: true, overcapKind: 'day', minedRevert: true }), (e) => e instanceof GuardError && /--overcap-kind tx/.test(e.message));
  // auto with less than one cap left would pick day; with --mined-revert it becomes tx (2 x perTx).
  let args;
  const execImpl = (_b, a, _o, cb) => {
    args = a;
    cb(new Error('exit 1'), '', `execution reverted, data: "0x734e76f9${w(10n * E16)}${w(5n * E16)}"`);
  };
  const r = await c.run({ mode: 'fork', demoOvercap: true, overcapKind: 'auto', minedRevert: true }, { execImpl });
  assert.equal(r.result.demo, 'tx');
  assert.equal(args[3], '100000000000000000');
  assert.equal(r.code, EXIT.OK);
});
