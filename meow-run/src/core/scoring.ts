// Scoring rules. FROZEN. Pure (node-importable, unit tested in scoring.test.ts).
import type { RunResult } from './types';

/** points per u run (no multiplier) */
export const DIST_POINTS = 1;
export const FISH_POINTS = 50;
export const TREAT_POINTS = 150;
export const BELL_POINTS = 500;
export const NEAR_MISS_POINTS = 100;
export const FINISH_BONUS = 2000;
export const HEART_BONUS = 500;
export const MAX_MULT = 99;
/** share of the score lost when the last heart goes (respawn at the checkpoint) */
export const RESPAWN_PENALTY = 0.1;

/** a pickup's points: base x multiplier */
export const pickupPoints = (base: number, mult: number): number => Math.round(base * Math.max(1, Math.min(MAX_MULT, mult)));
/** every fish (and near miss) raises the multiplier by one, up to MAX_MULT */
export const multAfterPickup = (m: number): number => Math.min(MAX_MULT, Math.max(1, m) + 1);
/** a hit halves the multiplier (floor, min 1) */
export const multAfterHit = (m: number): number => Math.max(1, Math.floor(m / 2));
export const respawnPenalty = (score: number): number => Math.max(0, Math.round(score * RESPAWN_PENALTY));
export const finishBonus = (hearts: number): number => FINISH_BONUS + Math.max(0, hearts) * HEART_BONUS;

/** [finished, all bells, score >= target]. Endless (bellsTotal 0, no target) earns no stars. */
export function starsFor(r: Pick<RunResult, 'finished' | 'bellCount' | 'bellsTotal' | 'score'>, scoreTarget: number): [boolean, boolean, boolean] {
  if (r.bellsTotal <= 0) return [false, false, false];
  return [r.finished, r.finished && r.bellCount >= r.bellsTotal, r.finished && r.score >= scoreTarget];
}

/** campaign speed at s: linear ramp from start to max over rampDist */
export function speedAt(speed: { start: number; max: number; rampDist: number }, s: number): number {
  const u = speed.rampDist > 0 ? Math.max(0, Math.min(1, s / speed.rampDist)) : 1;
  return speed.start + (speed.max - speed.start) * u;
}
