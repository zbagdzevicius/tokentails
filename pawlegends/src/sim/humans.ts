/**
 * Party play (docs/plans/moba/MULTIPLAYER.md §1): which hero slots belong to a human. Slot 0 always does; slots 1 and
 * 2 do only in a party match (`MatchConfig.humans`). The mask lives on the world (`w.humans`, not hashed) so the bot
 * brain and the combat rules can read it without the match handle. Single-player matches have mask 1, so every
 * `isHuman` check there is the old `slot === HUMAN_SLOT`.
 */
import { HUMAN_SLOT, PVP_LEAD1, SLOT_COUNT } from './api';
import type { World } from './world';

/**
 * True when entity `slot` is a human's hero (its commands come from a stream, never from the in-sim bots). Any id
 * outside 0..5 (minions, structures, −1) is false; the bound also keeps `>>>` from wrapping. Sim v16 (S-PvP): the
 * bound is both teams' slots; a PvE mask only ever sets bits 0..2, so PvE reads exactly as before.
 */
export const isHumanSlot = (w: World, slot: number): boolean => slot >= 0 && slot < SLOT_COUNT && ((w.humans >>> slot) & 1) === 1;

/**
 * Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.3): the lead human of `team`, the hero the team's bots follow, whose pings
 * they obey and whose leash they read. PvE: HUMAN_SLOT for both teams (the v15 rule). PvP: slot 0 for team 0, slot 3
 * for team 1.
 */
export const leadOf = (w: World, team: number): number => (w.pvp === 1 && team === 1 ? PVP_LEAD1 : HUMAN_SLOT);

/** The human mask of a `humans` slot list (bit s = slot s). */
export function humanMask(humans: readonly number[] | undefined): number {
  if (!humans) return 1;
  let mask = 0;
  for (let i = 0; i < humans.length; i++) mask |= 1 << humans[i];
  return mask;
}
