import { HttpException } from '@nestjs/common';
import { getBigInt, JsonRpcProvider } from 'ethers';
import { NATIVE_DISBURSED_TOPIC, ShelterChain, shelterSplitInterface } from './shelter-chain';
import { fakeNonceModel, fakeUsedTxModel, SHELTER_WALLET, SPLIT, withShelterEnv } from './shelter-onchain.fakes-spec';
import {
    encodePaymentResponse,
    encodePaymentResponses,
    PaymentRequiredException,
    ShelterX402Service,
    X402_DISABLED,
    x402Memo32,
    X402_NO_CARDS,
    X402_UNPRICED,
} from './shelter-x402.service';

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
    const service = new ShelterX402Service(
        nonces as any,
        usedTxs as any,
        blessings as any,
        new ShelterChain(),
        verifiedClaims as any
    );
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
    // The main chain is a mainnet (Arc): onchain-receipt waits for the handover like every public path.
    withShelterEnv({
        SHELTER_X402_ENABLED: 'true',
        SHELTER_SPLIT_ADDRESS: SPLIT,
        SHELTER_X402_PRICE_WEI: PRICE,
        SHELTER_HANDED_OVER: 'true',
    });
});

afterAll(() => withShelterEnv({}));

/**
 * The on-chain claim check (ShelterClaimService.publicGivingVerified) stands in as "the split pays only
 * rotated, shelter-held wallets" whenever these specs set SHELTER_HANDED_OVER=true.
 */
const verifiedClaims = { publicGivingVerified: async () => process.env.SHELTER_HANDED_OVER === 'true' };

describe('GET /shelter/agent/cat-card (x402, onchain-receipt)', () => {
    it('answers 409 on a mainnet before the shelter handover: the split still pays a wallet Token Tails holds', async () => {
        withShelterEnv({ SHELTER_X402_ENABLED: 'true', SHELTER_SPLIT_ADDRESS: SPLIT, SHELTER_X402_PRICE_WEI: PRICE });
        const { service } = setup();

        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(409);
    });

    it('offers onchain-receipt on a testnet without the handover (test USDC)', async () => {
        withShelterEnv({
            SHELTER_X402_ENABLED: 'true',
            SHELTER_SPLIT_ADDRESS: SPLIT,
            SHELTER_X402_PRICE_WEI: PRICE,
            SHELTER_CHAIN_ID: '5042002',
        });
        const { service } = setup();

        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).accepts[0].network).toBe('eip155:5042002');
    });

    it('answers 409 with a clear message when SHELTER_X402_ENABLED is off (the default)', async () => {
        withShelterEnv({ SHELTER_SPLIT_ADDRESS: SPLIT });
        const { service, nonces } = setup();

        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(409);
        expect(error.message).toBe(X402_DISABLED);
        expect(nonces.create).not.toHaveBeenCalled();
    });

    it('answers 409 when there is no card to sell, before asking for payment', async () => {
        const error = await httpError(setup(blessingModel([])).service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(409);
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
                    description:
                        'One adoptable-cat card. The ShelterSplit contract splits each payment among its shelter recipients',
                    mimeType: 'application/json',
                    maxTimeoutSeconds: 600,
                    extra: { memo: `x402:${nonce}`, nonce, decimals: 18, coin: 'USDC', method: 'donate' },
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
        expect(usedTxs.rows).toEqual([
            { txHash: TX, nonce, amountWei: PRICE, scheme: 'onchain-receipt', chainId: 5042 },
        ]);
        expect(nonces.rows.find(r => r.nonce === nonce)).toMatchObject({ usedAt: NOW, txHash: TX });
    });

    it('counts the whole payment from NativeDisbursementBatch when part of it goes to the treasury', async () => {
        const { service, usedTxs } = setup();
        const nonce = await challenge(service);
        const memo = `x402:${nonce}`;
        const batchEvent = shelterSplitInterface.getEvent('NativeDisbursementBatch')!;
        const batch = shelterSplitInterface.encodeEventLog(batchEvent, [
            1,
            '0x4444444444444444444444444444444444444444',
            getBigInt(PRICE),
            getBigInt('8000000000000000'),
            getBigInt('2000000000000000'),
            1,
            memo,
        ]);
        // Shelters hold 8000 bps: NativeDisbursed alone shows 0.008 USDC of the 0.01 USDC paid.
        getTransactionReceipt.mockResolvedValue(
            receipt([nativeLog(memo, '8000000000000000'), { address: SPLIT, topics: batch.topics, data: batch.data }])
        );

        const result = await service.catCard(header({ txHash: TX, nonce }), RESOURCE, NOW);

        expect(result.txHash).toBe(TX);
        expect(usedTxs.rows).toEqual([
            { txHash: TX, nonce, amountWei: PRICE, scheme: 'onchain-receipt', chainId: 5042 },
        ]);
    });

    it.each([
        ['carries another memo', (memo: string) => [`x402:${'0'.repeat(32)}`, SPLIT, memo]],
        [
            'is not from the split contract',
            (memo: string) => [memo, '0x3333333333333333333333333333333333333333', memo],
        ],
    ])('ignores a NativeDisbursementBatch that %s', async (_label, pick) => {
        const { service, usedTxs } = setup();
        const nonce = await challenge(service);
        const [batchMemo, batchAddress, shareMemo] = pick(`x402:${nonce}`);
        const batchEvent = shelterSplitInterface.getEvent('NativeDisbursementBatch')!;
        const batch = shelterSplitInterface.encodeEventLog(batchEvent, [
            1,
            '0x4444444444444444444444444444444444444444',
            getBigInt(PRICE),
            getBigInt('8000000000000000'),
            getBigInt('2000000000000000'),
            1,
            batchMemo,
        ]);
        getTransactionReceipt.mockResolvedValue(
            receipt([
                nativeLog(shareMemo, '8000000000000000'),
                { address: batchAddress, topics: batch.topics, data: batch.data },
            ])
        );

        const error = await httpError(service.catCard(header({ txHash: TX, nonce }), RESOURCE, NOW));

        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(/below/);
        expect(usedTxs.rows).toHaveLength(0);
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

describe('GET /shelter/agent/cat-card (x402, standard exact scheme paid to the shelter wallet)', () => {
    // Anvil's well-known dev account #0: a public test vector, never a real key.
    const DevWallet = jest.requireActual('ethers').Wallet;
    const dev = new DevWallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    const SETTLE_TX = '0x' + 'e'.repeat(64);
    const NOW_S = Math.floor(NOW.getTime() / 1000);
    const EXACT_KEYS = [
        'SHELTER_X402_EXACT_ENABLED',
        'SHELTER_X402_EXACT_NETWORK',
        'SHELTER_X402_EXACT_CHAIN_ID',
        'SHELTER_X402_EXACT_ASSET',
        'SHELTER_X402_EXACT_ASSET_NAME',
        'SHELTER_X402_EXACT_ASSET_VERSION',
        'SHELTER_X402_EXACT_PAYTO',
        'SHELTER_X402_FACILITATOR_URL',
        'SHELTER_X402_FACILITATOR_AUTH',
        'SHELTER_X402_FACILITATOR_AUTH_HEADER',
        'SHELTER_X402_EXACT_PRICE',
        'SHELTER_X402_EXACT_RPC',
        'SHELTER_ROUTER_ADDRESS',
        'SHELTER_TREASURY_ADDRESS',
    ];

    function withExactEnv(values: Record<string, string> = {}) {
        for (const key of EXACT_KEYS) delete process.env[key];
        Object.assign(process.env, {
            SHELTER_X402_EXACT_ENABLED: 'true',
            SHELTER_X402_EXACT_NETWORK: 'base-sepolia',
            SHELTER_X402_EXACT_ASSET: USDC,
            SHELTER_X402_EXACT_PAYTO: SHELTER_WALLET,
            SHELTER_X402_FACILITATOR_URL: 'https://facilitator.test',
            SHELTER_X402_EXACT_RPC: 'https://rpc.test',
            ...values,
        });
    }

    afterEach(() => {
        for (const key of EXACT_KEYS) delete process.env[key];
    });

    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

    const abiString = (text: string) =>
        '0x' +
        (32).toString(16).padStart(64, '0') +
        text.length.toString(16).padStart(64, '0') +
        Buffer.from(text).toString('hex').padEnd(64, '0');
    const pad = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
    /** The settlement receipt: a USDC Transfer(payer -> shelter wallet, 0.01). */
    const GOOD_RECEIPT = {
        status: '0x1',
        logs: [
            {
                address: USDC,
                topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    pad(dev.address),
                    pad(SHELTER_WALLET),
                ],
                data: '0x' + (10000).toString(16).padStart(64, '0'),
            },
        ],
    };

    /**
     * A facilitator that accepts and settles, and an RPC answering the token domain (USDC / 2 / 6
     * decimals unless overridden) and the settlement receipt.
     */
    function facilitator(
        opts: {
            verify?: unknown;
            settle?: unknown;
            receipt?: unknown;
            verifyThrows?: boolean;
            domain?: { name: string; version: string; decimals: number };
            rpcDown?: boolean;
        } = {}
    ): jest.Mock {
        return jest.fn(async (url: string, init: any) => {
            if (url.endsWith('/verify')) {
                if (opts.verifyThrows) throw new TypeError('fetch failed');
                return json(opts.verify ?? { isValid: true, payer: dev.address });
            }
            if (url.endsWith('/settle')) {
                return json(
                    opts.settle ?? {
                        success: true,
                        transaction: SETTLE_TX,
                        network: 'base-sepolia',
                        payer: dev.address,
                    }
                );
            }
            if (opts.rpcDown) throw new TypeError('fetch failed');
            const body = JSON.parse(init.body);
            if (body.method === 'eth_call') {
                const domain = opts.domain ?? { name: 'USDC', version: '2', decimals: 6 };
                const data = body.params[0].data;
                const result =
                    data === '0x06fdde03'
                        ? abiString(domain.name)
                        : data === '0x54fd4d50'
                        ? abiString(domain.version)
                        : '0x' + domain.decimals.toString(16).padStart(64, '0');
                return json({ jsonrpc: '2.0', id: body.id, result });
            }
            return json({ jsonrpc: '2.0', id: body.id, result: opts.receipt ?? null });
        });
    }

    function exactSetup(fetchFn: jest.Mock) {
        const parts = setup();
        const nonces = {
            ...parts.nonces,
            deleteOne: jest.fn(async ({ nonce }: any) => {
                const i = parts.nonces.rows.findIndex(r => r.nonce === nonce);
                if (i >= 0) parts.nonces.rows.splice(i, 1);
            }),
        };
        const service = new ShelterX402Service(
            nonces as any,
            parts.usedTxs as any,
            blessingModel() as any,
            new ShelterChain(),
            verifiedClaims as any
        );
        service.fetchFn = fetchFn as any;
        service.sleep = async () => undefined;
        return { ...parts, nonces, service };
    }

    async function exactHeader(overrides: Record<string, string> = {}) {
        const authorization = {
            from: dev.address,
            to: SHELTER_WALLET,
            value: '10000',
            validAfter: '0',
            validBefore: String(NOW_S + 120),
            nonce: '0x' + '7c'.repeat(32),
            ...overrides,
        };
        const signature = await dev.signTypedData(
            { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC },
            {
                TransferWithAuthorization: [
                    { name: 'from', type: 'address' },
                    { name: 'to', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'validAfter', type: 'uint256' },
                    { name: 'validBefore', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
            },
            authorization
        );
        const body = {
            x402Version: 1,
            scheme: 'exact',
            network: 'base-sepolia',
            payload: { signature, authorization },
        };
        return Buffer.from(JSON.stringify(body)).toString('base64');
    }

    it('lists only the standard exact requirement in accepts, and moves onchain-receipt to a top-level field', async () => {
        withExactEnv();
        const { service } = exactSetup(facilitator());

        const body = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;

        // x402-fetch schema-parses every accepts entry; a custom scheme there makes it throw.
        expect(body.accepts.map((a: any) => a.scheme)).toEqual(['exact']);
        expect(body.onchainReceipt).toMatchObject({ scheme: 'onchain-receipt', payTo: SPLIT, asset: 'native' });
        expect(body.onchainReceipt.extra.memo).toBe(`x402:${body.onchainReceipt.extra.nonce}`);
        expect(body.accepts[0]).toEqual({
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: '10000',
            resource: RESOURCE,
            description: 'A Token Tails cat card; the price goes to the shelter',
            mimeType: 'application/json',
            payTo: SHELTER_WALLET,
            maxTimeoutSeconds: 120,
            asset: USDC,
            extra: { name: 'USDC', version: '2' },
        });
    });

    it('offers exact alone when the onchain-receipt scheme is off, with no nonce issued', async () => {
        withShelterEnv({});
        withExactEnv();
        const { service, nonces } = exactSetup(facilitator());

        const body = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;

        expect(body.accepts.map((a: any) => a.scheme)).toEqual(['exact']);
        expect(body.onchainReceipt).toBeUndefined();
        expect(nonces.rows).toHaveLength(0);
    });

    it('still pays an onchain-receipt header when exact is offered (the offer moved, the scheme did not)', async () => {
        withExactEnv();
        const { service } = exactSetup(facilitator());
        const body = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        const nonce = body.onchainReceipt.extra.nonce;
        getTransactionReceipt.mockResolvedValue(receipt([nativeLog(`x402:${nonce}`, PRICE)]));

        await expect(service.catCard(header({ txHash: TX, nonce }), RESOURCE, NOW)).resolves.toMatchObject({
            txHash: TX,
        });
    });

    it.each([
        ['a token whose EIP-712 name differs', { domain: { name: 'USD Coin', version: '2', decimals: 6 } }],
        ['an 18-decimal token', { domain: { name: 'USDC', version: '2', decimals: 18 } }],
    ])('does not offer exact for %s', async (_label, opts) => {
        withExactEnv();
        const { service } = exactSetup(facilitator(opts));
        const body = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        expect(body.accepts.map((a: any) => a.scheme)).toEqual(['onchain-receipt']);
        expect(body.onchainReceipt).toBeUndefined();
    });

    it('does not offer exact while the token domain cannot be read, and retries on the next request', async () => {
        withExactEnv();
        const down = facilitator({ rpcDown: true });
        const { service } = exactSetup(down);
        const before = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        expect(before.accepts.map((a: any) => a.scheme)).toEqual(['onchain-receipt']);

        service.fetchFn = facilitator() as any;
        const after = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        expect(after.accepts.map((a: any) => a.scheme)).toEqual(['exact']);
    });

    it('checks the token domain at startup (onModuleInit)', async () => {
        withExactEnv();
        const fetchFn = facilitator();
        const { service } = exactSetup(fetchFn);
        await service.onModuleInit();
        expect(fetchFn.mock.calls.filter(c => JSON.parse(c[1].body).method === 'eth_call')).toHaveLength(3);
        await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(fetchFn.mock.calls.filter(c => JSON.parse(c[1].body).method === 'eth_call')).toHaveLength(3);
    });

    it.each([
        ['SHELTER_ROUTER_ADDRESS', SHELTER_WALLET],
        ['SHELTER_TREASURY_ADDRESS', SHELTER_WALLET],
    ])('does not offer exact when payTo equals %s', async (key, value) => {
        withExactEnv({ [key]: value });
        const { service } = exactSetup(facilitator());
        const body = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        expect(body.accepts.map((a: any) => a.scheme)).toEqual(['onchain-receipt']);
    });

    it('answers 402, not 500, for an authorization valid far beyond maxTimeoutSeconds', async () => {
        withExactEnv();
        const fetchFn = facilitator();
        const decoded = JSON.parse(Buffer.from(await exactHeader(), 'base64').toString());
        decoded.payload.authorization.validBefore = '9'.repeat(78);
        const error = await httpError(
            exactSetup(fetchFn).service.catCard(Buffer.from(JSON.stringify(decoded)).toString('base64'), RESOURCE, NOW)
        );
        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(/too long/);
        expect(fetchFn.mock.calls.filter(c => String(c[0]).startsWith('https://facilitator.test'))).toHaveLength(0);
    });

    it('does not advertise exact on mainnet before the shelter handover', async () => {
        withExactEnv({ SHELTER_X402_EXACT_NETWORK: 'base' });
        delete process.env.SHELTER_HANDED_OVER;
        const { service } = exactSetup(facilitator());

        // Before the handover neither scheme is offered on a mainnet: both would pay a Token-Tails-held wallet.
        const before = await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(before.getStatus()).toBe(409);

        withExactEnv({ SHELTER_X402_EXACT_NETWORK: 'base', SHELTER_HANDED_OVER: 'true' });
        const after = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        expect(after.accepts.map((a: any) => a.scheme)).toEqual(['exact']);
        expect(after.onchainReceipt.scheme).toBe('onchain-receipt');
    });

    it('verifies and settles through the facilitator, records the used tx and returns the card', async () => {
        withExactEnv();
        const fetchFn = facilitator({ receipt: GOOD_RECEIPT });
        const { service, usedTxs } = exactSetup(fetchFn);

        const result = await service.catCard(await exactHeader(), RESOURCE, NOW);

        expect(result.txHash).toBe(SETTLE_TX);
        expect(result.card.name).toBe('Mochi');
        expect(fetchFn.mock.calls.map(c => c[0]).filter(url => url !== 'https://rpc.test')).toEqual([
            'https://facilitator.test/verify',
            'https://facilitator.test/settle',
        ]);
        const sent = JSON.parse(fetchFn.mock.calls.find(c => c[0] === 'https://facilitator.test/verify')![1].body);
        expect(sent.paymentRequirements.payTo).toBe(SHELTER_WALLET);
        expect(sent.paymentPayload.payload.authorization.to).toBe(SHELTER_WALLET);
        expect(usedTxs.rows).toEqual([
            {
                txHash: SETTLE_TX,
                nonce: '0x' + '7c'.repeat(32),
                amountWei: '10000',
                scheme: 'exact',
                chainId: 84532,
                amountBase: '10000',
                payTo: SHELTER_WALLET,
                verifiedOnchain: true,
            },
        ]);
        const response = JSON.parse(Buffer.from(encodePaymentResponse(SETTLE_TX), 'base64').toString());
        expect(response).toEqual({
            success: true,
            txHash: SETTLE_TX,
            transaction: SETTLE_TX,
            network: 'base-sepolia',
            payer: dev.address,
        });
    });

    it('carries the x402 v2 PAYMENT-REQUIRED value on the 402 (CAIP-2 network, amount, resource object)', async () => {
        withExactEnv();
        const { service } = exactSetup(facilitator());

        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));

        expect(error).toBeInstanceOf(PaymentRequiredException);
        const v2 = JSON.parse(Buffer.from((error as PaymentRequiredException).paymentRequiredV2, 'base64').toString());
        expect(v2).toEqual({
            x402Version: 2,
            error: 'payment required',
            resource: {
                url: RESOURCE,
                description: 'A Token Tails cat card; the price goes to the shelter',
                mimeType: 'application/json',
            },
            accepts: [
                {
                    scheme: 'exact',
                    network: 'eip155:84532',
                    amount: '10000',
                    payTo: SHELTER_WALLET,
                    maxTimeoutSeconds: 120,
                    asset: USDC,
                    extra: { name: 'USDC', version: '2' },
                },
            ],
        });
    });

    it('pays a v2 PAYMENT-SIGNATURE payload (accepted + CAIP-2 network) through the same checks', async () => {
        withExactEnv();
        const fetchFn = facilitator({ receipt: GOOD_RECEIPT });
        const { service } = exactSetup(fetchFn);
        const v1 = JSON.parse(Buffer.from(await exactHeader(), 'base64').toString());
        const v2 = {
            x402Version: 2,
            resource: { url: RESOURCE, description: '', mimeType: 'application/json' },
            accepted: { scheme: 'exact', network: 'eip155:84532', amount: '10000', asset: USDC, payTo: SHELTER_WALLET },
            payload: v1.payload,
        };

        const result = await service.catCard(Buffer.from(JSON.stringify(v2)).toString('base64'), RESOURCE, NOW);

        expect(result.txHash).toBe(SETTLE_TX);
        const sent = JSON.parse(fetchFn.mock.calls.find(c => c[0] === 'https://facilitator.test/verify')![1].body);
        expect(sent.paymentPayload).toMatchObject({ x402Version: 1, scheme: 'exact', network: 'base-sepolia' });
        const { v1: r1, v2: r2 } = encodePaymentResponses(SETTLE_TX);
        expect(JSON.parse(Buffer.from(r1, 'base64').toString()).network).toBe('base-sepolia');
        expect(JSON.parse(Buffer.from(r2, 'base64').toString())).toMatchObject({
            success: true,
            transaction: SETTLE_TX,
            network: 'eip155:84532',
        });
    });

    it('sends the facilitator auth header when SHELTER_X402_FACILITATOR_AUTH is set', async () => {
        withExactEnv({ SHELTER_X402_FACILITATOR_AUTH: 'Bearer test-key' });
        const fetchFn = facilitator({ receipt: GOOD_RECEIPT });
        const { service } = exactSetup(fetchFn);

        await service.catCard(await exactHeader(), RESOURCE, NOW);

        const calls = fetchFn.mock.calls.filter(c => String(c[0]).startsWith('https://facilitator.test/'));
        expect(calls).toHaveLength(2);
        for (const [, init] of calls) {
            expect(init.headers).toEqual({ Authorization: 'Bearer test-key', 'content-type': 'application/json' });
        }
        encodePaymentResponses(SETTLE_TX);
    });

    it('refuses a replay of the same authorization without calling the facilitator again', async () => {
        withExactEnv();
        const fetchFn = facilitator();
        const { service } = exactSetup(fetchFn);
        const paid = await exactHeader();
        await service.catCard(paid, RESOURCE, NOW);

        const error = await httpError(service.catCard(paid, RESOURCE, NOW));

        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toBe('authorization was already used');
        expect(fetchFn.mock.calls.filter(c => String(c[0]).startsWith('https://facilitator.test'))).toHaveLength(2);
    });

    it.each([
        ['a payee other than the shelter wallet', { to: SPLIT }, /shelter wallet/],
        ['an underpayment', { value: '9999' }, /below/],
    ])('refuses %s before the facilitator', async (_label, overrides, reason) => {
        withExactEnv();
        const fetchFn = facilitator();
        const error = await httpError(exactSetup(fetchFn).service.catCard(await exactHeader(overrides), RESOURCE, NOW));
        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(reason);
        expect(fetchFn.mock.calls.filter(c => String(c[0]).startsWith('https://facilitator.test'))).toHaveLength(0);
    });

    it('refuses the wrong network', async () => {
        withExactEnv();
        const header = JSON.parse(Buffer.from(await exactHeader(), 'base64').toString());
        header.network = 'base';
        const error = await httpError(
            exactSetup(facilitator()).service.catCard(
                Buffer.from(JSON.stringify(header)).toString('base64'),
                RESOURCE,
                NOW
            )
        );
        expect((error.getResponse() as any).error).toMatch(/wrong network/);
    });

    it('refuses a signature that does not recover to the payer', async () => {
        withExactEnv();
        const header = JSON.parse(Buffer.from(await exactHeader(), 'base64').toString());
        header.payload.authorization.value = '20000';
        const fetchFn = facilitator();
        const error = await httpError(
            exactSetup(fetchFn).service.catCard(Buffer.from(JSON.stringify(header)).toString('base64'), RESOURCE, NOW)
        );
        expect((error.getResponse() as any).error).toMatch(/signature/);
        expect(fetchFn.mock.calls.filter(c => String(c[0]).startsWith('https://facilitator.test'))).toHaveLength(0);
    });

    it('answers 402 when the facilitator refuses, and releases the authorization for a retry', async () => {
        withExactEnv();
        const { service, usedTxs, nonces } = exactSetup(
            facilitator({ verify: { isValid: false, invalidReason: 'insufficient_funds' } })
        );

        const error = await httpError(service.catCard(await exactHeader(), RESOURCE, NOW));

        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(/insufficient_funds/);
        expect(usedTxs.rows).toHaveLength(0);
        expect(nonces.rows.filter(r => String(r.nonce).startsWith('exact:'))).toHaveLength(0);
    });

    it('answers 402 when the facilitator is unreachable', async () => {
        withExactEnv();
        const error = await httpError(
            exactSetup(facilitator({ verifyThrows: true })).service.catCard(await exactHeader(), RESOURCE, NOW)
        );
        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(/facilitator is unavailable/);
    });

    it('answers 402 when settlement fails', async () => {
        withExactEnv();
        const { service, usedTxs } = exactSetup(
            facilitator({ settle: { success: false, errorReason: 'invalid_transaction_state', transaction: '' } })
        );
        const error = await httpError(service.catCard(await exactHeader(), RESOURCE, NOW));
        expect((error.getResponse() as any).error).toMatch(/did not settle/);
        expect(usedTxs.rows).toHaveLength(0);
    });

    it('re-checks the settlement on-chain, and refuses one with no transfer to the shelter', async () => {
        withExactEnv();
        const ok = exactSetup(facilitator({ receipt: GOOD_RECEIPT }));
        await expect(ok.service.catCard(await exactHeader(), RESOURCE, NOW)).resolves.toMatchObject({
            txHash: SETTLE_TX,
        });

        const bad = exactSetup(facilitator({ receipt: { status: '0x1', logs: [] } }));
        const error = await httpError(bad.service.catCard(await exactHeader(), RESOURCE, NOW));
        expect((error.getResponse() as any).error).toMatch(/no matching transfer/);
        expect(bad.usedTxs.rows).toHaveLength(0);
    });

    it('gives the card but stores the row as unverified when the receipt never shows up', async () => {
        withExactEnv();
        const { service, usedTxs } = exactSetup(facilitator({ receipt: null }));
        await expect(service.catCard(await exactHeader(), RESOURCE, NOW)).resolves.toMatchObject({ txHash: SETTLE_TX });
        expect(usedTxs.rows).toHaveLength(1);
        expect(usedTxs.rows[0].verifiedOnchain).toBe(false);
    });

    it('does not offer exact without SHELTER_X402_EXACT_RPC', async () => {
        withExactEnv({ SHELTER_X402_EXACT_RPC: '' });
        const { service } = exactSetup(facilitator());
        const body = (await httpError(service.catCard(undefined, RESOURCE, NOW))).getResponse() as any;
        expect(body.accepts.map((a: any) => a.scheme)).toEqual(['onchain-receipt']);
    });

    it('keeps refusing an exact header when exact is off (onchain-receipt only)', async () => {
        const error = await httpError(setup().service.catCard(await exactHeader(), RESOURCE, NOW));
        expect((error.getResponse() as any).error).toMatch(/unsupported scheme/);
    });
});

describe('GET /shelter/agent/cat-card (x402, onchain-receipt on several chains)', () => {
    const BASE_SPLIT = '0x4444444444444444444444444444444444444444';
    const TEMPO_SPLIT = '0x5555555555555555555555555555555555555555';
    const BASE_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    const PATH_USD = '0x20C0000000000000000000000000000000000000';
    const RELAY_KEYS = [
        'SHELTER_AUTO_CHAINS',
        'SHELTER_RELAY_CHAINS',
        'SHELTER_CHAIN_84532_SPLIT_ADDRESS',
        'SHELTER_CHAIN_84532_X402_ENABLED',
        'SHELTER_CHAIN_84532_X402_PRICE',
        'SHELTER_CHAIN_42431_SPLIT_ADDRESS',
        'SHELTER_CHAIN_42431_X402_ENABLED',
        'SHELTER_CHAIN_5042_SPLIT_ADDRESS',
    ];
    const call = jest.fn();
    const tokenOf: Record<string, string> = {
        [BASE_SPLIT.toLowerCase()]: BASE_USDC,
        [TEMPO_SPLIT.toLowerCase()]: PATH_USD,
    };
    const { erc20Interface } = jest.requireActual('./shelter-chain');

    function tokenLog(event: 'Disbursed' | 'DisbursementBatch', memo: string, amount: string, address: string) {
        const fragment = shelterSplitInterface.getEvent(event)!;
        const args =
            event === 'Disbursed'
                ? [SHELTER_WALLET, getBigInt(amount), memo]
                : [1, '0x' + '9'.repeat(40), getBigInt(amount), getBigInt(amount), 0, 1, memo];
        const { topics, data } = shelterSplitInterface.encodeEventLog(fragment, args);
        return { address, topics, data };
    }

    beforeEach(() => {
        for (const key of RELAY_KEYS) delete process.env[key];
        withShelterEnv({
            SHELTER_X402_ENABLED: 'true',
            SHELTER_SPLIT_ADDRESS: SPLIT,
            SHELTER_X402_PRICE_WEI: PRICE,
            SHELTER_CHAIN_ID: '5042002',
        });
        Object.assign(process.env, {
            SHELTER_AUTO_CHAINS: 'off',
            SHELTER_RELAY_CHAINS: '84532,42431',
            SHELTER_CHAIN_84532_SPLIT_ADDRESS: BASE_SPLIT,
            SHELTER_CHAIN_84532_X402_ENABLED: 'true',
            SHELTER_CHAIN_84532_X402_PRICE: '0.02',
            SHELTER_CHAIN_42431_SPLIT_ADDRESS: TEMPO_SPLIT,
            SHELTER_CHAIN_42431_X402_ENABLED: 'true',
        });
        call.mockImplementation(async ({ to, data }: { to: string; data: string }) => {
            if (data === shelterSplitInterface.encodeFunctionData('token', [])) {
                return shelterSplitInterface.encodeFunctionResult('token', [tokenOf[to.toLowerCase()]]);
            }
            if (data === erc20Interface.encodeFunctionData('decimals', [])) {
                return erc20Interface.encodeFunctionResult('decimals', [6]);
            }
            throw new Error('unexpected call');
        });
        (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => ({ getTransactionReceipt, call }));
    });

    afterAll(() => {
        for (const key of RELAY_KEYS) delete process.env[key];
    });

    async function offers(service: ShelterX402Service) {
        const error = await httpError(service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(402);
        return (error.getResponse() as any).accepts as any[];
    }

    it('lists one offer per enabled chain, sharing one nonce, each priced in its own coin', async () => {
        const { service, nonces } = setup();
        const accepts = await offers(service);

        expect(accepts.map(a => a.network)).toEqual(['eip155:5042002', 'eip155:84532', 'eip155:42431']);
        const nonce = accepts[0].extra.nonce;
        expect(new Set(accepts.map(a => a.extra.nonce))).toEqual(new Set([nonce]));
        expect(nonces.rows).toHaveLength(1);
        expect(accepts[0]).toMatchObject({ asset: 'native', maxAmountRequired: PRICE, payTo: SPLIT });
        expect(accepts[0].extra).toMatchObject({ decimals: 18, method: 'donate' });
        expect(accepts[1]).toMatchObject({ asset: BASE_USDC, maxAmountRequired: '20000', payTo: BASE_SPLIT });
        expect(accepts[1].extra).toEqual({
            memo: `x402:${nonce}`,
            nonce,
            decimals: 6,
            coin: 'USDC',
            method: 'disburse',
        });
        expect(accepts[2]).toMatchObject({ asset: PATH_USD, maxAmountRequired: '10000', payTo: TEMPO_SPLIT });
        expect(accepts[2].extra).toMatchObject({ coin: 'pathUSD', method: 'disburseWithMemo' });
        expect(accepts[2].extra.memo32).toBe(x402Memo32(nonce));
    });

    it('keeps the per-chain flag off by default: a relay chain without X402_ENABLED is not offered', async () => {
        delete process.env.SHELTER_CHAIN_42431_X402_ENABLED;
        const accepts = await offers(setup().service);
        expect(accepts.map(a => a.network)).toEqual(['eip155:5042002', 'eip155:84532']);
    });

    it('waits for the handover on a mainnet relay chain', async () => {
        process.env.SHELTER_RELAY_CHAINS = '8453';
        process.env.SHELTER_CHAIN_8453_SPLIT_ADDRESS = BASE_SPLIT;
        process.env.SHELTER_CHAIN_8453_X402_ENABLED = 'true';
        try {
            const accepts = await offers(setup().service);
            expect(accepts.map(a => a.network)).toEqual(['eip155:5042002']);
        } finally {
            delete process.env.SHELTER_CHAIN_8453_SPLIT_ADDRESS;
            delete process.env.SHELTER_CHAIN_8453_X402_ENABLED;
        }
    });

    it('answers 409 when no enabled chain can be priced (every token read failed)', async () => {
        // The main chain's card is switched off (x402 is on by default), so only the token chains remain.
        withShelterEnv({ SHELTER_CHAIN_ID: '5042002', SHELTER_X402_ENABLED: 'false' });
        call.mockRejectedValue(Object.assign(new Error('down'), { code: 'NETWORK_ERROR' }));
        const error = await httpError(setup().service.catCard(undefined, RESOURCE, NOW));
        expect(error.getStatus()).toBe(409);
        expect(error.message).toBe(X402_UNPRICED);
    });

    it('drops a chain whose token cannot be read, and still offers the others', async () => {
        call.mockRejectedValue(Object.assign(new Error('down'), { code: 'NETWORK_ERROR' }));
        const accepts = await offers(setup().service);
        expect(accepts.map(a => a.network)).toEqual(['eip155:5042002']);
    });

    it('pays on Base Sepolia with disburse: Disbursed shares or the batch amount count, then the replay is refused', async () => {
        const { service, usedTxs } = setup();
        const nonce = (await offers(service))[0].extra.nonce;
        getTransactionReceipt.mockResolvedValue(
            receipt([
                tokenLog('Disbursed', `x402:${nonce}`, '18000', BASE_SPLIT),
                tokenLog('DisbursementBatch', `x402:${nonce}`, '20000', BASE_SPLIT),
            ])
        );
        const paid = header({ txHash: TX, nonce }, { network: 'eip155:84532' });

        const result = await service.catCard(paid, RESOURCE, NOW);

        expect(result.txHash).toBe(TX);
        expect(usedTxs.rows).toEqual([
            {
                txHash: TX,
                nonce,
                amountWei: '20000000000000000',
                scheme: 'onchain-receipt',
                chainId: 84532,
                amountBase: '20000',
            },
        ]);
        const replay = await httpError(service.catCard(paid, RESOURCE, NOW));
        expect(replay.getStatus()).toBe(402);
        expect((replay.getResponse() as any).error).toMatch(/already used/);
    });

    it('pays on Tempo with disburseWithMemo: the event memo is the 0x-hex of memo32', async () => {
        const { service } = setup();
        const nonce = (await offers(service))[0].extra.nonce;
        getTransactionReceipt.mockResolvedValue(
            receipt([tokenLog('DisbursementBatch', x402Memo32(nonce), '10000', TEMPO_SPLIT)])
        );
        const result = await service.catCard(header({ txHash: TX, nonce }, { network: 'eip155:42431' }), RESOURCE, NOW);
        expect(result.txHash).toBe(TX);
    });

    it.each([
        [
            'below the chain price',
            () => [tokenLog('DisbursementBatch', 'x402:NONCE', '19999', BASE_SPLIT)],
            /below 20000 USDC/,
        ],
        ['from another contract', () => [tokenLog('DisbursementBatch', 'x402:NONCE', '20000', SPLIT)], /below/],
        ['native events on a token chain', () => [nativeLog('x402:NONCE', '20000000000000000', BASE_SPLIT)], /below/],
    ])('refuses a Base Sepolia payment %s', async (_label, logs, message) => {
        const { service, usedTxs } = setup();
        const nonce = (await offers(service))[0].extra.nonce;
        const built = (logs as () => any[])().map(l => l);
        // Re-encode with the issued nonce.
        getTransactionReceipt.mockResolvedValue(
            receipt(
                built.map(l => {
                    const parsed = shelterSplitInterface.parseLog(l)!;
                    const args = [...parsed.args];
                    args[args.length - 1] = `x402:${nonce}`;
                    return { address: l.address, ...shelterSplitInterface.encodeEventLog(parsed.fragment, args) };
                })
            )
        );
        const error = await httpError(
            service.catCard(header({ txHash: TX, nonce }, { network: 'eip155:84532' }), RESOURCE, NOW)
        );
        expect(error.getStatus()).toBe(402);
        expect((error.getResponse() as any).error).toMatch(message);
        expect(usedTxs.rows).toHaveLength(0);
    });

    it('refuses a network that is not offered', async () => {
        const { service } = setup();
        const nonce = (await offers(service))[0].extra.nonce;
        const error = await httpError(
            service.catCard(header({ txHash: TX, nonce }, { network: 'eip155:421614' }), RESOURCE, NOW)
        );
        expect((error.getResponse() as any).error).toBe(
            'wrong network; use eip155:5042002 or eip155:84532 or eip155:42431'
        );
    });
});
