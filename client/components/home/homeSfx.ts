/**
 * HOME's cat sounds without Phaser (the Cat Yard has no audio of its own): the meow of a hungry cat,
 * the eating crunch and the purr after. Same files and volumes as the Phaser HOME; they follow the
 * effects volume and mute, and the native system mute (plan G14 "Audio").
 */
import { cdnFile } from "@/constants/utils";
import { DEFAULT_AUDIO_SETTINGS, effectsGain } from "@/components/audio/settings";
import { systemAudioAllowed } from "@/components/audio/uiSounds";

export type HomeSound = "meow" | "eat" | "purr";

/** The Phaser HOME's volumes; `eat` was cut at 2 s there too. */
export const HOME_SOUNDS: Readonly<Record<HomeSound, { url: string; volume: number; maxMs?: number }>> = Object.freeze({
  meow: { url: cdnFile("purrquest/sounds/meow.mp3"), volume: 0.3 },
  eat: { url: cdnFile("purrquest/sounds/eat.mp3"), volume: 0.3, maxMs: 2000 },
  purr: { url: cdnFile("purrquest/sounds/purr.mp3"), volume: 0.5 },
});

const cache = new Map<HomeSound, HTMLAudioElement>();

export function playHomeSound(kind: HomeSound): void {
  try {
    const spec = HOME_SOUNDS[kind];
    // Rebased like the button sounds: the default effects volume plays the Phaser HOME's levels.
    const gain = effectsGain(spec.volume / DEFAULT_AUDIO_SETTINGS.effectsVolume);
    if (gain <= 0 || !systemAudioAllowed() || typeof Audio === "undefined") return;
    let el = cache.get(kind);
    if (!el) {
      el = new Audio(spec.url);
      cache.set(kind, el);
    }
    el.volume = Math.min(1, gain);
    el.currentTime = 0;
    const played = el.play();
    if (played && typeof played.catch === "function") played.catch(() => undefined);
    if (spec.maxMs) {
      const node = el;
      setTimeout(() => node.pause(), spec.maxMs);
    }
  } catch {
    // Sound is cosmetic: never break HOME.
  }
}
