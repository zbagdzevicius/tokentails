import { Types } from 'mongoose';
import { memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { PortraitDeliveryService } from './portrait-delivery.service';
import { guestUser, harness, NOW } from './yourcat-harness.helper-spec';

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

async function paidOrder(options: { email?: string; deleteAfterDelivery?: boolean } = {}) {
    const h = harness({ users: [guestUser(options.email ? { email: options.email } : {})] });
    const user = h.users.docs[0];
    const image: any = await h.images.create({
        url: 's3private://yourcat/originals/a.webp',
        source: 'yourcat',
        style: 'monarch',
    });
    await h.yourcats.create({
        owner: user._id,
        source: 'photo',
        name: 'Biscuit',
        family: 'OREO',
        cat: new Types.ObjectId(),
        originalKey: 'yourcat/originals/a.webp',
        originalDeleteAfter: new Date(NOW.getTime() + 3 * DAY_MS),
        deleteOriginalAfterDelivery: !!options.deleteAfterDelivery,
        portraitImage: image._id,
        portraitAttempts: 0,
        avatarStatus: 'ready',
    });
    const session = await h.stripe.checkout.sessions.create({ metadata: {} });
    (session as any).customer_details = { email: 'checkout@example.test' };
    const order: any = await h.orders.create({
        status: 'COMPLETE',
        entityType: 'IMAGE',
        hash: session.id,
        image: image._id,
        user: user._id,
        id: 'digital',
    });

    const delivery = new PortraitDeliveryService(
        memoryRepository(h.yourcats) as any,
        h.service,
        memoryRepository(h.orders) as any,
        memoryRepository(h.images) as any,
        h.budget,
        h.checkoutService as any
    );
    delivery.now = () => NOW;
    const paint = jest.fn(async (imageId: string, _repo: unknown, _style: string, options: any) => {
        options?.onUsage?.({
            provider: 'gemini',
            model: 'gemini-3.1-flash-image-preview',
            inputTokens: 1000,
            outputTokens: 0,
            images: 1,
            imageSize: '4K',
        });
        await h.images.updateOne({ _id: new Types.ObjectId(imageId) }, { $set: { aiUrl: 'https://cdn.test/hd.webp' } });
        return 'https://cdn.test/hd.webp';
    });
    const email = jest.fn(async () => undefined);
    delivery.io = { generatePortraitForImage: paint as any, sendOrderConfirmationEmail: email };
    return { h, delivery, order, image, paint, email };
}

describe('PortraitDeliveryService', () => {
    it('delivers once: paints from the image, emails with the custom subject, extends the photo by 30 days', async () => {
        const { h, delivery, order, image, paint, email } = await paidOrder({ email: 'buyer@example.test' });
        await expect(delivery.deliver(order._id)).resolves.toBe('delivered');

        expect(paint).toHaveBeenCalledWith(String(image._id), expect.anything(), 'monarch', expect.any(Object));
        expect(email).toHaveBeenCalledTimes(1);
        expect(email).toHaveBeenCalledWith('buyer@example.test', 'https://cdn.test/hd.webp', {
            subject: 'Your portrait of Biscuit is ready',
        });
        expect(h.yourcats.docs[0].originalDeleteAfter).toEqual(new Date(NOW.getTime() + 30 * DAY_MS));
        const day = h.days.docs[0];
        expect(day.counts.portraitsDelivered).toBe(1);
        expect(day.spentMicroEur).toBe(Math.round(1000 * 1.31) + 99_000);

        // Delivered: a later call (the sweeper, a redelivered webhook) does nothing.
        delivery.now = () => new Date(NOW.getTime() + 60 * 60 * 1000);
        await expect(delivery.deliver(order._id)).resolves.toBe('already-delivered');
        expect(email).toHaveBeenCalledTimes(1);
    });

    it('the lease prevents double work', async () => {
        const { delivery, order, paint } = await paidOrder();
        const outcomes = await Promise.all([delivery.deliver(order._id), delivery.deliver(order._id)]);
        expect(outcomes.sort()).toEqual(['delivered', 'lease-held']);
        expect(paint).toHaveBeenCalledTimes(1);
    });

    it("uses the email Checkout collected when the buyer's account has none", async () => {
        const { delivery, order, email } = await paidOrder();
        await delivery.deliver(order._id);
        expect((email.mock.calls[0] as any[])[0]).toBe('checkout@example.test');
    });

    it('deleteOriginalAfterDelivery deletes the original right after delivery', async () => {
        const { h, delivery, order } = await paidOrder({ deleteAfterDelivery: true });
        await delivery.deliver(order._id);
        expect(h.s3).toContain('delete:yourcat/originals/a.webp');
        expect(h.yourcats.docs[0]).toMatchObject({ originalKey: null, originalSha256: null });
    });

    it('3 failures: an alert, the failed status, and the original deleted if asked', async () => {
        const { h, delivery, order, paint, email } = await paidOrder({ deleteAfterDelivery: true });
        paint.mockRejectedValue(new Error('provider down'));
        jest.spyOn((delivery as any).logger, 'error').mockImplementation(() => undefined);
        for (let attempt = 0; attempt < 3; attempt++) {
            // Each attempt after the previous lease expired.
            delivery.now = () => new Date(NOW.getTime() + attempt * 20 * 60 * 1000);
            await expect(delivery.deliver(order._id)).resolves.toBe('failed');
        }
        expect(h.yourcats.docs[0].portraitAttempts).toBe(3);
        expect(h.budget.alert).toHaveBeenCalledTimes(1);
        expect(h.days.docs[0].counts.portraitsDeliveryFailed).toBe(1);
        expect(email).not.toHaveBeenCalled();
        expect(h.s3).toContain('delete:yourcat/originals/a.webp');

        const user = h.users.docs[0];
        const view = await h.service.get(user, String(h.yourcats.docs[0]._id));
        expect(view.portrait.status).toBe('failed');

        delivery.now = () => new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
        await expect(delivery.deliver(order._id)).resolves.toBe('failed');
        expect(paint).toHaveBeenCalledTimes(3);
    });

    it('the sweeper retries undelivered paid /yourcat orders only', async () => {
        const { h, delivery, paint } = await paidOrder();
        const other: any = await h.images.create({ url: 'https://cdn.test/p.webp', source: 'portrait' });
        await h.orders.create({
            status: 'COMPLETE',
            entityType: 'IMAGE',
            hash: 'cs_x',
            image: other._id,
            id: 'digital',
        });
        await expect(delivery.sweepOnce()).resolves.toBe(1);
        expect(paint).toHaveBeenCalledTimes(1);
        await expect(delivery.sweepOnce()).resolves.toBe(0);
    });
});
