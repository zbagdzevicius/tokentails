// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/physics/Pathfind.js (integer rewrite, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * Integer A* on the nav grid (port of the core of swordcat src/physics/Pathfind.js, without its height and jump
 * links): 8-connected, straight cost 10, diagonal 14, no corner cutting, octile heuristic, a binary heap of
 * `f × CELL_SPAN + cell` keys (so ties break on the lowest cell index), at most NAV.maxExpand expansions; on overflow
 * or an unreachable goal the path goes to the expanded node nearest the goal. Then string pulling with the grid
 * line test, at most NAV.maxPathPoints points.
 *
 * Scratch arrays are module-level and reset by a stamp per query; nothing here survives a query, so the result
 * depends only on the grid and the endpoints.
 */
import { MAP, MAX_CELLS, NAV } from '../../data/map';
import { NX, NY, cellOf, centreX, centreY, escapeCell, lineClear, snapCell, walkable, type NavGrid } from '../map/grid';
import { idiv } from '../fixed';

/** Sim v19: sized for the largest map (heap keys order by f, then cell, on any span above the cell count). */
const SIZE = MAX_CELLS;
/** Power of two above SIZE: heap keys are f × CELL_SPAN + cell. */
const CELL_SPAN = (() => {
  let s = 1;
  while (s <= SIZE) s *= 2;
  return s;
})();
const STRAIGHT = 10;
const DIAG = 14;

const g = new Int32Array(SIZE);
const from = new Int32Array(SIZE);
const seen = new Uint32Array(SIZE);
const closed = new Uint32Array(SIZE);
let heap = new Int32Array(SIZE);
let heapN = 0;
let stamp = 0;

const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];

function push(key: number): void {
  if (heapN >= heap.length) {
    const next = new Int32Array(heap.length * 2);
    next.set(heap);
    heap = next;
  }
  let i = heapN++;
  heap[i] = key;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p] <= heap[i]) break;
    const t = heap[p];
    heap[p] = heap[i];
    heap[i] = t;
    i = p;
  }
}

function pop(): number {
  const top = heap[0];
  const last = --heapN;
  if (last > 0) {
    heap[0] = heap[last];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < last && heap[l] < heap[m]) m = l;
      if (r < last && heap[r] < heap[m]) m = r;
      if (m === i) break;
      const t = heap[m];
      heap[m] = heap[i];
      heap[i] = t;
      i = m;
    }
  }
  return top;
}

function octile(a: number, b: number): number {
  const dx = Math.abs((a % NX) - (b % NX));
  const dy = Math.abs(idiv(a, NX) - idiv(b, NX));
  return STRAIGHT * Math.max(dx, dy) + (DIAG - STRAIGHT) * Math.min(dx, dy);
}

/** Sim v19: the running query mirrors its tie-breaks across the river (findPath, team 1 on a point map). */
let mir = false;
/** The tie-break index of cell `c` (its own index, or the river mirror's), and back. */
function tieOf(c: number): number {
  if (!mir) return c;
  const i = c % NX;
  const j = idiv(c, NX);
  return (NX - 1 - i) * NX + (NY - 1 - j);
}
function cellOfTie(k: number): number {
  if (!mir) return k;
  const i = NX - 1 - idiv(k, NX);
  const j = NY - 1 - (k % NX);
  return j * NX + i;
}

/** The team layer of the running query (findPath), or null. */
let foe: Uint8Array | null = null;
const pass = (grid: NavGrid, c: number): boolean => walkable(grid, c) && (foe === null || foe[c] === 0);
/** lineClear, also refusing the query's team layer. */
function clear(grid: NavGrid, ax: number, ay: number, bx: number, by: number): boolean {
  if (!lineClear(grid, ax, ay, bx, by)) return false;
  if (foe === null) return true;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  const n = idiv(len, NAV.losStep) + 1;
  for (let k = 0; k <= n; k++) if (foe[cellOf(ax + idiv(dx * k, n), ay + idiv(dy * k, n))] !== 0) return false;
  return true;
}
/** snapCell with the team layer: the nearest passable cell within NAV.snapCells rings (ties: lowest index; mirrored
 *  for team 1 on a point map), or −1. */
function snapPass(grid: NavGrid, c: number): number {
  const ci = c % NX;
  const cj = idiv(c, NX);
  for (let r = 1; r <= NAV.snapCells; r++) {
    let best = -1;
    let bestD = 0;
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= NY) continue;
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || i >= NX || Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const k = j * NX + i;
        if (!pass(grid, k)) continue;
        const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
        if (best < 0 || d < bestD || (mir && d === bestD && tieOf(k) < tieOf(best))) {
          best = k;
          bestD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export interface PathResult {
  /** Path points in mm after string pulling (the first point is the first one to walk to; the start is not in it). */
  count: number;
  /** True when the path ends at the requested goal (not a snapped or best-effort cell). */
  complete: boolean;
  expansions: number;
}

/** Cell chain of the last search, goal first. */
const chain = new Int32Array(SIZE);

/**
 * Path from (sx, sy) to (tx, ty). Writes up to NAV.maxPathPoints points into outX/outY at `offset`. A start on a
 * blocked cell snaps to the nearest walkable one (sim v16: by BFS over the whole grid when none is within
 * NAV.snapCells); a blocked goal snaps too (the path is then not `complete`).
 */
export function findPath(
  grid: NavGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  outX: Int32Array,
  outY: Int32Array,
  offset: number,
  team = -1,
): PathResult {
  const maxPoints = NAV.maxPathPoints;
  // Sim v16 (MAP-GAPS B15): a team's search also avoids the enemy fountain (grid.foe[team]), unless it starts inside it.
  const layer = team >= 0 && grid.foe ? grid.foe[team] : null;
  foe = layer !== null && layer[cellOf(sx, sy)] === 0 ? layer : null;
  // Sim v19 (point maps): team 1's search is the river mirror of team 0's (ties below).
  mir = MAP.point === 1 && team === 1 && NX === NY;
  // Sim v16 (MAP-GAPS B1): a start deeper in a wall than NAV.snapCells escapes by BFS to the nearest walkable cell.
  const startRaw = snapCell(grid, cellOf(sx, sy), mir);
  const start = startRaw >= 0 ? startRaw : escapeCell(grid, cellOf(sx, sy));
  const goalRaw = cellOf(tx, ty);
  const goal = foe !== null && foe[goalRaw] !== 0 ? snapPass(grid, goalRaw) : snapCell(grid, goalRaw, mir);
  if (start < 0 || goal < 0) return { count: 0, complete: false, expansions: 0 };
  // Direct line: no search.
  if (goal === goalRaw && clear(grid, sx, sy, tx, ty)) {
    outX[offset] = tx;
    outY[offset] = ty;
    return { count: 1, complete: true, expansions: 0 };
  }
  stamp = (stamp + 1) >>> 0;
  if (stamp === 0) {
    seen.fill(0);
    closed.fill(0);
    stamp = 1;
  }
  // Sim v19 (point maps): team 1's search is the river mirror of team 0's, (i, j) → (N − 1 − j, N − 1 − i): its ties
  // break on the mirrored cell index and it tries the mirrored neighbours in the same order, so on the mirror-symmetric
  // map both teams walk mirror-image paths (Crossing and team 0: unchanged).
  heapN = 0;
  g[start] = 0;
  from[start] = -1;
  seen[start] = stamp;
  push(octile(start, goal) * CELL_SPAN + tieOf(start));
  let best = start;
  let bestH = octile(start, goal);
  let expansions = 0;
  let found = false;
  while (heapN > 0) {
    const key = pop();
    const c = cellOfTie(key % CELL_SPAN);
    if (closed[c] === stamp) continue;
    closed[c] = stamp;
    if (c === goal) {
      found = true;
      best = c;
      break;
    }
    const h = octile(c, goal);
    if (h < bestH || (h === bestH && tieOf(c) < tieOf(best))) {
      bestH = h;
      best = c;
    }
    if (++expansions > NAV.maxExpand) break;
    const ci = c % NX;
    const cj = idiv(c, NX);
    for (let d = 0; d < DI.length; d++) {
      const ni = ci + (mir ? -DJ[d] : DI[d]);
      const nj = cj + (mir ? -DI[d] : DJ[d]);
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const n = nj * NX + ni;
      if (!pass(grid, n) || closed[n] === stamp) continue;
      const diag = d >= 4;
      if (diag && (!pass(grid, cj * NX + ni) || !pass(grid, nj * NX + ci))) continue;
      const ng = g[c] + (diag ? DIAG : STRAIGHT);
      if (seen[n] === stamp && ng >= g[n]) continue;
      seen[n] = stamp;
      g[n] = ng;
      from[n] = c;
      push((ng + octile(n, goal)) * CELL_SPAN + tieOf(n));
    }
  }
  // Walk the chain back (goal first).
  let len = 0;
  for (let c = best; c >= 0 && len < SIZE; c = from[c]) chain[len++] = c;
  const complete = found && goal === goalRaw;
  const endX = complete ? tx : centreX(best);
  const endY = complete ? ty : centreY(best);
  // String pulling from the real start: jump to the furthest chain cell in sight.
  let count = 0;
  let px = sx;
  let py = sy;
  let i = len - 1; // chain[len − 1] is the start cell
  if (start !== cellOf(sx, sy)) {
    // Off-grid start: step to the snapped cell first.
    px = centreX(start);
    py = centreY(start);
    outX[offset + count] = px;
    outY[offset + count] = py;
    count++;
  }
  while (count < maxPoints) {
    if (clear(grid, px, py, endX, endY)) {
      outX[offset + count] = endX;
      outY[offset + count] = endY;
      count++;
      break;
    }
    let k = 0;
    while (k < i - 1 && clear(grid, px, py, centreX(chain[k]), centreY(chain[k])) === false) k++;
    // chain[k] is the furthest-along visible cell (the chain runs goal → start, so a smaller k is further along).
    if (k >= i) k = i - 1;
    if (k < 0) break;
    px = centreX(chain[k]);
    py = centreY(chain[k]);
    outX[offset + count] = px;
    outY[offset + count] = py;
    count++;
    i = k;
  }
  // Out of points before the end: the walker re-paths when it runs out (its goal is kept in moveX/moveY).
  return { count, complete, expansions };
}
