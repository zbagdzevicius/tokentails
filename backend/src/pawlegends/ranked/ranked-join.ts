import type { RankedJoinSource, RankedRefusal } from '../mm/mm-bridge';
import type { MmPlayed } from '../mm/rating.schema';
import { pendingRoomsFilter } from './settlement';
import { RANKED_MIN_MATCHES } from './tiers';

/*
 * What `mm.join {queue:'ranked'}` reads in production (SOCIAL-RANKED.md §7.1, §7.6, §7.11), built by MmService. Read
 * only: the account's saved matches and its ended ranked rooms not yet applied to its ranked row. A failed read
 * refuses. Ranked is always open since round 4 (the 24-online gate is retired; low population fills with bots).
 */

interface FindQuery {
    select(fields: Record<string, number>): FindQuery;
    limit(n: number): FindQuery;
    lean(): Promise<unknown>;
}

export interface RankedJoinDeps {
    played: (accountId: string) => Promise<MmPlayed | null>;
    rooms: { find(filter: Record<string, unknown>): FindQuery } | null;
    ratings: { findById(id: string): { lean(): Promise<unknown> } } | null;
    now?: () => Date;
}

export function rankedJoinSource(deps: RankedJoinDeps): RankedJoinSource {
    const now = () => deps.now?.() ?? new Date();
    return {
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
