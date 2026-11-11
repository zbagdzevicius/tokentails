/*
 * The relay side of presence (docs/plans/moba/SOCIAL-RANKED.md §4.3): every 5 s it reads the relay's snapshot of its
 * registered (ticketed, non-guest) sockets and their phase (party, queue, match), and writes only what changed in one
 * bulk upsert; every 60 s it refreshes every connected account in the same bulk (the rows expire 2 min after their last
 * write). Never on the socket path: a timer reads a snapshot. Errors are counted (`presence_write_errors`), never thrown.
 *
 * Relative imports only: the relay role loads it without the `src/` alias.
 */
import { PRESENCE } from '../social/social.contracts';

export interface PresenceEntry {
    accountId: string;
    state: 'party' | 'queue' | 'match';
    party?: string;
    joinable?: boolean;
}

export interface PresenceWriter {
    bulkWrite(
        ops: Array<{
            updateOne: { filter: Record<string, unknown>; update: Record<string, unknown>; upsert: boolean };
        }>,
        options?: Record<string, unknown>
    ): Promise<unknown>;
}

export const PRESENCE_FLUSH_MS = 5_000;
export const PRESENCE_REFRESH_MS = 60_000;

const keyOf = (e: PresenceEntry) => `${e.state}|${e.party ?? ''}|${e.joinable ? 1 : 0}`;

export class PresenceSink {
    private last = new Map<string, string>();
    private lastRefreshMs = -Infinity;
    private timer: NodeJS.Timeout | null = null;
    private busy = false;
    errors = 0;
    writes = 0;

    constructor(
        private readonly snapshot: () => PresenceEntry[],
        private readonly writer: PresenceWriter | null,
        private readonly now: () => number = Date.now,
        private readonly log: (event: string, props: Record<string, unknown>) => void = () => undefined
    ) {}

    start(): void {
        if (this.timer || !this.writer) return;
        this.timer = setInterval(() => void this.flush(), PRESENCE_FLUSH_MS);
        this.timer.unref?.();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** One flush: the changed entries (or all of them on a refresh tick). Returns the rows written. */
    async flush(): Promise<number> {
        if (!this.writer || this.busy) return 0;
        this.busy = true;
        try {
            const nowMs = this.now();
            const refresh = nowMs - this.lastRefreshMs >= PRESENCE_REFRESH_MS;
            const entries = this.snapshot();
            const next = new Map<string, string>();
            const ops = [];
            const at = new Date(nowMs);
            const exp = new Date(nowMs + PRESENCE.ttlMs);
            for (const e of entries) {
                const k = keyOf(e);
                next.set(e.accountId, k);
                if (!refresh && this.last.get(e.accountId) === k) continue;
                ops.push({
                    updateOne: {
                        filter: { _id: e.accountId },
                        update: {
                            $set: {
                                relay: {
                                    state: e.state,
                                    at,
                                    ...(e.party ? { party: e.party, joinable: !!e.joinable } : {}),
                                },
                            },
                            $max: { exp },
                        },
                        upsert: true,
                    },
                });
            }
            // left the party, queue or match (or closed the socket): the relay state goes at once
            for (const id of this.last.keys())
                if (!next.has(id))
                    ops.push({ updateOne: { filter: { _id: id }, update: { $unset: { relay: 1 } }, upsert: false } });
            if (refresh) this.lastRefreshMs = nowMs;
            if (!ops.length) {
                this.last = next;
                return 0;
            }
            try {
                await this.writer.bulkWrite(ops, { ordered: false });
                this.writes += ops.length;
                this.last = next;
            } catch (error) {
                this.errors++;
                this.log('presence_write_errors', {
                    count: this.errors,
                    message: String((error as Error)?.message || error).slice(0, 120),
                });
            }
            return ops.length;
        } finally {
            this.busy = false;
        }
    }
}
