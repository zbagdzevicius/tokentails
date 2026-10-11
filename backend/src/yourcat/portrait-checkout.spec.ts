import { HttpException } from '@nestjs/common';
import {
    PortraitCheckoutService,
    WITHDRAWAL_ACKNOWLEDGEMENT,
    withdrawalCheckboxOn,
} from 'src/image/portrait-checkout.service';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { ProductType } from 'src/web3/order.schema';
import { catPhoto, guestUser, harness, NOW, uploadReq } from './yourcat-harness.helper-spec';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generatePixelAvatar: jest.fn() }));
jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/aws.utils', () => ({
    PRIVATE_URL_PREFIX: 's3private://',
    YOURCAT_ORIGINALS_PREFIX: 'yourcat/originals/',
    uploadFile: jest.fn(),
    uploadPrivateObject: jest.fn(),
    uploadPublicObject: jest.fn(),
    deleteObject: jest.fn(),
}));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));

const DAY_MS = 24 * 60 * 60 * 1000;

async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(
        () => null,
        e => e
    );
    expect(error).toBeInstanceOf(HttpException);
    return { status: (error as HttpException).getStatus(), code: ((error as HttpException).getResponse() as any).code };
}

describe('POST /yourcat/:id/portrait-checkout', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        process.env = {
            ...OLD_ENV,
            NODE_ENV: 'test',
            YOURCAT_ENABLED: 'true',
            YOURCAT_PORTRAIT_ENABLED: 'true',
            MAIN_FE_DOMAIN: 'https://tokentails.test',
        };
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    async function withCat() {
        const h = harness({ users: [guestUser()] });
        const user = h.users.docs[0];
        const view = await h.service.uploadPhoto(
            user,
            uploadReq(),
            { buffer: await catPhoto() },
            { consent: 'true', noticeVersion: 'v1' }
        );
        await h.service.lastAvatarJob;
        return { h, user, view };
    }

    it('creates one Image (private original, owner, source yourcat) and a session back to /yourcat', async () => {
        const { h, user, view } = await withCat();
        const result = await h.service.portraitCheckout(user, view.id, 'monarch');
        expect(result).toEqual({ checkoutUrl: 'https://stripe.test/cs_1', orderId: expect.any(String) });
        expect(h.images.docs).toHaveLength(1);
        expect(h.images.docs[0]).toMatchObject({
            url: `s3private://${h.yourcats.docs[0].originalKey}`,
            source: 'yourcat',
            style: 'monarch',
            isTemporary: false,
        });
        expect(String(h.images.docs[0].owner)).toBe(String(user._id));
        const input = h.checkoutService.create.mock.calls[0][0];
        expect(input).toMatchObject({
            productType: ProductType.DIGITAL,
            successUrl: `https://tokentails.test/yourcat?yc=${view.id}&paid=1`,
            cancelUrl: `https://tokentails.test/yourcat?yc=${view.id}&checkout=cancelled`,
            metadata: { source: 'yourcat', yourcatId: view.id, style: 'monarch' },
            email: null,
        });
        expect((await h.service.get(user, view.id)).portrait).toEqual({
            status: 'pending_payment',
            style: 'monarch',
            url: null,
        });
        expect(h.days.docs[0].counts.portraitCheckouts).toBe(1);
    });

    it('a second checkout with the same style returns the open session', async () => {
        const { h, user, view } = await withCat();
        const first = await h.service.portraitCheckout(user, view.id, 'highness');
        const second = await h.service.portraitCheckout(user, view.id, 'highness');
        expect(second).toEqual(first);
        expect(h.checkoutService.create).toHaveBeenCalledTimes(1);
        expect(h.images.docs).toHaveLength(1);
    });

    it('a different style expires the old session first, and reuses the one Image', async () => {
        const { h, user, view } = await withCat();
        await h.service.portraitCheckout(user, view.id, 'highness');
        const second = await h.service.portraitCheckout(user, view.id, 'commander');
        expect(h.stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_1');
        expect(h.stripe.sessions.get('cs_1').status).toBe('expired');
        expect(second.checkoutUrl).toBe('https://stripe.test/cs_2');
        expect(h.images.docs).toHaveLength(1);
        expect(h.images.docs[0].style).toBe('commander');
    });

    it('an old session that is already complete is 409 PORTRAIT_EXISTS', async () => {
        const { h, user, view } = await withCat();
        await h.service.portraitCheckout(user, view.id, 'highness');
        h.stripe.sessions.get('cs_1').status = 'complete';
        expect(await refusal(h.service.portraitCheckout(user, view.id, 'monarch'))).toEqual({
            status: 409,
            code: 'YOURCAT_PORTRAIT_EXISTS',
        });
    });

    it('a style change stops with a retryable 503 when the old session cannot be expired or read', async () => {
        const { h, user, view } = await withCat();
        await h.service.portraitCheckout(user, view.id, 'monarch');
        h.stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('stripe 500'));
        h.stripe.checkout.sessions.retrieve.mockImplementation(async (id: string) => {
            if (h.stripe.checkout.sessions.retrieve.mock.calls.length > 1) throw new Error('stripe 500');
            return h.stripe.sessions.get(id);
        });
        const error = await h.service.portraitCheckout(user, view.id, 'commander').then(
            () => null,
            e => e
        );
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(503);
        // Nothing changed: no second session, and the paid-for style stays on the image.
        expect(h.checkoutService.create).toHaveBeenCalledTimes(1);
        expect(h.images.docs[0].style).toBe('monarch');
    });

    it('a style change stops with 503 when Stripe still reports the old session open', async () => {
        const { h, user, view } = await withCat();
        await h.service.portraitCheckout(user, view.id, 'monarch');
        h.stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('stripe 500'));
        const error = await h.service.portraitCheckout(user, view.id, 'commander').then(
            () => null,
            e => e
        );
        expect((error as HttpException).getStatus()).toBe(503);
        expect(h.checkoutService.create).toHaveBeenCalledTimes(1);
    });

    it('DELETE during the checkout: the new session is expired and the checkout is 410', async () => {
        const { h, user, view } = await withCat();
        const create = h.checkoutService.create.getMockImplementation() as any;
        h.checkoutService.create.mockImplementationOnce(async (input: any) => {
            const result = await create(input);
            await h.service.remove(user, view.id);
            return result;
        });
        expect(await refusal(h.service.portraitCheckout(user, view.id, 'highness'))).toEqual({
            status: 410,
            code: 'YOURCAT_PHOTO_EXPIRED',
        });
        expect(h.stripe.sessions.get('cs_1').status).toBe('expired');
        expect(h.yourcats.docs[0].originalKey).toBeNull();
    });

    it('a record deleted before the Image is claimed gets no Image and no session', async () => {
        const { h, user, view } = await withCat();
        const images = (h.service as any).imageRepository;
        const createImage = images.create.bind(images);
        jest.spyOn(images, 'create').mockImplementationOnce(async (doc: any) => {
            const image = await createImage(doc);
            await h.yourcats.updateOne({}, { $set: { deletedAt: NOW } });
            return image;
        });
        expect((await refusal(h.service.portraitCheckout(user, view.id, 'highness'))).code).toBe(
            'YOURCAT_PHOTO_EXPIRED'
        );
        expect(h.images.docs).toHaveLength(0);
        expect(h.checkoutService.create).not.toHaveBeenCalled();
    });

    it('a COMPLETE order on the record is 409 PORTRAIT_EXISTS', async () => {
        const { h, user, view } = await withCat();
        await h.service.portraitCheckout(user, view.id, 'highness');
        await h.orders.updateOne({}, { $set: { status: 'COMPLETE' } });
        expect((await refusal(h.service.portraitCheckout(user, view.id, 'highness'))).code).toBe(
            'YOURCAT_PORTRAIT_EXISTS'
        );
        expect((await h.service.get(user, view.id)).portrait.status).toBe('painting');
    });

    it('moves originalDeleteAfter to at least now + 3 days', async () => {
        const { h, user, view } = await withCat();
        await h.yourcats.updateOne({}, { $set: { originalDeleteAfter: new Date(NOW.getTime() + DAY_MS) } });
        await h.service.portraitCheckout(user, view.id, 'highness');
        expect(h.yourcats.docs[0].originalDeleteAfter.getTime()).toBe(NOW.getTime() + 3 * DAY_MS);

        // A later date is kept.
        const later = new Date(NOW.getTime() + 20 * DAY_MS);
        await h.yourcats.updateOne({}, { $set: { originalDeleteAfter: later } });
        await h.service.portraitCheckout(user, view.id, 'highness');
        expect(h.yourcats.docs[0].originalDeleteAfter).toEqual(later);
    });

    it('is 503 when the upsell is off and 410 when the photo is gone', async () => {
        const { h, user, view } = await withCat();
        process.env.YOURCAT_PORTRAIT_ENABLED = 'false';
        expect(await refusal(h.service.portraitCheckout(user, view.id, 'highness'))).toEqual({
            status: 503,
            code: 'YOURCAT_PORTRAIT_DISABLED',
        });
        process.env.YOURCAT_PORTRAIT_ENABLED = 'true';
        await h.yourcats.updateOne({}, { $set: { originalKey: null } });
        expect(await refusal(h.service.portraitCheckout(user, view.id, 'highness'))).toEqual({
            status: 410,
            code: 'YOURCAT_PHOTO_EXPIRED',
        });
    });
});

describe('PortraitCheckoutService', () => {
    function service() {
        const stripe = {
            checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_9', url: 'https://s/cs_9' })) } },
        };
        const orderRepository = { create: jest.fn(async (doc: any) => doc) };
        const checkout = new PortraitCheckoutService({ stripe } as any, orderRepository as any);
        checkout.now = () => NOW;
        return { checkout, stripe, orderRepository };
    }

    const input = {
        productType: ProductType.DIGITAL,
        userId: '64b7f0c2a1b2c3d4e5f60719',
        successUrl: 'https://s/ok',
        cancelUrl: 'https://s/cancel',
    };

    it('charges €14 in EUR with Adaptive Pricing off, the withdrawal checkbox and a 2 h expiry', async () => {
        const { checkout, stripe, orderRepository } = service();
        await checkout.create({ ...input, metadata: { source: 'yourcat' } });
        const params: any = (stripe.checkout.sessions.create.mock.calls[0] as any[])[0];
        expect(params.line_items[0].price_data).toMatchObject({ currency: 'eur', unit_amount: 1400 });
        expect(params.adaptive_pricing).toEqual({ enabled: false });
        expect(params.consent_collection).toEqual({ terms_of_service: 'required' });
        expect(params.custom_text.terms_of_service_acceptance.message).toBe(WITHDRAWAL_ACKNOWLEDGEMENT);
        expect(params.expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 2 * 60 * 60);
        expect(params.customer_email).toBeUndefined();
        expect(orderRepository.create.mock.calls[0][0]).toMatchObject({
            status: 'PENDING',
            price: 14,
            priceUsd: 16.1,
            currencyType: CurrencyType.EUR,
            hash: 'cs_9',
            id: ProductType.DIGITAL,
        });
    });

    it('prices canvas at €69 with a EUR shipping rate and no withdrawal checkbox', async () => {
        const { checkout } = service();
        const params: any = checkout.sessionParams({ ...input, productType: ProductType.CANVAS, email: 'a@b.test' });
        expect(params.line_items[0].price_data.unit_amount).toBe(6900);
        expect(params.shipping_options[0].shipping_rate_data.fixed_amount.currency).toBe('eur');
        expect(params.consent_collection).toBeUndefined();
        expect(params.customer_email).toBe('a@b.test');
    });

    describe('the withdrawal checkbox on legacy /portrait sessions', () => {
        const OLD_ENV = process.env;
        afterEach(() => {
            process.env = OLD_ENV;
        });

        it('is off until PORTRAIT_CHECKOUT_TOS_CONSENT=true (Stripe refuses it without a terms URL)', () => {
            process.env = { ...OLD_ENV };
            delete process.env.PORTRAIT_CHECKOUT_TOS_CONSENT;
            const { checkout } = service();
            const params: any = checkout.sessionParams(input);
            expect(params.consent_collection).toBeUndefined();
            expect(params.custom_text).toBeUndefined();
            expect(withdrawalCheckboxOn({}, {})).toBe(false);
        });

        it('is on with the flag, and always on /yourcat', () => {
            process.env = { ...OLD_ENV, PORTRAIT_CHECKOUT_TOS_CONSENT: 'true' };
            const { checkout } = service();
            expect((checkout.sessionParams(input) as any).consent_collection).toEqual({ terms_of_service: 'required' });
            expect(withdrawalCheckboxOn({ metadata: { source: 'yourcat' } }, {})).toBe(true);
        });
    });
});
