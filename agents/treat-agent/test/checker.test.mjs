import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedMatch, checkProposal, theRule } from '../lib/checker.mjs';
import { validateMatchDecision } from '../decide.mjs';

const A = '0x' + 'a1'.repeat(20);
const B = '0x' + 'b2'.repeat(20);
const DAY = '2026-10-15';

const gift = (id, donor, giftMicro, extra = {}) => ({
  id, tx: '0x' + id.padStart(64, '0'), logIndex: Number(extra.logIndex ?? 0), block: extra.block ?? 100, day: DAY,
  batchId: '1', kind: 'public', donor, giftMicro, status: 'eligible', ...extra,
});

function md({ gifts, used = {}, caps = {}, budget = 1_000_000n, policy = {} } = {}) {
  return {
    gifts,
    donorUsedMicro: used,
    caps: { perTxMicro: 50_000n, remainingTodayMicro: 200_000n, floatMicro: 1_000_000n, ...caps },
    budget: { leftMicro: budget },
    policy: { ratioBps: 10000, perGiftMaxMicro: 50_000n, perDonorDailyMaxMicro: 50_000n, treatsDailyMaxMicro: 30_000n, ...policy },
  };
}

test('ratio floor: 1:2 of an odd micro amount rounds down', () => {
  const r = expectedMatch(['1'], md({ gifts: [gift('1', A, 20_001n)], policy: { ratioBps: 5000 } }));
  assert.equal(r.ok, true);
  assert.equal(r.amountMicro, 10_000n);
  assert.equal(r.clampedBy, null);
});

test('per-donor limit across two gifts of the same donor and day (and earlier receipts)', () => {
  const m = md({ gifts: [gift('1', A, 30_000n, { block: 1 }), gift('2', A, 30_000n, { block: 2 })] });
  const r = expectedMatch(['2', '1'], m);
  assert.equal(r.amountMicro, 50_000n);
  assert.deepEqual(r.perGift.map((p) => [p.id, p.matchMicro]), [['1', 30_000n], ['2', 20_000n]]);
  assert.equal(r.uncappedMicro, 50_000n);
  const used = md({ gifts: [gift('1', A, 30_000n)], used: { [`${A}|${DAY}`]: 40_000n } });
  assert.equal(expectedMatch(['1'], used).amountMicro, 10_000n);
  const full = md({ gifts: [gift('1', A, 30_000n)], used: { [`${A}|${DAY}`]: 50_000n } });
  assert.deepEqual(expectedMatch(['1'], full), { ok: false, reason: 'donor limit reached for 1' });
  // another day is another room
  const other = md({ gifts: [gift('1', A, 30_000n)], used: { [`${A}|2026-10-14`]: 50_000n } });
  assert.equal(expectedMatch(['1'], other).amountMicro, 30_000n);
});

test('treats share one key and their own daily cap; the per-donor cap does not apply', () => {
  const m = md({ gifts: [gift('1', A, 10_000n, { kind: 'treat', block: 1 }), gift('2', B, 25_000n, { kind: 'treat', block: 2 })], policy: { perDonorDailyMaxMicro: 5_000n } });
  const r = expectedMatch(['1', '2'], m);
  assert.equal(r.amountMicro, 30_000n);
  assert.deepEqual(r.perGift.map((p) => p.matchMicro), [10_000n, 20_000n]);
});

test('each clampedBy: perGiftMax, perTx, remainingToday, float, budget; greedy allocation', () => {
  const two = [gift('1', A, 40_000n, { block: 1 }), gift('2', B, 40_000n, { block: 2 })];
  const cases = [
    [{}, 50_000n, 'perGiftMax'],
    [{ caps: { perTxMicro: 45_000n }, policy: { perGiftMaxMicro: 60_000n } }, 45_000n, 'perTx'],
    [{ caps: { remainingTodayMicro: 41_000n } }, 41_000n, 'remainingToday'],
    [{ caps: { floatMicro: 42_000n } }, 42_000n, 'float'],
    [{ budget: 43_000n }, 43_000n, 'budget'],
  ];
  for (const [over, amount, by] of cases) {
    const r = expectedMatch(['1', '2'], md({ gifts: two, ...over }));
    assert.equal(r.amountMicro, amount, by);
    assert.equal(r.clampedBy, by);
    assert.equal(r.uncappedMicro, 80_000n);
    assert.deepEqual(r.perGift.map((p) => p.matchMicro), [40_000n, amount - 40_000n], by);
  }
  // A clamp that leaves the second gift at 0 drops it from the receipt (it stays eligible).
  const r = expectedMatch(['1', '2'], md({ gifts: two, caps: { remainingTodayMicro: 40_000n } }));
  assert.deepEqual(r.perGift.map((p) => p.id), ['1']);
  assert.deepEqual(r.gifts.map((g) => g.id), ['1']);
});

test('ineligible, unknown, duplicate, empty and too many ids are rejected; nothing to match', () => {
  const m = md({ gifts: [gift('1', A, 10_000n), gift('2', A, 10_000n, { status: 'matched' })] });
  assert.equal(expectedMatch(['2'], m).reason, 'ineligible gift 2: matched');
  assert.equal(expectedMatch(['9'], m).reason, 'ineligible gift 9: unknown');
  assert.equal(expectedMatch(['1', '1'], m).reason, 'duplicate gift id');
  assert.equal(expectedMatch([], m).reason, 'no gift selected');
  assert.match(expectedMatch(Array.from({ length: 11 }, (_, i) => String(i)), m).reason, /at most 10/);
  assert.equal(expectedMatch(['1'], md({ gifts: [gift('1', A, 10_000n)], caps: { floatMicro: 0n } })).reason, 'nothing to match');
});

test('exact comparison: +1 / -1 micro and malformed strings are rejected, trailing zeros are fine', () => {
  assert.equal(checkProposal('0.02', 20_000n).ok, true);
  assert.equal(checkProposal('0.020000', 20_000n).ok, true);
  assert.deepEqual(checkProposal('0.020001', 20_000n), { ok: false, expectedMicro: '20000', proposedMicro: '20001' });
  assert.deepEqual(checkProposal('0.019999', 20_000n), { ok: false, expectedMicro: '20000', proposedMicro: '19999' });
  assert.equal(checkProposal('0.0200001', 20_000n).proposedMicro, null);
  assert.equal(checkProposal('2e-2', 20_000n).ok, false);
  assert.equal(checkProposal(0.02, 20_000n).ok, false);
  assert.match(theRule(md({ gifts: [] })), /1:1/);
});

test('validateMatchDecision rejects a 1-micro difference as a hold; it never corrects it', () => {
  const obs = { at: '2026-10-15T12:00:00Z', matchDesk: { ...md({ gifts: [gift('1', A, 20_000n)] }), refundAllowed: false } };
  const tu = (amount) => ({ type: 'tool_use', name: 'match_gift', input: { gift_ids: ['1'], amount_usdc: amount, rationale: 'Matching.' } });
  const ok = validateMatchDecision(tu('0.02'), obs);
  assert.equal(ok.action, 'match');
  assert.equal(ok.amountMicro, 20_000n);
  for (const wrong of ['0.020001', '0.019999']) {
    const d = validateMatchDecision(tu(wrong), obs);
    assert.equal(d.action, 'hold');
    assert.equal(d.rejected, true);
    assert.equal(d.checker.ok, false);
    assert.equal(d.rationale, `Checker rejected: model proposed ${wrong} USDC, policy gives 0.02 USDC for 1`);
    assert.equal(d.amountMicro, undefined);
  }
  const inel = validateMatchDecision({ type: 'tool_use', name: 'match_gift', input: { gift_ids: ['7'], amount_usdc: '0.02', rationale: 'x' } }, obs);
  assert.equal(inel.action, 'hold');
  assert.match(inel.rationale, /ineligible gift 7/);
});
