// Multi-sponsor desk (MATCH-DESK.md, "Desk"): desk.json validation, v1 normalisation, the allocation rule,
// the sponsor-mismatch refusal, cross-vault idempotency, the desk-wide per-donor limit and the per-sponsor
// statement. Stubbed RPC/LLM/exec only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { matchRound, describeMatch, EXIT } from '../run.mjs';
import { promptFactsMatch, matchCodeHold } from '../decide.mjs';
import { allocate } from '../lib/checker.mjs';
import {
  validateDesk, validateSponsor, deskOf, deskFromSponsor, loadDesk, policyHashOf, deskPolicyHashOf, PolicyError, GuardError,
  LABEL_RELATED, LABEL_OPERATOR, sponsorLabel,
} from '../lib/policy.mjs';
import { deskStateDir, deskKey, stateDir, newEnvelope, buildReceiptBody, saveEnvelope } from '../lib/receipt.mjs';
import { buildStatement } from '../statement.mjs';
import { renderHtml } from '../lib/statement-html.mjs';
import {
  stubRpc, batchLog, agentGiftLog, sponsorRaw, deskRaw, llmReply, txh,
  SPENDER, SPENDER_B, OWNER, OWNER_B, AGENT, NOW_MS,
} from '../test-support/helpers.mjs';

const E16 = 10n ** 16n;
const FAN = '0x' + 'f1'.repeat(20);
const FAN2 = '0x' + 'f2'.repeat(20);
const LOCAL = 'http://127.0.0.1:8548';
const EXAMPLE = new URL('../desk.example.json', import.meta.url);
const V1_EXAMPLE = new URL('../sponsor.example.json', import.meta.url);

const fanGift = (n, { payer = FAN, amount = 2n * E16, memo = 'fan gift', block = 199_000 + n, logIndex = 0 } = {}) =>
  batchLog({ batchId: n, payer, amount, memo, tx: txh(0xa000 + n), block, logIndex });
const okCast = (hash) => (_bin, _args, _o, cb) => cb(null, JSON.stringify({ transactionHash: hash, status: '0x1', blockNumber: '0x30d41' }), '');
const noLlm = async () => { throw new Error('the model must not be called'); };

async function ctx({ raw = deskRaw(), logs = [], rpc = {}, vaultB = {}, env = {} } = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'md-desk-'));
  const desk = validateDesk(raw);
  const stub = stubRpc({ logs, ...rpc, vaults: { [SPENDER_B]: { owner: OWNER_B, ...vaultB } } });
  const deps = {
    rpcFetch: stub.fetchImpl, logDir: path.join(base, 'logs'), stateBase: path.join(base, 'state'),
    statementFile: path.join(base, 'none.json'), api: 'off', env: { TREAT_AGENT_FAKE_LLM: '1', ...env },
  };
  const dir = deskStateDir(deps.stateBase, desk.chainId, [SPENDER, SPENDER_B]);
  const run = (opts = {}, more = {}) => matchRound({ desk, rpc: LOCAL, rpcDisplay: LOCAL, mode: 'dry-run', keystore: 'tt-match-agent', once: true, now: NOW_MS, ...opts }, { ...deps, ...more });
  return { base, desk, stub, logs, deps, dir, run };
}

const receiptsIn = async (dir) => {
  try {
    return await Promise.all((await readdir(path.join(dir, 'receipts'))).map(async (f) => JSON.parse(await readFile(path.join(dir, 'receipts', f), 'utf8'))));
  } catch {
    return [];
  }
};

// ------------------------------------------------------------------ desk.json

test('the committed desk example: two sponsors in allocation order, one agent, labels, per-sponsor policy hashes', async () => {
  const { desk } = await loadDesk(EXAMPLE);
  assert.equal(desk.v1, false);
  assert.equal(desk.chainId, 5042);
  assert.equal(desk.agent, null);
  assert.deepEqual(desk.sponsors.map((v) => [v.sponsor.id, v.priority, v.sponsor.label]), [
    ['motored', 20, LABEL_RELATED],
    ['tokentails', 10, LABEL_OPERATOR],
  ]);
  assert.equal(LABEL_OPERATOR, "operator's own money");
  for (const v of desk.sponsors) {
    assert.equal(v.spender.address, null);
    assert.equal(v.policy.perGiftMaxMicro, 50_000n);
    assert.equal(v.policy.budgetMicro, 1_000_000n);
    assert.equal(v.policy.perDonorDailyMaxMicro, 50_000n, 'the per-donor limit is desk-wide');
    assert.match(v.policyHash, /^[0-9a-f]{64}$/);
  }
  assert.notEqual(desk.sponsors[0].policyHash, desk.sponsors[1].policyHash);
  // The hash covers the shared policy plus that sponsor's own entry, nothing else.
  const raw = JSON.parse(await readFile(EXAMPLE, 'utf8'));
  assert.equal(desk.sponsors[0].policyHash, deskPolicyHashOf(raw.policy, raw.sponsors[0]));
  const other = structuredClone(raw);
  other.sponsors[1].budgetUsdc = '2.00';
  assert.equal(validateDesk(other).sponsors[0].policyHash, desk.sponsors[0].policyHash, "another sponsor's entry does not change it");
  const shared = structuredClone(raw);
  shared.policy.minGiftUsdc = '0.02';
  assert.notEqual(validateDesk(shared).sponsors[0].policyHash, desk.sponsors[0].policyHash, 'the shared policy does');
  const paused = structuredClone(raw);
  paused.sponsors[0].paused = true;
  assert.equal(validateDesk(paused).sponsors[0].policyHash, desk.sponsors[0].policyHash, 'pausing is not a policy change');
});

test('v1 sponsor.json is normalised into a one-sponsor desk with the old policy hash', async () => {
  const { desk } = await loadDesk(V1_EXAMPLE);
  const raw = JSON.parse(await readFile(V1_EXAMPLE, 'utf8'));
  assert.equal(desk.v1, true);
  assert.equal(desk.sponsors.length, 1);
  assert.equal(desk.sponsors[0].sponsor.id, 'motored');
  assert.equal(desk.sponsors[0].policyHash, policyHashOf(raw.policy), 'v1 receipts keep their policy hash and memo');
  assert.equal(desk.split, raw.split);
  const s = validateSponsor(sponsorRaw());
  const d = deskFromSponsor(s, 'h');
  assert.equal(d.agent, AGENT);
  assert.equal(d.sponsors[0].spender.address, SPENDER);
  assert.equal(deskOf(sponsorRaw()).sponsors[0].policyHash, policyHashOf(sponsorRaw().policy));
});

test('desk.json validation: per-sponsor keys, ids, vaults, agent, priority, Token Tails is a related party', () => {
  const bad = (raw, re) => assert.throws(() => validateDesk(raw), (e) => e instanceof PolicyError && e instanceof GuardError && re.test(e.message), re.toString());
  bad({ ...deskRaw(), schema: 'tt.match-desk.desk/v1' }, /schema/);
  bad(deskRaw({ policy: { budgetUsdc: '1' } }), /policy\.budgetUsdc is per sponsor/);
  bad(deskRaw({ sponsors: [] }), /1…8 sponsors/);
  bad(deskRaw({ b: { id: 'motored' } }), /listed twice/);
  bad(deskRaw({ b: { spender: { address: SPENDER, deployBlock: 1, owner: OWNER_B } } }), /listed for two sponsors/);
  bad(deskRaw({ a: { spender: { address: SPENDER, deployBlock: 1, owner: OWNER, agent: AGENT } } }), /agent is desk-wide/);
  bad(deskRaw({ a: { spender: { address: SPENDER, deployBlock: 1, owner: AGENT } } }), /agent must not be a vault owner/);
  bad(deskRaw({ agent: 'nope' }), /agent must be/);
  bad(deskRaw({ b: { priority: -1 } }), /priority/);
  bad(deskRaw({ b: { paused: 'yes' } }), /paused/);
  bad(deskRaw({ b: { relatedParty: false } }), /sponsors\[1\] \(tokentails\): Token Tails is the operator/);
  bad(deskRaw({ a: { perGiftMaxUsdc: '2', budgetUsdc: '1' } }), /sponsors\[0\] \(motored\): .*must not exceed/);
  assert.equal(sponsorLabel({ id: 'tokentails', relatedParty: true, relation: "operator (Token Tails' own money)" }), LABEL_OPERATOR);
  // Allocation order: priority, then id.
  const tie = validateDesk(deskRaw({ a: { priority: 5 }, b: { priority: 5 } }));
  assert.deepEqual(tie.sponsors.map((v) => v.sponsor.id), ['motored', 'tokentails']);
  const flipped = validateDesk(deskRaw({ a: { priority: 1 } }));
  assert.deepEqual(flipped.sponsors.map((v) => v.sponsor.id), ['tokentails', 'motored']);
});

test('state dir: keyed by chain and the sorted vault addresses', () => {
  assert.equal(deskKey([SPENDER, SPENDER_B]), deskKey([SPENDER_B.toUpperCase().replace('0X', '0x'), SPENDER]));
  assert.notEqual(deskKey([SPENDER]), deskKey([SPENDER, SPENDER_B]));
  assert.match(deskStateDir('/x', 5042, [SPENDER]), /^\/x\/5042-desk-[0-9a-f]{12}$/);
});

// ------------------------------------------------------------------ allocation (pure)

const gift = (id, donor, giftMicro, extra = {}) => ({
  id, tx: '0x' + id.padStart(64, '0'), logIndex: 0, block: 100, ts: 1_791_000_000, day: '2026-10-03', batchId: '1', kind: 'public', donor, giftMicro, status: 'eligible', ...extra,
});
const sponsorFx = (id, { priority = 10, budget = 1_000_000n, float = 1_000_000n, remaining = 200_000n, perGiftMax = 50_000n, ratioBps = 10000, unavailable = null, validFromMs = 0 } = {}) => ({
  id, priority, unavailable,
  caps: { perTxMicro: 50_000n, remainingTodayMicro: remaining, floatMicro: float },
  budget: { leftMicro: budget },
  policy: { ratioBps, perGiftMaxMicro: perGiftMax, validFromMs },
});
const mdFx = (sponsors, gifts, used = {}) => ({
  gifts, donorUsedMicro: used, sponsors,
  policy: { ratioBps: 10000, perGiftMaxMicro: 50_000n, perDonorDailyMaxMicro: 50_000n, treatsDailyMaxMicro: 0n },
  caps: sponsors[0].caps, budget: sponsors[0].budget,
});

test('allocation: the highest priority sponsor that can pay the whole amount; one vault per match', () => {
  const g = [gift('1', FAN, 30_000n)];
  const r = allocate(['1'], mdFx([sponsorFx('motored', { priority: 20 }), sponsorFx('tokentails')], g));
  assert.equal(r.ok, true);
  assert.equal(r.sponsorId, 'motored');
  assert.equal(r.amountMicro, 30_000n);
  // budget exhausted (left < amount) -> next sponsor; nothing is split or clamped to what is left
  const budget = allocate(['1'], mdFx([sponsorFx('motored', { budget: 20_000n }), sponsorFx('tokentails')], g));
  assert.equal(budget.sponsorId, 'tokentails');
  assert.equal(budget.amountMicro, 30_000n);
  assert.match(budget.skipped[0].reason, /budget 0\.02 < 0\.03/);
  // float exhausted -> next
  assert.equal(allocate(['1'], mdFx([sponsorFx('motored', { float: 29_999n }), sponsorFx('tokentails')], g)).sponsorId, 'tokentails');
  // daily cap exhausted -> next
  assert.equal(allocate(['1'], mdFx([sponsorFx('motored', { remaining: 10_000n }), sponsorFx('tokentails')], g)).sponsorId, 'tokentails');
  // paused / not valid now (unavailable) -> next
  assert.equal(allocate(['1'], mdFx([sponsorFx('motored', { unavailable: 'paused in desk.json' }), sponsorFx('tokentails')], g)).sponsorId, 'tokentails');
  // a gift older than a sponsor's validFrom -> next
  assert.equal(allocate(['1'], mdFx([sponsorFx('motored', { validFromMs: (1_791_000_000 + 1) * 1000 }), sponsorFx('tokentails')], g)).sponsorId, 'tokentails');
  // none available -> rejected (the round holds)
  const none = allocate(['1'], mdFx([sponsorFx('motored', { float: 0n }), sponsorFx('tokentails', { budget: 1n })], g));
  assert.equal(none.ok, false);
  assert.equal(none.noSponsor, true);
  assert.match(none.reason, /no sponsor vault can pay it in full \(motored: float 0 < 0\.03; tokentails: budget 0\.000001 < 0\.03\)/);
  // each sponsor's own ratio and per-gift max decide its amount
  const half = allocate(['1'], mdFx([sponsorFx('motored', { ratioBps: 5000, perGiftMax: 10_000n })], g));
  assert.equal(half.amountMicro, 10_000n);
  assert.equal(half.clampedBy, 'perGiftMax');
  // sponsor-independent refusals are not retried on the next sponsor
  assert.match(allocate(['nope'], mdFx([sponsorFx('a'), sponsorFx('b')], g)).reason, /ineligible gift nope/);
});

test('allocation: the per-donor limit is desk-wide (what another sponsor matched counts)', () => {
  const g = [gift('2', FAN, 40_000n)];
  const used = { [`${FAN}|2026-10-03`]: 40_000n }; // matched earlier today by any vault
  const r = allocate(['2'], mdFx([sponsorFx('motored', { priority: 20 }), sponsorFx('tokentails')], g, used));
  assert.equal(r.amountMicro, 10_000n);
  assert.equal(r.sponsorId, 'motored');
  const full = allocate(['2'], mdFx([sponsorFx('motored'), sponsorFx('tokentails')], g, { [`${FAN}|2026-10-03`]: 50_000n }));
  assert.equal(full.ok, false);
  assert.match(full.reason, /donor limit reached/);
});

// ------------------------------------------------------------------ rounds on two vaults

test('two vaults: the first match comes from Motored.lt, the next falls to Token Tails when Motored.lt\'s budget is used', async () => {
  const logs = [fanGift(1), fanGift(2, { payer: FAN2, amount: 3n * E16 })];
  const c = await ctx({ raw: deskRaw({ a: { budgetUsdc: '0.03', perGiftMaxUsdc: '0.03' } }), logs });
  const calls = [];
  const exec = (hash) => (bin, args, o, cb) => {
    calls.push(args);
    okCast(hash)(bin, args, o, cb);
  };
  const r1 = await c.run({ mode: 'fork' }, { execImpl: exec(txh(0xd1)) });
  assert.equal(r1.code, EXIT.OK);
  assert.equal(r1.decision.sponsorId, 'motored');
  assert.equal(r1.decision.amountUsdc, '0.03');
  assert.equal(calls[0][1], SPENDER, "give() on Motored.lt's vault");
  assert.match(r1.envelope.memo, /^tt:agent:m:motored:[0-9a-f]{8}$/);
  assert.equal(r1.envelope.receipt.spender, SPENDER);
  assert.equal(r1.envelope.receipt.policySha256, c.desk.sponsors[0].policyHash);
  assert.equal(r1.record.matchDesk.vault, SPENDER);
  assert.match(describeMatch(r1), /from the Motored\.lt vault/);
  logs.push(agentGiftLog({ amount: 3n * E16, memo: r1.envelope.memo, tx: txh(0xd1), block: 199_950 }));

  const r2 = await c.run({ mode: 'fork' }, { execImpl: exec(txh(0xd2)) });
  assert.equal(r2.decision.sponsorId, 'tokentails');
  assert.equal(r2.decision.amountUsdc, '0.02');
  assert.equal(calls[1][1], SPENDER_B, "give() on Token Tails' vault");
  assert.match(r2.envelope.memo, /^tt:agent:m:tokentails:/);
  assert.equal(r2.envelope.receipt.policySha256, c.desk.sponsors[1].policyHash);
  assert.deepEqual(r2.obs.matchDesk.witness.reconciled, [r1.envelope.sha256]);
  assert.equal(r2.obs.matchDesk.sponsors[0].unavailable, "the sponsor's budget is used up");
  logs.push(agentGiftLog({ amount: 2n * E16, memo: r2.envelope.memo, tx: txh(0xd2), block: 199_951, spender: SPENDER_B }));

  // Rerun: both gifts are matched, one by each vault; nothing is matched twice.
  const r3 = await c.run({ mode: 'fork' }, { execImpl: () => { throw new Error('nothing may be sent'); }, llmFetch: noLlm });
  assert.equal(r3.decision.action, 'hold');
  assert.match(r3.decision.rationale, /no eligible gift/);
  assert.equal(r3.obs.matchDesk.witness.reconciled.length, 1);
  const envs = await receiptsIn(c.dir);
  assert.deepEqual(envs.map((e) => [e.receipt.sponsor, e.status]).sort(), [['motored', 'reconciled'], ['tokentails', 'reconciled']]);
  const facts = promptFactsMatch(r2.obs);
  assert.deepEqual(facts.sponsors.map((s) => [s.sponsor_id, s.available]), [['motored', false], ['tokentails', true]]);
  assert.match(facts.the_rule, /Code picks the paying sponsor/);
});

test('sponsor mismatch: a model that names another sponsor is refused, nothing is planned', async () => {
  const c = await ctx({ logs: [fanGift(1)], env: { TREAT_AGENT_FAKE_LLM: '0', ANTHROPIC_API_KEY: 'k' } });
  const id = `${txh(0xa001)}:0`;
  const r = await c.run({ mode: 'fork' }, { llmFetch: llmReply('match_gift', { gift_ids: [id], amount_usdc: '0.02', sponsor_id: 'tokentails', rationale: 'Use Token Tails.' }), execImpl: () => { throw new Error('nothing may be sent'); } });
  assert.equal(r.decision.action, 'hold');
  assert.equal(r.decision.rejected, true);
  assert.equal(r.decision.rationale, `Checker rejected: model named sponsor tokentails, the allocation rule picks motored for ${id}`);
  assert.equal(r.record.matchDesk.checker.reason, 'sponsor mismatch');
  assert.equal(r.record.matchDesk.checker.expectedSponsor, 'motored');
  assert.equal((await receiptsIn(c.dir)).length, 0);
  // Naming the right sponsor, or none (""), is accepted.
  for (const sponsorId of ['motored', '']) {
    const fresh = await ctx({ logs: [fanGift(1)], env: { TREAT_AGENT_FAKE_LLM: '0', ANTHROPIC_API_KEY: 'k' } });
    const ok = await fresh.run({}, { llmFetch: llmReply('match_gift', { gift_ids: [id], amount_usdc: '0.02', sponsor_id: sponsorId, rationale: 'Match.' }) });
    assert.equal(ok.decision.action, 'match', `${sponsorId}: ${ok.decision.rationale}`);
    assert.equal(ok.decision.sponsorId, 'motored');
  }
  const body = llmReply.lastBody;
  assert.ok(body.tools.find((t) => t.name === 'match_gift').input_schema.properties.sponsor_id);
  assert.match(body.messages[0].content, /"sponsor_id": "motored"/);
});

test('cross-vault idempotency: a gift matched by one vault (any layout of the state dir) is never matched by another', async () => {
  const logs = [fanGift(1)];
  // Motored.lt's vault is now empty: the gift would fall to Token Tails if it were not already matched.
  const c = await ctx({ logs, rpc: { float: 0n } });
  // A receipt from vault A, written by the v1 agent into its old one-vault state dir, reconciled on-chain.
  const v1dir = stateDir(c.deps.stateBase, 31337, SPENDER);
  const vaultA = c.desk.sponsors[0];
  const g = { id: `${txh(0xa001)}:0`, tx: txh(0xa001), logIndex: 0, block: 199_001, batchId: '1', kind: 'public', donor: FAN, day: '2026-10-03', giftMicro: 20_000n };
  const body = buildReceiptBody({ sponsor: vaultA, policyHash: vaultA.policyHash, unitDecimals: 18, check: { amountMicro: 20_000n, uncappedMicro: 20_000n, clampedBy: null, perGift: [{ id: g.id, matchMicro: 20_000n }], gifts: [g] } });
  const env = newEnvelope({ body, sponsorId: 'motored', mode: 'send', now: NOW_MS - 60_000, decision: { model: 'm', rationale: 'r', observationHash: 'sha256:x', checker: null } });
  env.status = 'sent';
  env.tx = { hash: txh(0xe1), block: 199_990, status: 'success' };
  await saveEnvelope(v1dir, env);
  logs.push(agentGiftLog({ amount: 2n * E16, memo: env.memo, tx: txh(0xe1), block: 199_990 }));
  const r = await c.run({ mode: 'fork' }, { llmFetch: noLlm, execImpl: () => { throw new Error('nothing may be sent'); } });
  const r2 = await (await ctx({ logs })).run({}, {}); // a fresh base never saw the receipt: the orphan holds every match
  assert.match(r2.decision.rationale, /no local receipt/);
  assert.equal(r.decision.action, 'hold');
  assert.equal(r.obs.matchDesk.gifts[0].status, 'matched');
  assert.equal(r.obs.matchDesk.witness.imported, 1);
  assert.deepEqual(r.obs.matchDesk.witness.reconciled, [env.sha256]);
  // The witness saved the reconciled receipt into the desk's own dir (the migration).
  const moved = await receiptsIn(c.dir);
  assert.deepEqual(moved.map((e) => [e.sha256, e.status]), [[env.sha256, 'reconciled']]);
});

test('per-donor limit across sponsors: what Motored.lt matched for a donor today limits Token Tails', async () => {
  const logs = [fanGift(1, { amount: 4n * E16 }), fanGift(2, { amount: 4n * E16 })];
  const c = await ctx({ raw: deskRaw({ a: { budgetUsdc: '0.04', perGiftMaxUsdc: '0.04' } }), logs });
  const r1 = await c.run({ mode: 'fork' }, { execImpl: okCast(txh(0xd1)) });
  assert.equal(r1.decision.sponsorId, 'motored');
  assert.equal(r1.decision.amountUsdc, '0.04');
  const r2 = await c.run({ mode: 'fork' }, { execImpl: okCast(txh(0xd2)) });
  assert.equal(r2.decision.sponsorId, 'tokentails');
  assert.equal(r2.decision.amountUsdc, '0.01', 'the donor has 0.01 of room left today across both sponsors');
  assert.equal(r2.obs.matchDesk.donorUsedMicro[`${FAN}|2026-10-03`], 40_000n);
});

test('code holds: no vault can pay (each one says why); an eligible gift no vault can pay in full', async () => {
  const c = await ctx({ logs: [fanGift(1)], rpc: { remaining: 0n }, vaultB: { float: 0n, remaining: 10n ** 17n } });
  const r = await c.run({}, { llmFetch: noLlm });
  assert.equal(r.decision.action, 'hold');
  assert.equal(r.decision.rationale, "Held by code: no sponsor vault can pay: motored: today's on-chain cap is used up (it resets at 00:00 UTC); tokentails: the vault float is empty.");
  // Motored.lt has only 0.01 left today, Token Tails is paused: the 0.02 gift fits no vault in full (never clamped).
  const c2 = await ctx({ raw: deskRaw({ b: { paused: true } }), logs: [fanGift(1)], rpc: { remaining: 10n ** 16n } });
  const r2 = await c2.run({}, { llmFetch: noLlm });
  assert.equal(matchCodeHold(r2.obs), 'no sponsor vault can pay any eligible gift in full today');
  assert.equal(r2.decision.action, 'hold');
  // paused in desk.json
  const c3 = await ctx({ raw: deskRaw({ a: { paused: true }, b: { paused: true } }), logs: [fanGift(1)] });
  assert.match((await c3.run({}, { llmFetch: noLlm })).decision.rationale, /motored: paused in desk\.json; tokentails: paused in desk\.json/);
});

test('guards: every vault must have the same agent, the same split and its own owner; init state names the vault', async () => {
  const diff = await ctx({ vaultB: { agent: '0x' + '98'.repeat(20) } });
  await assert.rejects(diff.run(), (e) => e instanceof GuardError && /agent/.test(e.message) && /tokentails/.test(e.message));
  const split = await ctx({ vaultB: { split: '0x' + '99'.repeat(20) } });
  await assert.rejects(split.run(), (e) => e instanceof GuardError && /split .*vault tokentails/.test(e.message));
  const owner = await ctx({ vaultB: { owner: OWNER } });
  await assert.rejects(owner.run(), (e) => e instanceof GuardError && /owner .*vault tokentails/.test(e.message));
  const noAgentRaw = deskRaw({ agent: null });
  const ok = await ctx({ raw: noAgentRaw, logs: [fanGift(1)] });
  assert.equal((await ok.run()).obs.matchDesk.desk.agent, AGENT);
  const init = validateDesk(deskRaw({ b: { spender: { address: null, deployBlock: null, owner: null } } }));
  await assert.rejects(matchRound({ desk: init, rpc: LOCAL }, { env: {} }), (e) => e instanceof GuardError && /tokentails \(init state\)/.test(e.message));
});

test('--demo-overcap --vault <id> targets that vault only; an unknown vault is refused', async () => {
  const c = await ctx({ vaultB: { remaining: 0n, spent: 20n * E16, daily: 20n * E16 } });
  let args;
  const exec = (_b, a, _o, cb) => {
    args = a;
    cb(new Error('exit 1'), '', `execution reverted, data: "0x92ec8899${(25n * E16).toString(16).padStart(64, '0')}${(20n * E16).toString(16).padStart(64, '0')}"`);
  };
  const r = await c.run({ mode: 'fork', demoOvercap: true, vault: 'tokentails', overcapKind: 'day' }, { execImpl: exec, llmFetch: noLlm });
  assert.equal(r.code, EXIT.OK);
  assert.equal(args[1], SPENDER_B);
  assert.equal(r.decision.memo, 'tt:agent:m:tokentails:demo-overcap');
  assert.equal(r.record.matchDesk.vault, SPENDER_B);
  const first = await c.run({ demoOvercap: true });
  assert.match(first.result.command, new RegExp(`^cast call ${SPENDER} `), 'default: the first vault');
  await assert.rejects(c.run({ demoOvercap: true, vault: 'acme' }), (e) => e instanceof GuardError && /--vault acme/.test(e.message));
});

test('propose_refund names one sponsor; its owner-only command uses that vault', async () => {
  const c = await ctx({ raw: deskRaw({ b: { refund: { after: '2026-10-01', to: 'owner' } } }), env: { TREAT_AGENT_FAKE_LLM: '0', ANTHROPIC_API_KEY: 'k' } });
  const bad = await c.run({}, { llmFetch: llmReply('propose_refund', { sponsor_id: 'motored', rationale: 'Over.' }) });
  assert.match(bad.decision.rationale, /propose_refund before policy\.refund\.after for motored/);
  const r = await c.run({}, { llmFetch: llmReply('propose_refund', { sponsor_id: '', rationale: 'Campaign over.' }) });
  assert.equal(r.decision.action, 'propose_refund');
  assert.equal(r.decision.sponsorId, 'tokentails');
  const p = JSON.parse(await readFile(path.join(c.dir, 'refund-proposal.json'), 'utf8'));
  assert.equal(p.sponsor, 'tokentails');
  assert.equal(p.command, `cast send ${SPENDER_B} 'withdraw(address)' ${OWNER_B} --rpc-url ${LOCAL} --account <sponsor-keystore>`);
});

// ------------------------------------------------------------------ statement per sponsor

test('statement: one section per sponsor, desk total paid to the shelter wallet, funding and float from the chain', async () => {
  const logs = [fanGift(1), fanGift(2, { payer: FAN2, amount: 3n * E16 })];
  const c = await ctx({ raw: deskRaw({ a: { budgetUsdc: '0.03', perGiftMaxUsdc: '0.03' } }), logs });
  const r1 = await c.run({ mode: 'fork' }, { execImpl: okCast(txh(0xd1)) });
  logs.push(agentGiftLog({ amount: 3n * E16, memo: r1.envelope.memo, tx: txh(0xd1), block: 199_950 }));
  const r2 = await c.run({ mode: 'fork' }, { execImpl: okCast(txh(0xd2)) });
  logs.push(agentGiftLog({ amount: 2n * E16, memo: r2.envelope.memo, tx: txh(0xd2), block: 199_951, spender: SPENDER_B }));
  await c.run({ witnessOnly: true });
  const envelopes = await receiptsIn(c.dir);
  const file = deskRaw({ a: { budgetUsdc: '0.03', perGiftMaxUsdc: '0.03' } });
  const onchain = {
    events: [
      { memo: r1.envelope.memo, amountRaw: '30000000000000000', tx: txh(0xd1), spender: SPENDER },
      { memo: r2.envelope.memo, amountRaw: '20000000000000000', tx: txh(0xd2), spender: SPENDER_B },
    ],
    vaults: {
      [SPENDER]: { fundedRaw: '1000000000000000000', withdrawnRaw: '0', givenRaw: '30000000000000000', floatRaw: '970000000000000000', unitDecimals: 18 },
      [SPENDER_B]: { fundedRaw: '1000000000000000000', withdrawnRaw: '0', givenRaw: '20000000000000000', floatRaw: '980000000000000000', unitDecimals: 18 },
    },
  };
  const st = buildStatement({ file, envelopes, now: '2026-10-03T05:00:00.000Z', onchain });
  assert.equal(st.v, 2);
  assert.equal(st.totals.paidToShelterUsdc, '0.05');
  assert.equal(st.totals.fundedUsdc, '2');
  assert.equal(st.totals.floatLeftUsdc, '1.95');
  const by = Object.fromEntries(st.sponsors.map((s) => [s.id, s]));
  assert.equal(by.motored.totals.reconciledUsdc, '0.03');
  assert.equal(by.tokentails.totals.reconciledUsdc, '0.02');
  assert.equal(by.motored.label, "related-party sponsor (founder's company)");
  assert.equal(by.tokentails.label, "operator's own money");
  assert.equal(by.tokentails.vault.spender, SPENDER_B);
  assert.equal(by.tokentails.onchain.floatLeftUsdc, '0.98');
  assert.equal(by.motored.policy.policySha256, c.desk.sponsors[0].policyHash, 'the statement and the agent agree on each policy hash');
  assert.equal(by.tokentails.policy.policySha256, c.desk.sponsors[1].policyHash);
  // Every disclaimer, one sponsor line each.
  const text = st.disclosures.join(' ');
  for (const m of [
    "Motored.lt is a related-party sponsor (founder's company). It is not an outside or independent sponsor.",
    "Token Tails runs this desk and matches with its own money (operator's own money). It is not an outside or independent sponsor.",
    'is held by Token Tails. Matched money reaches that wallet.',
    'up to 2x the daily cap can go out across midnight',
    "The agent's code enforces the per-donor limit. The contract does not.",
    'This statement is not a tax receipt.',
    'We do not use Circle Wallets, Paymaster or Gateway.',
    'one match is paid by one vault',
  ]) assert.ok(text.includes(m), m);
  const html = renderHtml(st).replace(/&#39;/g, "'");
  assert.match(html, /Motored\.lt, a related-party sponsor \(founder's company\), and Token Tails, with the operator's own money, match public gifts/);
  assert.match(html, /Paid to the shelter wallet \(reconciled matches\)/);
  assert.match(html, /id="s-motored"[\s\S]*Funded by the company[\s\S]*id="s-tokentails"/);
  assert.equal((html.match(/class="verify"/g) || []).length, 2);
  // A receipt claiming the other sponsor's vault is excluded.
  const wrong = structuredClone(envelopes[0]);
  wrong.receipt.sponsor = wrong.receipt.sponsor === 'motored' ? 'tokentails' : 'motored';
  const st2 = buildStatement({ file, envelopes: [wrong], now: '2026-10-03T05:00:00.000Z' });
  assert.equal(st2.totals.receipts, 0);
});

test('statement: a desk with one vault deployed keeps "not deployed yet" for the other; none deployed says so up top', async () => {
  const file = deskRaw({ b: { spender: { address: null, deployBlock: null, owner: null } } });
  const st = buildStatement({ file, envelopes: [] });
  assert.equal(st.sponsors.find((s) => s.id === 'tokentails').vault.spender, null);
  const html = renderHtml(st);
  assert.match(html, /id="s-tokentails"[\s\S]*Not deployed yet/);
  assert.match(html, /No reconciled matches yet\.[\s\S]*?Some vaults are not deployed yet\./);
  const none = buildStatement({ file: deskRaw({ a: { spender: { address: null, deployBlock: null, owner: null } }, b: { spender: { address: null, deployBlock: null, owner: null } } }), envelopes: [] });
  assert.match(renderHtml(none), /Not deployed yet\. No matches\./);
  assert.equal(none.totals.fundedUsdc, null);
});

test('a v1 published statement and a desk statement both keep their receipts matched (loadPublished)', async () => {
  const logs = [fanGift(1)];
  const c = await ctx({ logs });
  const r = await c.run();
  const env = { ...(await receiptsIn(c.dir))[0], status: 'reconciled' };
  const stmt = path.join(c.base, 'statement.json');
  await writeFile(stmt, JSON.stringify({ v: 2, sponsors: [{ id: 'motored', vault: { spender: SPENDER } }, { id: 'tokentails', vault: { spender: SPENDER_B } }], receipts: [env] }));
  const fresh = await ctx({ logs });
  const r2 = await fresh.run({}, { statementFile: stmt, llmFetch: noLlm });
  assert.equal(r2.obs.matchDesk.gifts[0].status, 'matched');
  assert.equal(r2.decision.action, 'hold');
  assert.ok(r);
});
