import { BadRequestException, Body, Controller, Get, HttpException, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { ICat, Tier } from 'src/cat/cat.schema';
import { CatService } from 'src/cat/cat.service';
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
import { IOrder, OrderStatus, PackType, ProductType } from './order.schema';
import { isStellarTxHash } from './stellar-payment';
import { ChainType } from './web3.model';
import { Web3Service } from './web3.service';

const shelters: Record<string, Types.ObjectId> = {
    catfluencers: new Types.ObjectId('675f4533cdb28696a94806fc'),
    pinkPaw: new Types.ObjectId('67b48fafd6c26c6cd40bfec6'),
};

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
    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.ADMIN))
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

    async grantBoughtCat({
        cat,
        user,
        orderId,
        tier,
        packType,
    }: {
        cat?: string | Types.ObjectId;
        user: string | Types.ObjectId;
        orderId?: Types.ObjectId;
        tier?: Tier;
        packType?: PackType;
    }): Promise<
        IMessage & {
            cat?: ICat;
        }
    > {
        if (cat) {
            const result = await this.catService.adopt(cat.toString(), user.toString(), tier, packType);
            await this.userRepository.update(user, {
                $inc: { monthCatsAdopted: 1, monthSpent: 1, spent: 1, monthPacks: 1 },
            });
            if (orderId) {
                await this.orderRepository.update(orderId, { status: OrderStatus.COMPLETE, cat });
            }
            return result;
        }
        return { success: false, message: 'No cat or generated cat' };
    }

    @UseGuards(AuthGuard('appauth'))
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
        await this.userRepository.update(user!, { $inc: { spent: priceUsd, monthSpent: priceUsd } });

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
        const blessing = await this.blessingRepository.find({
            searchObject: {
                shelter:
                    packType === PackType.INFLUENCER
                        ? shelters.catfluencers
                        : { $in: [shelters.catfluencers, shelters.pinkPaw] },
            },
            pipelineStages: [{ $sample: { size: 1 } }],
            projection: 'cat',
        });
        const response = await this.grantBoughtCat({
            cat: blessing[0].cat,
            user: user!,
            orderId: order._id,
            tier,
            packType,
        });
        if (discount) {
            const discountOwner = await this.userRepository.findOne({
                searchObject: { discount: discount.toLowerCase() },
                projection: '_id',
            });
            if (discountOwner) {
                await this.userRepository.update(discountOwner._id!, {
                    $inc: { affiliated: parseFloat((priceUsd * 0.2).toFixed(1)) },
                });
            }
        }

        if (response?.cat) {
            await this.orderRepository.update(order._id, { $set: { cat: response?.cat?._id } });
        }
        return response;
    }

    @UseGuards(AuthGuard('appauth'))
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('pack/:packType/:id')
    async pack(@Param('packType') packType: PackType, @Param('id') id: string): Promise<User> {
        const user = await this.userRepository.findOne({
            searchObject: { _id: new Types.ObjectId(id) },
            projection: 'name email permission shelter twitter discord',
        });

        const tier = getPackCardTier(packType);

        const blessing = await this.blessingRepository.find({
            searchObject: {
                shelter:
                    packType === PackType.INFLUENCER
                        ? shelters.catfluencers
                        : { $in: [shelters.catfluencers, shelters.pinkPaw] },
            },
            pipelineStages: [{ $sample: { size: 1 } }],
            projection: 'cat',
        });
        await this.grantBoughtCat({
            cat: blessing[0].cat,
            user: user._id!,
            tier,
            packType,
        });

        return user;
    }

    @UseGuards(AuthGuard('appauth'))
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
                        spent: verified.amountUsd,
                        monthSpent: verified.amountUsd,
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

            const blessing = await this.blessingRepository.find({
                searchObject: {
                    shelter:
                        packType === PackType.INFLUENCER
                            ? shelters.catfluencers
                            : { $in: [shelters.catfluencers, shelters.pinkPaw] },
                },
                pipelineStages: [{ $sample: { size: 1 } }],
                projection: 'cat',
            });
            const response = await this.grantBoughtCat({
                cat: blessing[0].cat,
                user: new Types.ObjectId(userId),
                orderId: order._id,
                tier,
                packType,
            });

            if (response?.cat) {
                await this.orderRepository.update(order._id!, { $set: { cat: response?.cat?._id } });
            }

            if (verified.discount) {
                const discountOwner = await this.userRepository.findOne({
                    searchObject: { discount: verified.discount },
                    projection: '_id',
                });
                if (discountOwner) {
                    await this.userRepository.update(discountOwner._id!, {
                        $inc: { affiliated: parseFloat((verified.amountUsd * 0.2).toFixed(1)) },
                    });
                }
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
