/** Pure HUD / results helpers (no DOM), unit-tested. */
import { activeHint as simActiveHint, objectiveIndex as simObjectiveIndex } from '../sim/hud';
import { TICK_HZ, type LevelDef, type RunResult, type SimState } from '../types';

export type ObjectiveStage = 'KEY' | 'RESCUE' | 'EXIT' | 'DONE';

export function objectiveStage(state: Pick<SimState, 'keyTaken' | 'rescued' | 'won'>, level: Pick<LevelDef, 'key'>): ObjectiveStage {
  if (state.won) return 'DONE';
  if (level.key && !state.keyTaken) return 'KEY';
  if (!state.rescued) return 'RESCUE';
  return 'EXIT';
}

/**
 * Objective line for the HUD. Uses meta.objectives when it has one line per stage: either the
 * 3-line key / rescue / exit form, or the 5-line tutorial door / leave tutorial / key / rescue /
 * exit form (staged by sim/hud objectiveIndex; without cats the first line is shown).
 */
export function objectiveText(
  state: Pick<SimState, 'keyTaken' | 'rescued' | 'won'> & Partial<Pick<SimState, 'cats' | 'activeIndex'>>,
  level: Pick<LevelDef, 'key' | 'crate' | 'meta'>,
): string {
  const stage = objectiveStage(state, level);
  const name = level.crate?.catName || 'the shelter cat';
  const custom = level.meta.objectives ?? [];
  if (stage === 'DONE') return 'Heist complete!';
  if (custom.length === 5) {
    const i = state.cats ? simObjectiveIndex(level as LevelDef, state as SimState) : 0;
    return custom[Math.max(0, i)].replace(/\{cat\}/g, name);
  }
  const lines = level.key ? ['Find the vault key', `Free ${name} from the crate`, 'Both cats to the exit'] : [`Free ${name} from the crate`, 'Both cats to the exit'];
  const idx = stage === 'KEY' ? 0 : stage === 'RESCUE' ? (level.key ? 1 : 0) : lines.length - 1;
  const src = custom.length === lines.length ? custom : lines;
  return (src[idx] ?? lines[idx]).replace(/\{cat\}/g, name);
}

/**
 * Tutorial hint for the active cat's tile (and plate state, for zones with whileOtherHolds), or
 * null. Control tokens ({move} {swap} {meow} {act}) are filled for touch or keyboard.
 */
export function activeHint(
  state: Pick<SimState, 'cats' | 'activeIndex'> & Partial<Pick<SimState, 'platesDown' | 'keyTaken' | 'rescued'>>,
  level: Pick<LevelDef, 'meta'> & Partial<Pick<LevelDef, 'plates' | 'key'>>,
  touch = false,
): string | null {
  return simActiveHint({ meta: level.meta, plates: level.plates ?? [], key: level.key ?? null }, state, touch);
}

export interface ScoreBreakdown {
  coins: number;
  coinPoints: number;
  rescuePoints: number;
  timePenalty: number;
  total: number;
}

/** Mirrors the sim rule: coins*10 + (rescued ? 50 : 0) - floor(ticks / TICK_HZ / 10), min 0. */
export function scoreBreakdown(r: Pick<RunResult, 'coins' | 'rescued' | 'ticks'>): ScoreBreakdown {
  const coinPoints = r.coins * 10;
  const rescuePoints = r.rescued ? 50 : 0;
  const timePenalty = Math.floor(r.ticks / TICK_HZ / 10);
  return { coins: r.coins, coinPoints, rescuePoints, timePenalty, total: Math.max(0, coinPoints + rescuePoints - timePenalty) };
}

/** 0-3 paw rating, same rules as the campaign stars (src/ui/levels/progress.ts runStars):
 *  win (rescue), every coin, never spotted and at or under par. */
export function pawRating(r: Pick<RunResult, 'coins' | 'rescued' | 'ticks' | 'spottedCount'>, totalCoins: number, parTicks: number): number {
  let n = 0;
  if (r.rescued) n++;
  if (totalCoins > 0 && r.coins >= totalCoins) n++;
  if (parTicks > 0 && r.ticks <= parTicks && r.spottedCount === 0) n++;
  return n;
}
