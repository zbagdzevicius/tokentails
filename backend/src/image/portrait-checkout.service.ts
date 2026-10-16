import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    getPortraitCheckoutPrice,
    PORTRAIT_CHECKOUT_CURRENCY,
    portraitPriceUsdForStats,
} from 'src/payments/price-table';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { OrderRepository } from 'src/web3/order.repository';
import { OrderStatus, ProductType } from 'src/web3/order.schema';
import { ChainType } from 'src/web3/web3.model';
import Stripe from 'stripe';

/*
 * Stripe Checkout Sessions for portraits (bet #3, docs/plans/yourcat-v2.md section 2.4 and 6.5), used by
 * `POST /image/create-checkout-session`, its `-signed` variant and `POST /yourcat/:id/portrait-checkout`.
 *
 * - Charged in euros from `getPortraitCheckoutPrice` (€14 / €49 / €69), on the line item and on the
 *   shipping rate, with Adaptive Pricing off so the session stays in EUR (displayed == charged).
 * - Digital portraits require Stripe's terms checkbox with the withdrawal acknowledgement (section 6.5).
 *   This needs a terms of service URL in the Stripe account settings, or session creation fails, so the
 *   legacy routes ask for it only with `PORTRAIT_CHECKOUT_TOS_CONSENT=true` (`withdrawalCheckboxOn`).
 * - Sessions expire after 2 h. The PENDING order stores the euro price, `currencyType: EUR` and a
 *   USD figure for stats only.
 */

export const PORTRAIT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Whether a digital session asks for the withdrawal checkbox. Stripe refuses to create a session with
 * `consent_collection.terms_of_service` while the account has no terms of service URL, so on the legacy
 * `/portrait` routes it waits for `PORTRAIT_CHECKOUT_TOS_CONSENT=true` (set it once the URL is in the
 * Stripe settings). `/yourcat` always asks: its launch condition includes that URL (section 10).
 */
export function withdrawalCheckboxOn(
    input: { metadata?: Record<string, string> },
    env: NodeJS.ProcessEnv = process.env
): boolean {
    return input.metadata?.source === 'yourcat' || env.PORTRAIT_CHECKOUT_TOS_CONSENT === 'true';
}

export const WITHDRAWAL_ACKNOWLEDGEMENT =
    'I want my portrait painted and delivered right away, and I understand that I lose my 14-day right of withdrawal once it is delivered.';

/** Shipping countries for print and canvas: the Americas, Australia and New Zealand, Europe except RU, UA, BY. */
export const PORTRAIT_SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
    [
        // North America
        'US',
        'CA',
        'MX',
        // Central America
        'GT',
        'BZ',
        'SV',
        'HN',
        'NI',
        'CR',
        'PA',
        // Caribbean
        'JM',
        'HT',
        'DO',
        'PR',
        'TT',
        'BB',
        'BS',
        'AG',
        'GD',
        'KN',
        'LC',
        'VC',
        'DM',
        'SR',
        'GY',
        'GF',
        'GP',
        'MQ',
        'CW',
        'AW',
        'BQ',
        'SX',
        // South America
        'BR',
        'AR',
        'CO',
        'PE',
        'VE',
        'CL',
        'EC',
        'BO',
        'PY',
        'UY',
        'FK',
        // Australia
        'AU',
        'NZ',
        // Europe (excluding Russia, Ukraine, Belarus)
        'GB',
        'IE',
        'FR',
        'DE',
        'IT',
        'ES',
        'NL',
        'BE',
        'AT',
        'CH',
        'SE',
        'NO',
        'DK',
        'FI',
        'PL',
        'CZ',
        'PT',
        'GR',
        'HU',
        'RO',
        'BG',
        'HR',
        'SK',
        'SI',
        'EE',
        'LV',
        'LT',
        'LU',
        'MT',
        'CY',
        'IS',
        'LI',
        'MC',
        'AD',
        'SM',
        'VA',
        'AL',
        'BA',
        'ME',
        'MK',
        'RS',
    ];

export interface IPortraitCheckoutInput {
    productType: ProductType;
    /** The image being bought, if any (the legacy routes allow none). */
    image?: Types.ObjectId | string | null;
    userId: string;
    /** Prefills Checkout's email field; otherwise Checkout collects it. */
    email?: string | null;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
    /** The order id to use (the legacy success URL carries it). */
    orderId?: Types.ObjectId;
}

export interface IPortraitCheckoutResult {
    url: string;
    orderId: string;
    sessionId: string;
}

@Injectable()
export class PortraitCheckoutService {
    /** Clock, replaceable in specs. */
    now: () => Date = () => new Date();

    constructor(
        private readonly stripePayments: StripePaymentService,
        private readonly orderRepository: OrderRepository
    ) {}

    get stripe(): Stripe {
        return this.stripePayments.stripe;
    }

    /** The session parameters for `input` (exported for specs). */
    sessionParams(input: IPortraitCheckoutInput): Stripe.Checkout.SessionCreateParams {
        const { cents } = getPortraitCheckoutPrice(input.productType);
        const productType = input.productType;
        const requiresShipping = productType === ProductType.PRINT || productType === ProductType.CANVAS;
        const params: Stripe.Checkout.SessionCreateParams = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: PORTRAIT_CHECKOUT_CURRENCY,
                        product_data: {
                            name: `Portrait - ${productType.charAt(0).toUpperCase() + productType.slice(1)}`,
                            description: `Portrait ${productType === ProductType.DIGITAL ? 'download' : productType}`,
                        },
                        unit_amount: cents, // server price in euro cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // The session stays in EUR: no localised currency, so the amount shown is the amount charged.
            adaptive_pricing: { enabled: false },
            expires_at: Math.floor((this.now().getTime() + PORTRAIT_SESSION_TTL_MS) / 1000),
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: {
                userId: input.userId || '',
                productType,
                image: input.image ? String(input.image) : '',
                ...(input.metadata || {}),
            },
        };
        if (input.email) {
            params.customer_email = input.email;
        }
        if (productType === ProductType.DIGITAL && withdrawalCheckboxOn(input)) {
            params.consent_collection = { terms_of_service: 'required' };
            params.custom_text = { terms_of_service_acceptance: { message: WITHDRAWAL_ACKNOWLEDGEMENT } };
        }
        if (requiresShipping) {
            params.phone_number_collection = { enabled: true };
            params.shipping_address_collection = { allowed_countries: PORTRAIT_SHIPPING_COUNTRIES };
            params.shipping_options = [
                {
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: {
                            amount: 0, // Free shipping - adjust as needed
                            currency: PORTRAIT_CHECKOUT_CURRENCY,
                        },
                        display_name: 'Standard Shipping',
                        delivery_estimate: {
                            minimum: { unit: 'business_day', value: 3 },
                            maximum: { unit: 'business_day', value: 12 },
                        },
                    },
                },
            ];
        }
        return params;
    }

    /** Creates the Stripe session and its PENDING order. */
    async create(input: IPortraitCheckoutInput): Promise<IPortraitCheckoutResult> {
        const { cents } = getPortraitCheckoutPrice(input.productType);
        const orderId = input.orderId || new Types.ObjectId();
        const session = await this.stripe.checkout.sessions.create(this.sessionParams(input));

        await this.orderRepository.create({
            _id: orderId,
            status: OrderStatus.PENDING,
            price: cents / 100, // euros
            priceUsd: portraitPriceUsdForStats(cents), // stats only
            entityType: EntityType.IMAGE,
            chainType: ChainType.FIAT,
            currencyType: CurrencyType.EUR,
            hash: session.id, // Store Stripe session ID in hash field
            id: input.productType as ProductType, // Store productType in id field
            image: input.image ? new Types.ObjectId(String(input.image)) : undefined,
            user: new Types.ObjectId(input.userId),
        } as any);

        return { url: session.url || '', orderId: orderId.toString(), sessionId: session.id };
    }
}
