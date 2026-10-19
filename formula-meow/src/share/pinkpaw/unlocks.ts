/**
 * Which Pink Paw roster cats are playable, and when (iteration 2; the progression lane owns this file). The cats are
 * the real roster snapshot (pink-paw.ts, with its "as of" date); being playable is a game unlock only and claims
 * nothing about the shelter.
 */
import type { PinkPawCat } from './pink-paw';

/** Ids of roster cats the player has unlocked, in unlock order. Stabilise ships none. */
export function playableShelterCats(_unlocked: readonly string[] = []): PinkPawCat[] {
  return [];
}
