import { HttpException } from '@nestjs/common';
import { verifyTypedData, Wallet } from 'ethers';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import {
    authNonce,
    donateRouterInterface,
    encodeDonateWithAuthorization,
    erc20Interface,
    receiveWithAuthorizationTypedData,
    recipientsHashOf,
    ROUTER_DONATION_TOPIC,
} from './donate-router';
import { DonationBroadcastError } from './shelter-chain';
import {
    isTestnetChain,
    publicGivingAllowed,
    readShelterConfig,
    relayReady,
    ShelterOnchainConfig,
} from './shelter-onchain.config';
import { ipHash, RELAY_PER_SIGNER_DAILY, ShelterRelayService } from './shelter-relay.service';

const ROUTER = '0x4444444444444444444444444444444444444444';
const SPLIT = '0x1111111111111111111111111111111111111111';
const USDC = '0x3600000000000000000000000000000000000000';
const NOW = new Date('2026-10-04T10:00:00Z');
const RECIPIENTS = '0x' + 'cd'.repeat(32);
const NOW_S = Math.floor(NOW.getTime() / 1000);
// Throwaway keys made for this spec; they never hold anything.
const HOT = Wallet.createRandom();
const DONOR = Wallet.createRandom();

function config(over: Partial<ShelterOnchainConfig> = {}): ShelterOnchainConfig {
    return {
        ...readShelterConfig({
            SHELTER_CHAIN_ID: '5042002',
            SHELTER_SPLIT_ADDRESS: SPLIT,
            SHELTER_ROUTER_ADDRESS: ROUTER,
            SHELTER_RELAY_ENABLED: 'true',
            SHELTER_DONATE_PRIVATE_KEY: HOT.privateKey,
        } as NodeJS.ProcessEnv),
        ...over,
    };
}

let saltCounter = 0;
function body(over: Record<string, unknown> = {}) {
    saltCounter++;
    return {
        chainId: 5042002,
        from: DONOR.address,
        value: '1000000',
        validAfter: '0',
        validBefore: String(NOW_S + 300),
        salt: '0x' + saltCounter.toString(16).padStart(64, '0'),
        memo: 'tt:wallet:0a1b2c3d',
        recipients: RECIPIENTS,
        signature: '0x' + '1b'.repeat(64) + '1b',
        ...over,
    } as any;
}

const callException = (reason: string) => Object.assign(new Error(reason), { code: 'CALL_EXCEPTION', reason });

function setup(claims?: { publicGivingVerified: jest.Mock }) {
    const relays = memoryModel({ unique: [['nonce']] });
    const counters = memoryModel({ unique: [['key']] });
    const matches = memoryModel({ unique: [['donorTxHash']] });
    let n = 0;
    const chain = {
        ethCall: jest.fn(async () => '0x'),
        sendContractCall: jest.fn(async (_to: string, _data: string, _value: bigint, opts: any) => {
            const hash = '0x' + (++n).toString(16).padStart(64, 'a');
            await opts?.onSigned?.({ hash, nonce: n, from: HOT.address.toLowerCase() });
            return { txHash: hash, nonce: n, from: HOT.address.toLowerCase() };
        }),
        getReceipt: jest.fn(async (): Promise<any> => null),
        minedNonce: jest.fn(async () => 0),
        blockNumber: jest.fn(async () => 500),
        getRouterLogsByNonce: jest.fn(async (): Promise<any[]> => []),
    };
    // router.canDonate is answered separately, so the specs' ethCall mocks see only the simulations.
    const canDonateSelector = donateRouterInterface.getFunction('canDonate')!.selector;
    const canDonate = jest.fn(async (): Promise<[boolean, bigint]> => [true, BigInt(0)]);
    const routed = {
        ...chain,
        ethCall: async (...args: any[]) =>
            String(args[2]).startsWith(canDonateSelector)
                ? donateRouterInterface.encodeFunctionResult('canDonate', await canDonate())
                : (chain.ethCall as any)(...args),
    };
    const service = new ShelterRelayService(
        relays as any,
        counters as any,
        matches as any,
        routed as any,
        claims as any
    );
    return { relays, counters, matches, chain, canDonate, service };
}

async function refusal(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const e = error as HttpException;
        return { status: e.getStatus(), code: (e.getResponse() as any).code };
    }
    throw new Error('expected a refusal');
}

describe('publicGivingAllowed (mainnet gate)', () => {
    it('allows testnets whenever enabled and mainnets only after the handover', () => {
        expect(publicGivingAllowed({ chainId: 5042002, handedOver: false })).toBe(true);
        expect(publicGivingAllowed({ chainId: 84532, handedOver: false })).toBe(true);
        expect(publicGivingAllowed({ chainId: 5042, handedOver: false })).toBe(false);
        expect(publicGivingAllowed({ chainId: 8453, handedOver: false })).toBe(false);
        expect(publicGivingAllowed({ chainId: 5042, handedOver: true })).toBe(true);
    });

    it('treats an unknown chain id as a mainnet', () => {
        expect(isTestnetChain(999999)).toBe(false);
        expect(publicGivingAllowed({ chainId: 999999, handedOver: false })).toBe(false);
    });

    it('reads SHELTER_HANDED_OVER as true only for the literal "true", and everything is off by default', () => {
        expect(readShelterConfig({ SHELTER_HANDED_OVER: 'yes' } as any).handedOver).toBe(false);
        expect(readShelterConfig({ SHELTER_HANDED_OVER: 'TRUE' } as any).handedOver).toBe(true);
        const defaults = readShelterConfig({} as any);
        expect(defaults.relayEnabled).toBe(false);
        expect(defaults.matchEnabled).toBe(false);
        expect(defaults.routerAddress).toBeNull();
        expect(relayReady(defaults)).toBe(false);
        expect(defaults.relayMinBase.toString()).toBe('10000');
        expect(defaults.relayMaxBase.toString()).toBe('100000000');
        expect(defaults.matchPerGiftBase.toString()).toBe('1000000');
        expect(defaults.matchMinGiftBase.toString()).toBe('100000');
        expect(defaults.matchDailyBase.toString()).toBe('2000000');
        expect(defaults.matchPoolBase.toString()).toBe('10000000');
        expect(readShelterConfig({ SHELTER_MATCH_POOL: '25.5' } as any).matchPoolBase.toString()).toBe('25500000');
        expect(readShelterConfig({ SHELTER_MATCH_POOL: '1e9' } as any).matchPoolBase.toString()).toBe('10000000');
    });
});

describe('donate-router helpers', () => {
    it('binds the router, the memo and the payout list into the EIP-3009 nonce', () => {
        const salt = '0x' + '01'.repeat(32);
        const a = authNonce(ROUTER, salt, 'tt:wallet:00000001', RECIPIENTS);
        expect(a).toMatch(/^0x[0-9a-f]{64}$/);
        expect(authNonce(ROUTER, salt, 'tt:wallet:00000002', RECIPIENTS)).not.toBe(a);
        expect(authNonce(SPLIT, salt, 'tt:wallet:00000001', RECIPIENTS)).not.toBe(a);
        expect(authNonce(ROUTER, salt, 'tt:wallet:00000001', '0x' + 'ce'.repeat(32))).not.toBe(a);
        // cast keccak $(cast abi-encode "f(address,bytes32,bytes32,bytes32)" ROUTER keccak(memo) salt RECIPIENTS)
        expect(a).toBe('0x2c003c4e07c761d9f2489d58dd1f9cde77360858a42d7624442d0c97abc4c5dd');
    });

    it('hashes the payout list like DonateRouter.recipientsHash (vector from forge)', () => {
        // keccak256(abi.encode([0x…5101], [1000000])), as test_ImmutableWiring checks on chain.
        const h = recipientsHashOf(['0x0000000000000000000000000000000000005101'], [1000000]);
        expect(h).toBe('0x8908e5ae254ca7857b75ac0c501785a47e253915dbb8413869ae3527969aee41');
        expect(recipientsHashOf(['0x0000000000000000000000000000000000005101'], [1000001])).not.toBe(h);
    });

    it('builds typed data a wallet signs and that recovers to the donor', async () => {
        const domain = { name: 'USDC', version: '2', chainId: 5042002, verifyingContract: USDC };
        const auth = {
            from: DONOR.address,
            value: '1000000',
            validAfter: 0,
            validBefore: NOW_S + 300,
            salt: '0x' + '02'.repeat(32),
            memo: 'tt:wallet:0a1b2c3d',
            recipients: RECIPIENTS,
        };
        const typed = receiveWithAuthorizationTypedData(domain, ROUTER, auth);
        expect(typed.message.to).toBe(ROUTER);
        expect(typed.message.nonce).toBe(authNonce(ROUTER, auth.salt, auth.memo, RECIPIENTS));
        const signature = await DONOR.signTypedData(typed.domain, typed.types, typed.message);
        expect(verifyTypedData(typed.domain, typed.types, typed.message, signature)).toBe(DONOR.address);
    });

    it('has the RouterDonation topic of the shared ABI', () => {
        expect(ROUTER_DONATION_TOPIC).toBe(donateRouterInterface.getEvent('RouterDonation')!.topicHash.toLowerCase());
        // cast keccak "RouterDonation(address,uint256,uint256,uint8,string,bytes32)"
        expect(ROUTER_DONATION_TOPIC).toBe('0xf057bcd6794500ca5bd0ed074e76b7ab595a7b9fdc70b87528191f50eae48a0c');
    });
});

describe('ShelterRelayService.relay', () => {
    it('simulates, broadcasts from the hot wallet with no value, and stores the relay', async () => {
        const ctx = setup();
        const b = body();
        const result = await ctx.service.relay(b, '203.0.113.9', NOW, config({ relayIpPepper: 'spec-pepper' }));
        expect(result.status).toBe('submitted');
        const [to, data, value, opts] = ctx.chain.sendContractCall.mock.calls[0];
        expect(to).toBe(ROUTER);
        expect(value.toString()).toBe('0');
        expect(opts.config.chainId).toBe(5042002);
        expect(data).toBe(
            encodeDonateWithAuthorization(
                {
                    from: DONOR.address.toLowerCase(),
                    value: b.value,
                    validAfter: b.validAfter,
                    validBefore: b.validBefore,
                    salt: b.salt,
                    memo: b.memo,
                    recipients: RECIPIENTS,
                },
                b.signature
            )
        );
        expect(ctx.chain.ethCall).toHaveBeenCalledWith(expect.anything(), ROUTER, data, HOT.address.toLowerCase());
        const row = ctx.relays.rows[0];
        expect(row).toMatchObject({
            nonce: authNonce(ROUTER, b.salt, b.memo, RECIPIENTS),
            from: DONOR.address.toLowerCase(),
            valueBase: '1000000',
            status: 'submitted',
            txHash: result.txHash,
        });
        expect(row.ipHash).toMatch(/^[0-9a-f]{32}$/);
        expect(JSON.stringify(row)).not.toContain('203.0.113.9');
        // A keyed HMAC: the same IP under another pepper gives another hash, and no pepper stores none.
        expect(ipHash('203.0.113.9', 'other')).not.toBe(row.ipHash);
        expect(ipHash('203.0.113.9', null)).toBeUndefined();
        await ctx.service.relay(body(), '203.0.113.9', NOW, config());
        expect(ctx.relays.rows[1].ipHash).toBeUndefined();
    });

    it.each([
        ['relay off', () => body(), () => config({ relayEnabled: false }), 409, 'RELAY_OFF'],
        ['wrong chain', () => body({ chainId: 5042 }), () => config(), 400, 'RELAY_WRONG_CHAIN'],
        ['bad memo', () => body({ memo: 'tt:heist:0a1b2c3d' }), () => config(), 400, 'RELAY_BAD_MEMO'],
        ['bad recipients hash', () => body({ recipients: '0x1234' }), () => config(), 400, 'RELAY_REJECTED'],
        ['expired', () => body({ validBefore: String(NOW_S + 10) }), () => config(), 400, 'RELAY_WINDOW'],
        ['too far ahead', () => body({ validBefore: String(NOW_S + 601) }), () => config(), 400, 'RELAY_WINDOW'],
        ['not yet valid', () => body({ validAfter: String(NOW_S + 6) }), () => config(), 400, 'RELAY_WINDOW'],
        ['over max', () => body({ value: '100000001' }), () => config(), 400, 'RELAY_AMOUNT'],
        ['under min', () => body({ value: '9999' }), () => config(), 400, 'RELAY_AMOUNT'],
        [
            'mainnet without handover',
            () => body({ chainId: 5042 }),
            () => config({ chainId: 5042, handedOver: false }),
            409,
            'RELAY_AWAITING_HANDOVER',
        ],
    ])('refuses %s without touching the chain', async (_name, b, c, status, code) => {
        const ctx = setup();
        await expect(refusal(ctx.service.relay(b(), undefined, NOW, c()))).resolves.toEqual({ status, code });
        expect(ctx.chain.ethCall).not.toHaveBeenCalled();
        expect(ctx.chain.sendContractCall).not.toHaveBeenCalled();
        expect(ctx.counters.rows.every(r => r.used === 0)).toBe(true);
    });

    it('serves the try-it testnet next to a mainnet main chain (SHELTER_TRY_*), with its own key', async () => {
        const saved = { ...process.env };
        try {
            process.env.SHELTER_CHAIN_ID = '5042';
            process.env.SHELTER_HANDED_OVER = 'false';
            process.env.SHELTER_TRY_CHAIN_ID = '5042002';
            process.env.SHELTER_TRY_ROUTER_ADDRESS = ROUTER;
            process.env.SHELTER_TRY_SPLIT_ADDRESS = SPLIT;
            process.env.SHELTER_TRY_RELAY_ENABLED = 'true';
            process.env.SHELTER_TRY_PRIVATE_KEY = HOT.privateKey;
            const ctx = setup();
            await expect(ctx.service.relay(body(), undefined, NOW)).resolves.toMatchObject({ status: 'submitted' });
            expect(ctx.chain.sendContractCall.mock.calls[0][3].config.chainId).toBe(5042002);
            // The main chain (mainnet, not handed over) still refuses: the try-it chain opens nothing there.
            await expect(refusal(ctx.service.relay(body({ chainId: 5042 }), undefined, NOW))).resolves.toEqual({
                status: 409,
                code: 'RELAY_OFF',
            });
        } finally {
            process.env = saved;
        }
    });

    it('serves several chains from SHELTER_RELAY_CHAINS, each with its own key, router and daily budget', async () => {
        const saved = { ...process.env };
        const BASE_HOT = Wallet.createRandom();
        const BASE_ROUTER = '0x5555555555555555555555555555555555555555';
        try {
            process.env.SHELTER_CHAIN_ID = '5042';
            process.env.SHELTER_HANDED_OVER = 'false';
            process.env.SHELTER_RELAY_ENABLED = 'false';
            process.env.SHELTER_RELAY_CHAINS = '84532,421614';
            process.env.SHELTER_CHAIN_84532_ROUTER_ADDRESS = BASE_ROUTER;
            process.env.SHELTER_CHAIN_84532_SPLIT_ADDRESS = SPLIT;
            process.env.SHELTER_CHAIN_84532_KEY_ENV = 'SPEC_BASE_HOT_KEY';
            process.env.SPEC_BASE_HOT_KEY = BASE_HOT.privateKey;
            process.env.SHELTER_CHAIN_84532_RELAY_ENABLED = 'true';
            process.env.SHELTER_CHAIN_84532_RELAY_DAILY_TX = '1';
            const ctx = setup();
            await expect(ctx.service.relay(body({ chainId: 84532 }), undefined, NOW)).resolves.toMatchObject({
                status: 'submitted',
            });
            const [to, , , opts] = ctx.chain.sendContractCall.mock.calls[0];
            expect(to.toLowerCase()).toBe(BASE_ROUTER);
            expect(opts.config).toMatchObject({ chainId: 84532, privateKey: BASE_HOT.privateKey });
            expect(ctx.relays.rows[0]).toMatchObject({ chainId: 84532, status: 'submitted' });
            // The simulation runs as that chain's own hot wallet.
            expect(ctx.chain.ethCall).toHaveBeenCalledWith(
                expect.objectContaining({ chainId: 84532 }),
                expect.any(String),
                expect.any(String),
                BASE_HOT.address.toLowerCase()
            );
            // Its daily budget is its own (1 here).
            await expect(refusal(ctx.service.relay(body({ chainId: 84532 }), undefined, NOW))).resolves.toEqual({
                status: 429,
                code: 'RELAY_DAILY_CAP',
            });
            expect(ctx.counters.rows.map((r: any) => r.key)).toContain('relay:84532:2026-10-04');
            // Listed but not enabled, and not listed at all: the relay is off there (the donor self-submits).
            for (const chainId of [421614, 43113, 5042]) {
                await expect(refusal(ctx.service.relay(body({ chainId }), undefined, NOW))).resolves.toEqual({
                    status: 409,
                    code: 'RELAY_OFF',
                });
            }
            expect(ctx.chain.sendContractCall).toHaveBeenCalledTimes(1);
        } finally {
            process.env = saved;
        }
    });

    it('accepts a validAfter up to 5 s ahead of the server clock', async () => {
        const ctx = setup();
        await expect(
            ctx.service.relay(body({ validAfter: String(NOW_S + 5) }), undefined, NOW, config())
        ).resolves.toMatchObject({ status: 'submitted' });
    });

    it('relays on mainnet only once handed over and verified on chain, and on a testnet whenever enabled', async () => {
        const verified = jest.fn(async () => true);
        const ctx = setup({ publicGivingVerified: verified });
        const mainnet = config({ chainId: 5042, handedOver: true });
        await expect(ctx.service.relay(body({ chainId: 5042 }), undefined, NOW, mainnet)).resolves.toMatchObject({
            status: 'submitted',
        });
        expect(verified).toHaveBeenCalledWith(mainnet);
        // The flag alone is not enough: the split's recipients must be rotated, shelter-held claims.
        verified.mockResolvedValueOnce(false);
        await expect(refusal(ctx.service.relay(body({ chainId: 5042 }), undefined, NOW, mainnet))).resolves.toEqual({
            status: 409,
            code: 'RELAY_AWAITING_HANDOVER',
        });
        // Without the claim service a mainnet fails closed.
        await expect(refusal(setup().service.relay(body({ chainId: 5042 }), undefined, NOW, mainnet))).resolves.toEqual(
            { status: 409, code: 'RELAY_AWAITING_HANDOVER' }
        );
        await expect(ctx.service.relay(body(), undefined, NOW, config({ handedOver: false }))).resolves.toMatchObject({
            status: 'submitted',
        });
    });

    it('refuses a replayed authorization (same salt and memo)', async () => {
        const ctx = setup();
        const b = body();
        await ctx.service.relay(b, undefined, NOW, config());
        await expect(refusal(ctx.service.relay({ ...b }, undefined, NOW, config()))).resolves.toEqual({
            status: 409,
            code: 'RELAY_REPLAY',
        });
        expect(ctx.chain.sendContractCall).toHaveBeenCalledTimes(1);
    });

    it('caps relays per signer per day and gives the global slot back', async () => {
        const ctx = setup();
        for (let i = 0; i < RELAY_PER_SIGNER_DAILY; i++) {
            await ctx.service.relay(body(), undefined, NOW, config());
        }
        await expect(refusal(ctx.service.relay(body(), undefined, NOW, config()))).resolves.toEqual({
            status: 429,
            code: 'RELAY_SIGNER_CAP',
        });
        const global = ctx.counters.rows.find(r => r.key === 'relay:5042002:2026-10-04');
        expect(global?.used).toBe(RELAY_PER_SIGNER_DAILY);
        // Another signer still gets through.
        const other = Wallet.createRandom();
        await expect(ctx.service.relay(body({ from: other.address }), undefined, NOW, config())).resolves.toMatchObject(
            {
                status: 'submitted',
            }
        );
    });

    it('stops at SHELTER_RELAY_DAILY_TX across all donors', async () => {
        const ctx = setup();
        const c = config({ relayDailyTx: 2 });
        await ctx.service.relay(body({ from: Wallet.createRandom().address }), undefined, NOW, c);
        await ctx.service.relay(body({ from: Wallet.createRandom().address }), undefined, NOW, c);
        await expect(
            refusal(ctx.service.relay(body({ from: Wallet.createRandom().address }), undefined, NOW, c))
        ).resolves.toEqual({ status: 429, code: 'RELAY_DAILY_CAP' });
    });

    it('maps a simulation revert to a 400 and gives both slots back', async () => {
        const ctx = setup();
        ctx.chain.ethCall.mockRejectedValue(callException('FiatTokenV2: invalid signature'));
        await expect(
            refusal(ctx.service.relay(body({ signature: '0x' + '22'.repeat(66) }), undefined, NOW, config()))
        ).resolves.toEqual({
            status: 400,
            code: 'RELAY_BAD_SIGNATURE',
        });
        expect(ctx.chain.sendContractCall).not.toHaveBeenCalled();
        expect(ctx.relays.rows).toHaveLength(0);
        // The simulation runs before any cap is taken: no counter row was even written.
        expect(ctx.counters.rows).toHaveLength(0);

        ctx.chain.ethCall.mockRejectedValue(callException('ERC20: transfer amount exceeds balance'));
        await expect(refusal(ctx.service.relay(body(), undefined, NOW, config()))).resolves.toMatchObject({
            status: 400,
            code: 'RELAY_REJECTED',
        });
    });

    it('answers 409 RELAY_SPLIT_UNAVAILABLE when router.canDonate is false, before any cap or simulation', async () => {
        const ctx = setup();
        ctx.canDonate.mockResolvedValueOnce([false, BigInt(3)]);
        await expect(refusal(ctx.service.relay(body(), undefined, NOW, config()))).resolves.toEqual({
            status: 409,
            code: 'RELAY_SPLIT_UNAVAILABLE',
        });
        expect(ctx.chain.ethCall).not.toHaveBeenCalled();
        expect(ctx.counters.rows).toHaveLength(0);
    });

    it('tells the donor to sign again when the shelter list changed after signing', async () => {
        const ctx = setup();
        const data = donateRouterInterface.encodeErrorResult('RecipientsChanged', [RECIPIENTS, '0x' + 'ee'.repeat(32)]);
        ctx.chain.ethCall.mockRejectedValue(Object.assign(new Error('x'), { code: 'CALL_EXCEPTION', data }));
        await expect(refusal(ctx.service.relay(body(), undefined, NOW, config()))).resolves.toEqual({
            status: 409,
            code: 'RELAY_RECIPIENTS_CHANGED',
        });
        expect(ctx.chain.sendContractCall).not.toHaveBeenCalled();
        expect(ctx.counters.rows.every(r => r.used === 0)).toBe(true);
    });

    it('reads the message of a require() revert that ethers names Error', async () => {
        const ctx = setup();
        ctx.chain.ethCall.mockRejectedValue(
            Object.assign(new Error('x'), {
                code: 'CALL_EXCEPTION',
                reason: 'FiatTokenV2: invalid signature',
                revert: { name: 'Error', args: ['FiatTokenV2: invalid signature'] },
            })
        );
        await expect(
            ctx.service.relay(body({ signature: '0x' + '22'.repeat(66) }), undefined, NOW, config())
        ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RELAY_BAD_SIGNATURE' }) });
    });

    it('names the router custom error in the refusal', async () => {
        const ctx = setup();
        const data = donateRouterInterface.encodeErrorResult('TreasuryShare', [5]);
        ctx.chain.ethCall.mockRejectedValue(Object.assign(new Error('x'), { code: 'CALL_EXCEPTION', data }));
        await expect(
            ctx.service.relay(body({ signature: '0x' + '22'.repeat(66) }), undefined, NOW, config())
        ).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'RELAY_REJECTED', reason: 'TreasuryShare' }),
        });
    });

    it('falls back to the (v, r, s) overload when the bytes overload reverts', async () => {
        const ctx = setup();
        ctx.chain.ethCall
            .mockRejectedValueOnce(callException('bytes signature unsupported'))
            .mockResolvedValueOnce('0x');
        await ctx.service.relay(body(), undefined, NOW, config());
        const data: string = ctx.chain.sendContractCall.mock.calls[0][1];
        expect(data.slice(0, 10)).toBe(donateRouterInterface.getFunction('donateWithAuthorizationVRS')!.selector);
    });

    it('answers 424 and frees the nonce when the node certainly refuses the broadcast', async () => {
        const ctx = setup();
        ctx.chain.sendContractCall.mockRejectedValueOnce(
            new DonationBroadcastError(
                { hash: '0x' + 'f'.repeat(64), nonce: 1, from: 'x' },
                { code: 'INSUFFICIENT_FUNDS' }
            )
        );
        const b = body();
        await expect(refusal(ctx.service.relay(b, undefined, NOW, config()))).resolves.toEqual({
            status: 424,
            code: 'RELAY_SEND_FAILED',
        });
        expect(ctx.relays.rows).toHaveLength(0);
        // The same signature can be retried.
        await expect(ctx.service.relay(b, undefined, NOW, config())).resolves.toMatchObject({ status: 'submitted' });
    });

    it('keeps an ambiguous broadcast as submitted', async () => {
        const ctx = setup();
        const hash = '0x' + 'e'.repeat(64);
        ctx.chain.sendContractCall.mockRejectedValueOnce(
            new DonationBroadcastError({ hash, nonce: 1, from: 'x' }, { code: 'TIMEOUT' })
        );
        await expect(ctx.service.relay(body(), undefined, NOW, config())).resolves.toEqual({
            txHash: hash,
            status: 'submitted',
        });
        expect(ctx.relays.rows[0].status).toBe('submitted');
    });
});

describe('ShelterRelayService status and confirm', () => {
    it('confirms by receipt, reads the batch id from RouterDonation, and shows the match', async () => {
        const ctx = setup();
        const { txHash } = await ctx.service.relay(body(), undefined, NOW, config());
        const event = donateRouterInterface.encodeEventLog('RouterDonation', [
            DONOR.address,
            1000000,
            7,
            0,
            'tt:wallet:0a1b2c3d',
            authNonce(ROUTER, '0x' + '0'.repeat(63) + '1', 'tt:wallet:0a1b2c3d', RECIPIENTS),
        ]);
        ctx.chain.getReceipt.mockResolvedValueOnce({
            status: 1,
            blockNumber: 12,
            logs: [{ address: ROUTER, topics: event.topics, data: event.data }],
        });
        await expect(ctx.service.confirmPending(config(), NOW)).resolves.toEqual({ confirmed: 1, failed: 0 });
        ctx.matches.rows.push({ donorTxHash: txHash, status: 'sent', matchTxHash: '0x' + 'c'.repeat(64) });
        await expect(ctx.service.status(txHash)).resolves.toEqual({
            status: 'confirmed',
            batchId: '7',
            match: { status: 'sent', txHash: '0x' + 'c'.repeat(64) },
        });
    });

    it('fails a reverted relay, and 404s an unknown hash', async () => {
        const ctx = setup();
        const { txHash } = await ctx.service.relay(body(), undefined, NOW, config());
        // USDC says the nonce is unused: the donor's USDC never moved.
        ctx.chain.ethCall
            .mockResolvedValueOnce(donateRouterInterface.encodeFunctionResult('usdc', [USDC]))
            .mockResolvedValueOnce(erc20Interface.encodeFunctionResult('authorizationState', [false]));
        ctx.chain.getReceipt.mockResolvedValueOnce({ status: 0, logs: [] });
        await expect(ctx.service.confirmPending(config(), NOW)).resolves.toEqual({ confirmed: 0, failed: 1 });
        await expect(ctx.service.status(txHash)).resolves.toMatchObject({ status: 'failed' });
        await expect(ctx.service.status('0x' + '9'.repeat(64))).rejects.toThrow();
        await expect(ctx.service.status('nope')).rejects.toThrow();
    });

    it('confirms instead of failing when someone else submitted the same signature first', async () => {
        const ctx = setup();
        const b = body();
        const { txHash } = await ctx.service.relay(b, undefined, NOW, config());
        const nonce = authNonce(ROUTER, b.salt, b.memo, RECIPIENTS);
        const otherTx = '0x' + '7'.repeat(64);
        const event = donateRouterInterface.encodeEventLog('RouterDonation', [
            DONOR.address,
            1000000,
            9,
            0,
            b.memo,
            nonce,
        ]);
        ctx.chain.ethCall
            .mockResolvedValueOnce(donateRouterInterface.encodeFunctionResult('usdc', [USDC]))
            .mockResolvedValueOnce(erc20Interface.encodeFunctionResult('authorizationState', [true]));
        ctx.chain.getRouterLogsByNonce.mockResolvedValueOnce([
            { address: ROUTER, topics: event.topics, data: event.data, transactionHash: otherTx, blockNumber: '0x30' },
        ]);
        ctx.chain.getReceipt.mockResolvedValueOnce({ status: 0, blockNumber: 50, logs: [] });
        await expect(ctx.service.confirmPending(config(), NOW)).resolves.toEqual({ confirmed: 1, failed: 0 });
        const [, askedNonce, from, to] = ctx.chain.getRouterLogsByNonce.mock.calls[0] as any[];
        expect(askedNonce).toBe(nonce);
        expect(to).toBe(50);
        expect(from).toBeLessThanOrEqual(50);
        await expect(ctx.service.status(txHash)).resolves.toEqual({
            status: 'confirmed',
            batchId: '9',
            settledTxHash: otherTx,
        });
        // The match is keyed by the transaction that paid, so the donor still sees it.
        await ctx.matches.create({ donorTxHash: otherTx, status: 'confirmed', matchTxHash: '0x' + '6'.repeat(64) });
        await expect(ctx.service.status(txHash)).resolves.toMatchObject({
            settledTxHash: otherTx,
            match: { status: 'confirmed', txHash: '0x' + '6'.repeat(64) },
        });
    });

    it('fails when the nonce is used but no router gift carries it (for example a cancelled authorization)', async () => {
        const ctx = setup();
        const { txHash } = await ctx.service.relay(body(), undefined, NOW, config());
        ctx.chain.ethCall
            .mockResolvedValueOnce(donateRouterInterface.encodeFunctionResult('usdc', [USDC]))
            .mockResolvedValueOnce(erc20Interface.encodeFunctionResult('authorizationState', [true]));
        ctx.chain.getReceipt.mockResolvedValueOnce({ status: 0, blockNumber: 50, logs: [] });
        await expect(ctx.service.confirmPending(config(), NOW)).resolves.toEqual({ confirmed: 0, failed: 1 });
        await expect(ctx.service.status(txHash)).resolves.toMatchObject({ status: 'failed' });
    });

    it('leaves the row submitted when the node cannot answer the settle check', async () => {
        const ctx = setup();
        await ctx.service.relay(body(), undefined, NOW, config());
        ctx.chain.ethCall.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'NETWORK_ERROR' }));
        ctx.chain.getReceipt.mockResolvedValueOnce({ status: 0, blockNumber: 50, logs: [] });
        await expect(ctx.service.confirmPending(config(), NOW)).resolves.toEqual({ confirmed: 0, failed: 0 });
        expect(ctx.relays.rows[0].status).toBe('submitted');
    });
});
