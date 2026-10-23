/*
 * Test harness for the Pawlegends store specs: every service over in-memory models (the identity MemoryModel), a
 * fake Stripe client (no network) and the real stripe-node webhook verifier. Not a spec itself (no `.spec.ts`).
 */
import { HttpException } from '@nestjs/common';
import { STRIPE_API_VERSION } from 'src/payments/stripe-payment.service';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import Stripe from 'stripe';
import { PawlegendsSku } from './pawlegends.contracts';
import { PawlegendsStore } from './pawlegends.schema';
import { PawlegendsAccountService } from './pawlegends-account.service';
import { PawlegendsOfferService } from './pawlegends-offer.service';
import { PawlegendsStripeService } from './pawlegends-stripe.service';
import { PawlegendsWebhookService } from './pawlegends-webhook.service';

export const NOW = new Date('2026-11-12T12:00:00Z');
export const WEBHOOK_SECRET = 'whsec_test_pawlegends';
export const ENTITLEMENT_SECRET = 'pawlegends-entitlement-secret-for-specs';
export const DEVICE = 'device-aaaaaaaa';
export const DEVICE2 = 'device-bbbbbbbb';

/** Every secret checkout needs. There is no on/off flag: these are all it takes. */
export const ON_ENV: Record<string, string> = {
    NODE_ENV: 'test',
    PAWLEGENDS_STRIPE_SECRET_KEY: 'sk_test_pawlegends_spec',
    PAWLEGENDS_STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PAWLEGENDS_ENTITLEMENT_SECRET: ENTITLEMENT_SECRET,
    PAWLEGENDS_DEV_LINKS: 'true',
};

export const statusOf = async (promise: Promise<unknown>): Promise<number> => {
    try {
        await promise;
        return 200;
    } catch (error) {
        if (error instanceof HttpException) return error.getStatus();
        throw error;
    }
};

export const codeOf = async (promise: Promise<unknown>): Promise<string | null> => {
    try {
        await promise;
        return null;
    } catch (error) {
        if (error instanceof HttpException) return (error.getResponse() as any)?.code ?? null;
        throw error;
    }
};

export function fakeStripe() {
    let n = 0;
    let r = 0;
    return {
        refunds: {
            create: jest.fn(async (params: Stripe.RefundCreateParams) => {
                r++;
                return { id: `re_test_pawlegends${String(r).padStart(6, '0')}`, params };
            }),
        },
        checkout: {
            sessions: {
                create: jest.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
                    n++;
                    return {
                        id: `cs_test_pawlegends${String(n).padStart(6, '0')}`,
                        url: `https://checkout.stripe.com/c/pay/cs_test_${n}`,
                        params,
                    };
                }),
            },
        },
    };
}

export function signedEvent(event: Record<string, unknown>, secret = WEBHOOK_SECRET) {
    const payload = JSON.stringify({ object: 'event', livemode: false, api_version: STRIPE_API_VERSION, ...event });
    const verifier = new Stripe('sk_test_verifier', { apiVersion: STRIPE_API_VERSION });
    const signature = verifier.webhooks.generateTestHeaderString({ payload, secret });
    return { rawBody: Buffer.from(payload), signature };
}

export function memoryStorage() {
    const hits = new Map<string, number>();
    return {
        hits,
        increment: jest.fn(async (key: string, ttl: number) => {
            hits.set(key, (hits.get(key) || 0) + 1);
            return { totalHits: hits.get(key)!, timeToExpire: ttl / 1000 };
        }),
    };
}

export function buildHarness() {
    const clock = { now: new Date(NOW.getTime()) };
    const now = () => new Date(clock.now.getTime());
    const models = {
        purchases: new MemoryModel([], [{ fields: ['sessionId'] }], now),
        buyers: new MemoryModel([], [{ fields: ['key'] }], now),
        offers: new MemoryModel([], [{ fields: ['deviceId'] }], now),
        restoreTokens: new MemoryModel([], [{ fields: ['tokenHash'] }], now),
        notify: new MemoryModel([], [{ fields: ['email'] }], now),
        webhookEvents: new MemoryModel([], [{ fields: ['eventId'] }], now),
    };
    const store = models as unknown as PawlegendsStore;
    const stripeClient = fakeStripe();
    const stripe = new PawlegendsStripeService(store);
    stripe.createClient = () => stripeClient as unknown as Stripe;
    stripe.now = now;
    const webhooks = new PawlegendsWebhookService(store, stripe);
    webhooks.now = now;
    const storage = memoryStorage();
    const account = new PawlegendsAccountService(store, storage as any);
    account.now = now;
    const sent: { url: string; body: any }[] = [];
    account.fetchImpl = jest.fn(async (url: string, init: any) => {
        sent.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 202 };
    });
    const offers = new PawlegendsOfferService(store, stripe, account);
    offers.now = now;
    return { clock, models, store, stripeClient, stripe, webhooks, account, offers, storage, sent };
}

export type Harness = ReturnType<typeof buildHarness>;

let eventSeq = 0;

/** A completed Checkout Session event for the session `checkout` created, as Stripe sends it. */
export function completedEvent(
    sessionId: string,
    params: Stripe.Checkout.SessionCreateParams,
    over: Record<string, unknown> = {}
) {
    const line = (params.line_items || [])[0] as any;
    eventSeq += 1;
    return {
        id: `evt_pawlegends_${eventSeq}`,
        type: 'checkout.session.completed',
        data: {
            object: {
                id: sessionId,
                object: 'checkout.session',
                payment_status: 'paid',
                amount_total: line?.price_data?.unit_amount,
                currency: line?.price_data?.currency,
                customer_email: params.customer_email ?? null,
                customer_details: { email: params.customer_email ?? 'buyer@example.com' },
                payment_intent: `pi_${sessionId}`,
                metadata: params.metadata,
                ...over,
            },
        },
    };
}

/** Creates a checkout and pays it through the signed webhook. Returns the session id. */
export async function buyAndPay(
    h: Harness,
    sku: PawlegendsSku,
    options: { currency?: 'usd' | 'eur'; email?: string; deviceId?: string; ageBand?: '16-17' | '18+' } = {}
): Promise<string> {
    const { sessionId } = await h.stripe.createCheckout(
        {
            sku,
            currency: options.currency || 'eur',
            email: options.email ?? 'buyer@example.com',
            ageBand: options.ageBand || '18+',
            consentVersion: '2026-10-17',
            deviceId: options.deviceId || DEVICE,
        },
        ON_ENV
    );
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    const params = calls[calls.length - 1][0] as Stripe.Checkout.SessionCreateParams;
    const { rawBody, signature } = signedEvent(completedEvent(sessionId, params));
    await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
    return sessionId;
}
