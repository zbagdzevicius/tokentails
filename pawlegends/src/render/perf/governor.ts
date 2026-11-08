/**
 * PERF-IOS P1-3: the thermal governor. It steps the render cost down **before** iOS throttles the chip, one step at a
 * time and cheapest visual loss first, and only steps back up after a long clean stretch, so it never bounces.
 *
 * Steps (GOV_STEP; render/quality.ts `tierSettings` applies them on top of the tier and the phone profile):
 *   0 full                    the tier as chosen
 *   1 shadows off             (blob rings stay), far forest at half
 *   2 lighter overlay          overhead canvas DPR 1.25, minimap 10 Hz, particle budget Low
 *   3 Low tier                 lighter meshes, outline hull on the own hero and enemies only
 *   4 30 fps                   the match is capped at 30 fps (and Battery saver turns on, app.ts)
 *   5, 6 resolution           the drawing buffer scales to 0.85, then 0.7 of the tier's DPR (dynamic resolution)
 *
 * Inputs per drawn frame: the interval since the last drawn frame, the frame's JS time, the pacer's target interval,
 * and the iOS thermal state when the app shell forwards it (render/perf/thermal.ts). Decisions are made per WINDOW_MS:
 *   - down when more than SLOW_SHARE of the window's frames were late (interval > target × LATE), or the mean JS time
 *     is over WORK_BUSY × target, or at once (DOWN_GAP_MS apart) when the OS says `serious`/`critical`;
 *   - up one step only after UP_CLEAN_MS of clean windows (≤ CLEAN_SHARE late, JS ≤ WORK_CLEAN × target), at most
 *     once per UP_GAP_MS since the last change, never while the OS is `serious`/`critical`, and never above the step a
 *     thermal event forced (the floor) in this session.
 * Frames over IGNORE_MS (a tab switch, a shader compile) are ignored. Pure and allocation-free; unit-tested.
 */
export const GOV_STEP = Object.freeze({ full: 0, noShadows: 1, lightOverlay: 2, lowTier: 3, fps30: 4, res85: 5, res70: 6 });
export const GOV_MAX = 6;
export const GOV_NAMES: readonly string[] = ['full', 'no shadows', 'light overlay', 'low tier', '30 fps', 'res 0.85', 'res 0.7'];

export const GOV = Object.freeze({
  WINDOW_MS: 3000,
  MIN_FRAMES: 10,
  LATE: 1.11,
  SLOW_SHARE: 0.1,
  CLEAN_SHARE: 0.03,
  WORK_BUSY: 0.5,
  WORK_CLEAN: 0.33,
  UP_CLEAN_MS: 45_000,
  UP_GAP_MS: 60_000,
  DOWN_GAP_MS: 5000,
  IGNORE_MS: 250,
});

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';

export interface GovSample {
  /** Interval since the last drawn frame (ms). */
  frameMs: number;
  /** JS time spent in this frame (ms). */
  workMs: number;
  /** The pacer's target interval (ms): 16.7 at 60 fps, 33.3 at 30. */
  targetMs: number;
  /** performance.now() (ms). */
  now: number;
  thermal?: ThermalState | null;
}

export class ThermalGovernor {
  step: number;
  /** The governor never steps above this (a thermal event raised it). */
  floor = 0;
  lastReason = '';
  /** Changes so far (perf readout, analytics). */
  changes = 0;
  private winStart = -1;
  private winTarget = 0;
  private frames = 0;
  private slow = 0;
  private work = 0;
  private lastAt = -1;
  private lastChange = -Infinity;
  private cleanSince = -1;

  constructor(start = 0) {
    this.step = Math.max(0, Math.min(GOV_MAX, start | 0));
  }

  /** The device is throttling for real: the 30 fps step or an OS `serious`/`critical` state. */
  throttled(thermal?: ThermalState | null): boolean {
    return this.step >= GOV_STEP.fps30 || thermal === 'serious' || thermal === 'critical';
  }

  /** Feed one drawn frame. Returns the new step when it changed, else null. */
  sample(s: GovSample): number | null {
    const hot = s.thermal === 'serious' || s.thermal === 'critical';
    if (hot && s.now - this.lastChange >= GOV.DOWN_GAP_MS) {
      const want = s.thermal === 'critical' ? Math.max(this.step + 1, GOV_STEP.fps30) : this.step + 1;
      const next = Math.min(GOV_MAX, want);
      this.floor = Math.max(this.floor, next);
      if (next !== this.step) return this.change(next, s.now, `thermal ${s.thermal}`);
      this.lastChange = s.now;
    }
    // a gap (background, a long stall) or a new target starts a fresh window
    if (!(s.frameMs > 0) || s.frameMs > GOV.IGNORE_MS || (this.lastAt >= 0 && s.now - this.lastAt > GOV.IGNORE_MS) || s.targetMs !== this.winTarget) {
      this.lastAt = s.now;
      this.resetWindow(s.now, s.targetMs);
      return null;
    }
    this.lastAt = s.now;
    if (this.winStart < 0) this.resetWindow(s.now, s.targetMs);
    this.frames++;
    if (s.frameMs > s.targetMs * GOV.LATE) this.slow++;
    this.work += Math.max(0, s.workMs);
    if (s.now - this.winStart < GOV.WINDOW_MS) return null;
    const frames = this.frames;
    const slowShare = frames > 0 ? this.slow / frames : 0;
    const work = frames > 0 ? this.work / frames : 0;
    const start = this.winStart;
    this.resetWindow(s.now, s.targetMs);
    if (frames < GOV.MIN_FRAMES) return null;
    const bad = slowShare > GOV.SLOW_SHARE || work > s.targetMs * GOV.WORK_BUSY;
    if (bad) {
      this.cleanSince = -1;
      if (this.step < GOV_MAX) return this.change(this.step + 1, s.now, slowShare > GOV.SLOW_SHARE ? `late frames ${Math.round(slowShare * 100)}%` : `busy ${work.toFixed(1)} ms`);
      return null;
    }
    const clean = slowShare <= GOV.CLEAN_SHARE && work <= s.targetMs * GOV.WORK_CLEAN;
    if (!clean) {
      this.cleanSince = -1;
      return null;
    }
    if (this.cleanSince < 0) this.cleanSince = start;
    if (this.step > this.floor && !hot && s.now - this.cleanSince >= GOV.UP_CLEAN_MS && s.now - this.lastChange >= GOV.UP_GAP_MS) {
      return this.change(this.step - 1, s.now, 'cool again');
    }
    return null;
  }

  private change(next: number, now: number, reason: string): number {
    this.step = next;
    this.lastChange = now;
    this.cleanSince = -1;
    this.lastReason = reason;
    this.changes++;
    return next;
  }

  private resetWindow(now: number, target: number): void {
    this.winStart = now;
    this.winTarget = target;
    this.frames = 0;
    this.slow = 0;
    this.work = 0;
  }
}
