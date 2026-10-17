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
export function expectedMatch(selectedIds, md, { fit = false } = {}) {
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

  // fit (the desk's allocation): only the sponsor's per-gift max and the vault's per-gift cap clamp the
  // amount; it must then fit the vault's day, float and the sponsor's budget in full, else this sponsor
  // cannot pay it (the next one may). Without fit (one view, legacy) every limit clamps.
  const fits = [
    ['remainingToday', md.caps.remainingTodayMicro],
    ['float', md.caps.floatMicro],
    ['budget', md.budget.leftMicro],
  ];
  const limits = [['perGiftMax', p.perGiftMaxMicro], ['perTx', md.caps.perTxMicro], ...(fit ? [] : fits)];
  let limit = limits[0];
  for (const l of limits) if (l[1] < limit[1]) limit = l;
  const amount = uncapped < limit[1] ? uncapped : limit[1];
  const clampedBy = amount < uncapped ? limit[0] : null;
  if (amount <= 0n) return reject('nothing to match');
  if (fit) {
    for (const [name, have] of fits) {
      if (have < amount) return { ok: false, unfit: true, reason: `${name} ${formatMicro(have)} < ${formatMicro(amount)}`, amountMicro: amount };
    }
  }

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

/** The view of the desk one sponsor sees: its ratio, per-gift max, vault caps and budget. */
export function sponsorView(md, s) {
  return {
    ...md,
    policy: { ...md.policy, ratioBps: s.policy.ratioBps, perGiftMaxMicro: s.policy.perGiftMaxMicro },
    caps: s.caps,
    budget: s.budget,
  };
}

/**
 * The desk's allocation rule (code, not the model). For the selected gifts, the paying sponsor is the
 * first one in md.sponsors order (highest priority, then lowest id) that is not paused, is valid now and
 * for every selected gift (gift time >= its validFrom), and whose vault can pay the whole amount: budget
 * left, float and remainingToday each >= the amount. One selection is paid by exactly one vault; it is
 * never split across vaults and never clamped to what a vault has left.
 * -> { ok: true, sponsorId, amountMicro, perGift, uncappedMicro, clampedBy, gifts, skipped: [{id, reason}] }
 *  | { ok: false, reason, skipped }
 * Without md.sponsors (a single legacy view) it is expectedMatch(selectedIds, md).
 */
export function allocate(selectedIds, md) {
  if (!Array.isArray(md.sponsors)) return expectedMatch(selectedIds, md);
  const skipped = [];
  for (const s of md.sponsors) {
    if (s.unavailable) {
      skipped.push({ id: s.id, reason: s.unavailable });
      continue;
    }
    const r = expectedMatch(selectedIds, sponsorView(md, s), { fit: true });
    if (!r.ok && !r.unfit) return { ...r, skipped };
    if (!r.ok) {
      skipped.push({ id: s.id, reason: r.reason });
      continue;
    }
    const early = r.gifts.find((g) => Number.isSafeInteger(g.ts) && g.ts * 1000 < s.policy.validFromMs);
    if (early) {
      skipped.push({ id: s.id, reason: `gift ${early.id} is older than this sponsor's validFrom` });
      continue;
    }
    return { ...r, sponsorId: s.id, skipped };
  }
  const why = skipped.map((x) => `${x.id}: ${x.reason}`).join('; ');
  return { ok: false, reason: `no sponsor vault can pay it in full (${why || 'no sponsors'})`, skipped, noSponsor: true };
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
  if (Array.isArray(md.sponsors) && md.sponsors.length > 1) {
    return (
      'Code picks the paying sponsor (sponsor_id): the first in sponsors order (highest priority, then lowest id) that is available ' +
      "and whose vault can pay the whole amount (budget_left_usdc, float_usdc and remaining_today_usdc each at least the amount). " +
      'One match is paid by exactly one vault. amount_usdc must equal, exactly: for each selected gift in (block, logIndex) order, ' +
      "floor(gift_usdc × that sponsor's ratio) limited by the donor's room today (per_donor_daily_max_usdc minus what the donor " +
      'already got matched that UTC day by any sponsor, counting earlier gifts in the same selection), summed, then capped at the ' +
      "smaller of that sponsor's per_gift_max_usdc and per_tx_cap_usdc. For one gift alone this is its match_if_alone_usdc and its " +
      'sponsor_id. Any other amount or sponsor is rejected and nothing is sent.'
    );
  }
  const ratio = md.policy.ratioBps === 10000 ? '1:1' : `${md.policy.ratioBps / 10000}:1`;
  return (
    `amount_usdc must equal, exactly: for each selected gift in (block, logIndex) order, floor(gift_usdc × ${ratio} ratio) ` +
    "limited by that donor's room today (per_donor_daily_max_usdc minus what the donor already got matched that UTC day, " +
    'counting earlier gifts in the same selection), summed, then capped at the smallest of per_gift_max_usdc, per_tx_cap_usdc' +
    (Array.isArray(md.sponsors) ? '; remaining_today_usdc, float_usdc and budget_left_usdc must each cover that amount in full, else nothing can be matched'
      : ', remaining_today_usdc, float_usdc and budget_left_usdc') +
    '. For one gift alone this is its match_if_alone_usdc. Any other amount is rejected and nothing is sent.'
  );
}

export { formatMicro };
