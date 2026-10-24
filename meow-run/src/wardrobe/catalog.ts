// The Wardrobe catalogue (pure, node-importable). One list per look slot; an item's index is its position and is
// what look codes store (src/wardrobe/look.ts), so the lists are APPEND-ONLY: never reorder, never delete (a code made
// today must decode to the same items forever). Index 0 of every slot is Mochi's classic look. At most 36 per slot
// (one base-36 digit). Everything is procedural: colours here, meshes in src/cat/dress.ts, 2D in paint2d.ts.
import { mix, shade } from './color';
import { LOOK_MAX_INDEX, LOOK_SLOTS, type LookSlot } from './look';

/** lifetime counters the unlock rules read (src/wardrobe/unlocks.ts computes them from the save) */
export type Counter =
  | 'stars'
  | 'bells'
  | 'fish'
  | 'distance'
  | 'endlessDist'
  | 'chain'
  | 'tricks'
  | 'daily'
  | 'challengesWon'
  | 'trailsFinished'
  | 'clips'
  | 'photos'
  | 'shares';
export const COUNTERS: readonly Counter[] = ['stars', 'bells', 'fish', 'distance', 'endlessDist', 'chain', 'tricks', 'daily', 'challengesWon', 'trailsFinished', 'clips', 'photos', 'shares'];

export type Unlock = { kind: 'free' } | { kind: Counter; n: number };

export interface Item {
  /** stable id, e.g. 'hat.crown' (save.wardrobe.seen stores these) */
  key: string;
  slot: LookSlot;
  /** position in its slot list = the digit in look codes */
  index: number;
  name: string;
  /**
   * fur: [base, dark (stripes / spots), belly (white parts), fleck light, fleck dark];
   * eyes: [left iris, right iris, sparkle]; hats, scarves, fx: their palette (main colour first)
   */
  colors: readonly number[];
  unlock: Unlock;
  /** 'specks' = star specks in the fur (galaxy) */
  tags?: readonly string[];
}

const FREE: Unlock = { kind: 'free' };
const need = (kind: Counter, n: number): Unlock => ({ kind, n });

/** fur colours: base, dark, belly; the fur flecks are derived (classic keeps its hand-picked flecks) */
const furCols = (base: number, dark: number, belly: number, fl?: number, fd?: number): number[] => [base, dark, belly, fl ?? mix(base, 0xffe6b0, 0.45), fd ?? shade(dark, -0.15)];

type Def = [key: string, name: string, colors: number[], unlock: Unlock, tags?: string[]];

const DEFS: Record<LookSlot, Def[]> = {
  fur: [
    ['classic', 'Classic orange', furCols(0xf7953a, 0xcf5f1c, 0xfff7ec, 0xffc878, 0xbe5a14), FREE],
    ['cream', 'Cream', furCols(0xf6dcae, 0xd9ad72, 0xfffaf0), FREE],
    ['silver', 'Silver', furCols(0xc8ccd6, 0x7c828f, 0xffffff), need('stars', 3)],
    ['midnight', 'Midnight', furCols(0x3a3d55, 0x1c1d2b, 0xefeaf6, 0x5a5f80, 0x15161f), need('bells', 7)],
    ['snow', 'Snow', furCols(0xfdfdff, 0xd9deea, 0xffffff, 0xffffff, 0xc9d0e0), need('fish', 200)],
    ['chocolate', 'Chocolate', furCols(0x86512f, 0x52301b, 0xf4e2cc), need('distance', 5000)],
    ['smoky', 'Smoky blue', furCols(0x8c9db8, 0x5d6c88, 0xeef2f8), need('daily', 3)],
    ['strawberry', 'Strawberry', furCols(0xffa3bb, 0xe96b90, 0xfff3f6), need('shares', 3)],
    ['galaxy', 'Galaxy', furCols(0x46297a, 0x24134a, 0xcdb9ff, 0x6a4aa8, 0x1b0e38), need('stars', 9), ['specks']],
  ],
  pattern: [
    ['tabby', 'Tabby stripes', [], FREE],
    ['solid', 'Solid', [], FREE],
    ['spots', 'Spots', [], need('tricks', 25)],
    ['socks', 'Socks', [], need('fish', 50)],
    ['patches', 'Patches', [], need('photos', 3)],
    ['tuxedo', 'Tuxedo', [], need('stars', 6)],
  ],
  eyes: [
    ['classic', 'Classic', [0x2a1a14, 0x2a1a14, 0xffffff], FREE],
    ['emerald', 'Emerald', [0x17a05a, 0x17a05a, 0xffffff], FREE],
    ['sky', 'Sky', [0x2b8fe8, 0x2b8fe8, 0xffffff], need('distance', 1500)],
    ['odd', 'Odd eyes', [0x17a05a, 0x2b8fe8, 0xffffff], need('chain', 20)],
    ['starry', 'Starry', [0x2c2f96, 0x2c2f96, 0xffd84a], need('endlessDist', 5000)],
  ],
  hat: [
    ['none', 'No hat', [], FREE],
    ['bow', 'Bow', [0xff5d8f, 0xd63a6c], FREE],
    ['beanie', 'Beanie', [0x33b5a5, 0xffffff, 0x1f8a7d], need('bells', 14)],
    ['party', 'Party hat', [0xff4fa0, 0xffd23a, 0x5fd0ff], need('shares', 1)],
    ['flowers', 'Flower crown', [0xff8fb8, 0xffffff, 0xc7a6ff, 0xffd23a, 0x5fbf4a], need('photos', 1)],
    ['chef', 'Chef hat', [0xffffff, 0xe8e2d6], need('trailsFinished', 1)],
    ['propeller', 'Propeller cap', [0xe8343f, 0xffd23a, 0x3a7cff, 0x45c45a], need('endlessDist', 2000)],
    ['crown', 'Golden crown', [0xffcc33, 0xe0a20e, 0xff3b5c, 0x3aa0ff], need('bells', 21)],
    ['witch', 'Witch hat', [0x5b3a8c, 0x2e1d4a, 0xffa53a], FREE],
  ],
  scarf: [
    ['none', 'No scarf', [], FREE],
    ['red', 'Red scarf', [0xe23a3a, 0xffe2d0], FREE],
    ['bell', 'Bell collar', [0xe23a4a, 0xffcc33], need('fish', 100)],
    ['bandana', 'Bandana', [0x2f6fd6, 0xffffff], need('daily', 1)],
    ['bowtie', 'Bow tie', [0x2a2f4a, 0xe8343f], need('challengesWon', 1)],
    ['cape', 'Hero cape', [0xd9283e, 0xffcc33, 0x8f1426], need('chain', 50)],
  ],
  fx: [
    ['none', 'No trail', [], FREE],
    ['sparkles', 'Sparkles', [0xfff3a0, 0xffffff, 0xffd84a], FREE],
    ['hearts', 'Hearts', [0xff5d8f, 0xff9fbf, 0xffffff], need('clips', 1)],
    ['rainbow', 'Rainbow ribbon', [0xff4f5a, 0xffb43a, 0xffe14d, 0x5fd05a, 0x4cb8ff, 0x9a6bff], need('tricks', 100)],
    ['bubbles', 'Fish bubbles', [0xbfeaff, 0x7fd0ff, 0xffffff], need('fish', 300)],
    ['leaves', 'Autumn leaves', [0xff8a2a, 0xe0482c, 0xffc21a, 0xb5651d], need('distance', 3000)],
  ],
};

export const CATALOG: Readonly<Record<LookSlot, readonly Item[]>> = Object.freeze(
  Object.fromEntries(
    LOOK_SLOTS.map((slot) => [
      slot,
      Object.freeze(DEFS[slot].map(([key, name, colors, unlock, tags], index): Item => Object.freeze({ key: `${slot}.${key}`, slot, index, name, colors: Object.freeze(colors), unlock, ...(tags ? { tags: Object.freeze(tags) } : {}) }))),
    ]),
  ) as Record<LookSlot, readonly Item[]>,
);

export const ALL_ITEMS: readonly Item[] = Object.freeze(LOOK_SLOTS.flatMap((s) => CATALOG[s]));
const BY_KEY = new Map(ALL_ITEMS.map((it) => [it.key, it]));

/** tab labels */
export const SLOT_LABELS: Readonly<Record<LookSlot, string>> = { fur: 'FUR', pattern: 'PATTERN', eyes: 'EYES', hat: 'HAT', scarf: 'SCARF', fx: 'TRAIL FX' };

/** a valid index for the slot (out of range or garbage -> 0) */
export function clampIndex(slot: LookSlot, index: unknown): number {
  const n = typeof index === 'number' && Number.isInteger(index) ? index : 0;
  return n >= 0 && n < CATALOG[slot].length && n <= LOOK_MAX_INDEX ? n : 0;
}
/** the item at slot/index (out of range -> the classic item 0) */
export const itemAt = (slot: LookSlot, index: number): Item => CATALOG[slot][clampIndex(slot, index)];
export const itemByKey = (key: string): Item | undefined => BY_KEY.get(key);

/** fur colours of a look's fur index (always valid) */
export interface FurColors {
  base: number;
  dark: number;
  belly: number;
  fleckLight: number;
  fleckDark: number;
  specks: boolean;
}
export function furColors(index: number): FurColors {
  const it = itemAt('fur', index);
  const c = it.colors;
  return { base: c[0], dark: c[1], belly: c[2], fleckLight: c[3], fleckDark: c[4], specks: !!it.tags?.includes('specks') };
}

/** pattern ids by index (the painters switch on these) */
export type PatternId = 'tabby' | 'solid' | 'spots' | 'socks' | 'patches' | 'tuxedo';
export const patternId = (index: number): PatternId => itemAt('pattern', index).key.slice('pattern.'.length) as PatternId;
/** short id after the slot prefix: itemId('hat', 7) = 'crown' */
export const itemId = (slot: LookSlot, index: number): string => itemAt(slot, index).key.slice(slot.length + 1);
