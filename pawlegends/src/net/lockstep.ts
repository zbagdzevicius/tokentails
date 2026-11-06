/**
 * The client's lockstep runner (docs/plans/moba/MULTIPLAYER.md §4.2): a jitter buffer and pacing for TURN frames.
 * Pure and fake-clock testable; the net-host worker calls `due(now)` once per pacing slot (one turn, 66.7 ms) and
 * steps that many turns. Stepping is driven by turn arrival in the worker, never by main-thread rAF (an offscreen
 * cross-origin iframe throttles rAF without a visibilitychange).
 *
 * - The buffer B starts at 1 turn: a turn steps once B turns are queued, or once it waited B pacing slots (its playout
 *   deadline: a late stream never strands queued turns, and the last turns of a match always step).
 * - `drain()` (the relay ended the match): every queued turn steps, B no longer matters.
 * - B grows by 1 after more than 2 hold episodes in 5 s, shrinks by 1 after 10 s without a hold; 1..5, at most one
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
const SHRINK_AFTER_MS = 10_000;
const CHANGE_EVERY_MS = 3000;
export const WAITING_AFTER_MS = 500;
export const MAX_TURNS_PER_SLOT = 5;

export class LockstepRunner<T> {
  B = MIN_B;
  readonly queue: T[] = [];
  /** When each queued turn arrived (the last pacing time, same clock as `due`). */
  private readonly arrived: number[] = [];
  private lastNowMs: number;
  private draining = false;
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
    this.lastNowMs = nowMs;
  }

  push(item: T, nowMs = this.lastNowMs): void {
    this.queue.push(item);
    this.arrived.push(nowMs);
  }

  /** The stream is over (the relay's `end`): step whatever is queued, one slot at a time. */
  drain(): void {
    this.draining = true;
  }

  /** How many queued turns to step in this pacing slot (and take them off the queue). */
  due(nowMs: number): T[] {
    this.lastNowMs = nowMs;
    this.adapt(nowMs);
    const q = this.queue.length;
    const late = q > 0 && (this.draining || nowMs - this.arrived[0] >= this.B * TURN_MS - 1);
    if (q < this.B && !late) {
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
    this.arrived.splice(0, n);
    return this.queue.splice(0, n);
  }

  /** Take `n` turns off the queue outside `due` (a fast-forward slice). */
  take(n: number): T[] {
    this.arrived.splice(0, n);
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
    this.arrived.length = 0;
    this.holdingSince = null;
    this.draining = false;
  }
}
