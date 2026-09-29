/**
 * Level format loader and validator. Levels are JSON files matching LevelDef (src/types.ts).
 */
import { SUBTILE, type LevelDef, type Vec2i } from '../types';
import { T_FLOOR, compileLevel } from './grid';

export class LevelError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid level:\n- ${problems.join('\n- ')}`);
    this.name = 'LevelError';
  }
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isVec = (v: unknown): v is Vec2i =>
  !!v && typeof v === 'object' && isInt((v as Vec2i).x) && isInt((v as Vec2i).y);

/** Returns a list of problems (empty = valid). Checks shape, tiles, links and fairness rules. */
export function validateLevel(level: LevelDef): string[] {
  const p: string[] = [];
  if (!level || typeof level !== 'object') return ['level is not an object'];
  if (typeof level.id !== 'string' || !level.id) p.push('id missing');
  if (!Array.isArray(level.tiles) || level.tiles.length === 0) return [...p, 'tiles missing'];
  const w = level.tiles[0].length;
  level.tiles.forEach((row, y) => {
    if (typeof row !== 'string') p.push(`tiles[${y}] not a string`);
    else if (row.length !== w) p.push(`tiles[${y}] has length ${row.length}, expected ${w}`);
    else if (!/^[#. br]*$/.test(row)) p.push(`tiles[${y}] has characters outside "#. br"`);
  });
  if (p.length) return p;
  const c = compileLevel(level);
  const floor = (t: Vec2i, what: string) => {
    if (!isVec(t)) {
      p.push(`${what}: bad tile`);
      return;
    }
    if (t.x < 0 || t.y < 0 || t.x >= c.w || t.y >= c.h) p.push(`${what}: (${t.x},${t.y}) out of bounds`);
    else if (c.terrain[t.y * c.w + t.x] !== T_FLOOR) p.push(`${what}: (${t.x},${t.y}) is not floor`);
  };
  const ids = new Set<string>();
  const uniq = (id: string, what: string) => {
    if (typeof id !== 'string' || !id) p.push(`${what}: id missing`);
    else if (ids.has(id)) p.push(`${what}: duplicate id ${id}`);
    else ids.add(id);
  };
  if (!Array.isArray(level.catSpawns) || level.catSpawns.length !== 2) p.push('catSpawns must have 2 tiles');
  else level.catSpawns.forEach((t, i) => floor(t, `catSpawns[${i}]`));
  for (const d of level.doors) {
    uniq(d.id, 'door');
    floor(d.tile, `door ${d.id}`);
    if (d.kind !== 'PLATE' && d.kind !== 'VAULT') p.push(`door ${d.id}: bad kind`);
  }
  for (const pl of level.plates) {
    uniq(pl.id, 'plate');
    floor(pl.tile, `plate ${pl.id}`);
    for (const did of pl.doors) {
      const d = level.doors.find((x) => x.id === did);
      if (!d) p.push(`plate ${pl.id}: unknown door ${did}`);
      else if (d.kind !== 'PLATE') p.push(`plate ${pl.id}: door ${did} is not a PLATE door`);
      else if (Math.max(Math.abs(d.tile.x - pl.tile.x), Math.abs(d.tile.y - pl.tile.y)) < 2)
        p.push(`plate ${pl.id}: must be at least 2 tiles (Chebyshev) from door ${did}`);
    }
  }
  for (const co of level.coins) {
    uniq(co.id, 'coin');
    floor(co.tile, `coin ${co.id}`);
  }
  if (level.key) {
    uniq(level.key.id, 'key');
    floor(level.key.tile, 'key');
  }
  uniq(level.crate.id, 'crate');
  floor(level.crate.tile, 'crate');
  if (typeof level.crate.catId !== 'string' || typeof level.crate.catName !== 'string') p.push('crate: catId/catName');
  uniq(level.exit.id, 'exit');
  if (!level.exit.tiles.length) p.push('exit: no tiles');
  level.exit.tiles.forEach((t, i) => floor(t, `exit tile ${i}`));
  for (const cp of level.checkpoints) {
    uniq(cp.id, 'checkpoint');
    floor(cp.tile, `checkpoint ${cp.id}`);
  }
  for (const g of level.guards) {
    uniq(g.id, 'guard');
    if (!g.waypoints.length) p.push(`guard ${g.id}: no waypoints`);
    g.waypoints.forEach((t, i) => floor(t, `guard ${g.id} waypoint ${i}`));
    if (!isInt(g.speed) || g.speed <= 0 || SUBTILE % g.speed !== 0 || g.speed > SUBTILE / 2)
      p.push(`guard ${g.id}: speed must divide ${SUBTILE} and be <= ${SUBTILE / 2}`);
    if (!isInt(g.sniffTicks) || g.sniffTicks < 0) p.push(`guard ${g.id}: sniffTicks`);
    if (!isInt(g.visionTiles) || g.visionTiles <= 0) p.push(`guard ${g.id}: visionTiles`);
    const isDir = (f: unknown) =>
      isVec(f) && Math.abs(f.x) <= 1 && Math.abs(f.y) <= 1 && (f.x !== 0 || f.y !== 0);
    if (g.facing !== undefined && !isDir(g.facing)) p.push(`guard ${g.id}: facing must be a unit direction`);
    if (g.turns !== undefined) {
      if (!Array.isArray(g.turns) || g.turns.length === 0) p.push(`guard ${g.id}: turns must be a non-empty list`);
      else {
        if (g.waypoints.length !== 1) p.push(`guard ${g.id}: turns needs exactly one waypoint (a sentry post)`);
        g.turns.forEach((t, i) => {
          if (!t || !isDir(t.facing)) p.push(`guard ${g.id}: turns[${i}].facing must be a unit direction`);
          if (!t || !isInt(t.ticks) || t.ticks <= 0) p.push(`guard ${g.id}: turns[${i}].ticks must be a positive integer`);
        });
      }
    }
  }
  const m = level.meta;
  if (!m || !isInt(m.parTicks) || !isInt(m.meowRadiusTiles) || !isInt(m.investigateTicks)) p.push('meta: bad ints');
  if (m && m.maxCoins !== undefined && (!isInt(m.maxCoins) || level.coins.length > m.maxCoins))
    p.push(`meta: ${level.coins.length} coins exceeds maxCoins ${m.maxCoins}`);
  // Entity tiles that must not overlap each other.
  const taken = new Map<string, string>();
  const claim = (t: Vec2i, what: string) => {
    const k = `${t.x},${t.y}`;
    const prev = taken.get(k);
    if (prev) p.push(`${what} overlaps ${prev} at (${k})`);
    else taken.set(k, what);
  };
  level.doors.forEach((d) => claim(d.tile, `door ${d.id}`));
  level.plates.forEach((d) => claim(d.tile, `plate ${d.id}`));
  level.coins.forEach((d) => claim(d.tile, `coin ${d.id}`));
  if (level.key) claim(level.key.tile, 'key');
  claim(level.crate.tile, 'crate');
  return p;
}

/** Parse and validate an unknown JSON value as a LevelDef. Throws LevelError on problems. */
export function loadLevel(json: unknown): LevelDef {
  const level = json as LevelDef;
  const problems = validateLevel(level);
  if (problems.length) throw new LevelError(problems);
  return level;
}
