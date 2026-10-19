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

export class JuiceBus {
  private listeners: JuiceListener[] = [];

  add(l: JuiceListener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  emit(events: readonly RaceEvent[], info: FrameInfo): void {
    for (const e of events) for (const l of this.listeners) l.onEvent?.(e, info);
  }

  frame(info: FrameInfo): void {
    for (const l of this.listeners) l.onFrame?.(info);
  }

  reset(): void {
    for (const l of this.listeners) l.onReset?.();
  }
}
