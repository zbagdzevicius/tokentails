/**
 * Star and paw rules of a finished run. Pure and DOM-free: the UI (results, level select, HUD paws)
 * and the backend's replay verification (`src/sim/server.ts`, vendored into the backend) share this
 * one copy, so a star the UI shows is the star the server records (plan G2 layer 2).
 *
 * Stars (earned once, kept forever; each star can come from a different winning run):
 *   1. Heist complete  - win the level (shelter cat freed, both cats on the exit).
 *   2. All catnip      - win with every coin collected.
 *   3. Clean and quick - win without being spotted, at or under par time.
 *
 * The score itself is `computeScore` in `src/sim/sim.ts` (it is part of the hashed state).
 */
import type { LevelDef, RunResult } from '../types';

export const STAR_WIN = 1;
export const STAR_COINS = 2;
export const STAR_CLEAN = 4;
/** Every star bit set. */
export const STAR_ALL = STAR_WIN | STAR_COINS | STAR_CLEAN;

export interface StarRule {
  bit: number;
  label: string;
  detail: string;
}

/** Star rules in display order (shown on the level select and the results screen). */
export const STAR_RULES: readonly StarRule[] = [
  { bit: STAR_WIN, label: 'Heist complete', detail: 'Free the shelter cat and get both cats out.' },
  { bit: STAR_COINS, label: 'All catnip', detail: 'Win with every catnip coin collected.' },
  { bit: STAR_CLEAN, label: 'Clean and quick', detail: 'Win without being spotted, at or under par.' },
];

/** Number of set bits in a star mask (0-3). */
export function starCount(mask: number): number {
  return (mask & STAR_WIN ? 1 : 0) + (mask & STAR_COINS ? 1 : 0) + (mask & STAR_CLEAN ? 1 : 0);
}

/** The level facts the star rules read: the coin list (or its length) and the par time. */
export interface StarLevel {
  coins: readonly unknown[] | number;
  meta: Pick<LevelDef['meta'], 'parTicks'>;
}

const coinTotal = (level: StarLevel): number => (typeof level.coins === 'number' ? level.coins : level.coins.length);

/** Stars (bitmask of STAR_*) a single finished run earns. Nothing unless it was won. */
export function computeStars(r: Pick<RunResult, 'coins' | 'ticks' | 'spottedCount'>, won: boolean, level: StarLevel): number {
  if (!won) return 0;
  let m = STAR_WIN;
  if (r.coins >= coinTotal(level)) m |= STAR_COINS;
  if (r.spottedCount === 0 && r.ticks <= level.meta.parTicks) m |= STAR_CLEAN;
  return m;
}

/**
 * 0-3 paw rating on the results screen: rescue, every coin, never spotted and at or under par.
 * Unlike `computeStars` it counts a rescue without the exit, and a level without coins (or without
 * a par) never gives that paw; the results screen has always shown it this way.
 */
export function pawRating(r: Pick<RunResult, 'coins' | 'rescued' | 'ticks' | 'spottedCount'>, totalCoins: number, parTicks: number): number {
  let n = 0;
  if (r.rescued) n++;
  if (totalCoins > 0 && r.coins >= totalCoins) n++;
  if (parTicks > 0 && r.ticks <= parTicks && r.spottedCount === 0) n++;
  return n;
}
