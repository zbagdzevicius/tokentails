/**
 * The first-session script (fun plan F1): match 1 is a guided, winnable Rookie match; matches 2 and 3 are Easy
 * with a lighter guide; from match 4 the player picks the difficulty. Pure: the app passes the profile's match
 * count. `rookie` exists only once the SIM lane ships it (data/bots.ts DIFFICULTIES); until then match 1 is Easy.
 */
import { BOTS, DIFFICULTIES, DIFFICULTY_RULES } from '../data/bots';
import type { Difficulty } from '../sim/api';

/** Matches before the difficulty chips unlock. */
export const PICK_DIFFICULTY_FROM = 3;

export const ROOKIE = 'rookie' as Difficulty;

/** Does this build's sim have the Rookie bots? */
export function rookieAvailable(list: readonly string[] = DIFFICULTIES, bots: Readonly<Record<string, unknown>> = BOTS): boolean {
  // both the difficulty and its bot table (a half-landed sim with only one of them falls back to Easy)
  return list.includes('rookie') && !!bots.rookie;
}

/** Is this the Rookie difficulty (also when the type does not list it yet)? */
export const isRookie = (d: string | null | undefined): boolean => d === 'rookie';

/**
 * The difficulty the next match runs at, from the matches played and the player's pick. `veteran` (round 1: "I've
 * played MOBAs before") skips the two Easy matches; match 1 stays the guided Rookie match.
 */
export function difficultyFor(matches: number, chosen: Difficulty, list: readonly string[] = DIFFICULTIES, bots: Readonly<Record<string, unknown>> = BOTS, veteran = false): Difficulty {
  if (matches <= 0) return rookieAvailable(list, bots) ? ROOKIE : ('easy' as Difficulty);
  if (matches < PICK_DIFFICULTY_FROM && !veteran) return 'easy' as Difficulty;
  // a stored "rookie" (old profile, or a dare) after the first match plays as Easy
  return isRookie(chosen) || !list.includes(chosen) ? ('easy' as Difficulty) : chosen;
}

/** Can the player choose the bots yet? */
export const canPickDifficulty = (matches: number, veteran = false): boolean => matches >= PICK_DIFFICULTY_FROM || (veteran && matches >= 1);

/** The difficulties the pick screen offers (Rookie is match 1 only, never a chip). */
export function pickable(list: readonly string[] = DIFFICULTIES): Difficulty[] {
  return list.filter((d) => d !== 'rookie') as Difficulty[];
}

export type GuideMode = 'rookie' | 'lite' | 'off';

/** Objective chips: the full script in match 1, Ultimate and Pudding only in matches 2 and 3. */
export function guideMode(matches: number): GuideMode {
  if (matches <= 0) return 'rookie';
  if (matches < PICK_DIFFICULTY_FROM) return 'lite';
  return 'off';
}

/** GAPS B2 (Your call 5): matches played before the pause menu offers Forfeit (matches 1–3 never do). */
export const FORFEIT_FROM_MATCH = 3;

/**
 * The tick from which the pause menu offers Forfeit in the next match, or 0 (no Forfeit button): never in matches
 * 1–3 (the client's rule, also for a veteran), else the sim's DifficultyRules.forfeitFrom (Easy 3:00, Normal and Hard
 * 4:00, Rookie never).
 */
export function forfeitTick(matches: number, difficulty: Difficulty): number {
  if (matches < FORFEIT_FROM_MATCH) return 0;
  return DIFFICULTY_RULES[difficulty]?.forfeitFrom ?? 0;
}
