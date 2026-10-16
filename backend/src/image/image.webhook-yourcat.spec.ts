import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { OrderStatus, ProductType } from 'src/web3/order.schema';
import { ImageController } from './image.controller';

// One shared fake Stripe client, whichever module creates it.
jest.mock('stripe', () => {
    const client = { webhooks: { constructEvent: jest.fn() }, checkout: { sessions: { create: jest.fn() } } };
    return { __esModule: true, default: jest.fn(() => client), client };
});
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

const stripeMock = jest.requireMock('stripe').client;
const { sendOrderConfirmationEmail } = jest.requireMock('./order-email');
const USER_ID = '64b7f0c2a1b2c3d4e5f60719';

function setup(order: Record<string, any>) {
    const orderModel = {
        findOneAndUpdate: jest.fn().mockReturnValue({
            lean: () => Promise.resolve({ _id: order._id, status: OrderStatus.COMPLETE }),
        }),
    };
    const orderRepository = { model: orderModel, findOne: jest.fn().mockResolvedValue(order) };
    const userRepository = { update: jest.fn().mockResolvedValue({}) };
    const catService = { createBlessingWithCat: jest.fn().mockResolvedValue({}) };
    const stripePayments = new StripePaymentService(orderRepository as any, userRepository as any);
    (stripePayments as any).stripeClient = stripeMock;
    const budget = { count: jest.fn().mockResolvedValue(undefined) };
    const delivery = { deliverInBackground: jest.fn() };
    const controller = new (ImageController as any)(
        {},
        orderRepository,
        {},
        userRepository,
        catService,
        stripePayments,
        {},
        {},
        budget,
        delivery
    ) as ImageController;
    return { controller, orderRepository, orderModel, userRepository, catService, budget, delivery };
}

const event = (session: Record<string, any>) => ({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', payment_status: 'paid', ...session } },
});

const eurOrder = (image: Record<string, any>, user: Record<string, any> = { _id: USER_ID }) => ({
    _id: 'o1',
    status: OrderStatus.PENDING,
    id: ProductType.DIGITAL,
    price: 14,
    priceUsd: 16.1,
    currencyType: 'EUR',
    user: { ...user, _id: { toString: () => USER_ID } },
    image,
});

const run = (controller: ImageController) =>
    controller.handleStripeWebhook({ rawBody: Buffer.from('{}') } as any, 'sig');

describe('POST /image/webhook (bet #3)', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_test' };
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('populates the image with its source', async () => {
        const { controller, orderRepository } = setup(eurOrder({ aiUrl: 'https://cdn.test/ai.webp' }));
        stripeMock.webhooks.constructEvent.mockReturnValue(event({ currency: 'eur', amount_total: 1400 }));
        await run(controller);
        const populate = orderRepository.findOne.mock.calls[0][0].populate;
        expect(populate).toContainEqual({ path: 'image', select: 'url aiUrl source name style' });
    });

    it('an EUR session completes an EUR order; spent uses the stored USD stats figure', async () => {
        const { controller, orderModel, userRepository, catService, budget } = setup(
            eurOrder({ aiUrl: 'https://cdn.test/ai.webp' }, { email: 'buyer@example.test' })
        );
        stripeMock.webhooks.constructEvent.mockReturnValue(event({ currency: 'eur', amount_total: 1400 }));
        await run(controller);
        expect(orderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(userRepository.update.mock.calls[0][1].$inc).toMatchObject({ spentUsd: 16.1, portraitPurchases: 1 });
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER_ID, 'https://cdn.test/ai.webp');
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('buyer@example.test', 'https://cdn.test/ai.webp');
        expect(budget.count.mock.calls.map(call => call[0])).toEqual(['portraitsPaid']);
    });

    it('a session with currency_conversion (Adaptive Pricing) is judged on its source currency and amount', async () => {
        const paid = setup(eurOrder({ aiUrl: 'https://cdn.test/ai.webp' }));
        stripeMock.webhooks.constructEvent.mockReturnValue(
            event({
                currency: 'usd',
                amount_total: 1650,
                currency_conversion: { source_currency: 'eur', amount_total: 1400 },
            })
        );
        await run(paid.controller);
        expect(paid.orderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);

        const underpaid = setup(eurOrder({ aiUrl: 'https://cdn.test/ai.webp' }));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        stripeMock.webhooks.constructEvent.mockReturnValue(
            event({
                currency: 'usd',
                amount_total: 1650,
                currency_conversion: { source_currency: 'eur', amount_total: 900 },
            })
        );
        await run(underpaid.controller);
        expect(underpaid.orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a USD $6 order created before the change still grants', async () => {
        const legacy = {
            ...eurOrder({ aiUrl: 'https://cdn.test/ai.webp' }),
            price: 6,
            priceUsd: 6,
            currencyType: 'USD',
            createdAt: new Date('2026-10-10T10:00:00Z'),
        };
        const { controller, orderModel, catService } = setup(legacy);
        stripeMock.webhooks.constructEvent.mockReturnValue(event({ currency: 'usd', amount_total: 600 }));
        await run(controller);
        expect(orderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(catService.createBlessingWithCat).toHaveBeenCalled();
    });

    it('a /yourcat order skips createBlessingWithCat, starts the delivery and counts both counters', async () => {
        const { controller, catService, delivery, budget } = setup(eurOrder({ source: 'yourcat', name: 'Biscuit' }));
        stripeMock.webhooks.constructEvent.mockReturnValue(event({ currency: 'eur', amount_total: 1400 }));
        await run(controller);
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
        expect(delivery.deliverInBackground).toHaveBeenCalledWith('o1');
        expect(budget.count.mock.calls.map(call => call[0])).toEqual(['portraitsPaid', 'yourcatPortraitsPaid']);
    });

    it("emails the address Checkout collected when the buyer's account has none", async () => {
        const { controller } = setup(eurOrder({ aiUrl: 'https://cdn.test/ai.webp' }));
        stripeMock.webhooks.constructEvent.mockReturnValue(
            event({ currency: 'eur', amount_total: 1400, customer_details: { email: 'guest@example.test' } })
        );
        await run(controller);
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('guest@example.test', 'https://cdn.test/ai.webp');
    });
});
