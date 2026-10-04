import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ICat, Tier } from 'src/cat/cat.schema';
import { CatService, PACK_POOL_EMPTY_MESSAGE } from 'src/cat/cat.service';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { IMessage } from 'src/shared/interfaces/common.interface';
import { UserRepository } from 'src/user/user.repository';
import { OrderRepository } from './order.repository';
import { GrantFailureReason, IOrder, IOrderRefund, OrderStatus, PackType } from './order.schema';
import { spendRefundPipeline } from './spend';
import { ChainType } from './web3.model';

/** A paid pack or loot box result when nothing could be granted. */
export type GrantResult = IMessage & { cat?: ICat; refund?: IOrderRefund['state'] };

/** Shown when a paid pack could not be granted even after one retry; the order is refunded. */
export const PACK_GRANT_FAILED_MESSAGE = 'We could not bring your cat home this time. Your payment will be refunded.';

/** Shown when a paid shelter cat could not be granted; the order is refunded. */
export const CAT_GRANT_FAILED_MESSAGE = 'We could not bring this cat home. Your payment will be refunded.';

/** The basic tier: the only tier a shelter cat bought on its own comes in. */
export const SHELTER_CAT_TIER = Tier.COMMON;

type OrderRef = Pick<IOrder, '_id' | 'chainType' | 'hash'>;

/**
 * The one grant path for every paid item (Stripe PaymentIntents, Stellar, the crypto checkout).
 * Moved out of Web3Controller unchanged (stage crypto-pay 1), so the crypto checkout grants exactly
 * like the existing flows: the order is COMPLETE only when the adoption succeeded, FAILED_GRANT with
 * a reason otherwise, and a failed grant is refunded once (Stripe automatically, every other chain
 * marked `refund.state: 'due'` for the treasury to send back by hand).
 */
@Injectable()
export class PurchaseGrantService {
    constructor(
        private orderRepository: OrderRepository,
        private catService: CatService,
        private userRepository: UserRepository,
        private stripePayments: StripePaymentService
    ) {}

    /**
     * Grants the pack cat of a paid order. The order is COMPLETE only when the adoption succeeded;
     * otherwise it is FAILED_GRANT with the reason, so it shows in scripts/audit-orders-grants.js
     * and can be retried or refunded (plan G3). Counters move only on success.
     */
    async grantBoughtCat({
        cat,
        user,
        orderId,
        tier,
        packType,
        markFailure = true,
    }: {
        cat?: string | Types.ObjectId | null;
        user: string | Types.ObjectId;
        orderId?: Types.ObjectId;
        tier?: Tier;
        packType?: PackType;
        /** False when the caller retries or refunds and records the failure itself (grantPack). */
        markFailure?: boolean;
    }): Promise<IMessage & { cat?: ICat }> {
        if (!cat) {
            if (orderId && markFailure) {
                await this.markGrantFailed(orderId, 'NO_CAT', 'No cat to grant');
            }
            return { success: false, message: 'No cat or generated cat' };
        }
        const result = await this.catService.adopt(cat.toString(), user.toString(), tier, packType, 'pack');
        if (!result?.success || !result.cat) {
            if (orderId && markFailure) {
                await this.markGrantFailed(orderId, 'ADOPT_FAILED', result?.message || 'Adoption failed');
            }
            return { success: false, message: result?.message || 'Something went wrong, please try again later' };
        }
        await this.userRepository.update(user, {
            $inc: { monthCatsAdopted: 1, monthPacks: 1 },
        });
        if (orderId) {
            await this.orderRepository.update(orderId, {
                $set: { status: OrderStatus.COMPLETE, cat: result.cat._id ?? cat },
            });
        }
        return result;
    }

    /**
     * Picks the pack cat and grants it. An empty pool (the buyer owns every cat it could bring home)
     * fails the grant and refunds the order (decision #21). A failed adoption is retried once with
     * another cat; an unexpected error is treated as a failed grant and refunded (3c review). The
     * refund is claimed once per order, so a retry is safe.
     */
    async grantPack(input: {
        user: string | Types.ObjectId;
        order: OrderRef;
        packType?: PackType;
        tier: Tier;
        amountUsd: number;
    }): Promise<GrantResult> {
        try {
            return await this.grantPackOnce(input);
        } catch (error) {
            return this.recordUnexpected(
                input.order,
                input.user,
                input.amountUsd,
                error,
                PACK_GRANT_FAILED_MESSAGE,
                'Pack granted'
            );
        }
    }

    /**
     * Grants one specific shelter cat at the basic tier (Stripe or the crypto checkout). Same adoption
     * and ownership dedupe as packs (`CatService.adopt`, origin `adopt`), no retry with another cat:
     * the buyer chose this one. A failure is FAILED_GRANT and refunded.
     */
    async grantShelterCat(input: {
        user: string | Types.ObjectId;
        order: OrderRef;
        catId: string | Types.ObjectId;
        amountUsd: number;
    }): Promise<GrantResult> {
        const { user, order, catId, amountUsd } = input;
        try {
            const result = await this.catService.adopt(
                catId.toString(),
                user.toString(),
                SHELTER_CAT_TIER,
                undefined,
                'adopt'
            );
            if (!result?.success || !result.cat) {
                const detail = result?.message || 'Adoption failed';
                await this.markGrantFailed(order._id!, 'ADOPT_FAILED', detail);
                const refund = await this.refundOrder(order, user, 'ADOPT_FAILED', amountUsd);
                return { success: false, message: `${detail}. ${CAT_GRANT_FAILED_MESSAGE}`, refund };
            }
            await this.userRepository.update(user, { $inc: { monthCatsAdopted: 1 } });
            await this.orderRepository.update(order._id!, {
                $set: { status: OrderStatus.COMPLETE, cat: result.cat._id ?? catId },
            });
            return result;
        } catch (error) {
            return this.recordUnexpected(order, user, amountUsd, error, CAT_GRANT_FAILED_MESSAGE, 'Cat granted');
        }
    }

    private async recordUnexpected(
        order: OrderRef,
        user: string | Types.ObjectId,
        amountUsd: number,
        error: unknown,
        message: string,
        grantedMessage: string
    ): Promise<GrantResult> {
        const detail = String((error as Error)?.message || 'Unexpected error');
        console.error(`Grant of order ${String(order._id)} failed:`, detail);
        let refund: IOrderRefund['state'] | undefined;
        try {
            // The order may have been granted before the error (for example the stats update failed
            // after COMPLETE): never fail or refund a completed order.
            const current: any = await this.orderRepository.model
                .findOne({ _id: order._id }, { status: 1, refund: 1 })
                .lean();
            if (current?.status === OrderStatus.COMPLETE) {
                return { success: true, message: grantedMessage };
            }
            await this.markGrantFailed(order._id!, 'ADOPT_FAILED', detail);
            refund = await this.refundOrder(order, user, 'ADOPT_FAILED', amountUsd);
        } catch (recordError) {
            console.error(
                `Recording the failed grant of order ${String(order._id)} failed:`,
                (recordError as Error)?.message
            );
        }
        return { success: false, message, refund };
    }

    private async grantPackOnce({
        user,
        order,
        packType,
        tier,
        amountUsd,
    }: {
        user: string | Types.ObjectId;
        order: OrderRef;
        packType?: PackType;
        tier: Tier;
        amountUsd: number;
    }): Promise<GrantResult> {
        const source = await this.catService.pickPackCat(user, packType);
        if (!source) {
            await this.markGrantFailed(order._id!, 'EMPTY_POOL', 'Pack pool empty for this buyer');
            const refund = await this.refundOrder(order, user, 'EMPTY_POOL', amountUsd);
            return { success: false, message: PACK_POOL_EMPTY_MESSAGE, refund };
        }
        const first = await this.grantBoughtCat({
            cat: source,
            user,
            orderId: order._id,
            tier,
            packType,
            markFailure: false,
        });
        if (first.success) {
            return first;
        }
        const retrySource = await this.catService.pickPackCat(user, packType, [source]);
        const retried = retrySource
            ? await this.grantBoughtCat({
                  cat: retrySource,
                  user,
                  orderId: order._id,
                  tier,
                  packType,
                  markFailure: false,
              })
            : first;
        if (retried.success) {
            return retried;
        }
        await this.markGrantFailed(order._id!, 'ADOPT_FAILED', retried.message || 'Adoption failed');
        const refund = await this.refundOrder(order, user, 'ADOPT_FAILED', amountUsd);
        return { success: false, message: PACK_GRANT_FAILED_MESSAGE, refund };
    }

    async markGrantFailed(orderId: Types.ObjectId, reason: GrantFailureReason, detail: string) {
        await this.orderRepository.update(orderId, {
            $set: { status: OrderStatus.FAILED_GRANT, failureReason: `${reason}: ${detail}`.slice(0, 200) },
        });
    }

    /**
     * Records and, where possible, performs the refund of a paid order that was not granted. Runs at
     * most once per order (the `refund` field is the guard). The spend counted for the order is taken
     * back, because the buyer is getting the money back. Only a Stripe PaymentIntent is refunded
     * automatically; Stellar and crypto checkout orders are `due` (the treasury sends `price` in
     * `currencyType` back to `walletAddress` by hand).
     */
    async refundOrder(
        order: OrderRef,
        user: string | Types.ObjectId,
        reason: GrantFailureReason,
        amountUsd: number,
        { takeBackSpend = true }: { takeBackSpend?: boolean } = {}
    ): Promise<IOrderRefund['state'] | undefined> {
        const requested: IOrderRefund = {
            state: 'due',
            reason,
            amountUsd: Number.isFinite(amountUsd) ? amountUsd : undefined,
            requestedAt: new Date(),
        };
        const claimed = await this.orderRepository.model.findOneAndUpdate(
            { _id: order._id, refund: { $exists: false } },
            { $set: { refund: requested } },
            { new: true }
        );
        if (!claimed) {
            return undefined;
        }
        if (takeBackSpend) {
            await this.userRepository.update(user, spendRefundPipeline(amountUsd) as any);
        }

        const paymentIntent = typeof order.hash === 'string' && order.hash.startsWith('pi_') ? order.hash : undefined;
        if (order.chainType !== ChainType.FIAT || !paymentIntent) {
            return 'due';
        }
        try {
            const refund = await this.stripePayments.stripe.refunds.create(
                {
                    payment_intent: paymentIntent,
                    reason: 'requested_by_customer',
                    metadata: { orderId: String(order._id), reason },
                },
                { idempotencyKey: `tt-refund-${String(order._id)}` }
            );
            await this.orderRepository.update(order._id!, {
                $set: { 'refund.state': 'refunded', 'refund.refundedAt': new Date(), 'refund.refundId': refund.id },
            });
            return 'refunded';
        } catch (error) {
            console.error(`Refund of order ${String(order._id)} failed; left as due:`, (error as Error)?.message);
            await this.orderRepository.update(order._id!, {
                $set: { 'refund.error': String((error as Error)?.message || 'refund failed').slice(0, 200) },
            });
            return 'due';
        }
    }

    /** Pays the affiliate share once a paid order was granted. Never on a failed or refunded grant. */
    async creditAffiliate(discount: string | undefined, amountUsd: number) {
        if (!discount) {
            return;
        }
        const discountOwner = await this.userRepository.findOne({
            searchObject: { discount: discount.toLowerCase() },
            projection: '_id',
        });
        if (discountOwner) {
            await this.userRepository.update(discountOwner._id!, {
                $inc: { affiliated: parseFloat((amountUsd * 0.2).toFixed(1)) },
            });
        }
    }
}
