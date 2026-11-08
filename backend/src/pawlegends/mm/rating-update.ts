/*
 * The co-op rating step (docs/plans/moba/M1A-IMPL.md §4.2): pure. Given an mm room record, the poster's account, the
 * verified outcome and the stored row (or none), it returns the next row or why nothing changes. The write itself is
 * in pawlegends-party-live.ts (the one place that writes the rating), after the Game row exists.
 */
import { coopUpdate, DEFAULT_GLICKO, glicko2Update, growRd, type Glicko } from './glicko2';
import { MM_LIMITS } from './mm-limits';
import type { MmRoomRecord } from './mm-room.schema';
import { ratingId, type MmRatingRow } from './rating.schema';

export type RatingSkip = 'applied' | 'backfill_loss' | 'forgiven' | 'not_member' | 'void';

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

/** Casual PvP fill bots as pseudo-players (V16.md §4.5): easy 1100, normal 1450, hard 1750, each RD 60. */
export const CASUAL_BOT_RATING: Readonly<Record<string, { r: number; rd: number }>> = Object.freeze({
    easy: Object.freeze({ r: 1100, rd: 60 }),
    normal: Object.freeze({ r: 1450, rd: 60 }),
    hard: Object.freeze({ r: 1750, rd: 60 }),
});

const teamOfSlot = (slot: number): 0 | 1 => (slot >= 3 ? 1 : 0);

/**
 * The casual PvP rating step (V16.md §4.5): pure. The poster against the opposing team's composite (its humans'
 * ratings at the start, its fill bots as pseudo-players), the change weighted by the share of human opponents. Nothing
 * for a voided room, a backfiller's loss, or a loss after a teammate left or went AFK before 5:00. `won` is the
 * poster's own team's result (the verdict's winner against the slot's team).
 */
export function casualRatingStep(input: {
    room: MmRoomRecord;
    accountId: string;
    won: boolean;
    row: MmRatingRow | null;
    nowMs: number;
}): RatingStep {
    const { room, accountId, won, row, nowMs } = input;
    if (room.void) return { skip: 'void' };
    if (row?.appliedRooms?.includes(room._id)) return { skip: 'applied' };
    const mine = room.members.filter(m => m.accountId === accountId).sort((a, b) => b.joinedTick - a.joinedTick)[0];
    if (!mine) return { skip: 'not_member' };
    const team = teamOfSlot(mine.slot);
    if (!won) {
        if (mine.backfill) return { skip: 'backfill_loss' };
        const forgiven = room.members.some(
            m =>
                m !== mine &&
                m.accountId !== accountId &&
                teamOfSlot(m.slot) === team &&
                (m.event === 'left' || m.event === 'afk') &&
                (m.eventTick ?? 0) < MM_LIMITS.forgiveBeforeTick
        );
        if (forgiven) return { skip: 'forgiven' };
    }
    // the opponents at the start: one human row per seat (the first holder), bots in the other seats
    const foeSlots = [0, 1, 2].map(i => (1 - team) * 3 + i);
    const foeTeam = room.teams?.[1 - team];
    const bot = CASUAL_BOT_RATING[foeTeam?.difficulty ?? 'normal'] ?? CASUAL_BOT_RATING.normal;
    const foes: { r: number; rd: number }[] = [];
    let humans = 0;
    for (const s of foeSlots) {
        const h = room.members.filter(m => m.slot === s && !m.backfill).sort((a, b) => a.joinedTick - b.joinedTick)[0];
        if (h?.ratingAtStart) {
            humans++;
            foes.push({ r: h.ratingAtStart.r, rd: h.ratingAtStart.rd });
        } else foes.push(bot);
    }
    const composite = {
        r: foes.reduce((n, f) => n + f.r, 0) / foes.length,
        rd: Math.sqrt(foes.reduce((n, f) => n + f.rd * f.rd, 0) / foes.length),
    };
    const weight = Math.max(1, humans) / foes.length;
    const start: Glicko = row
        ? { r: row.r, rd: row.rd, sigma: row.sigma }
        : mine.ratingAtStart
        ? { ...mine.ratingAtStart }
        : { ...DEFAULT_GLICKO };
    const aged = growRd(start, row?.lastAt ? new Date(row.lastAt).getTime() : null, nowMs);
    const full = glicko2Update(aged, [{ r: composite.r, rd: composite.rd, score: won ? 1 : 0 }]);
    const next: Glicko = {
        r: aged.r + (full.r - aged.r) * weight,
        rd: aged.rd + (full.rd - aged.rd) * weight,
        sigma: aged.sigma + (full.sigma - aged.sigma) * weight,
    };
    return {
        row: {
            _id: ratingId(accountId, 'casual'),
            accountId,
            queue: 'casual',
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
