/**
 * Compiled, read-only view of a LevelDef for fast integer lookups. Pure; memoised per LevelDef
 * object (the LevelDef must not be mutated after first use).
 */
import { SUBTILE, type LevelDef, type Vec2i } from '../types';

export const HALF = SUBTILE >> 1;

/** Static terrain classes. */
export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_BOX = 2;

export interface CompiledLevel {
  level: LevelDef;
  w: number;
  h: number;
  /** Terrain class per tile (T_FLOOR / T_WALL / T_BOX). Void counts as wall. */
  terrain: Uint8Array;
  /** Door index + 1 per tile (0 = none). */
  doorAt: Int16Array;
  /** Plate index + 1 per tile (0 = none). */
  plateAt: Int16Array;
  /** Coin index + 1 per tile (0 = none). */
  coinAt: Int16Array;
  /** Checkpoint index + 1 per tile (0 = none). */
  checkpointAt: Int16Array;
  /** 1 on exit tiles. */
  exitAt: Uint8Array;
  crateIdx: number;
  keyIdx: number;
  /** For each door: indices of plates linked to it. */
  doorPlates: number[][];
  /** Guard index by id. */
  guardIndexById: Map<string, number>;
}

const cache = new WeakMap<LevelDef, CompiledLevel>();

export function compileLevel(level: LevelDef): CompiledLevel {
  const hit = cache.get(level);
  if (hit) return hit;
  const h = level.tiles.length;
  const w = h > 0 ? level.tiles[0].length : 0;
  const n = w * h;
  const terrain = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < w; x++) {
      const c = x < row.length ? row[x] : ' ';
      terrain[y * w + x] = c === '.' || c === 'r' ? T_FLOOR : c === 'b' ? T_BOX : T_WALL;
    }
  }
  const idx = (t: Vec2i) => t.y * w + t.x;
  const doorAt = new Int16Array(n);
  level.doors.forEach((d, i) => (doorAt[idx(d.tile)] = i + 1));
  const plateAt = new Int16Array(n);
  level.plates.forEach((p, i) => (plateAt[idx(p.tile)] = i + 1));
  const coinAt = new Int16Array(n);
  level.coins.forEach((c, i) => (coinAt[idx(c.tile)] = i + 1));
  const checkpointAt = new Int16Array(n);
  level.checkpoints.forEach((c, i) => (checkpointAt[idx(c.tile)] = i + 1));
  const exitAt = new Uint8Array(n);
  for (const t of level.exit.tiles) exitAt[idx(t)] = 1;
  const doorPlates: number[][] = level.doors.map(() => []);
  level.plates.forEach((p, pi) => {
    for (const id of p.doors) {
      const di = level.doors.findIndex((d) => d.id === id);
      if (di >= 0) doorPlates[di].push(pi);
    }
  });
  const guardIndexById = new Map<string, number>();
  level.guards.forEach((g, i) => guardIndexById.set(g.id, i));
  const c: CompiledLevel = {
    level,
    w,
    h,
    terrain,
    doorAt,
    plateAt,
    coinAt,
    checkpointAt,
    exitAt,
    crateIdx: idx(level.crate.tile),
    keyIdx: level.key ? idx(level.key.tile) : -1,
    doorPlates,
    guardIndexById,
  };
  cache.set(level, c);
  return c;
}

export function inBounds(c: CompiledLevel, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < c.w && y < c.h;
}

/** Tile coordinate of a sub-tile position (positions are never negative in a valid level). */
export function tileOf(p: Vec2i): Vec2i {
  return { x: p.x >> 4, y: p.y >> 4 };
}

export function centerOf(t: Vec2i): Vec2i {
  return { x: t.x * SUBTILE + HALF, y: t.y * SUBTILE + HALF };
}

export function atCenter(p: Vec2i): boolean {
  return (p.x & (SUBTILE - 1)) === HALF && (p.y & (SUBTILE - 1)) === HALF;
}

/** Walkable for a cat/guard given the door state (the crate tile always blocks). */
export function isOpenTile(c: CompiledLevel, x: number, y: number, doorsOpen: readonly boolean[]): boolean {
  if (!inBounds(c, x, y)) return false;
  const i = y * c.w + x;
  if (c.terrain[i] !== T_FLOOR) return false;
  if (i === c.crateIdx) return false;
  const d = c.doorAt[i];
  if (d > 0 && !doorsOpen[d - 1]) return false;
  return true;
}

/** Blocks line of sight (walls, void, boxes, closed doors). */
export function isOpaque(c: CompiledLevel, x: number, y: number, doorsOpen: readonly boolean[]): boolean {
  if (!inBounds(c, x, y)) return true;
  const i = y * c.w + x;
  if (c.terrain[i] !== T_FLOOR) return true;
  const d = c.doorAt[i];
  return d > 0 && !doorsOpen[d - 1];
}

/**
 * Integer line of sight between two tiles (Bresenham). Only the tiles strictly between the
 * endpoints are tested, plus diagonal corner cracks (a diagonal step between two opaque tiles that
 * touch at a corner is blocked).
 */
export function lineOfSight(c: CompiledLevel, a: Vec2i, b: Vec2i, doorsOpen: readonly boolean[]): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === b.x && y === b.y) return true;
    const e2 = 2 * err;
    const px = x;
    const py = y;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    // A diagonal step squeezes between two tiles touching at a corner: blocked if both are opaque
    // (same rule as cat movement, which never cuts corners).
    if (x !== px && y !== py && isOpaque(c, x, py, doorsOpen) && isOpaque(c, px, y, doorsOpen)) return false;
    if (x === b.x && y === b.y) return true;
    if (isOpaque(c, x, y, doorsOpen)) return false;
  }
}

/** Orthogonal neighbour order used everywhere a tie must be broken: E, S, W, N. */
export const DIRS4: readonly Vec2i[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const distCache = new WeakMap<CompiledLevel, Map<string, Int32Array>>();

/**
 * BFS distance field (in tiles, 4-neighbour) to `target` over guard-walkable tiles for the given
 * door state. -1 = unreachable. Memoised per (level, target, door mask).
 */
export function distanceField(c: CompiledLevel, target: Vec2i, doorsOpen: readonly boolean[]): Int32Array {
  let m = distCache.get(c);
  if (!m) {
    m = new Map();
    distCache.set(c, m);
  }
  let mask = '';
  for (let i = 0; i < doorsOpen.length; i++) mask += doorsOpen[i] ? '1' : '0';
  const key = `${target.x},${target.y},${mask}`;
  const hit = m.get(key);
  if (hit) return hit;
  const n = c.w * c.h;
  const dist = new Int32Array(n).fill(-1);
  if (inBounds(c, target.x, target.y)) {
    const q = new Int32Array(n);
    let qh = 0;
    let qt = 0;
    const ti = target.y * c.w + target.x;
    dist[ti] = 0;
    q[qt++] = ti;
    while (qh < qt) {
      const i = q[qh++];
      const x = i % c.w;
      const y = (i - x) / c.w;
      for (const d of DIRS4) {
        const nx = x + d.x;
        const ny = y + d.y;
        if (!isOpenTile(c, nx, ny, doorsOpen)) continue;
        const ni = ny * c.w + nx;
        if (dist[ni] >= 0) continue;
        dist[ni] = dist[i] + 1;
        q[qt++] = ni;
      }
    }
  }
  m.set(key, dist);
  return dist;
}
