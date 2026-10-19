/**
 * Hazard motion as pure functions of the tick (tracks lane): the sim (kinds.ts) and the views (src/tracks/view) both
 * call these, so what you see is exactly what hits you. Sim-safe math only (GDD 3.1, linted by core/sim/fixed.test.ts).
 *
 * Every hazard telegraphs at least 0.6 s (GDD 3.6): the roomba and the laundry are always in view and move slowly;
 * the toaster's slots glow and smoke 0.8 s before a pop; the chimney puffs 0.8 s before the steam; the drum's
 * coloured rib shows which way it is about to push.
 */
import type { HazardPlace } from '../../core/track/build';
import { TAU, cosL, sinL } from '../../core/sim/fixed';

/** Roomba: an ellipse across the road (lateral semi-axis × along semi-axis) at 3 m/s. */
export const ROOMBA = { radius: 0.85, speed: 3, along: 3.2, lateral: 0.62, hitCooldown: 50, push: 3 } as const;
/** Laundry: a sheet on a line across the road, swinging over half the road every period. */
export const LAUNDRY = { reach: 0.42, depth: 0.9, hitCooldown: 50, low: -0.4, high: 2.6 } as const;
/** Toaster: a slot in the road (on one side) that pops a leap hit in a 2 m radius; telegraph 0.8 s, pop window 0.2 s. */
export const TOASTER = { radius: 2, telegraph: 48, pop: 12, hitCooldown: 60 } as const;
/** Chimney steam: 40 % of the cycle on (a wobble zone of 2.6 m), puffs for 0.8 s before. */
export const STEAM = { radius: 2.6, telegraph: 48, hitCooldown: 60, height: 3 } as const;
/** Spinning drum: a 16 m zone across the road whose ribs push karts sideways (peak m/s²). */
export const DRUM = { halfLen: 8, accel: 7 } as const;
/** Milk: a slide kick (radians) on entering the puddle at speed. */
export const MILK = { kick: 0.22, minSpeed: 8 } as const;

/** Tick within the hazard's cycle, 0..period-1. */
export function cyc(p: HazardPlace, tick: number): number {
  const u = (tick + p.phase) % p.period;
  return u < 0 ? u + p.period : u;
}

export interface Pose {
  x: number;
  z: number;
  /** direction of motion (heading, 0 = +z) as a unit vector */
  fx: number;
  fz: number;
}

/** Ticks per roomba lap: its ellipse's perimeter at ROOMBA.speed. */
export function roombaPeriod(p: HazardPlace): number {
  const a = p.halfW * ROOMBA.lateral;
  const b = ROOMBA.along;
  // Ramanujan's ellipse perimeter
  const h = 3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b));
  return Math.max(60, Math.round(((3.141592653589793 * h) / ROOMBA.speed) * 60));
}

export function roombaPose(p: HazardPlace, tick: number, out: Pose): Pose {
  const per = roombaPeriod(p);
  let u = (tick + p.phase) % per;
  if (u < 0) u += per;
  const th = (TAU * u) / per;
  const a = p.halfW * ROOMBA.lateral;
  const b = ROOMBA.along;
  const c = cosL(th);
  const s = sinL(th);
  const rx = -p.tz;
  const rz = p.tx;
  out.x = p.x + rx * a * c + p.tx * b * s;
  out.z = p.z + rz * a * c + p.tz * b * s;
  // velocity direction: d/dθ
  const vx = -rx * a * s + p.tx * b * c;
  const vz = -rz * a * s + p.tz * b * c;
  const l = Math.sqrt(vx * vx + vz * vz) || 1;
  out.fx = vx / l;
  out.fz = vz / l;
  return out;
}

/** Laundry sheet: lateral centre (m from the road centre) and half width. */
export function sheetOffset(p: HazardPlace, tick: number): number {
  return p.halfW * LAUNDRY.reach * sinL((TAU * cyc(p, tick)) / p.period);
}

export function sheetHalfWidth(p: HazardPlace): number {
  return p.halfW * LAUNDRY.reach;
}

/** Toaster: 0 idle, 1 telegraph (glow + smoke), 2 popping. */
export function toasterState(p: HazardPlace, tick: number): 0 | 1 | 2 {
  const u = cyc(p, tick);
  if (u < TOASTER.pop) return 2;
  if (u >= p.period - TOASTER.telegraph) return 1;
  return 0;
}

/** Ticks of each steam cycle the column is on (the first 40 %). */
export function steamOn(p: HazardPlace): number {
  return Math.round(p.period * 0.4);
}

/** Steam: 0 off, 1 telegraph puffs, 2 on. The first 40 % of the cycle is on. */
export function steamState(p: HazardPlace, tick: number): 0 | 1 | 2 {
  const u = cyc(p, tick);
  if (u < steamOn(p)) return 2;
  if (u >= p.period - STEAM.telegraph) return 1;
  return 0;
}

/** Drum: signed lateral push (m/s², + = toward the right) and the drum's angle (render). */
export function drumPush(p: HazardPlace, tick: number): number {
  return DRUM.accel * sinL((TAU * cyc(p, tick)) / p.period);
}

export function drumAngle(p: HazardPlace, tick: number): number {
  return (TAU * cyc(p, tick)) / p.period;
}

/** A point relative to the hazard: along the road and lateral (+ = right). */
export function local(p: HazardPlace, x: number, z: number, out: { a: number; d: number }): { a: number; d: number } {
  const dx = x - p.x;
  const dz = z - p.z;
  out.a = dx * p.tx + dz * p.tz;
  out.d = dx * -p.tz + dz * p.tx;
  return out;
}
