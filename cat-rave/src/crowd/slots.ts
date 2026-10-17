/**
 * L-CROWD pure logic: slot layout (booth out, front first, stable), the vortex swirl and the cat
 * pose used for picking. The GLSL in `shaders.ts` mirrors `vortexAngle` / `catAxis` exactly, so the
 * CPU (picking, catPosition, LOD) and the GPU (drawing) agree on where every cat is.
 */
import { LAYOUT } from '../config';

/** Vortex angular speed (rad/s) at radius r is VORTEX_SPEED / (r + VORTEX_FALLOFF). */
export const VORTEX_SPEED = 5.5;
export const VORTEX_FALLOFF = 3.0;
/** In the vortex, cats lift off the floor and pitch forward (flying, like the reference top shot). */
export const VORTEX_LIFT = 0.45;
export const VORTEX_PITCH = 1.2;
/** Vortex (top shot): cats re-form on a golden-angle spiral from this radius out (soft glow pool inside). */
export const VORTEX_INNER = 2.4;
/** Floor area per cat in the vortex spiral, divided by π: r² = inner² + i·VORTEX_AREA (hex-cell density). */
export const VORTEX_AREA = +((LAYOUT.catSpacing * LAYOUT.catSpacing * Math.sqrt(3)) / 2 / Math.PI).toFixed(5);
const GOLDEN = 0.38196601;

/** Golden-angle (sunflower) slot of cat `i` in the vortex: even density, no gaps or clumps. */
export function vortexSlot(i: number): { x: number; z: number } {
  const r = Math.sqrt(VORTEX_INNER * VORTEX_INNER + i * VORTEX_AREA);
  const a = ((i * GOLDEN) % 1) * 2 * Math.PI;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Height of a cat's pivot centre (pitch pivot, catPosition y). */
export const CAT_CENTER_Y = 0.55;
/** Drop-in: seconds from the sky to the slot (incl. landing squash). */
export const DROP_IN_SECONDS = 1.5;
/** How strongly the back of the booth (−Z) is penalised when ordering slots. */
export const FRONT_BIAS = 0.5;
/** ± jitter of each slot so the crowd is not a perfect grid (fraction of spacing). */
export const SLOT_JITTER = 0.11;

/**
 * Booth sightline: no cat stands in a short aisle straight in front of the booth (+Z, towards the hero
 * camera), so the front row never covers the booth's front panel (the Arc week logo) in the hero shot.
 * Half-width grows a little with distance, like the camera's view cone; it ends where a raised camera
 * looks over the heads anyway.
 */
export const AISLE = Object.freeze({ halfWidth: 0.95, spread: 0.05, length: 7.5 });

export function inBoothAisle(x: number, z: number): boolean {
  return z > 0 && z < AISLE.length && Math.abs(x) < AISLE.halfWidth + AISLE.spread * z;
}

export interface SlotLayout {
  readonly count: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Distance from the booth centre. */
  readonly r: Float32Array;
}

export interface SlotOptions {
  inner?: number;
  spacing?: number;
  bias?: number;
  jitter?: number;
  /** Keep the booth sightline aisle free (default true). */
  aisle?: boolean;
}

function hash2(i: number, j: number, k: number): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ordering cost: radius, inflated behind the booth so the hero side (+Z) fills first. */
export function slotCost(x: number, z: number, bias = FRONT_BIAS): number {
  const r = Math.hypot(x, z);
  const cos = r > 0 ? z / r : 1;
  return r * (1 + (bias * (1 - cos)) / 2);
}

/**
 * The first `count` slots of an infinite, deterministic hex grid around the booth, ordered by
 * `slotCost`. The order of any slot depends only on its own position, so `buildSlots(n)` is always a
 * prefix of `buildSlots(m)` for m > n: growing never moves an old cat.
 */
export function buildSlots(count: number, opts: SlotOptions = {}): SlotLayout {
  const inner = opts.inner ?? LAYOUT.crowdInnerRadius;
  const spacing = opts.spacing ?? LAYOUT.catSpacing;
  const bias = opts.bias ?? FRONT_BIAS;
  const jitter = (opts.jitter ?? SLOT_JITTER) * spacing;
  const aisle = opts.aisle ?? true;
  const rowH = spacing * Math.sqrt(3) * 0.5;
  const cellArea = spacing * rowH;
  // Generous first guess; grow until the count-th cost fits inside the generated disk.
  let R = Math.sqrt((count * cellArea * (1 + bias)) / Math.PI + inner * inner) + 3 * spacing;
  for (;;) {
    const xs: number[] = [];
    const zs: number[] = [];
    const cs: number[] = [];
    const jMax = Math.ceil(R / rowH) + 1;
    const iMax = Math.ceil(R / spacing) + 1;
    for (let j = -jMax; j <= jMax; j++) {
      const off = (j & 1) * 0.5;
      for (let i = -iMax; i <= iMax; i++) {
        const x = (i + off) * spacing + (hash2(i, j, 1) - 0.5) * 2 * jitter;
        const z = j * rowH + (hash2(i, j, 2) - 0.5) * 2 * jitter;
        const r = Math.hypot(x, z);
        if (r < inner || r > R) continue;
        if (aisle && inBoothAisle(x, z)) continue;
        xs.push(x);
        zs.push(z);
        cs.push(slotCost(x, z, bias));
      }
    }
    const order = Array.from(cs.keys()).sort((a, b) => cs[a] - cs[b] || zs[b] - zs[a] || xs[a] - xs[b]);
    // Every slot with cost <= R is inside the disk (cost >= r), so the prefix is exact when the
    // last needed cost is <= R.
    if (order.length >= count && (count === 0 || cs[order[count - 1]] <= R)) {
      const out = { count, x: new Float32Array(count), z: new Float32Array(count), r: new Float32Array(count) };
      for (let k = 0; k < count; k++) {
        const o = order[k];
        out.x[k] = xs[o];
        out.z[k] = zs[o];
        out.r[k] = Math.hypot(xs[o], zs[o]);
      }
      return out;
    }
    R *= 1.35;
  }
}

/** Radius used by cats 0..n-1 (camera framing), never below the inner ring plus one row. */
export function extentOf(layout: SlotLayout, n: number): number {
  let r = LAYOUT.crowdInnerRadius + LAYOUT.catSpacing;
  const m = Math.min(n, layout.count);
  for (let i = 0; i < m; i++) if (layout.r[i] + LAYOUT.catSpacing * 0.5 > r) r = layout.r[i] + LAYOUT.catSpacing * 0.5;
  return r;
}

/** Vortex angle offset of a slot at radius r after `vortexT` seconds of swirl. */
export function vortexAngle(r: number, vortexT: number): number {
  return (vortexT * VORTEX_SPEED) / (r + VORTEX_FALLOFF);
}

export interface CatAxis {
  /** Animated centre (pivot) of the cat. */
  cx: number;
  cy: number;
  cz: number;
  /** Unit "up" axis of the body after the vortex pitch. */
  ux: number;
  uy: number;
  uz: number;
  /** Unit facing on the floor plane. */
  fx: number;
  fz: number;
}

/** Same maths as `catPose()` in the shader, minus the dance (bounce, sway): used for picking and focus. */
export function catAxis(x: number, z: number, scale: number, vortexT: number, vortex: number, out: CatAxis, index = -1): CatAxis {
  if (index >= 0 && vortex > 0) {
    // Blend towards the golden-angle vortex slot (same as the shader's aData.w path).
    const v = vortexSlot(index);
    x += (v.x - x) * vortex;
    z += (v.z - z) * vortex;
  }
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x) + vortexAngle(r, vortexT);
  const px = Math.cos(a) * r;
  const pz = Math.sin(a) * r;
  const inv = r > 1e-3 ? 1 / r : 0;
  let fx = -px * inv * (1 - vortex) + -Math.sin(a) * vortex;
  let fz = -pz * inv * (1 - vortex) + Math.cos(a) * vortex;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  const pitch = vortex * VORTEX_PITCH;
  const s = Math.sin(pitch);
  out.cx = px;
  out.cy = CAT_CENTER_Y * scale + vortex * VORTEX_LIFT;
  out.cz = pz;
  out.ux = fx * s;
  out.uy = Math.cos(pitch);
  out.uz = fz * s;
  out.fx = fx;
  out.fz = fz;
  return out;
}

/**
 * Cat look derived from its stable seed: fur 0 = warm peach cream .. 1 = ginger (PALETTE), weighted
 * towards the middle tan with a fair share of gingers; height scale ±6%. A warm peach-and-tan sea
 * of kittens, as in the reference.
 */
export function catLook(seed: number): { fur: number; scale: number } {
  const f = (seed * 7.31 + 0.13) % 1;
  const s = (seed * 13.7 + 0.41) % 1;
  return { fur: 0.12 + 0.78 * Math.pow(f, 1.3), scale: 0.94 + 0.12 * s };
}
