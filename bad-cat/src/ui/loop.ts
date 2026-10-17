/**
 * Fixed-step game loop (GDD 13.5): the sim runs at 30 Hz from an accumulator, rendering runs at display
 * rate with interpolation alpha. The pure `advance` is unit-tested; `createLoop` binds it to rAF.
 */
import { TICK_HZ } from '../types';

export const TICK_MS = 1000 / TICK_HZ;
/** Longest frame gap fed to the accumulator (tab stalls never cause a burst of 30 ticks). */
export const MAX_FRAME_MS = 250;

export interface AdvanceResult {
  steps: number;
  acc: number;
  alpha: number;
}

/** Pure accumulator step: how many sim ticks to run for a frame of `dtMs`. */
export function advance(acc: number, dtMs: number, maxSteps = 8, tickMs = TICK_MS): AdvanceResult {
  let a = acc + Math.min(Math.max(dtMs, 0), MAX_FRAME_MS);
  let steps = Math.floor(a / tickMs);
  if (steps > maxSteps) {
    steps = maxSteps;
    a = tickMs * maxSteps; // drop the backlog instead of spiralling
  }
  a -= steps * tickMs;
  return { steps, acc: a, alpha: Math.min(1, Math.max(0, a / tickMs)) };
}

export interface LoopHooks {
  /** Run one sim tick. Return false to stop stepping (run ended); drawing continues until stop(). */
  tick(): boolean;
  draw(alpha: number): void;
  /** Extra ticks allowed per frame (QA turbo). */
  maxSteps?(): number;
  /** QA turbo: run maxSteps() ticks every frame, ignoring the wall clock. */
  turbo?(): boolean;
  /**
   * Hitstop: while true the clock holds (no ticks, no accumulated time) and the last frame is redrawn as is.
   * Inputs are sampled per tick, so a hold never drops a press.
   */
  hold?(): boolean;
}

export interface Loop {
  start(): void;
  stop(): void;
  setPaused(p: boolean): void;
  readonly paused: boolean;
  readonly running: boolean;
}

export interface Clock {
  now(): number;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
}

export const browserClock = (): Clock => ({
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
});

export function createLoop(h: LoopHooks, clock: Clock = browserClock()): Loop {
  let acc = 0;
  let last = 0;
  let id = 0;
  let running = false;
  let paused = false;
  let stepping = true;
  let lastAlpha = 1;

  const frame = (): void => {
    if (!running) return;
    const now = clock.now();
    const dt = now - last;
    last = now;
    let alpha = 1;
    if (!paused && stepping && h.hold?.()) {
      h.draw(lastAlpha);
      id = clock.raf(frame);
      return;
    }
    if (!paused && stepping) {
      const r = h.turbo?.() ? { steps: h.maxSteps?.() ?? 8, acc: 0, alpha: 1 } : advance(acc, dt, h.maxSteps?.() ?? 8);
      acc = r.acc;
      alpha = r.alpha;
      for (let i = 0; i < r.steps; i++) {
        if (!h.tick()) {
          stepping = false;
          alpha = 1;
          break;
        }
      }
    }
    lastAlpha = alpha;
    h.draw(alpha);
    id = clock.raf(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      stepping = true;
      acc = 0;
      last = clock.now();
      id = clock.raf(frame);
    },
    stop() {
      running = false;
      clock.caf(id);
    },
    setPaused(p) {
      paused = p;
      if (!p) {
        last = clock.now(); // no catch-up burst after a pause
        acc = 0;
      }
    },
    get paused() {
      return paused;
    },
    get running() {
      return running;
    },
  };
}
