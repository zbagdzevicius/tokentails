/**
 * Vision cone (GDD 4.3): 70° wide, 10 cells long, one precomputed offset mask per facing.
 * Built with integer maths only: a cell (dx, dz) is inside the cone of facing (fx, fz) when it lies
 * ahead (dot > 0), within 10 cells (dx² + dz² ≤ 100) and within 35° of the facing axis
 * (10·|cross| ≤ 7·dot, tan 35° ≈ 0.70). No trigonometry anywhere.
 */
import { DIR_DX, DIR_DZ, HumanSt, MIRROR_RANGE, type Facing, type HumanState, type SimState } from '../types';
import { lineOfSight, lineOfSightOver, inBounds } from './grid';
import type { SimStateL1 } from './events';

/** v6: the run's squared cone length (0 = the full CONE_RANGE mask). */
const coneR2Of = (s: SimState): number => (s as SimStateL1).coneR2 ?? 0;
/** v6: is (dx, dz) within the run's cone length? */
export function inConeRange(s: SimState, dx: number, dz: number): boolean {
  const r2 = coneR2Of(s);
  return r2 <= 0 || dx * dx + dz * dz <= r2;
}

export const CONE_RANGE = 10;
const SPAN = CONE_RANGE * 2 + 1; // mask is SPAN × SPAN centred on the human

/** CONE_MASK[facing][(dz + R) * SPAN + (dx + R)] = 1 inside the cone. Index 0 unused. */
export const CONE_MASK: readonly Uint8Array[] = buildMasks();
/** Flat [dx, dz, dx, dz, …] offsets per facing (render/debug convenience). */
export const CONE_OFFSETS: readonly Int8Array[] = CONE_MASK.map((m) => {
  const out: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i]) out.push((i % SPAN) - CONE_RANGE, ((i / SPAN) | 0) - CONE_RANGE);
  return Int8Array.from(out);
});

function buildMasks(): Uint8Array[] {
  const masks: Uint8Array[] = [new Uint8Array(SPAN * SPAN)];
  for (let f = 1; f <= 8; f++) {
    const fx = DIR_DX[f];
    const fz = DIR_DZ[f];
    const m = new Uint8Array(SPAN * SPAN);
    for (let dz = -CONE_RANGE; dz <= CONE_RANGE; dz++) {
      for (let dx = -CONE_RANGE; dx <= CONE_RANGE; dx++) {
        if (dx * dx + dz * dz > CONE_RANGE * CONE_RANGE) continue;
        const dot = dx * fx + dz * fz;
        if (dot <= 0) continue;
        const cross = dz * fx - dx * fz;
        if (10 * Math.abs(cross) <= 7 * dot) m[(dz + CONE_RANGE) * SPAN + (dx + CONE_RANGE)] = 1;
      }
    }
    masks.push(m);
  }
  return masks;
}

/** True when (dx, dz) relative to the human is inside the cone for `facing`. */
export function inConeOffset(facing: Facing, dx: number, dz: number): boolean {
  if (dx < -CONE_RANGE || dx > CONE_RANGE || dz < -CONE_RANGE || dz > CONE_RANGE) return false;
  return CONE_MASK[facing][(dz + CONE_RANGE) * SPAN + (dx + CONE_RANGE)] === 1;
}

/** The facing whose cone is shown/active now, or 0 when no cone (BUSY, FAKEOUT, EVENT). */
export function activeFacing(h: HumanState): Facing | 0 {
  if (h.state === HumanSt.LOOK) return h.facing;
  if (h.state === HumanSt.TELEGRAPH) return h.lookFacing;
  return 0;
}

/**
 * Can human `h` see a thing at (x, z) on `level` using `facing`'s cone? Occlusion by the grid line
 * walk, except at L3 (nothing on the furniture hides a cat on the fridge top).
 */
/** v8: is (dx, dz) within this human's cone length (HumanState.r2 wins over the room's)? */
function inHumanRange(s: SimState, h: HumanState, dx: number, dz: number): boolean {
  return h.r2 ? dx * dx + dz * dz <= h.r2 : inConeRange(s, dx, dz);
}

export function seesCell(s: SimState, h: HumanState, facing: Facing, x: number, z: number, level: number, fullRange = false): boolean {
  if (!inBounds(s.grid, h.x, h.z)) return false;
  if (!inConeOffset(facing, x - h.x, z - h.z)) return false;
  if (!fullRange && !inHumanRange(s, h, x - h.x, z - h.z)) return false;
  if (level >= 3) return true;
  // v8: a human who sits up (RoutineDef.lookOverV8) sees over furniture up to h.over
  if (h.over) return lineOfSightOver(s.grid, h.x, h.z, x, z, h.over);
  return lineOfSight(s.grid, h.x, h.z, x, z);
}

/** During LOOK the human notices anything within this Chebyshev distance, in any direction and through occluders. */
export const NEAR_RANGE = 2;

export function nearHuman(h: HumanState, x: number, z: number): boolean {
  return Math.abs(x - h.x) <= NEAR_RANGE && Math.abs(z - h.z) <= NEAR_RANGE;
}

/** LOOK sight: the near ring ("he notices you next to him") or the cone with occlusion. */
export function looksAt(s: SimState, h: HumanState, facing: Facing, x: number, z: number, level: number, fullRange = false): boolean {
  if (!inBounds(s.grid, h.x, h.z)) return false;
  return nearHuman(h, x, z) || seesCell(s, h, facing, x, z, level, fullRange);
}

/**
 * The look facing whose centre ray points closest to (x, z) (largest cos of the angle), integer only:
 * cos² compared via dot² · |f_other|², sign kept. Ties keep list order.
 */
export function facingToward(facings: readonly Facing[], hx: number, hz: number, x: number, z: number): Facing {
  let best = facings[0];
  let bestDot = 0;
  let bestLen = 1;
  for (let i = 0; i < facings.length; i++) {
    const f = facings[i];
    const fx = DIR_DX[f];
    const fz = DIR_DZ[f];
    const dot = (x - hx) * fx + (z - hz) * fz;
    const len = fx * fx + fz * fz;
    if (i === 0) {
      best = f;
      bestDot = dot;
      bestLen = len;
      continue;
    }
    // compare sign(dot)·dot²/len against sign(bestDot)·bestDot²/bestLen
    const a = Math.sign(dot) * dot * dot * bestLen;
    const b = Math.sign(bestDot) * bestDot * bestDot * len;
    if (a > b) {
      best = f;
      bestDot = dot;
      bestLen = len;
    }
  }
  return best;
}

/** Cells of the human's current cone after occlusion (floor-level line of sight), for render. */
export function coneCellsOf(s: SimState, humanIdx: number): Int16Array {
  const h = s.humans[humanIdx];
  if (!h) return new Int16Array(0);
  const f = activeFacing(h);
  if (f === 0 || !inBounds(s.grid, h.x, h.z)) return new Int16Array(0);
  const offs = CONE_OFFSETS[f];
  const out: number[] = [];
  for (let i = 0; i < offs.length; i += 2) {
    const x = h.x + offs[i];
    const z = h.z + offs[i + 1];
    if (!inBounds(s.grid, x, z)) continue;
    if (!inHumanRange(s, h, offs[i], offs[i + 1])) continue;
    if (h.over ? lineOfSightOver(s.grid, h.x, h.z, x, z, h.over) : lineOfSight(s.grid, h.x, h.z, x, z)) out.push(z * s.grid.w + x);
  }
  // the near ring counts as seen during LOOK too
  for (let dz = -NEAR_RANGE; dz <= NEAR_RANGE; dz++)
    for (let dx = -NEAR_RANGE; dx <= NEAR_RANGE; dx++) {
      const x = h.x + dx;
      const z = h.z + dz;
      if ((dx || dz) && inBounds(s.grid, x, z) && !inConeOffset(f, dx, dz)) out.push(z * s.grid.w + x);
    }
  return Int16Array.from(out);
}

// ----- v5: short cones (mirror, webcam) -----

/**
 * The mirror's and the webcam's cone (v5): the same 70-degree offset table, truncated to MIRROR_RANGE cells
 * (dx² + dz² ≤ MIRROR_RANGE²).
 */
export function inShortCone(facing: Facing, dx: number, dz: number): boolean {
  return dx * dx + dz * dz <= MIRROR_RANGE * MIRROR_RANGE && inConeOffset(facing, dx, dz);
}

/** Does a short cone at (ox, oz) facing `facing` see (x, z, level)? Occluded by the line walk below L3. */
export function shortConeSees(
  s: SimState,
  ox: number,
  oz: number,
  facing: Facing,
  x: number,
  z: number,
  level: number,
  over = originLevel(s, ox, oz),
): boolean {
  if (!inBounds(s.grid, x, z)) return false;
  if (!inShortCone(facing, x - ox, z - oz)) return false;
  if (level >= 3) return true;
  return lineOfSightOver(s.grid, ox, oz, x, z, over);
}

/** Surface level under a mirror / webcam (it sees over furniture up to that level). */
export function originLevel(s: SimState, ox: number, oz: number): number {
  return inBounds(s.grid, ox, oz) ? s.grid.level[oz * s.grid.w + ox] : 0;
}

/** Cell indices of a short cone after occlusion (floor-level line of sight), for render. */
export function shortConeCells(s: SimState, ox: number, oz: number, facing: Facing, over = originLevel(s, ox, oz)): Int16Array {
  const offs = CONE_OFFSETS[facing];
  const out: number[] = [];
  for (let i = 0; i < offs.length; i += 2) {
    const dx = offs[i];
    const dz = offs[i + 1];
    if (dx * dx + dz * dz > MIRROR_RANGE * MIRROR_RANGE) continue;
    const x = ox + dx;
    const z = oz + dz;
    if (!inBounds(s.grid, x, z)) continue;
    if (lineOfSightOver(s.grid, ox, oz, x, z, over)) out.push(z * s.grid.w + x);
  }
  return Int16Array.from(out);
}
