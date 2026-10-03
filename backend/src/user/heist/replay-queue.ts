import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Fixed concurrency and fixed queue length for Heist replays (plan F6 "Replay CPU bound").
 *
 * Anonymous accounts are free, so per-user limits do not bound replay CPU. Every `verifyRun` goes
 * through this queue: at most `concurrency` replays run at once and at most `maxQueued` wait. When
 * both are full, `run` throws a 429 with `retryAfterSeconds` synchronously, before the task (and so
 * before any simulation) starts.
 *
 * `verifyRun` is synchronous. On the main thread a replay blocks the event loop while it runs, so
 * `concurrency` is 1 there and every task starts on a fresh macrotask (`setImmediate`), letting
 * other requests interleave between replays. Benchmark (task 3b, docs/plans/alignment-log/3b.md):
 * p95 under 10 ms over the 8 golden solutions and about 60 ms for an idle log at the 18,000-tick
 * cap, below the 50 ms p95 threshold that would call for `worker_threads`. Moving to workers later
 * only changes the `execute` function; the bound and the 429 stay here.
 *
 * In-process: each replica has its own queue, so the effective bound is per replica.
 */
export interface IReplayQueueOptions {
    concurrency: number;
    maxQueued: number;
    /** Runs a task. Defaults to `setImmediate` then the task, on this thread. */
    execute?: <T>(task: () => T) => Promise<T>;
    now?: () => number;
}

export class ReplayQueueFullException extends HttpException {
    constructor(readonly retryAfterSeconds: number) {
        super(
            { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many Heist replays right now, retry shortly' },
            HttpStatus.TOO_MANY_REQUESTS
        );
    }
}

const onNextTick = <T>(task: () => T): Promise<T> =>
    new Promise<T>((resolve, reject) =>
        setImmediate(() => {
            try {
                resolve(task());
            } catch (error) {
                reject(error);
            }
        })
    );

export class ReplayQueue {
    private active = 0;
    private readonly waiting: (() => void)[] = [];
    /** Moving average of task time, for `Retry-After`. Starts at 20 ms. */
    private averageMs = 20;
    private readonly execute: <T>(task: () => T) => Promise<T>;
    private readonly now: () => number;

    constructor(private readonly options: IReplayQueueOptions) {
        this.execute = options.execute || onNextTick;
        this.now = options.now || (() => Date.now());
    }

    /** Running plus waiting tasks. */
    get size(): number {
        return this.active + this.waiting.length;
    }

    get running(): number {
        return this.active;
    }

    get queued(): number {
        return this.waiting.length;
    }

    /** Seconds until the queue is likely to have room, at least 1. */
    retryAfterSeconds(): number {
        const pendingMs = ((this.size + 1) * this.averageMs) / Math.max(1, this.options.concurrency);
        return Math.max(1, Math.ceil(pendingMs / 1000));
    }

    /**
     * Runs `task` when a slot is free. Throws `ReplayQueueFullException` (429) at once, without
     * calling `task`, when `concurrency` tasks run and `maxQueued` already wait.
     */
    run<T>(task: () => T): Promise<T> {
        if (this.active >= this.options.concurrency && this.waiting.length >= this.options.maxQueued) {
            throw new ReplayQueueFullException(this.retryAfterSeconds());
        }
        return new Promise<T>((resolve, reject) => {
            const start = () => {
                this.active += 1;
                const startedAt = this.now();
                const done = () => {
                    this.averageMs = this.averageMs * 0.8 + Math.max(1, this.now() - startedAt) * 0.2;
                    this.active -= 1;
                    this.waiting.shift()?.();
                };
                this.execute(task).then(
                    value => {
                        done();
                        resolve(value);
                    },
                    error => {
                        done();
                        reject(error);
                    }
                );
            };
            if (this.active < this.options.concurrency) {
                start();
            } else {
                this.waiting.push(start);
            }
        });
    }
}

/** Main-thread replays: one at a time, up to 16 waiting (about 0.2 s of golden-length replays). */
export const HEIST_REPLAY_QUEUE = { concurrency: 1, maxQueued: 16 };

/** The process-wide queue `/live` uses. */
export const heistReplayQueue = new ReplayQueue(HEIST_REPLAY_QUEUE);
