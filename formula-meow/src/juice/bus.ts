/**
 * Juice bus (GDD 16): the ONLY way the juice lane (audio, music, VFX, camera feel, haptics) reacts to the race.
 * The shell drains the sim's RaceEvent log into `emit` once per frame and calls `frame` with read-only state.
 * Subscribers never write the sim.
 */
import type { RaceEvent, RaceState } from '../types';

export interface FrameInfo {
  st: RaceState;
  /** the kart the camera follows (the player) */
  me: number;
  /** real seconds since the last frame */
  dt: number;
  /** interpolation alpha between the last two ticks */
  alpha: number;
  topSpeed: number;
  /** race is paused (menus) */
  paused: boolean;
}

export interface JuiceListener {
  onEvent?(e: RaceEvent, info: FrameInfo): void;
  onFrame?(info: FrameInfo): void;
  /** race torn down (restart, next track) */
  onReset?(): void;
}

/**
 * B56: a listener that throws never aborts the shell's start() or freezes the render; each listener's first error is
 * logged once (console.warn, so a broken effect is visible in QA without failing the race).
 */
export class JuiceBus {
  private listeners: JuiceListener[] = [];
  private failed = new WeakSet<JuiceListener>();

  add(l: JuiceListener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private fail(l: JuiceListener, where: string, err: unknown): void {
    if (this.failed.has(l)) return;
    this.failed.add(l);
    console.warn(`[juice] a listener failed in ${where}`, err);
  }

  emit(events: readonly RaceEvent[], info: FrameInfo): void {
    this.emitRange(events, 0, info);
  }

  /** Events from index `from` on (the shell's per-frame drain, without copying the log). */
  emitRange(events: readonly RaceEvent[], from: number, info: FrameInfo): void {
    for (let i = from; i < events.length; i++) {
      const e = events[i];
      for (const l of this.listeners) {
        if (!l.onEvent) continue;
        try {
          l.onEvent(e, info);
        } catch (err) {
          this.fail(l, 'onEvent', err);
        }
      }
    }
  }

  frame(info: FrameInfo): void {
    for (const l of this.listeners) {
      if (!l.onFrame) continue;
      try {
        l.onFrame(info);
      } catch (err) {
        this.fail(l, 'onFrame', err);
      }
    }
  }

  reset(): void {
    for (const l of this.listeners) {
      if (!l.onReset) continue;
      try {
        l.onReset();
      } catch (err) {
        this.fail(l, 'onReset', err);
      }
    }
  }
}
