import type { RaceMode } from '../../types';

/**
 * Restart (pause > Restart, holding R, Select) is the same race again. Modes whose seed is part of the race keep
 * it: a dare and the Daily Cup race a shared seed, a time trial races TT_SEED (its ghosts and medal times were made
 * on it), and a Grand Prix race's seed comes from the cup run (a restart must not reroll its hazards or items).
 * A single race and a battle round get a fresh seed (B37).
 */
const FIXED_SEED: ReadonlySet<RaceMode> = new Set<RaceMode>(['dare', 'daily', 'tt', 'gp']);

export function restartSeed(mode: RaceMode | undefined, seed: number, fresh: () => number): number {
  return FIXED_SEED.has(mode ?? 'race') ? seed : fresh();
}
