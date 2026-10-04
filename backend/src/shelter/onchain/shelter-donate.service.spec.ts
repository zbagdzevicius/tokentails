import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';
import { JsonRpcProvider, Wallet } from 'ethers';
import { ShelterChain, shelterSplitInterface } from './shelter-chain';
import { explorerTxUrl } from './shelter-onchain.config';
import {
    DONATE_ALREADY_TODAY,
    DONATE_BUDGET_SPENT,
    DONATE_PAUSED,
    DONATE_SEND_FAILED,
    donationMemo,
    ShelterDonateService,
} from './shelter-donate.service';
import {
    FAKE_KEY,
    fakeDayModel,
    fakeDonationModel,
    fakeWallet,
    HOT_WALLET,
    SPLIT,
    withShelterEnv,
} from './shelter-onchain.fakes-spec';

// Nothing may sign or broadcast: the provider and the wallet are mocks. Interface stays real, so the
// calldata the wallet would send is checked for real.
jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fakeKeccak } = require('./shelter-onchain.fakes-spec');
    return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn(), keccak256: fakeKeccak(actual.keccak256) };
});

const AMOUNT = '10000000000000000'; // 0.01 USDC, 18 decimals
const TX_HASH = '0x' + 'c'.repeat(64);
const NOW = new Date('2026-10-02T12:00:00Z');

/** The fake signer (see fakeWallet) and the broadcast. */
const sendTransaction = jest.fn();
const broadcastTransaction = jest.fn();
let nonce = { next: 0 };

function enabledEnv(extra: Record<string, string> = {}) {
    withShelterEnv({
        SHELTER_DONATE_ENABLED: 'true',
        SHELTER_SPLIT_ADDRESS: SPLIT,
        SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY,
        SHELTER_DONATE_AMOUNT_WEI: AMOUNT,
        SHELTER_DONATE_DAILY_BUDGET_WEI: '1000000000000000000',
        ...extra,
    });
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

beforeEach(() => {
    jest.clearAllMocks();
    nonce = { next: 7 };
    (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => ({ broadcastTransaction }));
    broadcastTransaction.mockResolvedValue({});
    (Wallet as unknown as jest.Mock).mockImplementation(() => fakeWallet(sendTransaction, nonce));
    sendTransaction.mockResolvedValue({ hash: TX_HASH });
});

afterAll(() => withShelterEnv({}));

describe('ShelterDonateService.donate', () => {
    it('answers 409 and touches nothing when SHELTER_DONATE_ENABLED is off (the default)', async () => {
        withShelterEnv({ SHELTER_SPLIT_ADDRESS: SPLIT, SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY });
        const { service, donations } = setup();

        const error = await httpError(service.donate(user(), 'heist', NOW));

        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(409);
        expect(error.message).toBe(DONATE_PAUSED);
        expect(donations.create).not.toHaveBeenCalled();
        expect(Wallet).not.toHaveBeenCalled();
    });

    it('answers 409 while the split address is not configured (before the deploy)', async () => {
        enabledEnv({ SHELTER_SPLIT_ADDRESS: '' });
        const error = await httpError(setup().service.donate(user(), 'page', NOW));
        expect(error.getStatus()).toBe(409);
        expect(Wallet).not.toHaveBeenCalled();
    });

    it('calls ShelterSplit.donate(memo) with the configured amount and returns the receipt link', async () => {
        enabledEnv();
        const { service, donations } = setup();
        const userId = user();

        const result = await service.donate(userId, 'heist', NOW);

        expect(result).toEqual({
            txHash: TX_HASH,
            chainId: 5042,
            amountWei: AMOUNT,
            explorerUrl: `https://explorer.arc.io/tx/${TX_HASH}`,
        });
        expect(JsonRpcProvider).toHaveBeenCalledWith('https://rpc.mainnet.arc.io', 5042, {
            staticNetwork: true,
            cacheTimeout: -1,
        });
        const tx = sendTransaction.mock.calls[0][0];
        expect(tx.to).toBe(SPLIT);
        expect(tx.value.toString()).toBe(AMOUNT);
        expect(tx.chainId).toBe(5042);
        const [memo] = shelterSplitInterface.decodeFunctionData('donate', tx.data);
        expect(donations.rows[0]).toMatchObject({ memo, day: '2026-10-02', status: 'SENT', txHash: TX_HASH });
        expect(memo).not.toContain(userId);
    });

    it('uses the tt:<source>:<shortId> memo with no personal data', async () => {
        enabledEnv();
        const { service, donations } = setup();
        await service.donate(user(), 'page', NOW);

        expect(donations.rows[0].memo).toMatch(/^tt:page:[0-9a-f]{8}$/);
        expect(donationMemo('heist')).toMatch(/^tt:heist:[0-9a-f]{8}$/);
        expect(donationMemo('heist')).not.toBe(donationMemo('heist'));
    });

    it('answers 429 on a second gift the same UTC day, and allows one the next day', async () => {
        enabledEnv();
        const { service } = setup();
        const userId = user();
        await service.donate(userId, 'heist', NOW);

        const error = await httpError(service.donate(userId, 'page', new Date('2026-10-02T23:59:59Z')));
        expect(error.getStatus()).toBe(429);
        expect(error.message).toBe(DONATE_ALREADY_TODAY);
        expect(sendTransaction).toHaveBeenCalledTimes(1);

        await expect(service.donate(userId, 'heist', new Date('2026-10-03T00:00:01Z'))).resolves.toMatchObject({
            txHash: TX_HASH,
        });
    });

    it('answers 409 once the daily budget is spent, and frees the user for another day', async () => {
        enabledEnv({ SHELTER_DONATE_DAILY_BUDGET_WEI: '25000000000000000' }); // 2.5 gifts, so 2 slots
        const { service, donations } = setup();
        await service.donate(user(), 'heist', NOW);
        await service.donate(user(), 'heist', NOW);

        const late = user();
        const error = await httpError(service.donate(late, 'heist', NOW));
        expect(error.getStatus()).toBe(409);
        expect(error.message).toBe(DONATE_BUDGET_SPENT);
        expect(error.getResponse()).toMatchObject({ code: 'DONATE_BUDGET_SPENT' });
        expect(sendTransaction).toHaveBeenCalledTimes(2);
        // The late user's row is FAILED and holds no slot, so it never blocks a later try.
        expect(donations.rows.find(r => String(r.user) === late)).toMatchObject({
            status: 'FAILED',
            failedReason: 'budget-spent',
            budgetSlot: false,
        });

        const status = await service.status(NOW);
        expect(status.remainingTodayWei).toBe('0');
        expect(status.treatsLeftToday).toBe(0);
        expect(status.railState).toBe('exhausted');
    });

    it('gives back the budget slot and the daily gift when the broadcast fails', async () => {
        enabledEnv();
        const { service, days, donations } = setup();
        sendTransaction.mockRejectedValueOnce(
            Object.assign(new Error('insufficient funds'), { code: 'INSUFFICIENT_FUNDS' })
        );
        const userId = user();

        const error = await httpError(service.donate(userId, 'heist', NOW));
        expect(error.getStatus()).toBe(424);
        expect(error.message).toBe(DONATE_SEND_FAILED);
        expect(error.getResponse()).toMatchObject({ code: 'DONATE_SEND_FAILED' });
        expect(days.counts.get('2026-10-02')).toBe(0);
        expect(donations.rows).toHaveLength(1);
        expect(donations.rows[0]).toMatchObject({ status: 'FAILED', failedReason: 'send-failed', budgetSlot: false });

        // The retry reuses the row; the failed attempt is kept.
        await expect(service.donate(userId, 'heist', NOW)).resolves.toMatchObject({ txHash: TX_HASH });
        expect(donations.rows).toHaveLength(1);
        expect(donations.rows[0]).toMatchObject({ status: 'SENT', txHash: TX_HASH, budgetSlot: true });
        expect(donations.rows[0].attempts).toEqual([expect.objectContaining({ failedReason: 'send-failed' })]);
        expect(days.counts.get('2026-10-02')).toBe(1);
    });

    it('stores the hash, nonce and sender before the broadcast', async () => {
        enabledEnv();
        const { service, donations } = setup();
        let atBroadcast: any;
        broadcastTransaction.mockImplementationOnce(async () => {
            atBroadcast = { ...donations.rows[0] };
            return {};
        });

        await service.donate(user(), 'page', NOW);

        expect(atBroadcast).toMatchObject({ status: 'PENDING', txHash: TX_HASH, txNonce: 7, txFrom: HOT_WALLET });
        expect(donations.rows[0]).toMatchObject({ status: 'SENT', txHash: TX_HASH, txNonce: 7, sentAt: NOW });
    });

    it('gives the slots back when the node refuses the broadcast for certain', async () => {
        enabledEnv();
        const { service, days, donations } = setup();
        broadcastTransaction.mockRejectedValueOnce(
            Object.assign(new Error('nonce too low'), { code: 'NONCE_EXPIRED' })
        );

        const error = await httpError(service.donate(user(), 'heist', NOW));
        expect(error.message).toBe(DONATE_SEND_FAILED);
        expect(donations.rows[0]).toMatchObject({ status: 'FAILED', failedReason: 'send-failed', budgetSlot: false });
        expect(days.counts.get('2026-10-02')).toBe(0);
    });

    it('keeps an ambiguous broadcast as a gift on its way, with its slots, for the reconcile job', async () => {
        enabledEnv();
        const { service, days, donations } = setup();
        const userId = user();
        broadcastTransaction.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));

        await expect(service.donate(userId, 'heist', NOW)).resolves.toMatchObject({ txHash: TX_HASH });
        expect(donations.rows[0]).toMatchObject({ status: 'SENT', txHash: TX_HASH, txNonce: 7, budgetSlot: true });
        expect(days.counts.get('2026-10-02')).toBe(1);
        // The user cannot put a second paid gift behind it.
        expect((await httpError(service.donate(userId, 'page', NOW))).getStatus()).toBe(429);
        expect(sendTransaction).toHaveBeenCalledTimes(1);
    });

    it('carries the F5.6 code in every error body', async () => {
        withShelterEnv({});
        const paused = await httpError(setup().service.donate(user(), 'page', NOW));
        expect(paused.getResponse()).toMatchObject({ code: 'DONATE_PAUSED', message: DONATE_PAUSED });

        enabledEnv();
        const { service } = setup();
        const userId = user();
        await service.donate(userId, 'page', NOW);
        const again = await httpError(service.donate(userId, 'page', NOW));
        expect(again.getResponse()).toMatchObject({ code: 'DONATE_ALREADY_TODAY', message: DONATE_ALREADY_TODAY });
    });
});

describe('ShelterDonateService.status', () => {
    it('reports disabled with nothing remaining and no split address before the deploy', async () => {
        withShelterEnv({});
        await expect(setup().service.status(NOW)).resolves.toEqual({
            enabled: false,
            railState: 'not-deployed',
            chainId: 5042,
            amountWei: AMOUNT,
            remainingTodayWei: '0',
            dailyBudgetWei: '1000000000000000000',
            giftsPerDayCap: 100,
            treatsLeftToday: 0,
            resetsAt: '2026-10-03T00:00:00.000Z',
            communityTotalConfirmedWei: '0',
            splitAddress: null,
        });
    });

    it('reports paused when the split exists but server gifts are off', async () => {
        withShelterEnv({ SHELTER_SPLIT_ADDRESS: SPLIT });
        await expect(setup().service.status(NOW)).resolves.toMatchObject({ enabled: false, railState: 'paused' });
    });

    it('reports what is left of today in whole gifts', async () => {
        enabledEnv({ SHELTER_DONATE_DAILY_BUDGET_WEI: '35000000000000000', SHELTER_CHAIN_ID: '5042002' });
        const { service } = setup();
        await service.donate(user(), 'page', NOW);

        const status = await service.status(NOW);
        expect(status).toMatchObject({
            enabled: true,
            railState: 'live',
            chainId: 5042002,
            splitAddress: SPLIT,
            giftsPerDayCap: 3,
            treatsLeftToday: 2,
        });
        expect(status.remainingTodayWei).toBe('20000000000000000');
        expect(JsonRpcProvider).toHaveBeenCalledWith('https://rpc.testnet.arc.io', 5042002, {
            staticNetwork: true,
            cacheTimeout: -1,
        });
    });

    it('sums CONFIRMED gifts only into the community total, and caches it', async () => {
        withShelterEnv({});
        const { service, donations } = setup();
        const base = { day: '2026-10-01', source: 'page', memo: 'tt:page:1', chainId: 5042 };
        donations.rows.push(
            { _id: new Types.ObjectId(), user: new Types.ObjectId(), ...base, amountWei: AMOUNT, status: 'CONFIRMED' },
            { _id: new Types.ObjectId(), user: new Types.ObjectId(), ...base, amountWei: AMOUNT, status: 'CONFIRMED' },
            { _id: new Types.ObjectId(), user: new Types.ObjectId(), ...base, amountWei: AMOUNT, status: 'SENT' },
            { _id: new Types.ObjectId(), user: new Types.ObjectId(), ...base, amountWei: AMOUNT, status: 'FAILED' }
        );

        expect((await service.status(NOW)).communityTotalConfirmedWei).toBe('20000000000000000');
        donations.rows.push({
            _id: new Types.ObjectId(),
            user: new Types.ObjectId(),
            ...base,
            amountWei: AMOUNT,
            status: 'CONFIRMED',
        });
        expect((await service.status(new Date(NOW.getTime() + 1000))).communityTotalConfirmedWei).toBe(
            '20000000000000000'
        );
        expect((await service.status(new Date(NOW.getTime() + 6 * 60 * 1000))).communityTotalConfirmedWei).toBe(
            '30000000000000000'
        );
    });
});

describe('ShelterDonateService.me', () => {
    it("shows the caller's own treats only, with the link once sent", async () => {
        enabledEnv();
        const { service } = setup();
        const me = user();
        await service.donate(me, 'heist', NOW);
        await service.donate(user(), 'page', NOW);

        const result = await service.me(me, NOW);
        expect(result).toMatchObject({
            day: '2026-10-02',
            resetsAt: '2026-10-03T00:00:00.000Z',
            today: {
                status: 'SENT',
                source: 'heist',
                txHash: TX_HASH,
                explorerUrl: `https://explorer.arc.io/tx/${TX_HASH}`,
            },
            confirmedCount: 0,
            onTheirWayCount: 1,
            totalConfirmedWei: '0',
        });
        expect((await service.me(user(), NOW)).today).toBeNull();
    });
});

describe('explorerTxUrl', () => {
    it('links testnet gifts to the testnet explorer and mainnet gifts to the mainnet one', () => {
        expect(explorerTxUrl(TX_HASH, 5042002)).toBe(`https://explorer.testnet.arc.io/tx/${TX_HASH}`);
        expect(explorerTxUrl(TX_HASH, 5042)).toBe(`https://explorer.arc.io/tx/${TX_HASH}`);
    });
});
