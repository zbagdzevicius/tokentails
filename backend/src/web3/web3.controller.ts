import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Get,
    GoneException,
    HttpException,
    Optional,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { ICat, Tier } from 'src/cat/cat.schema';
import { ALREADY_OWNED_MESSAGE, CatService, PACK_POOL_EMPTY_MESSAGE } from 'src/cat/cat.service';
import { ImageRepository } from 'src/image/image.repository';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType, IMessage } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { getPackCardTier } from 'src/shared/utils/content.utils';
import { CryptoCheckoutService } from 'src/payments/crypto/crypto-checkout.service';
import { getShelterCatPriceCents, isPackType } from 'src/payments/price-table';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { IUser, User } from 'src/user/user.schema';
import { LOOT_BOX_ENTITY } from './order-catalogue';
import { OrderRepository } from './order.repository';
import { GrantFailureReason, IOrder, IOrderRefund, OrderStatus, PackType, ProductType } from './order.schema';
import { spendIncrement } from './spend';
import { GrantResult, PACK_GRANT_FAILED_MESSAGE, PurchaseGrantService } from './purchase-grant.service';
import { isStellarTxHash } from './stellar-payment';
import { ChainType } from './web3.model';
import { Web3Service } from './web3.service';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ShelterCatSaleService } from 'src/shelter/shelter-cat-sale.service';

export { PACK_GRANT_FAILED_MESSAGE };

/**
 * POST /web3/confirm no longer sells packs (founder, 2026-10-04): packs are bought through the crypto
 * checkout (USDC or EURC on every integrated EVM chain, src/payments/crypto) or Stripe, and the client
 * no longer offers Stellar for packs. A pack payment that still arrives (a cached old tab, a payment in
 * flight at deploy) is verified and recorded first, because the client pays before it confirms: paid
 * before `STELLAR_PACKS_SUNSET_AT` it is granted as before; paid later it is FAILED_GRANT with
 * `refund: 'due'` (`STELLAR_DEPRECATED`) and answered 410. Reads, history, audits and refunds of
 * existing Stellar orders are unchanged. `STELLAR_PACKS_ENABLED=true` is the rollback switch.
 */
export const STELLAR_PACKS_DEPRECATED = 'STELLAR_PACKS_DEPRECATED';
export const STELLAR_PACKS_DEPRECATED_MESSAGE =
    'Packs are no longer sold through Stellar. Your payment is recorded and will be refunded to the sending account. Pay with USDC or EURC in the crypto checkout, or by card.';
export const stellarPacksEnabled = (env: NodeJS.ProcessEnv = process.env) =>
    (env.STELLAR_PACKS_ENABLED || '').trim().toLowerCase() === 'true';
/** Stellar packs closed at once (founder, 2026-10-09), ending the grace planned to 2026-10-11. */
export const DEFAULT_STELLAR_PACKS_SUNSET_AT = '2026-10-09T18:00:00Z';
/**
 * `STELLAR_PACKS_SUNSET_AT` (ISO time) can only move the sunset earlier; a later or invalid value
 * gives the default, so an old env value cannot reopen packs (`STELLAR_PACKS_ENABLED` is the rollback).
 */
export function stellarPacksSunset(env: NodeJS.ProcessEnv = process.env): Date {
    const fixed = new Date(DEFAULT_STELLAR_PACKS_SUNSET_AT);
    const set = new Date((env.STELLAR_PACKS_SUNSET_AT || '').trim());
    return isNaN(set.getTime()) || set > fixed ? fixed : set;
}

@Controller('web3')
export class Web3Controller {
    constructor(
        private orderRepository: OrderRepository,
        private catService: CatService,
        private userRepository: UserRepository,
        private blessingRepository: BlessingRepository,
        private imageRepository: ImageRepository,
        private web3Service: Web3Service,
        private stripePayments: StripePaymentService,
        @Optional() grants?: PurchaseGrantService,
        @Optional() private catSale?: ShelterCatSaleService,
        @Optional() private cryptoCheckout?: CryptoCheckoutService
    ) {
        // The specs build the controller by hand with seven arguments; the grant logic is the same.
        this.grants = grants || new PurchaseGrantService(orderRepository, catService, userRepository, stripePayments);
    }

    private readonly grants: PurchaseGrantService;

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

    /** Grants the pack cat of a paid order. See PurchaseGrantService.grantBoughtCat. */
    grantBoughtCat(input: Parameters<PurchaseGrantService['grantBoughtCat']>[0]) {
        return this.grants.grantBoughtCat(input);
    }

    /** Picks the pack cat and grants it, refunding a failed grant. See PurchaseGrantService.grantPack. */
    grantPack(input: Parameters<PurchaseGrantService['grantPack']>[0]): Promise<GrantResult> {
        return this.grants.grantPack(input);
    }

    /** Records and, for Stripe, performs the refund of a paid order that was not granted. */
    refundOrder(
        order: Pick<IOrder, '_id' | 'chainType' | 'hash'>,
        user: string | Types.ObjectId,
        reason: GrantFailureReason,
        amountUsd: number
    ): Promise<IOrderRefund['state'] | undefined> {
        return this.grants.refundOrder(order, user, reason, amountUsd);
    }

    private creditAffiliate(discount: string | undefined, amountUsd: number) {
        return this.grants.creditAffiliate(discount, amountUsd);
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

        // Stellar packs are closed: a verified payment after the sunset is recorded for a refund, never lost.
        if (entityType === EntityType.PACK && !stellarPacksEnabled()) {
            const paidAt = verified.closedAt || new Date();
            if (paidAt.getTime() >= stellarPacksSunset().getTime()) {
                const orderRef = { _id: order._id, chainType, hash };
                await this.grants.markGrantFailed(order._id, 'STELLAR_DEPRECATED', `paid ${paidAt.toISOString()}`);
                const refund = await this.grants.refundOrder(orderRef, user, 'STELLAR_DEPRECATED', priceUsd, {
                    takeBackSpend: false,
                });
                throw new GoneException({
                    statusCode: 410,
                    code: STELLAR_PACKS_DEPRECATED,
                    message: STELLAR_PACKS_DEPRECATED_MESSAGE,
                    refund: refund || 'due',
                });
            }
        }
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
            if (entityType === EntityType.CAT) {
                // One shelter cat at the basic tier, $5 floor, no discount (founder, 2026-10-04).
                const check = this.catSale ? await this.catSale.check(id, userId) : null;
                if (!check?.ok) {
                    if (check?.reason === 'ALREADY_OWNED') {
                        throw new ConflictException(ALREADY_OWNED_MESSAGE);
                    }
                    throw new BadRequestException('Cat is not for sale');
                }
                return await this.stripePayments.createPaymentIntent({
                    entityType: EntityType.CAT,
                    catId: check.cat.catId,
                    userId: userId.toString(),
                });
            }
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

            if (verified.entityType === EntityType.CAT) {
                // Idempotent on the intent id: a replayed confirm grants nothing
                const catClaim = await this.stripePayments.claimPaymentIntent(verified, {
                    entityType: EntityType.CAT,
                    id: verified.catId,
                    user: new Types.ObjectId(userId),
                    currencyType: CurrencyType.USD,
                });
                if (!catClaim.claimed) {
                    return { success: false, message: 'This payment was already processed.' };
                }
                await this.userRepository.update(userId, { $inc: spendIncrement(verified.amountUsd) });
                const granted = await this.grants.grantShelterCat({
                    user: new Types.ObjectId(userId),
                    order: { _id: catClaim.order._id, chainType: ChainType.FIAT, hash: verified.intentId },
                    catId: verified.catId!,
                    amountUsd: verified.amountUsd,
                });
                if (granted.success) {
                    await this.recordCardShelterShare(userId, verified.intentId, verified.catId!, granted);
                }
                return granted;
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

    /**
     * A card-paid shelter cat owes its shelter the same share as a crypto one paid to the treasury
     * (CryptoCheckoutService.recordCardShelterShare). Never fails the purchase: a missed record is logged
     * for a person to add.
     */
    private async recordCardShelterShare(userId: string, intentId: string, catId: string, granted: GrantResult) {
        if (!this.cryptoCheckout || !this.catSale) {
            return;
        }
        try {
            const sale = await this.catSale.check(catId);
            const cat = sale.ok ? sale.cat : null;
            await this.cryptoCheckout.recordCardShelterShare({
                userId,
                intentId,
                catId,
                grantedCatId: granted.cat?._id ? String(granted.cat._id) : undefined,
                name: cat?.name,
                shelter: cat?.shelter ? { _id: cat.shelter._id, name: cat.shelter.name, slug: cat.shelter.slug } : null,
                priceUsdCents: getShelterCatPriceCents(),
            });
        } catch (error) {
            console.error(`Shelter share of card payment ${intentId} not recorded:`, (error as Error)?.message);
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
