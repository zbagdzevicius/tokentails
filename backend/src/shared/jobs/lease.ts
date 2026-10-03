import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/*
 * Job coordination across replicas (plan F8), generalised from the codex reset's `jobruns` pattern.
 *
 * Every instance runs the same `@Cron` handlers, so without coordination each replica performs
 * every tick. One document per job in `jobruns` (`{ _id: jobName, ... }`) serialises them:
 *
 * - `acquireLease`: time-boxed lock. The conditional upsert matches only an expired lease; when the
 *   lease is held, the filter misses, the upsert inserts on the existing `_id` and MongoDB answers
 *   E11000, which means "held". Use it for crons that should run once per tick.
 * - `claimJobPeriod`: once-per-period claim (the codex reset). The period stays taken for good.
 */

export const JOB_RUNS_COLLECTION = 'jobruns';

export const DUPLICATE_KEY = 11000;

/** Identifies this process in lease documents, for debugging only. */
export const INSTANCE_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

// The subsets of a MongoDB collection these helpers need; the native driver collection fits both.
export interface IJobRunsCollection {
    updateOne(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: Record<string, unknown>
    ): Promise<{ matchedCount?: number; modifiedCount?: number; upsertedCount?: number }>;
}

export interface ILeaseCollection extends IJobRunsCollection {
    findOneAndUpdate(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: Record<string, unknown>
    ): Promise<unknown>;
}

export const isDuplicateKeyError = (error: unknown) => (error as { code?: number })?.code === DUPLICATE_KEY;

/**
 * Atomically marks `period` as taken for `jobName`. Returns false when it was already taken, by an
 * earlier run or by another instance running at the same moment.
 */
export async function claimJobPeriod(jobRuns: IJobRunsCollection, jobName: string, period: string, now: Date) {
    try {
        const result = await jobRuns.updateOne(
            { _id: jobName, period: { $ne: period } },
            { $set: { period, status: 'running', startedAt: now } },
            { upsert: true }
        );
        return (result.modifiedCount || 0) + (result.upsertedCount || 0) > 0;
    } catch (error) {
        // The document exists with this period, so the filter missed and the upsert hit the _id.
        if (isDuplicateKeyError(error)) {
            return false;
        }
        throw error;
    }
}

/**
 * Takes the lease on `jobName` for `ttlMs` when it is free or expired. Returns false while another
 * instance (or an earlier tick) holds it. Pick `ttlMs` longer than the run plus clock skew and
 * shorter than the cron interval.
 */
export async function acquireLease(
    jobRuns: ILeaseCollection,
    jobName: string,
    ttlMs: number,
    now = new Date(),
    owner = INSTANCE_ID
): Promise<boolean> {
    try {
        await jobRuns.findOneAndUpdate(
            // `$not: {$gte}` also matches a document without `lockedUntil`.
            { _id: jobName, lockedUntil: { $not: { $gte: now } } },
            {
                $set: {
                    lockedUntil: new Date(now.getTime() + ttlMs),
                    lockedAt: now,
                    lockedBy: owner,
                    status: 'running',
                },
            },
            { upsert: true }
        );
        return true;
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return false;
        }
        throw error;
    }
}

export type LeasedRunOutcome = 'ran' | 'lease-held';

/**
 * Runs `run` on at most one instance per lease window. The lease is kept until it expires (not
 * released early), so an instance whose clock fires a little late cannot run the same tick again.
 */
export async function runLeased({
    jobRuns,
    jobName,
    ttlMs,
    run,
    now = new Date(),
    logger = new Logger('JobLease'),
}: {
    jobRuns: ILeaseCollection;
    jobName: string;
    ttlMs: number;
    run: () => Promise<unknown>;
    now?: Date;
    logger?: Pick<Logger, 'log' | 'error'>;
}): Promise<LeasedRunOutcome> {
    if (!(await acquireLease(jobRuns, jobName, ttlMs, now))) {
        logger.log(`${jobName}: lease held by another instance, skipping`);
        return 'lease-held';
    }
    try {
        await run();
    } catch (error) {
        await jobRuns.updateOne({ _id: jobName }, { $set: { status: 'failed', failedAt: new Date() } });
        logger.error(`${jobName} failed`, (error as Error)?.stack);
        throw error;
    }
    await jobRuns.updateOne({ _id: jobName }, { $set: { status: 'done', finishedAt: new Date() } });
    return 'ran';
}
