import { BadRequestException } from '@nestjs/common';
import { coatSkuOf, PASS_SKU, STORE_COATS, STORE_TERMS_VERSION } from 'src/pawlegends/pawlegends-catalog';
import { pawlegendsCheckoutReady } from 'src/pawlegends/pawlegends-env';
import { ownedItemsOf } from 'src/pawlegends/pawlegends-season.service';
import {
    buildHarness,
    completedEvent,
    DEVICE,
    Harness,
    signedEvent,
    statusOf,
} from 'src/pawlegends/pawlegends-harness.helper-spec';
import { StripePaymentService, STRIPE_API_VERSION } from 'src/payments/stripe-payment.service';
import { OrderStatus, ProductType } from 'src/web3/order.schema';
import Stripe from 'stripe';
import { ImageController } from './image.controller';

/*
 * Paw Legends on the Token Tails Stripe account: one endpoint (POST /image/webhook, STRIPE_WEBHOOK_SECRET) carries
 * both. Real stripe-node signatures, the real Paw Legends handler over in-memory models, a fake Token Tails order store.
 */

jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/image.utils', () => ({ uploadFileImage: jest.fn(), isHeicImage: () => false }));
jest.mock('src/shared/utils/aws.utils', () => ({ uploadFile: jest.fn() }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('./image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/yourcat/portrait-delivery.service', () => ({ PortraitDeliveryService: class {} }));
jest.mock('./order-email', () => ({ sendOrderConfirmationEmail: jest.fn() }));

const TT_WEBHOOK_SECRET = 'whsec_tokentails_shared';
const USER_ID = '64b7f0c2a1b2c3d4e5f60719';

/** Production's names only: the Token Tails key, webhook secret and cache secret. No PAWLEGENDS_* name. */
const SHARED_ENV: Record<string, string> = {
    NODE_ENV: 'test',
    STRIPE_SECRET_KEY: 'sk_test_tokentails_shared',
    STRIPE_WEBHOOK_SECRET: TT_WEBHOOK_SECRET,
    INVALIDATE_CACHE_SECRET: 'tokentails-cache-secret',
};

function setup() {
    const h = buildHarness();
    const order = {
        _id: 'o1',
        status: OrderStatus.PENDING,
        id: ProductType.DIGITAL,
        price: 6,
        priceUsd: 6,
        user: { _id: { toString: () => USER_ID }, email: 'buyer@example.test' },
        image: { aiUrl: 'https://cdn.test/ai.webp' },
    };
    const orderModel = {
        findOneAndUpdate: jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ _id: 'o1', status: OrderStatus.COMPLETE }),
        }),
    };
    const orderRepository = { model: orderModel, findOne: jest.fn().mockResolvedValue(order) };
    const userRepository = { update: jest.fn().mockResolvedValue({}) };
    const catService = { createBlessingWithCat: jest.fn().mockResolvedValue({}) };
    const stripePayments = new StripePaymentService(orderRepository as any, userRepository as any);
    (stripePayments as any).stripeClient = new Stripe('sk_test_verifier', { apiVersion: STRIPE_API_VERSION });
    const handle = jest.spyOn(h.webhooks, 'handle');
    const controller = new ImageController(
        {} as any,
        orderRepository as any,
        {} as any,
        userRepository as any,
        catService as any,
        stripePayments,
        {} as any,
        {} as any,
        { count: jest.fn().mockResolvedValue(undefined) } as any,
        { deliverInBackground: jest.fn() } as any,
        h.webhooks
    );
    return { h, controller, orderRepository, orderModel, handle };
}

/** Signs with the Token Tails secret and posts to /image/webhook. */
const post = (controller: ImageController, event: Record<string, unknown>, secret = TT_WEBHOOK_SECRET) => {
    const { rawBody, signature } = signedEvent(event, secret);
    return controller.handleStripeWebhook({ rawBody } as any, signature);
};

/** A store checkout created with the shared env only; returns the completed event Stripe would send. */
async function storeCheckout(h: Harness, env: Record<string, string> = SHARED_ENV) {
    const { sessionId } = await h.stripe.createCheckout(
        {
            sku: 'pl_founder',
            currency: 'eur',
            ageBand: '18+',
            consentVersion: '2026-10-17',
            deviceId: DEVICE,
            email: 'buyer@example.com',
        } as any,
        env
    );
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    return { sessionId, event: completedEvent(sessionId, calls[calls.length - 1][0]) };
}

describe('POST /image/webhook carries Paw Legends (one Stripe account)', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...SHARED_ENV };
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('turns the store on with only the Token Tails secrets; PAWLEGENDS_* still win when set', async () => {
        expect(pawlegendsCheckoutReady(SHARED_ENV)).toBe(true);
        const without = (name: string) => ({ ...SHARED_ENV, [name]: '' });
        const noWebhook = without('STRIPE_WEBHOOK_SECRET');
        for (const name of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'INVALIDATE_CACHE_SECRET']) {
            expect(pawlegendsCheckoutReady(without(name))).toBe(false);
        }
        expect(pawlegendsCheckoutReady({ ...noWebhook, PAWLEGENDS_STRIPE_WEBHOOK_SECRET: 'whsec_own' })).toBe(true);
        // A separate key (maybe another Stripe account, whose events never reach /image/webhook) does not borrow the
        // shared webhook secret: it needs its own, or checkout would take money nothing confirms.
        const separateKey = { ...SHARED_ENV, PAWLEGENDS_STRIPE_SECRET_KEY: 'sk_test_other_account' };
        expect(pawlegendsCheckoutReady(separateKey)).toBe(false);
        expect(pawlegendsCheckoutReady({ ...separateKey, PAWLEGENDS_STRIPE_WEBHOOK_SECRET: 'whsec_own' })).toBe(true);
        // The same key under both names, or one skipped for its mode (a live key outside production), is the shared one.
        expect(
            pawlegendsCheckoutReady({ ...SHARED_ENV, PAWLEGENDS_STRIPE_SECRET_KEY: SHARED_ENV.STRIPE_SECRET_KEY })
        ).toBe(true);
        expect(pawlegendsCheckoutReady({ ...SHARED_ENV, PAWLEGENDS_STRIPE_SECRET_KEY: 'sk_live_other' })).toBe(true);

        const { h } = setup();
        await expect(storeCheckout(h)).resolves.toMatchObject({ sessionId: expect.any(String) });
        expect(await statusOf(storeCheckout(h, noWebhook))).toBe(503);
        // The own endpoint verifies with its own secret only, so it stays closed (503) on the shared setup.
        const { rawBody, signature } = signedEvent({ id: 'evt_x', type: 'ping' }, TT_WEBHOOK_SECRET);
        expect(await statusOf(Promise.resolve().then(() => h.webhooks.verify(rawBody, signature, SHARED_ENV)))).toBe(
            503
        );
    });

    it('a Token Tails session goes to the order path only', async () => {
        const { h, controller, orderRepository, orderModel, handle } = setup();
        const event = {
            id: 'evt_tt_1',
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_tt_1', payment_status: 'paid', currency: 'usd', amount_total: 600 } },
        };
        expect(await post(controller, event)).toEqual({ received: true });
        expect(handle).not.toHaveBeenCalled();
        expect(orderRepository.findOne.mock.calls[0][0].searchObject).toEqual({ hash: 'cs_tt_1' });
        expect(orderModel.findOneAndUpdate).toHaveBeenCalled();
        expect(await h.models.webhookEvents.find({}).lean()).toHaveLength(0);
        expect(await h.models.purchases.find({}).lean()).toHaveLength(0);
    });

    it('a Paw Legends session goes to the store only, once, whichever endpoint delivers it again', async () => {
        const { h, controller, orderRepository, handle } = setup();
        const { sessionId, event } = await storeCheckout(h);

        expect(await post(controller, event)).toEqual({ received: true });
        expect(handle).toHaveBeenCalledTimes(1);
        expect(orderRepository.findOne).not.toHaveBeenCalled();
        const paid = (await h.models.purchases.findOne({ sessionId }).lean()) as any;
        expect(paid).toMatchObject({ status: 'paid', paymentIntentId: `pi_${sessionId}` });

        // Stripe's retry of the same event id, and the same event arriving at the own endpoint later: one grant.
        await post(controller, event);
        expect(await handle.mock.results[1].value).toBe('duplicate');
        const own = signedEvent(event, 'whsec_own');
        const verified = h.webhooks.verify(own.rawBody, own.signature, {
            PAWLEGENDS_STRIPE_WEBHOOK_SECRET: 'whsec_own',
        });
        expect(await h.webhooks.handle(verified)).toBe('duplicate');
        expect(await h.models.purchases.find({ sessionId }).lean()).toHaveLength(1);
        expect(await h.models.webhookEvents.find({ eventId: event.id }).lean()).toHaveLength(1);
        expect(orderRepository.findOne).not.toHaveBeenCalled();
    });

    it('a refund reaches the store and takes back only its own purchase', async () => {
        const { h, controller, orderRepository } = setup();
        const { sessionId, event } = await storeCheckout(h);
        await post(controller, event);

        // A Token Tails refund: the store ignores it, nothing of its rows changes.
        await post(controller, {
            id: 'evt_refund_tt',
            type: 'charge.refunded',
            data: { object: { id: 'ch_tt', refunded: true, payment_intent: 'pi_tokentails_pack' } },
        });
        expect(((await h.models.purchases.findOne({ sessionId }).lean()) as any).status).toBe('paid');

        expect(
            await post(controller, {
                id: 'evt_refund_pl',
                type: 'charge.refunded',
                data: { object: { id: 'ch_pl', refunded: true, payment_intent: `pi_${sessionId}` } },
            })
        ).toEqual({ received: true });
        expect(((await h.models.purchases.findOne({ sessionId }).lean()) as any).status).toBe('refunded');
        expect(orderRepository.findOne).not.toHaveBeenCalled();
    });

    it('a lost dispute reaches the store; a Token Tails dispute changes nothing there', async () => {
        const { h, controller } = setup();
        const { sessionId, event } = await storeCheckout(h);
        await post(controller, event);
        await post(controller, {
            id: 'evt_dispute_tt',
            type: 'charge.dispute.closed',
            data: { object: { id: 'dp_tt', status: 'lost', payment_intent: 'pi_tokentails_pack' } },
        });
        expect(((await h.models.purchases.findOne({ sessionId }).lean()) as any).status).toBe('paid');
        await post(controller, {
            id: 'evt_dispute_pl',
            type: 'charge.dispute.closed',
            data: { object: { id: 'dp_pl', status: 'lost', payment_intent: `pi_${sessionId}` } },
        });
        expect(await h.models.purchases.findOne({ sessionId }).lean()).toMatchObject({
            status: 'refunded',
            disputeId: 'dp_pl',
        });
    });

    it('a store coat and the Legends Pass are granted on /image/webhook and taken back by their refunds', async () => {
        const { h, controller, orderRepository } = setup();
        h.stripe.sellRetired = false;
        const ACCOUNT = 'acct-0000000000000001';
        const coatSku = coatSkuOf(STORE_COATS.find(c => c.hero === 'clem')!);
        const buy = async (sku: string) => {
            const { sessionId } = await h.stripe.createCheckout(
                {
                    sku,
                    currency: 'eur',
                    email: 'buyer@example.com',
                    ageBand: '18+',
                    consentVersion: STORE_TERMS_VERSION,
                    deviceId: DEVICE,
                } as any,
                SHARED_ENV,
                ACCOUNT
            );
            const calls = h.stripeClient.checkout.sessions.create.mock.calls;
            expect(await post(controller, completedEvent(sessionId, calls[calls.length - 1][0]))).toEqual({
                received: true,
            });
            return sessionId;
        };
        const coat = await buy(coatSku);
        const pass = await buy(PASS_SKU);
        expect(await h.models.owned.countDocuments({ accountId: ACCOUNT })).toBeGreaterThan(0);
        expect(await ownedItemsOf(h.store, ACCOUNT)).not.toEqual([]);
        expect((await h.season.me(ACCOUNT)).season.premium).toBe('pass');

        for (const [sessionId, id] of [
            [coat, 'evt_refund_coat'],
            [pass, 'evt_refund_pass'],
        ]) {
            await post(controller, {
                id,
                type: 'charge.refunded',
                data: { object: { id: `ch_${id}`, refunded: true, payment_intent: `pi_${sessionId}` } },
            });
        }
        expect(await ownedItemsOf(h.store, ACCOUNT)).toEqual([]);
        expect((await h.season.me(ACCOUNT)).season.premium).toBe('none');
        expect(orderRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejects a bad signature before either handler runs', async () => {
        const { controller, orderRepository, handle } = setup();
        await expect(
            post(controller, { id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } }, 'whsec_other')
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(handle).not.toHaveBeenCalled();
        expect(orderRepository.findOne).not.toHaveBeenCalled();
    });

    it('a store error fails the delivery so Stripe retries, and the retry is processed', async () => {
        const { h, controller } = setup();
        const { sessionId, event } = await storeCheckout(h);
        const original = h.models.purchases.findOne.bind(h.models.purchases);
        const spy = jest.spyOn(h.models.purchases, 'findOne').mockImplementationOnce(() => {
            throw new Error('mongo down');
        });
        await expect(post(controller, event)).rejects.toThrow('mongo down');
        expect(await h.models.webhookEvents.find({ eventId: event.id }).lean()).toHaveLength(0);
        spy.mockImplementation(original);
        await post(controller, event);
        expect(await h.models.purchases.findOne({ sessionId }).lean()).toMatchObject({ status: 'paid' });
    });

    it('classifies events: store sessions, every refund and dispute close, nothing else', () => {
        const { h } = setup();
        const session = (type: string, metadata?: Record<string, string>) =>
            ({ type, data: { object: { metadata } } } as any);
        expect(h.webhooks.isPawlegendsEvent(session('checkout.session.completed', { pawlegends: '1' }))).toBe(true);
        expect(
            h.webhooks.isPawlegendsEvent(session('checkout.session.async_payment_succeeded', { pawlegends: '1' }))
        ).toBe(true);
        expect(h.webhooks.isPawlegendsEvent(session('checkout.session.expired', { pawlegends: '1' }))).toBe(true);
        expect(h.webhooks.isPawlegendsEvent(session('checkout.session.completed'))).toBe(false);
        expect(h.webhooks.isPawlegendsEvent(session('checkout.session.completed', { badcat: '1' }))).toBe(false);
        expect(h.webhooks.isPawlegendsEvent(session('payment_intent.succeeded', { pawlegends: '1' }))).toBe(false);
        expect(h.webhooks.isPawlegendsEvent(session('charge.refunded'))).toBe(true);
        expect(h.webhooks.isPawlegendsEvent(session('charge.dispute.closed'))).toBe(true);
        expect(h.webhooks.isPawlegendsEvent(null)).toBe(false);
    });
});
