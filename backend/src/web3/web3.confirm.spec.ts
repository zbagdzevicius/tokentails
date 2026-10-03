import { BadRequestException, HttpException } from '@nestjs/common';
import { Tier } from 'src/cat/cat.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { PackType } from './order.schema';
import { ChainType } from './web3.model';
import { Web3Controller } from './web3.controller';

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
    const orderRepository = { create: jest.fn().mockResolvedValue({ _id: 'order-1' }), update: jest.fn() };
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

    it('credits spent and the affiliate share from the verified amount, not the client price', async () => {
        const { ctrl, userRepository, web3Service } = setup(5);

        await ctrl.checkTransaction(
            USER,
            body({ entityType: EntityType.PACK, id: PackType.STARTER, price: 1e9, discount: 'Friend' })
        );

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
