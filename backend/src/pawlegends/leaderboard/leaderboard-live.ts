import type { SideRow } from './sides';

/*
 * The `/live` side of the Leaderboards window (docs/plans/moba/LEADERBOARDS.md): the ONE place its derived rows grow.
 * - `applyLevelSync`: `savePawlegendsMatch` and `savePawlegendsPartyMatch` call it once, right after their
 *   `$inc pawlegendsMatches` (the account level's own counter): the Level row is re-read from that field, never counted
 *   on its own, so it cannot drift from it.
 * - `applyMatchSides`: the match history's `record` calls it once per freshly stored row (after the Game row exists);
 *   the Cats vs Dogs tally keeps the first row of each match id and ignores the rest (the other humans' rows).
 * Both never throw and never fail a save. LeaderboardService registers itself as the sink when Nest starts it; without
 * it (tests, the relay process) both are no-ops.
 */

export interface LeaderboardSink {
    syncLevel(accountId: string): Promise<void>;
    countSides(row: SideRow): Promise<unknown>;
}

let sink: LeaderboardSink | null = null;

/** LeaderboardService.onModuleInit; tests pass null to reset. */
export function setLeaderboardSink(s: LeaderboardSink | null): void {
    sink = s;
}

export async function applyLevelSync(accountId: string): Promise<void> {
    if (!sink) return;
    try {
        await sink.syncLevel(String(accountId));
    } catch {
        // the boards never fail a save
    }
}

export async function applyMatchSides(row: SideRow): Promise<void> {
    if (!sink) return;
    try {
        await sink.countSides(row);
    } catch {
        // the boards never fail a save
    }
}
