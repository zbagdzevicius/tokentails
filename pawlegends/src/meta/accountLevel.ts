/**
 * The account level (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 17: "other modes unlocks upon reaching certain LVL
 * (must be progression)"). One level for the whole account, from the finished matches the profile counts (bot, co-op,
 * PvP and party matches; Practice never counts). The count is synced to the account and max-merged on the server
 * (meta/progressCloud.ts), so it survives a restart, a reinstall and a new device; a guest keeps it on the device.
 * The backend's copy (backend/src/pawlegends/mode-unlocks.ts) checks the server-run queues on its own saved matches;
 * tests/unit/mode-unlocks.test.ts pins the two tables equal. Pure.
 */

/** Finished matches needed for each level: index 0 is Lv 1. Past the table, every LEVEL_STEP_AFTER matches is a level. */
export const LEVEL_MATCHES: readonly number[] = Object.freeze([0, 2, 4, 6, 8, 10, 13, 16, 20, 25, 30, 36, 42, 50]);
export const LEVEL_STEP_AFTER = 10;
export const LEVEL_MAX = 99;

/** The account level of `matches` finished matches (Lv 1 at 0). */
export function levelOf(matches: number): number {
  const m = Math.max(0, Math.floor(Number(matches) || 0));
  let lv = 1;
  for (let i = 1; i < LEVEL_MATCHES.length; i++) if (m >= LEVEL_MATCHES[i]) lv = i + 1;
  const last = LEVEL_MATCHES[LEVEL_MATCHES.length - 1];
  if (m >= last) lv = LEVEL_MATCHES.length + Math.floor((m - last) / LEVEL_STEP_AFTER);
  return Math.min(LEVEL_MAX, lv);
}

/** Finished matches that reach `level`. */
export function matchesForLevel(level: number): number {
  const l = Math.max(1, Math.min(LEVEL_MAX, Math.floor(level)));
  if (l <= LEVEL_MATCHES.length) return LEVEL_MATCHES[l - 1];
  return LEVEL_MATCHES[LEVEL_MATCHES.length - 1] + (l - LEVEL_MATCHES.length) * LEVEL_STEP_AFTER;
}

export interface LevelInfo {
  level: number;
  /** Progress inside this level toward the next, 0..1 (1 at the cap). */
  pct: number;
  /** Matches still to finish for the next level (0 at the cap). */
  toNext: number;
}

/** The level, the bar toward the next one and the matches still to play. Pure. */
export function levelInfo(matches: number): LevelInfo {
  const m = Math.max(0, Math.floor(Number(matches) || 0));
  const level = levelOf(m);
  if (level >= LEVEL_MAX) return { level, pct: 1, toNext: 0 };
  const from = matchesForLevel(level);
  const to = matchesForLevel(level + 1);
  return { level, pct: Math.max(0, Math.min(1, (m - from) / Math.max(1, to - from))), toNext: Math.max(0, to - m) };
}

/** "1 more match" / "3 more matches". */
export const moreMatches = (n: number): string => `${n} more ${n === 1 ? 'match' : 'matches'}`;
