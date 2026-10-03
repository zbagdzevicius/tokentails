import { HttpException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PLEDGE_DAILY_CAP } from 'src/shared-contracts/caps';
import { RescueGoalStatus } from 'src/shared-contracts/enums';
import { earnedTails } from 'src/user/tails-ledger';
import {
    PLEDGE_RECHECK_MS,
    PLEDGE_STEP_DEADLINE_MS,
    PLEDGE_SWEEP_GRACE_MS,
    RescueGoalPledgeStatus,
} from './rescue-goal.constants';
import { fakeEligibility, fakeRescueGoalDb, FakeRescueGoalDb } from './rescue-goal.fakes-spec';
import { DAY_MS, ENV_OPEN, seedGoal, seedUser, uuid } from './rescue-goal.helpers-spec';
import { PLEDGE_HOLDS_FIELD } from './rescue-goal.ledger';
import { RescueGoalPledgeService, SagaStep } from './rescue-goal-pledge.service';
import { RescueGoalStore } from './rescue-goal.store';

/*
 * Rescue Goal gives (plan G5 acceptance, decision #44) against the in-memory collections. The same
 * scenarios run on a real MongoDB in rescue-goal-mongo.spec.ts (opt-in).
 */

class CrashingPledgeService extends RescueGoalPledgeService {
    crashAt: SagaStep | null = null;
    protected async checkpoint(step: SagaStep) {
        if (step === this.crashAt) {
            this.crashAt = null;
            throw new Error(`simulated crash after ${step}`);
        }
    }
}

const codeOf = (error: unknown) =>
    error instanceof HttpException
        ? (error.getResponse() as { code?: string }).code ?? error.getStatus()
        : String(error);

async function outcome<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code: unknown }> {
    try {
        return { ok: true, value: await promise };
    } catch (error) {
        return { ok: false, code: codeOf(error) };
    }
}

const minutesLater = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

describe('RescueGoalPledgeService (in memory)', () => {
    let db: FakeRescueGoalDb;
    let eligibility: ReturnType<typeof fakeEligibility>;
    let service: CrashingPledgeService;

    beforeAll(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    beforeEach(() => {
        db = fakeRescueGoalDb();
        eligibility = fakeEligibility();
        service = new CrashingPledgeService(RescueGoalStore.of(db), eligibility as any);
    });

    const give = (auth: Record<string, unknown>, goal: Types.ObjectId, amount: number, pledgeId = uuid()) =>
        service.pledge(auth as any, String(goal), { amount, pledgeId }, new Date(), ENV_OPEN);

    const totalTails = () => db.users.docs.reduce((sum, user) => sum + user.tails, 0);

    describe('acceptance', () => {
        it('twenty parallel gives never overfill a goal and fill it in the same write', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 1000 });
            const players = await Promise.all(Array.from({ length: 20 }, () => seedUser(db.users, { tails: 500 })));
            const before = totalTails();

            const results = await Promise.all(players.map(player => outcome(give(player.auth, goal, 100))));

            const confirmed = results.filter(r => r.ok);
            const refused = results.filter(r => !r.ok) as { code: unknown }[];
            const row = db.goals.get(goal)!;
            expect(confirmed).toHaveLength(10);
            expect(row.raisedTails).toBe(1000);
            expect(row.pledgeCount).toBe(10);
            expect(row.status).toBe(RescueGoalStatus.FILLED);
            expect(row.filledAt).toBeInstanceOf(Date);
            expect(row.pendingTakes).toEqual([]);
            for (const r of refused) {
                expect([`GOAL_OVERFLOW`, `GOAL_NOT_OPEN`]).toContain(r.code);
            }
            // Refused players got everything back; nobody holds anything; Tails are conserved.
            expect(totalTails()).toBe(before - 1000);
            expect(db.users.docs.every(user => (user[PLEDGE_HOLDS_FIELD] || []).length === 0)).toBe(true);
            expect(db.users.docs.filter(user => user.tails === 400)).toHaveLength(10);
            expect(db.users.docs.filter(user => user.tails === 500)).toHaveLength(10);
            expect(db.pledges.docs.filter(p => p.status === RescueGoalPledgeStatus.CONFIRMED)).toHaveLength(10);
            expect(db.pledges.docs.every(p => p.settled)).toBe(true);
            expect(db.days.docs.reduce((sum, day) => sum + day.reserved, 0)).toBe(1000);
        });

        it('twenty parallel gives of mixed sizes never overfill', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 2345 });
            const players = await Promise.all(Array.from({ length: 20 }, () => seedUser(db.users)));
            const amounts = [100, 250, 1000, 75, 333, 500, 10, 900, 120, 640];
            await Promise.all(
                players.map((player, i) => outcome(give(player.auth, goal, amounts[i % amounts.length])))
            );
            const row = db.goals.get(goal)!;
            const counted = db.pledges.docs
                .filter(p => p.status === RescueGoalPledgeStatus.CONFIRMED)
                .reduce((sum, p) => sum + p.amount, 0);
            expect(row.raisedTails).toBeLessThanOrEqual(2345);
            expect(row.raisedTails).toBe(counted);
            expect(db.users.docs.reduce((sum, u) => sum + u.tailsGiven, 0)).toBe(counted);
        });

        it('the same pledge id debits once, however often it is sent', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 5000 });
            const player = await seedUser(db.users, { tails: 2000 });
            const pledgeId = uuid();

            const results = await Promise.all(
                Array.from({ length: 10 }, () => outcome(give(player.auth, goal, 300, pledgeId)))
            );

            expect(results.every(r => r.ok)).toBe(true);
            const ids = new Set(results.map(r => (r.ok ? r.value.pledge.id : null)));
            expect(ids.size).toBe(1);
            expect(db.pledges.docs).toHaveLength(1);
            expect(db.users.get(player._id)!.tails).toBe(1700);
            expect(db.users.get(player._id)!.tailsGiven).toBe(300);
            expect(db.goals.get(goal)!.raisedTails).toBe(300);

            const again = await give(player.auth, goal, 300, pledgeId);
            expect(again.replayed).toBe(true);
            expect(again.pledge.status).toBe(RescueGoalPledgeStatus.CONFIRMED);
            expect(db.users.get(player._id)!.tails).toBe(1700);

            const other = await seedGoal(db.goals);
            await expect(give(player.auth, other, 300, pledgeId)).rejects.toMatchObject({
                response: { code: 'PLEDGE_ID_REUSED' },
            });
            await expect(give(player.auth, goal, 301, pledgeId)).rejects.toMatchObject({
                response: { code: 'PLEDGE_ID_REUSED' },
            });
        });

        it('a crash after the debit is refunded by the sweeper within 10 minutes', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            service.crashAt = 'debited';

            const first = await outcome(give(player.auth, goal, 400));
            expect(first).toEqual({ ok: false, code: 'PLEDGE_INTERRUPTED' });
            expect(db.users.get(player._id)!.tails).toBe(600);
            expect(db.pledges.docs[0].status).toBe(RescueGoalPledgeStatus.PENDING);

            // Inside the request's deadline plus grace the sweeper leaves it alone.
            expect((await service.sweepOnce(new Date())).refunded).toBe(0);
            const due = (PLEDGE_STEP_DEADLINE_MS + PLEDGE_SWEEP_GRACE_MS) / 60000 + 1; // + one cron tick
            expect(due).toBeLessThanOrEqual(10);
            const swept = await service.sweepOnce(minutesLater(due));

            expect(swept.refunded).toBe(1);
            const user = db.users.get(player._id)!;
            expect(user.tails).toBe(1000);
            expect(user.tailsGiven).toBe(0);
            expect(user.monthTailsGiven).toBe(0);
            expect(user.tailsEarned).toBe(10000);
            expect(user[PLEDGE_HOLDS_FIELD]).toEqual([]);
            expect(db.days.docs[0].reserved).toBe(0);
            expect(db.goals.get(goal)!.raisedTails).toBe(0);
            expect(db.pledges.docs[0]).toMatchObject({
                status: RescueGoalPledgeStatus.REFUNDED,
                reason: 'interrupted',
                settled: true,
            });
            // The goal now refuses the swept id, so a late request could not count it.
            expect(db.goals.get(goal)!.fencedPledges.map(String)).toEqual([String(db.pledges.docs[0]._id)]);

            // Sweeping again changes nothing.
            await service.sweepOnce(minutesLater(due + 1));
            expect(db.users.get(player._id)!.tails).toBe(1000);
        });

        it('a crash after the goal counted the give rolls forward instead', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            service.crashAt = 'taken';
            expect(await outcome(give(player.auth, goal, 400))).toMatchObject({ ok: false });

            const swept = await service.sweepOnce(minutesLater(3));

            expect(swept.forwarded).toBe(1);
            const user = db.users.get(player._id)!;
            expect(user).toMatchObject({ tails: 600, tailsGiven: 400, goalsHelped: 1, monthGoalsHelped: 1 });
            expect(user[PLEDGE_HOLDS_FIELD]).toEqual([]);
            expect(db.goals.get(goal)!).toMatchObject({ raisedTails: 400, pendingTakes: [], fencedPledges: [] });
            expect(db.pledges.docs[0]).toMatchObject({ status: RescueGoalPledgeStatus.CONFIRMED, settled: true });
        });

        it('a crash after the reservation gives the day back and never touched the balance', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            service.crashAt = 'reserved';
            await outcome(give(player.auth, goal, 400));
            expect(db.days.docs[0].reserved).toBe(400);

            await service.sweepOnce(minutesLater(3));

            expect(db.days.docs[0].reserved).toBe(0);
            expect(db.users.get(player._id)!.tails).toBe(1000);
            expect(db.pledges.docs[0].status).toBe(RescueGoalPledgeStatus.REFUNDED);
        });

        it('a crash between CONFIRMED and releasing the holds is settled by the sweeper', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            let failed = false;
            db.users.beforeOp = (op, _filter, update) => {
                if (!failed && op === 'updateOne' && (update as any)?.$pull) {
                    failed = true;
                    throw new Error('connection lost');
                }
            };
            expect(await outcome(give(player.auth, goal, 400))).toEqual({ ok: false, code: 'PLEDGE_INTERRUPTED' });
            db.users.beforeOp = null;
            expect(db.pledges.docs[0]).toMatchObject({ status: RescueGoalPledgeStatus.CONFIRMED, settled: false });

            const swept = await service.sweepOnce(minutesLater(3));

            expect(swept.settled).toBe(1);
            expect(db.users.get(player._id)!).toMatchObject({ tails: 600, goalsHelped: 1, [PLEDGE_HOLDS_FIELD]: [] });
            expect(db.goals.get(goal)!.pendingTakes).toEqual([]);
            expect(db.pledges.docs[0].settled).toBe(true);
        });

        it('giving 1,000 Tails keeps rank: tailsEarned is untouched', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 5000 });
            const giver = await seedUser(db.users, { tails: 5000, tailsEarned: 5000 });
            const below = await seedUser(db.users, { tails: 4500, tailsEarned: 4500 });
            const rank = () =>
                [...db.users.docs].sort((a, b) => earnedTails(b) - earnedTails(a)).map(user => String(user._id));
            const before = rank();
            const earnedBefore = earnedTails(db.users.get(giver._id));

            await give(giver.auth, goal, 1000);

            const user = db.users.get(giver._id)!;
            expect(user.tails).toBe(4000);
            expect(user.tailsEarned).toBe(5000);
            expect(user).toMatchObject({
                tailsGiven: 1000,
                monthTailsGiven: 1000,
                goalsHelped: 1,
                monthGoalsHelped: 1,
            });
            expect(earnedTails(user)).toBe(earnedBefore);
            expect(rank()).toEqual(before);
            expect(rank()[0]).toBe(String(giver._id));
            expect(db.users.get(below._id)!.tails).toBe(4500);
        });

        it('guests get 403 before anything is read or written', async () => {
            const goal = await seedGoal(db.goals);
            const calls = () => Object.values(db).reduce((sum, c: any) => sum + (c.calls || 0), 0);
            const start = calls();
            for (const auth of [
                { _id: new Types.ObjectId(), isGuest: true },
                { isGuest: true, transient: true, firebaseUid: 'anon' },
            ]) {
                await expect(give(auth, goal, 100)).rejects.toMatchObject({
                    status: 403,
                    response: { code: 'GUEST_FORBIDDEN' },
                });
            }
            expect(calls()).toBe(start);
            expect(eligibility.savedGames).not.toHaveBeenCalled();
        });
    });

    describe('policy and limits', () => {
        it('is paused until the tailsEarned backfill is done, or when switched off', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users);
            for (const env of [{}, { TAILS_EARNED_BACKFILL_DONE: 'true', RESCUE_GOAL_PLEDGES: 'off' }]) {
                await expect(
                    service.pledge(player.auth as any, String(goal), { amount: 100, pledgeId: uuid() }, new Date(), env)
                ).rejects.toMatchObject({ status: 503, response: { code: 'PLEDGES_PAUSED' } });
            }
            expect(db.pledges.docs).toHaveLength(0);
        });

        it('needs an account at least 72 h old with 3 saved games (F7.5)', async () => {
            const goal = await seedGoal(db.goals);
            const young = await seedUser(db.users, { createdAt: new Date(Date.now() - 2 * DAY_MS) });
            const promoted = await seedUser(db.users, { promotedAt: new Date(Date.now() - DAY_MS) });
            const casual = await seedUser(db.users);
            eligibility.savedGames.mockImplementation(async (id: unknown) =>
                String(id) === String(casual._id) ? 2 : 3
            );

            await expect(give(young.auth, goal, 100)).rejects.toMatchObject({
                status: 403,
                response: { code: 'PLEDGE_NOT_ELIGIBLE', reason: 'account-too-new' },
            });
            await expect(give(promoted.auth, goal, 100)).rejects.toMatchObject({
                response: { code: 'PLEDGE_NOT_ELIGIBLE', reason: 'account-too-new' },
            });
            await expect(give(casual.auth, goal, 100)).rejects.toMatchObject({
                response: { code: 'PLEDGE_NOT_ELIGIBLE', reason: 'not-enough-games' },
            });
            expect(db.pledges.docs).toHaveLength(0);
            expect(eligibility.savedGames).toHaveBeenCalledWith(expect.anything(), 3);
        });

        it(`caps a day at ${PLEDGE_DAILY_CAP} Tails, also under parallel gives`, async () => {
            const goal = await seedGoal(db.goals, { targetTails: 100000 });
            const player = await seedUser(db.users, { tails: 50000 });

            const results = await Promise.all(Array.from({ length: 10 }, () => outcome(give(player.auth, goal, 1000))));

            expect(results.filter(r => r.ok)).toHaveLength(5);
            expect(results.filter(r => !r.ok).every(r => (r as any).code === 'PLEDGE_DAILY_CAP')).toBe(true);
            expect(db.users.get(player._id)!.tails).toBe(45000);
            expect(db.days.docs[0].reserved).toBe(PLEDGE_DAILY_CAP);
            await expect(give(player.auth, goal, 10)).rejects.toMatchObject({
                response: { code: 'PLEDGE_DAILY_CAP', daily: { left: 0 } },
            });
        });

        it('never debits below zero under parallel gives', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 100000 });
            const player = await seedUser(db.users, { tails: 1000 });

            const results = await Promise.all(Array.from({ length: 5 }, () => outcome(give(player.auth, goal, 400))));

            expect(results.filter(r => r.ok)).toHaveLength(2);
            expect(results.filter(r => !r.ok).every(r => (r as any).code === 'PLEDGE_BALANCE')).toBe(true);
            expect(db.users.get(player._id)!).toMatchObject({ tails: 200, tailsGiven: 800 });
            expect(db.days.docs[0].reserved).toBe(800);
            expect(db.goals.get(goal)!.raisedTails).toBe(800);
        });

        it('refuses a give larger than what the goal still needs, and a closed or ended goal', async () => {
            const player = await seedUser(db.users);
            const goal = await seedGoal(db.goals, { targetTails: 1000, raisedTails: 900 });
            await expect(give(player.auth, goal, 200)).rejects.toMatchObject({
                response: { code: 'GOAL_OVERFLOW', remainingTails: 100 },
            });
            const filled = await seedGoal(db.goals, { status: RescueGoalStatus.FILLED });
            await expect(give(player.auth, filled, 100)).rejects.toMatchObject({ response: { code: 'GOAL_NOT_OPEN' } });
            const ended = await seedGoal(db.goals, { endsAt: new Date(Date.now() - 1000) });
            await expect(give(player.auth, ended, 100)).rejects.toMatchObject({ response: { code: 'GOAL_NOT_OPEN' } });
            await expect(give(player.auth, new Types.ObjectId(), 100)).rejects.toMatchObject({
                status: 404,
                response: { code: 'GOAL_NOT_FOUND' },
            });
            expect(db.users.get(player._id)!.tails).toBe(10000);
        });

        it('validates the amount and the pledge id', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users);
            for (const amount of [0, 9, 5001, 12.5, NaN]) {
                await expect(give(player.auth, goal, amount)).rejects.toMatchObject({ status: 400 });
            }
            await expect(give(player.auth, goal, 100, 'not-a-uuid')).rejects.toMatchObject({ status: 400 });
        });

        it('counts a goal into goalsHelped once per player', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 5000 });
            const player = await seedUser(db.users);
            const [a, b] = await Promise.all([give(player.auth, goal, 100), give(player.auth, goal, 100)]);
            expect([a.pledge.firstForGoal, b.pledge.firstForGoal].sort()).toEqual([false, true]);
            await give(player.auth, goal, 100);
            expect(db.users.get(player._id)!).toMatchObject({ goalsHelped: 1, monthGoalsHelped: 1, tailsGiven: 300 });
            await give(player.auth, await seedGoal(db.goals), 100);
            expect(db.users.get(player._id)!.goalsHelped).toBe(2);
        });

        it('answers with the balance, the goal and the day', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 1000 });
            const player = await seedUser(db.users, { tails: 700 });
            const result = await give(player.auth, goal, 250);
            expect(result).toMatchObject({
                replayed: false,
                pledge: { amount: 250, status: 'CONFIRMED', firstForGoal: true, goal: String(goal) },
                goal: { status: 'OPEN', raisedTails: 250, remainingTails: 750 },
                balance: { tails: 450 },
                daily: { cap: PLEDGE_DAILY_CAP, used: 250, left: PLEDGE_DAILY_CAP - 250 },
            });
        });
    });

    describe('cancel refunds and rechecks', () => {
        it('a cancelled goal gives every give back exactly once', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 5000 });
            const a = await seedUser(db.users, { tails: 2000 });
            const b = await seedUser(db.users, { tails: 2000 });
            await give(a.auth, goal, 500);
            await give(a.auth, goal, 300);
            await give(b.auth, goal, 1000);
            db.goals.get(goal)!.status = RescueGoalStatus.CANCELLED;

            const [first, second] = await Promise.all([
                service.refundCancelledGoal(goal),
                service.refundCancelledGoal(goal),
            ]);
            expect(first + second).toBeGreaterThanOrEqual(3);

            for (const id of [a._id, b._id]) {
                expect(db.users.get(id)!).toMatchObject({
                    tails: 2000,
                    tailsGiven: 0,
                    monthTailsGiven: 0,
                    goalsHelped: 0,
                    monthGoalsHelped: 0,
                    tailsEarned: 10000,
                });
            }
            expect(db.pledges.docs.every(p => p.status === RescueGoalPledgeStatus.REFUNDED)).toBe(true);
            expect(db.days.docs.every(d => d.reserved === 0)).toBe(true);
            await service.refundCancelledGoal(goal);
            expect(db.users.get(a._id)!.tails).toBe(2000);
        });

        it('the sweeper re-runs cancel refunds for gives that were mid-flight', async () => {
            const goal = await seedGoal(db.goals, { targetTails: 5000 });
            const player = await seedUser(db.users, { tails: 1000 });
            service.crashAt = 'taken';
            await outcome(give(player.auth, goal, 400));
            db.goals.get(goal)!.status = RescueGoalStatus.CANCELLED;
            db.goals.get(goal)!.refundUntil = minutesLater(15);

            const swept = await service.sweepOnce(minutesLater(3));

            expect(swept.forwarded).toBe(1);
            expect(db.users.get(player._id)!).toMatchObject({ tails: 1000, tailsGiven: 0, goalsHelped: 0 });
            expect(db.pledges.docs[0]).toMatchObject({ status: 'REFUNDED', reason: 'goal-cancelled' });
        });

        it('a give its request confirmed while the sweeper looked at it keeps its daily-cap share', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            await give(player.auth, goal, 400);
            const done = db.pledges.docs[0];
            expect(done).toMatchObject({ status: RescueGoalPledgeStatus.CONFIRMED, settled: true });
            // What the sweeper read before the request's confirm and settle landed: still PENDING, and
            // the goal's pendingTakes no longer holds it by the time the sweeper looks.
            const stale = { ...done, status: RescueGoalPledgeStatus.PENDING, settled: false };

            expect(await service.recover(stale, minutesLater(3))).toBe('forwarded');

            expect(db.days.docs[0]).toMatchObject({ reserved: 400 });
            expect(db.days.docs[0].pledges.map(String)).toEqual([String(done._id)]);
            expect(db.users.get(player._id)!).toMatchObject({ tails: 600, tailsGiven: 400, goalsHelped: 1 });
            expect(db.pledges.docs[0]).toMatchObject({ status: RescueGoalPledgeStatus.CONFIRMED, settled: true });
            expect(db.pledges.docs[0].recheckAt).toBeUndefined();
            expect(db.goals.get(goal)!).toMatchObject({ raisedTails: 400, fencedPledges: [] });
            // The cap still counts it: only 4,600 more today.
            expect((await service.daily(player._id)).used).toBe(400);
        });

        it('a request refusal after the sweeper refunded the give does not undo anything twice', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            const sweeper = service;
            // Simulate the sweeper refunding the give while the request is between the debit and the take,
            // then the goal closing so the request's take is refused.
            const racing = new (class extends RescueGoalPledgeService {
                protected async checkpoint(step: SagaStep, row: any) {
                    if (step === 'debited') {
                        await db.pledges.updateOne(
                            { _id: row._id },
                            { $set: { status: RescueGoalPledgeStatus.REFUNDED, reason: 'interrupted', settled: true } }
                        );
                        await (sweeper as any).undoHolds(row, new Date());
                        await db.goals.updateOne({ _id: goal }, { $set: { status: RescueGoalStatus.FILLED } });
                    }
                }
            })(RescueGoalStore.of(db), eligibility as any);

            const result = await outcome(
                racing.pledge(player.auth as any, String(goal), { amount: 400, pledgeId: uuid() }, new Date(), ENV_OPEN)
            );

            expect(result).toEqual({ ok: false, code: 'GOAL_NOT_OPEN' });
            expect(db.pledges.docs[0]).toMatchObject({
                status: RescueGoalPledgeStatus.REFUNDED,
                reason: 'interrupted',
            });
            expect(db.users.get(player._id)!).toMatchObject({ tails: 1000, tailsGiven: 0, [PLEDGE_HOLDS_FIELD]: [] });
            expect(db.days.docs[0].reserved).toBe(0);
        });

        it('a debit that lands after the sweep is given back on the recheck', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            service.crashAt = 'inserted';
            await outcome(give(player.auth, goal, 400));
            await service.sweepOnce(minutesLater(3));
            const pledge = db.pledges.docs[0];
            expect(pledge.status).toBe('REFUNDED');

            // A write the dead request had in flight arrives late.
            const user = db.users.get(player._id)!;
            user.tails -= 400;
            user.tailsGiven += 400;
            user[PLEDGE_HOLDS_FIELD] = [pledge._id];

            const swept = await service.sweepOnce(new Date(Date.now() + 3 * 60000 + PLEDGE_RECHECK_MS + 1000));

            expect(swept.rechecked).toBe(1);
            expect(db.users.get(player._id)!).toMatchObject({ tails: 1000, tailsGiven: 0, [PLEDGE_HOLDS_FIELD]: [] });
            expect(db.pledges.docs[0].recheckAt).toBeUndefined();
            expect(db.goals.get(goal)!.fencedPledges).toEqual([]);
        });

        it('a refund after the season reset leaves the new season counter alone', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            service.crashAt = 'debited';
            await outcome(give(player.auth, goal, 400));
            // The reset cron zeroed the season counters; the give's epoch is now older.
            db.users.get(player._id)!.monthTailsGiven = 0;
            db.pledges.docs[0].counterEpoch = new Date(db.pledges.docs[0].counterEpoch.getTime() - 31 * DAY_MS);

            await service.sweepOnce(minutesLater(3));

            expect(db.users.get(player._id)!).toMatchObject({ tails: 1000, tailsGiven: 0, monthTailsGiven: 0 });
        });
    });

    describe('sweeper job', () => {
        it('runs on one instance per tick (lease)', async () => {
            const other = new RescueGoalPledgeService(RescueGoalStore.of(db), eligibility as any);
            const ran = await Promise.all([service.cron(), other.cron()]);
            expect(ran.sort()).toEqual(['lease-held', 'ran']);
        });

        it('stops with RESCUE_GOAL_SWEEPER=off', async () => {
            process.env.RESCUE_GOAL_SWEEPER = 'off';
            try {
                expect(await service.cron()).toBe('disabled');
            } finally {
                delete process.env.RESCUE_GOAL_SWEEPER;
            }
        });
    });

    describe('MONGO_TRANSACTIONS=true', () => {
        it('runs steps 2-5 inside one transaction', async () => {
            const goal = await seedGoal(db.goals);
            const player = await seedUser(db.users, { tails: 1000 });
            const session = {
                withTransaction: jest.fn(async (run: () => Promise<unknown>) => run()),
                endSession: jest.fn(),
            };
            const store = RescueGoalStore.of({ ...db, startSession: async () => session });
            const txService = new RescueGoalPledgeService(store, eligibility as any);

            const result = await txService.pledge(
                player.auth as any,
                String(goal),
                { amount: 100, pledgeId: uuid() },
                new Date(),
                { ...ENV_OPEN, MONGO_TRANSACTIONS: 'true' }
            );

            expect(session.withTransaction).toHaveBeenCalledTimes(1);
            expect(session.endSession).toHaveBeenCalledTimes(1);
            expect(result.pledge.status).toBe('CONFIRMED');
            expect(db.pledges.docs[0]).toMatchObject({ transaction: true, settled: true });
            expect(db.users.get(player._id)!).toMatchObject({ tails: 900, [PLEDGE_HOLDS_FIELD]: [] });
        });
    });
});
