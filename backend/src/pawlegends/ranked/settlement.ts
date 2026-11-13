import type { MmRoomRecord } from '../mm/mm-room.schema';
import { seasonDef } from '../pawlegends-catalog';

/*
 * Ranked settlement (docs/plans/moba/SOCIAL-RANKED.md §7.6, §7.7, gap plan P4). Pure helpers shared by `mm.join
 * ranked` (a loss cannot be dodged: an ended ranked room not yet applied blocks the next search), `GET ranked/me` and
 * the `/live` save (the ranked points move only after the room records agree with the verified verdict).
 *
 * The verdict's `verified` flag is the full re-verify: the relay re-sims the raw TURN log and runs `verifyPvpReplay`
 * on the record built from it (party/referee-core.ts `checkRoomLog`) before it sets the flag. `/live` already refuses
 * a room without it; `rankedSettleCheck` then cross-checks the matchmaker's room record before any point moves.
 */

/**
 * An ended ranked room counts as unsettled this long. Short on purpose: the host's save queue posts the result within
 * seconds, and a save that can never succeed (another device, a cleared queue) must not lock ranked for weeks.
 */
export const RANKED_PENDING_MS = 24 * 3_600_000;

/** The ranked rooms of `accountId` that still need a save: ended, not remade, seated to the end, not yet applied. */
export function pendingRoomsFilter(
    accountId: string,
    appliedRooms: readonly string[],
    now: Date
): Record<string, unknown> {
    return {
        queue: 'ranked',
        endedAt: { $gte: new Date(now.getTime() - RANKED_PENDING_MS) },
        void: { $ne: 'remake' },
        // a member who left or went AFK settles through the leaver ladder, not a save (the save would be refused)
        members: { $elemMatch: { accountId, event: null, backfill: { $ne: true } } },
        ...(appliedRooms.length ? { _id: { $nin: [...appliedRooms] } } : {}),
    };
}

export type RankedSettleWhy = 'not_ranked' | 'not_ended' | 'voided' | 'not_member' | 'backfill' | 'map' | 'season';

/**
 * Whether a verified PvP room may move ranked points for `accountId` at `slot` (pure). The room record must be a
 * ranked 3v3 room that ended and was not remade, of a known season, and seat this account at this slot from the start.
 */
export function rankedSettleCheck(
    mmRoom: Pick<MmRoomRecord, 'queue' | 'endedAt' | 'void' | 'members' | 'map' | 'season'> | null,
    accountId: string,
    slot: number
): { ok: true; season: string } | { ok: false; why: RankedSettleWhy } {
    if (!mmRoom || mmRoom.queue !== 'ranked') return { ok: false, why: 'not_ranked' };
    if (!mmRoom.endedAt) return { ok: false, why: 'not_ended' };
    if (mmRoom.void) return { ok: false, why: 'voided' };
    if (mmRoom.map) return { ok: false, why: 'map' };
    if (!mmRoom.season || !seasonDef(mmRoom.season)) return { ok: false, why: 'season' };
    const seat = mmRoom.members.filter(m => m.slot === slot && m.accountId === accountId);
    if (!seat.length) return { ok: false, why: 'not_member' };
    if (seat.every(m => m.backfill)) return { ok: false, why: 'backfill' };
    return { ok: true, season: mmRoom.season };
}
