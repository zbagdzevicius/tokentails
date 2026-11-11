/*
 * One party room (docs/plans/moba/MULTIPLAYER.md §3.2): the turn clock, command intake, pilots, votes, timers and the
 * TURN log. A pure class: no sockets, no timers, no sim. Time comes in through `advance(nowMs)`; everything it says
 * goes out through `RoomIO`. The relay service owns the sockets, the referee pool owns the sim.
 *
 * Lockstep (D2, D3): turn T covers ticks 2T and 2T+1. Turn T closes at start + (T + 1) × 66.7 ms; a late loop closes
 * every overdue turn in order and never skips one or waits for a client. A closed TURN is appended to the log,
 * broadcast to every socket and posted to the referee.
 */
import {
    CMD_OP,
    MAX_HUMANS,
    cmdSize,
    leadSlotOf,
    teamOfSlot,
    encodeTurnBody,
    turnFromBody,
    type SlotReason,
    type TurnEntry,
    type VoteKind,
} from './net';
import { PARTY_LIMITS, TURN_MS, TURN_TICKS } from './party-limits';

export type PilotReason = 'drop' | 'away' | 'afk' | 'late' | 'desync' | 'restore' | 'open' | 'before';
/**
 * Pilot reasons that count toward the AFK rule (§6 item 4); the others never do. `before` is never a live reason: it
 * holds the AFK-reason ticks of a seat's earlier holder after a Quick Play backfill (`reopen`).
 */
export const AFK_REASONS: readonly PilotReason[] = ['drop', 'away', 'afk'];
export const PILOT_REASONS: readonly PilotReason[] = [
    'drop',
    'away',
    'afk',
    'late',
    'desync',
    'restore',
    'open',
    'before',
];

export type RoomStatus = 'waiting' | 'live' | 'paused' | 'ended' | 'abandoned';

export interface RoomVerdict {
    finalHash: string;
    outcome: 'won' | 'lost';
    ticks: number;
    winner: number;
    reason?: string;
}

/** Everything a room says. */
export interface RoomIO {
    /** A TURN frame to every socket of the room. */
    turn(frame: Uint8Array, body: Uint8Array, turn: number): void;
    /** A JSON message to one slot's socket, or to every socket when `slot` is null. */
    json(slot: number | null, msg: Record<string, unknown>): void;
    /** Send CATCHUP to `slot` from `fromTurn` (the relay paces it). */
    catchup(slot: number, fromTurn: number): void;
    /** Structured counter/log line (never ids in clear). */
    log?(event: string, props: Record<string, unknown>): void;
}

interface OpenTurn {
    cmd: [Uint8Array | null, Uint8Array | null];
    ping: [Uint8Array | null, Uint8Array | null];
    pilot: [Uint8Array | null, Uint8Array | null];
}

export interface SlotState {
    slot: number;
    /** A member holds this seat (false: an open seat flown by a pilot until someone claims it). */
    occupied: boolean;
    mode: 'human' | 'pilot';
    reason: PilotReason | null;
    connected: boolean;
    conn: 'on' | 'away' | 'off';
    lastBeatMs: number;
    lastCmdMs: number;
    lastTurnSeen: number;
    lastSeq: number;
    ackedSeq: number;
    loaded: boolean;
    afkWarned: boolean;
    resyncs: number;
    /** The tick of the slot's last rebuild from turn 0 (>= 0 until it agrees with the referee again; -1 never). */
    rebuiltAtTick: number;
    /** No more resyncs: watch only, piloted (after the caps). */
    watching: boolean;
    pilotTicks: Record<PilotReason, number>;
    bucket: { tokens: number; atMs: number };
    dropped: number;
    voteAt: Partial<Record<VoteKind, number>>;
    alive: boolean;
    open: OpenTurn;
}

export interface RoomInit {
    id: string;
    /** Human slots of the match config (ascending, with 0). */
    humans: readonly number[];
    /** Seats with a member (the rest of `humans` are open seats). */
    occupied: readonly number[];
    difficulty: string;
    /** The tick from which a surrender applies (0 = never). */
    forfeitFrom: number;
    nowMs: number;
    /** When turn 0 opens (after the start countdown). */
    startMs: number;
    /** Stagger offset of this room's turn boundaries (ms, 0..66). */
    phaseMs?: number;
    /**
     * Casual PvP (docs/plans/moba/V16.md §4.2): humans on both teams. Pings from both leads (0 and 3), surrender and
     * remake votes per team, no pause, a remake voids the room.
     */
    pvp?: boolean;
    /** PvP: slots that queued together (pre-made parties); a restored room has none (the remake rule then ignores it). */
    premade?: readonly (readonly number[])[];
    /**
     * Seats per team (MAP-5V5.md §9.2): 3 on Crossing (6 slots), 5 on Hearthwood (10 slots: team 1 is 5..9, its PvP
     * lead slot 5). Default 3.
     */
    teamSize?: 3 | 5;
    /** A restored room: its log so far. */
    restoredLog?: Uint8Array[];
    restoredSeq?: number[];
    restoredPilotTicks?: Record<number, Partial<Record<PilotReason, number>>>;
}

const emptyOpen = (): OpenTurn => ({ cmd: [null, null], ping: [null, null], pilot: [null, null] });
const zeroTicks = (): Record<PilotReason, number> => ({
    drop: 0,
    away: 0,
    afk: 0,
    late: 0,
    desync: 0,
    restore: 0,
    open: 0,
    before: 0,
});

/** Ops a client may send (Forfeit never; Ping only from slot 0). */
const CLIENT_OPS: readonly number[] = [
    CMD_OP.Move,
    CMD_OP.AttackMove,
    CMD_OP.Attack,
    CMD_OP.Cast,
    CMD_OP.Trick,
    CMD_OP.Stop,
    CMD_OP.Nap,
    CMD_OP.Talent,
    CMD_OP.Ping,
];

export type IntakeResult = 'ok' | 'dup' | 'not_human' | 'bad_op' | 'dropped' | 'closed' | 'log_full';

/** A running vote of one team (PvE: team 0 holds every vote). */
interface TeamVote {
    kind: VoteKind;
    yes: Set<number>;
    need: number;
    endsMs: number;
}

/**
 * PvP remake (V16.md §4.2): offered from 1:00 to 3:00 for a team that lost a human seat: left, never loaded, or
 * offline for `offlineMs` (a lost connection counts like a leave, so leaving on purpose is no better than dropping).
 */
export const REMAKE = Object.freeze({ fromTick: 1800, untilTick: 5400, voteMs: 20_000, offlineMs: 60_000 });

export class Room {
    readonly id: string;
    readonly humans: readonly number[];
    readonly difficulty: string;
    readonly forfeitFrom: number;
    readonly pvp: boolean;
    /** Seats per team (3, or 5 on Hearthwood) and hero slots in all. */
    readonly teamSize: 3 | 5;
    readonly slotCount: number;
    readonly slots: SlotState[] = [];
    /** PvP: the room was voided by a passed remake vote (no verdict, no rewards, no rating). */
    voided: 'remake' | null = null;
    status: RoomStatus = 'waiting';
    /** The next turn to close (= the open turn). */
    nextTurn = 0;
    startMs: number;
    readonly log: Uint8Array[] = [];
    logBytes = 0;
    /** Turns in the log the store already holds (N9 checkpoints append from here). */
    checkpointedTurn = 0;
    /** The room is unscored for everyone (referee divergence, no ticket secret...). */
    unscored: string | null = null;
    /** Some human slot sent at least one command (abandonment: 30 s before, 120 s after). */
    played = false;
    /** Open seats nobody claimed by tick 1,800 (S5: lower-tier catnip). */
    openUnclaimedAt1800 = false;
    verdict: RoomVerdict | null = null;
    /** Turn overruns seen by advance (ms late when a turn closed), for turn_overrun_ms. */
    overrunsMs: number[] = [];
    private emptySinceMs: number | null = null;
    /** Surrender passed, per team (PvE: team 0 only). */
    private readonly forfeitQueued = [false, false];
    private readonly forfeitSent = [false, false];
    private pausedAtMs = 0;
    private pauseUntilMs = 0;
    private resumeAtMs = 0;
    private pausesUsed = 0;
    private readonly votes: (TeamVote | null)[] = [null, null];
    /** Desync bookkeeping by tick. */
    private hashes = new Map<number, { referee?: number; clients: Map<number, number>; flagged: Set<number> }>();
    private refereeTick = 0;
    private resyncsTotal = 0;
    private refereeSuspect = false;
    /** Ticks each slot already reported a hash for (one per 30-tick mark; a repeat is ignored). */
    private readonly hashTicks: Set<number>[] = Array.from({ length: MAX_HUMANS }, () => new Set<number>());
    private readonly createdMs: number;
    /** PvP: when each seat's holder went offline (disconnect or leave), null while connected. */
    private readonly offSinceMs: (number | null)[] = Array.from({ length: MAX_HUMANS }, () => null);
    /** PvP: the pre-made group of each slot (slots that queued together), or null for a solo. */
    private readonly premadeOf: (readonly number[] | null)[] = Array.from({ length: MAX_HUMANS }, () => null);

    constructor(init: RoomInit, private readonly io: RoomIO) {
        this.id = init.id;
        this.createdMs = init.nowMs;
        this.humans = init.humans.slice();
        this.difficulty = init.difficulty;
        this.forfeitFrom = init.forfeitFrom;
        this.pvp = !!init.pvp;
        this.teamSize = init.teamSize === 5 ? 5 : 3;
        this.slotCount = Math.min(MAX_HUMANS, 2 * this.teamSize);
        for (const g of init.premade ?? [])
            for (const slot of g) if (slot >= 0 && slot < this.slotCount) this.premadeOf[slot] = g;
        this.startMs = init.startMs + (init.phaseMs ?? 0);
        for (let s = 0; s < this.slotCount; s++) {
            const human = init.humans.includes(s);
            const occupied = human && init.occupied.includes(s);
            this.slots.push({
                slot: s,
                occupied,
                mode: 'pilot',
                reason: human ? (occupied ? 'late' : 'open') : null,
                connected: false,
                conn: 'off',
                lastBeatMs: init.nowMs,
                lastCmdMs: init.nowMs,
                lastTurnSeen: 0,
                lastSeq: init.restoredSeq?.[s] ?? 0,
                ackedSeq: init.restoredSeq?.[s] ?? 0,
                loaded: false,
                afkWarned: false,
                resyncs: 0,
                rebuiltAtTick: -1,
                watching: false,
                pilotTicks: { ...zeroTicks(), ...(init.restoredPilotTicks?.[s] ?? {}) },
                bucket: { tokens: PARTY_LIMITS.cmdBucket.burst, atMs: init.nowMs },
                dropped: 0,
                voteAt: {},
                alive: true,
                open: emptyOpen(),
            });
        }
        if (init.restoredLog) {
            for (const body of init.restoredLog) {
                this.log.push(body);
                this.logBytes += body.length;
            }
            this.nextTurn = init.restoredLog.length;
            this.checkpointedTurn = this.nextTurn;
            this.played = true;
            for (const s of this.slots) if (this.isHumanSlot(s.slot)) s.reason = s.occupied ? 'restore' : 'open';
            // A restored room resumes its clock where the log ends.
            this.startMs = init.startMs - this.nextTurn * TURN_MS + (init.phaseMs ?? 0);
        }
    }

    isHumanSlot(slot: number): boolean {
        return this.humans.includes(slot);
    }

    /** The tick the open turn starts on. */
    get tick(): number {
        return this.nextTurn * TURN_TICKS;
    }

    get modeMask(): number {
        let m = 0;
        for (const s of this.slots) if (this.isHumanSlot(s.slot) && s.mode === 'pilot') m |= 1 << s.slot;
        return m;
    }

    get live(): boolean {
        return this.status === 'live' || this.status === 'paused' || this.status === 'waiting';
    }

    // -----------------------------------------------------------------------------------------------------------
    // Sockets and presence

    /** A socket is bound to `slot` (join, reconnect or seat claim). */
    connect(slot: number, nowMs: number): void {
        const s = this.slots[slot];
        if (!s || !this.isHumanSlot(slot)) return;
        s.connected = true;
        s.conn = 'on';
        s.lastBeatMs = nowMs;
        this.offSinceMs[slot] = null;
        if (!s.occupied) {
            // P10: a friend claims an open seat; it stays piloted until the client caught up and sent `back`.
            s.occupied = true;
            s.reason = 'late';
        }
    }

    disconnect(slot: number, nowMs: number): void {
        const s = this.slots[slot];
        if (!s || !s.connected) return;
        s.connected = false;
        s.conn = 'off';
        this.offSinceMs[slot] = nowMs;
        if (s.mode === 'human') this.pilot(slot, 'drop');
        this.touchEmpty(nowMs);
    }

    loaded(slot: number): void {
        const s = this.slots[slot];
        if (s) s.loaded = true;
    }

    beat(slot: number, lastTurn: number, nowMs: number): void {
        const s = this.slots[slot];
        if (!s || !s.connected) return;
        s.lastTurnSeen = Math.min(lastTurn, this.nextTurn);
        this.heard(slot, nowMs);
    }

    /** Any frame from the slot's socket proves it is there (a BEAT delayed behind a busy main thread is not a drop). */
    heard(slot: number, nowMs: number): void {
        const s = this.slots[slot];
        if (!s || !s.connected) return;
        s.lastBeatMs = Math.max(s.lastBeatMs, nowMs);
        if (s.conn === 'away') {
            s.conn = 'on';
            this.io.json(null, { t: 'slot', slot, reason: 'back', laggy: true });
        }
    }

    /**
     * The member left the party mid-match (`party.leave`): a pilot flies the seat (with Open seats a friend may claim
     * it) and the others are told it was a leave, not a drop.
     */
    vacate(slot: number, nowMs: number, reopen = true): void {
        const s = this.slots[slot];
        if (!s || !this.isHumanSlot(slot)) return;
        s.connected = false;
        s.conn = 'off';
        if (this.offSinceMs[slot] === null) this.offSinceMs[slot] = nowMs;
        s.occupied = false;
        s.mode = 'pilot';
        // with Open seats the seat is claimable again; without, a bot just flies it (never an "unclaimed open seat"
        // that would lower the others' catnip at tick 1,800)
        s.reason = reopen ? 'open' : 'drop';
        s.open = emptyOpen();
        this.io.json(null, { t: 'slot', slot, reason: 'left' });
        this.io.log?.('mp_takeover', { slot, reason: 'left' });
        this.touchEmpty(nowMs);
    }

    /**
     * Quick Play backfill (M1A-IMPL.md §3): a piloted human seat whose holder left, dropped or went AFK becomes
     * claimable again (`open`, not occupied). Its AFK-reason pilot ticks so far move to `before`, which the AFK rule
     * never counts, so the backfiller is not judged on the leaver's ticks. The caller claims it at once (the S5
     * "open seat unclaimed at tick 1,800" flag never sees it open across that tick).
     */
    reopen(slot: number, nowMs: number): boolean {
        const s = this.slots[slot];
        if (!s || !this.isHumanSlot(slot) || s.mode !== 'pilot' || !this.live) return false;
        s.connected = false;
        s.conn = 'off';
        s.occupied = false;
        s.reason = 'open';
        s.watching = false;
        s.afkWarned = false;
        s.loaded = false;
        s.lastBeatMs = nowMs;
        s.lastCmdMs = nowMs;
        s.rebuiltAtTick = -1;
        // the new holder's client reports every hash mark again from its catch-up
        this.hashTicks[slot]?.clear();
        for (const r of AFK_REASONS) {
            s.pilotTicks.before += s.pilotTicks[r];
            s.pilotTicks[r] = 0;
        }
        this.touchEmpty(nowMs);
        return true;
    }

    /** The tab was hidden (or the app paused): pilot at once. */
    away(slot: number): void {
        const s = this.slots[slot];
        if (!s) return;
        if (s.mode === 'human') this.pilot(slot, 'away');
    }

    /**
     * The client is caught up and wants its hero back: honoured from the next turn when its last reported turn is
     * within PARTY_LIMITS.reclaimWithinTurns of live, and never while it only watches.
     */
    back(slot: number, nowMs: number): boolean {
        const s = this.slots[slot];
        if (!s || !s.connected || !this.isHumanSlot(slot) || s.mode === 'human' || s.watching) return false;
        if (this.nextTurn - s.lastTurnSeen > PARTY_LIMITS.reclaimWithinTurns) return false;
        this.human(slot, nowMs);
        return true;
    }

    private human(slot: number, nowMs: number): void {
        const s = this.slots[slot];
        s.mode = 'human';
        s.reason = null;
        s.lastCmdMs = nowMs;
        s.afkWarned = false;
        // the flip turn discards this slot's pilot commands
        s.open.pilot = [null, null];
        this.io.json(null, { t: 'slot', slot, reason: 'back' });
        this.io.log?.('mp_reclaim', { slot });
    }

    pilot(slot: number, reason: PilotReason): void {
        const s = this.slots[slot];
        if (!s || !this.isHumanSlot(slot)) return;
        const was = s.mode;
        s.mode = 'pilot';
        s.reason = reason;
        s.open.cmd = [null, null];
        s.open.ping = [null, null];
        if (was === 'human' || reason === 'desync') {
            this.io.json(null, { t: 'slot', slot, reason: reason as SlotReason });
            this.io.log?.('mp_takeover', { slot, reason });
        }
    }

    // -----------------------------------------------------------------------------------------------------------
    // Commands

    /**
     * One client command for `slot` (already size-checked; `cmd` = sim command bytes). Goes into the open turn: the
     * first into sub 0, the next into sub 1, then the newest replaces sub 1. Moves coalesce (B4): a newer Move
     * replaces the pending Move. Over the token bucket a Move still replaces the pending Move; others are dropped.
     */
    intake(slot: number, seq: number, cmd: Uint8Array, nowMs: number): IntakeResult {
        const s = this.slots[slot];
        if (!s || !this.isHumanSlot(slot) || !s.connected) return 'not_human';
        if (this.status === 'ended' || this.status === 'abandoned') return 'closed';
        if (seq <= s.lastSeq) return 'dup';
        const op = cmd[0];
        // Ping from a lead seat only: slot 0, and in PvP slot 3 (team 1's lead)
        if (
            !CLIENT_OPS.includes(op) ||
            cmdSize(op) !== cmd.length ||
            (op === CMD_OP.Ping && slot !== 0 && !(this.pvp && slot === leadSlotOf(1, this.teamSize)))
        )
            return 'bad_op';
        if (s.mode === 'pilot') {
            // An AFK player reclaims with any command; any other pilot reason needs a caught-up `back`.
            if (s.reason !== 'afk' || !s.connected) return 'not_human';
            this.human(slot, nowMs);
        }
        s.lastSeq = seq;
        s.lastCmdMs = nowMs;
        s.afkWarned = false;
        this.played = true;
        if (this.logBytes >= PARTY_LIMITS.roomLogBytes) return 'log_full';
        const isMove = op === CMD_OP.Move;
        if (!isMove) {
            // token bucket for non-move commands (20/s, burst 10)
            const b = s.bucket;
            const refill = ((nowMs - b.atMs) * PARTY_LIMITS.cmdBucket.perSecond) / 1000;
            b.tokens = Math.min(PARTY_LIMITS.cmdBucket.burst, b.tokens + refill);
            b.atMs = nowMs;
            if (b.tokens < 1) {
                s.dropped++;
                return 'dropped';
            }
            b.tokens -= 1;
        }
        place(op === CMD_OP.Ping ? s.open.ping : s.open.cmd, cmd, isMove);
        return 'ok';
    }

    /** Pilot commands from the referee for `slot` (ignored unless the slot is still piloted). */
    pilotCommands(slot: number, cmds: readonly Uint8Array[]): void {
        const s = this.slots[slot];
        if (!s || s.mode !== 'pilot' || !this.live) return;
        for (const c of cmds) {
            const op = c[0];
            if (op === CMD_OP.Ping || op === CMD_OP.Forfeit || cmdSize(op) !== c.length) continue;
            place(s.open.pilot, c, op === CMD_OP.Move);
        }
    }

    // -----------------------------------------------------------------------------------------------------------
    // The clock

    /** Run the room up to `nowMs`: close every overdue turn in order, then the timers. */
    advance(nowMs: number): void {
        if (this.status === 'ended' || this.status === 'abandoned') return;
        if (nowMs - this.createdMs >= PARTY_LIMITS.roomMaxMs) {
            // no match lasts an hour: a stuck room never holds a live-room slot for good
            this.status = 'abandoned';
            this.io.log?.('room_abandoned', { played: this.played, turn: this.nextTurn, why: 'wall' });
            return;
        }
        this.timers(nowMs);
        if (this.status === 'paused') {
            if (this.resumeAtMs > 0 && nowMs >= this.resumeAtMs) this.resume(nowMs);
            else if (nowMs >= this.pauseUntilMs && this.resumeAtMs === 0) this.requestResume(nowMs);
            if (this.status === 'paused') return;
        }
        if (nowMs < this.startMs) return;
        if (this.status === 'waiting') {
            this.status = 'live';
            for (const s of this.slots) {
                if (!this.isHumanSlot(s.slot)) continue;
                // late loaders are piloted from tick 0; the others start as humans
                if (s.occupied && s.loaded && s.connected && s.reason === 'late') {
                    s.mode = 'human';
                    s.reason = null;
                    s.lastCmdMs = nowMs;
                }
            }
        }
        const due = Math.floor((nowMs - this.startMs) / TURN_MS);
        while (this.nextTurn < due && this.status === 'live') {
            const closeAt = this.startMs + (this.nextTurn + 1) * TURN_MS;
            this.overrunsMs.push(Math.max(0, nowMs - closeAt));
            if (this.overrunsMs.length > 512) this.overrunsMs.splice(0, 256);
            this.closeTurn();
        }
    }

    /**
     * Live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §5.5): a restored room held its clock for `ms` while its
     * players reconnected. The turn clock and the silence and AFK timers continue where they were: no turn is skipped
     * and nobody is piloted for the time the whole room was frozen.
     */
    shiftClock(ms: number): void {
        if (!(ms > 0)) return;
        this.startMs += ms;
        for (const s of this.slots) {
            s.lastBeatMs += ms;
            s.lastCmdMs += ms;
        }
    }

    /** The ms until the next turn boundary (the scheduler sleeps this long). */
    msToNextTurn(nowMs: number): number {
        if (this.status !== 'live') return TURN_MS;
        return Math.max(0, this.startMs + (this.nextTurn + 1) * TURN_MS - nowMs);
    }

    private closeTurn(): void {
        const turn = this.nextTurn;
        const entries: TurnEntry[] = [];
        const forfeitHere = [false, false];
        for (const t of [0, 1]) {
            if (this.forfeitQueued[t] && !this.forfeitSent[t]) {
                forfeitHere[t] = true;
                this.forfeitSent[t] = true;
            }
        }
        for (let sub = 0 as 0 | 1; sub < 2; sub = (sub + 1) as 0 | 1) {
            for (const s of this.slots) {
                if (!this.isHumanSlot(s.slot)) continue;
                if (s.mode === 'human') {
                    const p = s.open.ping[sub];
                    if (p) entries.push({ slot: s.slot, sub, pilot: false, cmd: p });
                    const c = s.open.cmd[sub];
                    if (c) entries.push({ slot: s.slot, sub, pilot: false, cmd: c });
                } else {
                    const c = s.open.pilot[sub];
                    if (c) entries.push({ slot: s.slot, sub, pilot: true, cmd: c });
                }
            }
            // a passed surrender: Op.Forfeit in the team's lead stream (slot 0, or slot 3 in PvP), after its commands
            for (const t of [0, 1] as const)
                if (sub === 1 && forfeitHere[t])
                    entries.push({
                        slot: leadSlotOf(t, this.teamSize),
                        sub: 1,
                        pilot: false,
                        cmd: new Uint8Array([CMD_OP.Forfeit]),
                    });
        }
        const acks: (number | undefined)[] = [];
        for (const s of this.slots) {
            if (s.lastSeq !== s.ackedSeq) {
                acks[s.slot] = s.lastSeq;
                s.ackedSeq = s.lastSeq;
            }
            if (this.isHumanSlot(s.slot) && s.mode === 'pilot' && s.reason) s.pilotTicks[s.reason] += TURN_TICKS;
            s.open = emptyOpen();
        }
        const body = encodeTurnBody({ turn, modeMask: this.modeMask, acks, entries });
        this.log.push(body);
        this.logBytes += body.length;
        this.nextTurn = turn + 1;
        if (this.tick >= 1800 && this.tick - TURN_TICKS < 1800) {
            for (const s of this.slots)
                if (this.isHumanSlot(s.slot) && s.reason === 'open') this.openUnclaimedAt1800 = true;
        }
        this.io.turn(turnFromBody(body), body, turn);
    }

    // -----------------------------------------------------------------------------------------------------------
    // Timers (§3.2)

    private timers(nowMs: number): void {
        const paused = this.status === 'paused';
        for (const s of this.slots) {
            if (!this.isHumanSlot(s.slot) || !s.connected || paused) continue;
            const silent = nowMs - s.lastBeatMs;
            if (silent >= PARTY_LIMITS.silentPilotMs && s.mode === 'human') this.pilot(s.slot, 'drop');
            if (silent >= PARTY_LIMITS.silentAwayMs && s.conn === 'on') {
                s.conn = 'away';
                this.io.json(null, { t: 'slot', slot: s.slot, reason: 'drop', laggy: true });
            }
            if (s.mode === 'human' && this.status === 'live' && s.alive) {
                const idle = nowMs - s.lastCmdMs;
                if (idle >= PARTY_LIMITS.afkPilotMs) this.pilot(s.slot, 'afk');
                else if (idle >= PARTY_LIMITS.afkWarnMs && !s.afkWarned) {
                    s.afkWarned = true;
                    this.io.json(s.slot, { t: 'afk', inMs: PARTY_LIMITS.afkPilotMs - idle });
                }
            } else if (!s.alive) s.lastCmdMs = nowMs;
        }
        for (const t of [0, 1] as const) {
            const v = this.votes[t];
            if (v && nowMs >= v.endsMs) {
                this.toTeam(t, { t: 'vote', kind: v.kind, result: 'fail' });
                this.votes[t] = null;
            }
        }
        this.touchEmpty(nowMs);
        if (this.emptySinceMs !== null && this.live) {
            const limit = this.played ? PARTY_LIMITS.abandonAfterPlayMs : PARTY_LIMITS.abandonBeforePlayMs;
            if (nowMs - this.emptySinceMs >= limit) {
                this.status = 'abandoned';
                this.io.log?.('room_abandoned', { played: this.played, turn: this.nextTurn });
            }
        }
    }

    private touchEmpty(nowMs: number): void {
        const anyone = this.slots.some(s => s.connected);
        if (anyone) this.emptySinceMs = null;
        else if (this.emptySinceMs === null) this.emptySinceMs = nowMs;
    }

    // -----------------------------------------------------------------------------------------------------------
    // Votes

    /** The team a slot votes with (PvE: everyone is team 0). */
    private teamOf(slot: number): 0 | 1 {
        return this.pvp ? teamOfSlot(slot, this.teamSize) : 0;
    }

    private connectedHumans(team: 0 | 1): SlotState[] {
        return this.slots.filter(s => this.isHumanSlot(s.slot) && s.connected && this.teamOf(s.slot) === team);
    }

    /** A vote frame to one team (PvP; with `team`), or to every socket (PvE, unchanged). */
    private toTeam(team: 0 | 1, msg: Record<string, unknown>): void {
        if (!this.pvp) return this.io.json(null, msg);
        const out = { ...msg, team };
        for (const s of this.slots)
            if (this.isHumanSlot(s.slot) && teamOfSlot(s.slot, this.teamSize) === team) this.io.json(s.slot, out);
    }

    /**
     * PvP remake (V16.md §4.2): a team may vote it from 1:00 to 3:00 when one of its human seats is gone and flown by a
     * pilot (nobody backfilled it): left, never loaded, or offline for `REMAKE.offlineMs` (`nowMs` given; a lost
     * connection counts like a leave). A seat whose holder queued with every connected human of the team (a pre-made
     * party) never opens it: a duo cannot erase a bad start by one leaving and the other voting.
     */
    remakeOpen(team: 0 | 1, nowMs?: number): boolean {
        if (!this.pvp || this.tick < REMAKE.fromTick || this.tick >= REMAKE.untilTick) return false;
        const voters = this.connectedHumans(team);
        return this.slots.some(s => {
            if (
                !this.isHumanSlot(s.slot) ||
                teamOfSlot(s.slot, this.teamSize) !== team ||
                s.connected ||
                s.mode !== 'pilot'
            )
                return false;
            const off = this.offSinceMs[s.slot];
            const gone =
                !s.occupied || !s.loaded || (nowMs !== undefined && off !== null && nowMs - off >= REMAKE.offlineMs);
            if (!gone) return false;
            const group = this.premadeOf[s.slot];
            return !group || voters.some(v => !group.includes(v.slot));
        });
    }

    castVote(slot: number, kind: VoteKind, yes: boolean, nowMs: number): boolean {
        const s = this.slots[slot];
        if (!s || !s.connected || !this.isHumanSlot(slot)) return false;
        const team = this.teamOf(slot);
        if (kind === 'resume') {
            if (this.status === 'paused' && yes) this.requestResume(nowMs);
            return true;
        }
        if (kind === 'rematch') return false;
        // PvP never pauses (one team cannot stop the other's match); a remake exists only in PvP
        if (this.pvp && kind === 'pause') return false;
        if (kind === 'remake' && !this.remakeOpen(team, nowMs)) return false;
        if (this.status !== 'live' && !(kind === 'surrender' && this.status === 'paused')) return false;
        if (kind === 'surrender' && (this.forfeitFrom <= 0 || this.tick < this.forfeitFrom || this.forfeitQueued[team]))
            return false;
        if (kind === 'pause' && this.pausesUsed >= PARTY_LIMITS.pausesPerMatch) return false;
        let v = this.votes[team];
        if (!v) {
            if (!yes) return false;
            const last = s.voteAt[kind];
            if (last !== undefined && nowMs - last < PARTY_LIMITS.voteCooldownMs) return false;
            s.voteAt[kind] = nowMs;
            const connected = this.connectedHumans(team).length;
            // pause: everyone; remake: every remaining human of the team; surrender: a majority of a full team (2 of 3,
            // 3 of 5; all when fewer are connected)
            const majority = (this.teamSize >> 1) + 1;
            const need = kind === 'pause' || kind === 'remake' ? connected : Math.min(connected, majority);
            const ms =
                kind === 'pause'
                    ? PARTY_LIMITS.pauseVoteMs
                    : kind === 'remake'
                    ? REMAKE.voteMs
                    : PARTY_LIMITS.surrenderVoteMs;
            v = { kind, yes: new Set([slot]), need, endsMs: nowMs + ms };
            this.votes[team] = v;
        } else {
            if (v.kind !== kind) return false;
            if (yes) v.yes.add(slot);
            else {
                this.toTeam(team, { t: 'vote', kind, result: 'fail' });
                this.votes[team] = null;
                return true;
            }
        }
        this.toTeam(team, { t: 'vote', kind, yes: [...v.yes].sort(), need: v.need, endsMs: v.endsMs });
        if (v.yes.size >= v.need) {
            this.votes[team] = null;
            this.toTeam(team, { t: 'vote', kind, result: 'pass' });
            if (kind === 'surrender') this.forfeitQueued[team] = true;
            else if (kind === 'remake') this.void(nowMs);
            else this.pause(nowMs);
        }
        return true;
    }

    /** A passed remake: the clock stops, every socket gets `void`, the relay closes the room without a verdict. */
    private void(nowMs: number): void {
        this.voided = 'remake';
        this.status = 'abandoned';
        this.io.json(null, { t: 'void', reason: 'remake' });
        this.io.log?.('pvp_remake', { tick: this.tick, at_ms: nowMs - this.startMs });
    }

    private pause(nowMs: number): void {
        this.status = 'paused';
        this.pausesUsed++;
        this.pausedAtMs = nowMs;
        this.pauseUntilMs = nowMs + PARTY_LIMITS.pauseMaxMs;
        this.resumeAtMs = 0;
        this.io.json(null, { t: 'paused', paused: true, leftMs: PARTY_LIMITS.pauseMaxMs });
    }

    private requestResume(nowMs: number): void {
        if (this.status !== 'paused' || this.resumeAtMs > 0) return;
        this.resumeAtMs = nowMs + PARTY_LIMITS.resumeCountdownMs;
        this.io.json(null, { t: 'paused', paused: true, leftMs: PARTY_LIMITS.resumeCountdownMs, resuming: true });
    }

    private resume(nowMs: number): void {
        const pausedFor = nowMs - this.pausedAtMs;
        // the turn clock continues where it stopped; the AFK and silence timers were frozen
        this.startMs += pausedFor;
        for (const s of this.slots) {
            s.lastBeatMs += pausedFor;
            s.lastCmdMs += pausedFor;
        }
        this.status = 'live';
        this.resumeAtMs = 0;
        this.io.json(null, { t: 'paused', paused: false });
    }

    get paused(): boolean {
        return this.status === 'paused';
    }

    // -----------------------------------------------------------------------------------------------------------
    // Referee feedback

    /** The referee reached `tick` with world hash `hash` (every 30 ticks) and these slots alive. */
    refereeHash(tick: number, hash: number, aliveMask?: number): void {
        this.refereeTick = Math.max(this.refereeTick, tick);
        if (aliveMask !== undefined) for (const s of this.slots) s.alive = ((aliveMask >>> s.slot) & 1) === 1;
        const e = this.entry(tick);
        e.referee = hash >>> 0;
        this.checkHashes(tick);
        this.sweepHashes();
    }

    /**
     * A client's hash at `tick` (a 30-tick mark it has not reported yet; anything else is ignored). Returns false for a
     * frame that breaks those rules (the relay counts it against the socket's binary budget).
     */
    clientHash(slot: number, tick: number, hash: number): boolean {
        if (tick <= 0 || tick % 30 !== 0 || tick > this.tick + TURN_TICKS * 4) return false;
        const seen = this.hashTicks[slot];
        if (!seen) return false;
        // a rebuilt slot reports the same marks again: a mark below the last one starts a new series
        if (seen.has(tick)) return false;
        seen.add(tick);
        if (seen.size > 64) seen.delete(Math.min(...seen));
        // a slot rebuilding after a resync reports nothing until it is back (stale hashes would look like a 2nd miss)
        if (this.slots[slot]?.reason === 'desync' || this.slots[slot]?.watching) return true;
        const e = this.entry(tick);
        e.clients.set(slot, hash >>> 0);
        this.checkHashes(tick);
        return true;
    }

    get refereeAt(): number {
        return this.refereeTick;
    }

    private entry(tick: number) {
        let e = this.hashes.get(tick);
        if (!e) {
            e = { clients: new Map(), flagged: new Set() };
            this.hashes.set(tick, e);
            if (this.hashes.size > 64) {
                const oldest = Math.min(...this.hashes.keys());
                this.hashes.delete(oldest);
            }
        }
        return e;
    }

    /**
     * Compare the clients' hashes at `tick` with the referee's. A mismatch is judged once every connected, non-watching
     * human slot reported that tick, or once the referee is 90 ticks past it (a slow or catching-up client).
     *
     * The referee is the authority: a client hash can only resync (then, past the caps, pilot) that client. It never
     * makes the room unscored or switches desync detection off, so one member (or two colluding ones) cannot void the
     * room's rewards with forged HASH frames. Two clients agreeing against the referee is logged for ops
     * (`mp_referee_divergence`) and they are not resynced: the end-of-match verify re-sims the raw log independently, so a
     * wrong referee can never score a room.
     */
    private checkHashes(tick: number): void {
        const e = this.hashes.get(tick);
        if (!e || e.referee === undefined) return;
        for (const [slot, h] of e.clients) {
            if (h === e.referee && this.slots[slot].rebuiltAtTick >= 0) this.slots[slot].rebuiltAtTick = -2;
        }
        const expected = this.slots.filter(
            s => this.isHumanSlot(s.slot) && s.connected && !s.watching && s.reason !== 'desync'
        );
        const all = expected.every(s => e.clients.has(s.slot));
        if (!all && this.refereeTick < tick + 90) return;
        for (const [slot, h] of e.clients) {
            if (h === e.referee || e.flagged.has(slot)) continue;
            e.flagged.add(slot);
            let agree = 0;
            for (const [other, oh] of e.clients) if (other !== slot && oh === h) agree++;
            if (agree >= 1) {
                // two clients agree against the referee: no resync storm for them, a log line for ops, nothing else
                // (no unscored room, detection stays on for everyone else and for later ticks)
                if (!this.refereeSuspect) this.refereeDiverged(tick);
                continue;
            }
            this.io.log?.('mp_desync', { slot, tick });
            this.resync(slot, tick);
        }
    }

    /** Judge every pending tick the referee has passed by 90 (called as its hashes arrive). */
    private sweepHashes(): void {
        for (const tick of [...this.hashes.keys()]) if (tick + 90 <= this.refereeTick) this.checkHashes(tick);
    }

    /** Logged once per room for ops; never changes scoring (see checkHashes). */
    private refereeDiverged(tick: number): void {
        this.refereeSuspect = true;
        this.io.log?.('mp_referee_divergence', { tick });
    }

    get suspect(): boolean {
        return this.refereeSuspect;
    }

    private resync(slot: number, tick: number): void {
        const s = this.slots[slot];
        if (s.resyncs >= PARTY_LIMITS.resyncsPerSlot || this.resyncsTotal >= PARTY_LIMITS.resyncsPerRoom) {
            s.watching = true;
            this.pilot(slot, 'desync');
            this.io.json(slot, { t: 'error', code: 'room_gone', watch: true });
            return;
        }
        s.resyncs++;
        this.resyncsTotal++;
        s.rebuiltAtTick = tick;
        // the rebuilt client reports every mark again from tick 30
        this.hashTicks[slot]?.clear();
        this.pilot(slot, 'desync');
        this.io.json(slot, { t: 'resync', reason: 'desync' });
        this.io.catchup(slot, 0);
    }

    /** The referee ended the match. */
    end(verdict: RoomVerdict): void {
        if (this.status === 'ended') return;
        this.verdict = verdict;
        this.status = 'ended';
    }

    /** Turns from `fromTurn` on, as stored bodies. */
    bodiesFrom(fromTurn: number): Uint8Array[] {
        return this.log.slice(Math.max(0, fromTurn));
    }

    /** Serialisable bookkeeping for checkpoints (N9). */
    snapshotMeta() {
        const pilotTicks: Record<number, Record<PilotReason, number>> = {};
        for (const s of this.slots) pilotTicks[s.slot] = { ...s.pilotTicks };
        return {
            lastTurn: this.nextTurn,
            lastSeq: this.slots.map(s => s.lastSeq),
            pilotTicks,
            openUnclaimedAt1800: this.openUnclaimedAt1800,
            unscored: this.unscored,
        };
    }
}

/** Place `cmd` into a 2-sub open turn: Move replaces a pending Move; else the first free sub; else replaces sub 1. */
function place(subs: [Uint8Array | null, Uint8Array | null], cmd: Uint8Array, isMove: boolean): void {
    if (isMove) {
        for (let i = 0; i < 2; i++) {
            const c = subs[i];
            if (c && c[0] === CMD_OP.Move) {
                subs[i] = cmd;
                return;
            }
        }
    }
    if (!subs[0]) subs[0] = cmd;
    else if (!subs[1]) subs[1] = cmd;
    else subs[1] = cmd;
}
