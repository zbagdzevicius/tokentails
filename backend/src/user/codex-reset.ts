import { Logger } from '@nestjs/common';

/*
 * Monthly codex reset.
 *
 * Codex phases start at 00:00 UTC on the 9th (see getPhase in src/common/utils.ts). The codex
 * endpoint stops updating for the last two hours before that anchor (isLessThan2hoursLeft), so the
 * reset runs at 23:00 UTC on the 8th: every phase is already final, and no request can credit the
 * new phase from the old month's counters while the reset is running.
 *
 * Field order: second minute hour day-of-month month day-of-week.
 */
export const CODEX_ANCHOR_DAY = 9;
export const CODEX_RESET_CRON = '0 0 23 8 * *';
export const CODEX_RESET_TIMEZONE = 'UTC';
export const CODEX_RESET_JOB_NAME = 'codex-reset';
export const CODEX_RESET_LEAD_MS = 60 * 60 * 1000;

// Runs outside this window around an anchor are refused, so a stray manual call mid-month
// cannot wipe the counters.
export const CODEX_RESET_WINDOW_MS = 48 * 60 * 60 * 1000;

// One document per job: { _id: job name, period, status, timestamps }.
export const JOB_RUNS_COLLECTION = 'jobruns';

export const MONTHLY_COUNTER_RESET = {
    monthTails: 0,
    monthBoxes: 0,
    monthFeeded: 0,
    monthStreak: 0,
    monthPacks: 0,
    monthReferrals: 0,
    monthTailsCrafted: 0,
    monthPortraitPurchases: 0,
    airdropChallengesClaimed: [] as string[],
    airdropMilestonesClaimed: [] as string[],
};

const anchorOf = (year: number, month: number) => new Date(Date.UTC(year, month, CODEX_ANCHOR_DAY));

/** The phase anchor (the 9th, 00:00 UTC) closest to `now`. */
export function nearestCodexAnchor(now: Date): Date {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const candidates = [anchorOf(year, month - 1), anchorOf(year, month), anchorOf(year, month + 1)];
    return candidates.reduce((best, candidate) =>
        Math.abs(candidate.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime()) ? candidate : best
    );
}

/** `YYYY-MM` of the phase that starts at the nearest anchor, or null when `now` is not near one. */
export function codexResetPeriod(now: Date): string | null {
    const anchor = nearestCodexAnchor(now);
    if (Math.abs(anchor.getTime() - now.getTime()) > CODEX_RESET_WINDOW_MS) {
        return null;
    }
    return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The instant the reset for the phase containing `now` ran (or should have run). */
export function currentCodexPeriodStart(now: Date): Date {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    let start = new Date(anchorOf(year, month).getTime() - CODEX_RESET_LEAD_MS);
    if (start.getTime() > now.getTime()) {
        start = new Date(anchorOf(year, month - 1).getTime() - CODEX_RESET_LEAD_MS);
    }
    return start;
}

// The subset of a MongoDB collection this job needs.
export interface IJobRunsCollection {
    updateOne(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: Record<string, unknown>
    ): Promise<{ matchedCount?: number; modifiedCount?: number; upsertedCount?: number }>;
}

const DUPLICATE_KEY = 11000;

/**
 * Atomically marks `period` as taken. Returns false when it was already taken, by an earlier run
 * or by another instance running at the same moment.
 */
export async function claimCodexResetPeriod(jobRuns: IJobRunsCollection, period: string, now: Date) {
    try {
        const result = await jobRuns.updateOne(
            { _id: CODEX_RESET_JOB_NAME, period: { $ne: period } },
            { $set: { period, status: 'running', startedAt: now } },
            { upsert: true }
        );
        return (result.modifiedCount || 0) + (result.upsertedCount || 0) > 0;
    } catch (error) {
        // The document exists with this period, so the filter missed and the upsert hit the _id.
        if ((error as { code?: number })?.code === DUPLICATE_KEY) {
            return false;
        }
        throw error;
    }
}

export type CodexResetOutcome = 'done' | 'already-done' | 'outside-window';

export async function runCodexReset({
    jobRuns,
    payGuards,
    resetCounters,
    now = new Date(),
    logger = new Logger('CodexReset'),
}: {
    jobRuns: IJobRunsCollection;
    payGuards: () => Promise<unknown>;
    resetCounters: () => Promise<unknown>;
    now?: Date;
    logger?: Pick<Logger, 'log' | 'warn' | 'error'>;
}): Promise<CodexResetOutcome> {
    const period = codexResetPeriod(now);
    if (!period) {
        logger.warn(`Codex reset refused at ${now.toISOString()}: not within 48h of a phase anchor`);
        return 'outside-window';
    }
    if (!(await claimCodexResetPeriod(jobRuns, period, now))) {
        logger.log(`Codex reset for ${period} already ran, skipping`);
        return 'already-done';
    }

    try {
        await payGuards();
    } catch (error) {
        // Nothing was reset, so release the period for a rerun. Check for partial payouts first.
        await jobRuns.updateOne(
            { _id: CODEX_RESET_JOB_NAME, period },
            { $set: { period: null, failedPeriod: period, status: 'payout-failed', failedAt: new Date() } }
        );
        logger.error(`Codex guard payout for ${period} failed; period released`, (error as Error)?.stack);
        throw error;
    }
    await jobRuns.updateOne({ _id: CODEX_RESET_JOB_NAME, period }, { $set: { status: 'paid', paidAt: new Date() } });

    // Guards are paid, so the period stays taken even if this fails: a rerun would pay them twice.
    try {
        await resetCounters();
    } catch (error) {
        await jobRuns.updateOne({ _id: CODEX_RESET_JOB_NAME, period }, { $set: { status: 'reset-failed' } });
        logger.error(`Codex counter reset for ${period} failed after payout`, (error as Error)?.stack);
        throw error;
    }
    await jobRuns.updateOne(
        { _id: CODEX_RESET_JOB_NAME, period },
        { $set: { status: 'done', finishedAt: new Date() } }
    );
    logger.log(`Codex reset for ${period} done`);
    return 'done';
}
