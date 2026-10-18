/**
 * The bot ladder and personal bests (round 0: "nothing to grind toward"). Local display only: the rating never
 * reaches the server, a replay or a reward. A win against harder bots moves it more; Rookie matches do not count.
 */
import type { Difficulty, HeroId } from '../sim/api';
import { LADDER_START, loadProfile, saveProfile } from './profile';

/** Points for a win / a loss by the enemy bots' level. */
export const LADDER_STEP: Readonly<Record<string, { win: number; loss: number }>> = Object.freeze({
  easy: Object.freeze({ win: 12, loss: -8 }),
  normal: Object.freeze({ win: 25, loss: -12 }),
  hard: Object.freeze({ win: 40, loss: -15 }),
});

export interface LadderResult {
  rating: number;
  delta: number;
  /** A new personal best line, or null. */
  personal: string | null;
  /** Round 1: the first PLACEMENT ladder matches never lose points; 1-based index while placing, else 0. */
  placement: number;
  /** Round 1: how much the player's own play counted (0.1..1): a win at 1/14 earns almost nothing. */
  impact: number;
}

/** Ladder matches that never lose points (round 1: "I lost two of my first three matches, -8 each"). */
export const PLACEMENT = 3;

/**
 * Round 1 ("the ladder pays for a 1/14 win"): the share of a win's points the player earned, from its takedowns
 * (knockouts + assists) per knockout: 2 or better gives all of it, 0.25 or worse a tenth. Pure.
 */
export function impactOf(takedowns: number, deaths: number): number {
  const kda = takedowns / Math.max(1, deaths);
  if (kda >= 2) return 1;
  if (kda <= 0.25) return 0.1;
  return Math.round((0.1 + ((kda - 0.25) / 1.75) * 0.9) * 100) / 100;
}

/** Record a finished match. Rookie: no rating change (match 1 is guided), personal bests still count. */
export function recordLadder(o: { won: boolean; difficulty: Difficulty; hero: HeroId; heroName: string; seconds: number; takedowns: number; deaths?: number }): LadderResult | null {
  const p = loadProfile();
  const step = LADDER_STEP[o.difficulty];
  const before = Number.isFinite(p.rating) ? p.rating : LADDER_START;
  const impact = impactOf(o.takedowns, o.deaths ?? 0);
  const placing = step ? p.ladderGames < PLACEMENT : false;
  // a win pays by impact; a loss costs less when the player played well, and nothing while placing
  const delta = step ? (o.won ? Math.max(1, Math.round(step.win * impact)) : placing ? 0 : Math.max(Math.round(step.loss * (1 - 0.5 * impact)), -before)) : 0;
  if (step) p.ladderGames++;
  p.rating = before + delta;
  const best = p.bests[o.hero] ?? { fastest: 0, takedowns: 0 };
  const lines: string[] = [];
  if (o.won && (best.fastest === 0 || o.seconds < best.fastest)) {
    if (best.fastest > 0) lines.push(`fastest ${o.heroName} win`);
    best.fastest = o.seconds;
  }
  if (o.takedowns > best.takedowns) {
    if (best.takedowns > 0) lines.push(`most takedowns (knockouts + assists) with ${o.heroName}: ${o.takedowns}`);
    best.takedowns = o.takedowns;
  }
  p.bests[o.hero] = best;
  saveProfile(p);
  const personal = lines.length ? `New personal best: ${lines.join(', ')}` : null;
  if (!step) return { rating: p.rating, delta: 0, personal, placement: 0, impact };
  return { rating: p.rating, delta, personal, placement: placing ? p.ladderGames : 0, impact };
}
