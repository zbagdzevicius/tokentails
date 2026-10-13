// The amount checker: pure, bigint micro-USDC. It recomputes the match amount from the written policy.
// A model decision whose amount differs by even 1 micro-USDC is REJECTED, never corrected.
// See MATCH-DESK.md, "The amount checker".

import { MICRO_RE, parseMicro, formatMicro } from './abi.mjs';

export const MAX_GIFTS_PER_MATCH = 10;
export const TREATS_KEY = 'treats';

/** The per-donor key: sponsored treats share one key and their own daily cap. */
export const donorKeyOf = (g) => (g.kind === 'treat' ? TREATS_KEY : g.donor);

const reject = (reason) => ({ ok: false, reason });
const min = (...xs) => xs.reduce((a, b) => (b < a ? b : a));

/**
 * expectedMatch(selectedIds, md) -> { ok: true, amountMicro, perGift, uncappedMicro, clampedBy, gifts }
 *                                 | { ok: false, reason }
 * `md` is obs.matchDesk: gifts[], donorUsedMicro { "<donor>|<day>": bigint }, caps, budget, policy.
 * Gifts that the clamp leaves at 0 are dropped from perGift (they stay eligible); a gift that is in a
 * receipt is matched once, possibly in part, and its remainder is never matched later.
 */
export function expectedMatch(selectedIds, md) {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return reject('no gift selected');
  if (selectedIds.length > MAX_GIFTS_PER_MATCH) return reject(`at most ${MAX_GIFTS_PER_MATCH} gifts per match`);
  if (new Set(selectedIds).size !== selectedIds.length) return reject('duplicate gift id');
  const byId = new Map(md.gifts.map((g) => [g.id, g]));
  const picked = [];
  for (const id of selectedIds) {
    const g = byId.get(id);
    if (!g) return reject(`ineligible gift ${id}: unknown`);
    if (g.status !== 'eligible') return reject(`ineligible gift ${id}: ${g.status}`);
    picked.push(g);
  }
  picked.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

  const p = md.policy;
  const used = new Map(Object.entries(md.donorUsedMicro || {}).map(([k, v]) => [k, BigInt(v)]));
  const rows = [];
  let uncapped = 0n;
  for (const g of picked) {
    const key = donorKeyOf(g);
    const usedKey = `${key}|${g.day}`;
    const base = (BigInt(g.giftMicro) * BigInt(p.ratioBps)) / 10000n;
    const cap = key === TREATS_KEY ? p.treatsDailyMaxMicro : p.perDonorDailyMaxMicro;
    let room = cap - (used.get(usedKey) || 0n);
    if (room < 0n) room = 0n;
    const m = min(base, room);
    if (m === 0n) return reject(`donor limit reached for ${g.id}`);
    used.set(usedKey, (used.get(usedKey) || 0n) + m);
    uncapped += m;
    rows.push({ g, m });
  }

  const limits = [
    ['perGiftMax', p.perGiftMaxMicro],
    ['perTx', md.caps.perTxMicro],
    ['remainingToday', md.caps.remainingTodayMicro],
    ['float', md.caps.floatMicro],
    ['budget', md.budget.leftMicro],
  ];
  let limit = limits[0];
  for (const l of limits) if (l[1] < limit[1]) limit = l;
  const amount = uncapped < limit[1] ? uncapped : limit[1];
  const clampedBy = amount < uncapped ? limit[0] : null;
  if (amount <= 0n) return reject('nothing to match');

  let left = amount;
  const perGift = [];
  const gifts = [];
  for (const { g, m } of rows) {
    const take = m < left ? m : left;
    left -= take;
    if (take === 0n) continue;
    perGift.push({ id: g.id, matchMicro: take });
    gifts.push(g);
  }
  return { ok: true, amountMicro: amount, perGift, uncappedMicro: uncapped, clampedBy, gifts };
}

/**
 * Compare the model's amount_usdc string with the checker's amount, exactly (no floats).
 * -> { ok, expectedMicro, proposedMicro }  (proposedMicro null when the string is not a valid amount)
 */
export function checkProposal(amountUsdc, expectedMicro) {
  let proposed = null;
  if (typeof amountUsdc === 'string' && MICRO_RE.test(amountUsdc)) proposed = parseMicro(amountUsdc);
  return {
    ok: proposed !== null && proposed === expectedMicro,
    expectedMicro: expectedMicro.toString(),
    proposedMicro: proposed === null ? null : proposed.toString(),
  };
}

/** The checker formula in one sentence, for the model (`the_rule`). */
export function theRule(md) {
  const ratio = md.policy.ratioBps === 10000 ? '1:1' : `${md.policy.ratioBps / 10000}:1`;
  return (
    `amount_usdc must equal, exactly: for each selected gift in (block, logIndex) order, floor(gift_usdc × ${ratio} ratio) ` +
    "limited by that donor's room today (per_donor_daily_max_usdc minus what the donor already got matched that UTC day, " +
    'counting earlier gifts in the same selection), summed, then capped at the smallest of per_gift_max_usdc, per_tx_cap_usdc, ' +
    'remaining_today_usdc, float_usdc and budget_left_usdc. For one gift alone this is its match_if_alone_usdc. ' +
    'Any other amount is rejected and nothing is sent.'
  );
}

export { formatMicro };
