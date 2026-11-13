/*
 * The `/live` side of live ops (docs/plans/moba/LIVEOPS.md): the ONE place the community goal counter and the Winter
 * Nap day log grow. `savePawlegendsMatch` and `savePawlegendsPartyMatch` call `applyCommunityGoal` once, after their
 * Game row exists (unique replay digest), so a duplicate save never counts twice. Only re-simmed or relay-verified
 * numbers reach it. It never throws and never fails a save.
 *
 * LiveopsService registers itself as the sink when Nest starts it; without it (tests, the relay process) this is a
 * no-op.
 */

export interface CommunityGoalCtx {
    accountId: string;
    won: boolean;
    forfeit: boolean;
    /** The player's verified kills + assists. */
    takedowns: number;
    now: Date;
}

export interface CommunityGoalSink {
    recordMatch(ctx: CommunityGoalCtx): Promise<void>;
}

let sink: CommunityGoalSink | null = null;

/** LiveopsService.onModuleInit; tests pass null to reset. */
export function setCommunityGoalSink(s: CommunityGoalSink | null): void {
    sink = s;
}

export async function applyCommunityGoal(ctx: CommunityGoalCtx): Promise<void> {
    if (!sink) return;
    try {
        await sink.recordMatch(ctx);
    } catch {
        // live ops never fails a save
    }
}
