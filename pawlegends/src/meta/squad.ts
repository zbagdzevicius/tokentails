/**
 * Squad mates (round 0 playtest): which two owned cats walk with the player's waves. The cat adopted last comes
 * first (so "Luna walks with your waves from the next match" is true), then the squad the player chose on the pick
 * screen, then the default order (meta/roster.ts). Local profile only; render only.
 */
import { loadProfile, saveProfile } from './profile';
import { COMPANION_MAX } from './roster';

/** The ids rosterCosmetics should put first, in order. */
export function squadPrefs(): string[] {
  const p = loadProfile();
  const out = p.newCat ? [p.newCat] : [];
  for (const id of p.squad) if (!out.includes(id)) out.push(id);
  return out;
}

/** A purchase came back ok for `catalogId`: it walks from the next match. */
export function noteNewCat(catalogId: string): void {
  const p = loadProfile();
  p.newCat = catalogId;
  saveProfile(p);
}

/** The player tapped `id` on the pick screen: it becomes the first squad mate, the old first one the second. */
export function chooseSquadMate(id: string, current: readonly string[]): string[] {
  const p = loadProfile();
  const next = [id, ...current.filter((x) => x !== id)].slice(0, COMPANION_MAX);
  p.squad = next;
  p.newCat = null;
  saveProfile(p);
  return next;
}
