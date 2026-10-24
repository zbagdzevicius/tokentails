// The Wardrobe's live state (browser): the equipped look (cached per save object, so per-frame portrait draws
// allocate nothing), ownership with the dev "own everything" switch (memory only, never saved), and the one save
// write this lane makes (save.wardrobe, through flow's setSave on the live save binding).
import type { SaveData } from '../meta/save';
import { save, setSave } from '../ui/flow';
import { ALL_ITEMS, CATALOG, type Item } from './catalog';
import { DEFAULT_LOOK, decodeLook, encodeLook, LOOK_SLOTS, type Look } from './look';
import { isOwned, newlyOwned, normalizeLook, ownedKeys, progress, type Progress } from './unlocks';

let devAll = false;
let cacheSave: SaveData | null = null;
let cacheDev = false;
let cached: Readonly<Look> = DEFAULT_LOOK;
const listeners: ((l: Readonly<Look>) => void)[] = [];

/** the equipped look (owned items only; the same object until the save or the dev switch changes) */
export function equipped(): Readonly<Look> {
  if (save !== cacheSave || devAll !== cacheDev) {
    cacheSave = save;
    cacheDev = devAll;
    cached = Object.freeze(normalizeLook(decodeLook(save.wardrobe?.look), devAll ? undefined : save));
  }
  return cached;
}
export const equippedCode = () => encodeLook(equipped());

export function setDevOwnAll(on: boolean): void {
  devAll = !!on;
  notify();
}
export const devOwnAll = () => devAll;

export const progressNow = (): Progress => progress(save);
export function owns(item: Item, p: Progress = progressNow()): boolean {
  return devAll || isOwned(item, p);
}
export function ownedNow(): string[] {
  return devAll ? ALL_ITEMS.map((it) => it.key) : ownedKeys(save);
}
/** NEW items: owned, not seen yet (classic items never count) */
export function newNow(): Item[] {
  if (!devAll) return newlyOwned(save);
  const seen = new Set(save.wardrobe?.seen ?? []);
  return ALL_ITEMS.filter((it) => it.index > 0 && !seen.has(it.key));
}

/** listen to equipped-look changes (DONE, equip); returns an unsubscribe */
export function onLookChange(fn: (l: Readonly<Look>) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}
function notify(): void {
  const l = equipped();
  for (const fn of listeners.slice()) {
    try {
      fn(l);
    } catch (err) {
      console.error('wardrobe look listener failed', err);
    }
  }
}

/**
 * Save a look as the equipped one. Unowned slots keep what was equipped before (a locked try-on never sticks).
 * markSeen = every owned item counts as seen (the NEW badges clear). Returns the slots that were locked.
 */
export function saveLook(look: Look, markSeen: boolean): string[] {
  const live = save;
  const p = progress(live);
  const prev = equipped();
  const out = { ...look };
  const locked: string[] = [];
  for (const slot of LOOK_SLOTS) {
    const it = CATALOG[slot][out[slot]] ?? CATALOG[slot][0];
    if (!owns(it, p)) {
      locked.push(slot);
      out[slot] = prev[slot];
    }
  }
  const seen = markSeen ? [...new Set([...(live.wardrobe?.seen ?? []), ...ownedNow()])] : (live.wardrobe?.seen ?? []);
  setSave({ ...live, wardrobe: { ...live.wardrobe, look: encodeLook(out), seen } });
  notify();
  return locked;
}

/** dev / test: store a code as is (still normalised to the catalogue on read) */
export function equipCode(code: string): void {
  const live = save;
  const l = normalizeLook(decodeLook(code));
  setSave({ ...live, wardrobe: { ...live.wardrobe, look: encodeLook(l) } });
  notify();
}
