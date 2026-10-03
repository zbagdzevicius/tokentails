import { JsonRpcProvider, Wallet } from 'ethers';
import { Types } from 'mongoose';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { ShelterChain } from './shelter-chain';
import {
    DONATE_RECONCILE_BATCH,
    DONATE_RECONCILE_JOB,
    ShelterDonateReconcileService,
} from './shelter-donate-reconcile.service';
import { ShelterDonateService } from './shelter-donate.service';
import { readShelterConfig } from './shelter-onchain.config';
import { FAKE_KEY, fakeDayModel, fakeWallet, HOT_WALLET, SPLIT, withShelterEnv } from './shelter-onchain.fakes-spec';

// The crons are opt-in per instance (IMPACT_JOBS_ENABLED); these specs exercise them switched on.
const JOBS_ENV = process.env.IMPACT_JOBS_ENABLED;
beforeEach(() => {
    process.env.IMPACT_JOBS_ENABLED = 'true';
});
afterAll(() => {
    if (JOBS_ENV === undefined) delete process.env.IMPACT_JOBS_ENABLED;
    else process.env.IMPACT_JOBS_ENABLED = JOBS_ENV;
});

// Nothing may sign or broadcast: the provider and the wallet are mocks.
jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fakeKeccak } = require('./shelter-onchain.fakes-spec');
    return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn(), keccak256: fakeKeccak(actual.keccak256) };
});

const AMOUNT = '10000000000000000';
const DAY = '2026-10-02';
const SENT_AT = new Date('2026-10-02T12:00:00Z');
const minutes = (n: number) => new Date(SENT_AT.getTime() + n * 60 * 1000);
const tx = (c: string) => '0x' + c.repeat(64);

const sendTransaction = jest.fn();
const broadcastTransaction = jest.fn();
const getTransactionReceipt = jest.fn();
const getTransaction = jest.fn();
/** The hot wallet's mined (`latest`) nonce. The first gift of a spec signs nonce 0. */
const getTransactionCount = jest.fn();
let nonce = { next: 0 };

function enabledEnv() {
    withShelterEnv({
        SHELTER_DONATE_ENABLED: 'true',
        SHELTER_SPLIT_ADDRESS: SPLIT,
        SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY,
        SHELTER_DONATE_AMOUNT_WEI: AMOUNT,
        SHELTER_DONATE_DAILY_BUDGET_WEI: '20000000000000000', // 2 gifts a day
    });
}

function setup(clock: { now: Date } = { now: SENT_AT }) {
    const jobRuns = memoryModel();
    const donations = memoryModel({
        unique: [['user', 'day']],
        now: () => clock.now,
        collections: { [JOB_RUNS_COLLECTION]: jobRuns },
    });
    const days = fakeDayModel();
    const chain = new ShelterChain();
    const donate = new ShelterDonateService(donations as any, days as any, chain);
    const reconcile = new ShelterDonateReconcileService(donations as any, donate, chain);
    return { donations, days, donate, reconcile, clock, jobRuns };
}

/** A user who sent today's gift at SENT_AT: one SENT row holding one budget slot. */
async function sentGift(ctx: ReturnType<typeof setup>, hash = tx('c')) {
    sendTransaction.mockResolvedValueOnce({ hash });
    const userId = new Types.ObjectId().toString();
    await ctx.donate.donate(userId, 'heist', SENT_AT);
    return userId;
}

beforeEach(() => {
    jest.clearAllMocks();
    nonce = { next: 0 };
    (JsonRpcProvider as unknown as jest.Mock).mockImplementation(() => ({
        getTransactionReceipt,
        getTransaction,
        getTransactionCount,
        broadcastTransaction,
    }));
    broadcastTransaction.mockResolvedValue({});
    getTransactionCount.mockResolvedValue(0);
    (Wallet as unknown as jest.Mock).mockImplementation(() => fakeWallet(sendTransaction, nonce));
    enabledEnv();
});

afterAll(() => withShelterEnv({}));

describe('ShelterDonateReconcileService (plan F7.4)', () => {
    it('marks SENT as CONFIRMED on a success receipt and keeps the slot used', async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 77 });

        await expect(ctx.reconcile.reconcileOnce(minutes(1))).resolves.toMatchObject({ confirmed: 1, failed: 0 });
        expect(ctx.donations.rows[0]).toMatchObject({ status: 'CONFIRMED', blockNumber: 77, budgetSlot: true });
        expect(ctx.days.counts.get(DAY)).toBe(1);
        expect((await ctx.donate.status(minutes(1))).treatsLeftToday).toBe(1);
    });

    it('moves SENT to FAILED on a status-0 receipt, restores both slots, and a second run is a no-op', async () => {
        const ctx = setup();
        const userId = await sentGift(ctx);
        await sentGift(ctx, tx('d'));
        expect(ctx.days.counts.get(DAY)).toBe(2);
        getTransactionReceipt.mockImplementation(async (hash: string) => ({ status: hash === tx('c') ? 0 : 1 }));

        const first = await ctx.reconcile.reconcileOnce(minutes(1));
        expect(first).toMatchObject({ confirmed: 1, failed: 1, released: 1 });
        const reverted = ctx.donations.rows.find(r => r.txHash === tx('c'))!;
        expect(reverted).toMatchObject({ status: 'FAILED', failedReason: 'reverted', budgetSlot: false });
        expect(ctx.days.counts.get(DAY)).toBe(1);

        const snapshot = JSON.stringify(ctx.donations.rows);
        const second = await ctx.reconcile.reconcileOnce(minutes(2));
        expect(second).toEqual({ confirmed: 0, failed: 0, released: 0, skipped: 0 });
        expect(JSON.stringify(ctx.donations.rows)).toBe(snapshot);
        expect(ctx.days.counts.get(DAY)).toBe(1);

        // The user's day is free again: the same user sends today's gift, reusing the row.
        sendTransaction.mockResolvedValueOnce({ hash: tx('e') });
        await expect(ctx.donate.donate(userId, 'page', minutes(3))).resolves.toMatchObject({ txHash: tx('e') });
        const reused = ctx.donations.rows.filter(r => String(r.user) === userId);
        expect(reused).toHaveLength(1);
        expect(reused[0]).toMatchObject({ status: 'SENT', txHash: tx('e') });
        expect(reused[0].attempts).toEqual([expect.objectContaining({ txHash: tx('c'), failedReason: 'reverted' })]);
        expect(ctx.days.counts.get(DAY)).toBe(2);
    });

    it('waits 30 minutes for a missing receipt, then fails the gift once its nonce is used', async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockResolvedValue(null);
        getTransactionCount.mockResolvedValue(1); // nonce 0 mined by another transaction

        await expect(ctx.reconcile.reconcileOnce(minutes(29))).resolves.toMatchObject({ failed: 0 });
        expect(ctx.donations.rows[0].status).toBe('SENT');
        expect(getTransactionCount).not.toHaveBeenCalled();

        await expect(ctx.reconcile.reconcileOnce(minutes(31))).resolves.toMatchObject({ failed: 1, released: 1 });
        expect(getTransactionCount).toHaveBeenCalledWith(HOT_WALLET, 'latest');
        expect(ctx.donations.rows[0]).toMatchObject({ status: 'FAILED', failedReason: 'timeout' });
        expect(ctx.days.counts.get(DAY)).toBe(0);
    });

    it('keeps a gift SENT, with its slots, while its nonce is unused, even when the node forgot it', async () => {
        const ctx = setup();
        const userId = await sentGift(ctx);
        getTransactionReceipt.mockResolvedValue(null);
        // A load-balanced node that dropped the transaction from its own mempool: unknown, nonce 0 free.
        getTransaction.mockResolvedValue(null);
        getTransactionCount.mockResolvedValue(0);

        await expect(ctx.reconcile.reconcileOnce(minutes(45))).resolves.toMatchObject({ failed: 0, skipped: 1 });
        expect(ctx.donations.rows[0]).toMatchObject({ status: 'SENT', budgetSlot: true });
        expect(ctx.days.counts.get(DAY)).toBe(1);
        // The player cannot send a second gift behind it.
        await expect(ctx.donate.donate(userId, 'page', minutes(46))).rejects.toBeDefined();
        expect(sendTransaction).toHaveBeenCalledTimes(1);

        // It lands later (another node had it): CONFIRMED, one gift paid.
        getTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 90 });
        await expect(ctx.reconcile.reconcileOnce(minutes(60))).resolves.toMatchObject({ confirmed: 1 });
        expect(ctx.donations.rows[0]).toMatchObject({ status: 'CONFIRMED', blockNumber: 90 });
    });

    it('confirms instead of failing when the gift itself used the nonce between the two lookups', async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 1, blockNumber: 91 });
        getTransactionCount.mockResolvedValue(1);

        await expect(ctx.reconcile.reconcileOnce(minutes(40))).resolves.toMatchObject({ confirmed: 1, failed: 0 });
        expect(ctx.donations.rows[0]).toMatchObject({ status: 'CONFIRMED', blockNumber: 91, budgetSlot: true });
    });

    it('does not time a gift out when the nonce lookup fails', async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockResolvedValue(null);
        getTransactionCount.mockRejectedValue(Object.assign(new Error('boom'), { code: 'SERVER_ERROR' }));

        await expect(ctx.reconcile.reconcileOnce(minutes(45))).resolves.toMatchObject({ failed: 0, skipped: 1 });
        expect(ctx.donations.rows[0].status).toBe('SENT');
    });

    it('learns a legacy row nonce from the node, and keeps the row when the node does not know it', async () => {
        const ctx = setup();
        await sentGift(ctx);
        const row = ctx.donations.rows[0];
        delete row.txNonce;
        delete row.txFrom;
        getTransactionReceipt.mockResolvedValue(null);
        getTransactionCount.mockResolvedValue(5);

        getTransaction.mockResolvedValue(null);
        await expect(ctx.reconcile.reconcileOnce(minutes(40))).resolves.toMatchObject({ failed: 0, skipped: 1 });
        expect(row.status).toBe('SENT');
        expect(getTransactionCount).not.toHaveBeenCalled();

        getTransaction.mockResolvedValue({ hash: tx('c'), nonce: 4, from: HOT_WALLET });
        await expect(ctx.reconcile.reconcileOnce(minutes(41))).resolves.toMatchObject({ failed: 1, released: 1 });
        expect(row).toMatchObject({ status: 'FAILED', failedReason: 'timeout', txNonce: 4, txFrom: HOT_WALLET });
    });

    it('settles a PENDING row that has a hash (the process stopped around the broadcast)', async () => {
        const ctx = setup();
        await sentGift(ctx);
        const first = ctx.donations.rows[0];
        first.status = 'PENDING';
        delete first.sentAt;
        getTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 12 });

        await expect(ctx.reconcile.reconcileOnce(minutes(5))).resolves.toMatchObject({ confirmed: 1 });
        expect(first).toMatchObject({ status: 'CONFIRMED', blockNumber: 12, sentAt: SENT_AT });

        // Never broadcast: no receipt, and the next gift used the same nonce.
        await sentGift(ctx, tx('d'));
        const second = ctx.donations.rows[1];
        second.status = 'PENDING';
        getTransactionReceipt.mockResolvedValue(null);
        getTransactionCount.mockResolvedValue(2);
        await expect(ctx.reconcile.reconcileOnce(minutes(10))).resolves.toMatchObject({ failed: 0 });
        expect(second.status).toBe('PENDING');
        await expect(ctx.reconcile.reconcileOnce(minutes(31))).resolves.toMatchObject({ failed: 1, released: 1 });
        expect(second).toMatchObject({ status: 'FAILED', failedReason: 'timeout', budgetSlot: false });
    });

    it('visits the least recently checked rows first, so long-pending rows never starve new ones', async () => {
        const ctx = setup();
        for (let i = 0; i < DONATE_RECONCILE_BATCH; i++) {
            ctx.donations.rows.push({
                _id: new Types.ObjectId(),
                user: new Types.ObjectId(),
                day: DAY,
                source: 'page',
                memo: 'tt:page:00000000',
                amountWei: AMOUNT,
                chainId: 5042,
                status: 'SENT',
                txHash: tx('9'),
                txNonce: 0,
                txFrom: HOT_WALLET,
                budgetSlot: true,
                sentAt: SENT_AT,
                createdAt: SENT_AT,
                updatedAt: SENT_AT,
            });
        }
        getTransactionReceipt.mockImplementation(async (hash: string) =>
            hash === tx('e') ? { status: 1, blockNumber: 5 } : null
        );
        getTransactionCount.mockResolvedValue(0); // every old one still pending

        await ctx.reconcile.reconcileOnce(minutes(40));
        await sentGift(ctx, tx('e'));
        const fresh = ctx.donations.rows[ctx.donations.rows.length - 1];

        await expect(ctx.reconcile.reconcileOnce(minutes(41))).resolves.toMatchObject({ confirmed: 1 });
        expect(fresh.status).toBe('CONFIRMED');
    });

    it('never fails a gift because the RPC could not be asked', async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockRejectedValue(Object.assign(new Error('boom'), { code: 'SERVER_ERROR' }));

        await expect(ctx.reconcile.reconcileOnce(minutes(90))).resolves.toMatchObject({ failed: 0, skipped: 1 });
        expect(ctx.donations.rows[0].status).toBe('SENT');
        expect(ctx.days.counts.get(DAY)).toBe(1);
    });

    it("does not touch another day's budget when a gift fails after midnight", async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockResolvedValue({ status: 0 });

        await ctx.reconcile.reconcileOnce(new Date('2026-10-03T00:10:00Z'));
        expect(ctx.donations.rows[0]).toMatchObject({ status: 'FAILED', failedReason: 'reverted', budgetSlot: false });
        expect(ctx.days.counts.get(DAY)).toBe(1);
        expect(ctx.days.counts.get('2026-10-03')).toBeUndefined();
    });

    it('fails a PENDING row that never broadcast and gives back its slot', async () => {
        const ctx = setup();
        const user = new Types.ObjectId();
        ctx.days.rows.push({ _id: new Types.ObjectId(), day: DAY, count: 1 });
        ctx.donations.rows.push({
            _id: new Types.ObjectId(),
            user,
            day: DAY,
            source: 'page',
            memo: 'tt:page:00000000',
            amountWei: AMOUNT,
            chainId: 5042,
            status: 'PENDING',
            budgetSlot: true,
            createdAt: SENT_AT,
            updatedAt: SENT_AT,
        });

        await expect(ctx.reconcile.reconcileOnce(minutes(10))).resolves.toMatchObject({ failed: 0 });
        await expect(ctx.reconcile.reconcileOnce(minutes(31))).resolves.toMatchObject({ failed: 1, released: 1 });
        expect(ctx.donations.rows[0]).toMatchObject({
            status: 'FAILED',
            failedReason: 'stuck-pending',
            budgetSlot: false,
        });
        expect(ctx.days.counts.get(DAY)).toBe(0);
    });

    it('two instances run the reconcile once per tick', async () => {
        const ctx = setup();
        await sentGift(ctx);
        getTransactionReceipt.mockResolvedValue({ status: 1 });
        const other = new ShelterDonateReconcileService(ctx.donations as any, ctx.donate, new ShelterChain());
        const spyA = jest.spyOn(ctx.reconcile, 'reconcileOnce');
        const spyB = jest.spyOn(other, 'reconcileOnce');

        const outcomes = await Promise.all([ctx.reconcile.cron(), other.cron()]);

        expect(outcomes.sort()).toEqual(['lease-held', 'ran']);
        expect(spyA.mock.calls.length + spyB.mock.calls.length).toBe(1);
        expect(ctx.jobRuns.rows.find(r => r._id === DONATE_RECONCILE_JOB)).toMatchObject({ status: 'done' });
        expect(getTransactionReceipt).toHaveBeenCalledTimes(1);
    });

    it('skips receipts entirely without an RPC', async () => {
        const ctx = setup();
        await sentGift(ctx);
        const config = { ...readShelterConfig(), rpcUrl: null };
        await expect(ctx.reconcile.reconcileOnce(minutes(60), config)).resolves.toMatchObject({ failed: 0 });
        expect(getTransactionReceipt).not.toHaveBeenCalled();
    });
});
