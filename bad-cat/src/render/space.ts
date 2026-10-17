/**
 * Grid -> world mapping shared by every render module. The room is centred on the origin:
 * x east, z south (toward the camera), y up, 0.4 m per cell (types.ts CELL_M).
 */
import { CELL_M, DIR_DX, DIR_DZ, LEVEL_HEIGHT_M } from '../types';

/** World x of the centre of column `x` in a room `w` cells wide. */
export function cellX(x: number, w: number): number {
  return (x + 0.5 - w / 2) * CELL_M;
}
/** World z of the centre of row `z` in a room `d` cells deep. */
export function cellZ(z: number, d: number): number {
  return (z + 0.5 - d / 2) * CELL_M;
}
/** Surface height of a level in metres. */
export function levelY(level: number): number {
  return LEVEL_HEIGHT_M[Math.max(0, Math.min(3, level | 0))] ?? 0;
}
/** Yaw (radians about +y) that turns local +z toward grid facing f (1..8). */
export function facingYaw(f: number): number {
  const dx = DIR_DX[f] ?? 0;
  const dz = DIR_DZ[f] ?? 1;
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(dx, dz);
}
/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Approach `b` from `a` by fraction k along the shortest arc. */
export function lerpAngle(a: number, b: number, k: number): number {
  return a + angleDelta(a, b) * k;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function smooth01(v: number): number {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}
/** Frame-rate independent smoothing factor for a rate per tick and a delta in ticks. */
export function damp(ratePerTick: number, dtTicks: number): number {
  return 1 - Math.pow(1 - ratePerTick, Math.max(0, dtTicks));
}
