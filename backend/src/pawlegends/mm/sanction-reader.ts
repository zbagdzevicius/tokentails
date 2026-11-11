/*
 * Sanctions at the queue (docs/plans/moba/SOCIAL-RANKED.md §8.4): the relay's `mm.join` reads the account's sanctions
 * in force, cached 60 s. Only the moderator resolve route writes them (report.service.ts); nothing here writes.
 *
 * - `queue_lock`: no Quick Play or PvP queue until `until`.
 * - `pvp_ban`: no PvP queue (casual, classic, ranked); permanent unless `until` is set.
 * - `ranked_lock`: no ranked queue until `until`.
 *
 * Relative imports only: the relay role loads it.
 */

export interface SanctionRow {
    kind: string;
    until: Date | null;
}

export interface SanctionSource {
    /** Locks in force for an account, for `queue` ('coop' | 'casual' | 'classic' | 'ranked'). 0: none; Infinity: permanent. */
    lockUntil(accountId: string, queue: string): Promise<number>;
}

export const SANCTION_CACHE_MS = 60_000;

const PVP = new Set(['casual', 'classic', 'ranked']);

/** The latest `until` (ms) of the locks that stop `queue`, Infinity for a permanent one, 0 for none. Pure. */
export function lockUntilOf(rows: readonly SanctionRow[], queue: string, nowMs: number): number {
    let until = 0;
    for (const r of rows) {
        const stops =
            r.kind === 'queue_lock' ||
            (r.kind === 'pvp_ban' && PVP.has(queue)) ||
            (r.kind === 'ranked_lock' && queue === 'ranked');
        if (!stops) continue;
        const end = r.until ? new Date(r.until).getTime() : Infinity;
        if (end > nowMs) until = Math.max(until, end);
    }
    return until;
}

export class SanctionReader implements SanctionSource {
    private readonly cache = new Map<string, { atMs: number; rows: SanctionRow[] }>();

    constructor(
        private readonly model: { find(filter: Record<string, unknown>): { lean(): PromiseLike<unknown> } } | null,
        private readonly now: () => number = Date.now
    ) {}

    async lockUntil(accountId: string, queue: string): Promise<number> {
        if (!this.model) return 0;
        const nowMs = this.now();
        let hit = this.cache.get(accountId);
        if (!hit || nowMs - hit.atMs >= SANCTION_CACHE_MS) {
            try {
                const rows = (await this.model
                    .find({
                        accountId,
                        kind: { $in: ['queue_lock', 'pvp_ban', 'ranked_lock'] },
                        $or: [{ until: null }, { until: { $gt: new Date(nowMs) } }],
                    })
                    .lean()) as SanctionRow[];
                hit = { atMs: nowMs, rows: rows ?? [] };
            } catch {
                hit = { atMs: nowMs, rows: hit?.rows ?? [] };
            }
            this.cache.set(accountId, hit);
            if (this.cache.size > 5000) for (const k of [...this.cache.keys()].slice(0, 1000)) this.cache.delete(k);
        }
        return lockUntilOf(hit.rows, queue, nowMs);
    }
}
