import { BadRequestException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { IAuthUser, isGuestUser } from 'src/common/decorators/auth-user.decorator';
import { guestForbidden } from 'src/common/guards/auth-errors';
import { accountFactsOf, EligibilityResult, PLEDGE_MIN_GAMES, rescueGoalPledgePolicy } from 'src/impact/eligibility';
import { ImpactEligibilityService } from 'src/impact/eligibility.service';
import { runLeased } from 'src/shared/jobs/lease';
import {
    GOAL_CANCEL_REFUND_WINDOW_MS,
    nextUtcMidnight,
    PLEDGE_DAILY_CAP,
    PLEDGE_FINAL_STATUSES,
    PLEDGE_MAX,
    PLEDGE_MIN,
    PLEDGE_RECHECK_MS,
    PLEDGE_STEP_DEADLINE_MS,
    PLEDGE_SWEEP_GRACE_MS,
    PLEDGE_SWEEPER_BATCH,
    PLEDGE_SWEEPER_CRON,
    PLEDGE_SWEEPER_JOB,
    PLEDGE_SWEEPER_LEASE_MS,
    pledgesOpen,
    RESCUE_GOAL_ERROR,
    rescueGoalError,
    RescueGoalErrorCode,
    RescueGoalPledgeStatus,
    RescueGoalStatus,
    sweeperEnabled,
    useTransactions,
    utcDay,
} from './rescue-goal.constants';
import {
    cancelRefundPipeline,
    debitInc,
    lastCounterReset,
    PLEDGE_CANCEL_REFUNDS_FIELD,
    PLEDGE_HOLDS_FIELD,
    refundHoldPipeline,
    sameCounterSeason,
} from './rescue-goal.ledger';
import { Doc, includesId, ISessionLike, objectIdOrNull, RescueGoalStore } from './rescue-goal.store';

/*
 * Giving Tails to a Rescue Goal (plan G5 "Rescue Goals", F7.5, decision #44).
 *
 * Order of checks: guests are refused before anything else (F5.4; AppAuthGuard already answers 403,
 * this repeats it), then the kill switch, then the give's own id (a replay answers with the stored
 * give and never debits again), then the F7.5 policy (registered, >= 72 h old, >= 3 saved games),
 * then cheap pre-checks (balance, room in the goal, the daily cap). The per-user throttle runs as a
 * guard on the route.
 *
 * The write path is a saga (no replica set is confirmed yet; the W0 audit decides). Each step is
 * one conditional single-document write that records the give's id in the document it changes, so
 * repeating a step is a no-op and the sweeper can tell exactly which steps happened:
 *
 *   1. insert the give, PENDING, unique per (user, client UUID)
 *   2. reserve the daily cap           rescuegoalpledgedays  `pledges` holds the id
 *   3. debit the balance               users                 `pledgeHolds` holds the id
 *   4. count it into the goal          rescuegoals           `pendingTakes` holds the id; a pipeline
 *                                                            update that never overfills and turns
 *                                                            the goal FILLED in the same write
 *   5. CONFIRMED, then release the holds (user hold, goal's pending take) and mark it settled
 *
 * A refusal in steps 2-4 gives back what earlier steps took and marks the give REJECTED. A crash
 * leaves it PENDING: the leased sweeper fences the goal (it refuses the id from then on), then rolls
 * forward when the goal already counted it, or refunds everything otherwise. With
 * MONGO_TRANSACTIONS=true steps 2-5 run in one transaction instead (the give itself is inserted
 * first, outside it, so a replay still finds it).
 */

export type SagaStep = 'inserted' | 'reserved' | 'debited' | 'taken' | 'confirmed';

export interface PledgeInput {
    amount: number;
    pledgeId: string;
}

export interface PledgeView {
    id: string;
    pledgeId: string;
    goal: string;
    amount: number;
    status: RescueGoalPledgeStatus;
    reason: string | null;
    firstForGoal: boolean;
    createdAt: string | null;
    confirmedAt: string | null;
    refundedAt: string | null;
}

export interface DailyView {
    cap: number;
    used: number;
    left: number;
    resetsAt: string;
}

export interface PledgeResult {
    pledge: PledgeView;
    /** True when this answer replays a give sent earlier with the same id. */
    replayed: boolean;
    goal: { id: string; status: RescueGoalStatus; raisedTails: number; targetTails: number; remainingTails: number };
    balance: { tails: number };
    daily: DailyView;
}

export interface SweepResult {
    forwarded: number;
    refunded: number;
    settled: number;
    rechecked: number;
    cancelRefunds: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const dayId = (user: unknown, day: string) => `${String(user)}:${day}`;
const helperId = (goal: unknown, user: unknown) => `${String(goal)}:${String(user)}`;

export function pledgeView(row: Doc): PledgeView {
    return {
        id: String(row._id),
        pledgeId: String(row.clientId),
        goal: String(row.goal),
        amount: num(row.amount),
        status: row.status,
        reason: row.reason || null,
        firstForGoal: !!row.firstForGoal,
        createdAt: iso(row.createdAt),
        confirmedAt: iso(row.confirmedAt),
        refundedAt: iso(row.refundedAt),
    };
}

/** A refusal raised inside the saga, after the give was inserted. */
class Refusal extends Error {
    constructor(readonly code: RescueGoalErrorCode, readonly extra: Record<string, unknown> = {}) {
        super(code);
    }
}

/** The request ran past its deadline; the sweeper owns the give from here. */
class PastDeadline extends Error {}

@Injectable()
export class RescueGoalPledgeService {
    private readonly logger = new Logger(RescueGoalPledgeService.name);

    constructor(private readonly store: RescueGoalStore, private readonly eligibility: ImpactEligibilityService) {}

    /**
     * Test seam: runs after each saga step. A spec throws here to simulate a crash at that point; in
     * production it does nothing.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async checkpoint(_step: SagaStep, _pledge: Doc): Promise<void> {
        return;
    }

    /** The F7.5 pledge policy for one account. Reads only. */
    async policy(user: IAuthUser | Doc | null | undefined, now: Date = new Date()): Promise<EligibilityResult> {
        const facts = accountFactsOf(user as Doc);
        if (facts.isGuest) {
            return rescueGoalPledgePolicy({ ...facts, savedGames: 0 }, now);
        }
        const savedGames = await this.eligibility.savedGames(user?._id, PLEDGE_MIN_GAMES);
        return rescueGoalPledgePolicy({ ...facts, savedGames }, now);
    }

    async daily(userId: unknown, now: Date = new Date()): Promise<DailyView> {
        const row = await this.store.days.findOne({ _id: dayId(userId, utcDay(now)) });
        const used = num(row?.reserved);
        return {
            cap: PLEDGE_DAILY_CAP,
            used,
            left: Math.max(0, PLEDGE_DAILY_CAP - used),
            resetsAt: nextUtcMidnight(now).toISOString(),
        };
    }

    async pledge(
        user: IAuthUser,
        goalId: string,
        input: PledgeInput,
        now: Date = new Date(),
        env: NodeJS.ProcessEnv = process.env
    ): Promise<PledgeResult> {
        if (!user || isGuestUser(user)) {
            throw guestForbidden();
        }
        if (!pledgesOpen(env)) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.PLEDGES_PAUSED);
        }
        const userId = objectIdOrNull(user._id);
        const goal = objectIdOrNull(goalId);
        if (!userId) {
            throw guestForbidden();
        }
        if (!goal) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_FOUND);
        }
        const amount = Number(input?.amount);
        const clientId = String(input?.pledgeId || '').toLowerCase();
        if (!Number.isInteger(amount) || amount < PLEDGE_MIN || amount > PLEDGE_MAX) {
            throw new BadRequestException(`Give between ${PLEDGE_MIN} and ${PLEDGE_MAX} Tails`);
        }
        if (!UUID.test(clientId)) {
            throw new BadRequestException('pledgeId must be a UUID');
        }

        const existing = await this.store.pledges.findOne({ user: userId, clientId });
        if (existing) {
            return this.replay(existing, goal, amount, now);
        }

        const goalRow = await this.store.goals.findOne({ _id: goal }, { projection: GOAL_STATE_PROJECTION });
        if (!goalRow) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_FOUND);
        }
        if (!isOpen(goalRow, now)) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_OPEN, { status: goalRow.status });
        }

        const policy = await this.policy(user, now);
        if (!policy.eligible) {
            if (policy.reason === 'guest') {
                throw guestForbidden();
            }
            throw rescueGoalError(RESCUE_GOAL_ERROR.PLEDGE_NOT_ELIGIBLE, {
                reason: policy.reason,
                eligibleAt: policy.eligibleAt ?? null,
            });
        }

        // Cheap pre-checks; the conditional writes below decide for real under concurrency.
        const account = await this.store.users.findOne({ _id: userId }, { projection: { tails: 1, deletedAt: 1 } });
        if (!account || account.deletedAt) {
            throw guestForbidden();
        }
        if (num(account.tails) < amount) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.PLEDGE_BALANCE, { tails: num(account.tails) });
        }
        const remaining = remainingOf(goalRow);
        if (amount > remaining) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_OVERFLOW, { remainingTails: remaining });
        }
        const day = await this.daily(userId, now);
        if (amount > day.left) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.PLEDGE_DAILY_CAP, { daily: day });
        }

        const transaction = useTransactions(env) && !!this.store.startSession;
        const row: Doc = {
            _id: new Types.ObjectId(),
            clientId,
            user: userId,
            goal,
            amount,
            day: utcDay(now),
            status: RescueGoalPledgeStatus.PENDING,
            counterEpoch: lastCounterReset(now),
            deadline: new Date(now.getTime() + PLEDGE_STEP_DEADLINE_MS),
            settled: false,
            transaction,
            createdAt: now,
            updatedAt: now,
        };
        try {
            await this.store.pledges.insertOne(row);
        } catch (error) {
            if ((error as { code?: number })?.code === 11000) {
                const raced = await this.store.pledges.findOne({ user: userId, clientId });
                if (raced) {
                    return this.replay(raced, goal, amount, now);
                }
            }
            throw error;
        }
        await this.checkpoint('inserted', row);

        try {
            if (transaction) {
                await this.runTransaction(row, now);
            } else {
                await this.runSaga(row, now);
            }
        } catch (error) {
            if (error instanceof Refusal) {
                await this.reject(row, error.code, now);
                throw rescueGoalError(error.code, error.extra);
            }
            if (error instanceof PastDeadline) {
                // Answer with the give as it stands (PENDING); the sweeper settles it.
                return this.result(row._id, false, now);
            }
            this.logger.error(
                `give ${String(row._id)} interrupted; the sweeper will settle it`,
                (error as Error)?.stack
            );
            throw new ServiceUnavailableException({
                statusCode: 503,
                code: 'PLEDGE_INTERRUPTED',
                pledgeId: clientId,
                message: 'Your give is being checked. Send it again with the same id to see where it stands.',
            });
        }
        return this.result(row._id, false, now);
    }

    // ---------------------------------------------------------------------------------------------
    // Saga
    // ---------------------------------------------------------------------------------------------

    private alive(row: Doc) {
        if (Date.now() >= new Date(row.deadline).getTime()) {
            throw new PastDeadline();
        }
    }

    private async runSaga(row: Doc, now: Date) {
        this.alive(row);
        if (!(await this.reserveDay(row))) {
            throw new Refusal(RESCUE_GOAL_ERROR.PLEDGE_DAILY_CAP, { daily: await this.daily(row.user, now) });
        }
        await this.checkpoint('reserved', row);

        this.alive(row);
        if (!(await this.debit(row))) {
            const account = await this.store.users.findOne({ _id: row.user }, { projection: { tails: 1 } });
            throw new Refusal(RESCUE_GOAL_ERROR.PLEDGE_BALANCE, { tails: num(account?.tails) });
        }
        await this.checkpoint('debited', row);

        this.alive(row);
        const take = await this.take(row, now);
        if (take.outcome === 'fenced') {
            throw new PastDeadline();
        }
        if (take.outcome !== 'taken') {
            throw new Refusal(
                take.outcome === 'overflow' ? RESCUE_GOAL_ERROR.GOAL_OVERFLOW : RESCUE_GOAL_ERROR.GOAL_NOT_OPEN,
                { remainingTails: take.remainingTails }
            );
        }
        await this.checkpoint('taken', row);

        await this.confirm(row, now);
        await this.checkpoint('confirmed', row);
    }

    private async runTransaction(row: Doc, now: Date) {
        const session: ISessionLike = await this.store.startSession!();
        try {
            await session.withTransaction(async () => {
                const options = { session };
                if (!(await this.reserveDay(row, options))) {
                    throw new Refusal(RESCUE_GOAL_ERROR.PLEDGE_DAILY_CAP, { daily: await this.daily(row.user, now) });
                }
                if (!(await this.debit(row, options))) {
                    throw new Refusal(RESCUE_GOAL_ERROR.PLEDGE_BALANCE);
                }
                const take = await this.take(row, now, options);
                if (take.outcome !== 'taken') {
                    throw new Refusal(
                        take.outcome === 'overflow' ? RESCUE_GOAL_ERROR.GOAL_OVERFLOW : RESCUE_GOAL_ERROR.GOAL_NOT_OPEN,
                        { remainingTails: take.remainingTails }
                    );
                }
                await this.confirm(row, now, options);
            });
        } finally {
            await session.endSession();
        }
    }

    /** Step 2. True when this give holds its part of today's cap (now or from an earlier attempt). */
    private async reserveDay(row: Doc, options: { session?: unknown } = {}): Promise<boolean> {
        const _id = dayId(row.user, row.day);
        const expiresAt = new Date(Date.parse(`${row.day}T00:00:00.000Z`) + 8 * 24 * 60 * 60 * 1000);
        await this.store.days.updateOne(
            { _id },
            { $setOnInsert: { user: row.user, day: row.day, reserved: 0, pledges: [], expiresAt } },
            { upsert: true, ...options }
        );
        const result = await this.store.days.updateOne(
            { _id, pledges: { $ne: row._id }, reserved: { $lte: PLEDGE_DAILY_CAP - row.amount } },
            { $inc: { reserved: row.amount }, $push: { pledges: row._id } },
            options
        );
        if (result.modifiedCount) {
            return true;
        }
        const current = await this.store.days.findOne({ _id }, { projection: { pledges: 1 }, ...options });
        return includesId(current?.pledges, row._id);
    }

    /** Step 3. The guarded debit; true when the balance holds this give (now or earlier). */
    private async debit(row: Doc, options: { session?: unknown } = {}): Promise<boolean> {
        const result = await this.store.users.updateOne(
            {
                _id: row.user,
                tails: { $gte: row.amount },
                [PLEDGE_HOLDS_FIELD]: { $ne: row._id },
                deletedAt: { $exists: false },
            },
            { $inc: debitInc(row.amount), $push: { [PLEDGE_HOLDS_FIELD]: row._id } },
            options
        );
        if (result.modifiedCount) {
            return true;
        }
        const current = await this.store.users.findOne(
            { _id: row.user },
            { projection: { [PLEDGE_HOLDS_FIELD]: 1 }, ...options }
        );
        return includesId(current?.[PLEDGE_HOLDS_FIELD], row._id);
    }

    /**
     * Step 4. One pipeline update: adds the give only if it fits (never overfills), turns the goal
     * FILLED in the same write when it reaches the target, and records the id in `pendingTakes`.
     */
    private async take(
        row: Doc,
        now: Date,
        options: { session?: unknown } = {}
    ): Promise<{ outcome: 'taken' | 'overflow' | 'closed' | 'fenced'; remainingTails: number }> {
        const after = { $add: ['$raisedTails', row.amount] };
        const fills = { $gte: [after, '$targetTails'] };
        const result = await this.store.goals.updateOne(
            {
                _id: row.goal,
                status: RescueGoalStatus.OPEN,
                pendingTakes: { $ne: row._id },
                fencedPledges: { $ne: row._id },
                $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
                $expr: { $lte: [after, '$targetTails'] },
            },
            [
                {
                    $set: {
                        raisedTails: after,
                        pledgeCount: { $add: [{ $ifNull: ['$pledgeCount', 0] }, 1] },
                        pendingTakes: { $concatArrays: [{ $ifNull: ['$pendingTakes', []] }, [row._id]] },
                        status: { $cond: [fills, RescueGoalStatus.FILLED, RescueGoalStatus.OPEN] },
                        filledAt: { $cond: [fills, now, '$filledAt'] },
                        updatedAt: now,
                    },
                },
            ],
            options
        );
        const goal = await this.store.goals.findOne(
            { _id: row.goal },
            { projection: GOAL_STATE_PROJECTION, ...options }
        );
        const remainingTails = goal ? remainingOf(goal) : 0;
        if (result.modifiedCount || includesId(goal?.pendingTakes, row._id)) {
            return { outcome: 'taken', remainingTails };
        }
        if (includesId(goal?.fencedPledges, row._id)) {
            return { outcome: 'fenced', remainingTails };
        }
        if (goal && isOpen(goal, now) && row.amount > remainingTails) {
            return { outcome: 'overflow', remainingTails };
        }
        return { outcome: 'closed', remainingTails };
    }

    /** Step 5, and the sweeper's roll-forward. Every write is conditional, so it can run twice. */
    private async confirm(row: Doc, now: Date, options: { session?: unknown } = {}) {
        const _id = helperId(row.goal, row.user);
        await this.store.helpers.updateOne(
            { _id },
            { $setOnInsert: { goal: row.goal, user: row.user, firstPledge: row._id, createdAt: now } },
            { upsert: true, ...options }
        );
        const helper = await this.store.helpers.findOne({ _id }, { projection: { firstPledge: 1 }, ...options });
        const firstForGoal = String(helper?.firstPledge) === String(row._id);
        await this.store.pledges.updateOne(
            { _id: row._id, status: RescueGoalPledgeStatus.PENDING },
            { $set: { status: RescueGoalPledgeStatus.CONFIRMED, confirmedAt: now, firstForGoal, updatedAt: now } },
            options
        );
        await this.settleConfirmed({ ...row, firstForGoal }, now, options);
    }

    private async settleConfirmed(row: Doc, now: Date, options: { session?: unknown } = {}) {
        const helped = row.firstForGoal ? 1 : 0;
        await this.store.users.updateOne(
            { _id: row.user, [PLEDGE_HOLDS_FIELD]: row._id },
            { $pull: { [PLEDGE_HOLDS_FIELD]: row._id }, $inc: { goalsHelped: helped, monthGoalsHelped: helped } },
            options
        );
        await this.store.goals.updateOne({ _id: row.goal }, { $pull: { pendingTakes: row._id } }, options);
        await this.store.pledges.updateOne({ _id: row._id }, { $set: { settled: true, updatedAt: now } }, options);
    }

    /** Gives back the user hold and the day reservation of a give that did not count. Idempotent. */
    private async undoHolds(row: Doc, now: Date): Promise<boolean> {
        const refund = await this.store.users.updateOne(
            { _id: row.user, [PLEDGE_HOLDS_FIELD]: row._id },
            refundHoldPipeline(row._id, num(row.amount), sameCounterSeason(row.counterEpoch, now))
        );
        await this.store.days.updateOne(
            { _id: dayId(row.user, row.day), pledges: row._id },
            { $inc: { reserved: -num(row.amount) }, $pull: { pledges: row._id } }
        );
        return !!refund.modifiedCount;
    }

    private async reject(row: Doc, code: RescueGoalErrorCode, now: Date) {
        const result = await this.store.pledges.updateOne(
            { _id: row._id, status: RescueGoalPledgeStatus.PENDING },
            { $set: { status: RescueGoalPledgeStatus.REJECTED, reason: code, updatedAt: now } }
        );
        if (result.modifiedCount !== 1) {
            // The sweeper got here first and owns the give (it refunds what it held). Nothing to undo.
            return;
        }
        if (!row.transaction) {
            await this.undoHolds(row, now);
        }
        await this.store.pledges.updateOne({ _id: row._id }, { $set: { settled: true, updatedAt: now } });
    }

    private async replay(existing: Doc, goal: Types.ObjectId, amount: number, now: Date): Promise<PledgeResult> {
        if (String(existing.goal) !== String(goal) || num(existing.amount) !== amount) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.PLEDGE_ID_REUSED);
        }
        return this.result(existing._id, true, now);
    }

    private async result(pledgeId: unknown, replayed: boolean, now: Date): Promise<PledgeResult> {
        const row = (await this.store.pledges.findOne({ _id: pledgeId }))!;
        const [goal, account, daily] = await Promise.all([
            this.store.goals.findOne({ _id: row.goal }, { projection: GOAL_STATE_PROJECTION }),
            this.store.users.findOne({ _id: row.user }, { projection: { tails: 1 } }),
            this.daily(row.user, now),
        ]);
        return {
            pledge: pledgeView(row),
            replayed,
            goal: {
                id: String(row.goal),
                status: goal?.status,
                raisedTails: num(goal?.raisedTails),
                targetTails: num(goal?.targetTails),
                remainingTails: goal ? remainingOf(goal) : 0,
            },
            balance: { tails: num(account?.tails) },
            daily,
        };
    }

    // ---------------------------------------------------------------------------------------------
    // Sweeper (F8: leased, every minute)
    // ---------------------------------------------------------------------------------------------

    @Cron(PLEDGE_SWEEPER_CRON, { name: PLEDGE_SWEEPER_JOB })
    async cron() {
        if (!sweeperEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.store.jobRuns,
            jobName: PLEDGE_SWEEPER_JOB,
            ttlMs: PLEDGE_SWEEPER_LEASE_MS,
            logger: this.logger,
            run: () => this.sweepOnce(),
        });
    }

    async sweepOnce(now: Date = new Date()): Promise<SweepResult> {
        const result: SweepResult = { forwarded: 0, refunded: 0, settled: 0, rechecked: 0, cancelRefunds: 0 };
        const cutoff = new Date(now.getTime() - PLEDGE_SWEEP_GRACE_MS);
        const batch = { sort: { deadline: 1 as const }, limit: PLEDGE_SWEEPER_BATCH };

        const stuck = await this.store.pledges
            .find({ status: RescueGoalPledgeStatus.PENDING, deadline: { $lt: cutoff } }, batch)
            .toArray();
        for (const row of stuck) {
            const outcome = await this.recover(row, now);
            if (outcome !== 'skipped') {
                result[outcome]++;
            }
        }

        const unsettled = await this.store.pledges
            .find({ settled: false, status: { $in: PLEDGE_FINAL_STATUSES }, deadline: { $lt: cutoff } }, batch)
            .toArray();
        for (const row of unsettled) {
            await this.finish(row, now);
            result.settled++;
        }

        const rechecks = await this.store.pledges
            .find({ recheckAt: { $lte: now } }, { sort: { recheckAt: 1 }, limit: PLEDGE_SWEEPER_BATCH })
            .toArray();
        for (const row of rechecks) {
            if (row.status === RescueGoalPledgeStatus.REFUNDED || row.status === RescueGoalPledgeStatus.REJECTED) {
                if (await this.undoHolds(row, now)) {
                    this.logger.warn(`give ${String(row._id)}: a late debit was given back on recheck`);
                }
            }
            await this.store.goals.updateOne({ _id: row.goal }, { $pull: { fencedPledges: row._id } });
            await this.store.pledges.updateOne({ _id: row._id }, { $unset: { recheckAt: '' } });
            result.rechecked++;
        }

        const cancelled = await this.store.goals
            .find(
                { status: RescueGoalStatus.CANCELLED, refundUntil: { $exists: true } },
                { sort: { refundUntil: 1 }, limit: 20 }
            )
            .toArray();
        for (const goal of cancelled) {
            result.cancelRefunds += await this.refundCancelledGoal(goal._id, now);
            if (new Date(goal.refundUntil).getTime() <= now.getTime()) {
                await this.store.goals.updateOne({ _id: goal._id }, { $unset: { refundUntil: '' } });
            }
        }
        return result;
    }

    /** A PENDING give past its deadline: fence the goal, then roll forward or refund. */
    async recover(row: Doc, now: Date): Promise<'forwarded' | 'refunded' | 'skipped'> {
        await this.store.goals.updateOne({ _id: row.goal }, { $addToSet: { fencedPledges: row._id } });
        const goal = await this.store.goals.findOne({ _id: row.goal }, { projection: { pendingTakes: 1, status: 1 } });
        if (includesId(goal?.pendingTakes, row._id)) {
            await this.confirm(row, now);
            await this.store.goals.updateOne({ _id: row.goal }, { $pull: { fencedPledges: row._id } });
            if (goal?.status === RescueGoalStatus.CANCELLED) {
                // Counted before the cancel: it is a confirmed give of a cancelled goal now.
                await this.refundCancelledGoal(row.goal, now);
            }
            this.logger.log(`give ${String(row._id)}: rolled forward after an interrupted request`);
            return 'forwarded';
        }
        const refunded = await this.store.pledges.updateOne(
            { _id: row._id, status: RescueGoalPledgeStatus.PENDING },
            {
                $set: {
                    status: RescueGoalPledgeStatus.REFUNDED,
                    reason: 'interrupted',
                    refundedAt: now,
                    updatedAt: now,
                },
            }
        );
        if (refunded.modifiedCount !== 1) {
            // A slow request finished the give between the sweeper's read and this write: it was counted
            // and confirmed (or refused and undone by the request). Its holds and its share of the daily
            // cap belong to that outcome, so they are not given back here.
            return this.settledElsewhere(row, now);
        }
        await this.undoHolds(row, now);
        await this.store.pledges.updateOne(
            { _id: row._id },
            { $set: { settled: true, recheckAt: new Date(now.getTime() + PLEDGE_RECHECK_MS), updatedAt: now } }
        );
        this.logger.log(`give ${String(row._id)}: refunded after an interrupted request`);
        return 'refunded';
    }

    /** `recover` lost the race to the request itself: finish what the request left and lift the fence. */
    private async settledElsewhere(row: Doc, now: Date): Promise<'forwarded' | 'skipped'> {
        const current = await this.store.pledges.findOne({ _id: row._id });
        await this.store.goals.updateOne({ _id: row.goal }, { $pull: { fencedPledges: row._id } });
        if (current?.status === RescueGoalPledgeStatus.CONFIRMED) {
            if (!current.settled) {
                await this.settleConfirmed(current, now);
            }
            this.logger.log(`give ${String(row._id)}: confirmed by its request while the sweeper looked at it`);
            return 'forwarded';
        }
        return 'skipped';
    }

    /** A final give whose holds were not all released (a crash after its status changed). */
    private async finish(row: Doc, now: Date) {
        if (row.status === RescueGoalPledgeStatus.CONFIRMED) {
            await this.settleConfirmed(row, now);
            return;
        }
        await this.undoHolds(row, now);
        await this.store.goals.updateOne({ _id: row.goal }, { $pull: { pendingTakes: row._id } });
        await this.store.pledges.updateOne({ _id: row._id }, { $set: { settled: true, updatedAt: now } });
    }

    /**
     * Gives back every confirmed give of a cancelled goal. Idempotent per give (the user document
     * records it in `pledgeCancelRefunds` in the same write). Returns how many gives it refunded.
     */
    async refundCancelledGoal(goalId: unknown, now: Date = new Date()): Promise<number> {
        let refunded = 0;
        for (;;) {
            const rows = await this.store.pledges
                .find(
                    { goal: goalId, status: RescueGoalPledgeStatus.CONFIRMED },
                    { sort: { _id: 1 }, limit: PLEDGE_SWEEPER_BATCH }
                )
                .toArray();
            if (!rows.length) {
                return refunded;
            }
            for (const row of rows) {
                if (!row.settled) {
                    await this.settleConfirmed(row, now);
                }
                await this.store.users.updateOne(
                    { _id: row.user, [PLEDGE_CANCEL_REFUNDS_FIELD]: { $ne: row._id } },
                    cancelRefundPipeline(
                        row._id,
                        num(row.amount),
                        sameCounterSeason(row.counterEpoch, now),
                        !!row.firstForGoal
                    )
                );
                await this.store.days.updateOne(
                    { _id: dayId(row.user, row.day), pledges: row._id },
                    { $inc: { reserved: -num(row.amount) }, $pull: { pledges: row._id } }
                );
                await this.store.pledges.updateOne(
                    { _id: row._id, status: RescueGoalPledgeStatus.CONFIRMED },
                    {
                        $set: {
                            status: RescueGoalPledgeStatus.REFUNDED,
                            reason: 'goal-cancelled',
                            refundedAt: now,
                            updatedAt: now,
                        },
                    }
                );
                refunded++;
            }
        }
    }

    /** How long a cancelled goal keeps re-running its refunds. */
    static cancelRefundUntil(now: Date) {
        return new Date(now.getTime() + GOAL_CANCEL_REFUND_WINDOW_MS);
    }
}

export const GOAL_STATE_PROJECTION = {
    status: 1,
    raisedTails: 1,
    targetTails: 1,
    endsAt: 1,
    pendingTakes: 1,
    fencedPledges: 1,
} as const;

export const remainingOf = (goal: Doc) => Math.max(0, num(goal.targetTails) - num(goal.raisedTails));

export const isOpen = (goal: Doc, now: Date) =>
    goal.status === RescueGoalStatus.OPEN && (!goal.endsAt || new Date(goal.endsAt).getTime() > now.getTime());

/** OPEN but past its end date: it refuses gives and waits for a manager to deliver or cancel it. */
export const isExpired = (goal: Doc, now: Date) =>
    goal.status === RescueGoalStatus.OPEN && !!goal.endsAt && new Date(goal.endsAt).getTime() <= now.getTime();

/** Raised by the route when a refusal must surface as-is (tests import it). */
export const isRescueGoalError = (error: unknown, code: RescueGoalErrorCode) =>
    error instanceof HttpException && (error.getResponse() as { code?: string })?.code === code;
