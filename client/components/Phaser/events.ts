import { reportAppError } from "@/analytics";
import {
  isCrashForced,
  markCrashRecovered,
} from "@/components/errors/crash-probe";
import { SCENE_STALL_EVENT } from "@/components/errors/events";
import { getRegisteredGames, isGameSuspended } from "@/lib/game/gameRegistry";
import { ICat } from "@/models/cats";
import type { LiveGameOutcome } from "@/shared-contracts/enums";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

export type IPhaserScene = Phaser.Scene & { cat?: unknown; catDto?: ICat };
export interface IPhaserGame {
  game: Phaser.Game | null;
  scene: IPhaserScene | null;
}

export interface IPhaserGameSceneProps {
  cat: ICat;
  isRestart: boolean;
  catToRescue?: string; // Image URL for rescued cat sprite
}

// CAT EVENTS
// Events that carry no payload.
type IEmptyEvent = Record<string, never>;
interface ICatMeowEvent {
  cat?: ICat;
}
type ICatEatenEvent = IEmptyEvent;
interface ICatSpawnEvent {
  cat: ICat;
  isRestart?: boolean;
}
type ICatPlayEvent = IEmptyEvent;
type ICatEatEvent = IEmptyEvent;
// GAME EVENTS
/**
 * @deprecated Use RUN_BEGIN (a run started) and GAME_RESTART (play again). Kept only as the start
 * signal for `ShelterScene` until Shelter migrates (plan F6); GameContext no longer sends
 * `game_start` for it.
 */
interface IGameStartEvent {
  cat?: ICat;
  isRestart?: boolean;
}
/**
 * How a run ended (plan F6), the same values `/live` accepts as `outcome`:
 * - `won`: the level's goal was reached (a non-INFINITE level becomes cleared on the server);
 * - `died`: a hard death (no Paw Guard left), or the end of an endless run;
 * - `timeout`: the clock ran out;
 * - `quit`: the player left mid-run. A soft stop: never saved.
 * A soft death (Paw Guard) is not a stop at all: it sends LIFE_LOST.
 */
export type GameStopOutcome = LiveGameOutcome;

export interface IGameStopEvent {
  score: number;
  time: number;
  completedLevel?: string | null;
  rawScore?: number;
  catnipEarned?: number;
  /** Set on every GAME_STOP (see IGameStopPayload); optional here for panels built by hand. */
  outcome?: GameStopOutcome;
  /** What ended a `died` run (`spike`, `enemy`, ...), for the DeathCard's tip. */
  cause?: string;
  /**
   * Set by GameContext for the end-of-run panel, never by a scene: whether the run is sent to
   * `/live` (`decideSave().save`), why (`decideSave().reason`), the level's best before the run,
   * and where the save is ("saved" only once `/live` answered).
   */
  saved?: boolean;
  saveReason?: string;
  best?: number;
  saveState?: "saving" | "saved" | "failed";
  /** Saved to a guest account (kept only once the player signs in). */
  guest?: boolean;
}

/** What a scene pushes as GAME_STOP: `outcome` is required (plan F6). */
export interface IGameStopPayload extends IGameStopEvent {
  outcome: GameStopOutcome;
}

/*
 * RUN LIFECYCLE (plan F6, G10). Every mode follows the same order:
 *
 *   scene ready (cat on the map, frozen)  -> RUN_READY  -> RunGate shows
 *   first input (consumed, no jump)       -> RUN_BEGIN  -> `game_start` (the only start signal)
 *   soft death                            -> LIFE_LOST  (never saved)
 *   end                                   -> GAME_STOP { outcome }
 *   PLAY AGAIN                            -> GAME_RESTART -> the scene restarts -> RUN_READY
 *
 * `mode` and `level` are optional: GameContext knows them; scenes may send them for logging.
 */
export interface IRunReadyEvent {
  isRestart?: boolean;
  mode?: string;
  level?: string | null;
  /** Paw Guards for this attempt: a number, or `null` for unlimited. Absent: the mode has none. */
  guards?: number | null;
}

export interface IRunBeginEvent {
  isRestart?: boolean;
  mode?: string;
  level?: string | null;
}

/** PLAY AGAIN on the same level. Scenes restart themselves; it never means "a run started". */
export interface IGameRestartEvent {
  cat?: ICat;
  isRestart: true;
}

/** A soft death: a Paw Guard was spent and the cat respawned at its checkpoint. Never saved. */
export interface ILifeLostEvent {
  /** Paw Guards left after this one, or `null` for unlimited. */
  guardsLeft: number | null;
  /** What hit the cat, for the tip and analytics (`spike`, `fall`, `enemy`, ...). */
  cause?: string;
  mode?: string;
  level?: string | null;
}

/** A first-run hint (G10): a freeze-and-prompt (`prompt`) or a slow-motion teach (`teach`). */
export interface IRunHintEvent {
  /** Stable hint id, e.g. `first-spike`, `trampoline` (see onboarding/hints.ts). */
  hint: string;
  /** The line to show, already chosen for the last input device. */
  text: string;
  kind: "prompt" | "teach";
  mode?: string;
  level?: string | null;
}

export interface IRunHintDoneEvent {
  hint: string;
  /** `done`: the player did it; `skipped`: the run ended or restarted first. */
  result: "done" | "skipped";
}

interface IGameUpdateEvent {
  time?: number;
  additionalTime?: number;
}
interface IGameLoadedEvent {
  scene: IPhaserScene;
}
interface IGameScoreUpdateEvent {
  score: number;
}

interface IEnemySpawn {
  amount: number;
}
interface IBossSpawn {
  amount: number;
}

export enum NPC_TYPE {
  TOKENTAILS = "token-tails",
  TOKENTAILS_2 = "token-tails-2",
  ROZINE_PEDUTE = "rozine-pedute",
  PLAYER_CATS = "player-cats",
}

export interface INpcSpawnEvent {
  npc: ICat;
  type: NPC_TYPE;
}

/**
 * Every storefront NPC in one event (plan G13 step 6). The scene loads all their sheets in one
 * pass, skips cats whose sheet is missing or fails, and answers with NPC_SPAWNED.
 */
export interface INpcSpawnBatchEvent {
  npcs: INpcSpawnEvent[];
}

/** Sent once per batch after the NPCs are on screen. */
export interface INpcSpawnedEvent {
  /** NPCs spawned by this batch. */
  count: number;
  /** Cats left out: no usable sprite URL, a sheet that failed to load, or a spawn error. */
  skipped: number;
  /** `_id`s of the skipped cats (no names; they are user-chosen). */
  skippedIds: string[];
  /**
   * `batch` for NPC_SPAWN_BATCH, `legacy` for coalesced single NPC_SPAWN events (both from
   * ShelterScene), `player-cats` for Home's own-cats pass in BaseScene.
   */
  source: "batch" | "legacy" | "player-cats";
  /** The scene that spawned them. Home runs before Shelter, so listeners filter on this. */
  scene: "BaseScene" | "ShelterScene";
}

interface INpcCollisionEvent {
  npc: ICat;
}

interface ICatHealthUpdate {
  health: number;
  maxHealth: number;
}

interface IObjectiveUpdate {
  objective: string;
  completed: boolean;
}

interface IPlayerCats {
  cats: ICat[];
}

export type IEventDetail<T> = {
  detail: T;
};

// ALL EVENTS TYPES
export enum GameEvent {
  /** @deprecated ShelterScene only; see IGameStartEvent. */
  GAME_START = "GAME_START",
  RUN_READY = "RUN_READY",
  RUN_BEGIN = "RUN_BEGIN",
  GAME_RESTART = "GAME_RESTART",
  LIFE_LOST = "LIFE_LOST",
  RUN_HINT = "RUN_HINT",
  RUN_HINT_DONE = "RUN_HINT_DONE",
  GAME_STOP = "GAME_STOP",
  GAME_LOADED = "GAME_LOADED",
  GAME_UPDATE = "GAME_UPDATE",
  GAME_COIN_CAUGHT = "GAME_COIN_CAUGHT",
  GAME_PROGRESS_UPDATE = "GAME_PROGRESS_UPDATE",
  CAT_MEOW = "CAT_MEOW",
  CAT_EATEN = "CAT_EATEN",
  CAT_PLAY = "CAT_PLAY",
  CAT_SPAWN = "CAT_SPAWN",
  CAT_EAT = "CAT_EAT",
  /** Legacy, one cat per event. Scenes coalesce these into a batch; kept for one release. */
  NPC_SPAWN = "NPC_SPAWN",
  NPC_SPAWN_BATCH = "NPC_SPAWN_BATCH",
  NPC_SPAWNED = "NPC_SPAWNED",
  PLAYER_CATS = "PLAYER_CATS",
  NPC_COLLISION = "NPC_COLLISION",
  CAT_CARD_DISPLAY = "CAT_CARD_DISPLAY",
  ENEMY_SPAWN = "ENEMY_SPAWN",
  BOSS_SPAWN = "BOSS_SPAWN",
  CLEAR_NPCS = "CLEAR_NPCS",
  CAT_HEALTH_UPDATE = "CAT_HEALTH_UPDATE",
  OBJECTIVE_UPDATE = "OBJECTIVE_UPDATE",
}

export type ICatEventsDetails = {
  [GameEvent.CAT_MEOW]: ICatMeowEvent;
  [GameEvent.CAT_EATEN]: ICatEatenEvent;
  [GameEvent.CAT_PLAY]: ICatPlayEvent;
  [GameEvent.CAT_SPAWN]: ICatSpawnEvent;
  [GameEvent.CAT_EAT]: ICatEatEvent;
  [GameEvent.GAME_START]: IGameStartEvent;
  [GameEvent.RUN_READY]: IRunReadyEvent;
  [GameEvent.RUN_BEGIN]: IRunBeginEvent;
  [GameEvent.GAME_RESTART]: IGameRestartEvent;
  [GameEvent.LIFE_LOST]: ILifeLostEvent;
  [GameEvent.RUN_HINT]: IRunHintEvent;
  [GameEvent.RUN_HINT_DONE]: IRunHintDoneEvent;
  [GameEvent.GAME_STOP]: IGameStopPayload;
  [GameEvent.GAME_UPDATE]: IGameUpdateEvent;
  [GameEvent.GAME_LOADED]: IGameLoadedEvent;
  [GameEvent.GAME_COIN_CAUGHT]: IGameScoreUpdateEvent;
  [GameEvent.NPC_SPAWN]: INpcSpawnEvent;
  [GameEvent.NPC_SPAWN_BATCH]: INpcSpawnBatchEvent;
  [GameEvent.NPC_SPAWNED]: INpcSpawnedEvent;
  [GameEvent.NPC_COLLISION]: INpcCollisionEvent;
  [GameEvent.CAT_CARD_DISPLAY]: { npc: ICat };
  [GameEvent.ENEMY_SPAWN]: IEnemySpawn;
  [GameEvent.BOSS_SPAWN]: IBossSpawn;
  [GameEvent.PLAYER_CATS]: INpcSpawnEvent;
  [GameEvent.CLEAR_NPCS]: void;
  [GameEvent.GAME_PROGRESS_UPDATE]: { progress: number };
  [GameEvent.CAT_HEALTH_UPDATE]: ICatHealthUpdate;
  [GameEvent.OBJECTIVE_UPDATE]: IObjectiveUpdate;
};

export type ICatEvent<K extends GameEvent> = IEventDetail<ICatEventsDetails[K]>;

// CRASH GUARD (F9, G13)
// GameEvents listeners run from window.dispatchEvent, outside React, so a
// throw in one never reaches an error boundary. dispatchEvent already runs
// the remaining listeners and logs the error, but only as an anonymous
// uncaught error. Every listener is wrapped so the error is reported with
// its event as the code (scrubbed, consent-gated) and is not rethrown.

const listenerCode = (gameEvent: GameEvent) =>
  `listener_error:${gameEvent.toLowerCase()}`;

export const guardListener = <T>(
  gameEvent: GameEvent,
  listener: (value: T) => void,
): ((value: T) => void) => {
  return (value: T) => {
    try {
      // The env check is inline (not only inside isCrashForced) so Next inlines it here and the
      // minifier drops this branch, and its "(E2E)" message, from builds without the hooks.
      if (process.env.NEXT_PUBLIC_E2E === "1" && isCrashForced("listener")) {
        markCrashRecovered("listener");
        throw new Error("Forced listener crash (E2E)");
      }
      listener(value);
    } catch (error) {
      reportAppError(listenerCode(gameEvent), error, {
        source: "listener",
        event: gameEvent,
      });
      if (process.env.NODE_ENV !== "production") {
        console.error(`GameEvents.${gameEvent} listener failed`, error);
      }
    }
  };
};

// The wrapped listener for each (callback, event), so removeEventListener
// can find what addEventListener registered.
const wrappedListeners = new WeakMap<object, Map<GameEvent, EventListener>>();

const wrapFor = (
  gameEvent: GameEvent,
  callback: (event: never) => void,
): EventListener => {
  let byEvent = wrappedListeners.get(callback);
  if (!byEvent) {
    byEvent = new Map();
    wrappedListeners.set(callback, byEvent);
  }
  let wrapped = byEvent.get(gameEvent);
  if (!wrapped) {
    wrapped = guardListener(gameEvent, callback as (event: Event) => void);
    byEvent.set(gameEvent, wrapped);
  }
  return wrapped;
};

const useEvent = <K extends GameEvent>(
  gameEvent: K,
  callback?: (event: ICatEventsDetails[K]) => void,
) => {
  const [object, setObject] = useState<ICatEventsDetails[K] | null>(null);
  useEffect(() => {
    const handleGameStart = guardListener(
      gameEvent,
      (event: IEventDetail<ICatEventsDetails[K]>) => {
        setObject(event.detail);
        callback?.(event.detail);
      },
    );

    window.addEventListener(
      gameEvent,
      handleGameStart as unknown as EventListener,
    );

    return () => {
      window.removeEventListener(
        gameEvent,
        handleGameStart as unknown as EventListener,
      );
    };
  }, [callback]);

  return object;
};

const pushEvent = <K extends GameEvent>(
  gameEvent: GameEvent,
  event?: ICatEventsDetails[K],
) => {
  window.dispatchEvent(
    new CustomEvent(gameEvent, {
      detail: event,
    }),
  );
};

const addEventListener = <K extends GameEvent>(
  gameEvent: GameEvent,
  callback: (event: ICatEvent<K>) => void,
) => window.addEventListener(gameEvent, wrapFor(gameEvent, callback));

const removeEventListener = <K extends GameEvent>(
  gameEvent: GameEvent,
  callback: (event: ICatEvent<K>) => void,
) => window.removeEventListener(gameEvent, wrapFor(gameEvent, callback));

const generateGameEvent = <K extends GameEvent>(gameEvent: K) => ({
  use: (callback?: (event?: ICatEventsDetails[K]) => void) =>
    useEvent(gameEvent, callback),
  push: (event?: ICatEventsDetails[K]) => pushEvent(gameEvent, event),
  addEventListener: (callback: (event: ICatEvent<K>) => void) =>
    addEventListener(gameEvent, callback),
  removeEventListener: (callback: (event: ICatEvent<K>) => void) =>
    removeEventListener(gameEvent, callback),
});

type GameEventsType = {
  [K in GameEvent]: {
    use: (
      callback?: (event?: ICatEventsDetails[K]) => void,
    ) => ICatEventsDetails[K] | null;
    push: (event?: ICatEventsDetails[K]) => void;
    addEventListener: (callback: (event: ICatEvent<K>) => void) => void;
    removeEventListener: (callback: (event: ICatEvent<K>) => void) => void;
  };
};

export const GameEvents: GameEventsType = {
  [GameEvent.CAT_MEOW]: generateGameEvent(GameEvent.CAT_MEOW),
  [GameEvent.CAT_EATEN]: generateGameEvent(GameEvent.CAT_EATEN),
  [GameEvent.CAT_PLAY]: generateGameEvent(GameEvent.CAT_PLAY),
  [GameEvent.CAT_SPAWN]: generateGameEvent(GameEvent.CAT_SPAWN),
  [GameEvent.CAT_EAT]: generateGameEvent(GameEvent.CAT_EAT),
  [GameEvent.GAME_START]: generateGameEvent(GameEvent.GAME_START),
  [GameEvent.RUN_READY]: generateGameEvent(GameEvent.RUN_READY),
  [GameEvent.RUN_BEGIN]: generateGameEvent(GameEvent.RUN_BEGIN),
  [GameEvent.GAME_RESTART]: generateGameEvent(GameEvent.GAME_RESTART),
  [GameEvent.LIFE_LOST]: generateGameEvent(GameEvent.LIFE_LOST),
  [GameEvent.RUN_HINT]: generateGameEvent(GameEvent.RUN_HINT),
  [GameEvent.RUN_HINT_DONE]: generateGameEvent(GameEvent.RUN_HINT_DONE),
  [GameEvent.GAME_STOP]: generateGameEvent(GameEvent.GAME_STOP),
  [GameEvent.GAME_UPDATE]: generateGameEvent(GameEvent.GAME_UPDATE),
  [GameEvent.GAME_LOADED]: generateGameEvent(GameEvent.GAME_LOADED),
  [GameEvent.GAME_COIN_CAUGHT]: generateGameEvent(GameEvent.GAME_COIN_CAUGHT),
  [GameEvent.NPC_SPAWN]: generateGameEvent(GameEvent.NPC_SPAWN),
  [GameEvent.NPC_SPAWN_BATCH]: generateGameEvent(GameEvent.NPC_SPAWN_BATCH),
  [GameEvent.NPC_SPAWNED]: generateGameEvent(GameEvent.NPC_SPAWNED),
  [GameEvent.NPC_COLLISION]: generateGameEvent(GameEvent.NPC_COLLISION),
  [GameEvent.CAT_CARD_DISPLAY]: generateGameEvent(GameEvent.CAT_CARD_DISPLAY),
  [GameEvent.ENEMY_SPAWN]: generateGameEvent(GameEvent.ENEMY_SPAWN),
  [GameEvent.BOSS_SPAWN]: generateGameEvent(GameEvent.BOSS_SPAWN),
  [GameEvent.PLAYER_CATS]: generateGameEvent(GameEvent.PLAYER_CATS),
  [GameEvent.CLEAR_NPCS]: generateGameEvent(GameEvent.CLEAR_NPCS),
  [GameEvent.CAT_HEALTH_UPDATE]: generateGameEvent(GameEvent.CAT_HEALTH_UPDATE),
  [GameEvent.GAME_PROGRESS_UPDATE]: generateGameEvent(
    GameEvent.GAME_PROGRESS_UPDATE,
  ),
  [GameEvent.OBJECTIVE_UPDATE]: generateGameEvent(GameEvent.OBJECTIVE_UPDATE),
};

// Hook-named alias so React tooling treats the callback as effect-driven
// (useEvent only calls it from a window event listener, never during render).
export const useGameLoaded = GameEvents.GAME_LOADED.use;

// STALL WATCHDOG (F9)
// Phaser schedules its next frame only after the current step returns, so
// an exception inside a scene update silently freezes the canvas. The
// watchdog listens to the game's `poststep` heartbeat and reports a stall
// when frames stop while the page is visible and the game is not paused.
// It is reset whenever the tab becomes visible again or the app resumes,
// since browsers stop frames in the background.
//
// Startup is watched too, so a scene whose `create()` throws never leaves the
// player on an endless loader. The guard finds each new game through
// lib/game/gameRegistry (every `new Game` site registers), arms a longer
// startup watchdog only after the game's first step (Phaser keeps stepping
// while it loads assets), and switches to the normal watchdog on GAME_LOADED.
// A `create()` that throws from an asynchronous loader callback leaves the
// loop running, so the heartbeat cannot see it; Phaser then leaves that scene
// in its CREATING status for good, which the guard treats as a crash.

export const STALL_MS = 8000;
export const STARTUP_STALL_MS = 15000;
export const STALL_CHECK_MS = 1000;

/** Phaser.Scenes.CREATING: set before `create()` runs and cleared right after it returns. */
const SCENE_CREATING = 4;

export interface StallWatchdogOptions {
  onStall: () => void;
  stallMs?: number;
  checkMs?: number;
  now?: () => number;
  isVisible?: () => boolean;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

export function createStallWatchdog(options: StallWatchdogOptions) {
  const defaultStallMs = options.stallMs ?? STALL_MS;
  const checkMs = options.checkMs ?? STALL_CHECK_MS;
  const now = options.now ?? (() => Date.now());
  const isVisible =
    options.isVisible ??
    (() =>
      typeof document === "undefined" || document.visibilityState !== "hidden");
  const schedule =
    options.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const cancel =
    options.clearInterval ??
    ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));

  let armed = false;
  let fired = false;
  let stallMs = defaultStallMs;
  let lastBeat = 0;
  let lastCheck = 0;
  let timer: unknown = null;
  let isIdle: () => boolean = () => false;

  const stop = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };

  const check = () => {
    if (!armed || fired) return;
    const t = now();
    const gap = t - lastCheck;
    lastCheck = t;
    // Hidden, paused, or our own timer was throttled (background tab,
    // device sleep): frames were not expected, so start counting afresh.
    if (!isVisible() || isIdle() || gap > checkMs * 3) {
      lastBeat = t;
      return;
    }
    if (t - lastBeat >= stallMs) {
      fired = true;
      stop();
      options.onStall();
    }
  };

  return {
    /**
     * Starts watching; `idle` returns true while frames are not expected.
     * `limitMs` overrides the stall limit for this arming (startup is longer).
     */
    arm(idle?: () => boolean, limitMs?: number) {
      isIdle = idle ?? (() => false);
      stallMs = limitMs ?? defaultStallMs;
      armed = true;
      fired = false;
      lastBeat = lastCheck = now();
      stop();
      timer = schedule(check, checkMs);
    },
    beat() {
      lastBeat = now();
    },
    /** Visibility change or app resume: the gap does not count. */
    reset() {
      lastBeat = lastCheck = now();
    },
    disarm() {
      armed = false;
      stop();
    },
    check,
    get armed() {
      return armed;
    },
    get limitMs() {
      return stallMs;
    },
  };
}

export type StallWatchdog = ReturnType<typeof createStallWatchdog>;

/** The parts of a Phaser scene the guard reads. */
interface GuardedScene {
  sys?: { settings?: { status?: number; key?: string } };
}

/** The parts of a Phaser.Game the guard reads. */
interface GuardedGame {
  isPaused?: boolean;
  pendingDestroy?: boolean;
  loop?: { running?: boolean };
  destroy?: (removeCanvas: boolean, noReturn?: boolean) => unknown;
  runDestroy?: () => unknown;
  scene?: { scenes?: GuardedScene[] } | null;
  events?: {
    on(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
    once(event: string, fn: () => void): unknown;
  };
}

const POST_STEP = "poststep";
const DESTROY = "destroy";

/**
 * Tears down a game whose loop has died. Phaser's `destroy()` only flags
 * `pendingDestroy` and the real teardown runs on the next step, which a
 * stalled loop never takes; without this every TRY AGAIN would leak a
 * WebGL context (browsers allow about 16), Phaser's window and keyboard
 * listeners and the game registry entry. `runDestroy` emits `destroy`,
 * which also drops the game from lib/game/gameRegistry.
 */
export function teardownStalledGame(game: GuardedGame | null): void {
  if (!game) return;
  try {
    game.destroy?.(true);
  } catch {
    // Keep going: runDestroy is what frees the context.
  }
  try {
    if (game.pendingDestroy && typeof game.runDestroy === "function") {
      game.runDestroy();
    }
  } catch {
    // A half-built game can throw while tearing down; nothing more to do.
  }
}

/** The key of a scene left in CREATING, i.e. one whose `create()` threw. */
const creatingSceneKey = (game: GuardedGame): string | null => {
  try {
    const scenes = game.scene?.scenes;
    if (!Array.isArray(scenes)) return null;
    for (const scene of scenes) {
      const settings = scene?.sys?.settings;
      if (settings?.status === SCENE_CREATING) {
        return typeof settings.key === "string" ? settings.key : "scene";
      }
    }
  } catch {
    // A half-built game: nothing to read.
  }
  return null;
};

/**
 * Watches the newest registered Phaser game from its first step: a startup
 * watchdog until GAME_LOADED, the normal one after it, and a check for a
 * scene whose `create()` threw. Follows visibility and app resume. Call once
 * per Game mount; returns the cleanup.
 */
export function installPhaserCrashGuard(
  options: { stallMs?: number; startupStallMs?: number; checkMs?: number } = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const checkMs = options.checkMs ?? STALL_CHECK_MS;
  const startupStallMs = options.startupStallMs ?? STARTUP_STALL_MS;
  let game: GuardedGame | null = null;
  let mode: string | null = null;
  let loaded = false;
  /** A scene seen in CREATING on the previous tick (`create()` is synchronous). */
  let creatingSeen: string | null = null;
  /** Games already watched and given up on: never re-attached. */
  const finished = new WeakSet<object>();

  const isIdle = () =>
    !!game && (!!game.isPaused || game.loop?.running === false || isGameSuspended());

  const fail = (code: "scene_stall" | "scene_start_failed", message: string) => {
    const stall = new Error(message);
    stall.name = code === "scene_stall" ? "SceneStall" : "SceneStartFailed";
    reportAppError(code, stall, {
      source: "watchdog",
      level: "scene",
      scene: mode,
      phase: loaded ? "running" : "startup",
    });
    const dead = game;
    window.dispatchEvent(new CustomEvent(SCENE_STALL_EVENT));
    detach();
    teardownStalledGame(dead);
  };

  const watchdog = createStallWatchdog({
    stallMs: options.stallMs,
    checkMs,
    onStall: () => fail("scene_stall", "Scene stopped rendering"),
  });

  const onStep = () => {
    watchdog.beat();
    // Startup watchdog: armed only once the loop is really stepping.
    if (!loaded && !watchdog.armed) watchdog.arm(isIdle, startupStallMs);
  };

  const detach = () => {
    if (game) {
      finished.add(game);
      game.events?.off(POST_STEP, onStep);
    }
    game = null;
    mode = null;
    loaded = false;
    creatingSeen = null;
    watchdog.disarm();
  };

  const attach = (next: GuardedGame) => {
    detach();
    game = next;
    next.events?.on(POST_STEP, onStep);
    next.events?.once(DESTROY, () => {
      if (game === next) detach();
    });
  };

  /** Picks up a game created since the last tick, before it sends GAME_LOADED. */
  const discover = () => {
    if (game) return;
    const games = getRegisteredGames() as unknown as GuardedGame[];
    for (let i = games.length - 1; i >= 0; i--) {
      const candidate = games[i];
      if (!candidate?.events || candidate.pendingDestroy || finished.has(candidate)) continue;
      attach(candidate);
      return;
    }
  };

  const tick = () => {
    discover();
    if (!game || loaded) return;
    const key = creatingSceneKey(game);
    if (key && key === creatingSeen) {
      mode = key;
      fail("scene_start_failed", "Scene failed to start");
      return;
    }
    creatingSeen = key;
  };
  const ticker = setInterval(tick, checkMs);

  const onLoaded = (event: Event) => {
    const scene = (event as CustomEvent<IGameLoadedEvent | undefined>).detail
      ?.scene;
    const next = scene?.game as unknown as GuardedGame | undefined;
    if (!next?.events) return;
    if (next !== game) attach(next);
    loaded = true;
    creatingSeen = null;
    mode = typeof scene?.scene?.key === "string" ? scene.scene.key : null;
    watchdog.arm(isIdle);
  };

  const reset = () => watchdog.reset();

  window.addEventListener(GameEvent.GAME_LOADED, onLoaded);
  document.addEventListener("visibilitychange", reset);
  window.addEventListener("pageshow", reset);
  window.addEventListener("focus", reset);

  let removeResume: (() => void) | null = null;
  let disposed = false;
  if (Capacitor.isNativePlatform()) {
    void import("@capacitor/app")
      .then(({ App }) => App.addListener("resume", reset))
      .then((handle) => {
        if (disposed) void handle.remove();
        else removeResume = () => void handle.remove();
      })
      .catch(() => {});
  }

  return () => {
    disposed = true;
    clearInterval(ticker);
    detach();
    removeResume?.();
    window.removeEventListener(GameEvent.GAME_LOADED, onLoaded);
    document.removeEventListener("visibilitychange", reset);
    window.removeEventListener("pageshow", reset);
    window.removeEventListener("focus", reset);
  };
}

// WINDOW ERRORS (F9)
// Uncaught errors and unhandled rejections are reported only when they come
// from this origin's scripts. Browser extensions, injected wallets and
// cross-origin scripts ("Script error.") are ignored.

type PageLocation = Pick<Location, "protocol" | "host" | "href">;

/**
 * Compares scheme and host, not `URL.origin`: under the Capacitor iOS
 * scheme (`capacitor://localhost`) the origin of every URL, the page's
 * included, is the opaque "null", so an origin check would drop them all.
 */
export const isSameOrigin = (url: unknown, loc: PageLocation): boolean => {
  if (typeof url !== "string" || !url || !loc.host) return false;
  try {
    const u = new URL(url, loc.href);
    return u.protocol === loc.protocol && u.host === loc.host;
  } catch {
    return false;
  }
};

/** The first URL in a stack trace, if any. */
const firstStackUrl = (stack: unknown): string | null => {
  if (typeof stack !== "string") return null;
  const match = stack.match(/((?:https?|capacitor|ionic):\/\/[^\s)]+?)(?::\d+){0,2}(?:\)|\s|$)/m);
  return match ? match[1] : null;
};

export function installWindowErrorReporting(win: Window = window): () => void {
  const loc = win.location;

  const onError = (event: ErrorEvent) => {
    if (!isSameOrigin(event.filename, loc)) return;
    reportAppError("window_error", event.error ?? event.message, {
      source: "window",
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as { stack?: unknown } | undefined;
    if (!isSameOrigin(firstStackUrl(reason?.stack), loc)) return;
    reportAppError("unhandled_rejection", event.reason, {
      source: "rejection",
    });
  };

  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  return () => {
    win.removeEventListener("error", onError);
    win.removeEventListener("unhandledrejection", onRejection);
  };
}
