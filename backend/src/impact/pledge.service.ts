import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderStatus } from 'src/shared-contracts/enums';
import { Order, OrderDocument } from 'src/web3/order.schema';
import { ImpactPayoutService } from './payouts.service';
import { PledgeConfig, pledgeConfigFromFacts, pledgeRows, pledgeStatus, PledgeTable } from './pledge';

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
        const groups: { _id: string; usd: number; orders: number }[] = await this.orderModel
            .aggregate([
                {
                    $match: {
                        status: OrderStatus.COMPLETE,
                        createdAt: { $gte: new Date(`${config.effectiveAt}T00:00:00Z`) },
                        priceUsd: { $gt: 0 },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
                        usd: { $sum: '$priceUsd' },
                        orders: { $sum: 1 },
                    },
                },
            ])
            .exec();
        const sales = new Map<string, { cents: number; orders: number }>();
        for (const group of groups || []) {
            sales.set(String(group._id), {
                cents: Math.round((Number(group.usd) || 0) * 100),
                orders: group.orders || 0,
            });
        }
        const paid = (await this.payouts?.pledgePaidCents()) || new Map<string, number>();
        return { status, bps: config.bps, effectiveAt: config.effectiveAt, rows: pledgeRows(sales, paid, config.bps) };
    }
}
