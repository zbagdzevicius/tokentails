/*
 * The relay's turn clock (docs/plans/moba/MULTIPLAYER.md §3.2): one drift-corrected loop for every room. Each wake
 * runs `room.advance(now)` (it closes every overdue turn in order: a late wake never skips a turn and never waits for
 * a client), then sleeps until the earliest next turn boundary. Room boundaries are staggered by `phaseOf(id)` so 150
 * rooms do not all send in one burst. Time and timers are injected (fake-clock testable).
 */
import { createHash } from 'crypto';
import { TURN_MS } from './party-limits';
import type { Room } from './room';

export interface SchedulerEnv {
    now(): number;
    setTimer(fn: () => void, ms: number): unknown;
    clearTimer(h: unknown): void;
}

/** Stagger offset of a room (0..65 ms), stable per room id. */
export const phaseOf = (id: string): number =>
    createHash('sha256').update(id).digest().readUInt16BE(0) % Math.floor(TURN_MS);

export class RoomScheduler {
    private readonly rooms = new Set<Room>();
    private timer: unknown = null;
    private stopped = false;
    /** Called after each room advance (the relay drains pilot commands, persists, ends rooms). */
    onAdvanced?: (room: Room, nowMs: number) => void;

    constructor(private readonly env: SchedulerEnv) {}

    add(room: Room): void {
        this.rooms.add(room);
        this.kick();
    }

    remove(room: Room): void {
        this.rooms.delete(room);
    }

    get size(): number {
        return this.rooms.size;
    }

    stop(): void {
        this.stopped = true;
        if (this.timer !== null) this.env.clearTimer(this.timer);
        this.timer = null;
    }

    /** Run every room now (also the timer callback). */
    wake(): void {
        this.timer = null;
        if (this.stopped) return;
        const now = this.env.now();
        let next = TURN_MS;
        for (const room of [...this.rooms]) {
            room.advance(now);
            this.onAdvanced?.(room, now);
            if (!room.live) {
                this.rooms.delete(room);
                continue;
            }
            next = Math.min(next, room.msToNextTurn(now));
        }
        if (this.rooms.size > 0) this.timer = this.env.setTimer(() => this.wake(), Math.max(1, Math.ceil(next)));
    }

    private kick(): void {
        if (this.stopped) return;
        if (this.timer !== null) this.env.clearTimer(this.timer);
        this.timer = this.env.setTimer(() => this.wake(), 1);
    }
}
