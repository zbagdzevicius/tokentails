/**
 * The one music player for the game shell (plan G14 "Audio"). Lobby music and in-game music go
 * through it, so there is only ever one music element.
 *
 * Music plays only when all of these hold:
 * - the page has had a user input (autoplay policy). The `<audio>` element and its file are not
 *   created or fetched before that input;
 * - a track is set and the settings give it a gain above 0 (not muted);
 * - no GameModal suspension holds DOM audio (`lib/game/gameRegistry`, F3.5);
 * - the document is visible;
 * - the system mute can be honoured (`systemMute.ts`; iOS WebViews without the Audio Session API).
 *
 * Effects follow the same settings: the engine pushes the effects gain and mute to every Phaser
 * sound manager through the registry.
 */
import {
  isAudioSuspended,
  registerMediaElement,
  setGameSoundSettings,
  subscribeAudioSuspension,
} from "@/lib/game/gameRegistry";
import { getAudioSettings, musicGain, subscribeAudioSettings, type AudioSettings } from "./settings";
import { systemAudioAllowed } from "./uiSounds";

export interface MusicElement {
  src: string;
  loop: boolean;
  volume: number;
  preload: string;
  readonly paused: boolean;
  currentTime: number;
  play: () => Promise<unknown> | unknown;
  pause: () => unknown;
  load?: () => unknown;
  removeAttribute?: (name: string) => unknown;
}

export interface MusicEngineDeps {
  createElement: () => MusicElement;
  doc: Pick<Document, "addEventListener" | "removeEventListener"> & { hidden?: boolean };
  win: Pick<Window, "addEventListener" | "removeEventListener">;
  /** Whether the document already has sticky user activation (`navigator.userActivation`). */
  hasBeenActive?: () => boolean;
  systemMuteAllows?: () => boolean;
}

/** Inputs that grant user activation (keydown, mousedown/pointerdown with a mouse, touchend, click). */
const ACTIVATION_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;

export class MusicEngine {
  private element: MusicElement | null = null;
  private track: string | null = null;
  private unlocked = false;
  private started = false;
  private systemAllows = true;
  private readonly cleanups: Array<() => void> = [];
  private unregisterMedia: (() => void) | null = null;

  constructor(private readonly deps: MusicEngineDeps) {}

  /** Installs the listeners. Safe to call once per engine. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.systemAllows = this.deps.systemMuteAllows ? this.deps.systemMuteAllows() : true;
    if (this.deps.hasBeenActive?.()) this.unlocked = true;
    this.listenForInput();

    const onVisibility = () => this.update();
    this.deps.doc.addEventListener("visibilitychange", onVisibility);
    this.cleanups.push(() => this.deps.doc.removeEventListener("visibilitychange", onVisibility));
    // iOS Safari and WebViews sometimes skip visibilitychange on app switch; pagehide/pageshow cover it.
    this.deps.win.addEventListener("pagehide", onVisibility);
    this.deps.win.addEventListener("pageshow", onVisibility);
    this.cleanups.push(() => {
      this.deps.win.removeEventListener("pagehide", onVisibility);
      this.deps.win.removeEventListener("pageshow", onVisibility);
    });

    this.cleanups.push(subscribeAudioSuspension(() => this.update()));
    this.cleanups.push(
      subscribeAudioSettings((settings) => {
        this.pushEffects(settings);
        this.update();
      })
    );
    this.pushEffects(getAudioSettings());
    this.update();
  }

  stop(): void {
    this.cleanups.splice(0).forEach((fn) => fn());
    this.started = false;
    this.unregisterMedia?.();
    this.unregisterMedia = null;
    if (this.element) {
      try {
        this.element.pause();
      } catch {
        // ignore
      }
    }
    this.element = null;
    setGameSoundSettings(null);
  }

  /** The track to loop, or null for silence. Changing it restarts from the beginning. */
  setTrack(src: string | null): void {
    if (src === this.track) return;
    this.track = src;
    const el = this.element;
    if (el) {
      try {
        el.pause();
        if (src) {
          el.src = src;
          el.currentTime = 0;
        } else {
          el.removeAttribute?.("src");
          el.load?.();
        }
      } catch {
        // ignore
      }
    }
    this.update();
  }

  /** True when every condition for playing holds (see the module comment). */
  shouldPlay(): boolean {
    return (
      this.unlocked &&
      !!this.track &&
      this.systemAllows &&
      musicGain(getAudioSettings()) > 0 &&
      !isAudioSuspended() &&
      !this.deps.doc.hidden
    );
  }

  /** False when the system mute rule keeps music off on this device (`systemMute.ts`). */
  get musicAvailable(): boolean {
    return this.systemAllows;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  get currentElement(): MusicElement | null {
    return this.element;
  }

  /**
   * Every activating input unlocks and re-checks, so a play() the browser refused (or a load that
   * was aborted) is retried on the next tap or key.
   */
  private listenForInput(): void {
    const onInput = (event: Event) => {
      this.unlocked = true;
      // A sound control's own handler changes the settings next, and that change re-checks. Doing
      // it here first would create the element and start the download, only for a mute to stop it.
      const target = event?.target as Element | null | undefined;
      if (typeof target?.closest === "function" && target.closest("[data-audio-control]")) return;
      this.update();
    };
    for (const type of ACTIVATION_EVENTS) {
      this.deps.win.addEventListener(type, onInput, { capture: true, passive: true });
    }
    this.cleanups.push(() => {
      for (const type of ACTIVATION_EVENTS) {
        this.deps.win.removeEventListener(type, onInput, { capture: true });
      }
    });
  }

  private ensureElement(): MusicElement | null {
    if (this.element || !this.track) return this.element;
    try {
      const el = this.deps.createElement();
      el.loop = true;
      el.preload = "auto";
      el.src = this.track;
      this.element = el;
      this.unregisterMedia = registerMediaElement(el, { shouldResume: () => this.shouldPlay() });
    } catch {
      this.element = null;
    }
    return this.element;
  }

  private pushEffects(settings: AudioSettings): void {
    setGameSoundSettings({ volume: settings.effectsVolume, mute: settings.muted });
  }

  update(): void {
    const play = this.shouldPlay();
    const el = play ? this.ensureElement() : this.element;
    if (!el) return;
    try {
      el.volume = musicGain(getAudioSettings());
    } catch {
      // ignore
    }
    if (play) {
      if (!el.paused) return;
      try {
        const result = el.play();
        if (result && typeof (result as Promise<unknown>).catch === "function") {
          // Refused by the autoplay policy: wait for the next input. An AbortError (paused or
          // re-sourced while starting) is not a refusal and changes nothing.
          (result as Promise<unknown>).catch((error: unknown) => {
            if ((error as { name?: string } | null)?.name === "NotAllowedError") this.unlocked = false;
          });
        }
      } catch {
        this.unlocked = false;
      }
    } else if (!el.paused) {
      try {
        el.pause();
      } catch {
        // ignore
      }
    }
  }
}

let shared: MusicEngine | null = null;
let users = 0;

/** The page's engine, created on first use in the browser. */
export function acquireMusicEngine(): MusicEngine | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (!shared) {
    shared = new MusicEngine({
      createElement: () => new Audio() as MusicElement,
      doc: document,
      win: window,
      hasBeenActive: () => {
        try {
          return !!(navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation
            ?.hasBeenActive;
        } catch {
          return false;
        }
      },
      systemMuteAllows: () => systemAudioAllowed(),
    });
  }
  users += 1;
  shared.start();
  return shared;
}

/** Drops one user; the last one stops the engine (its element is paused and released). */
export function releaseMusicEngine(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && shared) {
    shared.stop();
    shared = null;
  }
}

/** Test-only reset. */
export function __resetMusicEngineForTests(): void {
  shared?.stop();
  shared = null;
  users = 0;
}
