// Test harness for the Tails Club specs. The name ends in `-spec.ts`, so tsconfig.build.json leaves it out of
// dist and jest does not run it. Stripe, Firebase, SendGrid and the keeper are fakes: nothing touches the network.
import { HttpException } from '@nestjs/common';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { ClubService } from './club.service';
import { ClubWebhookService } from './club-webhook.service';

export const WHSEC = 'whsec_test_club';
export const T0 = new Date('2026-10-21T12:00:00Z');
export const PRICE_MONTH = 'price_clubmonth01';
export const PRICE_YEAR = 'price_clubyear001';
export const KEY_A = '7b0c5f0e-1d2a-4c55-9a51-2f2d0f6a1a01';
export const KEY_B = '7b0c5f0e-1d2a-4c55-9a51-2f2d0f6a1a02';

/** Club ready: Stripe TEST keys, keeper on Arc testnet (test payments queue testnet shares). */
export const ENV_ON: NodeJS.ProcessEnv = {
    STRIPE_SECRET_KEY: 'sk_test_club_fake',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_club_fake',
    STRIPE_CLUB_PRICE_MONTH: PRICE_MONTH,
    STRIPE_CLUB_PRICE_YEAR: PRICE_YEAR,
    CLUB_STRIPE_WEBHOOK_SECRET: WHSEC,
    CLUB_TOKEN_SECRET: 'club-token-secret-for-specs',
    SENDGRID_API_KEY: 'SG.fake',
    SHELTER_CHAIN_ID: '5042002',
};

/** Production: live keys, Arc mainnet keeper. */
export const ENV_PROD: NodeJS.ProcessEnv = {
    ...ENV_ON,
    NODE_ENV: 'production',
    STRIPE_SECRET_KEY: 'sk_live_club_fake',
    STRIPE_PUBLISHABLE_KEY: 'pk_live_club_fake',
    SHELTER_CHAIN_ID: '5042',
};

export function clubHarness(env: NodeJS.ProcessEnv = ENV_ON) {
    const clock = { now: new Date(T0) };
    const now = () => new Date(clock.now);
    const members: any = memoryModel({ unique: [['subscriptionId'], ['clientKey']], now });
    const users: any = memoryModel({ now });
    const events: any = memoryModel({ unique: [['eventId']], now });
    const checkouts: any = memoryModel({ unique: [['orderId'], ['cardIntent']], now });
    const periodEnd = (plan: string) => Math.floor(T0.getTime() / 1000) + (plan === 'year' ? 365 : 30) * 86400;

    const prices = new Map<string, any>([
        [
            PRICE_MONTH,
            {
                id: PRICE_MONTH,
                active: true,
                currency: 'usd',
                unit_amount: 999,
                tax_behavior: 'inclusive',
                recurring: { interval: 'month', interval_count: 1 },
            },
        ],
        [
            PRICE_YEAR,
            {
                id: PRICE_YEAR,
                active: true,
                currency: 'usd',
                unit_amount: 7900,
                tax_behavior: 'inclusive',
                recurring: { interval: 'year', interval_count: 1 },
            },
        ],
    ]);
    const customers = new Map<string, any>();
    const subs = new Map<string, any>();
    const idem = new Map<string, any>();
    let n = 0;
    const copy = (sub: any, expand?: string[]) => {
        const out = JSON.parse(JSON.stringify(sub));
        if (expand?.includes('customer')) out.customer = { ...customers.get(sub.customer) };
        return out;
    };
    const stripe = {
        prices: { retrieve: jest.fn(async (id: string) => ({ ...prices.get(id) })) },
        customers: {
            create: jest.fn(async (params: any, opts: any) => {
                if (opts?.idempotencyKey && idem.has(opts.idempotencyKey)) return idem.get(opts.idempotencyKey);
                const customer = { id: `cus_test${++n}`, email: params.email, metadata: params.metadata };
                customers.set(customer.id, customer);
                if (opts?.idempotencyKey) idem.set(opts.idempotencyKey, customer);
                return customer;
            }),
        },
        subscriptions: {
            create: jest.fn(async (params: any, opts: any) => {
                if (opts?.idempotencyKey && idem.has(opts.idempotencyKey)) return copy(idem.get(opts.idempotencyKey));
                const id = `sub_test${++n}`;
                const priceId = params.items[0].price;
                const plan = priceId === PRICE_YEAR ? 'year' : 'month';
                const sub = {
                    id,
                    object: 'subscription',
                    customer: params.customer,
                    status: 'incomplete',
                    livemode: false,
                    cancel_at_period_end: false,
                    metadata: params.metadata,
                    items: { data: [{ price: { id: priceId }, current_period_end: periodEnd(plan) }] },
                    latest_invoice: { id: `in_${id}`, confirmation_secret: { client_secret: `pi_${id}_secret_fake` } },
                };
                subs.set(id, sub);
                if (opts?.idempotencyKey) idem.set(opts.idempotencyKey, sub);
                return copy(sub);
            }),
            retrieve: jest.fn(async (id: string, opts?: any) => {
                const sub = subs.get(id);
                if (!sub) throw Object.assign(new Error('No such subscription'), { statusCode: 404 });
                return copy(sub, opts?.expand);
            }),
            cancel: jest.fn(async (id: string) => {
                const sub = subs.get(id);
                sub.status = 'canceled';
                return copy(sub);
            }),
        },
        invoicePayments: {
            list: jest.fn(async (params: any) => ({
                data: [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: `pi_${params.invoice}` } }],
            })),
        },
        billingPortal: {
            sessions: {
                create: jest.fn(async (params: any) => ({
                    url: `https://billing.stripe.com/p/session/test_${params.customer}`,
                })),
            },
        },
    };
    const stripePayments: any = { stripe };
    const hits = new Map<string, number>();
    const throttleStorage: any = {
        increment: jest.fn(async (key: string) => {
            hits.set(key, (hits.get(key) || 0) + 1);
            return { totalHits: hits.get(key), timeToExpire: 60 };
        }),
    };
    const shares: any = { runOnce: jest.fn(async () => ({ sent: 0, confirmed: 0, failed: 0, skipped: null })) };
    const service = new ClubService(members, users, stripePayments, throttleStorage);
    service.env = env;
    const sent: { to: string; subject: string; html: string }[] = [];
    service.sendEmail = jest.fn(async (to: string, subject: string, html: string) => {
        sent.push({ to, subject, html });
        return true;
    });
    service.identity = {
        verifyIdToken: jest.fn(async (token: string) => {
            if (token === 'good-token') return { uid: 'uid-1', firebase: { sign_in_provider: 'password' } };
            if (token === 'guest-token') return { uid: 'uid-guest', firebase: { sign_in_provider: 'anonymous' } };
            throw new Error('bad token');
        }),
    } as any;
    const webhooks = new ClubWebhookService(events, checkouts, service, stripePayments, shares);
    webhooks.env = env;
    jest.spyOn(webhooks, 'kickKeeper').mockImplementation(() => undefined);

    /** What Stripe reports once the first invoice is paid. */
    const activate = (id: string, extra: Record<string, unknown> = {}) => {
        Object.assign(subs.get(id), { status: 'active', ...extra });
    };

    return {
        clock,
        members,
        users,
        events,
        checkouts,
        stripe,
        subs,
        customers,
        prices,
        throttleStorage,
        shares,
        service,
        webhooks,
        sent,
        activate,
    };
}

/** Awaits `run` and checks the HttpException's status and `code`. */
export async function expectClubError(run: Promise<unknown> | (() => unknown), status: number, code: string) {
    let error: unknown;
    try {
        await (typeof run === 'function' ? run() : run);
    } catch (e) {
        error = e;
    }
    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    expect({ status: http.getStatus(), code: (http.getResponse() as any)?.code }).toEqual({ status, code });
    return (http.getResponse() as any) || {};
}
