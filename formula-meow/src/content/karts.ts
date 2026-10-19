/**
 * Kart body stats (iteration 2). The feel lane owns these numbers; ids are frozen in ids.ts. They apply inside the sim
 * (core/sim/kart.ts `bodyTuning`), so changing a number changes replays: bump SIM_VERSION (integrator).
 *
 * Stats are 1..5 steps around 3: top speed ±3 % per step, 0 → 90 % time ±0.12 s per step (more accel = less time),
 * yaw rate ±6°/s per step, and a contact weight 0.8..1.3.
 */
import type { BodyId } from '../types';
import { BODY_NAMES } from './ids';

export interface BodyStats {
  name: string;
  speed: number;
  accel: number;
  handling: number;
  weight: number;
}

export const KART_BODIES: Readonly<Record<BodyId, BodyStats>> = {
  // the all-rounder: no weak spot
  0: { name: BODY_NAMES[0], speed: 3, accel: 3, handling: 3, weight: 1.0 },
  // light and nimble: quick off the line and through the bends, gives a little top speed, easy to push around
  1: { name: BODY_NAMES[1], speed: 2, accel: 4, handling: 4, weight: 0.85 },
  // the straight-line missile: top speed, but slow to get going and a wide turner
  2: { name: BODY_NAMES[2], speed: 4, accel: 2, handling: 2, weight: 0.95 },
  // the heavy one: shoves everyone aside, steady, slow to spin up
  3: { name: BODY_NAMES[3], speed: 3, accel: 2, handling: 3, weight: 1.3 },
  // the rocket start: best acceleration (it recovers from hits fastest), a stiff turner
  4: { name: BODY_NAMES[4], speed: 3, accel: 5, handling: 2, weight: 1.1 },
  // the drift queen: the tightest turner, light, slow to accelerate
  5: { name: BODY_NAMES[5], speed: 3, accel: 2, handling: 5, weight: 0.8 },
};

export const BODY_STEP = {
  /** top speed fraction per step from 3 */
  speed: 0.03,
  /** seconds of 0 → 90 % per step (subtracted for accel above 3) */
  accel: 0.12,
  /** rad/s of yaw per step */
  handling: (6 * Math.PI) / 180,
} as const;

export function bodyStats(body: number | undefined): BodyStats {
  return KART_BODIES[(body ?? 0) as BodyId] ?? KART_BODIES[0];
}
