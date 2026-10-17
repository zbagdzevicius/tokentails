import { Model } from 'mongoose';
import { CryptoCheckoutDocument } from 'src/payments/crypto/crypto-checkout.schema';

/*
 * Refunds and disputes against a Moon Rave keeper row (a rave order's payout or an ad's shelter share).
 *
 * The row is marked `shelterShare.reversed` whatever its state, so the keeper never sends it again even if
 * it later goes back to `due` (a reverted tx, a definite send error, a stale lock): the keeper voids
 * reversed rows and refuses to sign one (CryptoShelterShareService). Only `confirmed` means the shelter
 * was paid; `failed` was never paid automatically and is voided here like `due`.
 */

export type ShareReversal =
    /** No keeper row (never queued): nothing to undo. */
    | 'none'
    /** The row is void: nothing left or will leave. */
    | 'voided'
    /** `sending` / `sent`: the tx may land; if it comes back to `due` the keeper voids it. */
    | 'in-flight'
    /** `confirmed`: the shelter has the money; Token Tails absorbs the refund. */
    | 'paid';

/**
 * `cardIntent` null: a crypto-paid row (a USDC ad's share), which has no card intent; it is then matched by
 * `orderId` alone (unique on the collection) among rows without one.
 */
export async function reverseShare(
    checkouts: Model<CryptoCheckoutDocument>,
    orderId: string,
    cardIntent: string | null,
    why: string,
    now: Date = new Date()
): Promise<{ outcome: ShareReversal; state?: string }> {
    const key: Record<string, unknown> = cardIntent
        ? { orderId, cardIntent }
        : { orderId, cardIntent: { $exists: false } };
    const marked: any = await checkouts.updateOne(key, {
        $set: { 'shelterShare.reversed': why, 'shelterShare.reversedAt': now },
    });
    if (marked && marked.matchedCount === 0) return { outcome: 'none' };
    const voided: any = await checkouts
        .findOneAndUpdate(
            { ...key, 'shelterShare.state': { $in: ['due', 'failed'] } },
            {
                $set: {
                    'shelterShare.state': 'void',
                    'shelterShare.evidenceTier': null,
                    'shelterShare.voidReason': why,
                },
            },
            { new: true }
        )
        .lean();
    if (voided) return { outcome: 'voided', state: 'void' };
    const row: any = await checkouts.findOne(key).lean();
    const state = row?.shelterShare?.state;
    if (!row) return { outcome: 'none' };
    if (state === 'void') return { outcome: 'voided', state };
    if (state === 'confirmed') return { outcome: 'paid', state };
    return { outcome: 'in-flight', state };
}

/**
 * A partial refund before the payout: the row's amount shrinks to `keepCents` (never grows). Returns
 * whether the row still waited (`due`, not reversed) and was reduced or already at most that amount.
 */
export async function shrinkShare(
    checkouts: Model<CryptoCheckoutDocument>,
    orderId: string,
    cardIntent: string,
    keepCents: number
): Promise<boolean> {
    const base = { orderId, cardIntent, 'shelterShare.state': 'due', 'shelterShare.reversed': { $exists: false } };
    await checkouts.updateOne(
        { ...base, 'shelterShare.amountUsdCents': { $gt: keepCents } },
        { $set: { 'shelterShare.amountUsdCents': keepCents } }
    );
    return !!(await checkouts.findOne({ ...base, 'shelterShare.amountUsdCents': { $lte: keepCents } }).lean());
}
