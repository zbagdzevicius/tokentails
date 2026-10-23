/**
 * `mark` (POC.md §4.4): target selection (the lowest-HP visible enemy hero in range) and reveal (visible to the
 * enemy team through brush and stealth for a while).
 */
import { dist2 } from '../fixed';
import { RANGE, type World } from '../world';
import { radiusOf, targetable } from '../units/kinds';

/** Lowest-HP enemy hero of `team` that `team` can target within `range` of (x, y); ties: lowest id. −1 when none. */
export function lowestHpEnemyHero(w: World, team: number, x: number, y: number, range: number): number {
  let best = -1;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (!targetable(w, e, team)) continue;
    const reach = range + radiusOf(w, e);
    if (dist2(x, y, w.x[e], w.y[e]) > reach * reach) continue;
    if (best < 0 || w.hp[e] < w.hp[best]) best = e;
  }
  return best;
}

export function reveal(w: World, id: number, ticks: number): void {
  if (w.alive[id] === 1 && ticks > 0) w.revealT[id] = Math.max(w.revealT[id], ticks);
}
