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

    it('takes the sunset from STELLAR_PACKS_SUNSET_AT, else a week after the decision', () => {
        expect(stellarPacksSunset({}).toISOString()).toBe('2026-10-11T00:00:00.000Z');
        expect(stellarPacksSunset({ STELLAR_PACKS_SUNSET_AT: '2026-10-20T12:00:00Z' }).toISOString()).toBe(
            '2026-10-20T12:00:00.000Z'
        );
        expect(stellarPacksSunset({ STELLAR_PACKS_SUNSET_AT: 'soon' }).toISOString()).toBe('2026-10-11T00:00:00.000Z');
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

    it('stores the hash lowercased, so one payment has one order key', async () => {
        const { ctrl, orderRepository } = setup();

        await ctrl.checkTransaction(USER, body({ hash: HASH.toUpperCase() }));
        expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ hash: HASH }));
    });

    it('no longer exposes POST /web3/create', () => {
        expect((Web3Controller.prototype as any).create).toBeUndefined();
    });
});
