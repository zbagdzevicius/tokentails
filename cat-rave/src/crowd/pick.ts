/**
 * L-CROWD picking: CPU ray vs. one capsule per cat, no GPU readback (SPEC.md "Picking").
 * On the floor a uniform grid over the slots limits the tests to the cells the ray crosses; while
 * the vortex has the cats out of their slots it tests every shown cat (10k capsule tests ≈ 0.3 ms).
 */
import { Ray, Vector3 } from 'three';
import { catAxis, type CatAxis, type SlotLayout } from './slots';

/** Capsule half-length along the cat's up axis and its radius (a cat is ~1.15 tall, ~0.7 wide). */
export const PICK_HALF = 0.38;
export const PICK_RADIUS = 0.34;

export interface SlotGrid {
  cell: number;
  minX: number;
  minZ: number;
  w: number;
  h: number;
  /** CSR: cats of cell c are items[start[c] .. start[c + 1]). */
  start: Int32Array;
  items: Int32Array;
}

export function buildGrid(layout: SlotLayout, cell = 2): SlotGrid {
  let minX = 0;
  let minZ = 0;
  let maxX = 0;
  let maxZ = 0;
  for (let i = 0; i < layout.count; i++) {
    minX = Math.min(minX, layout.x[i]);
    maxX = Math.max(maxX, layout.x[i]);
    minZ = Math.min(minZ, layout.z[i]);
    maxZ = Math.max(maxZ, layout.z[i]);
  }
  minX -= cell;
  minZ -= cell;
  const w = Math.ceil((maxX + cell - minX) / cell) + 1;
  const h = Math.ceil((maxZ + cell - minZ) / cell) + 1;
  const counts = new Int32Array(w * h + 1);
  const cellOf = new Int32Array(layout.count);
  for (let i = 0; i < layout.count; i++) {
    const c = Math.floor((layout.x[i] - minX) / cell) + Math.floor((layout.z[i] - minZ) / cell) * w;
    cellOf[i] = c;
    counts[c + 1]++;
  }
  for (let c = 0; c < w * h; c++) counts[c + 1] += counts[c];
  const start = counts;
  const fill = start.slice(0, w * h);
  const items = new Int32Array(layout.count);
  for (let i = 0; i < layout.count; i++) items[fill[cellOf[i]]++] = i;
  return { cell, minX, minZ, w, h, start, items };
}

export interface PickState {
  layout: SlotLayout;
  grid: SlotGrid;
  /** Cats shown: indices 0..shown-1. */
  shown: number;
  /** Per-cat height scale (catLook). */
  scale: ArrayLike<number>;
  vortexT: number;
  vortex: number;
  /** false for cats that are hidden right now (drop-in not started). */
  visible?: (index: number) => boolean;
}

const axis: CatAxis = { cx: 0, cy: 0, cz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fz: 1 };
const a = new Vector3();
const b = new Vector3();
const onRay = new Vector3();

/** Distance along the ray to cat i's capsule, or Infinity. */
export function hitCat(ray: Ray, s: PickState, i: number): number {
  catAxis(s.layout.x[i], s.layout.z[i], s.scale[i] ?? 1, s.vortexT, s.vortex, axis, i);
  const k = s.scale[i] ?? 1;
  a.set(axis.cx - axis.ux * PICK_HALF * k, axis.cy - axis.uy * PICK_HALF * k, axis.cz - axis.uz * PICK_HALF * k);
  b.set(axis.cx + axis.ux * PICK_HALF * k, axis.cy + axis.uy * PICK_HALF * k, axis.cz + axis.uz * PICK_HALF * k);
  const d2 = ray.distanceSqToSegment(a, b, onRay);
  const r = PICK_RADIUS * k;
  if (d2 > r * r) return Infinity;
  return onRay.distanceTo(ray.origin);
}

/** Nearest cat hit by `ray` (direction normalised), or null. */
export function pickCat(ray: Ray, s: PickState): number | null {
  const n = Math.min(s.shown, s.layout.count);
  if (n <= 0) return null;
  let best = Infinity;
  let bestI = -1;
  const ok = s.visible ?? (() => true);
  if (s.vortex > 1e-3 || Math.abs(s.vortexT) > 1e-3) {
    for (let i = 0; i < n; i++) {
      if (!ok(i)) continue;
      const t = hitCat(ray, s, i);
      if (t < best) {
        best = t;
        bestI = i;
      }
    }
    return bestI >= 0 ? bestI : null;
  }
  // Floor: walk the ray's footprint through the slab where cats live, test 3×3 cells per step.
  const o = ray.origin;
  const d = ray.direction;
  const y0 = -0.1;
  const y1 = 1.4;
  let t0 = 0;
  let t1 = 600;
  if (Math.abs(d.y) < 1e-6) {
    if (o.y < y0 || o.y > y1) return null;
  } else {
    let ta = (y0 - o.y) / d.y;
    let tb = (y1 - o.y) / d.y;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(0, ta);
    t1 = Math.min(t1, tb);
    if (t1 < t0) return null;
  }
  const g = s.grid;
  const horiz = Math.hypot(d.x, d.z);
  const step = horiz > 1e-6 ? (g.cell * 0.5) / horiz : t1 - t0 + 1;
  const seen = new Set<number>();
  for (let t = t0; t <= t1 + step; t += step) {
    const tt = Math.min(t, t1);
    if (tt > best + g.cell * 2) break;
    const cx = Math.floor((o.x + d.x * tt - g.minX) / g.cell);
    const cz = Math.floor((o.z + d.z * tt - g.minZ) / g.cell);
    for (let dz = -1; dz <= 1; dz++) {
      const zz = cz + dz;
      if (zz < 0 || zz >= g.h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= g.w) continue;
        const c = xx + zz * g.w;
        if (seen.has(c)) continue;
        seen.add(c);
        for (let k = g.start[c]; k < g.start[c + 1]; k++) {
          const i = g.items[k];
          if (i >= n || !ok(i)) continue;
          const hit = hitCat(ray, s, i);
          if (hit < best) {
            best = hit;
            bestI = i;
          }
        }
      }
    }
    if (tt >= t1) break;
  }
  return bestI >= 0 ? bestI : null;
}
