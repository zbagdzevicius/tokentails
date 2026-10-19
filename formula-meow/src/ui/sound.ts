/**
 * UI sound facade (audio-ui lane): screens and the results panel call `uiSound(id)` without knowing about the audio
 * engine; the audio-ui install points it at the race audio's UI bus. Before that (tests, a page without audio) it is
 * a no-op.
 */
import type { UiSoundId } from '../juice/audio/stings';

export type { UiSoundId };

let player: ((id: UiSoundId, n?: number) => void) | null = null;

export function setUiSoundPlayer(fn: ((id: UiSoundId, n?: number) => void) | null): void {
  player = fn;
}

export function uiSound(id: UiSoundId, n = 0): void {
  try {
    player?.(id, n);
  } catch {
    /* a sound never breaks a screen */
  }
}
