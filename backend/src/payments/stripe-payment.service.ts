import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { UserRepository } from 'src/user/user.repository';
import { OrderRepository } from 'src/web3/order.repository';
import { IOrder, Order, OrderStatus, PackType, ProductType } from 'src/web3/order.schema';
import { ChainType } from 'src/web3/web3.model';
import Stripe from 'stripe';
import {
    applyDiscountCents,
    discountPercentageForCode,
    getPackPriceCents,
    getPortraitPriceCents,
    getShelterCatPriceCents,
    SHELTER_CAT_MIN_PRICE_CENTS,
    isPackType,
    isProductType,
    MAX_DISCOUNT_PERCENTAGE,
} from './price-table';

export const STRIPE_API_VERSION = '2025-12-15.clover';

/** What a PaymentIntent can buy: a portrait, a pack, or one shelter cat (basic tier, $5 floor). */
export type PaymentIntentEntity = EntityType.IMAGE | EntityType.PACK | EntityType.CAT;

export interface PaymentIntentQuoteInput {
    entityType: PaymentIntentEntity;
    /** The catalogue cat id, for `EntityType.CAT`. */
    catId?: string;
    productType?: ProductType;
    packType?: string;
    imageId?: string;
    userId: string;
    discount?: string;
}

export interface PaymentIntentQuote {
    amountCents: number;
    discount?: string;
    discountPercentage: number;
    metadata: Record<string, string>;
}

export interface VerifiedPaymentIntent {
    intentId: string;
    entityType: PaymentIntentEntity;
    catId?: string;
    productType: ProductType;
    packType?: PackType;
    imageId?: string;
    discount?: string;
    amountCents: number;
    amountUsd: number;
}

export type ClaimResult = { claimed: true; order: IOrder } | { claimed: false; order: IOrder | null };

/**
 * Stripe pricing, verification and idempotency, shared by the Checkout Session flow
 * (image controller + webhook) and the PaymentIntent flow (web3 create-payment / confirm-payment).
 * Granting items stays in the controllers.
 */
@Injectable()
export class StripePaymentService {
    private stripeClient?: Stripe;
    // Single-instance deployment (docs/DEPLOYMENT.md): blocks concurrent confirms of one intent
    // even before the unique `hash` index exists.
    private readonly inFlight = new Set<string>();

    constructor(private orderRepository: OrderRepository, private userRepository: UserRepository) {}

    get stripe(): Stripe {
        if (!this.stripeClient) {
            this.stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
        }
        return this.stripeClient;
    }

    // ----- pricing -----

    portraitCheckoutAmountCents(productType: ProductType): number {
        if (!isProductType(productType)) {
            throw new BadRequestException('Invalid productType. Must be digital, print, or canvas');
        }
        return getPortraitPriceCents(productType);
    }

    /** Returns the discount percentage for a code that belongs to a user, else 0. */
    async resolveDiscount(code?: string): Promise<{ code?: string; percentage: number }> {
        const normalized = code?.trim().toLowerCase();
        if (!normalized) {
            return { percentage: 0 };
        }
        const owner = await this.userRepository.findOne({
            searchObject: { discount: normalized },
            projection: '_id',
        });
        if (!owner) {
            return { percentage: 0 };
        }
        return { code: normalized, percentage: discountPercentageForCode(normalized) };
    }

    async quotePaymentIntent(input: PaymentIntentQuoteInput): Promise<PaymentIntentQuote> {
        let baseCents: number;
        let productType = ProductType.DIGITAL;
        let packType = '';

        if (input.entityType === EntityType.CAT) {
            if (!input.catId || !Types.ObjectId.isValid(input.catId)) {
                throw new BadRequestException('Cat is not for sale');
            }
            const catId = String(input.catId);
            // A shelter cat is never below its floor: no discount code applies.
            const amountCents = getShelterCatPriceCents();
            return {
                amountCents,
                discountPercentage: 0,
                metadata: {
                    id: catId,
                    imageId: '',
                    catId,
                    entityType: EntityType.CAT,
                    productType: '',
                    packType: '',
                    userId: input.userId.toString(),
                    discount: '',
                    discountPercentage: '0',
                    expectedAmount: String(amountCents),
                },
            };
        }
        if (input.entityType === EntityType.IMAGE) {
            productType = input.productType || ProductType.DIGITAL;
            if (!isProductType(productType)) {
                throw new BadRequestException('Invalid productType');
            }
            baseCents = getPortraitPriceCents(productType);
        } else {
            if (!isPackType(input.packType)) {
                throw new BadRequestException('Invalid pack type');
            }
            packType = input.packType;
            baseCents = getPackPriceCents(input.packType);
        }

        const { code, percentage } = await this.resolveDiscount(input.discount);
        const amountCents = applyDiscountCents(baseCents, percentage);

        return {
            amountCents,
            discount: code,
            discountPercentage: percentage,
            metadata: {
                id: input.entityType === EntityType.IMAGE ? input.imageId || '' : packType,
                imageId: input.entityType === EntityType.IMAGE ? input.imageId || '' : '',
                entityType: input.entityType,
                productType,
                packType,
                userId: input.userId.toString(),
                discount: code || '',
                discountPercentage: String(percentage),
                expectedAmount: String(amountCents),
            },
        };
    }

    async createPaymentIntent(input: PaymentIntentQuoteInput): Promise<{ clientSecret: string | null }> {
        const quote = await this.quotePaymentIntent(input);
        const paymentIntent = await this.stripe.paymentIntents.create({
            amount: quote.amountCents,
            currency: 'usd',
            metadata: quote.metadata,
        });
        return { clientSecret: paymentIntent.client_secret };
    }

    // ----- verification -----

    /**
     * Checks a retrieved PaymentIntent before anything is granted: it belongs to the caller,
     * it succeeded, it is in USD, and the amount received covers the server price.
     */
    verifySucceededPaymentIntent(intent: Stripe.PaymentIntent, userId: string): VerifiedPaymentIntent {
        const metadata = intent.metadata || {};

        if (!userId || metadata.userId !== userId.toString()) {
            throw new BadRequestException('Unauthorized payment confirmation');
        }
        if (intent.status !== 'succeeded') {
            throw new BadRequestException('Payment not successful');
        }
        if ((intent.currency || '').toLowerCase() !== 'usd') {
            throw new BadRequestException('Unexpected payment currency');
        }

        if (metadata.entityType === EntityType.CAT) {
            const catId = metadata.catId || metadata.id;
            if (!catId || !Types.ObjectId.isValid(catId)) {
                throw new BadRequestException('Cat id is missing for this payment');
            }
            // The price the intent was created at, and never below the $5 floor.
            const expected = Number(metadata.expectedAmount);
            const minimumCents = Math.max(
                SHELTER_CAT_MIN_PRICE_CENTS,
                Number.isFinite(expected) && expected > 0 ? expected : getShelterCatPriceCents()
            );
            const received = intent.amount_received ?? 0;
            if (received < minimumCents || intent.amount < minimumCents) {
                throw new BadRequestException('Payment amount does not match the price');
            }
            return {
                intentId: intent.id,
                entityType: EntityType.CAT,
                productType: ProductType.DIGITAL,
                catId,
                amountCents: received,
                amountUsd: received / 100,
            };
        }
        const entityType = metadata.entityType === EntityType.IMAGE ? EntityType.IMAGE : EntityType.PACK;
        const productType = (metadata.productType as ProductType) || ProductType.DIGITAL;
        let baseCents: number;
        let packType: PackType | undefined;
        let imageId: string | undefined;

        if (entityType === EntityType.IMAGE) {
            if (!isProductType(productType)) {
                throw new BadRequestException('Unknown portrait product');
            }
            imageId = metadata.imageId || metadata.id;
            if (!imageId || !Types.ObjectId.isValid(imageId)) {
                throw new BadRequestException('Generated image id is missing for portrait checkout');
            }
            baseCents = getPortraitPriceCents(productType);
        } else {
            const rawPack = metadata.packType || metadata.id;
            if (!isPackType(rawPack)) {
                throw new BadRequestException('Unknown pack type');
            }
            packType = rawPack;
            baseCents = getPackPriceCents(packType);
        }

        // Intents created by this service carry the server-computed amount. Older intents do not,
        // so they must at least cover the table price minus the largest possible discount.
        const expectedAmount = Number(metadata.expectedAmount);
        const minimumCents =
            Number.isFinite(expectedAmount) && expectedAmount > 0
                ? Math.max(expectedAmount, applyDiscountCents(baseCents, MAX_DISCOUNT_PERCENTAGE))
                : applyDiscountCents(baseCents, MAX_DISCOUNT_PERCENTAGE);

        const received = intent.amount_received ?? 0;
        if (received < minimumCents || intent.amount < minimumCents) {
            throw new BadRequestException('Payment amount does not match the price');
        }

        return {
            intentId: intent.id,
            entityType,
            productType,
            packType,
            imageId,
            discount: metadata.discount || undefined,
            amountCents: received,
            amountUsd: received / 100,
        };
    }

    async retrieveVerifiedPaymentIntent(paymentIntentId: string, userId: string): Promise<VerifiedPaymentIntent> {
        if (!paymentIntentId || typeof paymentIntentId !== 'string') {
            throw new BadRequestException('paymentIntent is required');
        }
        const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
        return this.verifySucceededPaymentIntent(intent, userId);
    }

    /**
     * Returns an error message when a completed Checkout Session must not grant the order, else null.
     * The price is checked against the server table for the product stored on the order.
     */
    checkPaidCheckoutSession(session: Stripe.Checkout.Session, order: IOrder): string | null {
        if (session.payment_status !== 'paid') {
            return `session ${session.id} is not paid (${session.payment_status})`;
        }
        if ((session.currency || '').toLowerCase() !== 'usd') {
            return `session ${session.id} has currency ${session.currency}`;
        }
        const productType = order.id as ProductType;
        if (!isProductType(productType)) {
            return `order ${order._id} has unknown product ${String(order.id)}`;
        }
        const expected = getPortraitPriceCents(productType);
        if ((session.amount_total ?? 0) < expected) {
            return `session ${session.id} paid ${session.amount_total} cents, price is ${expected}`;
        }
        return null;
    }

    // ----- idempotency -----

    /**
     * Atomically creates the order for a PaymentIntent, keyed on the intent id stored in `hash`.
     * Only the first caller gets `claimed: true`; replays get the existing order and must not grant.
     * Fully race-safe across processes once `hash` has a unique index (platform fix 1).
     */
    async claimPaymentIntent(verified: VerifiedPaymentIntent, fields: Partial<Order>): Promise<ClaimResult> {
        if (this.inFlight.has(verified.intentId)) {
            return { claimed: false, order: null };
        }
        this.inFlight.add(verified.intentId);
        try {
            const result: any = await this.orderRepository.model.findOneAndUpdate(
                { hash: verified.intentId },
                {
                    $setOnInsert: {
                        status: OrderStatus.PENDING,
                        hash: verified.intentId,
                        chainType: ChainType.FIAT,
                        walletAddress: ChainType.FIAT,
                        currencyType: CurrencyType.USD,
                        price: verified.amountUsd,
                        priceUsd: verified.amountUsd,
                        ...fields,
                    },
                },
                { upsert: true, new: true, rawResult: true }
            );
            const order = (result?.value?.toObject ? result.value.toObject() : result?.value) as IOrder;
            const inserted = result?.lastErrorObject?.updatedExisting === false;
            return inserted ? { claimed: true, order } : { claimed: false, order };
        } catch (error: any) {
            if (error?.code === 11000) {
                const order = await this.orderRepository.findOne({ searchObject: { hash: verified.intentId } });
                return { claimed: false, order };
            }
            throw error;
        } finally {
            this.inFlight.delete(verified.intentId);
        }
    }

    /**
     * Atomically moves a Checkout order from PENDING to COMPLETE. Returns null when another
     * delivery of the webhook already did it, so the caller must not grant again.
     */
    async completePendingOrder(orderId: string | Types.ObjectId): Promise<IOrder | null> {
        return this.orderRepository.model
            .findOneAndUpdate(
                { _id: orderId, status: OrderStatus.PENDING },
                { $set: { status: OrderStatus.COMPLETE } },
                { new: true }
            )
            .lean() as unknown as Promise<IOrder | null>;
    }
}
