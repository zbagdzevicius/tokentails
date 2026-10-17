// Test harness for the Moon Rave specs. The name ends in `-spec.ts`, so tsconfig.build.json leaves it out of
// dist and jest does not run it. Stripe, the chain and the keeper are fakes: nothing touches the network.
import { HttpException } from '@nestjs/common';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { RaveService } from './rave.service';
import { RaveWebhookService } from './rave-webhook.service';

export const SPLIT = '0x1111111111111111111111111111111111111111';
// A throwaway 32-byte value; ShelterChain is faked, nothing is ever signed with it.
export const FAKE_KEY = '0x' + 'ab'.repeat(32);
export const WHSEC = 'whsec_test_rave';
export const T0 = new Date('2026-10-16T12:00:00Z');

/** Checkout on, Stripe TEST keys, keeper on Arc testnet. */
export const ENV_ON: NodeJS.ProcessEnv = {
    RAVE_CHECKOUT_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_rave_fake',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_rave_fake',
    RAVE_STRIPE_WEBHOOK_SECRET: WHSEC,
    SHELTER_CHAIN_ID: '5042002',
    SHELTER_ARC_RPC_URL: 'http://127.0.0.1:8545',
    SHELTER_SPLIT_ADDRESS: SPLIT,
    SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY,
};

/** The same keeper on Arc mainnet. */
export const ENV_MAINNET_KEEPER: NodeJS.ProcessEnv = { ...ENV_ON, SHELTER_CHAIN_ID: '5042' };

export function raveHarness(env: NodeJS.ProcessEnv = ENV_ON) {
    const clock = { now: new Date(T0) };
    const orders: any = memoryModel({
        unique: [['orderId'], ['clientKey'], ['paymentIntentId']],
        now: () => new Date(clock.now),
    });
    const checkouts: any = memoryModel({ unique: [['orderId'], ['cardIntent']], now: () => new Date(clock.now) });
    const events: any = memoryModel({ unique: [['eventId']], now: () => new Date(clock.now) });
    const intents = new Map<string, any>();
    let n = 0;
    const stripe = {
        paymentIntents: {
            create: jest.fn(async (params: any) => {
                const id = `pi_test_${++n}`;
                const intent = {
                    id,
                    object: 'payment_intent',
                    client_secret: `${id}_secret_fake`,
                    livemode: false,
                    amount: params.amount,
                    amount_received: 0,
                    currency: params.currency,
                    metadata: params.metadata,
                    status: 'requires_payment_method',
                    latest_charge: null,
                };
                intents.set(id, intent);
                return intent;
            }),
            retrieve: jest.fn(async (id: string) => {
                const intent = intents.get(id);
                if (!intent) throw new Error('No such payment_intent');
                return { ...intent };
            }),
        },
    };
    const stripePayments: any = { stripe };
    const shares: any = { runOnce: jest.fn(async () => ({ sent: 0, confirmed: 0, failed: 0, skipped: null })) };
    const chain: any = { getReceipt: jest.fn(async () => null) };
    const service = new RaveService(orders, checkouts, stripePayments, shares, chain);
    service.env = env;
    jest.spyOn(service, 'kickKeeper').mockImplementation(() => undefined);
    const webhooks = new RaveWebhookService(events, service, stripePayments);
    webhooks.env = env;

    /** What Stripe would report once the buyer paid the intent (risk from Radar). */
    const pay = (id: string, extra: Record<string, unknown> = {}, risk = 'normal') => {
        const intent = intents.get(id);
        Object.assign(intent, {
            status: 'succeeded',
            amount_received: intent.amount,
            latest_charge: { id: `ch_${id}`, object: 'charge', outcome: { risk_level: risk } },
            ...extra,
        });
        return { ...intent };
    };

    return { clock, orders, checkouts, events, intents, stripe, shares, chain, service, webhooks, pay };
}

/** Awaits `run` and checks the HttpException's status and `code`. */
export async function expectRaveError(run: Promise<unknown> | (() => unknown), status: number, code: string) {
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
