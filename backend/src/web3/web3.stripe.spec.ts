import { EntityType } from 'src/shared/interfaces/common.interface';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { PackType } from 'src/web3/order.schema';
import { Web3Controller } from './web3.controller';

jest.mock('stripe', () => {
    const client = { paymentIntents: { create: jest.fn(), retrieve: jest.fn() } };
    return { __esModule: true, default: jest.fn(() => client), client };
});
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('src/image/image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/blessing/blessing.repository', () => ({ BlessingRepository: class {} }));
jest.mock('src/web3/web3.service', () => ({ Web3Service: class {} }));

// These assertions use the regular Legendary price: pin the clock after the $100 promo
// (LEGENDARY_PROMO_ENDS_AT, 28 Nov 2026 00:00 UTC). Only Date is faked.
beforeAll(() => {
    jest.useFakeTimers({
        now: new Date('2026-12-01T00:00:00Z'),
        doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setTimeout',
            'clearTimeout',
            'setInterval',
            'clearInterval',
            'queueMicrotask',
            'hrtime',
            'performance',
        ],
    });
});
afterAll(() => {
    jest.useRealTimers();
});

const stripe = jest.requireMock('stripe').client;
const USER = '64b7f0c2a1b2c3d4e5f60719';

function setup() {
    const orderModel = { findOneAndUpdate: jest.fn() };
    const orderRepository = {
        model: orderModel,
        create: jest.fn().mockResolvedValue({ _id: 'o1' }),
        findOne: jest.fn(),
        update: jest.fn(),
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
    const blessingRepository = { find: jest.fn().mockResolvedValue([{ cat: 'c1' }]) };
    const catService = {
        adopt: jest.fn().mockResolvedValue({ success: true, cat: { _id: 'c1' } }),
        pickPackCat: jest.fn().mockResolvedValue('c1'),
    };
    const svc = new StripePaymentService(orderRepository as any, userRepository as any);
    (svc as any).stripeClient = stripe;
    const ctrl = new (Web3Controller as any)(
        orderRepository,
        catService,
        userRepository,
        blessingRepository,
        {},
        {},
        svc
    );
    return { ctrl, orderModel, catService };
}
const pi = (amount: number, extra: Record<string, string> = {}) => ({
    id: 'pi_1',
    status: 'succeeded',
    currency: 'usd',
    amount,
    amount_received: amount,
    metadata: {
        entityType: EntityType.PACK,
        id: PackType.LEGENDARY,
        packType: PackType.LEGENDARY,
        userId: USER,
        ...extra,
    },
});

describe('web3 Stripe PaymentIntents', () => {
    beforeEach(() => jest.clearAllMocks());

    it('create-payment charges the server price, not the client amount', async () => {
        const { ctrl } = setup();
        stripe.paymentIntents.create.mockResolvedValue({ client_secret: 's' });
        await ctrl.createPayment({ amount: 1, id: PackType.LEGENDARY }, USER);
        expect(stripe.paymentIntents.create.mock.calls[0][0].amount).toBe(35000);
    });

    it('does not grant an underpaid intent', async () => {
        const { ctrl, catService } = setup();
        stripe.paymentIntents.retrieve.mockResolvedValue(pi(100));
        await expect(ctrl.confirmPayment({ paymentIntent: 'pi_1', clientSecret: 's' }, USER)).rejects.toThrow();
        expect(catService.adopt).not.toHaveBeenCalled();
    });

    it('grants a replayed intent only once', async () => {
        const { ctrl, orderModel, catService } = setup();
        stripe.paymentIntents.retrieve.mockResolvedValue(pi(35000, { expectedAmount: '35000' }));
        orderModel.findOneAndUpdate
            .mockResolvedValueOnce({ value: { _id: 'o1' }, lastErrorObject: { updatedExisting: false } })
            .mockResolvedValueOnce({ value: { _id: 'o1' }, lastErrorObject: { updatedExisting: true } });
        await ctrl.confirmPayment({ paymentIntent: 'pi_1', clientSecret: 's' }, USER);
        const replay = await ctrl.confirmPayment({ paymentIntent: 'pi_1', clientSecret: 's' }, USER);
        expect(catService.adopt).toHaveBeenCalledTimes(1);
        expect(replay.success).toBe(false);
    });

    it('hides Stripe SDK error text but keeps its own 4xx messages', async () => {
        const { ctrl } = setup();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        stripe.paymentIntents.retrieve.mockRejectedValue(new Error('No such payment_intent: pi_secret_detail'));
        await expect(ctrl.confirmPayment({ paymentIntent: 'pi_1', clientSecret: 's' }, USER)).rejects.toThrow(
            /^Error confirming payment$/
        );

        stripe.paymentIntents.retrieve.mockResolvedValue(pi(100));
        await expect(ctrl.confirmPayment({ paymentIntent: 'pi_1', clientSecret: 's' }, USER)).rejects.toThrow(
            'Payment amount does not match the price'
        );
    });
});
