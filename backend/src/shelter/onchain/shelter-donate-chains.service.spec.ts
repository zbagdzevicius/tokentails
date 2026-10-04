import { HttpException } from '@nestjs/common';
import { decodeBytes32String, Interface, JsonRpcProvider, Wallet } from 'ethers';
import { Types } from 'mongoose';
import { erc20Interface, ShelterChain, shelterSplitInterface } from './shelter-chain';
import {
    budgetDayKey,
    DONATE_ALREADY_TODAY,
    DONATE_BUDGET_SPENT,
    DONATE_CHAIN_OFF,
    DONATE_PAUSED,
    DONATE_SEND_FAILED,
    ShelterDonateService,
    treatChainConfigs,
} from './shelter-donate.service';
import {
    FAKE_KEY,
    fakeDayModel,
    fakeDonationModel,
    fakeWallet,
    SPLIT,
    withShelterEnv,
} from './shelter-onchain.fakes-spec';

// The give page's network picker (POST /shelter/donate { chainId }): token treats on SHELTER_RELAY_CHAINS
// entries. Nothing signs or broadcasts: provider and wallet are mocks; the calldata is decoded for real.
jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fakeKeccak } = require('./shelter-onchain.fakes-spec');
    return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn(), keccak256: fakeKeccak(actual.keccak256) };
});

const NOW = new Date('2026-10-02T12:00:00Z');
const DAY = '2026-10-02';
const TX_HASH = '0x' + 'c'.repeat(64);
const APPROVE_HASH = '0x' + 'a'.repeat(64);
const TOKEN = '0x4444444444444444444444444444444444444444';
const TEMPO_SPLIT = '0x5555555555555555555555555555555555555555';
const HOT_KEY_2 = '0x' + 'cd'.repeat(32);
const ARC_AMOUNT = '10000000000000000'; // 0.01 USDC, 18 decimals

const sendTransaction = jest.fn();
const broadcastTransaction = jest.fn();
const call = jest.fn();
const waitForTransaction = jest.fn();
let allowance = BigInt(0);
let nonce = { next: 0 };
const providerArgs: any[][] = [];

const CHAIN_KEYS: string[] = [];

/** Main chain Arc testnet (native treat) plus token treats on Base Sepolia and Tempo testnet. */
function chainsEnv(extra: Record<string, string> = {}) {
    const values: Record<string, string> = {
        SHELTER_DONATE_ENABLED: 'true',
        SHELTER_CHAIN_ID: '5042002',
        SHELTER_SPLIT_ADDRESS: SPLIT,
        SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY,
        SHELTER_DONATE_AMOUNT_WEI: ARC_AMOUNT,
        SHELTER_RELAY_CHAINS: '84532,42431,421614',
        SHELTER_DONATEHOT_KEY: HOT_KEY_2,
        SHELTER_CHAIN_84532_SPLIT_ADDRESS: SPLIT,
        SHELTER_CHAIN_84532_KEY_ENV: 'SHELTER_DONATEHOT_KEY',
        SHELTER_CHAIN_84532_TREAT_ENABLED: 'true',
        SHELTER_CHAIN_84532_TREAT_AMOUNT: '0.01',
        SHELTER_CHAIN_84532_TREAT_DAILY_BUDGET: '0.02',
        SHELTER_CHAIN_42431_SPLIT_ADDRESS: TEMPO_SPLIT,
        SHELTER_CHAIN_42431_KEY_ENV: 'SHELTER_DONATEHOT_KEY',
        SHELTER_CHAIN_42431_TREAT_ENABLED: 'true',
        // 421614 is listed for the relay but its treat flag is off: never on the give page.
        SHELTER_CHAIN_421614_SPLIT_ADDRESS: SPLIT,
        SHELTER_CHAIN_421614_KEY_ENV: 'SHELTER_DONATEHOT_KEY',
        ...extra,
    };
    withShelterEnv(values);
    for (const key of CHAIN_KEYS.splice(0)) {
        delete process.env[key];
    }
    for (const [key, value] of Object.entries(values)) {
        if (key.startsWith('SHELTER_CHAIN_') || key === 'SHELTER_RELAY_CHAINS' || key === 'SHELTER_DONATEHOT_KEY') {
            process.env[key] = value;
            CHAIN_KEYS.push(key);
        }
    }
}

function clearChainEnv() {
    for (const key of CHAIN_KEYS.splice(0)) {
        delete process.env[key];
    }
    withShelterEnv({});
}

function setup() {
    const donations = fakeDonationModel();
    const days = fakeDayModel();
    const service = new ShelterDonateService(donations as any, days as any, new ShelterChain());
    return { service, donations, days };
}

async function httpError(promise: Promise<unknown>): Promise<HttpException> {
    try {
        await promise;
    } catch (error) {
        return error as HttpException;
    }
    throw new Error('expected an HttpException');
}

const user = () => new Types.ObjectId().toString();

/** eth_call: ShelterSplit.token() and token.allowance(). */
function answerCall({ to, data }: { to: string; data: string }) {
    if (data.startsWith(shelterSplitInterface.getFunction('token')!.selector)) {
        return shelterSplitInterface.encodeFunctionResult('token', [TOKEN]);
    }
    if (data.startsWith(erc20Interface.getFunction('allowance')!.selector)) {
        expect(to.toLowerCase()).toBe(TOKEN);
        return erc20Interface.encodeFunctionResult('allowance', [allowance]);
    }
    throw new Error(`unexpected call ${data.slice(0, 10)}`);
}

beforeEach(() => {
    jest.clearAllMocks();
    providerArgs.length = 0;
    nonce = { next: 3 };
    allowance = BigInt(0);
    (JsonRpcProvider as unknown as jest.Mock).mockImplementation((...args: any[]) => {
        providerArgs.push(args);
        return { broadcastTransaction, call, waitForTransaction };
    });
    broadcastTransaction.mockResolvedValue({});
    call.mockImplementation(async (tx: any) => answerCall(tx));
    waitForTransaction.mockResolvedValue({ status: 1 });
    (Wallet as unknown as jest.Mock).mockImplementation(() => fakeWallet(sendTransaction, nonce));
    // The approve (to the token) gets its own hash; the treat gets TX_HASH.
    sendTransaction.mockImplementation(async (tx: any) => ({
        hash: String(tx.to).toLowerCase() === TOKEN ? APPROVE_HASH : TX_HASH,
    }));
});

afterAll(() => clearChainEnv());

describe('treat networks: GET /shelter/donate/status', () => {
    it('lists the main chain first, then each chain with its treat flag on, with its own coin and budget', async () => {
        chainsEnv();
        const status = await setup().service.status(NOW);

        expect(status.chainId).toBe(5042002);
        expect(status.chains.map(c => c.chainId)).toEqual([5042002, 84532, 42431]);
        expect(status.chains[0]).toMatchObject({
            main: true,
            testnet: true,
            enabled: true,
            railState: 'live',
            coin: 'USDC',
            amountWei: ARC_AMOUNT,
            explorer: 'https://explorer.testnet.arc.io',
        });
        expect(status.chains[1]).toMatchObject({
            chainId: 84532,
            main: false,
            enabled: true,
            railState: 'live',
            coin: 'USDC',
            // 0.01 USDC in 18 decimals, like the main chain, so the client and the totals use one unit.
            amountWei: '10000000000000000',
            dailyBudgetWei: '20000000000000000',
            giftsPerDayCap: 2,
            treatsLeftToday: 2,
            explorer: 'https://sepolia.basescan.org',
        });
        expect(status.chains[2]).toMatchObject({
            chainId: 42431,
            coin: 'pathUSD',
            giftsPerDayCap: 100,
            explorer: 'https://explore.testnet.tempo.xyz',
        });
    });

    it('shows a chain with its flag on but no key as paused, and names mainnet coins (USDC.e, USDG)', async () => {
        chainsEnv({
            SHELTER_CHAIN_ID: '5042',
            SHELTER_RELAY_CHAINS: '4217,4663,8453',
            SHELTER_CHAIN_4217_SPLIT_ADDRESS: TEMPO_SPLIT,
            SHELTER_CHAIN_4217_TREAT_ENABLED: 'true',
            SHELTER_CHAIN_4663_SPLIT_ADDRESS: SPLIT,
            SHELTER_CHAIN_4663_TREAT_ENABLED: 'true',
            SHELTER_CHAIN_8453_TREAT_ENABLED: 'true',
        });
        const { chains } = await setup().service.status(NOW);
        expect(chains.map(c => [c.chainId, c.coin, c.railState, c.enabled])).toEqual([
            [5042, 'USDC', 'live', true],
            [4217, 'USDC.e', 'paused', false],
            [4663, 'USDG', 'paused', false],
            [8453, 'USDC', 'not-deployed', false],
        ]);
    });

    it('lists only the main chain when SHELTER_RELAY_CHAINS has no treat flag (production today)', async () => {
        chainsEnv({
            SHELTER_CHAIN_84532_TREAT_ENABLED: '',
            SHELTER_CHAIN_42431_TREAT_ENABLED: 'false',
        });
        const status = await setup().service.status(NOW);
        expect(status.chains.map(c => c.chainId)).toEqual([5042002]);
        expect(treatChainConfigs()).toEqual([]);
    });
});

describe('treat networks: POST /shelter/donate { chainId }', () => {
    it('keeps the main chain native donate(memo) when no chain is named, or the main chain is named', async () => {
        chainsEnv();
        const { service, donations } = setup();
        await service.donate(user(), 'heist', NOW);
        await service.donate(user(), 'heist', NOW, 5042002);

        for (const [tx] of sendTransaction.mock.calls) {
            expect(tx.to).toBe(SPLIT);
            expect(tx.chainId).toBe(5042002);
            expect(tx.value.toString()).toBe(ARC_AMOUNT);
            expect(shelterSplitInterface.parseTransaction({ data: tx.data })!.name).toBe('donate');
        }
        expect(call).not.toHaveBeenCalled();
        expect(donations.rows.every(r => r.chainId === 5042002 && r.tokenAmount === undefined)).toBe(true);
    });

    it('refuses a chain that sends no treats with 409, before anything is written or signed', async () => {
        chainsEnv();
        const { service, donations } = setup();
        for (const chainId of [421614, 8453, 999]) {
            const error = await httpError(service.donate(user(), 'heist', NOW, chainId));
            expect(error.getStatus()).toBe(409);
            expect(error.message).toBe(DONATE_CHAIN_OFF);
            expect(error.getResponse()).toMatchObject({ code: 'DONATE_PAUSED' });
        }
        expect(donations.create).not.toHaveBeenCalled();
        expect(Wallet).not.toHaveBeenCalled();
    });

    it('answers 409 paused for a listed chain that is not ready (no key)', async () => {
        chainsEnv({ SHELTER_CHAIN_84532_KEY_ENV: '' });
        const error = await httpError(setup().service.donate(user(), 'page', NOW, 84532));
        expect(error.getStatus()).toBe(409);
        expect(error.message).toBe(DONATE_PAUSED);
    });

    it('approves the split once, then pays ShelterSplit.disburse(amount, memo) on Base Sepolia', async () => {
        chainsEnv();
        const { service, donations, days } = setup();
        const userId = user();

        const result = await service.donate(userId, 'heist', NOW, 84532);

        expect(result).toEqual({
            txHash: TX_HASH,
            chainId: 84532,
            amountWei: '10000000000000000',
            explorerUrl: `https://sepolia.basescan.org/tx/${TX_HASH}`,
            coin: 'USDC',
        });
        expect(providerArgs[0]).toEqual(['https://sepolia.base.org', 84532, { staticNetwork: true, cacheTimeout: -1 }]);
        const [approve, treat] = sendTransaction.mock.calls.map(c => c[0]);
        expect(approve.to.toLowerCase()).toBe(TOKEN);
        const [spender, approved] = erc20Interface.decodeFunctionData('approve', approve.data);
        expect(spender.toLowerCase()).toBe(SPLIT);
        // The chain's daily budget (0.02), so the next treat needs no approve.
        expect(approved.toString()).toBe('20000');
        expect(waitForTransaction).toHaveBeenCalledWith(APPROVE_HASH, 1, 60000);

        expect(treat.to.toLowerCase()).toBe(SPLIT);
        expect(treat.chainId).toBe(84532);
        expect(treat.value.toString()).toBe('0');
        const [amount, memo] = shelterSplitInterface.decodeFunctionData('disburse', treat.data);
        expect(amount.toString()).toBe('10000');
        expect(memo).toMatch(/^tt:heist:[0-9a-f]{8}$/);
        expect(memo).not.toContain(userId);

        expect(donations.rows[0]).toMatchObject({
            chainId: 84532,
            amountWei: '10000000000000000',
            tokenAmount: '10000',
            memo,
            status: 'SENT',
            txHash: TX_HASH,
        });
        // Base Sepolia's own budget; the main chain's budget is untouched.
        expect(days.counts.get(`${DAY}@84532`)).toBe(1);
        expect(days.counts.get(DAY)).toBeUndefined();
    });

    it('skips the approve when the allowance covers the treat', async () => {
        chainsEnv();
        allowance = BigInt(10000);
        await setup().service.donate(user(), 'page', NOW, 84532);
        expect(sendTransaction).toHaveBeenCalledTimes(1);
        expect(waitForTransaction).not.toHaveBeenCalled();
    });

    it('pays Tempo through disburseWithMemo with the same memo as a bytes32, no personal data', async () => {
        chainsEnv();
        const { service, donations } = setup();
        const userId = user();

        const result = await service.donate(userId, 'heist', NOW, 42431);

        expect(result).toMatchObject({ chainId: 42431, coin: 'pathUSD' });
        const treat = sendTransaction.mock.calls[sendTransaction.mock.calls.length - 1][0];
        expect(treat.to.toLowerCase()).toBe(TEMPO_SPLIT);
        expect(treat.value.toString()).toBe('0');
        const [amount, memo32] = shelterSplitInterface.decodeFunctionData('disburseWithMemo', treat.data);
        expect(amount.toString()).toBe('10000');
        const memo = decodeBytes32String(memo32);
        expect(memo).toMatch(/^tt:heist:[0-9a-f]{8}$/);
        expect(memo).toBe(donations.rows[0].memo);
        expect(memo).not.toContain(userId);
        // The ABI really has the TIP-20 entry point the split exposes.
        expect(
            new Interface(['function disburseWithMemo(uint256,bytes32)']).getFunction('disburseWithMemo')!.selector
        ).toBe(shelterSplitInterface.getFunction('disburseWithMemo')!.selector);
    });

    it('allows one treat per player per UTC day across all chains', async () => {
        chainsEnv();
        const { service } = setup();
        const userId = user();
        await service.donate(userId, 'heist', NOW, 84532);

        for (const chainId of [42431, undefined]) {
            const error = await httpError(service.donate(userId, 'heist', NOW, chainId));
            expect(error.getStatus()).toBe(429);
            expect(error.message).toBe(DONATE_ALREADY_TODAY);
        }
        await expect(service.donate(userId, 'heist', new Date('2026-10-03T00:00:01Z'), 42431)).resolves.toMatchObject({
            chainId: 42431,
        });
    });

    it('keeps a budget per chain: a spent Base Sepolia budget leaves Tempo and the main chain open', async () => {
        chainsEnv();
        const { service } = setup();
        await service.donate(user(), 'heist', NOW, 84532);
        await service.donate(user(), 'heist', NOW, 84532);

        const error = await httpError(service.donate(user(), 'heist', NOW, 84532));
        expect(error.getStatus()).toBe(409);
        expect(error.message).toBe(DONATE_BUDGET_SPENT);

        const status = await service.status(NOW);
        expect(status.chains.find(c => c.chainId === 84532)).toMatchObject({
            railState: 'exhausted',
            treatsLeftToday: 0,
        });
        expect(status.chains.find(c => c.chainId === 42431)).toMatchObject({ railState: 'live', treatsLeftToday: 100 });
        expect(status).toMatchObject({ railState: 'live', treatsLeftToday: 100 });
        await expect(service.donate(user(), 'heist', NOW, 42431)).resolves.toMatchObject({ chainId: 42431 });
        await expect(service.donate(user(), 'heist', NOW)).resolves.toMatchObject({ chainId: 5042002 });
    });

    it('gives the slot back to that chain and frees the player when the approve or the send fails', async () => {
        chainsEnv();
        const { service, days, donations } = setup();
        waitForTransaction.mockResolvedValueOnce({ status: 0 });
        const userId = user();

        const error = await httpError(service.donate(userId, 'heist', NOW, 84532));
        expect(error.getStatus()).toBe(424);
        expect(error.message).toBe(DONATE_SEND_FAILED);
        expect(donations.rows[0]).toMatchObject({ status: 'FAILED', failedReason: 'send-failed', budgetSlot: false });
        expect(days.counts.get(`${DAY}@84532`)).toBe(0);
        // Only the approve was signed: no treat hash is stored for a reverted approve.
        expect(donations.rows[0].txHash).toBeUndefined();

        broadcastTransaction.mockRejectedValueOnce(Object.assign(new Error('nonce'), { code: 'NONCE_EXPIRED' }));
        allowance = BigInt(10000);
        const again = await httpError(service.donate(userId, 'heist', NOW, 84532));
        expect(again.getStatus()).toBe(424);
        expect(days.counts.get(`${DAY}@84532`)).toBe(0);

        await expect(service.donate(userId, 'heist', NOW, 84532)).resolves.toMatchObject({ txHash: TX_HASH });
        expect(days.counts.get(`${DAY}@84532`)).toBe(1);
    });

    it('never keeps an approve hash as the treat when the approve broadcast is ambiguous', async () => {
        chainsEnv();
        const { service, donations } = setup();
        broadcastTransaction.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
        const error = await httpError(service.donate(user(), 'heist', NOW, 84532));
        expect(error.getStatus()).toBe(424);
        expect(donations.rows[0]).toMatchObject({ status: 'FAILED', budgetSlot: false });
        expect(donations.rows[0].txHash).toBeUndefined();
    });
});

describe('budgetDayKey', () => {
    it('keeps the bare day on the main chain (and on legacy rows with no chain)', () => {
        expect(budgetDayKey(DAY, 5042, 5042)).toBe(DAY);
        expect(budgetDayKey(DAY, undefined, 5042)).toBe(DAY);
        expect(budgetDayKey(DAY, 4217, 5042)).toBe(`${DAY}@4217`);
    });
});
