/**
 * Digests of Heist logs that failed verification, so a losing log sent again is answered with the
 * same 400 without replaying it (plan F6 "Replay CPU bound").
 *
 * The queue bounds the replay backlog, not the work: without this, an idle log at the tick cap
 * (about 60 ms of main-thread CPU) could be sent over and over from many free guest accounts. The
 * vendored sim is deterministic, so the canonical log that failed once fails the same way again.
 *
 * Bounded: at most `maxEntries` digests (least recently used dropped first) for `ttlMs` each.
 * In-process, so each replica has its own; a restart or a sim update (new process) starts empty.
 */
export interface IFailedReplay {
    code: string;
    reason: string;
}

export interface IFailedReplayCacheOptions {
    maxEntries: number;
    ttlMs: number;
    now?: () => number;
}

export class FailedReplayCache {
    private readonly entries = new Map<string, IFailedReplay & { expiresAt: number }>();
    private readonly now: () => number;

    constructor(private readonly options: IFailedReplayCacheOptions) {
        this.now = options.now || (() => Date.now());
    }

    get size(): number {
        return this.entries.size;
    }

    get(digest: string): IFailedReplay | undefined {
        const entry = this.entries.get(digest);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(digest);
            return undefined;
        }
        // Map keeps insertion order: re-inserting marks it most recently used.
        this.entries.delete(digest);
        this.entries.set(digest, entry);
        return { code: entry.code, reason: entry.reason };
    }

    set(digest: string, failure: IFailedReplay): void {
        this.entries.delete(digest);
        this.entries.set(digest, { ...failure, expiresAt: this.now() + this.options.ttlMs });
        while (this.entries.size > this.options.maxEntries) {
            const oldest = this.entries.keys().next().value as string;
            this.entries.delete(oldest);
        }
    }

    clear(): void {
        this.entries.clear();
    }
}

/** About 10k digests (64 hex chars plus a short reason: roughly 2 MB at most) for 10 minutes. */
export const FAILED_HEIST_REPLAYS = { maxEntries: 10_000, ttlMs: 10 * 60 * 1000 };

/** The process-wide cache `/live` uses. */
export const failedHeistReplays = new FailedReplayCache(FAILED_HEIST_REPLAYS);
