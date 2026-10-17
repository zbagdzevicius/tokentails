/*
 * Test harness for the badcat specs: every service over in-memory models (the identity MemoryModel), a
 * fake Stripe client (no network) whose `webhooks` is the real stripe-node verifier, a fake throttler
 * storage and a fake SendGrid transport. Not a spec itself (no `.spec.ts`).
 */
import { HttpException } from '@nestjs/common';
import { STRIPE_API_VERSION } from 'src/payments/stripe-payment.service';
import { IUniqueIndex, MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import Stripe from 'stripe';
import { BadcatController } from './badcat.controller';
import { BadcatStore } from './badcat.schema';
import { BadcatAccountService } from './badcat-account.service';
import { BadcatAdminService } from './badcat-admin.service';
import { BadcatCameoService } from './badcat-cameo.service';
import { BadcatSeenEmailJob } from './badcat-seen-email.job';
import { BadcatStripeService } from './badcat-stripe.service';
import { BadcatWebhookService } from './badcat-webhook.service';

/** Friday Nov 20, 2026 = day 5 (day 1 is Monday Nov 16). */
export const NOW = new Date('2026-11-20T12:00:00Z');
export const TODAY = 5;
export const WEBHOOK_SECRET = 'whsec_test_badcat';
export const ENTITLEMENT_SECRET = 'entitlement-secret-for-specs';
export const CAT = 'AbCdEfGhIjKlMnOpQr';
export const CAT2 = 'ZyXwVuTsRqPoNmLkJi';

/** Every secret checkout needs, so every feature is ready (there are no on/off flags). */
export const ON_ENV = {
    NODE_ENV: 'test',
    BADCAT_STRIPE_SECRET_KEY: 'sk_test_badcat_spec',
    BADCAT_STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    BADCAT_ENTITLEMENT_SECRET: ENTITLEMENT_SECRET,
    BADCAT_RESTORE_DEV_LINK: 'true',
};

/** Every BADCAT_* name and the ones the module reads, cleared before each spec. */
export const BADCAT_ENV_NAMES = [
    ...Object.keys(ON_ENV),
    'BADCAT_PUBLIC_URL',
    'SENDGRID_API_KEY',
    'STRIPE_SECRET_KEY',
    'INVALIDATE_CACHE_SECRET',
    // Phase 2
    'BADCAT_FEED_AUTO_APPROVE',
    'BADCAT_FEED_REPORT_HIDE',
    'BADCAT_VAPID_PUBLIC_KEY',
    'BADCAT_VAPID_PRIVATE_KEY',
    'BADCAT_VAPID_SUBJECT',
    'BADCAT_SHORT_LINK_BASE',
    'BADCAT_API_PUBLIC_URL',
    'BADCAT_SCORE_GRACE_DAYS',
];

/** Replaces the badcat env names for one spec file; returns the restore function. */
export function useEnv(values: Record<string, string | undefined>): () => void {
    const saved = Object.fromEntries(BADCAT_ENV_NAMES.map(name => [name, process.env[name]]));
    for (const name of BADCAT_ENV_NAMES) delete process.env[name];
    for (const [name, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    return () => {
        for (const name of BADCAT_ENV_NAMES) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
    };
}

export const statusOf = async (promise: Promise<unknown>): Promise<number> => {
    try {
        await promise;
        return 200;
    } catch (error) {
        if (error instanceof HttpException) return error.getStatus();
        throw error;
    }
};

export function fakeStripe() {
    const verifier = new Stripe('sk_test_verifier', { apiVersion: STRIPE_API_VERSION });
    let n = 0;
    return {
        checkout: {
            sessions: {
                create: jest.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
                    expect(params.line_items).toBeDefined();
                    n++;
                    return {
                        id: `cs_test_spec${String(n).padStart(6, '0')}`,
                        url: `https://checkout.stripe.com/c/pay/cs_test_${n}`,
                    };
                }),
            },
        },
        coupons: {
            retrieve: jest.fn(async () => {
                throw Object.assign(new Error('No such coupon'), { code: 'resource_missing', statusCode: 404 });
            }),
            create: jest.fn(async (params: any) => ({ id: params.id })),
        },
        invoicePayments: { list: jest.fn(async (): Promise<any> => ({ data: [] as any[] })) },
        invoices: {
            retrieve: jest.fn(async (id: string): Promise<any> => {
                throw Object.assign(new Error(`No such invoice: ${id}`), { statusCode: 404 });
            }),
        },
        subscriptions: { cancel: jest.fn(async (id: string) => ({ id, status: 'canceled' })) },
        billingPortal: {
            sessions: { create: jest.fn(async () => ({ url: 'https://billing.stripe.com/p/session/test_spec' })) },
        },
        webhooks: verifier.webhooks,
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
    const model = (uniques: IUniqueIndex[] = []) => new MemoryModel([], uniques, now);
    const models = {
        purchases: model([{ fields: ['sessionId'] }]),
        cameos: model([{ fields: ['sessionId'] }]),
        shuffles: model([{ fields: ['dayNo', 'shuffle'] }]),
        counters: model([{ fields: ['key'] }]),
        gifts: model([{ fields: ['code'] }, { fields: ['sessionId'] }]),
        faces: model(),
        creatorCodes: model([{ fields: ['code'] }]),
        restoreTokens: model([{ fields: ['tokenHash'] }]),
        clubCats: model([{ fields: ['email'] }]),
        webhookEvents: model([{ fields: ['eventId'] }]),
        foundingHolds: model([{ fields: ['holdId'] }]),
    };
    // Job leases need a unique _id, like MongoDB (claimJobPeriod relies on E11000).
    models.clubCats.extraCollections.set('jobruns', new MemoryModel([], [{ fields: ['_id'] }], now));
    const store = models as unknown as BadcatStore;
    const stripeClient = fakeStripe();
    const stripe = new BadcatStripeService(store);
    stripe.createClient = () => stripeClient as unknown as Stripe;
    stripe.now = now;
    const storage = memoryStorage();
    const account = new BadcatAccountService(store, stripe, storage as any);
    account.now = now;
    const sent: { url: string; body: any }[] = [];
    const fetchImpl = jest.fn(async (url: string, init: any) => {
        sent.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 202 };
    });
    account.fetchImpl = fetchImpl;
    const webhooks = new BadcatWebhookService(store, stripe);
    webhooks.now = now;
    const cameos = new BadcatCameoService(store, account);
    cameos.now = now;
    const admin = new BadcatAdminService(store, stripe);
    admin.now = now;
    const job = new BadcatSeenEmailJob(store, account, cameos);
    job.now = now;
    job.fetchImpl = fetchImpl;
    const ipThrottler = { consume: jest.fn(async () => undefined) };
    const controller = new BadcatController(stripe, webhooks, account, cameos, admin, ipThrottler as any);
    return {
        clock,
        models,
        store,
        stripeClient,
        stripe,
        storage,
        account,
        webhooks,
        cameos,
        admin,
        job,
        controller,
        ipThrottler,
        fetchImpl,
        sent,
    };
}

export type Harness = ReturnType<typeof buildHarness>;

let eventSeq = 0;
/** A completed Checkout Session event, as the webhook receives it. */
export function checkoutEvent(session: Record<string, unknown>, id = `evt_test_${++eventSeq}`) {
    return {
        id,
        type: 'checkout.session.completed',
        data: {
            object: {
                object: 'checkout.session',
                payment_status: 'paid',
                currency: 'usd',
                customer: 'cus_test_1',
                customer_details: { email: 'Buyer@Example.com' },
                ...session,
            },
        },
    };
}

/** Delivers a signed event through the controller. */
export async function deliver(h: Harness, event: Record<string, unknown>) {
    const { rawBody, signature } = signedEvent(event);
    return h.controller.webhook({ rawBody } as any, signature);
}

/** Records a paid purchase through the webhook. */
export async function buy(
    h: Harness,
    sku: string,
    extra: { email?: string; meta?: Record<string, string>; session?: Record<string, unknown>; sessionId?: string } = {}
) {
    const sessionId = extra.sessionId || `cs_test_buy${String(++eventSeq).padStart(6, '0')}`;
    await deliver(
        h,
        checkoutEvent({
            id: sessionId,
            amount_total: 499,
            customer_details: { email: extra.email || 'buyer@example.com' },
            metadata: { badcat: '1', sku, trigger: 'home', from_in_app: 'false', ...(extra.meta || {}) },
            ...(extra.session || {}),
        })
    );
    return sessionId;
}
