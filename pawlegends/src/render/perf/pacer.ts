/**
 * PERF-IOS P1-1: the frame pacer. `requestAnimationFrame` keeps running (input, the loop stays alive), but a frame
 * is only simulated and drawn once `1000 / fps` ms have passed since the last drawn one, with a TOLERANCE_MS slack so
 * a 60 Hz display never drops a 60 fps target to 30 by jitter, and a 120 Hz display draws every second refresh.
 *
 * Targets (`paceTarget`): the match 60 (30 with Battery saver or when the governor reached its 30 fps step); every
 * menu, the lobby turntable, the pick and results screens 30; a paused match and a full-screen panel over the lobby
 * PAUSED_FPS. Animation speed never changes: the caller passes the real time since the last drawn frame as `dt`.
 * Pure (no globals), unit-tested.
 */
export const TOLERANCE_MS = 2;
export const MATCH_FPS = 60;
export const SAVER_FPS = 30;
export const MENU_FPS = 30;
export const PAUSED_FPS = 15;

export interface PaceInput {
  inMatch: boolean;
  paused: boolean;
  /** A full-screen panel covers the 3D view (settings, store, a modal). */
  covered: boolean;
  /** Battery saver on, or the thermal governor's 30 fps step. */
  saver: boolean;
}

export function paceTarget(p: PaceInput): number {
  if (p.inMatch) {
    if (p.paused || p.covered) return PAUSED_FPS;
    return p.saver ? SAVER_FPS : MATCH_FPS;
  }
  return p.covered ? PAUSED_FPS : MENU_FPS;
}

export class FramePacer {
  /**
   * The next frame's due time (ms) on a fixed grid of `1000 / fps` steps, so a jittery or fast display averages the
   * target exactly; after a stall the grid restarts from now (no burst of catch-up frames).
   */
  private next = -Infinity;
  /** Frames skipped since the last drawn one (perf readout). */
  skipped = 0;

  /** True when this rAF callback should draw at `fps`. Records it as drawn. */
  due(now: number, fps: number): boolean {
    const interval = 1000 / Math.max(1, fps);
    if (now < this.next - TOLERANCE_MS) {
      this.skipped++;
      return false;
    }
    this.next = this.next === -Infinity ? now + interval : Math.max(this.next + interval, now + interval * 0.5);
    this.skipped = 0;
    return true;
  }

  /** The next frame draws whatever the time (resume from the background, a new target). */
  reset(): void {
    this.next = -Infinity;
  }
}
