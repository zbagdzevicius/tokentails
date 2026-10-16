import { BadRequestException, GoneException, HttpException } from '@nestjs/common';
import { Tier } from 'src/cat/cat.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { PackType } from './order.schema';
import { ChainType } from './web3.model';
import { STELLAR_PACKS_DEPRECATED, stellarPacksSunset, Web3Controller } from './web3.controller';

jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('src/image/image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/blessing/blessing.repository', () => ({ BlessingRepository: class {} }));
jest.mock('src/web3/web3.service', () => ({ Web3Service: class {} }));
// The AI client and S3 are not loaded; the delivery rule (paid-portrait.ts) runs against this stub.
jest.mock('src/shared/utils/ai-portrait', () => ({ publishPaidPortrait: jest.fn() }));
jest.mock('src/image/order-email', () => ({ sendOrderConfirmationEmail: jest.fn() }));

const { publishPaidPortrait } = jest.requireMock('src/shared/utils/ai-portrait');
const { sendOrderConfirmationEmail } = jest.requireMock('src/image/order-email');

const USER = '64b7f0c2a1b2c3d4e5f60719';
const HASH = 'ab'.repeat(32);

function setup(verifiedPriceUsd = 1) {
    const orderRepository = {
        create: jest.fn().mockResolvedValue({ _id: 'order-1' }),
        update: jest.fn(),
        model: { findOneAndUpdate: jest.fn(async () => ({ _id: 'order-1' })) },
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue({ _id: 'owner' }), update: jest.fn() };
    const blessingRepository = { find: jest.fn().mockResolvedValue([{ cat: 'c1' }]) };
    const catService = {
        adopt: jest.fn().mockResolvedValue({ success: true, cat: { _id: 'c1' } }),
        pickPackCat: jest.fn().mockResolvedValue('c1'),
    };
    const web3Service = {
        validatePrice: jest
            .fn()
            .mockResolvedValue({ success: true, amount: verifiedPriceUsd, priceUsd: verifiedPriceUsd }),
    };
    const ctrl = new (Web3Controller as any)(
        orderRepository,
        catService,
        userRepository,
        blessingRepository,
        {},
        web3Service,
        {}
    );
    return { ctrl, orderRepository, userRepository, catService, web3Service };
}

const body = (fields: Record<string, unknown> = {}) => ({
    chainType: ChainType.STELLAR,
    hash: HASH,
    walletAddress: 'GWALLET',
    currencyType: CurrencyType.USDC,
    price: 1,
    entityType: 'LOOT_BOX',
    ...fields,
});

describe('POST /web3/confirm', () => {
    beforeEach(() => jest.clearAllMocks());

    it('refuses a loot box that names a pack, before any order is created', async () => {
        const { ctrl, orderRepository, catService } = setup();

        await expect(ctrl.checkTransaction(USER, body({ id: PackType.LEGENDARY }))).rejects.toBeInstanceOf(
            BadRequestException
        );
        expect(orderRepository.create).not.toHaveBeenCalled();
        expect(catService.adopt).not.toHaveBeenCalled();
    });

    it('refuses an entityType it does not sell, before any order is created', async () => {
        const { ctrl, orderRepository } = setup();

        await expect(ctrl.checkTransaction(USER, body({ entityType: 'CAT', id: PackType.LEGENDARY }))).rejects.toThrow(
            HttpException
        );
        expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('grants a loot box with common odds and no pack type', async () => {
        const { ctrl, catService } = setup();

        await ctrl.checkTransaction(USER, body());
        expect(catService.adopt).toHaveBeenCalledWith('c1', USER, Tier.COMMON, undefined, 'pack');
    });

    it('grants a Stellar pack paid before the sunset (a payment in flight at deploy)', async () => {
        const { ctrl, catService, web3Service } = setup(5);
        web3Service.validatePrice.mockResolvedValue({
            success: true,
            amount: 5,
            priceUsd: 5,
            closedAt: new Date(stellarPacksSunset().getTime() - 60000),
        });
        const res = await ctrl.checkTransaction(USER, body({ entityType: EntityType.PACK, id: PackType.STARTER }));
        expect(res.success).toBe(true);
        expect(catService.adopt).toHaveBeenCalled();
    });

    it('records a Stellar pack paid after the sunset for a refund and answers 410, never losing the payment', async () => {
        const { ctrl, orderRepository, web3Service, userRepository, catService } = setup(5);
        web3Service.validatePrice.mockResolvedValue({
            success: true,
            amount: 5,
            priceUsd: 5,
            closedAt: new Date(stellarPacksSunset().getTime() + 60000),
        });
        const error = await ctrl
            .checkTransaction(USER, body({ entityType: EntityType.PACK, id: PackType.STARTER }))
            .catch((e: HttpException) => e);
        expect(error).toBeInstanceOf(GoneException);
        expect((error as HttpException).getResponse()).toEqual(
            expect.objectContaining({ code: STELLAR_PACKS_DEPRECATED, refund: 'due' })
        );
        // The order exists, is verified, and is marked for a refund; nothing is granted or counted.
        expect(orderRepository.create).toHaveBeenCalled();
        expect(web3Service.validatePrice).toHaveBeenCalled();
        expect(orderRepository.update).toHaveBeenCalledWith('order-1', {
            $set: expect.objectContaining({
                status: 'FAILED_GRANT',
                failureReason: expect.stringMatching(/^STELLAR_DEPRECATED/),
            }),
        });
        expect(orderRepository.model.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'order-1', refund: { $exists: false } },
            { $set: { refund: expect.objectContaining({ state: 'due', reason: 'STELLAR_DEPRECATED', amountUsd: 5 }) } },
            { new: true }
        );
        expect(catService.adopt).not.toHaveBeenCalled();
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('closes at 2026-10-09 18:00 UTC; STELLAR_PACKS_SUNSET_AT can only move it earlier', () => {
        expect(stellarPacksSunset({}).toISOString()).toBe('2026-10-09T18:00:00.000Z');
        expect(stellarPacksSunset({ STELLAR_PACKS_SUNSET_AT: '2026-10-20T12:00:00Z' }).toISOString()).toBe(
            '2026-10-09T18:00:00.000Z'
        );
        expect(stellarPacksSunset({ STELLAR_PACKS_SUNSET_AT: '2026-10-08T12:00:00Z' }).toISOString()).toBe(
            '2026-10-08T12:00:00.000Z'
        );
        expect(stellarPacksSunset({ STELLAR_PACKS_SUNSET_AT: 'soon' }).toISOString()).toBe('2026-10-09T18:00:00.000Z');
    });

    it('keeps selling Stellar packs while the rollback switch STELLAR_PACKS_ENABLED is true', async () => {
        process.env.STELLAR_PACKS_ENABLED = 'true';
        try {
            const { ctrl, orderRepository } = setup(5);
            await ctrl.checkTransaction(USER, body({ entityType: EntityType.PACK, id: PackType.STARTER }));
            expect(orderRepository.create).toHaveBeenCalled();
        } finally {
            delete process.env.STELLAR_PACKS_ENABLED;
        }
    });

    it('credits spent and the affiliate share from the verified amount, not the client price', async () => {
        // A loot box: Stellar packs are deprecated, the spend and affiliate rule is the same.
        const { ctrl, userRepository, web3Service } = setup(5);

        await ctrl.checkTransaction(USER, body({ price: 1e9, discount: 'Friend' }));

        expect(web3Service.validatePrice).toHaveBeenCalledWith(
            CurrencyType.USDC,
            1e9,
            ChainType.STELLAR,
            HASH,
            'order-1'
        );
        expect(userRepository.update).toHaveBeenCalledWith(USER, { $inc: { spent: 5, monthSpent: 5, spentUsd: 5 } });
        expect(userRepository.update).toHaveBeenCalledWith('owner', { $inc: { affiliated: 1 } });
    });

    it("never credits the affiliate share to the buyer's own code", async () => {
        const { ctrl, userRepository } = setup(5);
        userRepository.findOne.mockResolvedValue({ _id: USER });

        await ctrl.checkTransaction(USER, body({ discount: 'Mine' }));

        expect(userRepository.update).not.toHaveBeenCalledWith(USER, { $inc: { affiliated: 1 } });
        expect(userRepository.update).not.toHaveBeenCalledWith(expect.anything(), {
            $inc: { affiliated: expect.anything() },
        });
    });

    it('stores the hash lowercased, so one payment has one order key', async () => {
        const { ctrl, orderRepository } = setup();

        await ctrl.checkTransaction(USER, body({ hash: HASH.toUpperCase() }));
        expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ hash: HASH }));
    });

    it('no longer exposes POST /web3/create', () => {
        expect((Web3Controller.prototype as any).create).toBeUndefined();
    });
});

describe('a paid /portrait image bought by card or on Stellar (KI-08, CR1-01)', () => {
    const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
    const PRIVATE_4K = 's3private://portraits/0b7c6f3e-4K.png';
    const PUBLIC_4K = 'https://cdn.test/full-4K.png';
    const BUYER_EMAIL = 'buyer@example.test';
    const portraitImage = (aiUrl = PRIVATE_4K) => ({ _id: IMAGE_ID, aiUrl, source: 'portrait' });

    function portraitSetup(image: Record<string, unknown> = portraitImage(), buyer: unknown = { email: BUYER_EMAIL }) {
        const orderRepository = {
            create: jest.fn().mockResolvedValue({ _id: 'order-1' }),
            update: jest.fn().mockResolvedValue({}),
        };
        const userRepository = { findOne: jest.fn().mockResolvedValue(buyer), update: jest.fn() };
        const budget = { alert: jest.fn().mockResolvedValue(true) };
        const imageRepository = { findOne: jest.fn().mockResolvedValue(image), update: jest.fn() };
        const catService = { createBlessingWithCat: jest.fn().mockResolvedValue({}) };
        const web3Service = { validatePrice: jest.fn().mockResolvedValue({ success: true, amount: 25, priceUsd: 25 }) };
        const stripePayments = {
            retrieveVerifiedPaymentIntent: jest
                .fn()
                .mockResolvedValue({ entityType: EntityType.IMAGE, imageId: IMAGE_ID, amountUsd: 25 }),
            claimPaymentIntent: jest.fn().mockResolvedValue({ claimed: true, order: { _id: 'order-2' } }),
        };
        const ctrl = new (Web3Controller as any)(
            orderRepository,
            catService,
            userRepository,
            {},
            imageRepository,
            web3Service,
            stripePayments,
            undefined,
            undefined,
            undefined,
            budget
        );
        return { ctrl, orderRepository, userRepository, imageRepository, catService, budget };
    }

    const confirmCard = (ctrl: any) => ctrl.confirmPayment({ paymentIntent: 'pi_1', clientSecret: 's' }, USER);
    const confirmStellar = (ctrl: any) =>
        ctrl.checkTransaction(USER, body({ entityType: EntityType.IMAGE, id: IMAGE_ID, price: 25 }));

    beforeEach(() => {
        publishPaidPortrait.mockReset();
        sendOrderConfirmationEmail.mockReset();
        sendOrderConfirmationEmail.mockResolvedValue(true);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    const publishes = (url = PUBLIC_4K, publishedNow = true) =>
        publishPaidPortrait.mockImplementation(async (_image: unknown, _repo: unknown, outcome: any) => {
            outcome.publishedNow = publishedNow;
            return url;
        });

    it.each([
        ['confirm-payment (card)', confirmCard],
        ['confirm (Stellar)', confirmStellar],
    ])('%s publishes the 4K and gives the blessing cat its public https URL', async (_route, confirm) => {
        const { ctrl, imageRepository, catService } = portraitSetup();
        publishes();

        const res = await confirm(ctrl);

        expect(res.success).toBe(true);
        expect(imageRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ projection: 'aiUrl source' }));
        expect(publishPaidPortrait).toHaveBeenCalledWith(
            expect.objectContaining({ aiUrl: PRIVATE_4K, source: 'portrait' }),
            imageRepository,
            expect.any(Object)
        );
        expect(catService.createBlessingWithCat).toHaveBeenCalledTimes(1);
        const [, url] = catService.createBlessingWithCat.mock.calls[0];
        expect(url).toBe(PUBLIC_4K);
        expect(url).toMatch(/^https:\/\//);
    });

    it.each([
        ['confirm-payment (card)', confirmCard, 'order-2'],
        ['confirm (Stellar)', confirmStellar, 'order-1'],
    ])(
        '%s: a failed publish makes no cat from the private URL, and the order is COMPLETE for the retry',
        async (_route, confirm, orderId) => {
            const { ctrl, orderRepository, catService } = portraitSetup();
            publishPaidPortrait.mockRejectedValue(new Error('spaces down'));

            const res = await confirm(ctrl);

            expect(res.success).toBe(true);
            expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
            expect(orderRepository.update).toHaveBeenCalledWith(
                orderId,
                expect.objectContaining({ status: 'COMPLETE' })
            );
        }
    );

    it('makes no cat when a concurrent GET /image/:id retry published it first (that retry delivers)', async () => {
        const { ctrl, catService } = portraitSetup();
        publishes(PUBLIC_4K, false);

        await confirmCard(ctrl);
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
    });

    it('an older image with a public aiUrl is delivered as is, without publishing', async () => {
        const { ctrl, catService } = portraitSetup({ _id: IMAGE_ID, aiUrl: 'https://cdn.test/legacy.webp' });

        await confirmStellar(ctrl);
        expect(publishPaidPortrait).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER, 'https://cdn.test/legacy.webp');
    });

    it('never hands out a private URL of another source', async () => {
        const { ctrl, catService } = portraitSetup({
            _id: IMAGE_ID,
            aiUrl: 's3private://yourcat/originals/a.webp',
            source: 'yourcat',
        });

        await confirmCard(ctrl);
        expect(publishPaidPortrait).not.toHaveBeenCalled();
        expect(catService.createBlessingWithCat).not.toHaveBeenCalled();
    });

    describe('CR2-05: the order email, like the Stripe webhook', () => {
        it.each([
            ['confirm-payment (card)', confirmCard, 'order-2'],
            ['confirm (Stellar)', confirmStellar, 'order-1'],
        ])(
            '%s: a successful publish sends one email with the public URL to the account email',
            async (_route, confirm) => {
                const { ctrl, userRepository, budget } = portraitSetup();
                publishes();

                await confirm(ctrl);

                expect(userRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ projection: 'email' }));
                expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
                expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(BUYER_EMAIL, PUBLIC_4K);
                expect(budget.alert).not.toHaveBeenCalled();
            }
        );

        it.each([
            ['confirm-payment (card)', confirmCard, 'order-2'],
            ['confirm (Stellar)', confirmStellar, 'order-1'],
        ])(
            '%s: no account email: the "published but not emailed" alert with the order id only',
            async (_route, confirm, orderId) => {
                const { ctrl, catService, budget } = portraitSetup(portraitImage(), { _id: USER });
                publishes();

                const res = await confirm(ctrl);

                expect(res.success).toBe(true);
                expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
                expect(budget.alert).toHaveBeenCalledTimes(1);
                const [subject, text] = budget.alert.mock.calls[0];
                expect(subject).toBe(`Paid portrait published but not emailed (order ${orderId})`);
                expect(`${subject} ${text}`).not.toMatch(/@|https?:\/\/|s3private/);
                // The cat is still made.
                expect(catService.createBlessingWithCat).toHaveBeenCalledWith(USER, PUBLIC_4K);
            }
        );

        it('SendGrid refuses it: the same alert; the purchase still succeeds', async () => {
            const { ctrl, budget } = portraitSetup();
            publishes();
            sendOrderConfirmationEmail.mockResolvedValue(false);

            const res = await confirmCard(ctrl);

            expect(res.success).toBe(true);
            expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
            expect(budget.alert).toHaveBeenCalledTimes(1);
        });

        it('a failed publish or a GET retry that published first: no email here (the retry sends the one email)', async () => {
            const failed = portraitSetup();
            publishPaidPortrait.mockRejectedValue(new Error('spaces down'));
            await confirmCard(failed.ctrl);

            const lost = portraitSetup();
            publishes(PUBLIC_4K, false);
            await confirmStellar(lost.ctrl);

            expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
            expect(failed.budget.alert).not.toHaveBeenCalled();
            expect(lost.budget.alert).not.toHaveBeenCalled();
        });
    });
});
