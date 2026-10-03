import { BadRequestException, Body, Controller, Get, HttpException, Param, Post, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { ICat, Tier } from 'src/cat/cat.schema';
import { CatService, PACK_POOL_EMPTY_MESSAGE } from 'src/cat/cat.service';
import { ImageRepository } from 'src/image/image.repository';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType, IMessage } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { getPackCardTier } from 'src/shared/utils/content.utils';
import { isPackType } from 'src/payments/price-table';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { IUser, User } from 'src/user/user.schema';
import { LOOT_BOX_ENTITY } from './order-catalogue';
import { OrderRepository } from './order.repository';
import { GrantFailureReason, IOrder, IOrderRefund, OrderStatus, PackType, ProductType } from './order.schema';
import { spendIncrement, spendRefundPipeline } from './spend';
import { isStellarTxHash } from './stellar-payment';
import { ChainType } from './web3.model';
import { Web3Service } from './web3.service';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';

/** A paid pack or loot box result when nothing could be granted. */
type GrantResult = IMessage & { cat?: ICat; refund?: IOrderRefund['state'] };

/** Shown when a paid pack could not be granted even after one retry; the order is refunded. */
export const PACK_GRANT_FAILED_MESSAGE = 'We could not bring your cat home this time. Your payment will be refunded.';

@Controller('web3')
export class Web3Controller {
    constructor(
        private orderRepository: OrderRepository,
        private catService: CatService,
        private userRepository: UserRepository,
        private blessingRepository: BlessingRepository,
        private imageRepository: ImageRepository,
        private web3Service: Web3Service,
        private stripePayments: StripePaymentService
    ) {}

    // Returns buyer emails and wallet addresses for the loot-drop export, so admins only.
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('loot/buyers')
    async lootBuyers() {
        const orders = await this.orderRepository.find({
            searchObject: {
                status: OrderStatus.COMPLETE,
                createdAt: { $gte: new Date('2025-08-25') },
            },
            projection: 'user walletAddress hash',
            populate: [{ path: 'user', select: 'email -_id catnipCount createdAt' }],
        });
        const uniqueBuyers = orders.filter(
            (order, index, self) => index === self.findIndex(t => t.walletAddress === order.walletAddress)
        );
        const eligibleBuyers = uniqueBuyers
            .filter(
                order =>
                    ((order.user as any as IUser).catnipCount || 0) >= 60 &&
                    new Date((order.user as any as IUser).createdAt!).getTime() >= new Date('2025-08-25').getTime()
            )
            .map(order => ({ walletAddress: order.walletAddress, email: (order.user as any).email, hash: order.hash }));

        return {
            count: eligibleBuyers.length,
            buyers: eligibleBuyers,
        };
    }

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
    }): Promise<
        IMessage & {
            cat?: ICat;
        }
    > {
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
     * fails the grant and refunds the order (decision #21): Stripe orders automatically, Stellar
     * orders are marked `refund.state: 'due'` for the treasury to send back by hand.
     *
     * A failed adoption (for example two packs bought at once picked the same cat, and the second
     * copy lost the ownership check) is retried once with another cat, excluding the one that
     * failed. When that fails too, the order is FAILED_GRANT and refunded the same way.
     *
     * An unexpected error (a database error in the pick or the adoption) is treated the same: the
     * spend was already counted, so the order is FAILED_GRANT and refunded rather than left PENDING
     * with the money taken (3c review). The refund is claimed once per order, so a retry is safe.
     */
    async grantPack(input: {
        user: string | Types.ObjectId;
        order: Pick<IOrder, '_id' | 'chainType' | 'hash'>;
        packType?: PackType;
        tier: Tier;
        amountUsd: number;
    }): Promise<GrantResult> {
        try {
            return await this.grantPackOnce(input);
        } catch (error) {
            const detail = String((error as Error)?.message || 'Unexpected error');
            console.error(`Pack grant of order ${String(input.order._id)} failed:`, detail);
            let refund: IOrderRefund['state'] | undefined;
            try {
                // The order may have been granted before the error (for example the stats update
                // failed after COMPLETE): never fail or refund a completed order.
                const current: any = await this.orderRepository.model
                    .findOne({ _id: input.order._id }, { status: 1, refund: 1 })
                    .lean();
                if (current?.status === OrderStatus.COMPLETE) {
                    return { success: true, message: 'Pack granted' };
                }
                await this.markGrantFailed(input.order._id!, 'ADOPT_FAILED', detail);
                refund = await this.refundOrder(input.order, input.user, 'ADOPT_FAILED', input.amountUsd);
            } catch (recordError) {
                console.error(
                    `Recording the failed grant of order ${String(input.order._id)} failed:`,
                    (recordError as Error)?.message
                );
            }
            return { success: false, message: PACK_GRANT_FAILED_MESSAGE, refund };
        }
    }

    private async grantPackOnce({
        user,
        order,
        packType,
        tier,
        amountUsd,
    }: {
        user: string | Types.ObjectId;
        order: Pick<IOrder, '_id' | 'chainType' | 'hash'>;
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

    private async markGrantFailed(orderId: Types.ObjectId, reason: GrantFailureReason, detail: string) {
        await this.orderRepository.update(orderId, {
            $set: { status: OrderStatus.FAILED_GRANT, failureReason: `${reason}: ${detail}`.slice(0, 200) },
        });
    }

    /**
     * Records and, where possible, performs the refund of a paid order that was not granted. Runs at
     * most once per order (the `refund` field is the guard). The spend counted for the order is taken
     * back, because the buyer is getting the money back.
     */
    async refundOrder(
        order: Pick<IOrder, '_id' | 'chainType' | 'hash'>,
        user: string | Types.ObjectId,
        reason: GrantFailureReason,
        amountUsd: number
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
        await this.userRepository.update(user, spendRefundPipeline(amountUsd) as any);

        const paymentIntent = typeof order.hash === 'string' && order.hash.startsWith('pi_') ? order.hash : undefined;
        if (order.chainType !== ChainType.FIAT || !paymentIntent) {
            // Stellar: the treasury sends `price` in `currencyType` back to `walletAddress` (manual step).
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
    private async creditAffiliate(discount: string | undefined, amountUsd: number) {
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

    @UseGuards(AppAuthGuard)
    @Post('confirm')
    async checkTransaction(
        @USER_ID() user: string,
        @Body()
        { chainType, hash, walletAddress, currencyType, price, ref, entityType, id, discount }: IOrder
    ): Promise<
        IMessage & {
            cat?: ICat;
            type?: string;
            amount?: number;
        }
    > {
        if (!currencyType || !entityType || !chainType) {
            throw new BadRequestException('Bad Request');
        }
        // Only these items are sold through this route. Anything else is refused before an order
        // exists, so no order can hold a payment under an entityType the grant below does not know.
        if (![EntityType.IMAGE, EntityType.PACK, LOOT_BOX_ENTITY].includes(entityType as string)) {
            throw new BadRequestException('Unknown item');
        }
        if (entityType === EntityType.PACK && !isPackType(id)) {
            throw new BadRequestException('Unknown pack type');
        }
        if ((entityType as string) === LOOT_BOX_ENTITY && id) {
            throw new BadRequestException('A loot box has no item id');
        }
        if (chainType !== ChainType.STELLAR || !isStellarTxHash(hash)) {
            throw new BadRequestException('Invalid transaction hash');
        }
        // Horizon hashes are lowercase hex; one payment must map to one order key.
        hash = hash.toLowerCase();

        let imageObjectId: Types.ObjectId | undefined = undefined;
        let portraitImageAiUrl: string | undefined = undefined;
        if (entityType === EntityType.IMAGE) {
            if (!id || !Types.ObjectId.isValid(id.toString())) {
                throw new BadRequestException('Image id is required for image purchases');
            }
            imageObjectId = new Types.ObjectId(id.toString());
            const image = await this.imageRepository.findOne({
                searchObject: { _id: imageObjectId },
                projection: 'aiUrl',
            });
            if (!image?.aiUrl) {
                throw new BadRequestException('Generated portrait not found');
            }
            portraitImageAiUrl = image.aiUrl;
        }

        const order = await this.orderRepository.create({
            chainType,
            hash,
            discount,
            walletAddress,
            currencyType,
            price: price,
            entityType,
            ref,
            id: entityType === EntityType.IMAGE ? ProductType.DIGITAL : id,
            image: imageObjectId,
            status: OrderStatus.PENDING,
            user: new Types.ObjectId(user),
        });

        // Spent and the affiliate share use the amount verified on Stellar, never the client `price`.
        const verified = await this.web3Service.validatePrice(currencyType, price, chainType, hash, order._id);
        const priceUsd = verified.priceUsd;
        await this.userRepository.update(user!, { $inc: spendIncrement(priceUsd) });

        if (entityType === EntityType.IMAGE) {
            await this.orderRepository.update(order._id.toString(), {
                status: OrderStatus.COMPLETE,
                image: imageObjectId,
                id: ProductType.DIGITAL,
            });

            await this.userRepository.update(user!, {
                $inc: { portraitPurchases: 1, monthPortraitPurchases: 1 },
            });

            try {
                await this.catService.createBlessingWithCat(user, portraitImageAiUrl!);
            } catch (error) {
                console.error('Failed to create portrait blessing cat:', error);
            }

            return {
                success: true,
                message: 'Pet immortalized successfully.',
            };
        }

        // OTHERWISE IT'S A PACK OR A LOOT BOX. The pack type comes from the verified entityType:
        // a loot box never carries one, so it cannot be granted with a pack's odds.
        const packType = entityType === EntityType.PACK ? (id as PackType) : undefined;
        const tier = packType ? getPackCardTier(packType) : Tier.COMMON;
        const response = await this.grantPack({
            user: user!,
            order: { _id: order._id, chainType, hash },
            packType,
            tier,
            amountUsd: priceUsd,
        });
        if (response.success) {
            await this.creditAffiliate(discount, priceUsd);
        }
        return response;
    }

    @UseGuards(AppAuthGuard)
    @Post('create-payment')
    async createPayment(
        @Body()
        {
            id,
            entityType,
            productType,
            imageId,
            discount,
        }: {
            amount?: number; // ignored: the price comes from the server price table
            discount?: string;
            id: string;
            entityType?: EntityType;
            productType?: ProductType;
            imageId?: string;
        },
        @USER_ID() userId: string
    ) {
        try {
            const targetEntityType = entityType === EntityType.IMAGE ? EntityType.IMAGE : EntityType.PACK;
            const targetProductType = productType || ProductType.DIGITAL;
            const targetImageId = imageId || id;

            if (targetEntityType === EntityType.IMAGE) {
                if (!targetImageId || !Types.ObjectId.isValid(targetImageId)) {
                    throw new BadRequestException('Generated image id is required for portrait checkout');
                }

                const image = await this.imageRepository.findOne({
                    searchObject: { _id: targetImageId },
                    projection: '_id',
                });
                if (!image) {
                    throw new BadRequestException('Generated portrait not found');
                }
            }

            // Amount comes from the server price table (plus a verified discount code); `amount` is ignored.
            return await this.stripePayments.createPaymentIntent({
                entityType: targetEntityType,
                productType: targetProductType,
                packType: targetEntityType === EntityType.PACK ? id : undefined,
                imageId: targetEntityType === EntityType.IMAGE ? targetImageId : undefined,
                userId: userId.toString(),
                discount,
            });
        } catch (error) {
            console.error('Error creating payment intent:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new BadRequestException('Error creating payment intent');
        }
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('pack/:packType/:id')
    async pack(@Param('packType') packType: PackType, @Param('id') id: string): Promise<User> {
        const user = await this.userRepository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
            projection: 'name email permission shelter twitter discord',
        });

        if (!user) {
            throw new BadRequestException('User not found');
        }
        const tier = getPackCardTier(packType);
        const source = await this.catService.pickPackCat(user._id!, packType);
        if (!source) {
            throw new BadRequestException(PACK_POOL_EMPTY_MESSAGE);
        }
        await this.grantBoughtCat({
            cat: source,
            user: user._id!,
            tier,
            packType,
        });

        return user;
    }

    @UseGuards(AppAuthGuard)
    @Post('confirm-payment')
    async confirmPayment(
        @Body()
        {
            paymentIntent,
        }: {
            paymentIntent: string;
            clientSecret: string;
            discount?: string; // ignored: the discount is read from the intent metadata
        },
        @USER_ID() userId: string
    ): Promise<
        IMessage & {
            cat?: ICat;
        }
    > {
        try {
            // Owner, status, currency and amount >= server price, checked against Stripe
            const verified = await this.stripePayments.retrieveVerifiedPaymentIntent(paymentIntent, userId);

            if (verified.entityType === EntityType.IMAGE) {
                const image = await this.imageRepository.findOne({
                    searchObject: { _id: new Types.ObjectId(verified.imageId) },
                    projection: 'aiUrl',
                });
                if (!image?.aiUrl) {
                    throw new BadRequestException('Generated portrait not found');
                }

                // Idempotent on the intent id: a replayed confirm grants nothing
                const claim = await this.stripePayments.claimPaymentIntent(verified, {
                    entityType: EntityType.IMAGE,
                    id: ProductType.DIGITAL,
                    user: new Types.ObjectId(userId),
                    image: new Types.ObjectId(verified.imageId),
                });
                if (!claim.claimed) {
                    return { success: false, message: 'This payment was already processed.' };
                }

                await this.userRepository.update(userId, {
                    $inc: {
                        ...spendIncrement(verified.amountUsd),
                        portraitPurchases: 1,
                        monthPortraitPurchases: 1,
                    },
                });

                try {
                    await this.catService.createBlessingWithCat(userId, image.aiUrl);
                } catch (catError) {
                    console.error('Failed to create portrait blessing cat after stripe payment:', catError);
                }
                await this.orderRepository.update(claim.order._id!, { status: OrderStatus.COMPLETE });

                return { success: true, message: 'Pet immortalized successfully.' };
            }

            // Idempotent on the intent id: a replayed confirm grants nothing
            const claim = await this.stripePayments.claimPaymentIntent(verified, {
                entityType: EntityType.PACK,
                id: verified.packType,
                discount: verified.discount,
                user: new Types.ObjectId(userId),
                currencyType: CurrencyType.USDT,
            });
            if (!claim.claimed) {
                return { success: false, message: 'This payment was already processed.' };
            }
            const order = claim.order;
            const packType = verified.packType!;
            const tier = getPackCardTier(packType);

            await this.userRepository.update(userId, { $inc: spendIncrement(verified.amountUsd) });
            const response = await this.grantPack({
                user: new Types.ObjectId(userId),
                order: { _id: order._id, chainType: ChainType.FIAT, hash: verified.intentId },
                packType,
                tier,
                amountUsd: verified.amountUsd,
            });
            if (response.success) {
                await this.creditAffiliate(verified.discount, verified.amountUsd);
            }

            return response;
        } catch (error) {
            console.error('Payment confirmation error:', error);
            // Our own 4xx messages are safe to show. Stripe SDK and database errors are logged only.
            if (error instanceof HttpException) {
                throw error;
            }
            throw new BadRequestException('Error confirming payment');
        }
    }

    @Post('validate-discount')
    async validateDiscount(
        @Body() { discount }: { discount: string }
    ): Promise<{ valid: boolean; message?: string; percentage?: number }> {
        discount = discount.toLowerCase();
        if (!discount) {
            return { valid: false, message: 'Discount code is required' };
        }

        const user = await this.userRepository.findOne({
            searchObject: { discount: discount.toLowerCase() },
            projection: 'discount',
        });

        if (user) {
            return { valid: true, percentage: ['sei', 'intern'].includes(discount) ? 10 : 20 };
        }

        return { valid: false, message: 'Invalid discount code' };
    }
}
