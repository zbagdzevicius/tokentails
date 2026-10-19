/** Player settings and local progress (GDD 2.1, 5.4). Device-only; nothing is sent anywhere. */
import type { RaceClass } from '../../types';
import { load, save } from './storage';

export interface Settings {
  autoGas: boolean;
  oneThumb: boolean;
  reducedMotion: boolean;
  muted: boolean;
  cls: RaceClass;
}

export interface Progress {
  races: number;
  /** highest unlocked class (GDD 5.4) */
  unlocked: RaceClass;
  /** FTUE: times each action was done (hints stop at 2) */
  pounces: number;
  drifts: number;
  bestTimes: Record<string, number>;
}

const inAppWebview = typeof navigator !== 'undefined' && /Instagram|FBAN|FBAV|TikTok|musical_ly|Bytedance/i.test(navigator.userAgent);
const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = { autoGas: false, oneThumb: true, reducedMotion: prefersReduced, muted: inAppWebview, cls: 0 };
export const DEFAULT_PROGRESS: Progress = { races: 0, unlocked: 0, pounces: 0, drifts: 0, bestTimes: {} };

export const loadSettings = (): Settings => load('settings', DEFAULT_SETTINGS);
export const saveSettings = (s: Settings): void => save('settings', s);
export const loadProgress = (): Progress => load('progress', DEFAULT_PROGRESS);
export const saveProgress = (p: Progress): void => save('progress', p);

/** Unlocks after a finish (GDD 5.4): finishing Kitten unlocks Alley Cat; a podium at 100cc unlocks Zoomies. */
export function applyUnlocks(p: Progress, cls: RaceClass, place: number, finished: boolean): RaceClass | null {
  const before = p.unlocked;
  if (finished && cls === 0 && p.unlocked < 1) p.unlocked = 1;
  if (finished && cls === 1 && place <= 3 && p.unlocked < 2) p.unlocked = 2;
  return p.unlocked !== before ? p.unlocked : null;
}
