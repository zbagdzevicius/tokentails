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
    getPortraitCheckoutPrice,
    getPortraitPriceCents,
    getShelterCatPriceCents,
    SHELTER_CAT_MIN_PRICE_CENTS,
    isPackType,
    isProductType,
    MAX_DISCOUNT_PERCENTAGE,
    PORTRAIT_LEGACY_DIGITAL_USD_CENTS,
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
    /**
     * Where the purchase started, kept in the intent metadata for reporting. `pawlegends`: the caller already ran
     * `PawlegendsCheckoutGuard.assert` (age band and spend cap) before asking for the intent.
     */
    context?: 'pawlegends';
    /** With `pawlegends`: the consent the guard accepted, stored in the intent metadata (launch item U5). */
    consent?: { version: string; at: string };
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

    /**
     * The card checkout (Stripe Checkout Session) amount of a portrait, in **euro cents**
     * (`getPortraitCheckoutPrice`, €14 / €49 / €69). The session must be created in `eur`.
     */
    portraitCheckoutAmountCents(productType: ProductType): number {
        if (!isProductType(productType)) {
            throw new BadRequestException('Invalid productType. Must be digital, print, or canvas');
        }
        return getPortraitCheckoutPrice(productType).cents;
    }

    /**
     * Returns the discount percentage for a code that belongs to a user, else 0. A buyer's own code
     * gives nothing: no discount, and so no affiliate share to themselves.
     */
    async resolveDiscount(code?: string, buyerId?: unknown): Promise<{ code?: string; percentage: number }> {
        const normalized = code?.trim().toLowerCase();
        if (!normalized) {
            return { percentage: 0 };
        }
        const owner = await this.userRepository.findOne({
            searchObject: { discount: normalized },
            projection: '_id',
        });
        if (!owner || (buyerId != null && String(owner._id) === String(buyerId))) {
            return { percentage: 0 };
        }
        return { code: normalized, percentage: discountPercentageForCode(normalized) };
    }

    async quotePaymentIntent(input: PaymentIntentQuoteInput, now: Date = new Date()): Promise<PaymentIntentQuote> {
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
                    ...(input.context === 'pawlegends' ? { context: 'pawlegends' } : {}),
                    ...(input.context === 'pawlegends' && input.consent
                        ? { consent_version: input.consent.version, consent_at: input.consent.at }
                        : {}),
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
            baseCents = getPackPriceCents(input.packType, now);
        }

        const { code, percentage } = await this.resolveDiscount(input.discount, input.userId);
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

    async createPaymentIntent(
        input: PaymentIntentQuoteInput,
        now: Date = new Date()
    ): Promise<{ clientSecret: string | null }> {
        const quote = await this.quotePaymentIntent(input, now);
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
     * it succeeded, it is in USD, and the amount received covers the server price at the intent's creation.
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
        const createdAt = typeof intent.created === 'number' ? new Date(intent.created * 1000) : new Date();

        if (entityType === EntityType.IMAGE) {
            if (!isProductType(productType)) {
                throw new BadRequestException('Unknown portrait product');
            }
            imageId = metadata.imageId || metadata.id;
            if (!imageId || !Types.ObjectId.isValid(imageId)) {
                throw new BadRequestException('Generated image id is missing for portrait checkout');
            }
            // Only used when the intent has no expectedAmount: today's table price.
            baseCents = getPortraitPriceCents(productType);
        } else {
            const rawPack = metadata.packType || metadata.id;
            if (!isPackType(rawPack)) {
                throw new BadRequestException('Unknown pack type');
            }
            packType = rawPack;
            // Price at the intent's creation, so a sale intent paid just after the sale ends still verifies.
            baseCents = getPackPriceCents(packType, createdAt);
        }

        // Intents created by this service carry the server-computed amount (`expectedAmount`). Older intents
        // do not, so they must at least cover the table price minus the largest possible discount.
        // A portrait intent is confirmed at the price stored on it, even if the table changed since (a $16
        // one must pay $16). Only the server writes intent metadata. Packs also keep the table floor at the
        // intent's creation (sale rules).
        // Only the old backend made digital portrait intents without `expectedAmount`, at the retired $6
        // price. One started before the deploy and confirmed after it has already been charged, so it is held
        // to $6, not to the $16 table. The old backend let the client pick the amount, so $6 stays the floor.
        const expectedAmount = Number(metadata.expectedAmount);
        const hasExpected = Number.isFinite(expectedAmount) && expectedAmount > 0;
        const tableFloor = applyDiscountCents(baseCents, MAX_DISCOUNT_PERCENTAGE);
        let minimumCents: number;
        if (hasExpected) {
            minimumCents = entityType === EntityType.IMAGE ? expectedAmount : Math.max(expectedAmount, tableFloor);
        } else if (entityType === EntityType.IMAGE && productType === ProductType.DIGITAL) {
            minimumCents = PORTRAIT_LEGACY_DIGITAL_USD_CENTS;
        } else {
            minimumCents = tableFloor;
        }

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
     * Returns an error message when a completed Checkout Session must not grant the order, else null
     * (price parity rule, docs/plans/yourcat-v2.md section 6.4).
     *
     * - The paid currency and amount are the session's source (creation) currency and amount when Stripe
     *   Adaptive Pricing localised it (`currency_conversion`), else `currency` / `amount_total`.
     * - The expected currency is the order's own: `eur` for a `CurrencyType.EUR` order (portrait card
     *   checkout), `usd` otherwise. Any other currency is refused.
     * - The expected amount is the price the server stored on the order when it created the session, else
     *   the table for that currency. So USD sessions created before the EUR change still complete.
     */
    checkPaidCheckoutSession(session: Stripe.Checkout.Session, order: IOrder): string | null {
        if (session.payment_status !== 'paid') {
            return `session ${session.id} is not paid (${session.payment_status})`;
        }
        const productType = order.id as ProductType;
        if (!isProductType(productType)) {
            return `order ${order._id} has unknown product ${String(order.id)}`;
        }
        const conversion = session.currency_conversion;
        const paidCurrency = ((conversion ? conversion.source_currency : session.currency) || '').toLowerCase();
        const paidCents = (conversion ? conversion.amount_total : session.amount_total) ?? 0;

        const expectedCurrency = order.currencyType === CurrencyType.EUR ? 'eur' : 'usd';
        if (paidCurrency !== expectedCurrency) {
            return `session ${session.id} has currency ${paidCurrency || 'none'}, order expects ${expectedCurrency}`;
        }
        const storedCents = typeof order.price === 'number' && order.price > 0 ? Math.round(order.price * 100) : 0;
        const tableCents =
            expectedCurrency === 'eur'
                ? getPortraitCheckoutPrice(productType).cents
                : getPortraitPriceCents(productType);
        const expected = storedCents || tableCents;
        if (paidCents < expected) {
            return `session ${session.id} paid ${paidCents} ${paidCurrency} cents, price is ${expected}`;
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
