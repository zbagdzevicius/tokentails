/**
 * Paw Match run rules that do not need Phaser (plan G10 "Paw Match", F6). Jest-tested in
 * `client/__test__/match3-rules.test.ts`.
 *
 * - The clock and RUN_BEGIN start on the first valid swap (one that makes a match or fires a
 *   special), never in `create()`. Invalid swaps and taps leave the clock stopped.
 * - Last chance: when the clock runs out, the existing bonus can save the run once. On an
 *   uncleared level 1 it fires automatically, whatever the progress, and gives the one-time
 *   +15 s grace (section 2.13 #38: G10 owns the timer and grace).
 * - Level select: `unlocked(i) = i === 0 || cleared[i - 1]` over the server's `match3Cleared`
 *   (F6). Until the server sends the field, the old catnip rule applies, so no unlock is lost
 *   before the grandfathering migration runs.
 */
import { MATCH3_LEVELS, type IMatch3LevelDefinition } from "./match3.config";

/** The usual last-chance bonus. */
export const LAST_CHANCE_SECONDS = 5;
/** The one-time grace on an uncleared level 1 (plan G10, section 2.13 #38). */
export const LEVEL_ONE_GRACE_SECONDS = 15;

export interface SwapOutcome {
  /** The swap made a match or fired a special (it was not swapped back). */
  valid: boolean;
}

/** True when this swap should start the clock: the first valid one. */
export function shouldStartClock(clockStarted: boolean, swap: SwapOutcome): boolean {
  return !clockStarted && swap.valid;
}

export interface LastChanceInput {
  levelId: string;
  /** The player has cleared this level before (server `match3Cleared`, or the legacy rule). */
  levelCleared: boolean;
  /** The bonus was already used this run. */
  used: boolean;
  ended: boolean;
  score: number;
  targetScore: number;
  objectiveTarget: number;
  objectiveCollected: number;
  /** The level's `lastChanceProgressGate` (0..1 of the target score). */
  gate: number;
}

export interface LastChanceGrant {
  seconds: number;
  /** `grace` is the automatic level-1 grace; `close` is the earned bonus near the target. */
  kind: "grace" | "close";
}

/** Seconds the last chance adds now, or null when the run ends. Fires at most once per run. */
export function lastChanceGrant(input: LastChanceInput): LastChanceGrant | null {
  if (input.used || input.ended) return null;
  if (isFirstLevel(input.levelId) && !input.levelCleared) {
    return { seconds: LEVEL_ONE_GRACE_SECONDS, kind: "grace" };
  }
  const scoreProgress = input.targetScore ? input.score / input.targetScore : 0;
  const objectiveMissing = Math.max(0, input.objectiveTarget - input.objectiveCollected);
  if (scoreProgress >= input.gate || objectiveMissing <= 2) {
    return { seconds: LAST_CHANCE_SECONDS, kind: "close" };
  }
  return null;
}

export function isFirstLevel(levelId: string): boolean {
  return levelId === MATCH3_LEVELS[0]?.id;
}

// ---- Level select -----------------------------------------------------------------------------

/** The profile fields level select reads. `match3Cleared` is the server's cleared array (F6). */
export interface Match3ProgressSource {
  match3?: unknown;
  match3Cleared?: unknown;
}

export interface Match3LevelProgress {
  /** Cleared flags per level, same indexes as MATCH3_LEVELS. */
  cleared: boolean[];
  unlocked: boolean[];
  /** Where the flags came from: the server array, or the old catnip rule (before the migration). */
  source: "server" | "legacy";
  /** No level is cleared yet: level select points at level 1 with "START HERE". */
  firstVisit: boolean;
}

/** The catnip a level needs from the previous one under the old rule (20% of its cap). */
export function legacyUnlockRequirement(index: number, levels: ReadonlyArray<IMatch3LevelDefinition> = MATCH3_LEVELS): number {
  return index > 0 ? Math.max(1, Math.round(levels[index - 1].catnipCap * 0.2)) : 0;
}

const numberAt = (values: unknown, index: number): number => {
  if (!Array.isArray(values)) return 0;
  const value = Number(values[index] ?? 0);
  return Number.isFinite(value) ? value : 0;
};

export function match3LevelProgress(
  profile: Match3ProgressSource | null | undefined,
  levels: ReadonlyArray<IMatch3LevelDefinition> = MATCH3_LEVELS,
): Match3LevelProgress {
  const serverCleared = profile && Array.isArray(profile.match3Cleared) ? profile.match3Cleared : null;
  if (serverCleared) {
    const cleared = levels.map((_level, i) => numberAt(serverCleared, i) > 0);
    const unlocked = levels.map((_level, i) => i === 0 || cleared[i - 1]);
    return { cleared, unlocked, source: "server", firstVisit: !cleared.some(Boolean) };
  }
  // Legacy: a level counts as cleared when it earned any catnip (what the grandfathering
  // migration writes), and unlocks needed 20% of the previous level's cap.
  const catnip = profile?.match3;
  const cleared = levels.map((_level, i) => numberAt(catnip, i) > 0);
  const unlocked = levels.map((_level, i) => i === 0 || numberAt(catnip, i - 1) >= legacyUnlockRequirement(i, levels));
  return { cleared, unlocked, source: "legacy", firstVisit: !cleared.some(Boolean) };
}

/** Whether `levelId` is cleared for this profile (false for an unknown level). */
export function isMatch3LevelCleared(
  profile: Match3ProgressSource | null | undefined,
  levelId: string,
  levels: ReadonlyArray<IMatch3LevelDefinition> = MATCH3_LEVELS,
): boolean {
  const index = levels.findIndex((level) => level.id === levelId);
  if (index < 0) return false;
  return match3LevelProgress(profile, levels).cleared[index];
}
