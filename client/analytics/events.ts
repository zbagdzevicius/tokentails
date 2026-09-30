/**
 * Shared product-analytics scheme (PostHog EU).
 *
 * The core app and Catnip Heist send the same event names and property
 * shapes so funnels can be compared across both. Events carry no personal
 * data: no user id, email, name or wallet address. PostHog's own random
 * anonymous id is the only identifier.
 *
 * Telemetry never writes scores. Scores are saved only through
 * `POST /user/catbassadors/live`.
 */

import type { GamePlatformValue } from "@/models/game";

export type AnalyticsPlatform = GamePlatformValue;
export type DeviceTier = "low" | "high" | "unknown";

/** Which product sent the event. */
export type AnalyticsApp = "core" | "heist";

export const ANALYTICS_EVENTS = {
  /** A run of a mode (or level) begins. */
  GAME_START: "game_start",
  /** The scene finished loading after the player picked a mode. */
  GAME_LOADED: "game_loaded",
  /** The run ended normally: level completed, or an endless run finished. */
  GAME_FINISH: "game_finish",
  /** The run ended without completing the level. */
  GAME_FAIL: "game_fail",
  /** The player left the mode while a run was in progress. */
  GAME_QUIT: "game_quit",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type GameOutcome = "win" | "run_end" | "fail";

/** Properties registered once and sent with every event. */
export interface AnalyticsSuperProperties {
  app: AnalyticsApp;
  platform: AnalyticsPlatform;
  device_tier: DeviceTier;
}

interface BaseGameProperties {
  /** Game mode, e.g. the `GameType` value (`MATCH_3`) or `HEIST`. */
  mode: string;
  level: string | null;
  platform: AnalyticsPlatform;
}

export interface GameStartProperties extends BaseGameProperties {
  is_restart: boolean;
}

export interface GameLoadedProperties extends BaseGameProperties {
  load_ms: number | null;
}

export interface GameEndProperties extends BaseGameProperties {
  outcome: GameOutcome;
  /** Wall-clock run length measured on the client. */
  duration_s: number | null;
  /** Mode score (raw score where the mode has one). Informational only. */
  score: number;
  catnip: number;
  stars?: number;
}

export interface GameQuitProperties extends BaseGameProperties {
  duration_s: number | null;
}

export type AnalyticsEventProperties = {
  game_start: GameStartProperties;
  game_loaded: GameLoadedProperties;
  game_finish: GameEndProperties;
  game_fail: GameEndProperties;
  game_quit: GameQuitProperties;
};

export type AnalyticsEvent = {
  [K in AnalyticsEventName]: { name: K; properties: AnalyticsEventProperties[K] };
}[AnalyticsEventName];

export type AnalyticsEventOf<K extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: K }
>;

/**
 * Modes without `completedLevel`. Purrsuit (`CATNIP_CHAOS`) sends an explicit
 * `stopOutcome`: reaching the goal is a win, a hit or a quit is a fail. A stop
 * without one (older builds) still counts as a finished endless run.
 */
const ENDLESS_MODES = new Set<string>(["CATNIP_CHAOS"]);

/** How a scene says its run ended, see `IGameStopEvent.outcome`. */
export type GameStopOutcomeInput = "won" | "died" | "quit";

export interface GameStopInput {
  mode: string;
  level: string | null;
  platform: AnalyticsPlatform;
  completedLevel?: string | null;
  score?: number;
  rawScore?: number;
  catnipEarned?: number;
  durationMs?: number | null;
  stopOutcome?: GameStopOutcomeInput;
}

export const toSeconds = (ms: number | null | undefined): number | null =>
  typeof ms === "number" && Number.isFinite(ms) && ms >= 0
    ? Math.round(ms / 100) / 10
    : null;

export function gameOutcome(
  mode: string,
  completedLevel?: string | null,
  stopOutcome?: GameStopOutcomeInput,
): GameOutcome {
  if (completedLevel) return "win";
  if (!ENDLESS_MODES.has(mode)) return "fail";
  if (stopOutcome === "won") return "win";
  if (stopOutcome === "died" || stopOutcome === "quit") return "fail";
  return "run_end";
}

/** Maps a `GAME_STOP` payload to `game_finish` or `game_fail`. */
export function buildGameStopEvent(
  input: GameStopInput,
): AnalyticsEventOf<"game_finish" | "game_fail"> {
  const outcome = gameOutcome(
    input.mode,
    input.completedLevel,
    input.stopOutcome,
  );
  const catnip = Number(input.catnipEarned ?? input.score ?? 0) || 0;
  const score = Number(input.rawScore ?? input.score ?? 0) || 0;
  const properties: GameEndProperties = {
    mode: input.mode,
    level: input.level,
    platform: input.platform,
    outcome,
    duration_s: toSeconds(input.durationMs),
    score,
    catnip,
  };
  return outcome === "fail"
    ? { name: ANALYTICS_EVENTS.GAME_FAIL, properties }
    : { name: ANALYTICS_EVENTS.GAME_FINISH, properties };
}

export function buildGameStartEvent(input: {
  mode: string;
  level: string | null;
  platform: AnalyticsPlatform;
  isRestart?: boolean;
}): AnalyticsEventOf<"game_start"> {
  return {
    name: ANALYTICS_EVENTS.GAME_START,
    properties: {
      mode: input.mode,
      level: input.level,
      platform: input.platform,
      is_restart: !!input.isRestart,
    },
  };
}

export function buildGameLoadedEvent(input: {
  mode: string;
  level: string | null;
  platform: AnalyticsPlatform;
  loadMs?: number | null;
}): AnalyticsEventOf<"game_loaded"> {
  const loadMs =
    typeof input.loadMs === "number" && input.loadMs >= 0
      ? Math.round(input.loadMs)
      : null;
  return {
    name: ANALYTICS_EVENTS.GAME_LOADED,
    properties: {
      mode: input.mode,
      level: input.level,
      platform: input.platform,
      load_ms: loadMs,
    },
  };
}

export function buildGameQuitEvent(input: {
  mode: string;
  level: string | null;
  platform: AnalyticsPlatform;
  durationMs?: number | null;
}): AnalyticsEventOf<"game_quit"> {
  return {
    name: ANALYTICS_EVENTS.GAME_QUIT,
    properties: {
      mode: input.mode,
      level: input.level,
      platform: input.platform,
      duration_s: toSeconds(input.durationMs),
    },
  };
}
