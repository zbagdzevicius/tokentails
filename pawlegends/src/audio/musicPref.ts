/**
 * The player's Music slider (Settings): 0..1 in browser storage (a convenience only: missing or blocked storage gives
 * the default). It scales every music bus (the theme outside matches, the match layers) on top of the host's music
 * volume; the Sound switch still mutes everything.
 */
import { sfx } from './sfx';

const KEY = 'pawlegends.music.volume';
/** Default: the theme present but under the game. */
export const MUSIC_DEFAULT = 0.7;

export function musicPref(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return localStorage.getItem(KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : MUSIC_DEFAULT;
  } catch {
    return MUSIC_DEFAULT;
  }
}

/** Save and apply at once. */
export function setMusicPref(v: number): void {
  const x = Math.max(0, Math.min(1, Number.isFinite(v) ? v : MUSIC_DEFAULT));
  sfx.setPlayerMusic(x);
  try {
    localStorage.setItem(KEY, String(x));
  } catch {
    /* storage blocked: not remembered */
  }
}

/** On boot: the saved level into the mix. */
export function applyMusicPref(): void {
  sfx.setPlayerMusic(musicPref());
}
