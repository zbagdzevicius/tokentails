/**
 * Seasonal game modes. Cupid Cat (PIXEL_RESCUE) is a Valentine's mode, open from 1 January to
 * 31 March in the player's local time. Outside the season it is hidden from the game picker, new
 * players are handed off to another mode, and opening it (a stale link or restore) is refused.
 * Saves are not touched: a run started on 31 March can still finish and save after midnight.
 */

/** Months (0-based, like Date#getMonth) when Cupid Cat is open: January to March. */
export const CUPID_SEASON_MONTHS: readonly number[] = [0, 1, 2];

export function isCupidSeason(now: Date = new Date()): boolean {
  return CUPID_SEASON_MONTHS.includes(now.getMonth());
}
