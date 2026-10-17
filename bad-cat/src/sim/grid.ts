/**
 * Grid helpers. lineOfSight is the Heist's integer Bresenham walk (catnip-heist/src/sim/grid.ts)
 * adapted to Bad Cat's `occludes` heightmap (GDD 4.3): only the cells strictly between the endpoints
 * are tested, plus diagonal corner cracks. The caller applies the level rule (a cat at L3 is never
 * hidden by furniture).
 */
import type { GridState } from '../types';

export function inBounds(g: GridState, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < g.w && z < g.d;
}

export function cellIndex(g: GridState, x: number, z: number): number {
  return z * g.w + x;
}

/** Out-of-bounds cells occlude. */
export function isOccluding(g: GridState, x: number, z: number): boolean {
  if (!inBounds(g, x, z)) return true;
  return g.occludes[z * g.w + x] === 1;
}

/** True if no occluding cell lies strictly between (ax, az) and (bx, bz). */
export function lineOfSight(g: GridState, ax: number, az: number, bx: number, bz: number): boolean {
  let x = ax;
  let z = az;
  const dx = Math.abs(bx - ax);
  const dz = -Math.abs(bz - az);
  const sx = ax < bx ? 1 : -1;
  const sz = az < bz ? 1 : -1;
  let err = dx + dz;
  for (;;) {
    if (x === bx && z === bz) return true;
    const e2 = 2 * err;
    const px = x;
    const pz = z;
    if (e2 >= dz) {
      err += dz;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      z += sz;
    }
    // Diagonal step squeezing between two occluding cells that touch at a corner: blocked.
    if (x !== px && z !== pz && isOccluding(g, x, pz) && isOccluding(g, px, z)) return false;
    if (x === bx && z === bz) return true;
    if (isOccluding(g, x, z)) return false;
  }
}

/**
 * v5 short cones (mirror, webcam): line of sight from a raised origin. An occluder whose surface level is at or below
 * `over` (the level of the furniture the mirror or webcam sits on) does not block, so a webcam on a desk sees over the
 * desk and a mirror above a vanity over the vanity; taller furniture (L3 shelves) still blocks. `over` 0..1 is the
 * plain lineOfSight (only L2+ cells occlude).
 */
export function lineOfSightOver(g: GridState, ax: number, az: number, bx: number, bz: number, over: number): boolean {
  const blocks = (x: number, z: number): boolean => isOccluding(g, x, z) && (!inBounds(g, x, z) || g.level[z * g.w + x] > over);
  let x = ax;
  let z = az;
  const dx = Math.abs(bx - ax);
  const dz = -Math.abs(bz - az);
  const sx = ax < bx ? 1 : -1;
  const sz = az < bz ? 1 : -1;
  let err = dx + dz;
  for (;;) {
    if (x === bx && z === bz) return true;
    const e2 = 2 * err;
    const px = x;
    const pz = z;
    if (e2 >= dz) {
      err += dz;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      z += sz;
    }
    if (x !== px && z !== pz && blocks(x, pz) && blocks(px, z)) return false;
    if (x === bx && z === bz) return true;
    if (blocks(x, z)) return false;
  }
}
