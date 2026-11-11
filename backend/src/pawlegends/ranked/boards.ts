import { casualRatingStep } from '../mm/rating-update';
import type { MmRoomRecord } from '../mm/mm-room.schema';

/*
 * Leaderboard rules (docs/plans/moba/SOCIAL-RANKED.md §6), pure. Rows are written ONLY by the `/live` save
 * (pawlegends-party-live.ts `writeBoards`, after the Game row exists); social-no-write.spec.ts fails on any other write
 * site. The client never sends a number: a row moves only from a verified room.
 */

export const BOARD_PAGE = 8;
export const BOARD_DAILY_WIN_CAP = 25;
export const HERO_MIN_GAMES = 10;
export const WEEKLY_KEEP_DAYS = 70;
export const HERO_KEEP_DAYS = 2 * 56;
export const BOARD_ROOMS_KEPT = 50;

const PVP_QUEUES = ['casual', 'classic', 'ranked'];

/** ISO-8601 week of a date, `2026-W46` (weeks start Monday 00:00 UTC). */
export function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type BoardSkip =
    | 'not_pvp'
    | 'void'
    | 'not_member'
    | 'guest'
    | 'excluded'
    | 'bot_foes'
    | 'backfill_loss'
    | 'forgiven'
    | 'applied';

/**
 * Whether a verified PvP save counts toward the boards (§6.1): a PvP queue, not void, a registered and not excluded
 * account, at least 2 human foes at the start (3 on 5v5), not a backfill loss, not a forgiven loss.
 */
export function boardEligible(input: {
    room: MmRoomRecord;
    accountId: string;
    won: boolean;
    registered: boolean;
    excluded: boolean;
    nowMs: number;
}): { ok: true; team: number } | { ok: false; why: BoardSkip } {
    const { room, accountId } = input;
    if (!PVP_QUEUES.includes(room.queue)) return { ok: false, why: 'not_pvp' };
    if (room.void) return { ok: false, why: 'void' };
    if (!input.registered) return { ok: false, why: 'guest' };
    if (input.excluded) return { ok: false, why: 'excluded' };
    const size = room.map === 'hearthwood' ? 5 : 3;
    const mine = room.members.filter(m => m.accountId === accountId).sort((a, b) => b.joinedTick - a.joinedTick)[0];
    if (!mine) return { ok: false, why: 'not_member' };
    const team = mine.slot >= size ? 1 : 0;
    const foeHumans = room.teams?.[1 - team]?.slots.length ?? 0;
    if (foeHumans < (size === 5 ? 3 : 2)) return { ok: false, why: 'bot_foes' };
    // the same loss rules as the rating: a backfiller's loss and a loss after an early teammate leave do not count
    const step = casualRatingStep({ room, accountId, won: input.won, row: null, nowMs: input.nowMs });
    if (step.skip === 'backfill_loss' || step.skip === 'forgiven') return { ok: false, why: step.skip };
    return { ok: true, team };
}

export const weeklyId = (week: string, acc: string) => `w:${week}:${acc}`;
export const heroId = (season: string, hero: string, acc: string) => `h:${season}:${hero}:${acc}`;
