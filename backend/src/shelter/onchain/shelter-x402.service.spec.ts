import { HttpException } from '@nestjs/common';
import { getBigInt, JsonRpcProvider } from 'ethers';
import { NATIVE_DISBURSED_TOPIC, ShelterChain, shelterSplitInterface } from './shelter-chain';
import { fakeNonceModel, fakeUsedTxModel, SHELTER_WALLET, SPLIT, withShelterEnv } from './shelter-onchain.fakes-spec';
import { ShelterX402Service, X402_DISABLED, X402_NO_CARDS } from './shelter-x402.service';

// Only receipts are read, from a mocked provider. Interface stays real to build genuine logs.
jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn() };
});

const PRICE = '10000000000000000';
const TX = '0x' + 'd'.repeat(64);
const RESOURCE = 'https://api.example.test/shelter/agent/cat-card';
const NOW = new Date('2026-10-02T12:00:00Z');

const getTransactionReceipt = jest.fn();

function nativeLog(memo: string, amount: string, address = SPLIT, shelter = SHELTER_WALLET) {
    const event = shelterSplitInterface.getEvent('NativeDisbursed')!;
    const { topics, data } = shelterSplitInterface.encodeEventLog(event, [shelter, getBigInt(amount), memo]);
    return { address, topics, data };
}

function receipt(logs: any[], status = 1) {
    return { status, logs };
}

function header(payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
    const body = { x402Version: 1, scheme: 'onchain-receipt', network: 'eip155:5042', payload, ...overrides };
    return Buffer.from(JSON.stringify(body)).toString('base64');
}

function blessingModel(
    rows: any[] = [{ name: 'Mochi', imageUrl: 'https://cdn.test/mochi.png', shelterName: 'Pink Paw (Rožinė pėdutė)' }]
) {
    return {
        exists: jest.fn(async () => (rows.length ? { _id: 'x' } : null)),
        aggregate: jest.fn(async (pipeline: any[]) => rows.slice(0, pipeline.length ? 1 : 0)),
    };
}

function setup(blessings = blessingModel()) {
    const nonces = fakeNonceModel();
    const usedTxs = fakeUsedTxModel();
    const service = new ShelterX402Service(nonces as any, usedTxs as any, blessings as any, new ShelterChain());
    return { service, nonces, usedTxs, blessings };
}

async function httpError(promise: Promise<unknown>): Promise<HttpException> {
    try {
        await promise;
    } catch (error) {
        return error as HttpException;
    }
    throw new Error('expected an HttpException');
}

/** Asks for the card without payment and returns the issued nonce. */
async function challenge(service: ShelterX402Service, now = NOW): Promise<string> {
    const error = await httpError(service.catCard(undefined, RESOURCE, now));
    return (error.getResponse() as any).accepts[0].extra.nonce;
}

beforeEach(() => {
    jest.clearAllMocks();
    (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => ({ getTransactionReceipt }));
    withShelterEnv({ SHELTER_X402_ENABLED: 'true', SHELTER_SPLIT_ADDRESS: SPLIT, SHELTER_X402_PRICE_WEI: PRICE });
});

afterAll(() => withShelterEnv({}));

describe('GET /shelter/agent/cat-card (x402, onchain-receipt)', () => {
    it('answers 503 with a clear message when SHELTER_X402_ENABLED is off (the default)', async () => {
        withShelterEnv({ SHELTER_SPLIT_ADDRESS: SPLIT });
        const { service, nonces } = setup();

        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(503);
        expect(error.message).toBe(X402_DISABLED);
        expect(nonces.create).not.toHaveBeenCalled();
    });

    it('answers 503 when there is no card to sell, before asking for payment', async () => {
        const error = await httpError(setup(blessingModel([])).service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(503);
        expect(error.message).toBe(X402_NO_CARDS);
    });

    it('answers 402 with the x402 payment requirements and a stored, expiring nonce', async () => {
        const { service, nonces } = setup();

        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));

        expect(error.getStatus()).toBe(402);
        const body = error.getResponse() as any;
        const nonce = body.accepts[0].extra.nonce;
        expect(nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(body).toEqual({
            x402Version: 1,
            error: 'payment required',
            accepts: [
                {
                    scheme: 'onchain-receipt',
                    network: 'eip155:5042',
                    maxAmountRequired: PRICE,
                    asset: 'native',
                    payTo: SPLIT,
                    resource: RESOURCE,
                    description: 'One adoptable-cat card; payment goes to shelters via ShelterSplit',
                    mimeType: 'application/json',
                    maxTimeoutSeconds: 600,
                    extra: { memo: `x402:${nonce}`, nonce },
                },
            ],
        });
        expect(nonces.rows[0]).toMatchObject({ nonce, usedAt: null, expiresAt: new Date('2026-10-02T12:10:00Z') });
    });

    it('returns the card once the receipt shows NativeDisbursed with the memo, summed across shelters', async () => {
        const { service, nonces, usedTxs } = setup();
        const nonce = await challenge(service);
        getTransactionReceipt.mockResolvedValue(
            receipt([nativeLog(`x402:${nonce}`, '6000000000000000'), nativeLog(`x402:${nonce}`, '4000000000000000')])
        );

        const result = await service.catCard(header({ txHash: TX, nonce }), RESOURCE, NOW);

        expect(result).toEqual({
            txHash: TX,
            card: { name: 'Mochi', imageUrl: 'https://cdn.test/mochi.png', shelterName: 'Pink Paw (Rožinė pėdutė)' },
        });
        expect(getTransactionReceipt).toHaveBeenCalledWith(TX);
        expect(usedTxs.rows).toEqual([{ txHash: TX, nonce, amountWei: PRICE }]);
        expect(nonces.rows.find(r => r.nonce === nonce)).toMatchObject({ usedAt: NOW, txHash: TX });
    });

    it.each([
        [
            'the amount is below the price',
            (n: string) => receipt([nativeLog(`x402:${n}`, '9999999999999999')]),
            /below/,
        ],
        ['the memo is for another nonce', () => receipt([nativeLog(`x402:${'0'.repeat(32)}`, PRICE)]), /below/],
        [
            'the log is not from the split contract',
            (n: string) => receipt([nativeLog(`x402:${n}`, PRICE, '0x3333333333333333333333333333333333333333')]),
            /below/,
        ],
        [
            'the log is not NativeDisbursed',
            (n: string) => {
                const log = nativeLog(`x402:${n}`, PRICE);
                return receipt([
                    {
                        ...log,
                        topics: [shelterSplitInterface.getEvent('Disbursed')!.topicHash, ...log.topics.slice(1)],
                    },
                ]);
            },
            /below/,
        ],
        ['the transaction reverted', (n: string) => receipt([nativeLog(`x402:${n}`, PRICE)], 0), /reverted/],
        ['the transaction is not mined yet', () => null, /not mined yet/],
    ])('answers 402 when %s, and keeps the nonce for a retry', async (_label, build, message) => {
        const { service, nonces, usedTxs } = setup();
        const nonce = await challenge(service);
        getTransactionReceipt.mockResolvedValue(build(nonce));

        const error = await httpError(service.catCard(header({ txHash: TX, nonce }), RESOURCE, NOW));

        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(message);
        expect((error.getResponse() as any).accepts).toHaveLength(1);
        expect(usedTxs.rows).toHaveLength(0);
        expect(nonces.rows.find(r => r.nonce === nonce)?.usedAt).toBeNull();
    });

    it('checks the NativeDisbursed topic constant against the ABI', () => {
        expect(shelterSplitInterface.getEvent('NativeDisbursed')!.topicHash).toBe(NATIVE_DISBURSED_TOPIC);
    });

    it.each([
        ['not base64 JSON', '%%%'],
        ['another scheme', header({ txHash: TX, nonce: 'a'.repeat(32) }, { scheme: 'exact' })],
        ['another network', header({ txHash: TX, nonce: 'a'.repeat(32) }, { network: 'eip155:1' })],
        ['a malformed tx hash', header({ txHash: '0x1234', nonce: 'a'.repeat(32) })],
    ])('answers 402 for an X-PAYMENT with %s, without calling the RPC', async (_label, value) => {
        const error = await httpError(setup().service.catCard(value, RESOURCE, NOW));
        expect(error.getStatus()).toBe(402);
        expect(getTransactionReceipt).not.toHaveBeenCalled();
    });

    it('refuses a transaction hash that already paid for a card', async () => {
        const { service, usedTxs } = setup();
        usedTxs.rows.push({ txHash: TX, nonce: 'f'.repeat(32), amountWei: PRICE });
        const nonce = await challenge(service);
        getTransactionReceipt.mockResolvedValue(receipt([nativeLog(`x402:${nonce}`, PRICE)]));

        const error = await httpError(
            service.catCard(header({ txHash: TX.toUpperCase().replace('0X', '0x'), nonce }), RESOURCE, NOW)
        );

        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toBe('transaction was already used');
    });

    it('refuses a replay of a paid request (nonce and tx are single use)', async () => {
        const { service } = setup();
        const nonce = await challenge(service);
        getTransactionReceipt.mockResolvedValue(receipt([nativeLog(`x402:${nonce}`, PRICE)]));
        const paid = header({ txHash: TX, nonce });
        await service.catCard(paid, RESOURCE, NOW);

        const error = await httpError(service.catCard(paid, RESOURCE, NOW));
        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(/nonce/);
    });

    it('refuses an expired nonce without reading the chain', async () => {
        const { service } = setup();
        const nonce = await challenge(service);
        getTransactionReceipt.mockResolvedValue(receipt([nativeLog(`x402:${nonce}`, PRICE)]));

        const later = new Date(NOW.getTime() + 601 * 1000);
        const error = await httpError(service.catCard(header({ txHash: TX, nonce }), RESOURCE, later));

        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(/expired/);
        expect(getTransactionReceipt).not.toHaveBeenCalled();
    });

    it('refuses a nonce the server never issued', async () => {
        const error = await httpError(
            setup().service.catCard(header({ txHash: TX, nonce: 'e'.repeat(32) }), RESOURCE, NOW)
        );
        expect(error.getStatus()).toBe(402);
        expect(getTransactionReceipt).not.toHaveBeenCalled();
    });
});

describe('ShelterX402Service.pickCard (whitelist projection)', () => {
    it('projects only name, image URL and shelter name, and drops anything else', async () => {
        const leaky = {
            name: 'Mochi',
            imageUrl: 'https://cdn.test/mochi.png',
            shelterName: 'Pink Paw (Rožinė pėdutė)',
            owner: 'user-id',
            creator: 'user-id',
            email: 'someone@example.test',
            wallets: { stellar: { secret: 'x' } },
        };
        const blessings = blessingModel([leaky]);

        const card = await setup(blessings).service.pickCard();

        expect(card).toEqual({
            name: 'Mochi',
            imageUrl: 'https://cdn.test/mochi.png',
            shelterName: 'Pink Paw (Rožinė pėdutė)',
        });
        const pipeline = blessings.aggregate.mock.calls[0][0] as any[];
        expect(pipeline[0]).toEqual({ $match: { status: 'WAITING' } });
        const project = pipeline.find(stage => stage.$project).$project;
        expect(Object.keys(project).sort()).toEqual(['_id', 'imageUrl', 'name', 'shelterName']);
        expect(project._id).toBe(0);
        const lookups = pipeline.filter(stage => stage.$lookup).map(stage => stage.$lookup.from);
        expect(lookups).toEqual(['images', 'shelters']);
    });

    it('falls back to any blessing when no cat is waiting for adoption', async () => {
        const blessings = {
            exists: jest.fn(),
            aggregate: jest
                .fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ name: 'Pip' }]),
        };
        const card = await setup(blessings as any).service.pickCard();
        expect(card).toEqual({ name: 'Pip', imageUrl: null, shelterName: null });
        expect(blessings.aggregate.mock.calls[1][0][0]).toEqual({ $match: {} });
    });
});
