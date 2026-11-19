/**
 * One main queue (docs/plans/moba/MODE-UNLOCKS.md). Founder Nov 19: "keep: 3v3 as main queue. Practise appears from
 * Level 5 only (without appearing before that). Ranked appears from level 10 (without appearing before that). so
 * basically there'll be a button PLAY for main queue, on top of it near it (around it). Ranked And practise will show up
 * once they'll be unlocked."
 *
 * Home's PLAY starts the 3v3 main queue (Skirmish) for every player. Practice (Lv 5) and Ranked (Lv 10) are smaller
 * buttons next to PLAY, drawn only once the account reaches their level (meta/accountLevel.ts: finished matches, synced
 * to the account): no locked tile, no teaser and no "unlocks at" line before that. Classic 5v5, Blitz, Duel, One Lane
 * Brawl, Cannon Chaos, Boss Weekend and the Weekly Twist are retired from the menu; their sim code stays, so old
 * replays play and history keeps their rows.
 *
 * Ranked keeps an earned rank: an account whose ranked card shows games (placements started or a tier) keeps the Ranked
 * button below Lv 10 (`RANKED_PLAYED` in the synced `unlocks`). The server checks the same (backend ranked/tiers.ts
 * `rankedByMatches`). The backend copy of the table is backend/src/pawlegends/mode-unlocks.ts (QUEUE_LEVEL), pinned
 * equal by tests/unit/mode-unlocks.test.ts.
 *
 * Pure apart from the guarded localStorage helpers at the end.
 */
import type { ModeDef, ModeId } from './modes';
import { levelOf, matchesForLevel, moreMatches } from '../../meta/accountLevel';

export interface Need {
  /** The account level the mode opens at. */
  level: number;
}
export interface Counts {
  matches: number;
  wins: number;
}
export type UnlockProfile = Counts & { unlocks: readonly string[] };

/** PLAY's mode: the 3v3 main queue (Skirmish, the 5-map rotation). Open from the first match. */
export const MAIN_MODE: ModeId = 'skirmish';

/** The buttons next to PLAY and the level each appears at (Ranked: also its server rule, a registered account). */
export const MODE_UNLOCKS: readonly { id: ModeId; need: Need }[] = Object.freeze([
  { id: 'practice', need: { level: 5 } },
  { id: 'ranked', need: { level: 10 } },
]);

/** Off the menu since Nov 19 (their sim modes stay for replays and history). */
export const RETIRED_MODES: readonly ModeId[] = Object.freeze(['classic', 'blitz', 'duel', 'onelane', 'cannon', 'boss', 'twist']);

/** In `unlocks`: this account played Ranked (its card showed games), so Ranked stays below Lv 10. */
export const RANKED_PLAYED = 'ranked.played';

export const MODE_PREFIX = 'mode.';
export const unlockId = (id: ModeId): string => `${MODE_PREFIX}${id}`;
/** Cosmetic counts skip these ids (they are mode unlocks, not items). */
export const isModeUnlock = (u: string): boolean => u.startsWith(MODE_PREFIX) || u === RANKED_PLAYED;

/** The level a menu mode needs, or null (the main queue, or a mode that is not on the menu). Pure. */
export function needOf(id: ModeId): Need | null {
  return MODE_UNLOCKS.find((u) => u.id === id)?.need ?? null;
}

/** The level a mode opens at (1: the main queue). Pure. */
export const levelNeeded = (id: ModeId): number => needOf(id)?.level ?? 1;

export const meets = (need: Need, c: Counts): boolean => levelOf(c.matches) >= need.level;

/** "Unlocks at Lv 10 · 3 more matches": only for a friend's Ranked invite (never on Home). Pure. */
export function lockLine(id: ModeId, c: Counts): string {
  const need = needOf(id);
  if (!need) return '';
  const left = Math.max(0, matchesForLevel(need.level) - Math.max(0, Math.floor(c.matches)));
  return `Unlocks at Lv ${need.level} · ${moreMatches(left)}`;
}

/**
 * Can this player start the mode from the menu? The main queue always; Practice from Lv 5; Ranked from Lv 10 or with
 * ranked games played; a retired or unknown mode never. `now` is kept for the callers. Pure.
 */
export function isUnlocked(m: Pick<ModeDef, 'id'>, p: UnlockProfile, now?: number): boolean {
  void now;
  if (m.id === MAIN_MODE) return true;
  const need = needOf(m.id);
  if (!need) return false;
  return meets(need, p) || (m.id === 'ranked' && p.unlocks.includes(RANKED_PLAYED));
}

/** The buttons next to PLAY for this player, in drawing order (Ranked above Practice). Pure. */
export function menuExtras(p: UnlockProfile): ModeId[] {
  return (['ranked', 'practice'] as ModeId[]).filter((id) => isUnlocked({ id }, p));
}

/** The menu modes this match opened (the results banner and Home's one-time "New" reveal). Pure. */
export function newlyUnlocked(before: Counts, after: UnlockProfile): ModeId[] {
  return MODE_UNLOCKS.filter((u) => !meets(u.need, before) && meets(u.need, after) && !(u.id === 'ranked' && after.unlocks.includes(RANKED_PLAYED))).map((u) => u.id);
}

/** The per-player reveal state (display only): modes a match opened, and those Home already revealed. */
export interface ModeLocal {
  /** Opened at a results screen and not played yet. */
  fresh: string[];
  /** Fresh modes Home already revealed ("New: Ranked" plays once). */
  seen: string[];
}

/** Fresh modes Home has not revealed yet, menu modes only (an old list may still name a retired mode). Pure. */
export const unseenFresh = (local: ModeLocal): string[] => local.fresh.filter((id) => !local.seen.includes(id) && !!needOf(id));

/** A finished match of `id`: it is no longer new. Pure. */
export function notePlayed(local: ModeLocal, id: ModeId): ModeLocal {
  if (!local.fresh.includes(id)) return local;
  return { fresh: local.fresh.filter((x) => x !== id), seen: local.seen.filter((x) => x !== id) };
}

// ------------------------------------------------------------------------------------------ the local state

/**
 * The reveal state, as two short comma lists so they ride the synced device settings (meta/progressCloud.ts
 * SYNCED_KEYS carries strings up to 32 characters).
 */
export const MODES_NEW_KEY = 'pawlegends.modes.new';
export const MODES_SEEN_KEY = 'pawlegends.modes.seen';

const ID = /^[a-z0-9_-]{1,24}$/;
const readList = (k: string): string[] => {
  try {
    const v = globalThis.localStorage?.getItem(k);
    return v ? [...new Set(v.split(',').filter((x) => ID.test(x)))] : [];
  } catch {
    return [];
  }
};
const write = (k: string, v: string): void => {
  try {
    globalThis.localStorage?.setItem(k, v);
  } catch {
    /* a blocked store: the reveal state holds for this visit only */
  }
};

export function loadModeLocal(): ModeLocal {
  const fresh = readList(MODES_NEW_KEY);
  return { fresh, seen: readList(MODES_SEEN_KEY).filter((x) => fresh.includes(x)) };
}

export function saveModeLocal(l: ModeLocal): void {
  write(MODES_NEW_KEY, l.fresh.join(','));
  write(MODES_SEEN_KEY, l.seen.join(','));
}
