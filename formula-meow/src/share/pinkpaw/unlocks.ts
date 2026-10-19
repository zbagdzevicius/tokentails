/**
 * Which Pink Paw roster cats are playable, and when (iteration 2; the progression lane owns this file). The cats are
 * the real roster snapshot (pink-paw.ts, with its "as of" date); being playable is a game unlock only and claims
 * nothing about the shelter. ADOPTED cats are never offered (they left the roster).
 *
 * Rule (ITERATION-2 progression): one cat per cup trophy, in roster order.
 */
import { PINK_PAW_STATUS_AS_OF, pinkPawWaiting, type PinkPawCat } from './pink-paw';

/** Roster cats in the order they unlock. */
export function shelterUnlockOrder(): PinkPawCat[] {
  return pinkPawWaiting();
}

/** The ids earned with `trophies` cup trophies. */
export function shelterCatsEarned(trophies: number): string[] {
  return shelterUnlockOrder()
    .slice(0, Math.max(0, Math.floor(trophies)))
    .map((c) => c.id);
}

/** Roster cats the player has unlocked (ids from the progression save), in unlock order. */
export function playableShelterCats(unlocked: readonly string[] = []): PinkPawCat[] {
  const set = new Set(unlocked);
  return shelterUnlockOrder().filter((c) => set.has(c.id));
}

/** The honest note shown with a playable shelter cat (status with its snapshot date). */
export function shelterCatNote(cat: PinkPawCat): { status: string; asOf: string } {
  return { status: cat.status === 'RECOVERING' ? 'recovering' : 'waiting', asOf: PINK_PAW_STATUS_AS_OF };
}
