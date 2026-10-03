/**
 * Cupid Cat first-session rules (plan G10 "Cupid", decision #96). Pure: no Phaser, no React, no
 * storage. The scene, the container and the level select read these; Jest covers them in
 * `__test__/pixel-rescue-ftue.test.ts`.
 *
 * - The run clock starts at `RUN_BEGIN`, never in `create`, and holds while any pause reason is
 *   set (tutorial steps, the gate, first-seen hints, the "bring the cat" pan).
 * - The tutorial plays once per level per player; "Replay tutorial" asks for it again explicitly.
 *   A retry never replays it.
 * - The starter shield guards uncleared levels 1 and 2; it absorbs the first hit only.
 * - Every stop carries an outcome: `won`, `died` or `timeout`.
 * - Level select: `unlocked(i) = i === 0 || cleared[i - 1]` over the full list (plan G10 backend),
 *   with "START HERE" on the next level to play (the shared rules in `onboarding/progress`).
 */
import {
  clearedFlags,
  isUnlocked,
  MODE_LEVELS,
  startHere,
  type ProgressProfile,
} from "@/components/Phaser/onboarding/progress";
import { GameType } from "@/shared-contracts/enums";

/** Seconds a Cupid run starts with (unchanged from the original scene). */
export const CUPID_RUN_SECONDS = 90;

/** Levels (1-based) that get a starter shield while uncleared. */
export const STARTER_SHIELD_LEVELS: readonly number[] = Object.freeze([1, 2]);

/**
 * How long the cat is untouchable after a shield breaks. The old 100 ms let a saw or a spike that
 * was still overlapping take the next life on the following frames, so the shield saved nothing.
 */
export const SHIELD_BREAK_GRACE_MS = 1000;

/** Bump to show every player the tutorial again after a rewrite. */
export const CUPID_TUTORIAL_VERSION = 1;

/** The ftue-store key for a level's tutorial, versioned. */
export const tutorialKey = (level: string): string => `tutorial.v${CUPID_TUTORIAL_VERSION}.${level}`;

/** First-seen hint ids (the copy lives in `hints.ts`). */
export type CupidHintId = "enemy" | "crate" | "portal" | "shield";

export const hintKey = (id: CupidHintId): string => `hint.${id}`;

/**
 * Whether the viewer asked for less motion. The tutorial tour then cuts between text cards and
 * the shield and hint tweens are dropped. False when there is no window (SSR, tests without one).
 */
export function prefersReducedMotion(
  win: { matchMedia?: (query: string) => { matches: boolean } } | undefined = typeof window === "undefined"
    ? undefined
    : window,
): boolean {
  try {
    return !!win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Whether a Cupid win is kept as a device-local clear: only when the save cannot reach the
 * server (no profile, or a transient guest profile). A signed-in clear waits for the server's
 * `seasonEventCleared`, so a failed save never unlocks the next day on this device and another
 * account on the same browser inherits nothing.
 */
export function recordsLocalClears(profile: { transient?: boolean } | null | undefined): boolean {
  return !profile || !!profile.transient;
}

/**
 * Tails the Cupid gift pays. A copy of `QuestTypeReward[QUEST.PIXEL_RESCUE_LEVEL]` in
 * `backend/src/user/user.schema.ts`: change both together (reward constants, CLAUDE.md).
 */
export const CUPID_GIFT_TAILS = 10000;

/**
 * The 10,000-tail Cupid gift is redeemable only when the server shows every day cleared: never
 * from device-local clears (they are per browser, not per account).
 */
export function cupidGiftRedeemable(
  profile: ProgressProfile | null | undefined,
  alreadyRedeemed: boolean,
): boolean {
  if (!profile || alreadyRedeemed) return false;
  const flags = clearedFlags(profile, GameType.PIXEL_RESCUE);
  return flags.length > 0 && flags.every(Boolean);
}

export type TutorialDecision = "play" | "skip";

/**
 * Whether a level's tutorial plays. It plays the first time, or when the player asked for it
 * ("Replay tutorial"). A retry (`isRestart`) on its own never replays it, even if the seen flag
 * could not be stored: the restart remembers it for the session.
 */
export function tutorialDecision(input: {
  seen: boolean;
  replayRequested?: boolean;
  isRestart?: boolean;
  /** Levels whose tutorial already played in this page session. */
  playedThisSession?: boolean;
}): TutorialDecision {
  if (input.replayRequested) return "play";
  if (input.seen || input.playedThisSession) return "skip";
  if (input.isRestart) return "skip";
  return "play";
}

/** 1-based level number of a Cupid level id ("1" -> 1); NaN for an unknown id. */
export const levelNumber = (level: string): number => Number.parseInt(level, 10);

/** Whether a run on `level` starts with the starter shield. */
export function starterShieldFor(level: string, cleared: readonly boolean[]): boolean {
  const n = levelNumber(level);
  if (!STARTER_SHIELD_LEVELS.includes(n)) return false;
  return !cleared[n - 1];
}

/**
 * Shield state for one run. The starter shield and a picked-up shield are the same shield (one
 * hit), so `absorb` answers whether a hit is swallowed, and the grace window stops the same hazard
 * from landing again the next frame.
 */
export class ShieldState {
  private active = false;
  private graceUntil = -Infinity;
  /** "starter" when the active shield is the starter one, for the HUD and analytics. */
  source: "starter" | "pickup" | null = null;

  constructor(private readonly graceMs: number = SHIELD_BREAK_GRACE_MS) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Arms the shield. A shield already up is not stacked; returns false then. */
  arm(source: "starter" | "pickup"): boolean {
    if (this.active) return false;
    this.active = true;
    this.source = source;
    return true;
  }

  /** True while the post-break grace window lasts. */
  inGrace(now: number): boolean {
    return now < this.graceUntil;
  }

  /**
   * A hit arrives at `now`. Returns `"absorbed"` (the shield broke now), `"ignored"` (grace window)
   * or `"hit"` (no shield: the hit lands).
   */
  hit(now: number): "absorbed" | "ignored" | "hit" {
    if (this.inGrace(now)) return "ignored";
    if (!this.active) return "hit";
    this.active = false;
    this.source = null;
    this.graceUntil = now + this.graceMs;
    return "absorbed";
  }

  reset(): void {
    this.active = false;
    this.source = null;
    this.graceUntil = -Infinity;
  }
}

/** `game.events` name the scene emits its ICupidFtueSnapshot on (HUD shield chip and replay). */
export const CUPID_FTUE_EVENT = "cupid:ftue";

/** Test and QA read-out of the first-session state (e2e `cupid-ftue.spec.ts`). */
export interface ICupidFtueSnapshot {
  level: string;
  time: number;
  clockBegun: boolean;
  clockRunning: boolean;
  pauseReasons: string[];
  tutorialActive: boolean;
  shieldActive: boolean;
  shieldSource: "starter" | "pickup" | null;
  health: number | null;
  gameEnded: boolean;
  hintsShown: CupidHintId[];
}

export type CupidStopReason = "portal" | "health" | "spike" | "timer";
export type CupidOutcome = "won" | "died" | "timeout";

export function outcomeFor(reason: CupidStopReason): CupidOutcome {
  if (reason === "portal") return "won";
  if (reason === "timer") return "timeout";
  return "died";
}

/**
 * The run clock. It does not count until `begin()` (RUN_BEGIN), and `tick()` does nothing while a
 * pause reason is held or after the run ended. One clock per run: a restart makes a new one, so
 * there is never a second countdown.
 */
export class RunClock {
  private remaining: number;
  private counted = 0;
  private begun = false;
  private ended = false;
  private readonly reasons = new Set<string>();

  constructor(seconds: number = CUPID_RUN_SECONDS) {
    this.remaining = Math.max(0, Math.floor(seconds));
  }

  get time(): number {
    return this.remaining;
  }

  /** Seconds the clock actually counted (paused time and bonus time excluded). */
  get elapsed(): number {
    return this.counted;
  }

  get hasBegun(): boolean {
    return this.begun;
  }

  get isPaused(): boolean {
    return this.reasons.size > 0;
  }

  get isRunning(): boolean {
    return this.begun && !this.ended && !this.isPaused;
  }

  get pauseReasons(): string[] {
    return Array.from(this.reasons);
  }

  /** Starts counting. Returns false when already begun (a second begin is ignored). */
  begin(): boolean {
    if (this.begun || this.ended) return false;
    this.begun = true;
    return true;
  }

  pause(reason: string): void {
    this.reasons.add(reason);
  }

  resume(reason: string): void {
    this.reasons.delete(reason);
  }

  addTime(seconds: number): number {
    if (Number.isFinite(seconds) && seconds > 0 && !this.ended) this.remaining += Math.floor(seconds);
    return this.remaining;
  }

  /** One second passed. Returns `"tick"`, `"expired"` (just hit zero) or `"idle"` (not counting). */
  tick(): "tick" | "expired" | "idle" {
    if (!this.isRunning) return "idle";
    this.remaining = Math.max(0, this.remaining - 1);
    this.counted++;
    if (this.remaining === 0) {
      this.ended = true;
      return "expired";
    }
    return "tick";
  }

  /** Stops the clock for good (win, death, quit). */
  end(): void {
    this.ended = true;
  }
}

export interface CupidLevelState {
  level: string;
  index: number;
  cleared: boolean;
  /** Progression unlock only: `i === 0 || cleared[i - 1]` (onboarding/progress `isUnlocked`). */
  unlocked: boolean;
  /** Seasonal calendar gate (the February days); separate so the toast can say which one. */
  dateUnlocked: boolean;
  /** The "START HERE" / "NEXT" marker: the first uncleared level, if it is playable now. */
  next: boolean;
}

/**
 * The level select's view of Cupid progress, on the shared G10 rules (`onboarding/progress`):
 * server cleared array first, the grandfathering fallback (best > 0) without it, local clears on
 * top.
 */
export function cupidLevelStates(
  profile: ProgressProfile | null | undefined,
  localClears: readonly string[] = [],
  isDateUnlocked: (index: number) => boolean = () => true,
): CupidLevelState[] {
  const mode = GameType.PIXEL_RESCUE;
  const flags = clearedFlags(profile, mode, localClears);
  const marker = startHere(mode, flags);
  return MODE_LEVELS[mode].levels.map((level, index) => {
    const unlocked = isUnlocked(mode, level, flags);
    const dateUnlocked = isDateUnlocked(index);
    return {
      level,
      index,
      cleared: !!flags[index],
      unlocked,
      dateUnlocked,
      next: level === marker && unlocked && dateUnlocked,
    };
  });
}

/** "START HERE" for a player with no clears in Cupid, "NEXT" afterwards. */
export function nextLabel(cleared: readonly boolean[]): "START HERE" | "NEXT" {
  return cleared.some(Boolean) ? "NEXT" : "START HERE";
}
