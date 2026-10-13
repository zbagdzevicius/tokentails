import { test } from 'node:test';
import assert from 'node:assert/strict';
import { witness, decodeAgentGift, readAgentGifts } from '../lib/witness.mjs';
import { newEnvelope, buildReceiptBody, setStatus } from '../lib/receipt.mjs';
import { validateSponsor } from '../lib/policy.mjs';
import { agentGiftLog, sponsorRaw, txh } from '../test-support/helpers.mjs';

const sponsor = validateSponsor(sponsorRaw());
const T0 = Date.parse('2026-10-15T10:00:00Z');

function env(giftNo, amountMicro, { mode = 'fork', status = 'planned', txHash = null, at = T0 } = {}) {
  const gifts = [{ id: `${txh(giftNo)}:0`, tx: txh(giftNo), logIndex: 0, block: 100, batchId: '1', kind: 'public', donor: '0x' + 'd0'.repeat(20), day: '2026-10-15', giftMicro: amountMicro }];
  const body = buildReceiptBody({ sponsor, policyHash: 'f'.repeat(64), unitDecimals: 18, check: { amountMicro, uncappedMicro: amountMicro, clampedBy: null, perGift: [{ id: gifts[0].id, matchMicro: amountMicro }], gifts } });
  const e = newEnvelope({ body, sponsorId: 'motored', mode, decision: null, now: at });
  if (status !== 'planned') setStatus(e, status, { tx: { hash: txHash, block: null, status: null } }, at);
  return e;
}
const ev = (e, amountRaw = BigInt(e.receipt.amountRaw), tx = txh(0xee)) =>
  decodeAgentGift(agentGiftLog({ batchId: 9, amount: amountRaw, memo: e.memo, spent: amountRaw, tx, block: 300, logIndex: 4 }));

test('decodeAgentGift reads batchId, amount, memo, spentToday', () => {
  const d = decodeAgentGift(agentGiftLog({ batchId: 45, amount: 5n * 10n ** 16n, memo: 'tt:agent:m:motored:1a2b3c4d', spent: 10n ** 17n, tx: txh(1), block: 7, logIndex: 2 }));
  assert.deepEqual(d, { batchId: '45', amountRaw: '50000000000000000', memo: 'tt:agent:m:motored:1a2b3c4d', spentTodayRaw: '100000000000000000', tx: txh(1), block: 7, logIndex: 2 });
});

test('reconcile by memo and amount, from any mode (a hand-run dry-run command too)', async () => {
  const a = env(1, 20_000n, { mode: 'dry-run' });
  const b = env(2, 30_000n, { status: 'sent', txHash: txh(0xee) });
  const { summary, changed } = await witness({ envelopes: [a, b], events: [ev(a), ev(b)], sponsorId: 'motored', now: T0 + 60_000, ttlMinutes: 30 });
  assert.equal(a.status, 'reconciled');
  assert.equal(b.status, 'reconciled');
  assert.equal(a.witness.batchId, '9');
  assert.equal(a.witness.amountRaw, a.receipt.amountRaw);
  assert.equal(a.witness.reconciledAt, new Date(T0 + 60_000).toISOString());
  assert.deepEqual(summary.reconciled, [a.sha256, b.sha256]);
  assert.equal(changed.length, 2);
});

test('mismatch: same memo, different amount -> mismatch and a collision', async () => {
  const a = env(1, 20_000n, { status: 'sent', txHash: txh(5) });
  const { summary } = await witness({ envelopes: [a], events: [ev(a, 1n)], sponsorId: 'motored', now: T0, ttlMinutes: 30 });
  assert.equal(a.status, 'mismatch');
  assert.deepEqual(summary.collisions, [a.sha256]);
});

test('failed tx: a sent envelope whose receipt has status 0x0', async () => {
  const a = env(1, 20_000n, { status: 'sent', txHash: txh(5) });
  const { summary } = await witness({ envelopes: [a], events: [], sponsorId: 'motored', now: T0, ttlMinutes: 30, getTxReceipt: async () => ({ status: '0x0', blockNumber: '0x10' }) });
  assert.equal(a.status, 'failed');
  assert.equal(a.tx.block, 16);
  assert.deepEqual(summary.failed, [a.sha256]);
});

test('a sent tx with no receipt after the TTL stays sent and is reported as stuck', async () => {
  const a = env(1, 20_000n, { status: 'sent', txHash: txh(5) });
  const { summary } = await witness({ envelopes: [a], events: [], sponsorId: 'motored', now: T0 + 31 * 60_000, ttlMinutes: 30, getTxReceipt: async () => null });
  assert.equal(a.status, 'sent');
  assert.deepEqual(summary.stuck, [a.sha256]);
});

test('expiry: planned with no event and no tx after plannedTtlMinutes; a later event still reconciles it', async () => {
  const a = env(1, 20_000n, { mode: 'dry-run' });
  let r = await witness({ envelopes: [a], events: [], sponsorId: 'motored', now: T0 + 29 * 60_000, ttlMinutes: 30 });
  assert.equal(a.status, 'planned');
  r = await witness({ envelopes: [a], events: [], sponsorId: 'motored', now: T0 + 31 * 60_000, ttlMinutes: 30 });
  assert.equal(a.status, 'expired');
  assert.deepEqual(r.summary.expired, [a.sha256]);
  await witness({ envelopes: [a], events: [ev(a)], sponsorId: 'motored', now: T0 + 40 * 60_000, ttlMinutes: 30 });
  assert.equal(a.status, 'reconciled');
});

test('orphans: our sponsor memo with no envelope; other memos are ignored', async () => {
  const stray = decodeAgentGift(agentGiftLog({ amount: 1n, memo: 'tt:agent:m:motored:deadbeef', tx: txh(7) }));
  const other = decodeAgentGift(agentGiftLog({ amount: 1n, memo: 'tt:agent:match-12345678', tx: txh(8) }));
  const { summary } = await witness({ envelopes: [], events: [stray, other], sponsorId: 'motored', now: T0, ttlMinutes: 30 });
  assert.deepEqual(summary.orphans, [{ memo: 'tt:agent:m:motored:deadbeef', tx: txh(7) }]);
});

test('readAgentGifts filters the AgentGift topic and sorts oldest first', async () => {
  const logs = [
    agentGiftLog({ amount: 2n, memo: 'tt:agent:b', tx: txh(2), block: 20 }),
    agentGiftLog({ amount: 1n, memo: 'tt:agent:a', tx: txh(1), block: 10 }),
    { topics: ['0x' + '00'.repeat(32)], data: '0x', transactionHash: txh(3), blockNumber: '0x1' },
  ];
  const got = await readAgentGifts({ getLogs: async () => logs, spender: '0x', fromBlock: 0, toBlock: 30 });
  assert.deepEqual(got.map((e) => e.memo), ['tt:agent:a', 'tt:agent:b']);
});
