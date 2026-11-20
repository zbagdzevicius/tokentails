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
    /**
     * With a wait: the latest counted event (its room and the wait's start, once a search set it). The wait is anchored
     * on that row in Mongo, so a Cancel and Search again on the other relay instance counts the same wait down.
     */
    anchor?: { room: string; waitFromMs: number | null; used?: boolean };
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
    let anchor: LeaverStatus['anchor'];
    for (const r of mine) {
        const rows = r.members.filter(m => m.identityHash === identityHash);
        if (!rows.length) continue;
        const counted = rows.find(m => m.event === 'left' || m.event === 'afk');
        if (counted) {
            events++;
            clean = 0;
            anchor = { room: r._id, waitFromMs: counted.waitFromMs ?? null };
        } else if (rows.some(m => m.event === 'dropped')) {
            // a lost seat (a crash, a reload, a backfilled drop that came back): neither an event nor a clean match
            continue;
        } else if (++clean >= MM_LIMITS.leaver.cleanPerErase) {
            clean = 0;
            if (events > 0) events--;
        }
    }
    const level = Math.min(events, 3) as LeaverStatus['level'];
    const waitMs = level === 2 ? MM_LIMITS.leaver.shortWaitMs : level === 3 ? MM_LIMITS.leaver.longWaitMs : 0;
    if (!(waitMs > 0 && anchor)) return { events, level, waitMs };
    // a match after the wait started (live or ended) took the wait: the next search owes the ladder's wait again
    const from = anchor.waitFromMs;
    if (
        from !== null &&
        rooms.some(r => new Date(r.createdAt).getTime() > from && r.members.some(m => m.identityHash === identityHash))
    )
        anchor.used = true;
    return { events, level, waitMs, anchor };
}

/**
 * When this search's leaver wait ends (pure). A wait started less than an hour after its end ago is the same wait (a
 * Cancel and Search again, on either relay instance); an older one, or one a match took since, was served, and the
 * next search owes a new one. Null when the search must anchor a new wait now.
 */
export function waitStart(status: LeaverStatus, nowMs: number): number | null {
    const from = status.anchor?.waitFromMs ?? null;
    if (from === null || status.waitMs <= 0 || status.anchor?.used) return null;
    return nowMs - (from + status.waitMs) < MM_LIMITS.leaver.servedForgetMs ? from : null;
}

/** What the relay knows about a seat at the end of a room. */
export interface SeatEnd {
    slot: number;
    /** The member gave the seat up mid-match (party.leave) or was replaced by a backfill. */
    left: boolean;
    leftTick?: number;
    /**
     * The seat was given up without the player choosing to leave: the relay freed it for the same identity's new search
     * or match (a crash, an app relaunch, an OTA reload) without a declined rejoin. `dropped`, never `left`.
     */
    dropped?: boolean;
    /** Offline since (ms), when still offline at the end. */
    offSinceMs: number | null;
    /** The member's pilot ticks by reason while they held the seat. */
    pilotTicks: Record<string, number>;
}

/**
 * A dropped member whose seat a backfill took (pure, at the end of the room): `left` only when they never came back
 * (no socket of theirs on the relay, no newer match) and were offline for the last 180 s of the room; else `dropped`.
 */
export function backfilledDrop(offSinceMs: number, returned: boolean, endMs: number): 'left' | 'dropped' {
    if (returned) return 'dropped';
    return endMs - offSinceMs >= MM_LIMITS.leaver.offlineBeforeEndMs ? 'left' : 'dropped';
}

/**
 * The events of a finished room (§4.3), set on the member rows of the seats' current holders: `left` for a mid-match
 * leave or offline for the last 180 s; `dropped` for a seat given up for the same player's new search (a crash or a
 * reload, no declined rejoin); `afk` for idle pilot ticks (away, afk; never a drop the player came back from)
 * over 35 % of the ticks the member held the seat. A drop that reconnected and reclaimed is not an event.
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
            holder.event = seat.dropped ? 'dropped' : 'left';
            holder.eventTick = seat.leftTick ?? endTick;
            continue;
        }
        if (seat.offSinceMs !== null && endMs - seat.offSinceMs >= MM_LIMITS.leaver.offlineBeforeEndMs) {
            holder.event = 'left';
            holder.eventTick = Math.max(0, endTick - Math.round((endMs - seat.offSinceMs) / tickMs));
            continue;
        }
        const held = Math.max(1, endTick - holder.joinedTick);
        // a drop the player came back from (a crash, a reload, a network drop) is no AFK: only idle ticks count
        const afk = AFK_REASONS.filter(r => r !== 'drop').reduce((n, r) => n + (seat.pilotTicks[r] ?? 0), 0);
        if (afk > held * MM_LIMITS.leaver.afkShare) {
            holder.event = 'afk';
            holder.eventTick = holder.joinedTick;
        }
    }
    return out;
}
