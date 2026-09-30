import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { OrderStatus, ProductType } from 'src/web3/order.schema';
import { ImageController } from './image.controller';

// One shared fake Stripe client, whichever module creates it (some create it at import time).
jest.mock('stripe', () => {
    const client = {
        checkout: { sessions: { create: jest.fn() } },
        webhooks: { constructEvent: jest.fn() },
        paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
    };
    return { __esModule: true, default: jest.fn(() => client), client };
});
// Heavy modules the controller imports; none of them are exercised here.
jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/image.utils', () => ({ uploadFileImage: jest.fn() }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('./image.repository', () => ({ ImageRepository: class {} }));

const stripeMock = jest.requireMock('stripe').client;
const USER_ID = '64b7f0c2a1b2c3d4e5f60719';
const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';

function setup() {
    const orderModel = { findOneAndUpdate: jest.fn() };
    const orderRepository = {
        model: orderModel,
        create: jest.fn().mockResolvedValue({}),
        findOne: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
    };
    const userRepository = {
        findOne: jest.fn().mockResolvedValue({ _id: { toString: () => USER_ID } }),
        update: jest.fn().mockResolvedValue({}),
    };
    const imageRepository = { findOne: jest.fn().mockResolvedValue({ _id: IMAGE_ID }) };
    const catService = { createBlessingWithCat: jest.fn().mockResolvedValue({}) };
    const stripePayments = new StripePaymentService(orderRepository as any, userRepository as any);
    (stripePayments as any).stripeClient = stripeMock;

    // Extra constructor arguments are ignored by a controller that does not take them.
    const Controller = ImageController as any;
    const controller: ImageController = new Controller(
        imageRepository,
        orderRepository,
        {},
        userRepository,
        catService,
        stripePayments
    );
    return { controller, orderRepository, orderModel, userRepository, catService };
}

function webhookRequest() {
    return { rawBody: Buffer.from('{}') } as any;
}

describe('ImageController Stripe', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_test' };
        delete process.env.SENDGRID_API_KEY;
        stripeMock.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' });
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    describe('create-checkout-session', () => {
        it('charges the server price and ignores the client amount', async () => {
            const { controller, orderRepository } = setup();

            await controller.createCheckoutSession({
                amount: 1,
                productType: ProductType.CANVAS,
                imageId: IMAGE_ID,
                userId: USER_ID,
            });

            const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
            expect(params.line_items[0].price_data.unit_amount).toBe(6900);
            expect(orderRepository.create.mock.calls[0][0]).toMatchObject({ price: 69, priceUsd: 69 });
        });

        it('rejects an unknown product before creating a session', async () => {
            const { controller } = setup();
            await expect(
                controller.createCheckoutSession({ amount: 600, productType: 'poster' as any, userId: USER_ID })
            ).rejects.toThrow('Invalid productType');
            expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
        });
    });

    describe('webhook checkout.session.completed', () => {
        const pendingOrder = () => ({
            _id: 'o1',
            status: OrderStatus.PENDING,
            id: ProductType.DIGITAL,
            price: 6,
            priceUsd: 6,
            user: { _id: { toString: () => USER_ID }, email: 'buyer@example.test' },
            image: { aiUrl: 'https://cdn.test/ai.webp' },
        });
        const completedEvent = (overrides: Record<string, any> = {}) => ({
            type: 'checkout.session.completed',
            data: {
                object: { id: 'cs_1', payment_status: 'paid', currency: 'usd', amount_total: 600, ...overrides },
            },
        });

        it('grants once when Stripe delivers the same event twice', async () => {
            const { controller, orderRepository, orderModel, userRepository, catService } = setup();
            stripeMock.webhooks.constructEvent.mockReturnValue(completedEvent());
            // Both deliveries read the order while it is still PENDING.
            orderRepository.findOne.mockResolvedValue(pendingOrder());
            orderModel.findOneAndUpdate
                .mockReturnValueOnce({ lean: () => Promise.resolve({ _id: 'o1', status: OrderStatus.COMPLETE }) })
                .mockReturnValueOnce({ lean: () => Promise.resolve(null) });

            await Promise.all([
                controller.handleStripeWebhook(webhookRequest(), 'sig'),
                controller.handleStripeWebhook(webhookRequest(), 'sig'),
            ]);

            expect(userRepository.update).toHaveBeenCalledTimes(1);
            expect(catService.createBlessingWithCat).toHaveBeenCalledTimes(1);
        });

        it('does not grant an underpaid session', async () => {
            const { controller, orderRepository, orderModel, userRepository, catService } = setup();
            stripeMock.webhooks.constructEvent.mockReturnValue(completedEvent({ amount_total: 50 }));
            orderRepository.findOne.mockResolvedValue(pendingOrder());
            orderModel.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ _id: 'o1' }) });

            await expect(controller.handleStripeWebhook(webhookRequest(), 'sig')).resolves.toEqual({
                received: true,
            });
            expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
            expect(orderRepository.update).not.toHaveBeenCalled();
            expect(userRepository.update).not.toHaveBeenCalled();
            expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
        });

        it('does not grant an unpaid session', async () => {
            const { controller, orderRepository, userRepository } = setup();
            stripeMock.webhooks.constructEvent.mockReturnValue(completedEvent({ payment_status: 'unpaid' }));
            orderRepository.findOne.mockResolvedValue(pendingOrder());

            await controller.handleStripeWebhook(webhookRequest(), 'sig');
            expect(userRepository.update).not.toHaveBeenCalled();
        });
    });
});

describe('ImageController guards', () => {
    const proto = ImageController.prototype as any;
    const guardsOf = (handler: string) => Reflect.getMetadata(GUARDS_METADATA, proto[handler]) || [];

    it('requires auth on the paid portrait regenerate endpoint', () => {
        expect(guardsOf('regeneratePortrait')).toContain(AuthGuard('appauth'));
    });

    it('rate-limits portrait regenerate to 3 per minute', () => {
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.regeneratePortrait)).toBe(3);
        expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto.regeneratePortrait)).toBe(60000);
    });

    it('keeps 5 per minute on portrait create and checkout, without a second route-level throttler', () => {
        for (const handler of ['createPortrait', 'createCheckoutSession', 'createCheckoutSessionSigned']) {
            expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto[handler])).toBe(5);
            // The global APP_GUARD already counts the request; a route ThrottlerGuard would count it twice.
            expect(guardsOf(handler)).not.toContain(ThrottlerGuard);
        }
    });

    it('never throttles the Stripe webhook', () => {
        expect(Reflect.getMetadata('THROTTLER:SKIPdefault', proto.handleStripeWebhook)).toBe(true);
    });
});
