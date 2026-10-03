/**
 * Level tables, cleared state and the unlock rule for the scored Phaser modes (plan F6, G10).
 *
 * Pure: no Phaser, no React. The level tables are the generated copies of `shared/caps.ts`, the
 * same ones `/live` validates against, so index `i` of every per-level array here is index `i` on
 * the server.
 *
 * Cleared state (decision #67): the server's `${field}Cleared` arrays are the truth. Over a server
 * array only the device's pending clears count (a won run whose save has not answered yet); the
 * rest of the local cache is ignored, so a clear another player made on this device, or one the
 * server refused, never unlocks anything (5a review #1). A profile from a backend that does not send the
 * cleared array at all (older backend, or a profile from before the migration) falls back to the
 * grandfathering rule of the migration itself: a level with points > 0 counts as cleared, so no
 * unlock is lost before the field ships.
 *
 * Unlock rule: `unlocked(i) = i === 0 || cleared[i - 1]` over the full list. Purrsuit's INFINITE
 * slot (`01`) is index 0 of its list but is never cleared; it unlocks once 1-1 is cleared
 * (decision #69), and 1-1 is the first level that is always open.
 */
import {
  CATNIP_CHAOS_ENDLESS_LEVEL,
  CATNIP_CHAOS_LEVEL_CAPS,
  CATNIP_CHAOS_LEVELS,
  MATCH3_LEVEL_CATNIP_CAPS,
  MATCH3_LEVELS,
  SEASON_EVENT_LEVEL_POINT_CAPS,
  SEASON_EVENT_LEVELS,
} from "@/shared-contracts/caps";
import { GameType } from "@/shared-contracts/enums";

export type ScoredMode = GameType.CATNIP_CHAOS | GameType.PIXEL_RESCUE | GameType.MATCH_3;

export interface ModeLevels {
  /** Level keys in save order. */
  levels: readonly string[];
  /** Per-level point cap (same table the backend enforces). */
  caps: readonly number[];
  /** Profile array of the best points per level. */
  field: "catnipChaos" | "seasonEvent" | "match3";
  /** Profile array of 0/1 cleared flags per level. */
  clearedField: "catnipChaosCleared" | "seasonEventCleared" | "match3Cleared";
  /** Profile array of the best raw score (Paw Match only). */
  scoreField?: "match3Score";
  /** Levels that are never cleared (the endless run). */
  infinite: readonly string[];
  /** The level a new player starts on. */
  first: string;
}

export const MODE_LEVELS: Readonly<Record<ScoredMode, ModeLevels>> = Object.freeze({
  [GameType.CATNIP_CHAOS]: {
    levels: CATNIP_CHAOS_LEVELS,
    caps: CATNIP_CHAOS_LEVEL_CAPS,
    field: "catnipChaos",
    clearedField: "catnipChaosCleared",
    infinite: [CATNIP_CHAOS_ENDLESS_LEVEL],
    first: "11",
  },
  [GameType.PIXEL_RESCUE]: {
    levels: SEASON_EVENT_LEVELS,
    caps: SEASON_EVENT_LEVEL_POINT_CAPS,
    field: "seasonEvent",
    clearedField: "seasonEventCleared",
    infinite: [],
    first: "1",
  },
  [GameType.MATCH_3]: {
    levels: MATCH3_LEVELS,
    caps: MATCH3_LEVEL_CATNIP_CAPS,
    field: "match3",
    clearedField: "match3Cleared",
    scoreField: "match3Score",
    infinite: [],
    first: "1",
  },
});

export const isScoredMode = (mode: string | null | undefined): mode is ScoredMode =>
  !!mode && Object.prototype.hasOwnProperty.call(MODE_LEVELS, mode);

/** Index of `level` in the mode's save order, or -1. */
export function levelIndex(mode: ScoredMode, level: string | null | undefined): number {
  if (!level) return -1;
  return MODE_LEVELS[mode].levels.indexOf(level);
}

export const isInfiniteLevel = (mode: ScoredMode, level: string | null | undefined): boolean =>
  !!level && MODE_LEVELS[mode].infinite.includes(level);

/** The profile fields this module reads; all optional, so a template or guest profile works. */
export interface ProgressProfile {
  catnipChaos?: number[] | null;
  seasonEvent?: number[] | null;
  match3?: number[] | null;
  match3Score?: number[] | null;
  catnipChaosCleared?: number[] | null;
  seasonEventCleared?: number[] | null;
  match3Cleared?: number[] | null;
}

const at = (values: readonly number[] | null | undefined, index: number): number => {
  const value = Array.isArray(values) ? Number(values[index]) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/** Best saved points (and raw score where the mode has one) of one level. */
export function bestFor(
  profile: ProgressProfile | null | undefined,
  mode: ScoredMode,
  level: string | null | undefined,
): { points: number; score: number } {
  const index = levelIndex(mode, level);
  if (index < 0 || !profile) return { points: 0, score: 0 };
  const table = MODE_LEVELS[mode];
  return {
    points: at(profile[table.field], index),
    score: table.scoreField ? at(profile[table.scoreField], index) : 0,
  };
}

/**
 * One boolean per level of the mode. With the server's cleared array: that array, plus the
 * pending clears (won runs whose save is in flight, `ftueStore.pendingClears`). Without it
 * (signed out, older backend): the grandfathering fallback plus every local clear. Infinite
 * levels are always false.
 *
 * Callers that pass no `pendingClears` keep the older rule (every local clear counts over the
 * server array). The store is per player, so that no longer leaks across accounts; pass
 * `ftueStore.pendingClears(mode)` to make the server the truth (Purrsuit and GameContext do).
 */
export function clearedFlags(
  profile: ProgressProfile | null | undefined,
  mode: ScoredMode,
  localClears: readonly string[] = [],
  pendingClears?: readonly string[],
): boolean[] {
  const table = MODE_LEVELS[mode];
  const server = profile?.[table.clearedField];
  const hasServer = Array.isArray(server);
  const points = profile?.[table.field];
  const overServer = pendingClears ?? localClears;
  return table.levels.map((level, index) => {
    if (table.infinite.includes(level)) return false;
    if (overServer.includes(level)) return true;
    if (hasServer) return at(server, index) > 0;
    if (localClears.includes(level)) return true;
    return at(points, index) > 0;
  });
}

/** Whether the player has cleared anything in the mode (first-time routing). */
export const hasAnyClear = (flags: readonly boolean[]): boolean => flags.some(Boolean);

/**
 * `unlocked(i) = i === 0 || cleared[i - 1]` over the mode's full list, where index 0 is the first
 * non-infinite level. Infinite levels unlock once the mode's first level is cleared (#69).
 */
export function isUnlocked(mode: ScoredMode, level: string, flags: readonly boolean[]): boolean {
  const table = MODE_LEVELS[mode];
  const index = table.levels.indexOf(level);
  if (index < 0) return false;
  if (table.infinite.includes(level)) return !!flags[table.levels.indexOf(table.first)];
  const playable = table.levels.filter((key) => !table.infinite.includes(key));
  const position = playable.indexOf(level);
  if (position <= 0) return true;
  return !!flags[table.levels.indexOf(playable[position - 1])];
}

/** The first level the player has not cleared yet (the "START HERE" marker), or null. */
export function startHere(mode: ScoredMode, flags: readonly boolean[], within?: readonly string[]): string | null {
  const table = MODE_LEVELS[mode];
  const list = (within ?? table.levels).filter((key) => !table.infinite.includes(key));
  for (const level of list) {
    const index = table.levels.indexOf(level);
    if (index >= 0 && !flags[index]) return level;
  }
  return null;
}

/** Every listed level is cleared (the all-cleared notice, G14). Infinite levels do not count. */
export function allCleared(mode: ScoredMode, flags: readonly boolean[], within?: readonly string[]): boolean {
  const table = MODE_LEVELS[mode];
  const list = (within ?? table.levels).filter((key) => !table.infinite.includes(key));
  return list.length > 0 && list.every((level) => !!flags[table.levels.indexOf(level)]);
}

/**
 * First-time routing (G10): a player with no clears in the mode goes straight to the first level's
 * full gate instead of the level map. Returns that level, or null to show the level map.
 */
export function firstTimeLevel(mode: ScoredMode, flags: readonly boolean[]): string | null {
  return hasAnyClear(flags) ? null : MODE_LEVELS[mode].first;
}
