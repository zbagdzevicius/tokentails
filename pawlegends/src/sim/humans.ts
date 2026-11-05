/**
 * Party play (docs/plans/moba/MULTIPLAYER.md §1): which hero slots belong to a human. Slot 0 always does; slots 1 and
 * 2 do only in a party match (`MatchConfig.humans`). The mask lives on the world (`w.humans`, not hashed) so the bot
 * brain and the combat rules can read it without the match handle. Single-player matches have mask 1, so every
 * `isHuman` check there is the old `slot === HUMAN_SLOT`.
 */
import { SLOTS_PER_TEAM } from './api';
import type { World } from './world';

/**
 * True when entity `slot` is a human's hero (its commands come from a stream, never from the in-sim bots). Any id
 * outside 0..2 (bots of the other team, minions, structures, −1) is false; the bound also keeps `>>>` from wrapping.
 */
export const isHumanSlot = (w: World, slot: number): boolean => slot >= 0 && slot < SLOTS_PER_TEAM && ((w.humans >>> slot) & 1) === 1;

/** The human mask of a `humans` slot list (bit s = slot s). */
export function humanMask(humans: readonly number[] | undefined): number {
  if (!humans) return 1;
  let mask = 0;
  for (let i = 0; i < humans.length; i++) mask |= 1 << humans[i];
  return mask;
}
