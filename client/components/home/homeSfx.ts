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
/** The pending cut per sound: a replay clears it, or the old timer would stop the new play early. */
const cuts = new Map<HomeSound, ReturnType<typeof setTimeout>>();

function cachedElement(kind: HomeSound): HTMLAudioElement {
  let el = cache.get(kind);
  if (!el) {
    el = new Audio(HOME_SOUNDS[kind].url);
    cache.set(kind, el);
  }
  return el;
}

export function playHomeSound(kind: HomeSound): void {
  try {
    const spec = HOME_SOUNDS[kind];
    // Rebased like the button sounds: the default effects volume plays the Phaser HOME's levels.
    const gain = effectsGain(spec.volume / DEFAULT_AUDIO_SETTINGS.effectsVolume);
    if (gain <= 0 || !systemAudioAllowed() || typeof Audio === "undefined") return;
    const el = cachedElement(kind);
    const pending = cuts.get(kind);
    if (pending !== undefined) {
      clearTimeout(pending);
      cuts.delete(kind);
    }
    el.volume = Math.min(1, gain);
    // A prime still in flight (primeHomeSounds) left it muted: this play is the real one.
    el.muted = false;
    el.currentTime = 0;
    const played = el.play();
    if (played && typeof played.catch === "function") played.catch(() => undefined);
    if (spec.maxMs) {
      const node = el;
      cuts.set(
        kind,
        setTimeout(() => {
          cuts.delete(kind);
          node.pause();
        }, spec.maxMs),
      );
    }
  } catch {
    // Sound is cosmetic: never break HOME.
  }
}

/**
 * Unlocks `kinds` for a later `playHomeSound` that is not inside a gesture (iOS plays an element only
 * once a gesture has played it). Call it from the tap handler: it creates or reuses the cached
 * elements, plays them muted, then pauses, rewinds and unmutes them. It skips an element that is
 * already playing, and does nothing (no download) while the effects volume or the system mute
 * silences the sounds. It never throws (`/yourcat` S1, docs/plans/yourcat-polish.md §4).
 */
export function primeHomeSounds(kinds: HomeSound[]): void {
  try {
    if (typeof Audio === "undefined" || !systemAudioAllowed()) return;
    for (const kind of kinds) {
      try {
        const spec = HOME_SOUNDS[kind];
        if (!spec || effectsGain(spec.volume / DEFAULT_AUDIO_SETTINGS.effectsVolume) <= 0) continue;
        const el = cachedElement(kind);
        if (!el.paused) continue;
        el.muted = true;
        const settle = () => {
          try {
            // A real play since the prime (the reveal's meow) unmuted and restarted it: leave it be.
            if (!el.muted) return;
            el.pause();
            el.currentTime = 0;
          } catch {
            // Ignore: the element is only being unlocked.
          } finally {
            el.muted = false;
          }
        };
        let played: Promise<void> | undefined;
        try {
          played = el.play();
        } catch {
          el.muted = false;
          continue;
        }
        if (played && typeof played.then === "function") played.then(settle, settle);
        else settle();
      } catch {
        // One sound failing to unlock must not stop the others.
      }
    }
  } catch {
    // Sound is cosmetic: never break the tap that primes it.
  }
}
