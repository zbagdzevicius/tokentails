/**
 * Registry of live Phaser games, and the suspension that GameModal applies to them (plan F3.5).
 *
 * Every `new Game(...)` site calls `registerGame(game)` right after creating it. The entry clears
 * itself when the game is destroyed (Phaser's `destroy` event), so call sites need no cleanup.
 *
 * While at least one suspension is held (`acquireGameSuspension()`, used by `useSuspendGame`),
 * every registered game has its keyboard off, key capture released, loop asleep and sounds
 * paused. Releasing the last suspension restores exactly what was changed.
 *
 * Independently of modals, key events whose target is a form field (input, textarea, select,
 * contenteditable) never reach Phaser: the game does not react to typing, and Phaser does not
 * `preventDefault` the keys it captures (space, W, A, D, Z, Q, arrows), so they reach the field.
 *
 * The same suspension pauses registered HTML media elements (`registerMediaElement`; lobby and
 * in-game music), unless an audio exemption is held (the audio settings panel, so the player can
 * hear the volume they set). `setGameSoundSettings` applies the effects volume and mute to every
 * game's sound manager (plan G14 "Audio").
 *
 * This module imports nothing from Phaser at runtime (it is used by the landing, SSR and tests).
 * The shapes below are the structural subset of Phaser 4 rc.5 that it touches.
 */

interface KeyboardManagerLike {
  enabled: boolean;
  preventDefault: boolean;
}

interface KeyboardPluginLike {
  enabled: boolean;
  resetKeys?: () => unknown;
  disableGlobalCapture?: () => unknown;
  enableGlobalCapture?: () => unknown;
}

interface SoundLike {
  isPlaying?: boolean;
  pause?: () => unknown;
  resume?: () => unknown;
  once?: (event: string, fn: () => void) => unknown;
}

interface SoundManagerLike {
  getAllPlaying?: () => SoundLike[];
  pauseAll?: () => unknown;
  resumeAll?: () => unknown;
  /** Every new sound goes through `add` (`sound.play(key)` included). */
  add?: (...args: never[]) => SoundLike;
  /** Manager-wide gain and mute (Phaser's BaseSoundManager setters). */
  volume?: number;
  mute?: boolean;
}

interface LoopLike {
  running: boolean;
  sleep: () => unknown;
  wake: (seamless?: boolean) => unknown;
}

interface EventsLike {
  once: (event: string, fn: () => void) => unknown;
}

interface SceneLike {
  input?: { keyboard?: KeyboardPluginLike | null } | null;
}

/** The parts of `Phaser.Game` the registry uses. A real `Phaser.Game` satisfies it. */
export interface RegistrableGame {
  loop: LoopLike;
  events: EventsLike;
  destroy: (removeCanvas: boolean, noReturn?: boolean) => unknown;
  isBooted?: boolean;
  /**
   * False until Phaser starts the loop, which happens after the default textures load, some
   * time after boot. A game created on a loaded page is booted but not yet running.
   */
  isRunning?: boolean;
  input?: { keyboard?: KeyboardManagerLike | null } | null;
  sound?: SoundManagerLike | null;
  scene?: { getScenes?: (isActive?: boolean) => SceneLike[] } | null;
}

/** What one suspension changed on one game, so resuming restores only that. */
interface SuspendedState {
  managerEnabled?: boolean;
  preventDefault?: boolean;
  plugins: Array<{ plugin: KeyboardPluginLike; enabled: boolean }>;
  sleptLoop: boolean;
  /** Sounds paused one by one; `null` when the manager-wide pauseAll was used. */
  sounds: SoundLike[] | null;
  pausedAllSounds: boolean;
  /** The loop had not started yet: it is put to sleep after its first step. */
  pendingSleep: boolean;
  /**
   * The game had not booted, so its keyboard manager was not live yet (its constructor leaves
   * `enabled` false and boot turns it on). The keyboard part is applied after the first step.
   */
  pendingKeyboard: boolean;
  /** The sound manager's own `add`, while new sounds are caught and paused; restored on resume. */
  originalAdd?: SoundManagerLike["add"];
  patchedAdd?: SoundManagerLike["add"];
  /** `add` was an own property (not just the prototype method) before the patch. */
  ownAdd?: boolean;
}

interface Entry {
  game: RegistrableGame;
  suspended: SuspendedState | null;
  /**
   * Set while a form-field key event is passing: the manager values the guard changed, as they
   * were before it (`enabled` for a hidden event, `preventDefault` for a passed-through keyup).
   */
  fieldGuard: FieldGuard | null;
}

interface FieldGuard {
  enabled?: boolean;
  preventDefault?: boolean;
}

const entries = new Map<RegistrableGame, Entry>();
/** Keys pressed outside any form field and not yet released (see `installFieldGuard`). */
const heldKeys = new Set<string>();
let suspensionCount = 0;
let guardInstalled = false;

/** Registers a newly created game. Returns an unregister function (rarely needed). */
export function registerGame<T extends RegistrableGame>(game: T): () => void {
  if (entries.has(game)) return () => unregisterGame(game);
  const entry: Entry = { game, suspended: null, fieldGuard: null };
  entries.set(game, entry);

  // Phaser defers destruction to the next loop step, so a game destroyed while its loop sleeps
  // would never be torn down. Wake it (and drop it from the registry) as soon as destroy is asked.
  const destroy = game.destroy;
  game.destroy = function patchedDestroy(
    this: RegistrableGame,
    ...args: Parameters<RegistrableGame["destroy"]>
  ) {
    const current = entries.get(game);
    // The game is going away: never resume its paused sounds for one last frame.
    if (current?.suspended) {
      current.suspended.sounds = [];
      current.suspended.pausedAllSounds = false;
    }
    unregisterGame(game);
    if (current?.suspended?.sleptLoop || current?.suspended?.pendingSleep) {
      attempt(() => game.loop.wake(true));
    }
    return destroy.apply(this ?? game, args);
  } as RegistrableGame["destroy"];
  attempt(() => game.events.once("destroy", () => unregisterGame(game)));

  installFieldGuard();
  applySoundSettings(game);
  if (suspensionCount > 0) suspendEntry(entry);
  return () => unregisterGame(game);
}

/** Drops a game from the registry, restoring anything a suspension changed on it. */
export function unregisterGame(game: RegistrableGame): void {
  const entry = entries.get(game);
  if (!entry) return;
  entries.delete(game);
  if (entry.suspended) resumeEntry(entry);
}

export function getRegisteredGames(): RegistrableGame[] {
  return Array.from(entries.keys());
}

export function isGameSuspended(): boolean {
  return suspensionCount > 0;
}

/**
 * Suspends every registered game (and any registered later) until the returned release function
 * is called. Suspensions nest: games resume when the last one is released. Releasing twice is a
 * no-op.
 */
export function acquireGameSuspension(): () => void {
  suspensionCount += 1;
  if (suspensionCount === 1) entries.forEach(suspendEntry);
  syncAudioSuspension();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suspensionCount -= 1;
    if (suspensionCount === 0) entries.forEach(resumeEntry);
    syncAudioSuspension();
  };
}

function suspendEntry(entry: Entry): void {
  if (entry.suspended) return;
  const { game } = entry;
  const state: SuspendedState = {
    plugins: [],
    sleptLoop: false,
    sounds: null,
    pausedAllSounds: false,
    pendingSleep: false,
    pendingKeyboard: false,
  };
  entry.suspended = state;

  if (game.isBooted === false) {
    // Saving the pre-boot `enabled` (false) would leave the keyboard dead after the modal.
    state.pendingKeyboard = true;
  } else {
    suspendKeyboard(entry, state);
  }

  if (game.loop?.running) {
    state.sleptLoop = attempt(() => game.loop.sleep());
  } else if (game.isBooted === false || game.isRunning === false) {
    // The loop starts once the game is ready (after boot and the default textures); sleep it
    // after its first step instead.
    state.pendingSleep = true;
  }
  if (state.pendingSleep || state.pendingKeyboard) {
    attempt(() =>
      game.events.once("poststep", () => {
        if (entry.suspended !== state) return;
        if (state.pendingKeyboard) {
          state.pendingKeyboard = false;
          suspendKeyboard(entry, state);
        }
        if (state.pendingSleep && game.loop.running) {
          state.sleptLoop = attempt(() => game.loop.sleep());
        }
        state.pendingSleep = false;
      })
    );
  }

  const sound = game.sound;
  // Pause only what is playing, so resuming never starts a sound the game had paused itself.
  if (sound?.getAllPlaying) {
    const playing = read(() => sound.getAllPlaying!()) ?? [];
    const paused = playing.filter((item) => read(() => item.pause?.()) === true);
    state.sounds = paused;
    catchNewSounds(sound, state, paused);
  } else if (sound?.pauseAll) {
    state.pausedAllSounds = attempt(() => sound.pauseAll!());
  }
}

function suspendKeyboard(entry: Entry, state: SuspendedState): void {
  const { game } = entry;
  const manager = game.input?.keyboard;
  if (manager) {
    // A form-field event may be passing right now: its saved value is the real one.
    state.managerEnabled = entry.fieldGuard?.enabled ?? manager.enabled;
    state.preventDefault = entry.fieldGuard?.preventDefault ?? manager.preventDefault;
    manager.enabled = false;
  }
  const scenes = read(() => game.scene?.getScenes?.(false)) ?? [];
  let captureReleased = false;
  for (const scene of scenes) {
    const plugin = scene?.input?.keyboard;
    if (!plugin) continue;
    state.plugins.push({ plugin, enabled: plugin.enabled });
    // Keys held when the modal opened would stay "down" and keep the cat running on resume.
    attempt(() => plugin.resetKeys?.());
    plugin.enabled = false;
    if (!captureReleased && plugin.disableGlobalCapture) {
      attempt(() => plugin.disableGlobalCapture!());
      captureReleased = true;
    }
  }
  // disableGlobalCapture() clears this flag; set it directly too for games without scenes yet.
  if (manager) manager.preventDefault = false;
}

/**
 * Scenes keep loading while the loop sleeps (the loader is event driven), so a scene's
 * `create()` can start music under the modal. While suspended, every new sound is paused as
 * soon as it plays, and resumed with the rest.
 */
function catchNewSounds(sound: SoundManagerLike, state: SuspendedState, paused: SoundLike[]): void {
  const add = sound.add;
  if (typeof add !== "function") return;
  const patched = function patchedAdd(this: SoundManagerLike, ...args: never[]) {
    const created = add.apply(this ?? sound, args);
    attempt(() =>
      created?.once?.("play", () => {
        if (state.patchedAdd !== patched) return;
        if (read(() => created.pause?.()) === true) paused.push(created);
      })
    );
    return created;
  } as SoundManagerLike["add"];
  state.originalAdd = add;
  state.ownAdd = Object.prototype.hasOwnProperty.call(sound, "add");
  state.patchedAdd = patched;
  sound.add = patched;
}

function resumeEntry(entry: Entry): void {
  const state = entry.suspended;
  if (!state) return;
  entry.suspended = null;
  const { game } = entry;

  const manager = game.input?.keyboard;
  if (manager) {
    if (state.managerEnabled !== undefined) manager.enabled = state.managerEnabled;
    if (state.preventDefault !== undefined) manager.preventDefault = state.preventDefault;
    // A form-field event in flight keeps what the guard changed until it has passed.
    const guard = entry.fieldGuard;
    if (guard) {
      if (guard.enabled !== undefined) {
        guard.enabled = manager.enabled;
        manager.enabled = false;
      }
      if (guard.preventDefault !== undefined) {
        guard.preventDefault = manager.preventDefault;
        manager.preventDefault = false;
      }
    }
  }
  let captureRestored = false;
  for (const { plugin, enabled } of state.plugins) {
    plugin.enabled = enabled;
    if (!captureRestored && state.preventDefault && plugin.enableGlobalCapture) {
      attempt(() => plugin.enableGlobalCapture!());
      captureRestored = true;
    }
  }

  state.pendingSleep = false;
  state.pendingKeyboard = false;
  // Seamless, so the first step after a long modal does not see a huge delta.
  if (state.sleptLoop) attempt(() => game.loop.wake(true));

  const sound = game.sound;
  if (sound && state.patchedAdd) {
    // Only undo our own patch; someone who wrapped `add` after us keeps theirs.
    if (sound.add === state.patchedAdd) {
      if (state.ownAdd) sound.add = state.originalAdd;
      else delete sound.add;
    }
    state.patchedAdd = undefined;
    state.originalAdd = undefined;
  }
  if (state.sounds) {
    for (const item of state.sounds) attempt(() => item.resume?.());
  } else if (state.pausedAllSounds) {
    attempt(() => game.sound?.resumeAll?.());
  }
}

/** True for elements where keys mean text entry or form control, not game input. */
export function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const element = target as HTMLElement;
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (element.isContentEditable) return true;
  const editable = element.getAttribute?.("contenteditable");
  return editable === "" || editable === "true" || editable === "plaintext-only";
}

/** Identifies a physical key across keydown/keyup (shift or layout may change `key`). */
function keyId(event: KeyboardEvent): string {
  return event.code || (event.key ?? "").toLowerCase() || String(event.keyCode);
}

/**
 * Phaser listens for keys on `window` in the bubble phase and returns early when its manager is
 * disabled. A capture-phase listener on `window` runs before it and, for a form-field target:
 * - keydown, and a keyup the game never saw pressed: turns the managers off for this one event,
 *   so the game neither reacts nor `preventDefault`s the key;
 * - keyup of a key pressed outside the field (hold D to run, then click into an input and let
 *   go): lets Phaser see it, so the key does not stay "down", but turns `preventDefault` off for
 *   this one event, so a space keyup still toggles a focused checkbox or radio.
 * A bubble-phase listener added after Phaser's restores the managers (with a timer as a fallback
 * when propagation is stopped on the way).
 */
function installFieldGuard(): void {
  if (guardInstalled || typeof window === "undefined") return;
  guardInstalled = true;
  const onKey = (event: KeyboardEvent) => {
    const id = keyId(event);
    const isKeyUp = event.type === "keyup";
    const wasHeld = heldKeys.has(id);
    if (isKeyUp) heldKeys.delete(id);
    if (!isFormFieldTarget(event.target)) {
      if (!isKeyUp) heldKeys.add(id);
      return;
    }
    const passKeyUp = isKeyUp && wasHeld;
    const guarded: Entry[] = [];
    entries.forEach((entry) => {
      const manager = entry.game.input?.keyboard;
      if (!manager || entry.fieldGuard) return;
      if (passKeyUp) {
        entry.fieldGuard = { preventDefault: manager.preventDefault };
        manager.preventDefault = false;
      } else {
        entry.fieldGuard = { enabled: manager.enabled };
        manager.enabled = false;
      }
      guarded.push(entry);
    });
    if (guarded.length === 0) return;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      window.removeEventListener(event.type, restore);
      for (const entry of guarded) {
        const guard = entry.fieldGuard;
        entry.fieldGuard = null;
        const manager = entry.game.input?.keyboard;
        // A suspension that began during the event owns the flags now.
        if (!guard || !manager || entry.suspended || !entries.has(entry.game)) continue;
        if (guard.enabled !== undefined) manager.enabled = guard.enabled;
        if (guard.preventDefault !== undefined) manager.preventDefault = guard.preventDefault;
      }
    };
    window.addEventListener(event.type, restore);
    setTimeout(restore, 0);
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  // Keys released while the window has no focus never send a keyup here.
  window.addEventListener("blur", () => heldKeys.clear());
}

/* ------------------------------------------------------------------------------------------------
 * DOM audio (plan G14 "Audio"): the suspension also pauses HTML media elements (lobby and in-game
 * music), and the audio settings reach every Phaser sound manager.
 * --------------------------------------------------------------------------------------------- */

/** The parts of `HTMLMediaElement` the registry uses. */
export interface SuspendableMedia {
  readonly paused: boolean;
  pause: () => unknown;
  play: () => Promise<unknown> | unknown;
}

interface MediaEntry {
  /** Paused by a suspension (it was playing), so resuming plays it again. */
  pausedBySuspension: boolean;
  /** Asked at resume time; false keeps the element paused (muted since, tab hidden, ...). */
  shouldResume?: () => boolean;
}

const mediaEntries = new Map<SuspendableMedia, MediaEntry>();
const audioListeners = new Set<(suspended: boolean) => void>();
let audioExemptions = 0;
let audioSuspended = false;
let soundSettings: { volume: number; mute: boolean } | null = null;

/**
 * True while a suspension holds DOM audio paused: a GameModal is open and no audio exemption is
 * held. Music players check this before calling `play()`.
 */
export function isAudioSuspended(): boolean {
  return audioSuspended;
}

/**
 * Registers an HTML media element so suspensions pause it. On release it plays again only if a
 * suspension paused it and `shouldResume` (when given) still says so. If a suspension is already
 * held and the element is playing, it is paused now.
 */
export function registerMediaElement(
  element: SuspendableMedia,
  options: { shouldResume?: () => boolean } = {}
): () => void {
  const existing = mediaEntries.get(element);
  if (existing) {
    existing.shouldResume = options.shouldResume;
  } else {
    const entry: MediaEntry = { pausedBySuspension: false, shouldResume: options.shouldResume };
    mediaEntries.set(element, entry);
    if (audioSuspended) pauseMedia(element, entry);
  }
  return () => {
    mediaEntries.delete(element);
  };
}

/** Called with the new state whenever DOM audio suspension starts or ends. */
export function subscribeAudioSuspension(listener: (suspended: boolean) => void): () => void {
  audioListeners.add(listener);
  return () => {
    audioListeners.delete(listener);
  };
}

/**
 * Keeps DOM audio playing through suspensions while held: the audio settings panel holds one, so
 * a player hears the volume they set. Games still suspend. Nests like suspensions.
 */
export function exemptAudioFromSuspension(): () => void {
  audioExemptions += 1;
  syncAudioSuspension();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    audioExemptions -= 1;
    syncAudioSuspension();
  };
}

/**
 * Manager-wide effects gain and mute for every registered Phaser game, and every game registered
 * later. `null` stops applying (games keep what they have).
 */
export function setGameSoundSettings(settings: { volume: number; mute: boolean } | null): void {
  soundSettings = settings ? { volume: clamp01(settings.volume), mute: !!settings.mute } : null;
  entries.forEach((entry) => applySoundSettings(entry.game));
}

function applySoundSettings(game: RegistrableGame): void {
  const sound = game.sound;
  if (!soundSettings || !sound) return;
  const { volume, mute } = soundSettings;
  attempt(() => {
    if (sound.volume !== volume) sound.volume = volume;
    if (sound.mute !== mute) sound.mute = mute;
  });
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function syncAudioSuspension(): void {
  const next = suspensionCount > 0 && audioExemptions === 0;
  if (next === audioSuspended) return;
  audioSuspended = next;
  mediaEntries.forEach((entry, element) => {
    if (next) pauseMedia(element, entry);
    else resumeMedia(element, entry);
  });
  audioListeners.forEach((listener) => attempt(() => listener(next)));
}

function pauseMedia(element: SuspendableMedia, entry: MediaEntry): void {
  if (read(() => element.paused) !== false) return;
  entry.pausedBySuspension = attempt(() => element.pause());
}

function resumeMedia(element: SuspendableMedia, entry: MediaEntry): void {
  if (!entry.pausedBySuspension) return;
  entry.pausedBySuspension = false;
  if (entry.shouldResume && read(() => entry.shouldResume!()) !== true) return;
  attempt(() => {
    const result = element.play();
    // Autoplay can still refuse (no activation in this document): the player retries on input.
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch(() => {});
    }
  });
}

/** Runs `fn`; false if it threw. A half-destroyed game must never break a modal. */
function attempt(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

function read<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    warn(error);
    return undefined;
  }
}

function warn(error: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn("[gameRegistry]", error);
}

/** Test-only reset. */
export function __resetGameRegistryForTests(): void {
  entries.clear();
  heldKeys.clear();
  suspensionCount = 0;
  mediaEntries.clear();
  audioListeners.clear();
  audioExemptions = 0;
  audioSuspended = false;
  soundSettings = null;
}
