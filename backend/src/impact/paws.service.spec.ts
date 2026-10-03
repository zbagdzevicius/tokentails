import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { verifyMerkleProof as clientVerify } from '../../../client/components/claims/merkle';
import { GameType } from 'src/game/game.schema';
import { DonationBroadcastError } from 'src/shelter/onchain/shelter-chain';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { hashPair, parsePawMemo, pawUserHash, verifyPawProof } from './merkle';
import { memoryModel } from './memory-model.fakes-spec';
import { readPawsConfig } from './paws.config';
import { pawProgressMessage, PawSettlementService, previousUtcDay, settlementTimeFor } from './paws.service';

/*
 * Nightly paw settlement (plan G4 "Paws", F7.5): paws only for eligible users, at most one transaction
 * per day (mock signer), idempotent reruns, proofs that verify with the client's verifier.
 */

const DAY = '2026-10-01';
const SETTLE_AT = settlementTimeFor(DAY); // 2026-10-02T00:30Z
const at = (time: string) => new Date(`${DAY}T${time}Z`);
const OLD = new Date('2026-09-01T00:00:00Z');
const SPLIT = '0x1111111111111111111111111111111111111111';
const KEY = '0x' + 'ab'.repeat(32);
const HOT = '0x3333333333333333333333333333333333333333';
beforeAll(() => Logger.overrideLogger(false));
afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

const txHash = (n: number) => '0x' + n.toString(16).padStart(64, '0');

function setup(options: { sendEnabled?: boolean; budget?: bigint; amount?: bigint } = {}) {
    const jobRuns = memoryModel();
    const paws = memoryModel({ unique: [['user', 'day']] });
    const settlements = memoryModel({ collections: { [JOB_RUNS_COLLECTION]: jobRuns } });
    const games = memoryModel();
    const users = memoryModel();
    let sent = 0;
    const chain = {
        sendDonation: jest.fn(async (_config: any, _memo: string, _value: bigint, onSigned: any) => {
            const tx = { hash: txHash(++sent), nonce: sent, from: HOT };
            await onSigned(tx);
            return tx;
        }),
        getReceipt: jest.fn(async () => null as any),
        getTransaction: jest.fn(async () => ({ hash: 'x' } as any)),
        minedNonce: jest.fn(async () => 0),
    };
    const service = new PawSettlementService(paws as any, settlements as any, games as any, users as any, chain as any);
    service.pawsConfig = () => ({
        sendEnabled: options.sendEnabled ?? true,
        dailyBudgetWei: options.budget ?? BigInt('1000000000000000000'),
        amountWei: options.amount ?? BigInt('10000000000000000'),
    });
    service.shelterConfig = () =>
        ({
            donateEnabled: true,
            x402Enabled: false,
            chainId: 5042,
            rpcUrl: 'http://rpc.test',
            splitAddress: SPLIT,
            privateKey: KEY,
            amountWei: BigInt(1),
            dailyBudgetWei: BigInt(1),
            x402PriceWei: BigInt(1),
        } as any);

    const user = (fields: Record<string, any> = {}) => {
        const doc = {
            _id: new Types.ObjectId(),
            name: 'Player',
            email: `p${users.rows.length}@example.test`,
            isGuest: false,
            emailVerifiedAt: OLD,
            createdAt: OLD,
            ...fields,
        };
        users.rows.push(doc);
        return doc;
    };
    const run = (u: { _id: Types.ObjectId }, time: string, fields: Record<string, any> = {}) =>
        games.rows.push({
            _id: new Types.ObjectId(),
            user: u._id,
            type: GameType.CATNIP_CHAOS,
            points: 10,
            createdAt: at(time),
            ...fields,
        });
    const twoRuns = (u: { _id: Types.ObjectId }) => {
        run(u, '10:00:00');
        run(u, '10:05:00');
    };
    return { service, chain, paws, settlements, games, users, jobRuns, user, run, twoRuns };
}

describe('paw eligibility (F7.5)', () => {
    it('gives paws only to registered, verified, 24 h old accounts with two spaced scoring runs', async () => {
        const t = setup();
        const eligible = t.user();
        t.twoRuns(eligible);
        const guest = t.user({ isGuest: true });
        t.twoRuns(guest);
        const unverified = t.user({ emailVerifiedAt: undefined });
        t.twoRuns(unverified);
        // 24 h old only after the settlement instant.
        const young = t.user({ createdAt: new Date(SETTLE_AT.getTime() - 23 * 60 * 60 * 1000) });
        t.twoRuns(young);
        // A promoted guest's guest days do not count.
        const promoted = t.user({ promotedAt: new Date(SETTLE_AT.getTime() - 60 * 60 * 1000) });
        t.twoRuns(promoted);
        const oneRun = t.user();
        t.run(oneRun, '10:00:00');
        const tooClose = t.user();
        t.run(tooClose, '10:00:00');
        t.run(tooClose, '10:02:59');
        const zeroPoints = t.user();
        t.run(zeroPoints, '10:00:00', { points: 0 });
        t.run(zeroPoints, '10:10:00', { points: 0 });
        const heist = t.user();
        t.run(heist, '10:00:00', { type: GameType.CATNIP_HEIST });
        t.run(heist, '10:10:00', { type: GameType.CATNIP_HEIST });
        const yesterday = t.user();
        t.games.rows.push(
            { user: yesterday._id, type: GameType.MATCH_3, points: 5, createdAt: new Date('2026-09-30T23:50:00Z') },
            { user: yesterday._id, type: GameType.MATCH_3, points: 5, createdAt: at('00:00:00') }
        );
        const deleted = t.user({ deletedAt: OLD });
        t.twoRuns(deleted);
        const merged = t.user({ mergedInto: new Types.ObjectId() });
        t.twoRuns(merged);

        const { outcome, settlement } = await t.service.settleDay(DAY, SETTLE_AT);

        expect(outcome).toBe('sent');
        expect(t.paws.rows.map(p => String(p.user))).toEqual([String(eligible._id)]);
        expect(settlement.pawCount).toBe(1);
        // Everyone with a scoring non-Heist run that day (heist and zero-point players are not candidates).
        expect(settlement.candidateCount).toBe(10);
    });

    it('leaves out transient accounts (the settlement loads the field accountFactsOf checks)', async () => {
        const t = setup();
        const transient = t.user({ transient: true });
        t.twoRuns(transient);
        const { outcome } = await t.service.settleDay(DAY, SETTLE_AT);
        expect(outcome).toBe('empty');
        expect(t.paws.rows).toHaveLength(0);
    });

    it("a late settlement judges account age at the day's 00:30, not at the late run", async () => {
        const t = setup();
        // 24 h old two days after the day, but not at its own settlement time.
        const young = t.user({ createdAt: new Date(SETTLE_AT.getTime() - 2 * 60 * 60 * 1000) });
        t.twoRuns(young);
        const late = new Date(SETTLE_AT.getTime() + 3 * 24 * 60 * 60 * 1000);
        const { outcome, settlement } = await t.service.settleDay(DAY, late);
        expect(new Date(settlement.settlementAt).toISOString()).toBe(SETTLE_AT.toISOString());
        expect(outcome).toBe('empty');
        expect(t.paws.rows).toHaveLength(0);
        // An early manual settle (before 00:30) keeps its own, earlier instant.
        const t2 = setup();
        const early = new Date(SETTLE_AT.getTime() - 10 * 60 * 1000);
        expect(new Date((await t2.service.settleDay(DAY, early)).settlement.settlementAt).toISOString()).toBe(
            early.toISOString()
        );
    });

    it('catches up a day the 00:30 run missed, once, and leaves settled and too-recent days alone', async () => {
        const t = setup();
        const player = t.user();
        t.twoRuns(player);
        // The 2026-10-01 run was missed; the next night's run (2026-10-03T00:30Z) settles 10-02 and catches up.
        const nextNight = settlementTimeFor('2026-10-02');
        process.env.IMPACT_JOBS_ENABLED = 'true';
        try {
            expect(await t.service.settlementCron(nextNight)).toBe('ran');
        } finally {
            delete process.env.IMPACT_JOBS_ENABLED;
        }
        expect(t.paws.rows.map(p => p.day)).toEqual([DAY]);
        expect(new Date(t.settlements.rows.find(r => r._id === DAY)!.settlementAt).toISOString()).toBe(
            SETTLE_AT.toISOString()
        );
        const sends = t.chain.sendDonation.mock.calls.length;
        expect(sends).toBe(1);
        // A second catch-up finds every day settled and does nothing.
        expect(await t.service.catchUp(new Date(nextNight.getTime() + 2 * 60 * 60 * 1000))).toEqual([]);
        expect(t.chain.sendDonation).toHaveBeenCalledTimes(1);

        // Within the grace hour after 00:30 the catch-up leaves yesterday to the nightly run.
        const t2 = setup();
        expect(await t2.service.catchUp(new Date(SETTLE_AT.getTime() + 10 * 60 * 1000))).not.toContain(DAY);
        expect(await t2.service.catchUp(new Date(SETTLE_AT.getTime() + 61 * 60 * 1000))).toContain(DAY);
    });

    it('settles the UTC day that ended at the 00:30 cron', () => {
        expect(previousUtcDay(SETTLE_AT)).toBe(DAY);
    });

    it('refuses a day that has not ended', async () => {
        const t = setup();
        await expect(t.service.settleDay('2026-10-02', SETTLE_AT)).rejects.toThrow('has not ended');
        await expect(t.service.settleDay('yesterday', SETTLE_AT)).rejects.toThrow('YYYY-MM-DD');
    });
});

describe('paw settlement transaction', () => {
    it('sends one donate("tt:paws:<day>:<root>") for min(budget, paws x amount), pro rata', async () => {
        const t = setup({ budget: BigInt(25), amount: BigInt(10) });
        for (let i = 0; i < 4; i++) t.twoRuns(t.user());

        const { settlement } = await t.service.settleDay(DAY, SETTLE_AT);

        expect(t.chain.sendDonation).toHaveBeenCalledTimes(1);
        const [, memo, value] = t.chain.sendDonation.mock.calls[0];
        expect(parsePawMemo(memo)).toEqual({ day: DAY, root: settlement.root });
        expect(value).toBe(BigInt(25)); // 4 x 10 = 40, capped at the budget of 25
        expect(settlement).toEqual(
            expect.objectContaining({
                status: 'sent',
                pawCount: 4,
                amountWei: '25',
                perPawWei: '6',
                budgetWei: '25',
                pawAmountWei: '10',
                txHash: txHash(1),
                memo,
            })
        );
    });

    it('is idempotent: a rerun and a second instance send nothing more and add no paw', async () => {
        const t = setup();
        for (let i = 0; i < 3; i++) t.twoRuns(t.user());

        const [a, b] = await Promise.all([t.service.settleDay(DAY, SETTLE_AT), t.service.settleDay(DAY, SETTLE_AT)]);
        const again = await t.service.settleDay(DAY, new Date(SETTLE_AT.getTime() + 60 * 60 * 1000));

        expect(t.chain.sendDonation).toHaveBeenCalledTimes(1);
        expect([a.outcome, b.outcome].sort()).toEqual(['already-settled', 'sent']);
        expect(again.outcome).toBe('already-settled');
        expect(t.paws.rows).toHaveLength(3);
        expect(t.settlements.rows).toHaveLength(1);
    });

    it('two cron instances at 00:30 run the settlement once (lease)', async () => {
        const t = setup();
        t.twoRuns(t.user());
        process.env.IMPACT_JOBS_ENABLED = 'true';
        try {
            const results = await Promise.all([
                t.service.settlementCron(SETTLE_AT),
                t.service.settlementCron(SETTLE_AT),
            ]);
            expect(results.sort()).toEqual(['lease-held', 'ran']);
        } finally {
            delete process.env.IMPACT_JOBS_ENABLED;
        }
        expect(t.chain.sendDonation).toHaveBeenCalledTimes(1);
    });

    it('builds paws and the root but sends nothing while PAWS_SETTLEMENT_ENABLED is off (the default)', async () => {
        const t = setup({ sendEnabled: false });
        t.twoRuns(t.user());

        const first = await t.service.settleDay(DAY, SETTLE_AT);
        const second = await t.service.settleDay(DAY, SETTLE_AT);

        expect(first.outcome).toBe('built');
        expect(first.settlement).toEqual(expect.objectContaining({ status: 'built', sendSkipped: 'disabled' }));
        expect(second.settlement.root).toBe(first.settlement.root);
        expect(t.chain.sendDonation).not.toHaveBeenCalled();
        expect(readPawsConfig({ PAWS_SETTLEMENT_ENABLED: 'true', JEST_WORKER_ID: '1' }).sendEnabled).toBe(false);
        expect(readPawsConfig({ PAWS_SETTLEMENT_ENABLED: 'true' }).sendEnabled).toBe(true);
        expect(readPawsConfig({}).sendEnabled).toBe(false);
    });

    it('a day with no paw is `empty` and sends nothing', async () => {
        const t = setup();
        const { outcome } = await t.service.settleDay(DAY, SETTLE_AT);
        expect(outcome).toBe('empty');
        expect(t.chain.sendDonation).not.toHaveBeenCalled();
    });

    it('a failure before signing leaves the day sendable; a refused broadcast fails it for good', async () => {
        const t = setup();
        t.twoRuns(t.user());
        t.chain.sendDonation.mockRejectedValueOnce(Object.assign(new Error('rpc down'), { code: 'NETWORK_ERROR' }));
        const first = await t.service.settleDay(DAY, SETTLE_AT);
        expect(first.outcome).toBe('send-failed');
        expect(first.settlement.status).toBe('built');

        t.chain.sendDonation.mockImplementationOnce(async (_c: any, _m: any, _v: any, onSigned: any) => {
            const tx = { hash: txHash(9), nonce: 3, from: HOT };
            await onSigned(tx);
            throw new DonationBroadcastError(tx, { code: 'INSUFFICIENT_FUNDS' });
        });
        const second = await t.service.settleDay(DAY, SETTLE_AT);
        expect(second.settlement).toEqual(expect.objectContaining({ status: 'failed', failedReason: 'send-refused' }));

        const third = await t.service.settleDay(DAY, SETTLE_AT);
        expect(third.outcome).toBe('already-settled');
        expect(t.chain.sendDonation).toHaveBeenCalledTimes(2);

        // An ADMIN retry re-opens a send that certainly did not pay, with the same root.
        const retried = await t.service.retryFailed(DAY, SETTLE_AT);
        expect(retried.outcome).toBe('sent');
        expect(retried.settlement.root).toBe(first.settlement.root);
        await expect(t.service.retryFailed(DAY, SETTLE_AT)).rejects.toThrow('certainly did not pay');
    });

    it('an unclear broadcast stays `signed` for the reconcile, which confirms or fails it by receipt', async () => {
        const t = setup();
        t.twoRuns(t.user());
        t.chain.sendDonation.mockImplementationOnce(async (_c: any, _m: any, _v: any, onSigned: any) => {
            const tx = { hash: txHash(7), nonce: 1, from: HOT };
            await onSigned(tx);
            throw new DonationBroadcastError(tx, { code: 'TIMEOUT' });
        });
        const { outcome, settlement } = await t.service.settleDay(DAY, SETTLE_AT);
        expect(outcome).toBe('send-held');
        expect(settlement.status).toBe('signed');

        expect(await t.service.reconcileOnce(SETTLE_AT)).toEqual({ confirmed: 0, failed: 0, waiting: 1 });
        t.chain.getReceipt.mockResolvedValueOnce({ status: 1, blockNumber: 99 });
        expect(await t.service.reconcileOnce(SETTLE_AT)).toEqual({ confirmed: 1, failed: 0, waiting: 0 });
        expect(t.settlements.rows[0]).toEqual(expect.objectContaining({ status: 'confirmed', blockNumber: 99 }));
    });

    it('reconcile marks a reverted settlement failed and frees a stale `sending` row', async () => {
        const t = setup();
        t.twoRuns(t.user());
        await t.service.settleDay(DAY, SETTLE_AT);
        t.chain.getReceipt.mockResolvedValueOnce({ status: 0, blockNumber: 5 });
        expect((await t.service.reconcileOnce(SETTLE_AT)).failed).toBe(1);
        expect(t.settlements.rows[0]).toEqual(expect.objectContaining({ status: 'failed', failedReason: 'reverted' }));

        t.settlements.rows.push({ _id: '2026-09-29', status: 'sending', sendingAt: new Date('2026-09-30T00:30:00Z') });
        await t.service.reconcileOnce(SETTLE_AT);
        expect(t.settlements.rows[1].status).toBe('built');
    });
});

describe('paw proofs and GET /impact/me paws', () => {
    it('every paw proof from /impact/me verifies with the client verifier against the settled root', async () => {
        const t = setup();
        const players = Array.from({ length: 7 }, () => t.user());
        players.forEach(p => t.twoRuns(p));
        const { settlement } = await t.service.settleDay(DAY, SETTLE_AT);

        for (const player of players) {
            const me = await t.service.me(player, new Date('2026-10-02T09:00:00Z'));
            const proof = me.proof!;
            expect(proof.root).toBe(settlement.root);
            expect(proof.memo).toBe(settlement.memo);
            expect(verifyPawProof(proof)).toBe(true);
            // The owner gets their salt and can check the leaf is theirs.
            expect(pawUserHash(String(player._id), proof.salt)).toBe(proof.userHash);
            await expect(
                clientVerify({ leaf: proof.leaf, proof: proof.proof, root: proof.root, hashPair })
            ).resolves.toBe(true);
            expect(me.lifetime).toBe(1);
            expect(JSON.stringify(me)).not.toContain(String(player._id));
        }
    });

    it("reports today's progress: N more runs, then earned, with the account check at tonight's settlement", async () => {
        const t = setup();
        const player = t.user();
        const now = new Date('2026-10-02T12:00:00Z');
        const before = await t.service.me(player, now);
        expect(before.today).toEqual(
            expect.objectContaining({
                day: '2026-10-02',
                qualifyingRuns: 0,
                remaining: 2,
                earned: false,
                message: "2 more runs for today's paw",
                settlesAt: '2026-10-03T00:30:00.000Z',
            })
        );
        t.games.rows.push({
            user: player._id,
            type: GameType.MATCH_3,
            points: 3,
            createdAt: new Date('2026-10-02T11:00:00Z'),
        });
        expect((await t.service.me(player, now)).today.message).toBe("1 more run for today's paw");
        t.games.rows.push({
            user: player._id,
            type: GameType.MATCH_3,
            points: 3,
            createdAt: new Date('2026-10-02T11:04:00Z'),
        });
        const after = await t.service.me(player, now);
        expect(after.today).toEqual(expect.objectContaining({ remaining: 0, earned: true }));
        expect(after.proof).toBeNull();
        expect(after.latestSettlement).toBeNull();

        const fresh = t.user({ createdAt: new Date('2026-10-02T10:00:00Z') });
        const freshMe = await t.service.me(fresh, now);
        expect(freshMe.today.eligibility.reason).toBe('account-too-new');
        expect(pawProgressMessage(0, freshMe.today.eligibility)).toBe('Paws start once your account is a day old.');
        expect(pawProgressMessage(0, { eligible: false, reason: 'email-unverified' })).toBe(
            "Verify your email to earn today's paw."
        );
    });

    it('withholds a proof when the stored leaves no longer rebuild the settled root', async () => {
        const t = setup();
        const [a, b] = [t.user(), t.user()];
        t.twoRuns(a);
        t.twoRuns(b);
        await t.service.settleDay(DAY, SETTLE_AT);
        t.paws.rows[1].leaf = '0x' + 'ee'.repeat(32);
        const fresh = new PawSettlementService(
            t.paws as any,
            t.settlements as any,
            t.games as any,
            t.users as any,
            t.chain as any
        );
        expect((await fresh.me(a, new Date('2026-10-02T09:00:00Z'))).proof).toBeNull();
    });

    it('the public summary counts settlements and paws without any user data', async () => {
        const t = setup();
        const players = [t.user(), t.user()];
        players.forEach(p => t.twoRuns(p));
        await t.service.settleDay(DAY, SETTLE_AT);
        const summary = await t.service.publicSummary();
        expect(summary).toEqual(
            expect.objectContaining({
                count: 1,
                totalPaws: 2,
                latest: expect.objectContaining({ day: DAY, pawCount: 2 }),
            })
        );
        const json = JSON.stringify(summary);
        players.forEach(p => expect(json).not.toContain(String(p._id)));
        expect(json).not.toContain('salt');
    });
});
