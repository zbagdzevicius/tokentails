/**
 * Pure analog-to-TickInput quantisation (GDD 5.1, 5.3). Called once per sim tick.
 *
 * - 8 sectors of 45°, 0° = screen up = north (Dir8 1), clockwise.
 * - Direction hysteresis: the current direction holds until the stick angle is more than 12° past the
 *   sector border (|angle - centre| > 22.5° + 12°).
 * - A new direction (while already moving) must be the candidate for 3 consecutive ticks. Starting from
 *   rest is immediate (no added latency on the first step); stopping is immediate.
 * - Speed hysteresis: below 35 % of the radius = sneak, above 45 % = trot, in between the speed does not
 *   change (from rest it starts as sneak).
 * - Dead zone: below 12 % of the radius the stick reads as released.
 */
import type { Dir8, Speed } from '../../types';

export interface StickState {
  dir: Dir8;
  speed: Speed;
  /** Candidate direction waiting for its 3-tick hold (0 = none). */
  pending: Dir8;
  pendingTicks: number;
}

export const STICK_REST: StickState = Object.freeze({ dir: 0, speed: 0, pending: 0, pendingTicks: 0 }) as StickState;

export const SECTOR_DEG = 45;
export const HYSTERESIS_DEG = 12;
export const HOLD_TICKS = 3;
export const SNEAK_BELOW = 0.35;
export const TROT_ABOVE = 0.45;
export const DEAD_ZONE = 0.12;

/** Screen-space angle in degrees, 0 = up (north), clockwise, range [0, 360). dy grows downward. */
export function stickAngle(dx: number, dy: number): number {
  const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** Nearest sector for an angle, as Dir8 1..8. */
export function sectorOf(angle: number): Exclude<Dir8, 0> {
  const s = Math.round(angle / SECTOR_DEG) % 8;
  return (s + 1) as Exclude<Dir8, 0>;
}

/** Smallest absolute difference between an angle and a direction's centre, in degrees. */
export function angleFromDir(angle: number, dir: Exclude<Dir8, 0>): number {
  const centre = (dir - 1) * SECTOR_DEG;
  let d = Math.abs(angle - centre) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

export function quantiseStick(prev: StickState, dx: number, dy: number, radius: number): StickState {
  const r = radius > 0 ? radius : 1;
  const mag = Math.hypot(dx, dy) / r;
  if (!(mag >= DEAD_ZONE)) return { dir: 0, speed: 0, pending: 0, pendingTicks: 0 };

  // Speed with a hysteresis band.
  let speed: Speed;
  if (mag < SNEAK_BELOW) speed = 1;
  else if (mag > TROT_ABOVE) speed = 2;
  else speed = prev.speed === 0 ? 1 : prev.speed;

  const angle = stickAngle(dx, dy);
  // Starting from rest: take the nearest sector immediately.
  if (prev.dir === 0) return { dir: sectorOf(angle), speed, pending: 0, pendingTicks: 0 };

  const keep = angleFromDir(angle, prev.dir) <= SECTOR_DEG / 2 + HYSTERESIS_DEG;
  if (keep) return { dir: prev.dir, speed, pending: 0, pendingTicks: 0 };

  const cand = sectorOf(angle);
  if (cand === prev.dir) return { dir: prev.dir, speed, pending: 0, pendingTicks: 0 };
  const ticks = prev.pending === cand ? prev.pendingTicks + 1 : 1;
  if (ticks >= HOLD_TICKS) return { dir: cand, speed, pending: 0, pendingTicks: 0 };
  return { dir: prev.dir, speed, pending: cand, pendingTicks: ticks };
}

/** Keyboard: held arrows/WASD to a Dir8 (opposite keys cancel). */
export function keysToDir(up: boolean, right: boolean, down: boolean, left: boolean): Dir8 {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const z = (down ? 1 : 0) - (up ? 1 : 0);
  if (x === 0 && z === 0) return 0;
  if (x === 0) return z < 0 ? 1 : 5;
  if (z === 0) return x > 0 ? 3 : 7;
  if (z < 0) return x > 0 ? 2 : 8;
  return x > 0 ? 4 : 6;
}
