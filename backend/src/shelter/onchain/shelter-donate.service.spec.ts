import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { JsonRpcProvider, Wallet } from 'ethers';
import { ShelterChain, shelterSplitInterface } from './shelter-chain';
import {
    DONATE_ALREADY_TODAY,
    DONATE_BUDGET_SPENT,
    DONATE_PAUSED,
    DONATE_SEND_FAILED,
    donationMemo,
    ShelterDonateService,
} from './shelter-donate.service';
import { FAKE_KEY, fakeDayModel, fakeDonationModel, SPLIT, withShelterEnv } from './shelter-onchain.fakes-spec';

// Nothing may sign or broadcast: the provider and the wallet are mocks. Interface stays real, so the
// calldata the wallet would send is checked for real.
jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn() };
});

const AMOUNT = '10000000000000000'; // 0.01 USDC, 18 decimals
const TX_HASH = '0x' + 'c'.repeat(64);
const NOW = new Date('2026-10-02T12:00:00Z');

const sendTransaction = jest.fn();

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
    (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => ({}));
    (Wallet as unknown as jest.Mock).mockImplementation(() => ({ sendTransaction }));
    sendTransaction.mockResolvedValue({ hash: TX_HASH });
});

afterAll(() => withShelterEnv({}));

describe('ShelterDonateService.donate', () => {
    it('answers 503 and touches nothing when SHELTER_DONATE_ENABLED is off (the default)', async () => {
        withShelterEnv({ SHELTER_SPLIT_ADDRESS: SPLIT, SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY });
        const { service, donations } = setup();

        const error = await httpError(service.donate(user(), 'heist', NOW));

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect(error.getStatus()).toBe(503);
        expect(error.message).toBe(DONATE_PAUSED);
        expect(donations.create).not.toHaveBeenCalled();
        expect(Wallet).not.toHaveBeenCalled();
    });

    it('answers 503 while the split address is not configured (before the deploy)', async () => {
        enabledEnv({ SHELTER_SPLIT_ADDRESS: '' });
        const error = await httpError(setup().service.donate(user(), 'page', NOW));
        expect(error.getStatus()).toBe(503);
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
        expect(JsonRpcProvider).toHaveBeenCalledWith('https://rpc.mainnet.arc.io', 5042, { staticNetwork: true });
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

    it('answers 503 once the daily budget is spent, and frees the user for another day', async () => {
        enabledEnv({ SHELTER_DONATE_DAILY_BUDGET_WEI: '25000000000000000' }); // 2.5 gifts, so 2 slots
        const { service, donations } = setup();
        await service.donate(user(), 'heist', NOW);
        await service.donate(user(), 'heist', NOW);

        const late = user();
        const error = await httpError(service.donate(late, 'heist', NOW));
        expect(error.getStatus()).toBe(503);
        expect(error.message).toBe(DONATE_BUDGET_SPENT);
        expect(sendTransaction).toHaveBeenCalledTimes(2);
        expect(donations.rows.some(r => String(r.user) === late)).toBe(false);

        const status = await service.status(NOW);
        expect(status.remainingTodayWei).toBe('0');
    });

    it('gives back the budget slot and the daily gift when the broadcast fails', async () => {
        enabledEnv();
        const { service, days, donations } = setup();
        sendTransaction.mockRejectedValueOnce(
            Object.assign(new Error('insufficient funds'), { code: 'INSUFFICIENT_FUNDS' })
        );
        const userId = user();

        const error = await httpError(service.donate(userId, 'heist', NOW));
        expect(error.getStatus()).toBe(503);
        expect(error.message).toBe(DONATE_SEND_FAILED);
        expect(days.counts.get('2026-10-02')).toBe(0);
        expect(donations.rows).toHaveLength(0);

        await expect(service.donate(userId, 'heist', NOW)).resolves.toMatchObject({ txHash: TX_HASH });
    });
});

describe('ShelterDonateService.status', () => {
    it('reports disabled with nothing remaining and no split address before the deploy', async () => {
        withShelterEnv({});
        await expect(setup().service.status(NOW)).resolves.toEqual({
            enabled: false,
            chainId: 5042,
            amountWei: AMOUNT,
            remainingTodayWei: '0',
            splitAddress: null,
        });
    });

    it('reports what is left of today in whole gifts', async () => {
        enabledEnv({ SHELTER_DONATE_DAILY_BUDGET_WEI: '35000000000000000', SHELTER_CHAIN_ID: '5042002' });
        const { service } = setup();
        await service.donate(user(), 'page', NOW);

        const status = await service.status(NOW);
        expect(status).toMatchObject({ enabled: true, chainId: 5042002, splitAddress: SPLIT });
        expect(status.remainingTodayWei).toBe('20000000000000000');
        expect(JsonRpcProvider).toHaveBeenCalledWith('https://rpc.testnet.arc.io', 5042002, { staticNetwork: true });
    });
});
