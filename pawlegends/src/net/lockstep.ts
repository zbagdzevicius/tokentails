/**
 * The client's lockstep runner (docs/plans/moba/MULTIPLAYER.md §4.2): a playout buffer and pacing for TURN frames.
 * Pure and fake-clock testable. Stepping is driven by turn arrival in the worker (the Pacer kicks on every arrival and
 * otherwise sleeps until `wakeAt`), never by main-thread rAF (an offscreen cross-origin iframe throttles rAF without a
 * visibilitychange). Which turns step, and in which order, never changes: only WHEN they step.
 *
 * Playout clock (§4.2 latency pass; it replaced a free-running 15 Hz slot timer whose B..B+2 queue never drained):
 * - Every live turn k that arrives at time a gives an offset sample e = a − k × TURN_MS (the relay's turn clock seen
 *   from here). The smallest offset over the last JITTER_WINDOW samples is "on time"; a sample's lateness is e − that.
 * - The margin M is the JITTER_PCT percentile of the window's lateness (stalls longer than MAX_MARGIN_MS are left out:
 *   no buffer should cover them), 0..MAX_MARGIN_MS. M rises at once and falls by at most MARGIN_FALL_MS per sample
 *   (smooth changes: never a sudden speed-up).
 * - Turn k steps at max(arrival, k × TURN_MS + smallest offset + M): on a clean link (M ≈ 0) a turn steps the moment
 *   it arrives; on a jittery one the early turns wait just long enough to keep an even pace. No turn waits longer than
 *   M after it arrived.
 * - Turns that arrive together (a TCP burst after a stall) all move the on-time offset (the burst's last turn is the
 *   most on time), but only the first counts as a lateness sample; catch-up frames give no sample at all.
 * - Two or more turns due at once step 2 per call (catch-up), MAX_TURNS_PER_SLOT once more than BIG_BACKLOG are due;
 *   the pacer calls again half a turn later while a backlog is left.
 * - `drain()` (the relay ended the match): every queued turn is due.
 * - A hold episode: nothing queued and no turn arrived for 1.5 turns plus M. `waiting` is true after 500 ms of
 *   holding, never while the room is paused by vote.
 * - `B` (analytics `buffer`, the fast-forward floor) is the margin in turns: 1 + round(M / TURN_MS), 1..5.
 */
export const TURN_MS = 200 / 3;
export const MIN_B = 1;
export const MAX_B = 5;
/** Offset samples kept (3 s of turns). */
export const JITTER_WINDOW = 45;
/** The lateness percentile the margin covers. */
export const JITTER_PCT = 0.9;
/** The largest margin (4 turns, ≈ 267 ms): as much as the old B = 5. */
export const MAX_MARGIN_MS = (MAX_B - 1) * TURN_MS;
/** How fast the margin may fall per sample (≈ 8 ms per turn: a 12% speed-up at most). */
export const MARGIN_FALL_MS = TURN_MS / 8;
/** Turns that arrive closer together than this came in one burst (one sample). */
export const BURST_MS = 8;
export const WAITING_AFTER_MS = 500;
export const MAX_TURNS_PER_SLOT = 5;
const CATCHUP_TURNS = 2;
const BIG_BACKLOG = 6;

export class LockstepRunner<T> {
  B = MIN_B;
  /** The playout margin now (ms). */
  marginMs = 0;
  readonly queue: T[] = [];
  /** When each queued turn may step (ms, the clock of `push` and `due`). */
  private readonly playAt: number[] = [];
  /** Stream index of the next pushed turn (relative: only differences matter). */
  private pushed = 0;
  private offsets: number[] = [];
  /** Per offset: a lateness sample too (not a burst follower). */
  private spaced: boolean[] = [];
  private minOffset = 0;
  private lastArrivalMs = -Infinity;
  private lastStepMs = -Infinity;
  private lastNowMs: number;
  private draining = false;
  private holdingSince: number | null = null;
  /** The room is paused by vote: holds are expected and never show "Waiting for server". */
  paused = false;
  /** Every hold episode so far (analytics `mp_net.holds`). */
  holds = 0;
  catchups = 0;
  /** Live turns that came after their playout time (they step on arrival). Diagnostics. */
  late = 0;

  constructor(nowMs = 0) {
    this.lastNowMs = nowMs;
  }

  /**
   * A turn arrived at `nowMs`. `sample` is false for catch-up frames (a resync or a gap fill): they say nothing about
   * the live link.
   */
  push(item: T, nowMs = this.lastNowMs, sample = true): void {
    const k = this.pushed++;
    const e = nowMs - k * TURN_MS;
    const burst = nowMs - this.lastArrivalMs < BURST_MS;
    this.lastArrivalMs = nowMs;
    if (sample) this.addSample(e, !burst);
    // a catch-up turn (or one before any sample) is due on arrival
    const at = !sample || this.offsets.length === 0 ? nowMs : Math.max(nowMs, k * TURN_MS + this.minOffset + this.marginMs);
    if (sample && this.offsets.length > 1 && e - this.minOffset > this.marginMs + 1) this.late++;
    this.queue.push(item);
    this.playAt.push(at);
  }

  private addSample(e: number, spaced: boolean): void {
    this.offsets.push(e);
    this.spaced.push(spaced);
    if (this.offsets.length > JITTER_WINDOW) {
      this.offsets.shift();
      this.spaced.shift();
    }
    let min = Infinity;
    for (const o of this.offsets) if (o < min) min = o;
    this.minOffset = min;
    const lateness: number[] = [];
    for (let i = 0; i < this.offsets.length; i++) {
      const l = this.offsets[i] - min;
      if (this.spaced[i] && l <= MAX_MARGIN_MS) lateness.push(l);
    }
    lateness.sort((a, b) => a - b);
    const target = lateness.length ? lateness[Math.min(lateness.length - 1, Math.floor(lateness.length * JITTER_PCT))] : 0;
    this.marginMs = target >= this.marginMs ? target : Math.max(target, this.marginMs - MARGIN_FALL_MS);
    this.B = Math.max(MIN_B, Math.min(MAX_B, 1 + Math.round(this.marginMs / TURN_MS)));
  }

  /** The stream is over (the relay's `end`): every queued turn is due. */
  drain(): void {
    this.draining = true;
  }

  private ready(nowMs: number): number {
    if (this.draining) return this.queue.length;
    let n = 0;
    while (n < this.queue.length && this.playAt[n] <= nowMs + 0.5) n++;
    return n;
  }

  /** The turns to step now (taken off the queue). */
  due(nowMs: number): T[] {
    this.lastNowMs = nowMs;
    const ready = this.ready(nowMs);
    if (ready === 0) {
      if (this.queue.length === 0) this.markHold(nowMs);
      return [];
    }
    this.holdingSince = null;
    let n = 1;
    if (ready > 1) {
      n = Math.min(ready, ready > BIG_BACKLOG ? MAX_TURNS_PER_SLOT : CATCHUP_TURNS);
      this.catchups++;
    }
    this.lastStepMs = nowMs;
    this.playAt.splice(0, n);
    return this.queue.splice(0, n);
  }

  /** When the pacer should call `due` next (≤ now: at once). At most every half turn while a backlog is left. */
  wakeAt(nowMs: number): number {
    if (this.queue.length === 0) return nowMs + TURN_MS;
    const gap = this.lastStepMs + TURN_MS / 2;
    if (this.ready(nowMs) > 0) return Math.max(nowMs, gap);
    return Math.max(this.playAt[0], gap);
  }

  private markHold(nowMs: number): void {
    if (this.paused) {
      this.holdingSince = null;
      return;
    }
    if (this.holdingSince !== null) return;
    // starved: nothing arrived for 1.5 turns plus the margin (before the first turn: at once)
    if (this.lastArrivalMs > -Infinity && nowMs - this.lastArrivalMs < TURN_MS * 1.5 + this.marginMs) return;
    this.holdingSince = nowMs;
    this.holds++;
  }

  /** Take `n` turns off the queue outside `due` (a fast-forward slice). */
  take(n: number): T[] {
    this.playAt.splice(0, n);
    return this.queue.splice(0, n);
  }

  /** True after 500 ms of holding (not while paused): the rail shows "Waiting for server…". */
  waiting(nowMs: number): boolean {
    return !this.paused && this.holdingSince !== null && nowMs - this.holdingSince >= WAITING_AFTER_MS;
  }

  /** A new stream (rebuild): the queue and the link estimate start over. */
  clear(): void {
    this.queue.length = 0;
    this.playAt.length = 0;
    this.offsets = [];
    this.spaced = [];
    this.pushed = 0;
    this.marginMs = 0;
    this.B = MIN_B;
    this.lastArrivalMs = -Infinity;
    this.holdingSince = null;
    this.draining = false;
  }
}
