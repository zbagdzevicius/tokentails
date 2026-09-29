/**
 * Level registry: the 8-level campaign in play order. Levels are validated on first access.
 * Sources live in tools/levels/<id>.mjs (built by tools/build-levels.mjs); solutions are planned by
 * tools/solver.ts (`npm run solve`).
 */
import type { LevelDef } from '../types';
import { loadLevel } from '../sim/level';
import type { InputLog } from '../sim/replay';
import heist01Json from './heist-01.json';
import heist01Solution from './heist-01.solution.json';
import heist02Json from './heist-02.json';
import heist02Solution from './heist-02.solution.json';
import heist03Json from './heist-03.json';
import heist03Solution from './heist-03.solution.json';
import heist04Json from './heist-04.json';
import heist04Solution from './heist-04.solution.json';
import heist05Json from './heist-05.json';
import heist05Solution from './heist-05.solution.json';
import heist06Json from './heist-06.json';
import heist06Solution from './heist-06.solution.json';
import heist07Json from './heist-07.json';
import heist07Solution from './heist-07.solution.json';
import heist08Json from './heist-08.json';
import heist08Solution from './heist-08.solution.json';

const SOURCES: readonly { id: string; json: unknown; solution: unknown }[] = [
  { id: 'heist-01', json: heist01Json, solution: heist01Solution },
  { id: 'heist-02', json: heist02Json, solution: heist02Solution },
  { id: 'heist-03', json: heist03Json, solution: heist03Solution },
  { id: 'heist-04', json: heist04Json, solution: heist04Solution },
  { id: 'heist-05', json: heist05Json, solution: heist05Solution },
  { id: 'heist-06', json: heist06Json, solution: heist06Solution },
  { id: 'heist-07', json: heist07Json, solution: heist07Solution },
  { id: 'heist-08', json: heist08Json, solution: heist08Solution },
];

/** Campaign order. Level N unlocks when level N-1 is won. */
export const LEVEL_IDS: readonly string[] = SOURCES.map((s) => s.id);

const cache = new Map<string, LevelDef>();

export function hasLevel(id: string): boolean {
  return LEVEL_IDS.includes(id);
}

export function getLevel(id: string): LevelDef {
  const hit = cache.get(id);
  if (hit) return hit;
  const src = SOURCES.find((s) => s.id === id);
  if (!src) throw new Error(`unknown level ${id}`);
  const level = loadLevel(src.json);
  cache.set(id, level);
  return level;
}

/** Planned winning input log for a level (written by tools/solver.ts). */
export function getSolution(id: string): InputLog {
  const src = SOURCES.find((s) => s.id === id);
  if (!src) throw new Error(`unknown level ${id}`);
  return src.solution as InputLog;
}

/** Every campaign level, in order. */
export function getLevels(): LevelDef[] {
  return LEVEL_IDS.map(getLevel);
}

/** Id of the level after `id`, or null for the last one. */
export function nextLevelId(id: string): string | null {
  const i = LEVEL_IDS.indexOf(id);
  return i >= 0 && i + 1 < LEVEL_IDS.length ? LEVEL_IDS[i + 1] : null;
}

/** The first heist: tutorial room + Kibble Corp warehouse. */
export function getHeist01(): LevelDef {
  return getLevel('heist-01');
}

/** Planned winning input log for heist-01. */
export const HEIST_01_SOLUTION = heist01Solution as unknown as InputLog;
