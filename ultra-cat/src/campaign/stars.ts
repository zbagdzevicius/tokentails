// Objectives, stars and unlocks (pure: no three, no DOM). Owned by the CAMPAIGN lane.
// CONTRACT (used by meta-ui): objectiveValue, objectiveMet, evaluateStars, totalStars, isLevelUnlocked.
import type { LevelDef, Objective, RunResult, SaveData } from '../core/types';

/** Current value of an objective's measure in a (live or final) run. */
export function objectiveValue(o: Objective, r: RunResult): number {
  switch (o.kind) {
    case 'damage':
      return r.damage;
    case 'landmarks':
      return r.landmarks;
    case 'kills':
      return o.enemy ? (r.kills[o.enemy] ?? 0) : Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0);
    case 'patience':
      return r.patience;
    case 'destroyedPct':
      return r.destroyedPct;
    case 'combo':
      return r.maxCombo;
    case 'fish':
      return r.fish;
    case 'buildings':
      return r.buildings;
    case 'boss':
      return r.bossDefeated ? 1 : 0;
  }
}

/** Met at the end of a run. 'patience' needs a finished run (not TOO WET, not quit). */
export function objectiveMet(o: Objective, r: RunResult): boolean {
  if (r.why === 'quit') return false;
  if (o.kind === 'patience' && r.why === 'wet') return false;
  return objectiveValue(o, r) >= o.target;
}

export function evaluateStars(level: LevelDef, r: RunResult): { met: [boolean, boolean, boolean]; stars: number } {
  const met = level.objectives.map((o) => objectiveMet(o, r)) as [boolean, boolean, boolean];
  return { met, stars: met.filter(Boolean).length };
}

export function totalStars(save: SaveData): number {
  let n = 0;
  for (const p of Object.values(save.levels)) n += p?.stars ?? 0;
  return n;
}

/** Unlocked when it is the first city, or the previous city has >= 1 star and the campaign has >= unlockStars. */
export function isLevelUnlocked(level: LevelDef, save: SaveData, all: LevelDef[]): boolean {
  if (level.index === 0) return true;
  const prev = all.find((l) => l.index === level.index - 1);
  if (!prev) return false;
  return (save.levels[prev.id]?.stars ?? 0) >= 1 && totalStars(save) >= level.unlockStars;
}
