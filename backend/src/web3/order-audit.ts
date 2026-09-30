import { MAX_DISCOUNT_PERCENTAGE, applyDiscountCents } from 'src/payments/price-table';
import { getOrderCatalogueCents } from './order-catalogue';
import {
    canonicalStellarHash,
    checkStellarPayment,
    expectedStellarAsset,
    HorizonOperation,
    HorizonTransaction,
    isStellarTxHash,
    stroopsToUnits,
    toStroops,
} from './stellar-payment';
import { ChainType } from './web3.model';

/**
 * Pure checks behind scripts/audit-orders.js (platform fix 0). The script reads orders and Horizon
 * data; these functions only classify them. Results carry order ids and amounts, never the user,
 * email, wallet address or payment hash.
 */

/** The order fields the audit reads. The script projects exactly these. */
export interface AuditOrder {
    _id: { toString(): string } | string;
    hash?: string;
    status?: string;
    chainType?: string;
    currencyType?: string;
    entityType?: string;
    id?: unknown;
    price?: number;
    priceUsd?: number;
    discount?: string;
}

export const AUDIT_ORDER_PROJECTION =
    'hash status chainType currencyType entityType id price priceUsd discount createdAt';

export interface AuditFinding {
    orderId: string;
    issue: string;
    paid?: number;
    expectedMin?: number;
}

const orderIdOf = (order: AuditOrder) => order._id.toString();

/**
 * Groups orders sharing a non-empty hash (the filter of the `hash_unique` index). Every group
 * blocks the index build and is a possible double grant.
 */
export function findDuplicateHashes(orders: AuditOrder[]): string[][] {
    const byHash = new Map<string, string[]>();
    for (const order of orders) {
        if (typeof order.hash !== 'string' || order.hash === '') {
            continue;
        }
        const ids = byHash.get(order.hash) || [];
        ids.push(orderIdOf(order));
        byHash.set(order.hash, ids);
    }
    return [...byHash.values()].filter(ids => ids.length > 1);
}

/** Catalogue cents a buyer may legitimately have paid: full price, or less when a code was used. */
function acceptedCents(baseCents: number, discount?: string): number[] {
    if (!discount) {
        return [baseCents];
    }
    return [baseCents, applyDiscountCents(baseCents, 10), applyDiscountCents(baseCents, MAX_DISCOUNT_PERCENTAGE)];
}

/**
 * Stripe orders (chainType FIAT) whose stored USD amount is not a catalogue price.
 * BELOW_CATALOGUE is money missing; ABOVE_CATALOGUE is usually the $400 vs $350 Legendary pack
 * discrepancy noted in src/payments/price-table.ts.
 */
export function auditStripeOrder(order: AuditOrder): AuditFinding | null {
    if (order.chainType !== ChainType.FIAT) {
        return null;
    }
    const baseCents = getOrderCatalogueCents(order);
    const paidCents = Math.round((order.priceUsd ?? order.price ?? 0) * 100);
    if (baseCents === null) {
        return { orderId: orderIdOf(order), issue: 'UNKNOWN_ITEM', paid: paidCents / 100 };
    }
    const accepted = acceptedCents(baseCents, order.discount);
    if (accepted.some(cents => Math.abs(cents - paidCents) <= 1)) {
        return null;
    }
    const minimum = Math.min(...accepted);
    return {
        orderId: orderIdOf(order),
        issue: paidCents < minimum ? 'BELOW_CATALOGUE' : 'ABOVE_CATALOGUE',
        paid: paidCents / 100,
        expectedMin: minimum / 100,
    };
}

export interface StellarAuditOptions {
    treasury: string;
    /**
     * No historical XLM rate is stored, so XLM orders are valued at this generous USD rate.
     * Only orders underpaid even at this rate are flagged as UNDERPAID.
     */
    maxXlmUsd: number;
}

/**
 * Checks one Stellar order against its Horizon transaction with the live verifier's rules:
 * successful, pays the treasury, in the order's asset, and covers the catalogue price.
 * `horizon` is null when Horizon has no such transaction.
 */
export function auditStellarOrder(
    order: AuditOrder,
    horizon: { transaction: HorizonTransaction; operations: HorizonOperation[] } | null,
    options: StellarAuditOptions
): AuditFinding[] {
    if (order.chainType !== ChainType.STELLAR) {
        return [];
    }
    const orderId = orderIdOf(order);
    if (!isStellarTxHash(order.hash)) {
        return [{ orderId, issue: 'INVALID_HASH' }];
    }
    const asset = expectedStellarAsset(order.currencyType);
    if (!asset) {
        return [{ orderId, issue: 'UNSUPPORTED_CURRENCY' }];
    }
    if (!horizon) {
        return [{ orderId, issue: 'TX_NOT_FOUND' }];
    }
    // Same rule as the live verifier: an order must hold the payment's outer (fee-bump) hash.
    // Orders holding the inner hash may share one payment with another order; see
    // findSameStellarPayment for the pairs.
    const canonical = canonicalStellarHash(horizon.transaction);
    const nonCanonical = canonical !== undefined && canonical !== order.hash;

    const baseCents = getOrderCatalogueCents(order);
    const minCents = baseCents === null ? 0 : Math.min(...acceptedCents(baseCents, order.discount));
    // Destination and asset first, amount checked below with the audit's own XLM valuation.
    const check = checkStellarPayment({
        transaction: horizon.transaction,
        operations: horizon.operations,
        destination: options.treasury,
        asset,
        minStroops: 0,
    });
    if (!check.ok) {
        return [{ orderId, issue: check.reason! }];
    }

    const findings: AuditFinding[] = nonCanonical ? [{ orderId, issue: 'NOT_CANONICAL_HASH' }] : [];
    const paid = stroopsToUnits(check.paidStroops);
    if (baseCents === null) {
        findings.push({ orderId, issue: 'UNKNOWN_ITEM', paid });
    } else {
        const paidUsd = asset.type === 'native' ? paid * options.maxXlmUsd : paid;
        if (Math.round(paidUsd * 100) < minCents) {
            findings.push({ orderId, issue: 'UNDERPAID', paid, expectedMin: minCents / 100 });
        }
    }
    // Before fix 1 the stored price was the client's claim; paying less than claimed is a red flag.
    if (typeof order.price === 'number' && check.paidStroops < toStroops(order.price)) {
        findings.push({ orderId, issue: 'BELOW_CLAIMED_PRICE', paid, expectedMin: order.price });
    }
    return findings;
}

/**
 * Groups Stellar orders that hold different hash strings for one payment: a fee-bump's inner and
 * outer hash, or the same hash in different letter case. The unique index cannot see these, and
 * each group is a possible double grant. `canonical` is canonicalStellarHash of the Horizon record.
 */
export function findSameStellarPayment(entries: Array<{ orderId: string; canonical?: string }>): string[][] {
    const byPayment = new Map<string, string[]>();
    for (const { orderId, canonical } of entries) {
        if (!canonical) {
            continue;
        }
        const ids = byPayment.get(canonical) || [];
        ids.push(orderId);
        byPayment.set(canonical, ids);
    }
    return [...byPayment.values()].filter(ids => ids.length > 1);
}
