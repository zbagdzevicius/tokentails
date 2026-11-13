import type { RankedJoinSource, RankedRefusal } from '../mm/mm-bridge';
import type { MmPlayed } from '../mm/rating.schema';
import { pendingRoomsFilter } from './settlement';
import { RANKED_MIN_MATCHES, RANKED_OPEN_AT } from './tiers';

/*
 * What `mm.join {queue:'ranked'}` reads in production (SOCIAL-RANKED.md §7.1, §7.6, §7.9; gap plan P4), built by
 * MmService. Read only: the gate row the leased status job writes, the account's saved matches, and its ended ranked
 * rooms not yet applied to its ranked row. A failed read refuses (ranked never opens on a guess).
 */

interface FindQuery {
    select(fields: Record<string, number>): FindQuery;
    limit(n: number): FindQuery;
    lean(): Promise<unknown>;
}

export interface RankedJoinDeps {
    gate: { read(): Promise<{ open: boolean; online: number; need: number }> } | null;
    played: (accountId: string) => Promise<MmPlayed | null>;
    rooms: { find(filter: Record<string, unknown>): FindQuery } | null;
    ratings: { findById(id: string): { lean(): Promise<unknown> } } | null;
    now?: () => Date;
}

export function rankedJoinSource(deps: RankedJoinDeps): RankedJoinSource {
    const now = () => deps.now?.() ?? new Date();
    return {
        async gate() {
            if (!deps.gate) return { open: false, online: 0, need: RANKED_OPEN_AT };
            const g = await deps.gate.read();
            return { open: !!g.open, online: Number(g.online) || 0, need: Number(g.need) || RANKED_OPEN_AT };
        },
        async check(accountId: string): Promise<RankedRefusal | null> {
            const played = await deps.played(accountId);
            const have = played?.matches ?? 0;
            if (have < RANKED_MIN_MATCHES) return { code: 'mm_ranked_matches', have, need: RANKED_MIN_MATCHES };
            if (!deps.rooms) return null;
            const row = (deps.ratings ? await deps.ratings.findById(`${accountId}:ranked`).lean() : null) as {
                appliedRooms?: string[];
            } | null;
            const pending = (await deps.rooms
                .find(pendingRoomsFilter(accountId, row?.appliedRooms ?? [], now()))
                .select({ _id: 1 })
                .limit(5)
                .lean()) as Array<{ _id: string }>;
            return pending.length ? { code: 'mm_ranked_pending', rooms: pending.map(p => String(p._id)) } : null;
        },
    };
}
