/**
 * The verified-payment spend fields (plan G4). `spent` and `monthSpent` keep their USD meaning for
 * existing boards; `spentUsd` is the new figure, written only at verified USD payment sites (a
 * Stellar payment verified on Horizon and priced in USD, a Stripe PaymentIntent or Checkout Session
 * in USD). Grants, gifts and adoptions never add to them: the old +1 increments inflated `spent`.
 *
 * Users who paid before `spentUsd` existed get a legacy estimate from scripts/backfill-spent-usd.js
 * (dry run by default) in a separate field, `spentUsdLegacy`, so `spentUsd` stays verified-only.
 * The leaderboard shows `spentUsd + spentUsdLegacy`; impact and receipts read `spentUsd` only.
 */
export function spendIncrement(amountUsd: number): { spent: number; monthSpent: number; spentUsd: number } {
    const amount = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0;
    return { spent: amount, monthSpent: amount, spentUsd: amount };
}

/** Spend shown on the leaderboard: verified USD plus the legacy estimate, kept in separate fields. */
export function leaderboardSpentUsd(user: { spentUsd?: number | null; spentUsdLegacy?: number | null }): number {
    const verified = Number(user?.spentUsd) || 0;
    const legacy = Number(user?.spentUsdLegacy) || 0;
    return Math.round((Math.max(0, verified) + Math.max(0, legacy)) * 100) / 100;
}

const SPEND_FIELDS = ['spent', 'monthSpent', 'spentUsd'] as const;

/**
 * Update pipeline that takes a refunded order's spend back, floored at 0 (3c review). A plain `$inc`
 * of minus the amount can leave a field negative when it was lowered after the payment: today only a
 * manual fix-up does that (`monthSpent` is not in the monthly reset), but a reset of `monthSpent`
 * between payment and refund would do it too.
 */
export function spendRefundPipeline(amountUsd: number): Record<string, unknown>[] {
    const back = spendIncrement(amountUsd);
    const $set: Record<string, unknown> = {};
    for (const field of SPEND_FIELDS) {
        $set[field] = { $max: [0, { $subtract: [{ $ifNull: [`$${field}`, 0] }, back[field]] }] };
    }
    return [{ $set }];
}
