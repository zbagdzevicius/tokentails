/**
 * When a finished run is saved through `POST /user/catbassadors/live` (plan F6, G10), and what is
 * sent. Pure; GameContext is the only caller, and `/live` stays the only score write path.
 *
 * - `won` always saves: it records the clear (server side `$max` on the cleared slot) and the score.
 * - `died` and `timeout` (hard ends) save only when the run beat the stored best: the server keeps
 *   the best anyway (`$max`), so a worse run would only spend the rate limit. The endless INFINITE
 *   run always ends this way, so its best catnip is still saved.
 * - `quit` is a soft stop and never saves; neither do soft deaths (LIFE_LOST is not a stop).
 * - A run with no profile to save to (signed out before G1) never saves; the panel still shows.
 *
 * Points are clamped to the level's cap (the same table the backend enforces) so a long endless
 * Purrsuit run is saved at the cap instead of being refused with a 400 (1a's bug #4).
 */
import type { GameStopOutcome } from "@/components/Phaser/events";
import {
  bestFor,
  isInfiniteLevel,
  isScoredMode,
  levelIndex,
  MODE_LEVELS,
  type ProgressProfile,
  type ScoredMode,
} from "./progress";

/** A stop from a scene that predates the required `outcome` gets one inferred (old builds). */
export function resolveOutcome(outcome: GameStopOutcome | undefined, completedLevel?: string | null): GameStopOutcome {
  if (outcome) return outcome;
  return completedLevel ? "won" : "died";
}

export const isSoftStop = (outcome: GameStopOutcome): boolean => outcome === "quit";
export const isHardDeath = (outcome: GameStopOutcome): boolean => outcome === "died" || outcome === "timeout";

/** Clamps points to the level's cap and to a non-negative integer. */
export function clampPoints(mode: string, level: string | null | undefined, points: number): number {
  const value = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  if (!isScoredMode(mode)) return value;
  const index = levelIndex(mode, level);
  if (index < 0) return value;
  return Math.min(value, MODE_LEVELS[mode].caps[index]);
}

export interface SaveDecisionInput {
  mode: string;
  level: string | null | undefined;
  outcome: GameStopOutcome;
  /** Catnip or hearts of the run, before clamping. */
  points: number;
  /** Paw Match raw score. */
  score?: number;
  /** The profile the best and cleared state are read from; null when signed out. */
  profile: ProgressProfile | null | undefined;
  /** False for a signed-out player with no session to save to. */
  canSave: boolean;
}

export type SaveReason =
  | "won"
  | "new-best"
  | "not-better"
  | "soft-stop"
  | "no-session"
  | "unscored-mode"
  | "unknown-level";

export interface SaveDecision {
  save: boolean;
  reason: SaveReason;
  /** Points to send (clamped). */
  points: number;
  /** The run clears a level that was not cleared on the profile before. */
  clearedNow: boolean;
}

export function decideSave(input: SaveDecisionInput): SaveDecision {
  const points = clampPoints(input.mode, input.level, input.points);
  const base = { points, clearedNow: false };
  if (!isScoredMode(input.mode)) return { ...base, save: false, reason: "unscored-mode" };
  const mode: ScoredMode = input.mode;
  if (levelIndex(mode, input.level) < 0) return { ...base, save: false, reason: "unknown-level" };

  const clearedNow = input.outcome === "won" && !isInfiniteLevel(mode, input.level) && !wasCleared(input.profile, mode, input.level);
  if (!input.canSave) return { points, clearedNow, save: false, reason: "no-session" };
  if (isSoftStop(input.outcome)) return { points, clearedNow: false, save: false, reason: "soft-stop" };
  if (input.outcome === "won") return { points, clearedNow, save: true, reason: "won" };

  const best = bestFor(input.profile, mode, input.level);
  const betterScore = MODE_LEVELS[mode].scoreField ? Math.max(0, Math.floor(input.score ?? 0)) > best.score : false;
  if (points > best.points || betterScore) return { points, clearedNow, save: true, reason: "new-best" };
  return { points, clearedNow, save: false, reason: "not-better" };
}

/** Whether the profile already has the level cleared (server array, or the grandfathering rule). */
export function wasCleared(profile: ProgressProfile | null | undefined, mode: ScoredMode, level: string | null | undefined): boolean {
  const index = levelIndex(mode, level);
  if (index < 0 || !profile) return false;
  const table = MODE_LEVELS[mode];
  const server = profile[table.clearedField];
  if (Array.isArray(server)) return Number(server[index]) > 0;
  const points = profile[table.field];
  return Array.isArray(points) && Number(points[index]) > 0;
}
