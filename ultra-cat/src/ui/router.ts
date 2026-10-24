// Navigation between the menu screens. flow.ts fills in the functions; screens call them (no import cycles).
import type { CatId, LevelId } from '../core/api';

export const go = {
  title: (): void => {},
  map: (_focus?: LevelId): void => {},
  cats: (): void => {},
  intro: (_level: LevelId): void => {},
  /** Start the prepared level (intro PLAY). */
  play: (): void => {},
  /** Same city, same loadout, from scratch. */
  retry: (): void => {},
  pause: (): void => {},
  resume: (): void => {},
  quitToMap: (): void => {},
  settings: (): void => {},
};

/** The loadout of the current / last run. */
export const run = { levelId: 'meowhattan' as LevelId, catId: 'tabby' as CatId };
