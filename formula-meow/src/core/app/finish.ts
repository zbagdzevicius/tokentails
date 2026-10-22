/**
 * Finish margin (iteration 4 contract, F4/F7/F8, integrator-owned, pure): how close the player's finish was to the
 * nearest other cat, for the photo finish stamp, the results headline, the share caption and the clip sticker. All of
 * them read this one number, so they always agree.
 *
 * - Times are the sim's sub-tick finish times (`RaceResult.places[].time`, seconds since GO; `core/sim/race.ts`
 *   interpolates the line crossing inside the tick), never rounded to ticks.
 * - The nearest other finisher, ahead or behind. A cat still racing counts only through its projected gap to the
 *   winner (`places[].gap`, ≥ 0) and only when no finished cat is as close; a cat a lap or more down (`gap` < 0, or no
 *   gap) is never compared against, nor is a cat with no projection.
 * - `won` is true when the player crossed before that cat (for a winner: "WON BY 1.8 s"; for 2nd within 0.3 s of 1st:
 *   "PHOTO FINISH", lost).
 * - Null when the player has no finish time (a battle, a DNF), or there is no one to compare with (a solo time trial).
 *
 * The juice lane decides a photo finish only after the nearest finisher is known: it waits up to 18 ticks (0.3 s) after
 * the player's own finish and calls this again.
 */
import type { RaceResult } from '../../types';

export interface FinishMargin {
  /** seconds between the two crossings, ≥ 0 */
  margin: number;
  /** the kart index compared against */
  other: number;
  /** true when the player crossed first */
  won: boolean;
  /** true when `other` has not finished yet and its time is the sim's projection (shown with "≈" or not at all) */
  projected?: boolean;
}

/** Photo finish threshold (GDD 9.1, F4): the player and another cat crossed within this many seconds. */
export const PHOTO_FINISH_S = 0.3;

export function finishMargin(result: Pick<RaceResult, 'places'>, me: number): FinishMargin | null {
  const mine = result.places.find((p) => p.kart === me);
  if (!mine || mine.time == null || !Number.isFinite(mine.time)) return null;
  let winner = Infinity;
  for (const p of result.places) if (p.time != null && Number.isFinite(p.time) && p.time < winner) winner = p.time;
  let best: FinishMargin | null = null;
  let bestAbs = Infinity;
  // finished cats first (exact), then cats still racing (projected) only when strictly closer
  for (const p of result.places) {
    if (p.kart === me || p.time == null || !Number.isFinite(p.time)) continue;
    const dt = p.time - mine.time;
    const a = Math.abs(dt);
    // equal sub-tick times: the race order decides (the lower place crossed first)
    const won = dt > 0 || (dt === 0 && mine.place < p.place);
    if (a < bestAbs) {
      bestAbs = a;
      best = { margin: a, other: p.kart, won };
    }
  }
  if (Number.isFinite(winner))
    for (const p of result.places) {
      if (p.kart === me || p.time != null || p.gap == null || !(p.gap >= 0) || !Number.isFinite(p.gap)) continue;
      const t = winner + p.gap;
      // a cat still racing finishes after the player (who already has a time)
      const a = Math.max(0, t - mine.time);
      if (a < bestAbs) {
        bestAbs = a;
        best = { margin: a, other: p.kart, won: true, projected: true };
      }
    }
  return best;
}

/** True when the margin is a photo finish (within `PHOTO_FINISH_S`, against a cat that really finished). */
export function isPhotoFinish(m: FinishMargin | null): boolean {
  return !!m && !m.projected && m.margin <= PHOTO_FINISH_S;
}
