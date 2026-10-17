/**
 * Wall-clock tick scheduler for the LocalHost: 30 ticks a second × speed, catch-up capped so a stalled tab does not
 * fast-forward the match, frozen while paused. Shared by the Worker and the in-thread fallback. Timing here never
 * reaches the sim: it only decides how many `advance` calls happen.
 */
import { HostCore } from './host-core';
import type { ClientMsg, HostMsg } from './protocol';

export const TICK_HZ = 30;
/** At most this many ticks per scheduler wake-up at speed 1 (a 1/3 s catch-up). */
export const MAX_CATCHUP = 10;

export interface TickLoopEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  post(msg: HostMsg): void;
}

export class TickLoop {
  readonly core = new HostCore();
  private paused = false;
  private base = 0;
  private done = 0;
  private timer: unknown = null;

  constructor(private readonly env: TickLoopEnv) {}

  handle(msg: ClientMsg): void {
    switch (msg.t) {
      case 'join': {
        this.stop();
        this.env.post(this.core.join(msg));
        const init = this.core.initial();
        if (init) this.env.post(init);
        this.base = this.env.now();
        this.done = 0;
        this.paused = false;
        this.schedule();
        break;
      }
      case 'cmd':
        this.core.command(msg.bytes);
        break;
      case 'pause':
        if (msg.paused === this.paused) break;
        this.paused = msg.paused;
        if (this.paused) this.stop();
        else {
          this.base = this.env.now();
          this.done = 0;
          this.schedule();
        }
        break;
      case 'leave':
        this.stop();
        break;
    }
  }

  private stop(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.stop();
    const period = 1000 / (TICK_HZ * this.core.speed);
    this.timer = this.env.setTimer(() => this.wake(), Math.max(1, Math.min(1000 / TICK_HZ, period)));
  }

  private wake(): void {
    this.timer = null;
    if (this.paused || !this.core.joined || this.core.ended) return;
    const speed = this.core.speed;
    const due = Math.floor(((this.env.now() - this.base) * TICK_HZ * speed) / 1000) - this.done;
    const cap = MAX_CATCHUP * speed;
    let n = due;
    if (n > cap) {
      // Too far behind (a background tab): drop the backlog instead of fast-forwarding the match.
      this.done += n - cap;
      n = cap;
    }
    if (n > 0) {
      this.done += n;
      for (const m of this.core.advance(n)) this.env.post(m);
    }
    if (!this.core.ended) this.schedule();
  }
}
