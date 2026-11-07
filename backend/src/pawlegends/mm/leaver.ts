/*
 * The light leaver ladder (docs/plans/moba/M1A-IMPL.md §4.3, §4.4): pure. Worked out from an identity's own mm room
 * records of the last 7 days, so there is no penalty collection to tamper with or keep in sync. No catnip, no lock, no
 * rating loss in M1a: a warning, then a 60 s and a 3 min low-priority wait (cancellable). An IP-keyed identity (many
 * people behind one address) never gets a ladder.
 */
import { AFK_REASONS } from '../party/room';
import { MM_LIMITS } from './mm-limits';
import type { MmRoomMember, MmRoomRecord } from './mm-room.schema';

export interface LeaverStatus {
    /** Unerased events in the window. */
    events: number;
    /** 0 clean, 1 warning, 2 a short wait, 3 a long wait. */
    level: 0 | 1 | 2 | 3;
    waitMs: number;
}

export const CLEAN: LeaverStatus = Object.freeze({ events: 0, level: 0, waitMs: 0 }) as LeaverStatus;

export function leaverStatus(identityHash: string | null, rooms: readonly MmRoomRecord[], nowMs: number): LeaverStatus {
    if (!identityHash) return { ...CLEAN };
    const since = nowMs - MM_LIMITS.leaver.windowMs;
    const mine = rooms
        .filter(r => r.endedAt && new Date(r.createdAt).getTime() >= since)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let events = 0;
    let clean = 0;
    for (const r of mine) {
        const rows = r.members.filter(m => m.identityHash === identityHash);
        if (!rows.length) continue;
        if (rows.some(m => m.event === 'left' || m.event === 'afk')) {
            events++;
            clean = 0;
        } else if (++clean >= MM_LIMITS.leaver.cleanPerErase) {
            clean = 0;
            if (events > 0) events--;
        }
    }
    const level = Math.min(events, 3) as LeaverStatus['level'];
    const waitMs = level === 2 ? MM_LIMITS.leaver.shortWaitMs : level === 3 ? MM_LIMITS.leaver.longWaitMs : 0;
    return { events, level, waitMs };
}

/** What the relay knows about a seat at the end of a room. */
export interface SeatEnd {
    slot: number;
    /** The member gave the seat up mid-match (party.leave) or was replaced by a backfill. */
    left: boolean;
    leftTick?: number;
    /** Offline since (ms), when still offline at the end. */
    offSinceMs: number | null;
    /** The member's pilot ticks by reason while they held the seat. */
    pilotTicks: Record<string, number>;
}

/**
 * The events of a finished room (§4.3), set on the member rows of the seats' current holders: `left` for a mid-match
 * leave or offline for the last 180 s; `afk` for AFK-reason pilot ticks (drop, away, afk) over 35 % of the ticks the
 * member held the seat. A drop that reconnected and reclaimed is not an event.
 */
export function roomEvents(
    members: readonly MmRoomMember[],
    seats: readonly SeatEnd[],
    endTick: number,
    endMs: number,
    tickMs: number
): MmRoomMember[] {
    const out = members.map(m => ({ ...m }));
    for (const seat of seats) {
        const holder = out.filter(m => m.slot === seat.slot && !m.event).sort((a, b) => b.joinedTick - a.joinedTick)[0];
        if (!holder) continue;
        if (seat.left) {
            holder.event = 'left';
            holder.eventTick = seat.leftTick ?? endTick;
            continue;
        }
        if (seat.offSinceMs !== null && endMs - seat.offSinceMs >= MM_LIMITS.leaver.offlineBeforeEndMs) {
            holder.event = 'left';
            holder.eventTick = Math.max(0, endTick - Math.round((endMs - seat.offSinceMs) / tickMs));
            continue;
        }
        const held = Math.max(1, endTick - holder.joinedTick);
        const afk = AFK_REASONS.reduce((n, r) => n + (seat.pilotTicks[r] ?? 0), 0);
        if (afk > held * MM_LIMITS.leaver.afkShare) {
            holder.event = 'afk';
            holder.eventTick = holder.joinedTick;
        }
    }
    return out;
}
