/**
 * The client's lockstep runner (docs/plans/moba/MULTIPLAYER.md §4.2): a jitter buffer and pacing for TURN frames.
 * Pure and fake-clock testable; the net-host worker calls `due(now)` once per pacing slot (one turn, 66.7 ms) and
 * steps that many turns. Stepping is driven by turn arrival in the worker, never by main-thread rAF (an offscreen
 * cross-origin iframe throttles rAF without a visibilitychange).
 *
 * - The buffer B starts at 1 turn: a turn steps once B turns are queued.
 * - B grows by 1 after more than 2 hold episodes in 5 s, shrinks by 1 after 20 s without a hold; 1..5, at most one
 *   change every 3 s.
 * - Queue > B + 2: 2 turns per slot (catch-up); never more than 5 turns (10 ticks) per slot.
 * - Queue empty: hold (the renderer interpolates the last snapshot). After 500 ms of holding `waiting` is true, except
 *   while the room is paused by vote.
 */
export const TURN_MS = 200 / 3;
export const MIN_B = 1;
export const MAX_B = 5;
const GROW_HOLDS = 2;
const GROW_WINDOW_MS = 5000;
const SHRINK_AFTER_MS = 20_000;
const CHANGE_EVERY_MS = 3000;
export const WAITING_AFTER_MS = 500;
export const MAX_TURNS_PER_SLOT = 5;

export class LockstepRunner<T> {
  B = MIN_B;
  readonly queue: T[] = [];
  /** Starts of hold episodes (ms). */
  private holdStarts: number[] = [];
  private holdingSince: number | null = null;
  private lastChangeMs = -Infinity;
  private lastHoldMs: number;
  /** The room is paused by vote: holds are expected and never show "Waiting for server". */
  paused = false;
  /** Every hold episode so far (analytics `mp_net.holds`). */
  holds = 0;
  catchups = 0;

  constructor(nowMs = 0) {
    this.lastHoldMs = nowMs;
  }

  push(item: T): void {
    this.queue.push(item);
  }

  /** How many queued turns to step in this pacing slot (and take them off the queue). */
  due(nowMs: number): T[] {
    this.adapt(nowMs);
    const q = this.queue.length;
    if (q < this.B) {
      if (this.holdingSince === null && !this.paused) {
        this.holdingSince = nowMs;
        this.holdStarts.push(nowMs);
        this.holds++;
      }
      this.lastHoldMs = this.paused ? this.lastHoldMs : nowMs;
      return [];
    }
    this.holdingSince = null;
    let n = 1;
    if (q > this.B + 2) {
      n = Math.min(MAX_TURNS_PER_SLOT, 2, q - this.B + 1);
      this.catchups++;
    }
    return this.queue.splice(0, n);
  }

  private adapt(nowMs: number): void {
    while (this.holdStarts.length && nowMs - this.holdStarts[0] > GROW_WINDOW_MS) this.holdStarts.shift();
    if (nowMs - this.lastChangeMs < CHANGE_EVERY_MS) return;
    if (this.holdStarts.length > GROW_HOLDS && this.B < MAX_B) {
      this.B++;
      this.lastChangeMs = nowMs;
      this.holdStarts = [];
    } else if (nowMs - this.lastHoldMs >= SHRINK_AFTER_MS && this.B > MIN_B) {
      this.B--;
      this.lastChangeMs = nowMs;
      this.lastHoldMs = nowMs;
    }
  }

  /** True after 500 ms of holding (not while paused): the rail shows "Waiting for server…". */
  waiting(nowMs: number): boolean {
    return !this.paused && this.holdingSince !== null && nowMs - this.holdingSince >= WAITING_AFTER_MS;
  }

  clear(): void {
    this.queue.length = 0;
    this.holdingSince = null;
  }
}
