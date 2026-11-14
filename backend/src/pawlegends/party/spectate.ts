/*
 * Live spectating (docs/plans/moba/SPECTATE.md), the pure parts the relay uses: which room a spectator may watch, the
 * featured pick, how far behind live a spectator's stream runs, and which turns are released now. No sockets, no
 * timers, no sim: the relay owns those (party-relay.ts `spectate`, `pumpWatch`).
 *
 * The spectator re-simulates the room's TURN log with the frozen sim on its own device (as the players do), so the
 * relay spends no sim CPU on it: a spectator costs one socket and a few bytes a turn. Spectators never hold a seat, so
 * nothing they send can reach a TURN (a CMD from one is a strike).
 *
 * Relative imports only: the relay role loads party files without the `src/` alias.
 */
import { SPECTATE_DELAY_MS, SPECTATE_LIMITS, type SpectateInfo } from './net';

export type WatchKind = SpectateInfo['kind'];

/** The shape of a live room the pure helpers read (a subset of the relay's LiveRoom). */
export interface WatchableRoom {
    id: string;
    kind: WatchKind;
    /** Human slots of the match (config.humans). */
    humans: readonly number[];
    /** The sim the room is pinned to. */
    sim: { version: number; hash: string };
    /** Turns closed so far. */
    nextTurn: number;
    /** A seated player turned "Let friends watch" off, or the room is ending, moving or abandoned. */
    closed: boolean;
    /** Spectators now. */
    viewers: number;
    /** 5v5 Classic on Hearthwood. */
    classic: boolean;
    /** Identity keys of the players seated in it (a player never spectates their own match). */
    keys: ReadonlySet<string>;
}

/** Turn length (ms) of the relay clock (party-limits.ts TURN_MS: 2 ticks at 30 Hz). */
const TURN_MS = 1000 / 15;

/** How many turns behind live a spectator of this kind of room runs. */
export function delayTurns(kind: WatchKind, override?: (kind: WatchKind) => number): number {
    const ms = override ? override(kind) : SPECTATE_DELAY_MS[kind];
    return Math.max(0, Math.ceil(ms / TURN_MS));
}

/**
 * The first turn not released yet to a spectator (exclusive end of what it may have now).
 * - Live: `nextTurn - delay`.
 * - After the end: the tail plays out at the live pace from where the delayed stream stood at the end, so the last
 *   `delay` turns are never dumped at once (the spectator sees the finish at match speed).
 */
export function releasedTo(
    room: { nextTurn: number },
    delay: number,
    end: { atMs: number; turn: number } | null,
    nowMs: number
): number {
    if (!end) return Math.max(0, room.nextTurn - delay);
    const from = Math.max(0, end.turn - delay);
    const played = Math.floor(Math.max(0, nowMs - end.atMs) / TURN_MS);
    return Math.min(end.turn, from + played);
}

export type WatchRefusal = 'watch_none' | 'watch_full' | 'watch_update';

/** May this spectator watch this room now? null: yes. */
export function watchRefusal(
    room: WatchableRoom | undefined,
    viewer: { sim: { version: number; hash: string } | null; key: string },
    relayViewers: number
): WatchRefusal | null {
    if (!room || room.closed) return 'watch_none';
    if (room.keys.has(viewer.key)) return 'watch_none';
    if (!viewer.sim || viewer.sim.version !== room.sim.version || viewer.sim.hash !== room.sim.hash)
        return 'watch_update';
    if (room.viewers >= SPECTATE_LIMITS.perRoom || relayViewers >= SPECTATE_LIMITS.perRelay) return 'watch_full';
    return null;
}

/** Turns a room must have played before it can be featured (30 s: past the gates opening, never an empty map). */
export const FEATURED_MIN_TURNS = 450;

/**
 * The featured live match for a viewer (the Social sheet's "Watch live"): a watchable room on the viewer's sim with
 * room to spare, preferring PvP (both teams human), then more humans, 5v5, then the older match. Pure, deterministic.
 */
export function pickFeatured(
    rooms: readonly WatchableRoom[],
    viewer: { sim: { version: number; hash: string } | null; key: string }
): WatchableRoom | null {
    let best: WatchableRoom | null = null;
    let bestScore = -1;
    for (const r of rooms) {
        if (r.nextTurn < FEATURED_MIN_TURNS) continue;
        if (watchRefusal(r, viewer, 0) !== null) continue;
        const pvp = r.kind === 'casual' || r.kind === 'ranked' ? 1 : 0;
        const score =
            pvp * 1_000_000 + r.humans.length * 10_000 + (r.classic ? 5_000 : 0) + Math.min(4_999, r.nextTurn);
        if (score > bestScore || (score === bestScore && best && r.id < best.id)) {
            best = r;
            bestScore = score;
        }
    }
    return best;
}

/** Live rooms a featured pick could choose now (the Social sheet's "Watch live" shows only when there is one). */
export function featuredCount(rooms: readonly WatchableRoom[]): number {
    let n = 0;
    for (const r of rooms)
        if (!r.closed && r.nextTurn >= FEATURED_MIN_TURNS && r.viewers < SPECTATE_LIMITS.perRoom) n++;
    return n;
}
