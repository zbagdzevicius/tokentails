/**
 * Audio settings (plan G14 "Audio"): music volume, effects volume and one mute, per device.
 *
 * Persisted in `localStorage` under `STORAGE_KEY`. Every read and write is wrapped in try/catch:
 * private windows, blocked site data and previews can throw or return nothing, and then the
 * defaults apply and changes live for this page only. Other tabs follow through the `storage`
 * event. The pre-G14 `gameMusic` flag (`false` = music off) is honoured once as `muted: true`.
 *
 * No React and no DOM at import time, so the store is safe in SSR and tests.
 */

export interface AudioSettings {
  /** 0..1, the lobby and in-game music. */
  musicVolume: number;
  /** 0..1, button clicks and every Phaser sound. */
  effectsVolume: number;
  /** One switch for all sound. */
  muted: boolean;
}

/** Replaces the 0.05 the old music player hard-coded (plan G14). */
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  musicVolume: 0.4,
  effectsVolume: 0.6,
  muted: false,
});

export const STORAGE_KEY = "tt:audio:v1";
/** The old music toggle's key (GameMusicToggler before G14). */
export const LEGACY_MUSIC_KEY = "gameMusic";

type Listener = (settings: AudioSettings) => void;

let current: AudioSettings | null = null;
const listeners = new Set<Listener>();
let storageListenerInstalled = false;

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  // Two decimals: a slider step never leaves 0.30000000000000004 in storage.
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/** Validates a stored or incoming value, filling anything missing or wrong from the defaults. */
export function normalizeAudioSettings(raw: unknown): AudioSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AudioSettings, unknown>>;
  return {
    musicVolume: clampVolume(value.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    effectsVolume: clampVolume(value.effectsVolume, DEFAULT_AUDIO_SETTINGS.effectsVolume),
    muted: typeof value.muted === "boolean" ? value.muted : DEFAULT_AUDIO_SETTINGS.muted,
  };
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStored(): AudioSettings {
  try {
    const storage = getStorage();
    if (!storage) return { ...DEFAULT_AUDIO_SETTINGS };
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) return normalizeAudioSettings(JSON.parse(raw));
    const legacy = storage.getItem(LEGACY_MUSIC_KEY);
    if (legacy === "false") return { ...DEFAULT_AUDIO_SETTINGS, muted: true };
  } catch {
    // Unreadable or corrupt: the defaults.
  }
  return { ...DEFAULT_AUDIO_SETTINGS };
}

function writeStored(settings: AudioSettings): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

function same(a: AudioSettings, b: AudioSettings): boolean {
  return a.musicVolume === b.musicVolume && a.effectsVolume === b.effectsVolume && a.muted === b.muted;
}

function emit(settings: AudioSettings) {
  listeners.forEach((listener) => {
    try {
      listener(settings);
    } catch {
      // One broken subscriber never stops the others.
    }
  });
}

function installStorageListener() {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const next = readStored();
    if (current && same(current, next)) return;
    current = next;
    emit(next);
  });
}

/** The current settings (read from storage on first use). */
export function getAudioSettings(): AudioSettings {
  if (!current) {
    current = readStored();
    installStorageListener();
  }
  return current;
}

/** Merges `patch` into the settings, persists them (best effort) and notifies subscribers. */
export function setAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const prev = getAudioSettings();
  const next = normalizeAudioSettings({ ...prev, ...patch });
  if (same(prev, next)) return prev;
  current = next;
  writeStored(next);
  emit(next);
  return next;
}

export function setMuted(muted: boolean): AudioSettings {
  return setAudioSettings({ muted });
}

export function toggleMuted(): AudioSettings {
  return setMuted(!getAudioSettings().muted);
}

export function subscribeAudioSettings(listener: Listener): () => void {
  getAudioSettings();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Effective music gain: 0 when muted. */
export function musicGain(settings: AudioSettings = getAudioSettings()): number {
  return settings.muted ? 0 : settings.musicVolume;
}

/**
 * Effective gain for an effect authored at `base` (a button click at 0.04, say): the effects
 * volume is a master gain over the authored mix, the same for DOM one-shots and every Phaser
 * sound manager. 0 when muted. Clamped to 0..1.
 */
export function effectsGain(base = 1, settings: AudioSettings = getAudioSettings()): number {
  if (settings.muted) return 0;
  return Math.min(1, Math.max(0, base * settings.effectsVolume));
}

/** Test-only reset. */
export function __resetAudioSettingsForTests(): void {
  current = null;
  listeners.clear();
}
