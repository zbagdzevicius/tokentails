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
}

/** Record a finished match. Rookie: no rating change (match 1 is guided), personal bests still count. */
export function recordLadder(o: { won: boolean; difficulty: Difficulty; hero: HeroId; heroName: string; seconds: number; takedowns: number }): LadderResult | null {
  const p = loadProfile();
  const step = LADDER_STEP[o.difficulty];
  const before = Number.isFinite(p.rating) ? p.rating : LADDER_START;
  const delta = step ? (o.won ? step.win : Math.max(step.loss, -before)) : 0;
  p.rating = before + delta;
  const best = p.bests[o.hero] ?? { fastest: 0, takedowns: 0 };
  const lines: string[] = [];
  if (o.won && (best.fastest === 0 || o.seconds < best.fastest)) {
    if (best.fastest > 0) lines.push(`fastest ${o.heroName} win`);
    best.fastest = o.seconds;
  }
  if (o.takedowns > best.takedowns) {
    if (best.takedowns > 0) lines.push(`most takedowns with ${o.heroName} (${o.takedowns})`);
    best.takedowns = o.takedowns;
  }
  p.bests[o.hero] = best;
  saveProfile(p);
  if (!step) return { rating: p.rating, delta: 0, personal: lines.length ? `New personal best: ${lines.join(', ')}` : null };
  return { rating: p.rating, delta, personal: lines.length ? `New personal best: ${lines.join(', ')}` : null };
}
