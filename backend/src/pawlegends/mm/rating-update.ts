/*
 * The co-op rating step (docs/plans/moba/M1A-IMPL.md §4.2): pure. Given an mm room record, the poster's account, the
 * verified outcome and the stored row (or none), it returns the next row or why nothing changes. The write itself is
 * in pawlegends-party-live.ts (the one place that writes the rating), after the Game row exists.
 */
import { coopUpdate, DEFAULT_GLICKO, growRd, type Glicko } from './glicko2';
import { MM_LIMITS } from './mm-limits';
import type { MmRoomRecord } from './mm-room.schema';
import { ratingId, type MmRatingRow } from './rating.schema';

export type RatingSkip = 'applied' | 'backfill_loss' | 'forgiven' | 'not_member';

export interface RatingStep {
    skip?: RatingSkip;
    row?: MmRatingRow;
}

/** The last rooms a row remembers (idempotency). */
export const APPLIED_ROOMS = 50;

export function coopRatingStep(input: {
    room: MmRoomRecord;
    accountId: string;
    outcome: 'won' | 'lost';
    difficulty: string;
    row: MmRatingRow | null;
    nowMs: number;
}): RatingStep {
    const { room, accountId, outcome, row, nowMs } = input;
    if (row?.appliedRooms?.includes(room._id)) return { skip: 'applied' };
    // the poster's seat: their latest row in this room (a backfiller joined later than the leaver they replaced)
    const mine = room.members.filter(m => m.accountId === accountId).sort((a, b) => b.joinedTick - a.joinedTick)[0];
    if (!mine) return { skip: 'not_member' };
    const won = outcome === 'won';
    if (!won) {
        if (mine.backfill) return { skip: 'backfill_loss' };
        // loss forgiveness: a teammate left or went AFK before 5:00 (the leaver takes the queue penalty instead)
        const forgiven = room.members.some(
            m =>
                m !== mine &&
                m.accountId !== accountId &&
                (m.event === 'left' || m.event === 'afk') &&
                (m.eventTick ?? 0) < MM_LIMITS.forgiveBeforeTick
        );
        if (forgiven) return { skip: 'forgiven' };
    }
    const start: Glicko = row
        ? { r: row.r, rd: row.rd, sigma: row.sigma }
        : mine.ratingAtStart
        ? { ...mine.ratingAtStart }
        : { ...DEFAULT_GLICKO };
    const aged = growRd(start, row?.lastAt ? new Date(row.lastAt).getTime() : null, nowMs);
    const next = coopUpdate(aged, input.difficulty, won);
    return {
        row: {
            _id: ratingId(accountId),
            accountId,
            queue: 'coop',
            r: next.r,
            rd: next.rd,
            sigma: next.sigma,
            games: (row?.games ?? 0) + 1,
            wins: (row?.wins ?? 0) + (won ? 1 : 0),
            lastAt: new Date(nowMs),
            appliedRooms: [...(row?.appliedRooms ?? []), room._id].slice(-APPLIED_ROOMS),
            v: (row?.v ?? 0) + 1,
        },
    };
}
