// Test harness for the Moon Rave ad specs (`-spec.ts`: not run by jest, not built). Stripe, storage and
// Mongo are in-memory fakes; nothing touches the network. Stripe TEST semantics only.
import sharp = require('sharp');
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { ENV_ON, T0 } from '../rave.harness-spec';
import { RaveService } from '../rave.service';
import { RaveWebhookService } from '../rave-webhook.service';
import { RaveAdsService } from './rave-ads.service';

export { T0 };

/** Ads ready: Stripe TEST keys (shared with the rave checkout), keeper on Arc testnet. No on/off flag. */
export const ENV_ADS: NodeJS.ProcessEnv = { ...ENV_ON };

export async function png(width = 640, height = 360, color = '#ff4f9e'): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: color } })
        .png()
        .toBuffer();
}

export function adsHarness(env: NodeJS.ProcessEnv = ENV_ADS) {
    const clock = { now: new Date(T0) };
    const now = () => new Date(clock.now);
    const ads: any = memoryModel({ unique: [['adId'], ['slotLock'], ['clientKey'], ['paymentIntentId']], now });
    const checkouts: any = memoryModel({ unique: [['orderId'], ['cardIntent']], now });
    const orders: any = memoryModel({ unique: [['orderId'], ['clientKey'], ['paymentIntentId']], now });
    const events: any = memoryModel({ unique: [['eventId']], now });
    const intents = new Map<string, any>();
    let n = 0;
    let r = 0;
    const stripe = {
        paymentIntents: {
            create: jest.fn(async (params: any, opts: any) => {
                const id = `pi_test_ad_${++n}`;
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
                    idempotencyKey: opts?.idempotencyKey,
                };
                intents.set(id, intent);
                return { ...intent };
            }),
            retrieve: jest.fn(async (id: string) => {
                const intent = intents.get(id);
                if (!intent) throw new Error('No such payment_intent');
                return { ...intent };
            }),
            cancel: jest.fn(async (id: string) => {
                const intent = intents.get(id);
                if (intent && intent.status !== 'succeeded') intent.status = 'canceled';
                return { ...intent };
            }),
        },
        refunds: {
            create: jest.fn(async (params: any, opts: any) => ({
                id: `re_test_${++r}`,
                payment_intent: params.payment_intent,
                idempotencyKey: opts?.idempotencyKey,
            })),
        },
    };
    const stripePayments: any = { stripe };
    const shares: any = { runOnce: jest.fn(async () => ({ sent: 0, confirmed: 0, failed: 0, skipped: null })) };
    const service = new RaveAdsService(ads, checkouts, stripePayments, shares);
    service.env = env;
    const uploads: { key: string; data: Buffer }[] = [];
    /** Fake bucket: key → { data, public }. */
    const store = new Map<string, { data: Buffer; public: boolean }>();
    service.io = {
        storePrivate: jest.fn(async (key: string, data: Buffer) => {
            uploads.push({ key, data });
            store.set(key, { data, public: false });
        }),
        publish: jest.fn(async (privateKey: string, publicKey: string) => {
            const obj = store.get(privateKey);
            if (!obj) throw new Error('NoSuchKey');
            store.set(publicKey, { data: obj.data, public: true });
            return `https://cdn.test.invalid/${publicKey}`;
        }),
        readPrivate: jest.fn(async (key: string) => {
            const obj = store.get(key);
            if (!obj) throw new Error('NoSuchKey');
            return obj.data;
        }),
        remove: jest.fn(async (key: string) => {
            store.delete(key);
        }),
    };
    const rave = new RaveService(orders, checkouts, stripePayments, shares, { getReceipt: jest.fn() } as any);
    rave.env = env;
    const webhooks = new RaveWebhookService(events, rave, stripePayments, service);
    webhooks.env = env;

    /** What Stripe reports once the buyer paid the intent. */
    const pay = (id: string) => {
        const intent = intents.get(id);
        Object.assign(intent, { status: 'succeeded', amount_received: intent.amount });
        return { ...intent };
    };

    return { clock, ads, checkouts, intents, stripe, shares, service, webhooks, uploads, store, pay };
}
