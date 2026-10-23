/**
 * Player settings and local progress (GDD 2.1, 5.4): thin wrappers over the versioned save (save.ts). Device-only.
 */
import type { RaceClass } from '../../types';
import { coreSlot, DEFAULT_PROGRESS, DEFAULT_SETTINGS, save, type Progress, type Settings } from './save';

export type { Progress, Settings } from './save';
export { DEFAULT_PROGRESS, DEFAULT_SETTINGS };

export const loadSettings = (): Settings => ({ ...save.settings() });
export const saveSettings = (s: Settings): void => void save.setSettings(s);
export const loadProgress = (): Progress => coreSlot().get();
export const saveProgress = (p: Progress): void => coreSlot().set(p);

/** Unlocks after a finish (GDD 5.4): finishing Kitten unlocks Alley Cat; a podium at 100cc unlocks Zoomies. */
export function applyUnlocks(p: Progress, cls: RaceClass, place: number, finished: boolean): RaceClass | null {
  const before = p.unlocked;
  if (finished && cls === 0 && p.unlocked < 1) p.unlocked = 1;
  if (finished && cls === 1 && place <= 3 && p.unlocked < 2) p.unlocked = 2;
  return p.unlocked !== before ? p.unlocked : null;
}
