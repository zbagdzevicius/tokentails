/**
 * Nav grid (POC.md §5): 1 m cells, 100 × 60, 1 = blocked. Static walls from data/map.ts (the rocks, and since sim v5
 * everything outside PLAYFIELD: the forest and the outer rim) plus the footprints of the
 * standing towers and cores (a destroyed structure frees its cells). Derived state: rebuilt the same way in a live
 * match and its replay, so it is not part of the world hash.
 */
import { LANE_WAYPOINTS, MAP, NAV, PLAYFIELD, WALLS, mirrorX } from '../../data/map';
import { idiv } from '../fixed';

export const NX = idiv(MAP.width, MAP.navCell);
export const NY = idiv(MAP.height, MAP.navCell);
const HALF = idiv(MAP.navCell, 2);

export interface NavGrid {
  /** Static walls. */
  readonly walls: Uint8Array;
  /** Walls plus standing structures: what A* reads. */
  readonly blocked: Uint8Array;
  /** Per cell: how many structures cover it. */
  readonly cover: Uint8Array;
}

export const cellX = (x: number): number => Math.min(NX - 1, Math.max(0, idiv(x, MAP.navCell)));
export const cellY = (y: number): number => Math.min(NY - 1, Math.max(0, idiv(y, MAP.navCell)));
export const cellOf = (x: number, y: number): number => cellY(y) * NX + cellX(x);
/** Centre of a cell in mm. */
export const centreX = (c: number): number => (c % NX) * MAP.navCell + HALF;
export const centreY = (c: number): number => idiv(c, NX) * MAP.navCell + HALF;

function markRect(a: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let j = 0; j < NY; j++) {
    const cy = j * MAP.navCell + HALF;
    if (cy < y0 || cy > y1) continue;
    for (let i = 0; i < NX; i++) {
      const cx = i * MAP.navCell + HALF;
      if (cx >= x0 && cx <= x1) a[j * NX + i] = 1;
    }
  }
}

/** A lane's centre line from the Purrhaven core to the Woof core (own waypoints, then the mirrored ones back). */
function laneLine(lane: 'sunny' | 'puddle'): number[] {
  const pts = LANE_WAYPOINTS[lane];
  const out: number[] = [];
  for (let k = 0; k < pts.length; k++) out.push(pts[k][0], pts[k][1]);
  for (let k = pts.length - 1; k >= 0; k--) {
    const x = mirrorX(pts[k][0]);
    if (x !== out[out.length - 2] || pts[k][1] !== out[out.length - 1]) out.push(x, pts[k][1]);
  }
  return out;
}

/** Is (px, py) within `r` of the segment a–b? Integer maths (products stay below 2^53). */
function nearSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let qx = ax;
  let qy = ay;
  if (len2 > 0) {
    const t = Math.max(0, Math.min(len2, (px - ax) * dx + (py - ay) * dy));
    qx = ax + idiv(dx * t, len2);
    qy = ay + idiv(dy * t, len2);
  }
  return (px - qx) * (px - qx) + (py - qy) * (py - qy) <= r * r;
}

/** Crossing-number point-in-polygon over a flat [x0, y0, x1, y1, …] ring. */
function insideRing(px: number, py: number, ring: readonly number[]): boolean {
  let inside = false;
  const n = ring.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > py !== yj > py && px < xi + idiv((xj - xi) * (py - yi), yj - yi)) inside = !inside;
  }
  return inside;
}

/** Is the point on the playfield (data/map.ts PLAYFIELD)? */
export function onPlayfield(x: number, y: number): boolean {
  const rim = PLAYFIELD.rim;
  if (x < rim || y < rim || x > MAP.width - rim || y > MAP.height - rim) return false;
  const [b0, b1, b2, b3] = PLAYFIELD.base;
  if (y >= b1 && y <= b3 && ((x >= b0 && x <= b2) || (x >= mirrorX(b2) && x <= mirrorX(b0)))) return true;
  return nearLane(x, y, PLAYFIELD.laneHalf) || insideRing(x, y, LOOP);
}

const LINES: readonly (readonly number[])[] = [laneLine('sunny'), laneLine('puddle')];

/** Is (x, y) within `r` of either lane's centre line? */
export function nearLane(x: number, y: number, r: number): boolean {
  for (const lane of LINES) {
    for (let k = 0; k + 3 < lane.length; k += 2) if (nearSegment(x, y, lane[k], lane[k + 1], lane[k + 2], lane[k + 3], r)) return true;
  }
  return false;
}
/** The lane loop: Sunny Lane west to east, then Puddle Lane back east to west (the shared core points once). */
const LOOP: readonly number[] = (() => {
  const a = LINES[0];
  const b = LINES[1];
  const ring = a.slice();
  for (let k = b.length - 4; k >= 2; k -= 2) ring.push(b[k], b[k + 1]);
  return ring;
})();

export function createGrid(): NavGrid {
  const walls = new Uint8Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) if (!onPlayfield(i * MAP.navCell + HALF, j * MAP.navCell + HALF)) walls[j * NX + i] = 1;
  }
  for (let k = 0; k < WALLS.length; k++) {
    const [x0, y0, x1, y1] = WALLS[k];
    markRect(walls, x0, y0, x1, y1);
    markRect(walls, mirrorX(x1), y0, mirrorX(x0), y1);
  }
  return { walls, blocked: walls.slice(), cover: new Uint8Array(NX * NY) };
}

/** Add (+1) or remove (−1) a round structure footprint. */
export function coverDisc(g: NavGrid, x: number, y: number, r: number, delta: 1 | -1): void {
  const r2 = r * r;
  const i0 = cellX(x - r);
  const i1 = cellX(x + r);
  const j0 = cellY(y - r);
  const j1 = cellY(y + r);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i * MAP.navCell + HALF - x;
      const dy = j * MAP.navCell + HALF - y;
      if (dx * dx + dy * dy > r2) continue;
      const c = j * NX + i;
      g.cover[c] += delta;
      g.blocked[c] = g.walls[c] | (g.cover[c] > 0 ? 1 : 0);
    }
  }
}

export const walkable = (g: NavGrid, c: number): boolean => g.blocked[c] === 0;

/** Is the straight segment free of blocked cells? Sampled every NAV.losStep mm, both ends included. */
export function lineClear(g: NavGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  const n = idiv(len, NAV.losStep) + 1;
  for (let k = 0; k <= n; k++) {
    if (g.blocked[cellOf(ax + idiv(dx * k, n), ay + idiv(dy * k, n))] !== 0) return false;
  }
  return true;
}

/** The nearest walkable cell to `c` within NAV.snapCells rings (ties: lowest index), or −1. */
export function snapCell(g: NavGrid, c: number): number {
  if (walkable(g, c)) return c;
  const ci = c % NX;
  const cj = idiv(c, NX);
  for (let r = 1; r <= NAV.snapCells; r++) {
    let best = -1;
    let bestD = 0;
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= NY) continue;
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || i >= NX) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const k = j * NX + i;
        if (!walkable(g, k)) continue;
        const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
        if (best < 0 || d < bestD) {
          best = k;
          bestD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}
