/**
 * The party client's pacing loop (MULTIPLAYER.md §4.2), shared by the net-host worker and the inline fallback: it
 * steps a turn the moment one is due (a kick on every arrival) and otherwise sleeps until the core's next wake (a
 * queued turn's playout time, half a turn while catching up, or one turn while holding, so `waiting` and the status
 * line still update). Timer-injected, so tests and the latency harness run it on any clock.
 */
import { TURN_MS } from './lockstep';

export interface PaceTarget {
  pace(nowMs: number): void;
  wakeAt(nowMs: number): number;
}

export interface PacerEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
}

export class Pacer {
  private timer: unknown = null;
  private at = Infinity;
  private started = false;
  private stopped = false;

  constructor(
    private readonly core: PaceTarget,
    private readonly env: PacerEnv,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  /** The match started: the first wake one turn from now. */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.schedule(this.env.now() + TURN_MS);
  }

  /** Turns arrived, or the core's state changed (drain, visible again): step now if one is due, else re-aim the timer. */
  kick(): void {
    if (!this.started || this.stopped) return;
    const now = this.env.now();
    const at = this.core.wakeAt(now);
    if (at <= now) this.run();
    else if (at < this.at - 0.5) this.schedule(at);
  }

  private readonly run = (): void => {
    this.clear();
    if (this.stopped) return;
    try {
      this.core.pace(this.env.now());
    } catch (err) {
      this.onError(err);
      return;
    }
    const now = this.env.now();
    this.schedule(Math.max(now, this.core.wakeAt(now)));
  };

  private schedule(at: number): void {
    this.clear();
    this.at = at;
    this.timer = this.env.setTimer(this.run, Math.max(0, at - this.env.now()));
  }

  private clear(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
    this.at = Infinity;
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }
}
