/**
 * Up to 5 cats (GDD 6.1 "More than one cat", 9.2, 13.6): the pure state machine behind catMaker.manage.
 * The cat list index is the photo slot (catMaker.loadFace(i) belongs to cats[i]); deleting a cat shifts the later
 * cats down, so the reducer also returns the photo-store moves that keep faces with their cats.
 */
import type { CatSpec } from '../types';
import { MAX_CAT_SLOTS, type PhotoStore } from './photo-store';

export interface CatsState {
  cats: CatSpec[];
  active: number;
  maxCats: number;
}

export type CatsAction =
  | { type: 'switch'; index: number }
  | { type: 'add'; spec: CatSpec }
  | { type: 'replace'; index: number; spec: CatSpec }
  | { type: 'delete'; index: number };

/** Photo-store work that must follow a reducer step: move slot `from` to `to` in order, then clear `clear`. */
export interface SlotEffects {
  moves: [from: number, to: number][];
  clear: number[];
}

export function clampMax(maxCats: number): number {
  return Math.max(1, Math.min(MAX_CAT_SLOTS, Math.floor(Number.isFinite(maxCats) ? maxCats : 1)));
}

export function initCats(cats: readonly CatSpec[], active: number, maxCats: number): CatsState {
  const max = clampMax(maxCats);
  // keep every cat the profile already has (a lapsed Club member keeps their cats, just cannot add more)
  const list = cats.slice(0, MAX_CAT_SLOTS).map((c) => ({ ...c }));
  const a = Number.isInteger(active) && active >= 0 && active < list.length ? active : 0;
  return { cats: list, active: a, maxCats: max };
}

export function canAdd(s: CatsState): boolean {
  return s.cats.length < s.maxCats;
}

/** The slot a new cat goes into (the first free one; slots are dense). -1 when full. */
export function nextSlot(s: CatsState): number {
  return canAdd(s) ? s.cats.length : -1;
}

export function canDelete(s: CatsState): boolean {
  return s.cats.length > 1;
}

export function catsReducer(s: CatsState, a: CatsAction): { state: CatsState; effects: SlotEffects } {
  const none: SlotEffects = { moves: [], clear: [] };
  switch (a.type) {
    case 'switch':
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= s.cats.length) return { state: s, effects: none };
      return { state: { ...s, active: a.index }, effects: none };
    case 'add': {
      if (!canAdd(s)) return { state: s, effects: none };
      const cats = [...s.cats, { ...a.spec }];
      return { state: { ...s, cats, active: cats.length - 1 }, effects: none };
    }
    case 'replace': {
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= s.cats.length) return { state: s, effects: none };
      const cats = s.cats.slice();
      cats[a.index] = { ...a.spec };
      return { state: { ...s, cats }, effects: none };
    }
    case 'delete': {
      const i = a.index;
      if (!canDelete(s) || !Number.isInteger(i) || i < 0 || i >= s.cats.length) return { state: s, effects: none };
      const n = s.cats.length;
      const cats = s.cats.filter((_, j) => j !== i);
      let active = s.active;
      if (active === i) active = Math.min(i, cats.length - 1);
      else if (active > i) active -= 1;
      const moves: [number, number][] = [];
      for (let j = i + 1; j < n; j++) moves.push([j, j - 1]);
      // the deleted slot is forgotten first; after the shift the last slot is free (and cleared by the moves)
      return { state: { ...s, cats, active }, effects: { moves, clear: [i] } };
    }
  }
}

/** Applies a reducer step's photo work to a store: clear first, then the shifts in order. Never throws. */
export async function applySlotEffects(store: Pick<PhotoStore, 'remove' | 'move'>, fx: SlotEffects): Promise<void> {
  for (const c of fx.clear) await store.remove(c).catch(() => undefined);
  for (const [from, to] of fx.moves) await store.move(from, to).catch(() => undefined);
}
