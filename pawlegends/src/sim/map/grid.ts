/**
 * Nav grid (POC.md §5): 1 m cells, 100 × 60, 1 = blocked. Static walls from data/map.ts (the rocks, and since sim v5
 * everything outside PLAYFIELD: the forest and the outer rim) plus the footprints of the
 * standing towers and cores (a destroyed structure frees its cells). Derived state: rebuilt the same way in a live
 * match and its replay, so it is not part of the world hash.
 */
import { ACTIVE_MAP, FOUNTAIN, LANES, LANE_PARTNER, LANE_WAYPOINTS, MAP, MAX_CELLS, NAV, PLAYFIELD, RADIUS, WALLS, mirrorX, mirrorY } from '../../data/map';
import { idiv } from '../fixed';

/** Grid size of the active map (sim v18: live, `rebindGrid`). */
export let NX = idiv(MAP.width, MAP.navCell);
export let NY = idiv(MAP.height, MAP.navCell);
let HALF = idiv(MAP.navCell, 2);

export interface NavGrid {
  /** Static walls. */
  readonly walls: Uint8Array;
  /** Walls plus standing structures: what A* reads. */
  readonly blocked: Uint8Array;
  /** Per cell: how many structures cover it. */
  readonly cover: Uint8Array;
  /**
   * Sim v16 (MAP-GAPS B15): per team, the cells of the ENEMY fountain disc (FOUNTAIN.radius + RADIUS.hero), which a
   * hero's A* routes round (`findPath` with a team). Static, built once; knockbacks and dashes ignore it.
   */
  readonly foe?: readonly Uint8Array[];
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

/**
 * A lane's centre line from team 0's core to team 1's core: its own waypoints, then (sim v18) its partner lane's
 * reflected back (Crossing: the same lane mirrored; Hearthwood: Fenceline continues on Gutterway's reflection).
 */
function laneLine(lane: number): number[] {
  const pts = LANE_WAYPOINTS[LANES[lane]];
  const back = LANE_WAYPOINTS[LANES[LANE_PARTNER[lane]]];
  const out: number[] = [];
  for (let k = 0; k < pts.length; k++) out.push(pts[k][0], pts[k][1]);
  for (let k = back.length - 1; k >= 0; k--) {
    const x = mirrorX(back[k][0]);
    const y = mirrorY(back[k][1]);
    if (x !== out[out.length - 2] || y !== out[out.length - 1]) out.push(x, y);
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

/** Is the point on the playfield (data/map.ts PLAYFIELD)? Sim v18: on an open map, everything inside the rim. */
export function onPlayfield(x: number, y: number): boolean {
  const rim = PLAYFIELD.rim;
  if (x < rim || y < rim || x > MAP.width - rim || y > MAP.height - rim) return false;
  if (PLAYFIELD.open === 1) return true;
  const [b0, b1, b2, b3] = PLAYFIELD.base;
  if (y >= b1 && y <= b3 && ((x >= b0 && x <= b2) || (x >= mirrorX(b2) && x <= mirrorX(b0)))) return true;
  return nearLane(x, y, PLAYFIELD.laneHalf) || insideRing(x, y, LOOP);
}

let LINES: readonly (readonly number[])[] = [];

/** Is (x, y) within `r` of any lane's centre line? */
export function nearLane(x: number, y: number, r: number): boolean {
  for (const lane of LINES) {
    for (let k = 0; k + 3 < lane.length; k += 2) if (nearSegment(x, y, lane[k], lane[k + 1], lane[k + 2], lane[k + 3], r)) return true;
  }
  return false;
}

/** Sim v18: the index of the lane whose centre line is nearest (x, y) (squared distance; ties: the lower index). */
export function nearestLane(x: number, y: number): number {
  let best = 0;
  let bestD = -1;
  for (let l = 0; l < LINES.length; l++) {
    const lane = LINES[l];
    for (let k = 0; k + 3 < lane.length; k += 2) {
      const d = segDist2(x, y, lane[k], lane[k + 1], lane[k + 2], lane[k + 3]);
      if (bestD < 0 || d < bestD) {
        bestD = d;
        best = l;
      }
    }
  }
  return best;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
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
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

/** The lane loop: Sunny Lane west to east, then Puddle Lane back east to west (the shared core points once). Crossing only. */
let LOOP: readonly number[] = [];

function loopOf(): readonly number[] {
  if (LINES.length < 2) return [];
  const a = LINES[0];
  const b = LINES[1];
  const ring = a.slice();
  for (let k = b.length - 4; k >= 2; k -= 2) ring.push(b[k], b[k + 1]);
  return ring;
}

/** Per map: the lane lines, the loop and the static walls, built once (src/sim/map/runtime.ts bindMap). */
const BUILT: { id: string; lines: readonly (readonly number[])[]; loop: readonly number[]; walls: Uint8Array; foe: readonly Uint8Array[] }[] = [];

/** Sim v18: point the grid at the active map (its size, lane lines, loop; the static walls are built on first use). */
export function rebindGrid(): void {
  NX = idiv(MAP.width, MAP.navCell);
  NY = idiv(MAP.height, MAP.navCell);
  HALF = idiv(MAP.navCell, 2);
  for (let i = 0; i < BUILT.length; i++) {
    if (BUILT[i].id === ACTIVE_MAP.id) {
      LINES = BUILT[i].lines;
      LOOP = BUILT[i].loop;
      return;
    }
  }
  const lines: number[][] = [];
  for (let l = 0; l < LANES.length; l++) lines.push(laneLine(l));
  LINES = lines;
  LOOP = loopOf();
  const walls = staticWalls();
  BUILT.push({ id: ACTIVE_MAP.id, lines, loop: LOOP, walls, foe: foeDiscs() });
}

function staticWalls(): Uint8Array {
  const walls = new Uint8Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) if (!onPlayfield(i * MAP.navCell + HALF, j * MAP.navCell + HALF)) walls[j * NX + i] = 1;
  }
  for (let k = 0; k < WALLS.length; k++) {
    const [x0, y0, x1, y1] = WALLS[k];
    markRect(walls, x0, y0, x1, y1);
    // The other side: x mirrored (Crossing), or x and y (a point map).
    if (MAP.point === 1) markRect(walls, mirrorX(x1), mirrorY(y1), mirrorX(x0), mirrorY(y0));
    else markRect(walls, mirrorX(x1), y0, mirrorX(x0), y1);
  }
  return walls;
}

function foeDiscs(): Uint8Array[] {
  const foe = [new Uint8Array(NX * NY), new Uint8Array(NX * NY)];
  const r = FOUNTAIN.radius + RADIUS.hero;
  for (let team = 0; team < 2; team++) {
    const fx = team === 0 ? mirrorX(FOUNTAIN.x) : FOUNTAIN.x;
    const fy = team === 0 ? mirrorY(FOUNTAIN.y) : FOUNTAIN.y;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const dx = i * MAP.navCell + HALF - fx;
        const dy = j * MAP.navCell + HALF - fy;
        if (dx * dx + dy * dy <= r * r) foe[team][j * NX + i] = 1;
      }
    }
  }
  return foe;
}

function built(): (typeof BUILT)[number] {
  for (let i = 0; i < BUILT.length; i++) if (BUILT[i].id === ACTIVE_MAP.id) return BUILT[i];
  rebindGrid();
  return built();
}

export function createGrid(): NavGrid {
  const b = built();
  return { walls: b.walls.slice(), blocked: b.walls.slice(), cover: new Uint8Array(NX * NY), foe: b.foe };
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

/**
 * The nearest walkable cell to `c` within NAV.snapCells rings (ties: lowest index), or −1. Sim v18: `mirror` breaks
 * ties on the river-mirrored index instead (team 1's searches on a point map, nav/astar.ts).
 */
export function snapCell(g: NavGrid, c: number, mirror = false): number {
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
        if (best < 0 || d < bestD || (mirror && d === bestD && mirrorIndex(k) < mirrorIndex(best))) {
          best = k;
          bestD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Sim v18: cell `c`'s index under the river mirror (i, j) → (N − 1 − j, N − 1 − i) (square grids). */
export const mirrorIndex = (c: number): number => (NX - 1 - (c % NX)) * NX + (NY - 1 - idiv(c, NX));

/** BFS scratch (escapeCell): reset by a stamp per query, so nothing survives a query. */
const bfsQueue = new Int32Array(MAX_CELLS);
const bfsSeen = new Uint32Array(MAX_CELLS);
let bfsStamp = 0;

/**
 * Sim v16 (MAP-GAPS B1): the nearest walkable cell to `c` by grid steps (BFS, neighbour order N, E, S, W, so ties are
 * fixed), over the whole grid; −1 when the grid has none. Used when `snapCell` finds nothing within NAV.snapCells, so
 * a unit deep in the forest still gets a way out.
 */
export function escapeCell(g: NavGrid, c: number): number {
  if (walkable(g, c)) return c;
  bfsStamp = (bfsStamp + 1) >>> 0;
  if (bfsStamp === 0) {
    bfsSeen.fill(0);
    bfsStamp = 1;
  }
  let head = 0;
  let tail = 0;
  bfsQueue[tail++] = c;
  bfsSeen[c] = bfsStamp;
  while (head < tail) {
    const k = bfsQueue[head++];
    const i = k % NX;
    const j = idiv(k, NX);
    for (let d = 0; d < 4; d++) {
      const ni = d === 1 ? i + 1 : d === 3 ? i - 1 : i;
      const nj = d === 0 ? j + 1 : d === 2 ? j - 1 : j;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const n = nj * NX + ni;
      if (bfsSeen[n] === bfsStamp) continue;
      if (walkable(g, n)) return n;
      bfsSeen[n] = bfsStamp;
      bfsQueue[tail++] = n;
    }
  }
  return -1;
}

rebindGrid();
