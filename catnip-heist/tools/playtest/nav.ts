/**
 * Grid helpers for the playtest bots: what the camera shows, vision cones exactly as the sim tests
 * them, a small binary heap, and the plate-door region graph.
 */
import { SUBTILE, type Axis, type LevelDef, type Vec2i } from '../../src/types';
import { T_FLOOR, centerOf, lineOfSight, type CompiledLevel } from '../../src/sim/grid';
import { inCone } from '../../src/sim/sim';

/**
 * Desktop camera footprint on the ground, in tiles from the followed cat (src/render/camera.ts:
 * ortho view 11.5 units tall at 16:9, yaw 45 degrees, pitch 35 degrees). Half-width across the
 * screen 10.2; half-depth up/down the screen 5.75 / sin(35 deg) = 10.0.
 */
export const VIEW_HALF_W = 10.2;
export const VIEW_HALF_D = 10.0;
const INV_SQRT2 = Math.SQRT1_2;

/** True when tile (tx, ty) is on screen for a camera centred on sub-tile point (px, py). */
export function inView(px: number, py: number, tx: number, ty: number, scale: number): boolean {
  const dx = tx + 0.5 - px / SUBTILE;
  const dy = ty + 0.5 - py / SUBTILE;
  const sx = (dx - dy) * INV_SQRT2;
  const sd = (dx + dy) * INV_SQRT2;
  return Math.abs(sx) <= VIEW_HALF_W * scale && Math.abs(sd) <= VIEW_HALF_D * scale;
}

/** Bounding radius (tiles) of the view rectangle, for loops. */
export function viewRadius(scale: number): number {
  return Math.ceil(Math.hypot(VIEW_HALF_W, VIEW_HALF_D) * scale) + 1;
}

const coneCache = new WeakMap<CompiledLevel, Map<string, Int32Array>>();

/**
 * Tiles whose centre a guard standing on the centre of tile (gx, gy) facing f sees: the same rule as
 * sim/sim.ts guardSeesPoint (cone + tile line of sight), so it is what the renderer draws.
 * Memoised per (tile, facing, radius, door mask).
 */
export function coneTiles(c: CompiledLevel, gx: number, gy: number, fx: number, fy: number, vision: number, doorsOpen: readonly boolean[]): Int32Array {
  let m = coneCache.get(c);
  if (!m) {
    m = new Map();
    coneCache.set(c, m);
  }
  let mask = '';
  for (let i = 0; i < doorsOpen.length; i++) mask += doorsOpen[i] ? '1' : '0';
  const key = `${gx},${gy},${fx},${fy},${vision},${mask}`;
  const hit = m.get(key);
  if (hit) return hit;
  const out: number[] = [];
  const gp = centerOf({ x: gx, y: gy });
  const from = { x: gx, y: gy };
  const r = vision + 1;
  for (let y = gy - r; y <= gy + r; y++)
    for (let x = gx - r; x <= gx + r; x++) {
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
      if (c.terrain[y * c.w + x] !== T_FLOOR) continue;
      const p = centerOf({ x, y });
      if (!inCone(gp, { x: fx, y: fy }, p, vision)) continue;
      if (!lineOfSight(c, from, { x, y }, doorsOpen)) continue;
      out.push(y * c.w + x);
    }
  const arr = Int32Array.from(out);
  m.set(key, arr);
  return arr;
}

/** Min-heap of (priority, value) pairs with integer values. Ties pop in insertion order. */
export class Heap {
  private pr: number[] = [];
  private val: number[] = [];
  private seq: number[] = [];
  private n = 0;
  get size(): number {
    return this.pr.length;
  }
  clear(): void {
    this.pr.length = 0;
    this.val.length = 0;
    this.seq.length = 0;
    this.n = 0;
  }
  push(p: number, v: number): void {
    const pr = this.pr;
    const val = this.val;
    const seq = this.seq;
    let i = pr.length;
    pr.push(p);
    val.push(v);
    seq.push(this.n++);
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (pr[q] < pr[i] || (pr[q] === pr[i] && seq[q] < seq[i])) break;
      this.swap(i, q);
      i = q;
    }
  }
  /** Pops the value with the smallest priority (undefined when empty). */
  pop(): number | undefined {
    const pr = this.pr;
    if (!pr.length) return undefined;
    const top = this.val[0];
    const last = pr.length - 1;
    this.swap(0, last);
    pr.pop();
    this.val.pop();
    this.seq.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < pr.length && this.less(l, m)) m = l;
      if (r < pr.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
  private less(a: number, b: number): boolean {
    return this.pr[a] < this.pr[b] || (this.pr[a] === this.pr[b] && this.seq[a] < this.seq[b]);
  }
  private swap(a: number, b: number): void {
    const { pr, val, seq } = this;
    [pr[a], pr[b]] = [pr[b], pr[a]];
    [val[a], val[b]] = [val[b], val[a]];
    [seq[a], seq[b]] = [seq[b], seq[a]];
  }
}

export const DX4 = [1, 0, -1, 0];
export const DY4 = [0, 1, 0, -1];

/**
 * Region graph: connected components of the walkable tiles the player knows about, with every plate
 * door treated as a wall (a lone cat can never hold its own door open). `passable(i)` decides
 * everything else (known tiles, the vault door once the key is in hand).
 */
export interface Regions {
  id: Int16Array;
  count: number;
}

export function buildRegions(c: CompiledLevel, passable: (i: number) => boolean, plateDoorAt: (i: number) => boolean): Regions {
  const n = c.w * c.h;
  const id = new Int16Array(n).fill(-1);
  let count = 0;
  const q: number[] = [];
  for (let s = 0; s < n; s++) {
    if (id[s] >= 0 || !passable(s) || plateDoorAt(s)) continue;
    id[s] = count;
    q.length = 0;
    q.push(s);
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % c.w;
      const y = (i - x) / c.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX4[k];
        const ny = y + DY4[k];
        if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h) continue;
        const ni = ny * c.w + nx;
        if (id[ni] >= 0 || !passable(ni) || plateDoorAt(ni)) continue;
        id[ni] = count;
        q.push(ni);
      }
    }
    count++;
  }
  return { id, count };
}

/** A plate door transition: a cat in `from` can walk to `to` through `door` while its partner stands on a plate in `plateRegion`. */
export interface DoorEdge {
  door: number;
  from: number;
  to: number;
  /** Plate indices (into level.plates) whose region is what matters. */
  plates: number[];
}

/** Joint (cat 0 region, cat 1 region) search: the first door move towards a joint state that satisfies `goal`. */
export interface JointMove {
  mover: 0 | 1;
  door: number;
  to: number;
  /** Plates of the door in the holder's region. */
  plates: number[];
  /** Number of door moves in the whole plan. */
  moves: number;
}

export function jointSearch(
  start: [number, number],
  edges: readonly DoorEdge[],
  plateRegion: (plate: number) => number,
  goal: (r0: number, r1: number) => boolean,
  maxStates = 4096,
): JointMove | null | 'here' {
  if (goal(start[0], start[1])) return 'here';
  const key = (a: number, b: number) => a * 4096 + b;
  const seen = new Map<number, { prev: number; move: JointMove | null }>();
  const q: [number, number][] = [start];
  seen.set(key(start[0], start[1]), { prev: -1, move: null });
  for (let h = 0; h < q.length && seen.size < maxStates; h++) {
    const [r0, r1] = q[h];
    const k0 = key(r0, r1);
    for (const mover of [0, 1] as const) {
      const rm = mover === 0 ? r0 : r1;
      const rh = mover === 0 ? r1 : r0;
      for (const e of edges) {
        if (e.from !== rm) continue;
        const held = e.plates.filter((p) => plateRegion(p) === rh);
        if (!held.length) continue;
        const n0 = mover === 0 ? e.to : r0;
        const n1 = mover === 0 ? r1 : e.to;
        const nk = key(n0, n1);
        if (seen.has(nk)) continue;
        seen.set(nk, { prev: k0, move: { mover, door: e.door, to: e.to, plates: held, moves: 0 } });
        if (goal(n0, n1)) {
          // Walk back to the first move.
          let cur = nk;
          let moves = 0;
          let first: JointMove | null = null;
          while (cur !== key(start[0], start[1])) {
            const rec = seen.get(cur)!;
            first = rec.move;
            moves++;
            cur = rec.prev;
          }
          return first ? { ...first, moves } : null;
        }
        q.push([n0, n1]);
      }
    }
  }
  return null;
}

/** Plate door edges of the region graph (both directions). */
export function doorEdges(c: CompiledLevel, level: LevelDef, regions: Regions, doorUsable: (d: number) => boolean, plateUsable: (p: number) => boolean): DoorEdge[] {
  const edges: DoorEdge[] = [];
  level.doors.forEach((d, di) => {
    if (d.kind !== 'PLATE' || !doorUsable(di)) return;
    const adj = new Set<number>();
    for (let k = 0; k < 4; k++) {
      const x = d.tile.x + DX4[k];
      const y = d.tile.y + DY4[k];
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
      const r = regions.id[y * c.w + x];
      if (r >= 0) adj.add(r);
    }
    const plates = c.doorPlates[di].filter(plateUsable);
    if (!plates.length) return;
    for (const a of adj) for (const b of adj) if (a !== b) edges.push({ door: di, from: a, to: b, plates });
  });
  return edges;
}

export function tileIndex(c: CompiledLevel, t: Vec2i): number {
  return t.y * c.w + t.x;
}

/**
 * Grid direction a player holds to reach the centre of tile (tx, ty) from sub-tile point `pos`:
 * each axis is pressed while more than 2 units off (so a straight leg from a centre is a clean
 * cardinal hold), and a final nudge when both axes are within 2.
 */
export function steerDir(pos: Vec2i, tx: number, ty: number): [Axis, Axis] {
  const ddx = tx * SUBTILE + (SUBTILE >> 1) - pos.x;
  const ddy = ty * SUBTILE + (SUBTILE >> 1) - pos.y;
  const sg = (n: number): Axis => (n > 0 ? 1 : n < 0 ? -1 : 0);
  let dx: Axis = Math.abs(ddx) > 2 ? sg(ddx) : 0;
  let dy: Axis = Math.abs(ddy) > 2 ? sg(ddy) : 0;
  if (dx === 0 && dy === 0) {
    dx = sg(ddx);
    dy = sg(ddy);
  }
  return [dx, dy];
}
