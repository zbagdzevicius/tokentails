import { FACTS } from './facts.generated';

/*
 * Purchase pledge (plan G4 "Purchase pledge", decision #27). For every COMPLETE order placed on or
 * after `C-purchase_share.effectiveAt`, Token Tails pledges `bps` of its USD price to shelters; each
 * month shows pledged against paid and the shortfall. Nothing is pledged for earlier orders.
 *
 * The share and the date come only from the facts registry (`purchase_share`, C-002), read through
 * the generated backend copy. Until that entry is public with a value and an `effectiveAt`, the
 * pledge is `not-started` and the table is empty: no surface can claim a pledge nobody decided.
 * All sums are USD cents (no mixed currencies); rows carry USD in 18-decimal units like every other
 * amount in the snapshot.
 */

export const PLEDGE_SYMBOL = 'USD';
/** USD cents to 18-decimal units. */
const CENT_WEI = BigInt('10000000000000000');

export interface PledgeConfig {
    bps: number;
    effectiveAt: string;
}

export type PledgeStatus = 'not-started' | 'scheduled' | 'active';

export interface PledgeRow {
    month: string;
    symbol: typeof PLEDGE_SYMBOL;
    pledgedWei: string;
    paidWei: string;
    shortfallWei: string;
    orders: number;
}

export interface PledgeTable {
    status: PledgeStatus;
    bps: number | null;
    effectiveAt: string | null;
    rows: PledgeRow[];
}

/** Reads `purchase_share` from a facts table. `value` is a percent ("5" is 500 bps). */
export function pledgeConfigFromFacts(facts: Record<string, any> = FACTS as Record<string, any>): PledgeConfig | null {
    const fact = Object.values(facts || {}).find(entry => entry && entry.key === 'purchase_share');
    if (!fact) {
        return null;
    }
    const percent = Number(fact.value);
    const bps = Math.round(percent * 100);
    const effectiveAt = String(fact.effectiveAt || '');
    if (!Number.isFinite(percent) || bps <= 0 || bps > 10000) {
        return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveAt) || Number.isNaN(Date.parse(`${effectiveAt}T00:00:00Z`))) {
        return null;
    }
    return { bps, effectiveAt };
}

/** The pledge on `usdCents` of sales, rounded up so it is never understated. */
export function pledgedCents(usdCents: number, bps: number): number {
    return Math.ceil((Math.max(0, Math.round(usdCents)) * bps) / 10000);
}

export function pledgeStatus(config: PledgeConfig | null, now: Date): PledgeStatus {
    if (!config) {
        return 'not-started';
    }
    return now.getTime() < Date.parse(`${config.effectiveAt}T00:00:00Z`) ? 'scheduled' : 'active';
}

/**
 * Rows from monthly sales (`YYYY-MM` -> USD cents and order count) and monthly payments (USD cents),
 * newest month first. A month with payments but no sales still shows (an early payment).
 */
export function pledgeRows(
    sales: Map<string, { cents: number; orders: number }>,
    paid: Map<string, number>,
    bps: number
): PledgeRow[] {
    const months = [...new Set([...sales.keys(), ...paid.keys()])].filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
    return months.reverse().map(month => {
        const pledged = pledgedCents(sales.get(month)?.cents || 0, bps);
        const paidCents = Math.max(0, Math.round(paid.get(month) || 0));
        return {
            month,
            symbol: PLEDGE_SYMBOL,
            pledgedWei: (BigInt(pledged) * CENT_WEI).toString(),
            paidWei: (BigInt(paidCents) * CENT_WEI).toString(),
            shortfallWei: (BigInt(Math.max(0, pledged - paidCents)) * CENT_WEI).toString(),
            orders: sales.get(month)?.orders || 0,
        };
    });
}
