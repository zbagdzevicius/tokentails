/**
 * L-UI: the auto-director's shot schedule (pure, tested). SPEC.md "Cameras": cuts on bar
 * boundaries, holds 4–8 bars, `top` and `hero` on drops, `pov` in builds.
 */
import type { Section, ShotId } from '../types';

export interface ShotPlan {
  shot: ShotId;
  holdBars: number;
  /** Hard cut (on a drop downbeat) instead of an eased move. */
  cut: boolean;
}

/** Stable 0..1 hash of an integer (bar number), so the schedule is deterministic. */
export function barRandom(bar: number, salt = 0): number {
  let h = Math.imul((bar | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Shots for the steady parts, in rotation order (weighted by repetition). */
const GROOVE_ROTATION: readonly ShotId[] = ['hero', 'orbit', 'dj', 'pov', 'sweep', 'hero', 'top', 'orbit'];
const BREAKDOWN_ROTATION: readonly ShotId[] = ['orbit', 'dj', 'hero', 'sweep'];

/**
 * Next shot when the current one ran out (or a section starts).
 * - `drop` start: alternate `top` (vortex) and `hero`, hard cut.
 * - `build`: `pov` (inside the crowd, paws up), then `dj` for the last bars.
 * - otherwise rotate, never repeating the previous shot.
 */
export function planShot(input: { section: Section; sectionStart: boolean; bar: number; prev: ShotId | null; dropCount: number }): ShotPlan {
  const { section, sectionStart, bar, prev } = input;
  const hold = 4 + Math.floor(barRandom(bar, 1) * 5); // 4..8
  if (section === 'drop') {
    if (sectionStart) return { shot: input.dropCount % 2 === 0 ? 'top' : 'hero', holdBars: 4, cut: true };
    const pool: ShotId[] = ['hero', 'top', 'orbit', 'pov', 'sweep'];
    return { shot: pick(pool, bar, prev), holdBars: 4, cut: true };
  }
  if (section === 'build') {
    if (sectionStart || prev !== 'pov') return { shot: 'pov', holdBars: 6, cut: false };
    return { shot: 'dj', holdBars: 4, cut: true };
  }
  const rotation = section === 'breakdown' ? BREAKDOWN_ROTATION : GROOVE_ROTATION;
  return { shot: pick(rotation, bar, prev), holdBars: section === 'intro' ? 4 : hold, cut: false };
}

function pick(pool: readonly ShotId[], bar: number, prev: ShotId | null): ShotId {
  const start = Math.floor(barRandom(bar, 2) * pool.length);
  for (let i = 0; i < pool.length; i++) {
    const s = pool[(start + i) % pool.length];
    if (s !== prev) return s;
  }
  return pool[start];
}

/** Seconds the auto-director waits after the last drag/pinch before it takes over again. */
export const MANUAL_IDLE_S = 12;
