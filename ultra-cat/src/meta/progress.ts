// Recording a finished run into the save (pure: no three, no DOM). Owned by the META-UI lane.
import { CAT_ORDER, type CatId, type LevelDef, type RunResult, type SaveData } from '../core/types';
import { MAX_CATNIP } from './save';

export interface StarsEval {
  met: [boolean, boolean, boolean];
  stars: number;
}

const countTrue = (a: readonly boolean[]) => a.reduce((n, b) => n + (b ? 1 : 0), 0);

/** Objectives met for the first time in this run, and how many stars that adds over the saved best. */
export function newStarsOf(save: SaveData, levelId: LevelDef['id'], ev: StarsEval): { fresh: [boolean, boolean, boolean]; count: number } {
  const prev = save.levels[levelId]?.objectives ?? [false, false, false];
  const fresh: [boolean, boolean, boolean] = [ev.met[0] && !prev[0], ev.met[1] && !prev[1], ev.met[2] && !prev[2]];
  const prevStars = save.levels[levelId]?.stars ?? 0;
  const after = countTrue([prev[0] || ev.met[0], prev[1] || ev.met[1], prev[2] || ev.met[2]]);
  return { fresh, count: Math.max(0, after - prevStars) };
}

/**
 * A new SaveData with the run recorded: best damage, objectives ever met (OR), stars (one per objective ever met,
 * never lower than before), plays, totals and catnip. A quit records nothing. Never mutates `save`.
 */
export function recordRun(save: SaveData, result: RunResult, ev: StarsEval, catnip: number): SaveData {
  if (result.why === 'quit') return save;
  const id = result.levelId;
  const prev = save.levels[id] ?? { stars: 0, objectives: [false, false, false] as [boolean, boolean, boolean], best: 0, plays: 0 };
  const objectives: [boolean, boolean, boolean] = [prev.objectives[0] || ev.met[0], prev.objectives[1] || ev.met[1], prev.objectives[2] || ev.met[2]];
  const dmg = Number.isFinite(result.damage) ? Math.max(0, result.damage) : 0;
  const nip = Number.isFinite(catnip) ? Math.max(0, Math.floor(catnip)) : 0;
  return {
    ...save,
    catnip: Math.min(MAX_CATNIP, save.catnip + nip),
    levels: {
      ...save.levels,
      [id]: {
        stars: Math.max(prev.stars, ev.stars, countTrue(objectives)),
        objectives,
        best: Math.max(prev.best, dmg),
        plays: prev.plays + 1,
      },
    },
    totals: {
      runs: save.totals.runs + 1,
      damage: save.totals.damage + dmg,
      catnipEarned: save.totals.catnipEarned + nip,
    },
  };
}

/** Cats that became affordable between two saves (not owned, could not buy before, can now). */
export function newlyAffordable(before: SaveData, after: SaveData, cost: (id: CatId) => number): CatId[] {
  return CAT_ORDER.filter((id) => !after.cats[id].owned && after.catnip >= cost(id) && before.catnip < cost(id));
}
