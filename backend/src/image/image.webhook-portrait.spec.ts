import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { OrderStatus, ProductType } from 'src/web3/order.schema';
import { ImageController, LATE_PUBLISH_GRACE_MS, pastLatePublishGrace } from './image.controller';

/*
 * CR1-03: a paid `/portrait` 4K is private until its order is COMPLETE (KI-08). When the webhook cannot
 * publish it, or SendGrid refuses the order email, an alert names the order; nothing is ever sent with a
 * private URL; and GET /image/:id, once it publishes the 4K late, sends the email and makes the cat once.
 */

jest.mock('stripe', () => {
    const client = {
        webhooks: { constructEvent: jest.fn() },
        checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    };
    return { __esModule: true, default: jest.fn(() => client), client };
});
jest.mock('src/shared/utils/ai-portrait', () => ({
    generatePortraitForImage: jest.fn(),
    publishPaidPortrait: jest.fn(),
}));
jest.mock('src/shared/utils/image.utils', () => ({ uploadFileImage: jest.fn(), isHeicImage: () => false }));
jest.mock('src/shared/utils/aws.utils', () => ({ uploadFile: jest.fn() }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('./image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/yourcat/portrait-delivery.service', () => ({ PortraitDeliveryService: class {} }));
jest.mock('./order-email', () => ({ sendOrderConfirmationEmail: jest.fn() }));

const stripeMock = jest.requireMock('stripe').client;
const { publishPaidPortrait } = jest.requireMock('src/shared/utils/ai-portrait');
const { sendOrderConfirmationEmail } = jest.requireMock('./order-email');

const USER_ID = '64b7f0c2a1b2c3d4e5f60719';
const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
const ORDER_ID = '64b7f0c2a1b2c3d4e5f60717';
const PRIVATE_4K = 's3private://portraits/0b7c6f3e-4K.png';
const PREVIEW = 'https://cdn.test/preview-1024.webp';
const PUBLIC_4K = 'https://cdn.test/full-4K.png';
const EMAIL = 'buyer@example.test';

const portraitImage = (fields: Record<string, unknown> = {}) => ({
    _id: IMAGE_ID,
    url: 'https://cdn.test/photo.webp',
    source: 'portrait',
    aiUrl: PRIVATE_4K,
    previewUrl: PREVIEW,
    ...fields,
});

const pendingOrder = () => ({
    _id: ORDER_ID,
    status: OrderStatus.PENDING,
    id: ProductType.DIGITAL,
    price: 14,
    priceUsd: 16.1,
    currencyType: 'EUR',
    user: { _id: { toString: () => USER_ID }, email: EMAIL },
    image: portraitImage(),
});

/** "Now" in the GET specs; the orders below turned COMPLETE relative to it. */
const NOW = Date.parse('2026-10-11T12:00:00Z');
const PAST_GRACE = new Date(NOW - LATE_PUBLISH_GRACE_MS - 1000);

const completeOrder = (fields: Record<string, unknown> = {}) => ({
    _id: ORDER_ID,
    hash: 'cs_test_1',
    updatedAt: PAST_GRACE,
    user: { _id: { toString: () => USER_ID }, email: EMAIL },
    ...fields,
});

function setup(image: Record<string, unknown> = portraitImage()) {
    const orderModel = {
        findOneAndUpdate: jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ _id: ORDER_ID, status: OrderStatus.COMPLETE }),
        }),
    };
    const orderRepository = { model: orderModel, findOne: jest.fn() };
    const imageRepository = { findOne: jest.fn().mockResolvedValue(image), update: jest.fn() };
    const userRepository = { update: jest.fn().mockResolvedValue({}) };
    const catService = { createBlessingWithCat: jest.fn().mockResolvedValue({}) };
    const stripePayments = new StripePaymentService(orderRepository as any, userRepository as any);
    (stripePayments as any).stripeClient = stripeMock;
    const budget = { count: jest.fn().mockResolvedValue(undefined), alert: jest.fn().mockResolvedValue(true) };
    const controller = new (ImageController as any)(
        imageRepository,
        orderRepository,
        {},
        userRepository,
        catService,
        stripePayments,
        {},
        {},
        budget,
        { deliverInBackground: jest.fn() }
    ) as ImageController;
    (controller as any).now = () => NOW;
    return { controller, orderRepository, imageRepository, catService, budget };
}

const webhook = (controller: ImageController) =>
    controller.handleStripeWebhook({ rawBody: Buffer.from('{}') } as any, 'sig');

/** `publishPaidPortrait` stub: publishes `url`; `publishedNow` says whether this call switched it. */
const publishes = (url = PUBLIC_4K, publishedNow = true) =>
    publishPaidPortrait.mockImplementation(async (_image: unknown, _repo: unknown, outcome: any) => {
        outcome.publishedNow = publishedNow;
        return url;
    });

const sentWithPrivateUrl = (mock: jest.Mock) =>
    mock.mock.calls.some(call => JSON.stringify(call).includes('s3private://'));

describe('CR1-03: paid /portrait delivery on the Stripe webhook', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.clearAllMocks();
        publishPaidPortrait.mockReset();
        process.env = { ...OLD_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_test' };
        stripeMock.webhooks.constructEvent.mockReturnValue({
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_1', payment_status: 'paid', currency: 'eur', amount_total: 1400 } },
        });
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());
    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('publish throws: an alert with the order id, no email, no cat, nothing with the private URL', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(pendingOrder());
        publishPaidPortrait.mockRejectedValue(new Error('spaces down'));

        await expect(webhook(controller)).resolves.toEqual({ received: true });

        expect(budget.alert).toHaveBeenCalledTimes(1);
        const [subject, text] = budget.alert.mock.calls[0];
        expect(subject).toContain(ORDER_ID);
        expect(text).toContain(ORDER_ID);
        // Only the order id: no address, no URL.
        expect(`${subject} ${text}`).not.toMatch(/@|https?:\/\/|s3private/);
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
        expect(sentWithPrivateUrl(catService.createBlessingWithCat)).toBe(false);
    });

    it('email refused: an alert with the order id; the cat is still made from the public URL', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(pendingOrder());
        publishes();
        sendOrderConfirmationEmail.mockResolvedValue(false);

        await webhook(controller);

        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(EMAIL, PUBLIC_4K);
        expect(budget.alert).toHaveBeenCalledTimes(1);
        expect(budget.alert.mock.calls[0][0]).toContain(ORDER_ID);
        expect(`${budget.alert.mock.calls[0][0]} ${budget.alert.mock.calls[0][1]}`).not.toMatch(/@|https?:\/\//);
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER_ID, PUBLIC_4K);
    });

    it('delivered: email and cat with the public URL, no alert', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(pendingOrder());
        publishes();
        sendOrderConfirmationEmail.mockResolvedValue(true);

        await webhook(controller);

        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(EMAIL, PUBLIC_4K);
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER_ID, PUBLIC_4K);
        expect(budget.alert).not.toHaveBeenCalled();
    });

    it('a concurrent GET /image/:id published it first: the webhook sends nothing (the retry delivers)', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(pendingOrder());
        publishes(PUBLIC_4K, false);

        await webhook(controller);

        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
        expect(budget.alert).not.toHaveBeenCalled();
    });
});

describe('CR1-03: GET /image/:id finishes a delivery the webhook missed', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        publishPaidPortrait.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('publishes late, then emails and makes the cat once; a second GET delivers nothing more', async () => {
        const { controller, orderRepository, imageRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(completeOrder());
        publishes();
        sendOrderConfirmationEmail.mockResolvedValue(true);

        const image: any = await controller.findOne(IMAGE_ID);
        await (controller as any).lateDelivery;

        expect(image.aiUrl).toBe(PUBLIC_4K);
        expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(EMAIL, PUBLIC_4K);
        expect(catService.createBlessingWithCat).toHaveBeenCalledTimes(1);
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER_ID, PUBLIC_4K);
        expect(budget.alert).not.toHaveBeenCalled();
        // The late delivery reads the COMPLETE order with its buyer's email and its Checkout session id.
        expect(orderRepository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                searchObject: expect.objectContaining({ image: IMAGE_ID, status: OrderStatus.COMPLETE }),
                projection: expect.stringContaining('hash'),
                populate: [{ path: 'user', select: 'email' }],
            })
        );
        // The account has an email: Stripe is not asked.
        expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();

        // The 4K is public now: the next GET serves it and sends nothing.
        imageRepository.findOne.mockResolvedValue(portraitImage({ aiUrl: PUBLIC_4K }));
        (controller as any).lateDelivery = undefined;
        await controller.findOne(IMAGE_ID);
        expect((controller as any).lateDelivery).toBeUndefined();
        expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
        expect(catService.createBlessingWithCat).toHaveBeenCalledTimes(1);
    });

    it('a GET that loses the publish race to the webhook delivers nothing', async () => {
        const { controller, orderRepository, catService } = setup();
        orderRepository.findOne.mockResolvedValue(completeOrder());
        publishes(PUBLIC_4K, false);

        const image: any = await controller.findOne(IMAGE_ID);

        expect(image.aiUrl).toBe(PUBLIC_4K);
        expect((controller as any).lateDelivery).toBeUndefined();
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
    });

    it('publish fails again: the preview, no delivery, no private URL anywhere', async () => {
        const { controller, orderRepository, catService } = setup();
        orderRepository.findOne.mockResolvedValue(completeOrder());
        publishPaidPortrait.mockRejectedValue(new Error('spaces down'));

        const image: any = await controller.findOne(IMAGE_ID);

        expect(image.aiUrl).toBe(PREVIEW);
        expect(JSON.stringify(image)).not.toContain('s3private://');
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
    });

    it('a late email that is refused raises the order-id alert', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(completeOrder());
        publishes();
        sendOrderConfirmationEmail.mockResolvedValue(false);

        await controller.findOne(IMAGE_ID);
        await (controller as any).lateDelivery;

        expect(budget.alert).toHaveBeenCalledTimes(1);
        expect(budget.alert.mock.calls[0][0]).toContain(ORDER_ID);
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER_ID, PUBLIC_4K);
    });

    it('an unpaid portrait is never published or delivered', async () => {
        const { controller, orderRepository, catService } = setup();
        orderRepository.findOne.mockResolvedValue(null);

        const image: any = await controller.findOne(IMAGE_ID);

        expect(image.aiUrl).toBe(PREVIEW);
        expect(publishPaidPortrait).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
    });
});

describe('CR2-01: GET /image/:id leaves the publish to the webhook for a grace period', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        publishPaidPortrait.mockReset();
        stripeMock.checkout.sessions.retrieve.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('within the grace period: the preview, nothing published, nothing sent', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        orderRepository.findOne.mockResolvedValue(completeOrder({ updatedAt: new Date(NOW - 30 * 1000) }));
        publishes();

        const image: any = await controller.findOne(IMAGE_ID);

        expect(image.aiUrl).toBe(PREVIEW);
        expect(JSON.stringify(image)).not.toContain('s3private://');
        expect(publishPaidPortrait).not.toHaveBeenCalled();
        expect((controller as any).lateDelivery).toBeUndefined();
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
        expect(budget.alert).not.toHaveBeenCalled();
    });

    it('the grace period counts from the moment the order turned COMPLETE', () => {
        expect(pastLatePublishGrace({ updatedAt: new Date(NOW - LATE_PUBLISH_GRACE_MS + 1) }, NOW)).toBe(false);
        expect(pastLatePublishGrace({ updatedAt: new Date(NOW - LATE_PUBLISH_GRACE_MS) }, NOW)).toBe(true);
        expect(pastLatePublishGrace({ createdAt: new Date(NOW - 1000) }, NOW)).toBe(false);
        // An order without timestamps (legacy) is past it.
        expect(pastLatePublishGrace({}, NOW)).toBe(true);
    });

    it('after the grace period: publishes, and a guest buyer with only a Checkout email is emailed', async () => {
        const { controller, orderRepository, catService, budget } = setup();
        // A guest account without an email: Checkout collected it.
        orderRepository.findOne.mockResolvedValue(completeOrder({ user: { _id: { toString: () => USER_ID } } }));
        stripeMock.checkout.sessions.retrieve.mockResolvedValue({ customer_details: { email: 'guest@example.test' } });
        publishes();
        sendOrderConfirmationEmail.mockResolvedValue(true);

        const image: any = await controller.findOne(IMAGE_ID);
        await (controller as any).lateDelivery;

        expect(image.aiUrl).toBe(PUBLIC_4K);
        expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledTimes(1);
        expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_1');
        expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('guest@example.test', PUBLIC_4K);
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER_ID, PUBLIC_4K);
        expect(budget.alert).not.toHaveBeenCalled();
    });

    it('no account email and no Checkout session (a card-confirm order): the "not emailed" alert, Stripe not asked', async () => {
        const { controller, orderRepository, budget } = setup();
        orderRepository.findOne.mockResolvedValue(
            completeOrder({ hash: 'pi_123', user: { _id: { toString: () => USER_ID } } })
        );
        publishes();

        await controller.findOne(IMAGE_ID);
        await (controller as any).lateDelivery;

        expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(budget.alert).toHaveBeenCalledTimes(1);
        expect(budget.alert.mock.calls[0][0]).toBe(`Paid portrait published but not emailed (order ${ORDER_ID})`);
    });

    it('Stripe unreadable: the "not emailed" alert, the GET still answers with the public URL', async () => {
        const { controller, orderRepository, budget } = setup();
        orderRepository.findOne.mockResolvedValue(completeOrder({ user: { _id: { toString: () => USER_ID } } }));
        stripeMock.checkout.sessions.retrieve.mockRejectedValue(new Error('stripe down'));
        publishes();

        const image: any = await controller.findOne(IMAGE_ID);
        await (controller as any).lateDelivery;

        expect(image.aiUrl).toBe(PUBLIC_4K);
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(budget.alert).toHaveBeenCalledTimes(1);
    });
});
