/**
 * Product-analytics event catalog (PostHog EU), F9.
 *
 * Every event the core app may send is declared here with its property
 * shape, so features import a name instead of inventing one. Events carry no
 * personal data: no user id, email, name, cat name or wallet address.
 * PostHog's own random anonymous id is the only identifier.
 *
 * The names, areas, consent key, scrubber and session budget live in
 * `shared/analytics-core.ts`, copied into the client and into Catnip Heist,
 * so both apps send from one catalog (F9). This file adds the property
 * shapes and builders. The Heist sends `heist_open` (standalone loads),
 * `heist_run_complete` and `app_error` itself (`catnip-heist/src/analytics`);
 * the `/heist` host page sends `heist_open`, `heist_save`,
 * `heist_signin_prompt` and `heist_guest_claim`.
 *
 * Telemetry never writes scores. Scores are saved only through
 * `POST /user/catbassadors/live`.
 */

import type { GamePlatformValue } from "@/models/game";
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type ScrubbedValue,
} from "@/shared-contracts/analytics-core";

export type AnalyticsPlatform = GamePlatformValue;
export type DeviceTier = "low" | "high" | "unknown";

/** Which product sent the event. */
export type AnalyticsApp = "core" | "heist";

export {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_AREAS,
  HEIST_APP_EVENTS,
  isAnalyticsEventName,
} from "@/shared-contracts/analytics-core";
export type {
  AnalyticsArea,
  AnalyticsEventKey,
  AnalyticsEventName,
} from "@/shared-contracts/analytics-core";

export type GameOutcome = "win" | "run_end" | "fail";

/** Properties registered once and sent with every event. */
export interface AnalyticsSuperProperties {
  app: AnalyticsApp;
  platform: AnalyticsPlatform;
  device_tier: DeviceTier;
}

type NoProperties = Record<string, never>;

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

/** Where a CTA or entry point sat, e.g. `hero`, `team`, `picker`, `landing`. */
export interface FromProperties {
  from: string;
}

export type AuthProvider = "google" | "apple" | "email" | "password" | "link";
/** Save and send results. `guest` means kept locally until the player links an account. */
export type RequestStatus = "ok" | "error" | "rejected" | "guest" | "offline";

export interface FtueModeProperties {
  mode: string;
  level?: string | null;
}

export interface FtueHintProperties extends FtueModeProperties {
  hint: string;
}

/** Where an `app_error` came from. */
export type AppErrorSource =
  | "boundary"
  | "listener"
  | "window"
  | "rejection"
  | "watchdog"
  | "manual";

/** The boundary level, from the outermost in. */
export type AppErrorLevel = "root" | "page" | "scene" | "modal" | "section" | "none";

/**
 * A scrubbed crash report (F9). Every string here has been through
 * `analytics/scrub.ts`; build it with `reportAppError`, never by hand.
 */
export interface AppErrorProperties {
  /** Stable machine code, e.g. `scene_crash`, `listener_error`. */
  code: string;
  source: AppErrorSource;
  level: AppErrorLevel;
  error_name: string;
  message: string;
  stack: string | null;
  /** Route path without query or fragment. */
  route: string;
  /** 1-based count of reports this session, including this one. */
  session_index: number;
  context: Record<string, ScrubbedValue>;
}

export type AnalyticsEventProperties = {
  // Entry
  landing_cta: FromProperties;
  game_loaded: GameLoadedProperties;
  intro_lifted: { ms: number };
  // Identity
  guest_session_created: NoProperties;
  auth_sheet_shown: { reason: string };
  auth_linked: { provider: AuthProvider };
  auth_merged: NoProperties;
  auth_error: { code: string };
  save_nudge_shown: { trigger?: string };
  // Onboarding (never the chosen cat name)
  onboarding_shown: NoProperties;
  onboarding_step_viewed: { step: string };
  starter_selected: { starter: string };
  starter_named: { length: number };
  starter_committed: { starter: string };
  onboarding_skipped: { step?: string };
  featured_cat_followed: NoProperties;
  cat_name_rejected: { reason: string };
  cat_name_reported: NoProperties;
  // Runs
  ftue_gate_shown: FtueModeProperties;
  game_start: GameStartProperties;
  ftue_hint_shown: FtueHintProperties;
  ftue_hint_done: FtueHintProperties;
  life_lost: FtueModeProperties & { lives_left?: number };
  game_fail: GameEndProperties;
  game_finish: GameEndProperties;
  game_quit: GameQuitProperties;
  ftue_first_clear: FtueModeProperties;
  ftue_abandon: FtueModeProperties & { step?: string };
  // Heist
  heist_open: FromProperties;
  heist_run_complete: { level: string; outcome: "win" | "fail"; stars?: number };
  heist_save: { status: RequestStatus };
  heist_signin_prompt: { from?: string };
  heist_guest_claim: { status: RequestStatus };
  // Impact
  impact_tab_viewed: NoProperties;
  paw_earned: { amount?: number };
  treat_sent: { status: RequestStatus };
  pledge_made: NoProperties;
  claim_opened: { id: string };
  impact_page_viewed: { from?: string };
  // Health
  app_error: AppErrorProperties;
  game_font_fallback: { font: string; role?: string };
  storefront_degraded: { reason: string };
};

export type AnalyticsEvent = {
  [K in AnalyticsEventName]: { name: K; properties: AnalyticsEventProperties[K] };
}[AnalyticsEventName];

export type AnalyticsEventOf<K extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: K }
>;

/** Typed constructor so call sites never spell a name or shape by hand. */
export function buildEvent<K extends AnalyticsEventName>(
  name: K,
  properties: AnalyticsEventProperties[K],
): AnalyticsEventOf<K> {
  return { name, properties } as AnalyticsEventOf<K>;
}

/**
 * Modes without `completedLevel`. Purrsuit (`CATNIP_CHAOS`) sends an explicit
 * `stopOutcome`: reaching the goal is a win; a hit, a timeout or a quit is a
 * fail. A stop without one (older builds) still counts as a finished endless run.
 */
const ENDLESS_MODES = new Set<string>(["CATNIP_CHAOS"]);

/** How a scene says its run ended, see `IGameStopPayload.outcome` (plan F6). */
export type GameStopOutcomeInput = "won" | "died" | "timeout" | "quit";

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
  // Level modes win exactly when they report `completedLevel`, which they set with `won`.
  if (completedLevel) return "win";
  if (!ENDLESS_MODES.has(mode)) return "fail";
  if (stopOutcome === "won") return "win";
  if (stopOutcome) return "fail";
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
