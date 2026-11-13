/**
 * The replay viewer's scheduler (MATCH-MOMENTS.md §2), run by the existing sim Worker (host/local-host.worker.ts routes
 * every `r:` message here) or on the main thread when Workers are missing. Plays the record at 30 ticks a second ×
 * speed (1, 2 or 4), frozen while paused, and spends a few ms of every wake-up (all of it while paused) on the scout
 * that builds keyframes ahead. Timing never reaches the sim: it only decides how many ticks run.
 */
import type { HostMsg } from '../host/protocol';
import { ReplayCore, type ReplayError, type ReplayInfo, type ReplayRecordLike } from './core';

export const REPLAY_HZ = 30;
export const REPLAY_SPEEDS = Object.freeze([1, 2, 4] as const);
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** Scout work per wake-up while the replay plays (ms), and per slice while it is paused or not started. */
const SCOUT_PLAYING_MS = 6;
const SCOUT_IDLE_MS = 24;

export type ReplayClientMsg =
  | { t: 'r:load'; record: ReplayRecordLike; at?: number; speed?: number }
  | { t: 'r:pause'; paused: boolean }
  | { t: 'r:speed'; speed: number }
  | { t: 'r:leave' };

export type ReplayHostMsg = HostMsg | { t: 'r:info'; info: ReplayInfo } | { t: 'r:error'; why: ReplayError };

export const isReplayClientMsg = (m: unknown): m is ReplayClientMsg => {
  const t = (m as { t?: unknown } | null)?.t;
  return t === 'r:load' || t === 'r:pause' || t === 'r:speed' || t === 'r:leave';
};

export const isReplayHostMsg = (m: unknown): m is ReplayHostMsg => {
  const t = (m as { t?: unknown } | null)?.t;
  return t === 'r:info' || t === 'r:error' || t === 'welcome' || t === 'snap' || t === 'events' || t === 'end';
};

export const clampReplaySpeed = (s: unknown): ReplaySpeed => (s === 2 || s === 4 ? s : 1);

export interface ReplayLoopEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  post(msg: ReplayHostMsg): void;
}

export class ReplayLoop {
  readonly core = new ReplayCore();
  private paused = true;
  private base = 0;
  private done = 0;
  private timer: unknown = null;
  private idle: unknown = null;
  private left = false;

  constructor(private readonly env: ReplayLoopEnv) {}

  handle(msg: ReplayClientMsg): void {
    switch (msg.t) {
      case 'r:load': {
        this.stop();
        this.left = false;
        const why = this.core.load(msg.record);
        if (why) {
          this.env.post({ t: 'r:error', why });
          return;
        }
        this.core.speed = clampReplaySpeed(msg.speed);
        // a seek past the scout waits for it (bounded: the viewer only offers ticks the scout has run)
        const at = Math.max(0, Math.floor(msg.at ?? 0));
        while (this.core.info.scouted < at && !this.core.info.done) this.core.scoutFor(KEY_CHUNK, 1e9, this.env.now);
        for (const m of this.core.start(at)) this.env.post(m);
        this.env.post({ t: 'r:info', info: { ...this.core.info, deaths: this.core.info.deaths.slice(), takedowns: this.core.info.takedowns.slice() } });
        this.paused = true;
        this.scheduleIdle();
        break;
      }
      case 'r:pause':
        if (msg.paused === this.paused || !this.core.started) break;
        this.paused = msg.paused;
        if (this.paused) {
          this.stop();
          this.scheduleIdle();
        } else this.restart();
        break;
      case 'r:speed':
        this.core.speed = clampReplaySpeed(msg.speed);
        if (!this.paused) this.restart();
        break;
      case 'r:leave':
        this.left = true;
        this.stop();
        break;
    }
  }

  private restart(): void {
    this.base = this.env.now();
    this.done = 0;
    this.schedule();
  }

  private stop(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    if (this.idle !== null) this.env.clearTimer(this.idle);
    this.timer = this.idle = null;
  }

  private schedule(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = this.env.setTimer(() => this.wake(), Math.max(1, 1000 / (REPLAY_HZ * this.core.speed)));
  }

  /** Scout in slices while nothing plays (paused, before the countdown ends). */
  private scheduleIdle(): void {
    if (this.idle !== null || this.left || this.core.info.done) return;
    this.idle = this.env.setTimer(() => {
      this.idle = null;
      if (this.left) return;
      this.scout(SCOUT_IDLE_MS);
      if (this.paused) this.scheduleIdle();
    }, 4);
  }

  private scout(ms: number): void {
    if (this.core.info.done) return;
    const before = this.core.info.deaths.length + this.core.info.takedowns.length;
    const wasDone = this.core.info.done;
    const wasSlow = this.core.info.slow;
    const lastScouted = this.core.info.scouted;
    this.core.scoutFor(KEY_CHUNK * 4, ms, this.env.now);
    const i = this.core.info;
    // the bar's buffered part moves in 1 s steps (and on any marker or verdict change)
    if (i.deaths.length + i.takedowns.length !== before || i.done !== wasDone || i.slow !== wasSlow || Math.floor(i.scouted / 30) !== Math.floor(lastScouted / 30))
      this.env.post({ t: 'r:info', info: { ...i, deaths: i.deaths.slice(), takedowns: i.takedowns.slice() } });
  }

  private wake(): void {
    this.timer = null;
    if (this.paused || this.left || this.core.ended) return;
    const speed = this.core.speed;
    const due = Math.floor(((this.env.now() - this.base) * REPLAY_HZ * speed) / 1000) - this.done;
    const cap = 10 * speed;
    let n = due;
    if (n > cap) {
      this.done += n - cap;
      n = cap;
    }
    if (n > 0) {
      this.done += n;
      for (const m of this.core.advance(n)) this.env.post(m);
    }
    this.scout(SCOUT_PLAYING_MS);
    if (!this.core.ended) this.schedule();
    else this.scheduleIdle();
  }
}

/** Scout chunk (ticks) between clock reads when catching up to a seek target. */
const KEY_CHUNK = 300;
