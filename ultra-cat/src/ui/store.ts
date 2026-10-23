// The live save (one copy for the whole UI) and the loadout helper. Owned by the META-UI lane.
import { cats, type CatId, type CatStats, type SaveData } from '../core/api';
import { effectiveStats } from '../cats/stats';
import { loadSave, SAVE_KEY, writeSave } from '../meta/save';

let save: SaveData = loadSave();
let saveOk = true;

export const store = {
  get: (): SaveData => save,
  /** Replace the save and persist it (storage failures are tolerated). */
  set(s: SaveData): void {
    save = s;
    saveOk = writeSave(s);
  },
  /** false when the last write failed (private mode, storage blocked). */
  persisted: () => saveOk,
};

// another tab saved (bought a cat, finished a run): reload, so this tab never writes over it with a stale copy
addEventListener('storage', (e) => {
  if (e.key === SAVE_KEY && e.newValue) save = loadSave();
});

/** The cat to play: the selected one if owned, else the tabby. */
export function selectedCat(): CatId {
  const s = save;
  return cats.has(s.selectedCat) && s.cats[s.selectedCat]?.owned ? s.selectedCat : 'tabby';
}

/** Base stats + this save's upgrades: what session.prepareLevel gets. */
export function loadoutStats(catId: CatId): CatStats {
  return effectiveStats(cats.get(catId).base, save.cats[catId].upgrades);
}
