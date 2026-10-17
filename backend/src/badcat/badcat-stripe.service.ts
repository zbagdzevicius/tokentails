import { Injectable, Logger } from '@nestjs/common';
import { STRIPE_API_VERSION } from 'src/payments/stripe-payment.service';
import Stripe from 'stripe';
import {
    BADCAT_SKUS,
    BRAND_SKUS,
    CHECKOUT_TRIGGERS,
    CheckoutRequest,
    CheckoutResponse,
    FOUNDING_CAP,
    FOUNDING_COUPON_ID,
    FOUNDING_RENEWAL_CENTS,
    GIFT_SKUS,
    isBadcatSku,
    SkuDef,
} from './badcat.contracts';
import { randomBytes } from 'crypto';
import { BADCAT_ERRORS } from './badcat.errors';
import {
    badcatEntitlementSecret,
    badcatPublicUrl,
    badcatStripeKey,
    badcatWebhookSecret,
    Env,
    isProduction,
} from './badcat-flags';
import { BadcatStore } from './badcat.schema';
import {
    bookableDays,
    compactMeta,
    dayNoOf,
    filterName,
    isCatCode,
    isFriday,
    isInt,
    metaValue,
    normalizeEmail,
    weekdayOf,
} from './badcat-util';

/*
 * Bad Cat Daily Stripe client (GDD 9.2, 10; FULL-PLAN decision 3). Key: `BADCAT_STRIPE_SECRET_KEY`, else the
 * shared `STRIPE_SECRET_KEY` (test or live). Checkout answers 503 until the key, BADCAT_STRIPE_WEBHOOK_SECRET
 * and the entitlement key are all set, so no payment is taken that could not be confirmed. Prices are inline
 * `price_data` from BADCAT_SKUS: no dashboard products. Every session carries the CheckoutMeta in its
 * metadata so purchases are counted from Stripe itself (GDD 14).
 */

/** How far ahead a cameo, guest star or sponsor day may be booked. */
export const MAX_BOOK_AHEAD_DAYS = 90;

export const FOUNDING_RENEWAL_TEXT =
    'Founding price: $24.99 for your first year, then it renews at $39.99/yr. Cancel any time from Restore purchases.';

/** A founding Checkout Session stays open this long (Stripe's minimum is 30 minutes); its place is held. */
export const FOUNDING_SESSION_TTL_MS = 31 * 60 * 1000;
/** A hold outlives its session by this margin, so a late webhook still finds the place reserved. */
export const FOUNDING_HOLD_MARGIN_MS = 10 * 60 * 1000;

/** Founding places taken: founding subscriptions that were not refunded. */
export const FOUNDING_FILTER = { sku: 'founding', kind: 'subscription', status: { $ne: 'refunded' } };

/**
 * The return base when it is the public origin (or a path under it); http://localhost and 127.0.0.1
 * are accepted outside production. null otherwise.
 */
export function validReturnBase(base: unknown, env: Env = process.env): string | null {
    if (typeof base !== 'string' || !base || base.length > 300) return null;
    let url: URL;
    try {
        url = new URL(base);
    } catch {
        return null;
    }
    if (url.search || url.hash || url.username || url.password) return null;
    const clean = base.replace(/\/+$/, '');
    const origin = badcatPublicUrl(env);
    if (clean === origin || clean.startsWith(`${origin}/`)) return clean;
    if (!isProduction(env) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/[\w\-/.]*)?$/.test(clean)) return clean;
    return null;
}

/** The Stripe metadata of a request (strings only, ≤ 500 characters each). */
export function checkoutMetadata(req: CheckoutRequest): Record<string, string> {
    const meta = req.meta || ({} as CheckoutRequest['meta']);
    const via = typeof meta.via === 'string' ? meta.via.trim().toLowerCase() : '';
    const def = BADCAT_SKUS[req.sku];
    return compactMeta({
        badcat: '1',
        sku: req.sku,
        trigger: CHECKOUT_TRIGGERS.includes(meta.trigger) ? meta.trigger : 'home',
        via: /^[a-z0-9_]{1,24}$/.test(via) ? via : undefined,
        entry: metaValue(meta.entry, 40),
        from_in_app: meta.from_in_app === true ? 'true' : 'false',
        ab_arm: meta.ab_arm === 'A' || meta.ab_arm === 'B' ? meta.ab_arm : undefined,
        session_index: isInt(meta.session_index) && meta.session_index >= 0 ? String(meta.session_index) : undefined,
        cat: def.needsCat && isCatCode(req.catCode) ? req.catCode : undefined,
        cat_name: def.needsCat ? filterName(req.catName) : undefined,
        day: def.needsDay && isInt(req.dayNo) ? String(req.dayNo) : undefined,
        gift_for: GIFT_SKUS.includes(req.sku) && req.giftFor ? filterName(req.giftFor, 24) : undefined,
        brand_name: BRAND_SKUS.includes(req.sku) ? metaValue(req.brand?.name, 80) : undefined,
        brand_url: BRAND_SKUS.includes(req.sku) ? metaValue(req.brand?.url, 200) : undefined,
        brand_note: BRAND_SKUS.includes(req.sku) ? metaValue(req.brand?.note, 500) : undefined,
        face_opt_in: def.needsCat && req.faceOptIn === true ? 'true' : undefined,
    });
}

export interface CheckoutBuildOptions {
    returnBase: string;
    email?: string | null;
}

/** Stripe Checkout Session parameters for a validated request (pure). */
export function buildCheckoutParams(
    req: CheckoutRequest,
    options: CheckoutBuildOptions
): Stripe.Checkout.SessionCreateParams {
    const def: SkuDef = BADCAT_SKUS[req.sku];
    const metadata = checkoutMetadata(req);
    const founding = req.sku === 'founding';
    const recurring = !!def.recurring;
    const unitAmount = founding ? FOUNDING_RENEWAL_CENTS : def.cents;
    const description = def.needsCat
        ? `${metadata.cat_name}${metadata.day ? `, day ${metadata.day}` : ''}`
        : founding
        ? 'Chaos Club, yearly at the founding price for the first year'
        : undefined;
    const params: Stripe.Checkout.SessionCreateParams = {
        mode: recurring ? 'subscription' : 'payment',
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: 'usd',
                    unit_amount: unitAmount,
                    product_data: { name: def.label, ...(description ? { description } : {}) },
                    ...(recurring ? { recurring: { interval: def.recurring! } } : {}),
                },
            },
        ],
        success_url: `${options.returnBase}/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: options.returnBase,
        metadata,
        ...(options.email ? { customer_email: options.email } : {}),
    };
    if (recurring) {
        params.subscription_data = { metadata };
    } else {
        // Checkout always collects an email; `always` also makes a Customer, so restore and the portal work.
        params.customer_creation = 'always';
        params.payment_intent_data = { metadata };
    }
    if (founding) {
        params.discounts = [{ coupon: FOUNDING_COUPON_ID }];
        params.custom_text = { submit: { message: FOUNDING_RENEWAL_TEXT } };
    }
    return params;
}

@Injectable()
export class BadcatStripeService {
    private readonly logger = new Logger(BadcatStripeService.name);
    private client?: { key: string; stripe: Stripe };
    private couponReady = false;
    /** Replaceable in specs (no network there). */
    createClient: (key: string) => Stripe = key => new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    now: () => Date = () => new Date();

    constructor(private readonly store: BadcatStore) {}

    /** The badcat Stripe client; 503 without a usable key (missing, an unknown prefix, or the wrong mode here). */
    stripe(env: Env = process.env): Stripe {
        const state = badcatStripeKey(env);
        if (!state.usable || !state.key) {
            throw BADCAT_ERRORS.stripeUnavailable();
        }
        if (!this.client || this.client.key !== state.key) {
            this.client = { key: state.key, stripe: this.createClient(state.key) };
            this.couponReady = false;
        }
        return this.client.stripe;
    }

    /** Paid founding places plus the places held by open founding Checkout Sessions. */
    async foundingTaken(): Promise<number> {
        const paid = await this.store.purchases.countDocuments(FOUNDING_FILTER);
        const held = await this.store.foundingHolds.countDocuments({ expiresAt: { $gt: this.now() } });
        return paid + held;
    }

    /** Frees the hold of a founding session (paid: the purchase row counts now; expired: the place is free). */
    async releaseFoundingHold(sessionId: string): Promise<void> {
        await this.store.foundingHolds.deleteMany({ sessionId });
    }

    async foundingLeft(): Promise<number> {
        return Math.max(0, FOUNDING_CAP - (await this.foundingTaken()));
    }

    /** Validates the request against the SKU table; throws 400 with a reason. */
    validate(req: CheckoutRequest, env: Env = process.env): { returnBase: string; email: string | null } {
        if (!req || typeof req !== 'object' || !isBadcatSku(req.sku)) {
            throw BADCAT_ERRORS.invalid('Unknown sku');
        }
        if (!req.meta || typeof req.meta !== 'object') throw BADCAT_ERRORS.invalid('meta is required');
        const returnBase = validReturnBase(req.returnBase, env);
        if (!returnBase) throw BADCAT_ERRORS.invalid('returnBase must start with BADCAT_PUBLIC_URL');
        const def = BADCAT_SKUS[req.sku];
        if (def.needsCat) {
            if (!isCatCode(req.catCode)) throw BADCAT_ERRORS.invalid('catCode is required');
            if (typeof req.catName !== 'string' || !req.catName.trim())
                throw BADCAT_ERRORS.invalid('catName is required');
        }
        if (def.needsDay) {
            const { min, max } = bookableDays(dayNoOf(this.now()), MAX_BOOK_AHEAD_DAYS);
            if (!isInt(req.dayNo) || req.dayNo < min || req.dayNo > max) {
                throw BADCAT_ERRORS.invalid(`dayNo must be between ${min} and ${max}`);
            }
            if (req.sku === 'guest_star' && !isFriday(req.dayNo))
                throw BADCAT_ERRORS.invalid('Guest stars play on Fridays');
            if (req.sku === 'sponsor_week' && weekdayOf(req.dayNo) !== 5) {
                throw BADCAT_ERRORS.invalid('Sponsor rooms are the Saturday boss room');
            }
        }
        if (BRAND_SKUS.includes(req.sku) && !metaValue(req.brand?.name, 80)) {
            throw BADCAT_ERRORS.invalid('brand.name is required');
        }
        if (req.email !== undefined && req.email !== null && req.email !== '' && !normalizeEmail(req.email)) {
            throw BADCAT_ERRORS.invalid('email is not valid');
        }
        return { returnBase, email: normalizeEmail(req.email) };
    }

    /** Creates the founding coupon once (a $15 once-only discount: $39.99 → $24.99 the first year). */
    async ensureFoundingCoupon(stripe: Stripe): Promise<void> {
        if (this.couponReady) return;
        try {
            await stripe.coupons.retrieve(FOUNDING_COUPON_ID);
        } catch (error: any) {
            if (error?.code !== 'resource_missing' && error?.statusCode !== 404) throw error;
            await stripe.coupons.create({
                id: FOUNDING_COUPON_ID,
                name: 'Founding Bad Cat',
                amount_off: FOUNDING_RENEWAL_CENTS - BADCAT_SKUS.founding.cents,
                currency: 'usd',
                duration: 'once',
            });
        }
        this.couponReady = true;
    }

    async createCheckout(req: CheckoutRequest, env: Env = process.env): Promise<CheckoutResponse> {
        const { returnBase, email } = this.validate(req, env);
        const stripe = this.stripe(env);
        // Never take money that could not be confirmed (webhook) or turned into an entitlement.
        if (!badcatWebhookSecret(env)) throw BADCAT_ERRORS.webhookUnavailable();
        if (!badcatEntitlementSecret(env)) throw BADCAT_ERRORS.secretMissing();
        const params = buildCheckoutParams(req, { returnBase, email });
        let holdId: string | null = null;
        if (req.sku === 'founding') {
            // Reserve the place first, then count: two buyers racing for the last place cannot both pass.
            if ((await this.foundingLeft()) <= 0) throw BADCAT_ERRORS.soldOut();
            const now = this.now().getTime();
            holdId = `hold_${randomBytes(12).toString('hex')}`;
            await this.store.foundingHolds.create({
                holdId,
                expiresAt: new Date(now + FOUNDING_SESSION_TTL_MS + FOUNDING_HOLD_MARGIN_MS),
            });
            if ((await this.foundingTaken()) > FOUNDING_CAP) {
                await this.store.foundingHolds.deleteMany({ holdId });
                throw BADCAT_ERRORS.soldOut();
            }
            params.expires_at = Math.floor((now + FOUNDING_SESSION_TTL_MS) / 1000);
        }
        let session: Stripe.Checkout.Session;
        try {
            if (holdId) await this.ensureFoundingCoupon(stripe);
            session = await stripe.checkout.sessions.create(params);
        } catch (error) {
            if (holdId) await this.store.foundingHolds.deleteMany({ holdId });
            throw error;
        }
        if (holdId) await this.store.foundingHolds.updateOne({ holdId }, { $set: { sessionId: session.id } });
        if (!session.url) {
            this.logger.error(`Checkout session ${session.id} has no URL`);
            if (holdId) await this.store.foundingHolds.deleteMany({ holdId });
            throw BADCAT_ERRORS.stripeUnavailable();
        }
        return { url: session.url, sessionId: session.id };
    }

    /** Stripe customer portal for a customer (cancel, change plan). */
    async portalUrl(customerId: string, env: Env = process.env): Promise<string> {
        const session = await this.stripe(env).billingPortal.sessions.create({
            customer: customerId,
            return_url: `${badcatPublicUrl(env)}/badcat`,
        });
        return session.url;
    }
}
