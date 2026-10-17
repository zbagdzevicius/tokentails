/**
 * Scoring (GDD 4.5, LANES.md fixed formula). Pure integer functions; the sim calls these and nothing
 * else computes points.
 */
import { BONUS, CAUGHT_RANK, COMBO_MAX, HEIGHT_MULT_X2, RANKS, SUSPICION, rankMin, type StampId } from '../types';

/** points = floor(base × HEIGHT_MULT_X2[fromLevel] × combo × (event ? 5 : 4) × (lastCall ? 2 : 1) / 8). */
export function propPoints(base: number, fromLevel: number, combo: number, eventActive: number, lastCall: number): number {
  const lv = fromLevel < 0 ? 0 : fromLevel > 3 ? 3 : fromLevel;
  return Math.floor((base * HEIGHT_MULT_X2[lv] * combo * (eventActive ? 5 : 4) * (lastCall ? 2 : 1)) / 8);
}

/**
 * v5 stack (GDD 4.4): every item scores on its own, item i at combo min(c0 + i, COMBO_MAX), with the usual height,
 * event and last-call factors. c0 is the combo the stack's landing starts at (nextCombo).
 */
export function stackPoints(itemBase: number, items: number, fromLevel: number, c0: number, eventActive: number, lastCall: number, maxCombo: number = COMBO_MAX): number {
  let total = 0;
  for (let i = 0; i < items; i++) {
    const c = c0 + i > maxCombo ? maxCombo : c0 + i;
    total += propPoints(itemBase, fromLevel, c, eventActive, lastCall);
  }
  return total;
}

/** Combo multiplier for a new break: the first break of a chain is ×1, each later one inside the window +1 (cap 8). */
export function nextCombo(combo: number, comboTimer: number): number {
  if (comboTimer <= 0) return 1;
  return combo + 1 > COMBO_MAX ? COMBO_MAX : combo + 1;
}

/** Combo used by a non-break landing (keeps the chain's current multiplier, no increase). */
export function currentCombo(combo: number, comboTimer: number): number {
  return comboTimer > 0 ? combo : 1;
}

/** Stash bonus for the next stashed grabbable, given how many were stashed before. */
export function stashBonus(stashedBefore: number): number {
  return stashedBefore < BONUS.stashMax ? BONUS.stash : 0;
}

/** What a run did, for the Perfect Crime check (SIM_VERSION 3). */
export interface CrimeTally {
  /** LOOKs the human started (the cat survived at least one turn). */
  looks: number;
  /** Props broken or spilled. */
  breaks: number;
  /** Must-Wreck targets wrecked. */
  targets: number;
}

/**
 * End-of-run modifiers: caught keeps 50 %, perfect adds 25 %. Perfect Crime (SIM_VERSION 3) needs: not caught,
 * never above the limit, at least one look survived, and real chaos (2+ breaks or a Must-Wreck target). Two swats
 * then idling through a run is not a perfect crime.
 */
export function finalizeScore(
  score: number,
  caught: boolean,
  maxSuspicion: number,
  crime: CrimeTally = { looks: 1, breaks: score > 0 ? 2 : 0, targets: 0 },
): { finalScore: number; stamp: 1 | 2 | 3 } {
  if (caught) return { finalScore: Math.floor(score / 2), stamp: 3 };
  const chaos = crime.breaks >= 2 || crime.targets >= 1;
  if (score > 0 && chaos && crime.looks >= 1 && maxSuspicion <= SUSPICION.perfectLimit)
    return { finalScore: score + Math.floor(score / 4), stamp: 1 };
  return { finalScore: score, stamp: 2 };
}

/** Rank title of a final score; `pct` scales the thresholds for the room (PlayableRoom.rankPct, default 100). */
export function rankFor(finalScore: number, caught = false, pct = 100, mins?: readonly number[]): string {
  if (caught) return CAUGHT_RANK;
  let title = RANKS[0].title;
  for (let i = 1; i < RANKS.length; i++) if (finalScore >= rankMin(i, pct, mins)) title = RANKS[i].title;
  return title;
}

export function stampId(stamp: number): StampId {
  return stamp === 1 ? 'perfect' : stamp === 3 ? 'caught' : 'clean';
}
