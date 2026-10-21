/**
 * The bot ladder and personal bests (round 0: "nothing to grind toward"). Local display only: the rating never
 * reaches the server, a replay or a reward. A win against harder bots moves it more; Rookie matches do not count.
 */
import type { Difficulty, HeroId } from '../sim/api';
import { GRADE_LADDER, type Grade } from './grade';
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
  /**
   * How much the player's own play counted: the share of the step this match paid (a win) or cost (a loss), from
   * the grade (GAPS A2, `GRADE_LADDER`; it replaced round 1's KDA impact and does not stack with it).
   */
  impact: number;
  /** GAPS A2: the grade the share came from. */
  grade: Grade;
}

/** Ladder matches that never lose points (round 1: "I lost two of my first three matches, -8 each"). */
export const PLACEMENT = 3;

/**
 * Record a finished match. Rookie: no rating change (match 1 is guided), personal bests still count. GAPS A2: the
 * grade sets the share (an S or A loss costs half, a C win pays 60%); placement losses still cost nothing. GAPS B2: a
 * forfeit is a full loss (the whole step, no grade share, no placement shield).
 */
export function recordLadder(o: { won: boolean; difficulty: Difficulty; hero: HeroId; heroName: string; seconds: number; takedowns: number; grade: Grade; forfeit?: boolean }): LadderResult | null {
  const p = loadProfile();
  const step = LADDER_STEP[o.difficulty];
  const before = Number.isFinite(p.rating) ? p.rating : LADDER_START;
  const share = GRADE_LADDER[o.grade] ?? GRADE_LADDER.C;
  const forfeit = !!o.forfeit && !o.won;
  const impact = o.won ? share.win : forfeit ? 1 : share.loss;
  const placing = step && !forfeit ? p.ladderGames < PLACEMENT : false;
  const delta = step ? (o.won ? Math.max(1, Math.round(step.win * impact)) : placing ? 0 : Math.max(Math.round(step.loss * impact), -before)) : 0;
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
  if (!step) return { rating: p.rating, delta: 0, personal, placement: 0, impact, grade: o.grade };
  return { rating: p.rating, delta, personal, placement: placing ? p.ladderGames : 0, impact, grade: o.grade };
}
