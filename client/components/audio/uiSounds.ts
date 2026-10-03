/**
 * The interface sounds (button click and hover), shared by PixelButton and the Settings effects
 * slider. They follow the player's effects volume and mute, and the native system mute: HTML
 * `<audio>` ignores the iOS silent switch on WebViews without the Audio Session API, so there they
 * stay silent, the same rule as music (plan G14 "Audio").
 */
import { cdnFile } from "@/constants/utils";
import { DEFAULT_AUDIO_SETTINGS, effectsGain } from "./settings";
import { applySystemMutePolicy } from "./systemMute";

export type UiSound = "click" | "hover";

/** The pre-G14 volumes: what the click and hover played at before there was an effects slider. */
export const PRE_G14_UI_VOLUME: Readonly<Record<UiSound, number>> = Object.freeze({ click: 0.04, hover: 0.5 });

/**
 * The mix before the player's effects volume, rebased so the default effects volume plays the
 * pre-G14 levels (a click at 0.04, not 0.04 x 0.6). Louder settings go above them, capped at 1.
 */
export const BUTTON_SOUND_BASE: Readonly<Record<UiSound, number>> = Object.freeze({
  click: PRE_G14_UI_VOLUME.click / DEFAULT_AUDIO_SETTINGS.effectsVolume,
  hover: PRE_G14_UI_VOLUME.hover / DEFAULT_AUDIO_SETTINGS.effectsVolume,
});

let systemAllows: boolean | null = null;

/**
 * Whether page audio may play under the platform's system mute rule. Applied once per page: on
 * iOS 16.4+ it also sets the audio session to "ambient".
 */
export function systemAudioAllowed(): boolean {
  if (systemAllows === null) {
    try {
      systemAllows = applySystemMutePolicy();
    } catch {
      systemAllows = true;
    }
  }
  return systemAllows;
}

// One pair of audio elements for the whole page, created on first use so SSR and tests never
// touch Audio.
let audioCache: Record<UiSound, HTMLAudioElement> | null = null;

export function playUiSound(kind: UiSound): void {
  try {
    const gain = effectsGain(BUTTON_SOUND_BASE[kind]);
    if (gain <= 0 || !systemAudioAllowed()) return;
    if (!audioCache) {
      audioCache = {
        click: new Audio(cdnFile("audio/button/click-close.wav")),
        hover: new Audio(cdnFile("audio/button/modern-mix.wav")),
      };
    }
    const el = audioCache[kind];
    el.volume = gain;
    // Rewind so a second click while the sound is still playing is heard.
    el.currentTime = 0;
    const playPromise = el.play();
    if (playPromise) void playPromise.catch(() => {});
  } catch {}
}

/** Test-only reset. */
export function __resetUiSoundsForTests(): void {
  systemAllows = null;
  audioCache = null;
}
