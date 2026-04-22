import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { ICat, Tier } from 'src/cat/cat.schema';
import { CatService } from 'src/cat/cat.service';
import { ImageRepository } from 'src/image/image.repository';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType, IMessage } from 'src/shared/interfaces/common.interface';
import { currencyRate, CurrencyType } from 'src/shared/interfaces/currency.interface';
import { getPackCardTier } from 'src/shared/utils/content.utils';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { IUser, User } from 'src/user/user.schema';
import Stripe from 'stripe';
import { OrderRepository } from './order.repository';
import { IOrder, OrderStatus, PackType, ProductType } from './order.schema';
import { ChainType } from './web3.model';
import { Web3Service } from './web3.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-12-15.clover',
});

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
        private web3Service: Web3Service
    ) {}

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

        await this.web3Service.validatePrice(currencyType, price, chainType, hash);
        const priceUsd = price * currencyRate[currencyType];
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

        // OTHERWISE IT'S A PACK
        const packType = id as PackType;
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
    @Post('create')
    async create(
        @Body()
        { chainType, hash, currencyType, price, ref, entityType, id, user }: IOrder
    ): Promise<IOrder> {
        if (!currencyType || !entityType || !chainType) {
            throw new BadRequestException('Bad Request');
        }
        const order = await this.orderRepository.create({
            chainType,
            hash,
            currencyType,
            price: price,
            entityType,
            ref,
            status: OrderStatus.PENDING,
            id: new Types.ObjectId(id),
            user,
        });

        return order;
    }

    @UseGuards(AuthGuard('appauth'))
    @Post('create-payment')
    async createPayment(
        @Body()
        {
            amount,
            id,
            entityType,
            productType,
            imageId,
        }: {
            amount: number;
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

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount * 100,
                currency: 'usd',
                metadata: {
                    id: targetEntityType === EntityType.IMAGE ? targetImageId : id,
                    imageId: targetEntityType === EntityType.IMAGE ? targetImageId : '',
                    entityType: targetEntityType,
                    productType: targetProductType,
                    packType: targetEntityType === EntityType.PACK ? id : '',
                    userId: userId.toString(),
                },
            });

            return {
                clientSecret: paymentIntent.client_secret,
            };
        } catch (error) {
            console.error('Error creating payment intent:', error);
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
            clientSecret,
            discount,
        }: {
            paymentIntent: string;
            clientSecret: string;
            discount?: string;
        },
        @USER_ID() userId: string
    ): Promise<
        IMessage & {
            cat?: ICat;
        }
    > {
        try {
            const intent = await stripe.paymentIntents.retrieve(paymentIntent);

            if (intent.metadata.userId !== userId?.toString()) {
                throw new BadRequestException('Unauthorized payment confirmation');
            }

            if (intent.status !== 'succeeded') {
                throw new BadRequestException('Payment not successful');
            }

            const intentEntityType =
                intent.metadata.entityType === EntityType.IMAGE ? EntityType.IMAGE : EntityType.PACK;

            if (intentEntityType === EntityType.IMAGE) {
                const imageId = intent.metadata.imageId || intent.metadata.id;
                if (!imageId || !Types.ObjectId.isValid(imageId)) {
                    throw new BadRequestException('Generated image id is missing for portrait checkout');
                }

                const image = await this.imageRepository.findOne({
                    searchObject: { _id: new Types.ObjectId(imageId) },
                    projection: 'aiUrl',
                });
                if (!image?.aiUrl) {
                    throw new BadRequestException('Generated portrait not found');
                }

                const amountUsd = intent.amount / 100;
                await this.orderRepository.create({
                    status: OrderStatus.COMPLETE,
                    entityType: EntityType.IMAGE,
                    id: ProductType.DIGITAL,
                    user: new Types.ObjectId(userId),
                    price: amountUsd,
                    priceUsd: amountUsd,
                    currencyType: CurrencyType.USD,
                    chainType: ChainType.FIAT,
                    hash: intent.id,
                    walletAddress: ChainType.FIAT,
                    image: new Types.ObjectId(imageId),
                });

                await this.userRepository.update(userId, {
                    $inc: {
                        spent: amountUsd,
                        monthSpent: amountUsd,
                        portraitPurchases: 1,
                        monthPortraitPurchases: 1,
                    },
                });

                try {
                    await this.catService.createBlessingWithCat(userId, image.aiUrl);
                } catch (catError) {
                    console.error('Failed to create portrait blessing cat after stripe payment:', catError);
                }

                return { success: true, message: 'Pet immortalized successfully.' };
            }

            // If payment successful, create cat adoption order
            const order = await this.orderRepository.create({
                status: OrderStatus.COMPLETE,
                entityType: EntityType.PACK,
                id: intent.metadata.id,
                discount,
                user: new Types.ObjectId(userId),
                price: intent.amount / 100, // Convert from cents to dollars
                currencyType: CurrencyType.USDT,
                chainType: ChainType.FIAT,
                hash: intent.id,
                walletAddress: ChainType.FIAT,
            });
            const packType = (intent.metadata.packType || intent.metadata.id) as PackType;
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
            const user = new Types.ObjectId(intent.metadata.userId);
            const response = await this.grantBoughtCat({
                cat: blessing[0].cat,
                user,
                orderId: order._id,
                tier,
                packType,
            });

            if (response?.cat) {
                await this.orderRepository.update(order._id, { $set: { cat: response?.cat?._id } });
            }

            if (discount) {
                const discountOwner = await this.userRepository.findOne({
                    searchObject: { discount: discount.toLowerCase() },
                    projection: '_id',
                });
                if (discountOwner) {
                    await this.userRepository.update(discountOwner._id!, {
                        $inc: { affiliated: parseFloat(((intent.amount / 100) * 0.2).toFixed(1)) },
                    });
                }
            }

            return response;
        } catch (error) {
            console.error('Payment confirmation error:', error);
            throw new BadRequestException(error.message || 'Error confirming payment');
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
