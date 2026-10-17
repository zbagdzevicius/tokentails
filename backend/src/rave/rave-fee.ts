/*
 * Card fee gross-up (cat-rave/CHECKOUT-SPEC.md section 8): the buyer's payment minus Stripe's fee covers
 * the donation, so Pink Paw gets the full amount. Integer cents only.
 *
 *   amountCents = coverFee ? ceil((donationCents + F) * 10000 / (10000 - bps)) : donationCents
 */

export interface RaveQuote {
    donationCents: number;
    feeCents: number;
    amountCents: number;
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

export function raveQuote(
    cats: number,
    coverFee: boolean,
    fee: { feePercentBps: number; feeFixedCents: number }
): RaveQuote {
    const donationCents = cats * 100;
    if (!coverFee) {
        return { donationCents, feeCents: 0, amountCents: donationCents };
    }
    const amountCents = ceilDiv((donationCents + fee.feeFixedCents) * 10000, 10000 - fee.feePercentBps);
    return { donationCents, feeCents: amountCents - donationCents, amountCents };
}
