import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { OrderStatus } from 'src/shared-contracts/enums';
import { Order, OrderDocument } from 'src/web3/order.schema';
import { ImpactPayoutService } from './payouts.service';
import { PledgeConfig, pledgeConfigFromFacts, pledgeRows, pledgeStatus, PledgeTable } from './pledge';

/**
 * USD per EUR used to count EUR card orders in the purchase pledge (KI-03). An UPPER BOUND, not a
 * market rate: it sits above the all-time EUR/USD high (about 1.60, July 2008), so the pledge on a EUR
 * sale is never below what Stripe settled in USD (today it is well above).
 * Matches `pledgedCents`, which rounds up for the same reason. Kept at or above
 * PORTRAIT_STATS_USD_PER_EUR (1.15, stats only); `pledge.spec.ts` checks both.
 */
export const PLEDGE_USD_PER_EUR_UPPER_BOUND = 1.65;

/** Euro cents to USD cents at the upper-bound rate, rounded up (integer maths, no float drift). */
export function eurCentsToPledgeUsdCents(eurCents: number): number {
    const rateBps = Math.round(PLEDGE_USD_PER_EUR_UPPER_BOUND * 10000);
    return Math.ceil((Math.max(0, Math.round(eurCents)) * rateBps) / 10000);
}

/** Purchase pledge table (plan G4). Reads orders read-only; payments come from attested payouts. */
@Injectable()
export class PledgeService {
    /** Overridable in specs. Production reads the facts registry. */
    config: () => PledgeConfig | null = () => pledgeConfigFromFacts();

    constructor(
        @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
        @Optional() private payouts?: ImpactPayoutService
    ) {}

    async table(now: Date = new Date()): Promise<PledgeTable> {
        const config = this.config();
        const status = pledgeStatus(config, now);
        if (!config) {
            return { status, bps: null, effectiveAt: null, rows: [] };
        }
        const since = new Date(`${config.effectiveAt}T00:00:00Z`);
        const byMonth = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } };
        const sum = (field: 'priceUsd' | 'price', currencyType: unknown) =>
            this.orderModel
                .aggregate([
                    {
                        $match: {
                            status: OrderStatus.COMPLETE,
                            createdAt: { $gte: since },
                            [field]: { $gt: 0 },
                            currencyType,
                        },
                    },
                    { $group: { _id: byMonth, amount: { $sum: `$${field}` }, orders: { $sum: 1 } } },
                ])
                .exec() as Promise<{ _id: string; amount: number; orders: number }[]>;
        // USD-priced orders (every rail but the portrait card checkout) are summed at their `priceUsd`.
        const usdGroups = await sum('priceUsd', { $ne: CurrencyType.EUR });
        // Known issue KI-03: a EUR portrait order's `priceUsd` is a fixed-rate stats estimate, not what
        // Stripe settled. Its euro `price` is counted at an upper-bound rate instead, so the pledge can be
        // overstated but never understated.
        const eurGroups = await sum('price', CurrencyType.EUR);

        const sales = new Map<string, { cents: number; orders: number }>();
        const add = (month: string, cents: number, orders: number) => {
            const row = sales.get(month) || { cents: 0, orders: 0 };
            sales.set(month, { cents: row.cents + cents, orders: row.orders + orders });
        };
        for (const group of usdGroups || []) {
            add(String(group._id), Math.round((Number(group.amount) || 0) * 100), group.orders || 0);
        }
        for (const group of eurGroups || []) {
            add(
                String(group._id),
                eurCentsToPledgeUsdCents(Math.round((Number(group.amount) || 0) * 100)),
                group.orders || 0
            );
        }
        const paid = (await this.payouts?.pledgePaidCents()) || new Map<string, number>();
        return { status, bps: config.bps, effectiveAt: config.effectiveAt, rows: pledgeRows(sales, paid, config.bps) };
    }
}
