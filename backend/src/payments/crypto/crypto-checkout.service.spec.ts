import { ConflictException, HttpException } from '@nestjs/common';
import * as nodeCrypto from 'crypto';
import { Types } from 'mongoose';
import { duplicateKey, memoryModel } from 'src/impact/memory-model.fakes-spec';
import { shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { OrderStatus, PackType } from 'src/web3/order.schema';
import { ChainType } from 'src/web3/web3.model';
import { CryptoCheckoutService } from './crypto-checkout.service';
import { erc20PayInterface, ReceiptLog, tip20MemoInterface } from './crypto-evm';
import { CryptoPayConfig, readCryptoPayConfig } from './crypto-pay.config';

jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));

/*
 * Crypto checkout (stage crypto-pay 1): server-priced orders with every accepted option, on-chain
 * verification against the receipt, exactly-once grants keyed on the transaction hash, expiry, and the
 * shelter share of a shelter cat in both custody modes.
 */

const USER = new Types.ObjectId().toString();
const OTHER_USER = new Types.ObjectId().toString();
const USDC = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const EURC = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const TREASURY = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const SPLIT = '0x1111111111111111111111111111111111111111';
const BUYER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const PINK_PAW = '67b48fafd6c26c6cd40bfec6';
const CAT_ID = '68a1f0c2a1b2c3d4e5f60719';
const T0 = new Date('2026-10-04T12:00:00Z');
const TX = (n: number) => '0x' + n.toString(16).padStart(64, '0');

const ENV = {
    NODE_ENV: 'development',
    CRYPTO_PAY_ENABLED: 'true',
    CRYPTO_PAY_LOCAL_USDC: USDC,
    CRYPTO_PAY_LOCAL_EURC: EURC,
    CRYPTO_PAY_RPC_31337: 'http://127.0.0.1:8545',
    CRYPTO_PAY_TREASURY_31337: TREASURY,
};

const config = (extra: Record<string, string> = {}): CryptoPayConfig => readCryptoPayConfig({ ...ENV, ...extra }, T0);

function transferLog(token: string, to: string, value: bigint | string, from = BUYER): ReceiptLog {
    const { topics, data } = erc20PayInterface.encodeEventLog('Transfer', [from, to, BigInt(value)]);
    return { address: token, topics, data };
}

function setup({
    catCheck = {
        ok: true,
        cat: { catId: CAT_ID, name: 'Mochi', shelter: { _id: PINK_PAW, name: 'Rožinė pėdutė', slug: 'rozine-pedute' } },
    } as any,
    grant = { success: true, message: 'Congratz on your new cat!', cat: { _id: 'granted-cat' } } as any,
    givingVerified = true,
} = {}) {
    const checkoutModel: any = memoryModel();
    checkoutModel.indexes = [{ name: 'amount_reserved', unique: true, key: { amountKeys: 1 } }];
    checkoutModel.init = jest.fn(async () => undefined);
    checkoutModel.listIndexes = jest.fn(async () => checkoutModel.indexes);
    // The `amount_reserved` index: unique amount keys among reserved orders.
    const insert = checkoutModel.create;
    checkoutModel.create = jest.fn(async (doc: any) => {
        const taken = new Set(
            checkoutModel.rows.filter((r: any) => r.reserved === true).flatMap((r: any) => r.amountKeys || [])
        );
        if (doc.reserved && (doc.amountKeys || []).some((k: string) => taken.has(k))) throw duplicateKey();
        return insert(doc);
    });
    const orders: any[] = [];
    const orderRepository = {
        create: jest.fn(async (doc: any) => {
            if (orders.some(o => o.hash === doc.hash))
                throw new ConflictException('This payment has already been used for an order');
            const row = { _id: new Types.ObjectId(), ...doc };
            orders.push(row);
            return row;
        }),
        findOne: jest.fn(
            async ({ searchObject }: any) =>
                orders.find(o =>
                    searchObject._id ? String(o._id) === String(searchObject._id) : o.hash === searchObject.hash
                ) || null
        ),
        update: jest.fn(async (id: any, update: any) => {
            const row = orders.find(o => String(o._id) === String(id));
            if (row) Object.assign(row, update.$set || update);
        }),
    };
    const userRepository = { update: jest.fn(), findOne: jest.fn() };
    const stripePayments = {
        resolveDiscount: jest.fn(async (code?: string) =>
            code === 'friend' ? { code, percentage: 20 } : { percentage: 0 }
        ),
    };
    const grants = {
        grantPack: jest.fn(async () => grant),
        grantShelterCat: jest.fn(async () => grant),
        markGrantFailed: jest.fn(),
        refundOrder: jest.fn(async () => 'due'),
        creditAffiliate: jest.fn(),
    };
    const catSale = { check: jest.fn(async () => catCheck) };
    const chain = { receipt: null as any, head: 100, blockTime: Math.floor(T0.getTime() / 1000) + 60 };
    const reader = {
        receipt: jest.fn(async () => chain.receipt),
        blockNumber: jest.fn(async () => chain.head),
        blockTime: jest.fn(async () => chain.blockTime),
    };
    const claims = { publicGivingVerified: jest.fn(async () => givingVerified) };
    const service = new CryptoCheckoutService(
        checkoutModel,
        orderRepository as any,
        userRepository as any,
        stripePayments as any,
        grants as any,
        catSale as any,
        reader as any,
        claims as any
    );
    const pay = (logs: ReceiptLog[], status = 1, blockNumber = 100) => {
        chain.receipt = { status, blockNumber, from: BUYER.toLowerCase(), to: null, logs };
    };
    return {
        service,
        checkoutModel,
        orders,
        orderRepository,
        userRepository,
        grants,
        catSale,
        chain,
        reader,
        claims,
        pay,
    };
}

const codeOf = async (promise: Promise<unknown>): Promise<Record<string, any>> => {
    const error = (await promise.catch(e => e)) as HttpException;
    expect(error).toBeInstanceOf(HttpException);
    return { status: error.getStatus(), ...(error.getResponse() as Record<string, any>) };
};

afterEach(() => jest.restoreAllMocks());

describe('POST /payments/crypto/orders', () => {
    it('is 503 CRYPTO_PAY_DISABLED while the checkout is off', async () => {
        const { service } = setup();
        const res = await codeOf(
            service.createOrder(
                USER,
                { sku: { kind: 'PACK', packType: 'STARTER' } },
                T0,
                config({ CRYPTO_PAY_ENABLED: 'false' })
            )
        );
        expect(res).toEqual(expect.objectContaining({ status: 503, code: 'CRYPTO_PAY_DISABLED' }));
    });

    it('prices a pack from the server table less a verified code, with a unique reserved amount per token', async () => {
        jest.spyOn(nodeCrypto, 'randomInt').mockReturnValue(137 as any);
        const { service, checkoutModel } = setup();
        const order = await service.createOrder(
            USER,
            { sku: { kind: 'PACK', packType: 'INFLUENCER' }, discount: 'friend' },
            T0,
            config()
        );

        expect(order.priceUsdCents).toBe(2000);
        expect(order.discount).toEqual({ code: 'friend', percentage: 20 });
        expect(order.status).toBe('OPEN');
        expect(order.orderId).toMatch(/^co_[0-9a-f]{16}$/);
        expect(new Date(order.expiresAt).getTime() - T0.getTime()).toBe(30 * 60000);
        const local = order.accepted.filter(o => o.chainId === 31337);
        expect(local.map(o => [o.token, o.amount, o.route, o.binding, o.recipient])).toEqual([
            ['USDC', '20000137', 'transfer', 'amount', TREASURY],
            ['EURC', '20000137', 'transfer', 'amount', TREASURY],
        ]);
        expect(local[0].amountDisplay).toBe('20.000137');
        expect(local[0].steps).toHaveLength(1);
        const row = checkoutModel.rows[0];
        expect(row.reserved).toBe(true);
        expect(row.amountKeys).toEqual([
            `31337:${USDC.toLowerCase()}:20000137`,
            `31337:${EURC.toLowerCase()}:20000137`,
        ]);
        // The public view never carries the user or the reservation keys.
        expect(JSON.stringify(order)).not.toContain(USER);
        expect(order).not.toHaveProperty('amountKeys');
    });

    it('prices a shelter cat at $5 with no discount, basic tier, and quotes the shelter share', async () => {
        const { service, catSale } = setup();
        const order = await service.createOrder(
            USER,
            { sku: { kind: 'CAT', catId: CAT_ID }, discount: 'friend' },
            T0,
            config({ CRYPTO_PAY_CAT_SHELTER_BPS: '5000' })
        );
        expect(catSale.check).toHaveBeenCalledWith(CAT_ID, USER);
        expect(order.priceUsdCents).toBe(500);
        expect(order.discount).toBeNull();
        expect(order.sku).toEqual(expect.objectContaining({ kind: 'CAT', catId: CAT_ID, tier: 'COMMON' }));
        expect(order.shelterShare).toEqual({ route: 'treasury', bps: 5000, evidenceTier: 'pledged', state: 'quoted' });
    });

    it('prices a shelter cat at exactly $5, whatever SHELTER_CAT_PRICE_CENTS says (no override)', async () => {
        process.env.SHELTER_CAT_PRICE_CENTS = '100';
        try {
            const { service } = setup();
            const order = await service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, config());
            expect(order.priceUsdCents).toBe(500);
        } finally {
            delete process.env.SHELTER_CAT_PRICE_CENTS;
        }
    });

    it.each([
        [{ ok: false, reason: 'NOT_FOR_SALE' }, 404, 'CRYPTO_PAY_NOT_FOR_SALE'],
        [{ ok: false, reason: 'ALREADY_OWNED' }, 409, 'CRYPTO_PAY_ALREADY_OWNED'],
        [{ ok: false, reason: 'BAD_ID' }, 400, 'CRYPTO_PAY_BAD_SKU'],
    ])('refuses a cat that is not for sale (%j)', async (catCheck, status, code) => {
        const { service, checkoutModel } = setup({ catCheck });
        const res = await codeOf(service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, config()));
        expect(res).toEqual(expect.objectContaining({ status, code }));
        expect(checkoutModel.rows).toHaveLength(0);
    });

    it('refuses an unknown SKU', async () => {
        const { service } = setup();
        for (const sku of [{ kind: 'PACK', packType: 'MEGA' }, { kind: 'PORTRAIT' }, null]) {
            const res = await codeOf(service.createOrder(USER, { sku } as any, T0, config()));
            expect(res.code).toBe('CRYPTO_PAY_BAD_SKU');
        }
    });

    it('picks another tag when an amount is reserved by an open order, and answers BUSY when every try collides', async () => {
        const spy = jest.spyOn(nodeCrypto, 'randomInt').mockReturnValue(5 as any);
        const { service } = setup();
        await service.createOrder(USER, { sku: { kind: 'LOOT_BOX' } }, T0, config());
        spy.mockReturnValueOnce(5 as any).mockReturnValueOnce(6 as any);
        const second = await service.createOrder(OTHER_USER, { sku: { kind: 'LOOT_BOX' } }, T0, config());
        expect(second.accepted.find(o => o.token === 'USDC')!.amount).toBe('1000006');
        spy.mockReturnValue(5 as any);
        const third = new Types.ObjectId().toString();
        const res = await codeOf(service.createOrder(third, { sku: { kind: 'LOOT_BOX' } }, T0, config()));
        expect(res).toEqual(expect.objectContaining({ status: 503, code: 'CRYPTO_PAY_BUSY' }));
    });

    it('hands the open order back when the same buyer asks for the same item again', async () => {
        const { service, checkoutModel } = setup();
        const first = await service.createOrder(USER, { sku: { kind: 'PACK', packType: 'STARTER' } }, T0, config());
        const again = await service.createOrder(
            USER,
            { sku: { kind: 'PACK', packType: 'STARTER' } },
            new Date(T0.getTime() + 60000),
            config()
        );
        expect(again.orderId).toBe(first.orderId);
        expect(checkoutModel.rows).toHaveLength(1);
        // About to close: the same order, renewed, so the buyer has time to pay.
        const t28 = new Date(T0.getTime() + 28 * 60000);
        const renewed = await service.createOrder(USER, { sku: { kind: 'PACK', packType: 'STARTER' } }, t28, config());
        expect(renewed.orderId).toBe(first.orderId);
        expect(renewed.accepted).toEqual(first.accepted);
        expect(new Date(renewed.expiresAt).getTime()).toBe(t28.getTime() + 30 * 60000);
        // Another discount code: a new order.
        const coded = await service.createOrder(
            USER,
            { sku: { kind: 'PACK', packType: 'STARTER' }, discount: 'friend' },
            T0,
            config()
        );
        expect(coded.orderId).not.toBe(first.orderId);
        expect(checkoutModel.rows).toHaveLength(2);
    });

    it('caps open orders per buyer, so one account cannot hold the unique amounts of a price', async () => {
        const { service } = setup();
        await service.createOrder(USER, { sku: { kind: 'PACK', packType: 'STARTER' } }, T0, config());
        await service.createOrder(USER, { sku: { kind: 'PACK', packType: 'INFLUENCER' } }, T0, config());
        await service.createOrder(USER, { sku: { kind: 'LOOT_BOX' } }, T0, config());
        const res = await codeOf(
            service.createOrder(USER, { sku: { kind: 'PACK', packType: 'LEGENDARY' } }, T0, config())
        );
        expect(res).toEqual(expect.objectContaining({ status: 429, code: 'CRYPTO_PAY_TOO_MANY_ORDERS' }));
        // Once they close, the buyer can order again.
        const later = new Date(T0.getTime() + 31 * 60000);
        await expect(
            service.createOrder(USER, { sku: { kind: 'PACK', packType: 'LEGENDARY' } }, later, config())
        ).resolves.toEqual(expect.objectContaining({ status: 'OPEN' }));
    });

    it('frees the amount of an order nobody confirmed 2 hours after expiry, and of a confirmed one after 24 hours', async () => {
        jest.spyOn(nodeCrypto, 'randomInt').mockReturnValue(9 as any);
        const { service, checkoutModel } = setup();
        const untouched = await service.createOrder(USER, { sku: { kind: 'LOOT_BOX' } }, T0, config());
        const touched = await service
            .createOrder(OTHER_USER, { sku: { kind: 'LOOT_BOX' } }, T0, config())
            .catch(e => e);
        // Both picked tag 9: the second collides every time.
        expect(touched).toBeInstanceOf(HttpException);

        const row = (id: string) => checkoutModel.rows.find((r: any) => r.orderId === id);
        await service.releaseReservations(new Date(T0.getTime() + 30 * 60000 + 2 * 3600000 + 1000));
        expect(row(untouched.orderId).reserved).toBe(false);

        const third = new Types.ObjectId().toString();
        const t1 = new Date(T0.getTime() + 3 * 3600000);
        const held = await service.createOrder(third, { sku: { kind: 'LOOT_BOX' } }, t1, config());
        expect(held.accepted[0].amount).toBe('1000009');
        // Someone says they paid: the amount stays reserved for 24 hours after expiry.
        await service.confirm(third, held.orderId, { chainId: 31337, txHash: TX(90) }, t1, config());
        await service.releaseReservations(new Date(t1.getTime() + 30 * 60000 + 3 * 3600000));
        expect(row(held.orderId).reserved).toBe(true);
        await service.releaseReservations(new Date(t1.getTime() + 30 * 60000 + 24 * 3600000 + 1000));
        expect(row(held.orderId).reserved).toBe(false);
    });

    it('refuses orders while the unique amount_reserved index is missing', async () => {
        const { service, checkoutModel } = setup();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        checkoutModel.indexes = [{ name: 'order_id_unique', unique: true, key: { orderId: 1 } }];
        const res = await codeOf(service.createOrder(USER, { sku: { kind: 'LOOT_BOX' } }, T0, config()));
        expect(res).toEqual(expect.objectContaining({ status: 503, code: 'CRYPTO_PAY_DISABLED' }));
        expect(checkoutModel.rows).toHaveLength(0);
        // Looked for again a minute later.
        checkoutModel.indexes = [{ name: 'amount_reserved', unique: true, key: { amountKeys: 1 } }];
        await expect(
            service.createOrder(USER, { sku: { kind: 'LOOT_BOX' } }, new Date(T0.getTime() + 61000), config())
        ).resolves.toEqual(expect.objectContaining({ status: 'OPEN' }));
    });

    it('offers the split route for a shelter cat only after the handover', async () => {
        const splits = { CRYPTO_PAY_CAT_SPLITS: `31337:USDC:${SPLIT}` };
        const before = await setup().service.createOrder(
            USER,
            { sku: { kind: 'CAT', catId: CAT_ID } },
            T0,
            config(splits)
        );
        expect(before.accepted.some(o => o.route === 'split')).toBe(false);

        const after = await setup().service.createOrder(
            USER,
            { sku: { kind: 'CAT', catId: CAT_ID } },
            T0,
            config({ ...splits, SHELTER_HANDED_OVER: 'true' })
        );
        const split = after.accepted.find(o => o.route === 'split')!;
        expect(split).toEqual(
            expect.objectContaining({
                token: 'USDC',
                recipient: SPLIT,
                binding: 'memo',
                amount: '5000000',
                memo: `tt:cat:${after.orderId.slice(3)}`,
            })
        );
        expect(split.steps.map(s => s.kind)).toEqual(['approve', 'disburse']);
        // EURC has no split here: it still pays the treasury.
        expect(after.accepted.find(o => o.token === 'EURC')!.route).toBe('transfer');
        expect(after.shelterShare!.route).toBe('split');

        // Packs never use the split.
        const pack = await setup().service.createOrder(
            USER,
            { sku: { kind: 'PACK', packType: 'STARTER' } },
            T0,
            config({ ...splits, SHELTER_HANDED_OVER: 'true' })
        );
        expect(pack.accepted.some(o => o.route === 'split')).toBe(false);
    });

    it('on a mainnet, offers the split route only when the on-chain giving check passes', async () => {
        // The split's chain resolves through the SHELTER_* config, read from process.env. Some imports
        // load the developer's .env (ai.utils dotenv), so pin the main shelter chain to Arc mainnet.
        const savedChain = process.env.SHELTER_CHAIN_ID;
        process.env.SHELTER_CHAIN_ID = '5042';
        try {
            const base = config({ CRYPTO_PAY_CAT_SPLITS: `31337:USDC:${SPLIT}`, SHELTER_HANDED_OVER: 'true' });
            const local = base.chains.find(c => c.chain.chainId === 31337)!;
            const mainnet: CryptoPayConfig = {
                ...base,
                network: 'mainnet',
                chains: [{ ...local, chain: { ...local.chain, chainId: 5042, testnet: false } }],
                splits: [{ chainId: 5042, token: 'USDC', address: SPLIT }],
            };
            const refused = setup({ givingVerified: false });
            const a = await refused.service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, mainnet);
            expect(refused.claims.publicGivingVerified).toHaveBeenCalled();
            expect(a.accepted.some(o => o.route === 'split')).toBe(false);
            const verified = await setup({ givingVerified: true }).service.createOrder(
                USER,
                { sku: { kind: 'CAT', catId: CAT_ID } },
                T0,
                mainnet
            );
            expect(verified.accepted.some(o => o.route === 'split')).toBe(true);
        } finally {
            if (savedChain === undefined) delete process.env.SHELTER_CHAIN_ID;
            else process.env.SHELTER_CHAIN_ID = savedChain;
        }
    });
});

describe('GET /payments/crypto/orders/:orderId', () => {
    it('shows an order to its buyer only, and EXPIRED once past expiresAt', async () => {
        const { service } = setup();
        const order = await service.createOrder(USER, { sku: { kind: 'LOOT_BOX' } }, T0, config());
        expect((await service.getOrder(USER, order.orderId, T0)).status).toBe('OPEN');
        expect((await service.getOrder(USER, order.orderId, new Date(T0.getTime() + 31 * 60000))).status).toBe(
            'EXPIRED'
        );
        expect((await codeOf(service.getOrder(OTHER_USER, order.orderId, T0))).code).toBe('CRYPTO_PAY_NOT_FOUND');
        expect((await codeOf(service.getOrder(USER, 'co_nothex', T0))).code).toBe('CRYPTO_PAY_NOT_FOUND');
    });
});

describe('POST /payments/crypto/orders/:orderId/confirm', () => {
    async function openPack(ctx = setup(), cfg = config()) {
        jest.spyOn(nodeCrypto, 'randomInt').mockReturnValue(137 as any);
        const order = await ctx.service.createOrder(
            USER,
            { sku: { kind: 'PACK', packType: 'STARTER' }, discount: 'friend' },
            T0,
            cfg
        );
        return { ...ctx, order, usdc: order.accepted.find(o => o.token === 'USDC')! };
    }

    it('verifies the exact transfer, creates one EVM order and grants the pack once', async () => {
        const { service, order, usdc, pay, orders, grants, userRepository } = await openPack();
        pay([transferLog(USDC, TREASURY, usdc.amount)]);

        const res = await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(1) }, T0, config());
        expect(res.httpStatus).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ status: 'COMPLETE', success: true }));
        expect(orders).toHaveLength(1);
        expect(orders[0]).toEqual(
            expect.objectContaining({
                hash: `evm:31337:${TX(1)}`,
                chainType: ChainType.EVM,
                chainId: 31337,
                checkoutId: order.orderId,
                currencyType: CurrencyType.USDC,
                walletAddress: BUYER.toLowerCase(),
                entityType: EntityType.PACK,
                id: PackType.STARTER,
                price: 4.000137,
                priceUsd: 4,
                status: OrderStatus.PENDING,
                discount: 'friend',
            })
        );
        expect(grants.grantPack).toHaveBeenCalledTimes(1);
        expect(grants.grantPack).toHaveBeenCalledWith(
            expect.objectContaining({ packType: PackType.STARTER, amountUsd: 4 })
        );
        expect(grants.creditAffiliate).toHaveBeenCalledWith('friend', 4);
        expect(userRepository.update).toHaveBeenCalledWith(expect.anything(), {
            $inc: { spent: 4, monthSpent: 4, spentUsd: 4 },
        });

        // A replay of the same transaction grants nothing.
        const again = await service.confirm(
            USER,
            order.orderId,
            { chainId: 31337, txHash: TX(1).toUpperCase().replace('0X', '0x') },
            T0,
            config()
        );
        expect(again.body).toEqual(expect.objectContaining({ status: 'COMPLETE', success: true, replay: true }));
        expect(grants.grantPack).toHaveBeenCalledTimes(1);
        expect((await service.getOrder(USER, order.orderId, T0)).payment).toEqual(
            expect.objectContaining({ txHash: TX(1), token: 'USDC', amount: usdc.amount })
        );
    });

    it('accepts EURC at its own amount', async () => {
        const { service, order, pay, orders } = await openPack();
        const eurc = order.accepted.find(o => o.token === 'EURC')!;
        pay([transferLog(EURC, TREASURY, eurc.amount)]);
        const res = await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(2) }, T0, config());
        expect(res.body.status).toBe('COMPLETE');
        expect(orders[0].currencyType).toBe(CurrencyType.EURC);
        expect(orders[0].priceUsd).toBe(4);
    });

    it('answers 202 CONFIRMING while the transaction is not mined or not deep enough', async () => {
        const ctx = setup();
        const cfg = config();
        cfg.chains = cfg.chains.map(c =>
            c.chain.chainId === 31337 ? { ...c, chain: { ...c.chain, confirmations: 3 } } : c
        );
        const { service, order, usdc, pay, chain, grants } = await openPack(ctx, cfg);
        const pending = await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(3) }, T0, cfg);
        expect(pending).toEqual({
            httpStatus: 202,
            body: { orderId: order.orderId, status: 'CONFIRMING', confirmations: 0, required: 3 },
        });
        pay([transferLog(USDC, TREASURY, usdc.amount)], 1, 99);
        chain.head = 100;
        expect((await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(3) }, T0, cfg)).body).toEqual(
            expect.objectContaining({ status: 'CONFIRMING', confirmations: 2 })
        );
        chain.head = 101;
        expect(
            (await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(3) }, T0, cfg)).body.status
        ).toBe('COMPLETE');
        expect(grants.grantPack).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a malformed hash', { chainId: 31337, txHash: '0x1234' }, 400, 'CRYPTO_PAY_BAD_TX'],
        ['a chain the order does not take', { chainId: 8453, txHash: TX(4) }, 400, 'CRYPTO_PAY_WRONG_CHAIN'],
    ])('refuses %s', async (_label, body, status, code) => {
        const { service, order } = await openPack();
        expect(await codeOf(service.confirm(USER, order.orderId, body, T0, config()))).toEqual(
            expect.objectContaining({ status, code })
        );
    });

    it('refuses a reverted transaction, a wrong amount, a wrong token, and a payment older than the order', async () => {
        const ctx = await openPack();
        const { service, order, usdc, pay, chain, grants, orders } = ctx;
        const confirm = () =>
            codeOf(service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(5) }, T0, config()));

        pay([transferLog(USDC, TREASURY, usdc.amount)], 0);
        expect((await confirm()).code).toBe('CRYPTO_PAY_TX_FAILED');
        pay([transferLog(USDC, TREASURY, BigInt(usdc.amount) - BigInt(137))]);
        expect((await confirm()).code).toBe('CRYPTO_PAY_UNDERPAID');
        pay([transferLog(USDC, TREASURY, BigInt(usdc.amount) + BigInt(1))]);
        expect((await confirm()).code).toBe('CRYPTO_PAY_NO_MATCHING_TRANSFER');
        pay([transferLog(SPLIT, TREASURY, usdc.amount)]);
        expect((await confirm()).code).toBe('CRYPTO_PAY_NO_MATCHING_TRANSFER');
        pay([transferLog(USDC, TREASURY, usdc.amount)]);
        chain.blockTime = Math.floor(T0.getTime() / 1000) - 3 * 60;
        expect((await confirm()).code).toBe('CRYPTO_PAY_TX_BEFORE_ORDER');
        expect(grants.grantPack).not.toHaveBeenCalled();
        expect(orders).toHaveLength(0);
    });

    it('refuses a transaction that already backs another order (409 CRYPTO_PAY_TX_USED)', async () => {
        const ctx = setup();
        const first = await openPack(ctx);
        ctx.pay([transferLog(USDC, TREASURY, first.usdc.amount)]);
        await ctx.service.confirm(USER, first.order.orderId, { chainId: 31337, txHash: TX(6) }, T0, config());

        jest.restoreAllMocks();
        jest.spyOn(nodeCrypto, 'randomInt').mockReturnValue(200 as any);
        const second = await ctx.service.createOrder(
            USER,
            { sku: { kind: 'PACK', packType: 'STARTER' } },
            T0,
            config()
        );
        // Same transaction, with logs that would also match the second order's amount.
        ctx.pay([
            transferLog(USDC, TREASURY, first.usdc.amount),
            transferLog(USDC, TREASURY, second.accepted[0].amount),
        ]);
        const res = await codeOf(
            ctx.service.confirm(USER, second.orderId, { chainId: 31337, txHash: TX(6) }, T0, config())
        );
        expect(res).toEqual(expect.objectContaining({ status: 409, code: 'CRYPTO_PAY_TX_USED' }));
        expect(ctx.grants.grantPack).toHaveBeenCalledTimes(1);
    });

    it('never grants a payment mined after the order and its grace closed: 410 with a refund due', async () => {
        const { service, order, usdc, pay, chain, grants, orders } = await openPack();
        pay([transferLog(USDC, TREASURY, usdc.amount)]);
        chain.blockTime = Math.floor(T0.getTime() / 1000) + 30 * 60 + 2 * 3600 + 60;
        const res = await codeOf(
            service.confirm(
                USER,
                order.orderId,
                { chainId: 31337, txHash: TX(7) },
                new Date(T0.getTime() + 3 * 3600000),
                config()
            )
        );
        expect(res).toEqual(expect.objectContaining({ status: 410, code: 'CRYPTO_PAY_EXPIRED', refund: 'due' }));
        expect(grants.grantPack).not.toHaveBeenCalled();
        expect(grants.markGrantFailed).toHaveBeenCalledWith(orders[0]._id, 'PAID_AFTER_EXPIRY', expect.any(String));
        expect(grants.refundOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'PAID_AFTER_EXPIRY', 4, {
            takeBackSpend: false,
        });
        expect((await service.getOrder(USER, order.orderId, T0)).status).toBe('LATE');
    });

    it('grants a payment mined in the grace after expiry (a buyer who signed at 0:01)', async () => {
        const { service, order, usdc, pay, chain, grants } = await openPack();
        pay([transferLog(USDC, TREASURY, usdc.amount)]);
        chain.blockTime = Math.floor(T0.getTime() / 1000) + 31 * 60;
        const res = await service.confirm(
            USER,
            order.orderId,
            { chainId: 31337, txHash: TX(70) },
            new Date(T0.getTime() + 40 * 60000),
            config()
        );
        expect(res.body).toEqual(expect.objectContaining({ status: 'COMPLETE', success: true }));
        expect(grants.grantPack).toHaveBeenCalledTimes(1);
        expect(grants.refundOrder).not.toHaveBeenCalled();
    });

    it('a LATE order still takes a payment that was mined in time', async () => {
        const { service, order, usdc, pay, chain, grants } = await openPack();
        const later = new Date(T0.getTime() + 4 * 3600000);
        // First the late one (mined after the grace), then the in-time one confirmed afterwards.
        pay([transferLog(USDC, TREASURY, usdc.amount)]);
        chain.blockTime = Math.floor(T0.getTime() / 1000) + 3 * 3600;
        await codeOf(service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(71) }, later, config()));
        expect((await service.getOrder(USER, order.orderId, later)).status).toBe('LATE');
        chain.blockTime = Math.floor(T0.getTime() / 1000) + 10 * 60;
        const res = await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(72) }, later, config());
        expect(res.body).toEqual(expect.objectContaining({ status: 'COMPLETE', success: true }));
        expect(grants.grantPack).toHaveBeenCalledTimes(1);
        expect(grants.refundOrder).toHaveBeenCalledTimes(1);
        expect(grants.refundOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'PAID_AFTER_EXPIRY', 4, {
            takeBackSpend: false,
        });
    });

    it("never lets another buyer claim a memo-route payment (Tempo): the plain Transfer of the same amount doesn't count", async () => {
        const ctx = setup();
        const cfg = config();
        cfg.chains = cfg.chains.map(c => ({ ...c, chain: { ...c.chain, tip20Memo: true } }));
        const victim = await ctx.service.createOrder(USER, { sku: { kind: 'PACK', packType: 'STARTER' } }, T0, cfg);
        const attacker = await ctx.service.createOrder(
            OTHER_USER,
            { sku: { kind: 'PACK', packType: 'STARTER' } },
            T0,
            cfg
        );
        const v = victim.accepted.find(o => o.token === 'USDC')!;
        const a = attacker.accepted.find(o => o.token === 'USDC')!;
        expect(v.route).toBe('transferWithMemo');
        expect(a.amount).toBe(v.amount);
        const memo = tip20MemoInterface.encodeEventLog('TransferWithMemo', [BUYER, TREASURY, BigInt(v.amount), v.memo]);
        ctx.pay([transferLog(USDC, TREASURY, v.amount), { address: USDC, topics: memo.topics, data: memo.data }]);

        const stolen = await codeOf(
            ctx.service.confirm(OTHER_USER, attacker.orderId, { chainId: 31337, txHash: TX(80) }, T0, cfg)
        );
        expect(stolen).toEqual(expect.objectContaining({ status: 400, code: 'CRYPTO_PAY_NO_MATCHING_TRANSFER' }));
        expect(ctx.orders).toHaveLength(0);
        const own = await ctx.service.confirm(USER, victim.orderId, { chainId: 31337, txHash: TX(80) }, T0, cfg);
        expect(own.body).toEqual(expect.objectContaining({ status: 'COMPLETE', success: true }));
    });

    it('still grants a payment mined before expiry but confirmed after it', async () => {
        const { service, order, usdc, pay, chain } = await openPack();
        pay([transferLog(USDC, TREASURY, usdc.amount)]);
        chain.blockTime = Math.floor(T0.getTime() / 1000) + 29 * 60;
        const res = await service.confirm(
            USER,
            order.orderId,
            { chainId: 31337, txHash: TX(8) },
            new Date(T0.getTime() + 3 * 3600000),
            config()
        );
        expect(res.body.status).toBe('COMPLETE');
    });

    it('records a second, different payment for a paid order as a refund (409 CRYPTO_PAY_ALREADY_PAID)', async () => {
        const { service, order, usdc, pay, grants } = await openPack();
        pay([transferLog(USDC, TREASURY, usdc.amount)]);
        await service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(9) }, T0, config());
        const res = await codeOf(
            service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(10) }, T0, config())
        );
        expect(res).toEqual(expect.objectContaining({ status: 409, code: 'CRYPTO_PAY_ALREADY_PAID', refund: 'due' }));
        expect(grants.grantPack).toHaveBeenCalledTimes(1);
        expect(grants.refundOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'DUPLICATE_PAYMENT', 4, {
            takeBackSpend: false,
        });
    });

    it('is 503 CRYPTO_PAY_RPC_UNAVAILABLE when the chain cannot be read', async () => {
        const { service, order, reader } = await openPack();
        reader.receipt.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        expect(
            (await codeOf(service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(11) }, T0, config()))).code
        ).toBe('CRYPTO_PAY_RPC_UNAVAILABLE');
    });
});

describe('shelter cats', () => {
    async function buyCat(ctx: ReturnType<typeof setup>, cfg: CryptoPayConfig) {
        const order = await ctx.service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, cfg);
        return order;
    }

    it('before the handover: pays the treasury, grants a basic copy, and leaves the shelter share due for the keeper', async () => {
        const ctx = setup();
        const cfg = config({ CRYPTO_PAY_CAT_SHELTER_BPS: '5000' });
        const order = await buyCat(ctx, cfg);
        const usdc = order.accepted.find(o => o.token === 'USDC')!;
        ctx.pay([transferLog(USDC, TREASURY, usdc.amount)]);
        const res = await ctx.service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(20) }, T0, cfg);
        expect(res.body).toEqual(expect.objectContaining({ status: 'COMPLETE', success: true }));
        expect(ctx.grants.grantShelterCat).toHaveBeenCalledWith(
            expect.objectContaining({ catId: CAT_ID, amountUsd: 5 })
        );
        expect(ctx.orders[0]).toEqual(expect.objectContaining({ entityType: EntityType.CAT, id: CAT_ID, priceUsd: 5 }));
        const view = await ctx.service.getOrder(USER, order.orderId, T0);
        expect(view.shelterShare).toEqual(
            expect.objectContaining({
                route: 'treasury',
                bps: 5000,
                state: 'due',
                evidenceTier: 'pledged',
                amountUsdCents: 250,
            })
        );
        expect(ctx.checkoutModel.rows[0].shelterShare.memo).toBe(`tt:cat:${order.orderId.slice(3)}`);
    });

    it('without a decided share, records it as undecided and sends nothing', async () => {
        const ctx = setup();
        const cfg = config();
        const order = await buyCat(ctx, cfg);
        ctx.pay([transferLog(USDC, TREASURY, order.accepted[0].amount)]);
        await ctx.service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(21) }, T0, cfg);
        expect((await ctx.service.getOrder(USER, order.orderId, T0)).shelterShare).toEqual(
            expect.objectContaining({ state: 'undecided', bps: null, evidenceTier: null })
        );
    });

    it('a failed grant is FAILED_GRANT with a refund due and no shelter share', async () => {
        const ctx = setup({ grant: { success: false, message: 'User already owns this NFT cat', refund: 'due' } });
        const cfg = config({ CRYPTO_PAY_CAT_SHELTER_BPS: '5000' });
        const order = await buyCat(ctx, cfg);
        ctx.pay([transferLog(USDC, TREASURY, order.accepted[0].amount)]);
        const res = await ctx.service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(22) }, T0, cfg);
        expect(res.body).toEqual(expect.objectContaining({ status: 'FAILED_GRANT', success: false, refund: 'due' }));
        expect((await ctx.service.getOrder(USER, order.orderId, T0)).shelterShare).toEqual(
            expect.objectContaining({ state: 'void' })
        );
    });

    it('after the handover: the buyer pays the split directly and the share is recorded as on-chain, shelter-held', async () => {
        const ctx = setup();
        const cfg = config({
            CRYPTO_PAY_CAT_SPLITS: `31337:USDC:${SPLIT}`,
            SHELTER_HANDED_OVER: 'true',
            CRYPTO_PAY_CAT_SHELTER_BPS: '5000',
        });
        const order = await buyCat(ctx, cfg);
        const split = order.accepted.find(o => o.route === 'split')!;
        const batch = shelterSplitInterface.encodeEventLog('DisbursementBatch', [
            1,
            BUYER,
            BigInt(5000000),
            BigInt(4000000),
            BigInt(1000000),
            1,
            split.memo,
        ]);
        ctx.pay([transferLog(USDC, SPLIT, split.amount), { address: SPLIT, topics: batch.topics, data: batch.data }]);
        const res = await ctx.service.confirm(USER, order.orderId, { chainId: 31337, txHash: TX(23) }, T0, cfg);
        expect(res.body.status).toBe('COMPLETE');
        const view = await ctx.service.getOrder(USER, order.orderId, T0);
        expect(view.payment!.route).toBe('split');
        expect(view.shelterShare).toEqual(
            expect.objectContaining({
                route: 'split',
                state: 'onchain',
                evidenceTier: 'onchain-shelter-held',
                amountUsdCents: 400,
                txHash: TX(23),
            })
        );
    });
});

describe('shelter cats: one paid order per cat, grace re-check, card share', () => {
    it('keeps one order per cat: an open one is handed back, and none while a payment is being granted', async () => {
        const ctx = setup();
        const order = await ctx.service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, config());
        const closing = new Date(T0.getTime() + 28 * 60000);
        const again = await ctx.service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, closing, config());
        expect(again.orderId).toBe(order.orderId);
        ctx.checkoutModel.rows[0].status = 'PAID';
        expect(
            await codeOf(ctx.service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, config()))
        ).toEqual(expect.objectContaining({ status: 409, code: 'CRYPTO_PAY_ALREADY_OWNED' }));
        // Another buyer is not affected.
        await expect(
            ctx.service.createOrder(OTHER_USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, config())
        ).resolves.toEqual(expect.objectContaining({ status: 'OPEN' }));
        expect(order.orderId).toMatch(/^co_/);
    });

    it('checks a cat paid in the grace after expiry for sale again, and refunds it when it is gone', async () => {
        const ctx = setup();
        const order = await ctx.service.createOrder(USER, { sku: { kind: 'CAT', catId: CAT_ID } }, T0, config());
        ctx.catSale.check.mockResolvedValueOnce({ ok: false, reason: 'NOT_FOR_SALE' } as any);
        ctx.pay([transferLog(USDC, TREASURY, order.accepted[0].amount)]);
        ctx.chain.blockTime = Math.floor(T0.getTime() / 1000) + 35 * 60;
        const res = await ctx.service.confirm(
            USER,
            order.orderId,
            { chainId: 31337, txHash: TX(30) },
            new Date(T0.getTime() + 40 * 60000),
            config()
        );
        expect(res.body).toEqual(expect.objectContaining({ status: 'FAILED_GRANT', success: false, refund: 'due' }));
        expect(ctx.grants.grantShelterCat).not.toHaveBeenCalled();
        expect(ctx.grants.markGrantFailed).toHaveBeenCalledWith(expect.anything(), 'NOT_FOR_SALE', expect.any(String));
        expect(ctx.grants.refundOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'NOT_FOR_SALE', 5);
    });

    it('records the same shelter share for a card-paid cat as for a crypto one, once per payment', async () => {
        const ctx = setup();
        const cfg = config({ CRYPTO_PAY_CAT_SHELTER_BPS: '5000' });
        const input = {
            userId: USER,
            intentId: 'pi_123',
            catId: CAT_ID,
            grantedCatId: 'granted-cat',
            name: 'Mochi',
            shelter: { _id: PINK_PAW, name: 'Rožinė pėdutė', slug: 'rozine-pedute' },
            priceUsdCents: 500,
        };
        const share = await ctx.service.recordCardShelterShare(input, T0, cfg);
        expect(share).toEqual(
            expect.objectContaining({ route: 'treasury', state: 'due', bps: 5000, amountUsdCents: 250 })
        );
        const row = ctx.checkoutModel.rows[0];
        expect(row).toEqual(expect.objectContaining({ rail: 'card', cardIntent: 'pi_123', status: 'COMPLETE' }));
        expect(row.shelterShare.memo).toBe(`tt:cat:${row.orderId.slice(3)}`);
        // Card rows never show up as crypto orders.
        expect(await codeOf(ctx.service.getOrder(USER, row.orderId, T0))).toEqual(
            expect.objectContaining({ code: 'CRYPTO_PAY_NOT_FOUND' })
        );
        // Another shelter: no share.
        expect(
            await ctx.service.recordCardShelterShare(
                { ...input, intentId: 'pi_456', shelter: { _id: '0'.repeat(24), name: 'x', slug: 'x' } },
                T0,
                cfg
            )
        ).toBeNull();
    });
});

describe('stuck grants', () => {
    async function paidButCrashed(packGrant: () => Promise<unknown>) {
        const ctx = setup();
        jest.spyOn(nodeCrypto, 'randomInt').mockReturnValue(137 as any);
        const order = await ctx.service.createOrder(USER, { sku: { kind: 'PACK', packType: 'STARTER' } }, T0, config());
        ctx.pay([transferLog(USDC, TREASURY, order.accepted[0].amount)]);
        ctx.grants.grantPack.mockImplementationOnce(packGrant as any);
        await ctx.service
            .confirm(USER, order.orderId, { chainId: 31337, txHash: TX(40) }, T0, config())
            .catch(() => undefined);
        return { ...ctx, order };
    }

    it('answers 202 CONFIRMING (never "refund due") while a paid order has no grant result', async () => {
        const ctx = await paidButCrashed(async () => {
            throw new Error('process died');
        });
        const again = await ctx.service.confirm(
            USER,
            ctx.order.orderId,
            { chainId: 31337, txHash: TX(40) },
            T0,
            config()
        );
        expect(again.httpStatus).toBe(202);
        expect(again.body).toEqual(expect.objectContaining({ status: 'CONFIRMING', replay: true }));
    });

    it('the sweep grants a stuck order again once, counting the spend once', async () => {
        const ctx = await paidButCrashed(async () => {
            throw new Error('process died');
        });
        expect(ctx.userRepository.update).toHaveBeenCalledTimes(1);
        // Too early: the first grant may still be running.
        expect(await ctx.service.recoverStuckGrants(new Date(T0.getTime() + 60000), config())).toEqual({
            settled: 0,
            regranted: 0,
        });
        const run = await ctx.service.recoverStuckGrants(new Date(T0.getTime() + 6 * 60000), config());
        expect(run).toEqual({ settled: 0, regranted: 1 });
        expect(ctx.grants.grantPack).toHaveBeenCalledTimes(2);
        expect(ctx.userRepository.update).toHaveBeenCalledTimes(1);
        const view = await ctx.service.getOrder(USER, ctx.order.orderId, T0);
        expect(view.status).toBe('COMPLETE');
        expect(await ctx.service.recoverStuckGrants(new Date(T0.getTime() + 20 * 60000), config())).toEqual({
            settled: 0,
            regranted: 0,
        });
    });

    it('the sweep copies the result of an Order that was already granted or failed', async () => {
        for (const [status, expected] of [
            [OrderStatus.COMPLETE, 'COMPLETE'],
            [OrderStatus.FAILED_GRANT, 'FAILED_GRANT'],
        ]) {
            const ctx = await paidButCrashed(async () => {
                throw new Error('process died');
            });
            ctx.orders[0].status = status;
            if (status === OrderStatus.FAILED_GRANT) ctx.orders[0].refund = { state: 'due' };
            const run = await ctx.service.recoverStuckGrants(new Date(T0.getTime() + 6 * 60000), config());
            expect(run).toEqual({ settled: 1, regranted: 0 });
            expect(ctx.grants.grantPack).toHaveBeenCalledTimes(1);
            const view = await ctx.service.getOrder(USER, ctx.order.orderId, T0);
            expect(view.status).toBe(expected);
            if (expected === 'FAILED_GRANT') expect(view.grant).toEqual(expect.objectContaining({ refund: 'due' }));
        }
    });
});

describe('GET /payments/crypto/config', () => {
    it('lists only chains that can receive, with prices and how EURC is priced', () => {
        const { service } = setup();
        const body = service.publicConfig(
            config({ CRYPTO_PAY_EURC_PER_USD: '0.92', CRYPTO_PAY_EURC_FX_DATE: '2026-10-01' })
        );
        expect(body.enabled).toBe(true);
        expect(body.network).toBe('testnet');
        expect(body.chains.map(c => c.chainId)).toEqual([31337]);
        expect(body.prices).toEqual({
            packs: { STARTER: 5, INFLUENCER: 25, LEGENDARY: 350 },
            shelterCat: 5,
            lootBox: 1,
        });
        expect(body.fx.EURC).toEqual({ perUsd: '0.92', asOf: '2026-10-01', source: 'dated' });
        // No rate set: a fixed euro price, with no made-up date.
        expect(service.publicConfig(config()).fx.EURC).toEqual({ perUsd: '1', asOf: null, source: 'fixed' });
        // A stale rate stops EURC: only USDC is listed.
        const stale = service.publicConfig(
            config({ CRYPTO_PAY_EURC_PER_USD: '0.92', CRYPTO_PAY_EURC_FX_DATE: '2026-08-01' })
        );
        expect(stale.chains[0].tokens.map(t => t.token)).toEqual(['USDC']);
        expect(service.publicConfig(config({ CRYPTO_PAY_ENABLED: 'false' }))).toEqual(
            expect.objectContaining({ enabled: false, chains: [] })
        );
    });
});
