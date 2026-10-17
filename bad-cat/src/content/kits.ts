/**
 * Authoring kits: where props may go in each shell (FULL build rooms; the frozen Kitchen variants keep their own
 * slot table in authoring.ts). A kit lists surface slots by area, the lamps with their cables, an optional
 * tablecloth, floor spots for grabbables and boxes, fixed floor decor, and the ranked spawn.
 *
 * Slots are chosen so the cat keeps a walking lane on every surface (a back row, a seat to land on) and so props
 * never land on a human. Which slots can actually be wrecked is computed per room by the builder from the
 * heightmap, so a kit only has to be honest about lanes.
 */
import { KIND } from './props-catalog';
import { SHELL } from './shells';
import type { RoomTheme } from '../types';

export type Area =
  | 'counter' | 'fridge' | 'shelf' | 'table' | 'sideboard' | 'bench' | 'footstool'
  | 'console' | 'coffee' | 'sofa' | 'bookcase' | 'cabinet'
  | 'vanity' | 'towels' | 'washer' | 'toilet' | 'tub'
  | 'desk' | 'credenza' | 'armchair' | 'plantstand'
  | 'buffet' | 'partytable' | 'giftshelf' | 'stage'
  | 'nightstand' | 'dresser' | 'wardrobe' | 'bed'
  | 'mantle' | 'bar' | 'cocktail' | 'dj' | 'headtable' | 'caketable' | 'champagne';

export interface KitSlot {
  x: number;
  z: number;
  area: Area;
  /** A lamp always stands here, its cable hanging on this floor cell. */
  cable?: { x: number; z: number };
}

export interface Kit {
  shell: number;
  slots: readonly KitSlot[];
  /** Floor cells for grabbables, the wish (when it is carried or sat in) and boxes; never a lane-critical cell. */
  floor: readonly [number, number][];
  /** Fixed floor decor (blocking, cannot fall): laundry on the floor, presents under the tree, balloons. */
  decor?: readonly { kind: number; x: number; z: number }[];
  /** Tablecloth over a table (kind 14 with w/d); props on it ride the cloth. */
  cloth?: { x: number; z: number; w: number; d: number };
  spawn: { x: number; z: number };
  /** Floor cells for top-up decor (used only until the room reaches its prop count). */
  extra?: readonly [number, number][];
  extraKinds?: readonly number[];
  /** Default floor grabbables of this shell (a recipe may override). */
  grabbables?: readonly number[];
  /** Slots of these areas are never dropped (review round 1: the Napper's dresser and nightstands stay full). */
  keepAreas?: readonly Area[];
  /** Kinds never used as fillers here (targets may still be): the Party table was ~6x every other room. */
  noFill?: readonly number[];
  /** Round 2 (QA): a high-shelf hero (a stack that shatters) for rooms that had no big crash; kept unless a target. */
  hero?: { x: number; z: number; kind: number };
}

const S = (area: Area, ...cells: [number, number][]): KitSlot[] => cells.map(([x, z]) => ({ x, z, area }));
const LAMP = (area: Area, x: number, z: number, cx: number, cz: number): KitSlot => ({ x, z, area, cable: { x: cx, z: cz } });

/** Default filler kinds per area (the lived-in look). Themes mix their own kinds in (THEME_KINDS). */
export const AREA_KINDS: Record<Area, readonly number[]> = {
  counter: [KIND.wineGlass, KIND.mug, KIND.plateStack, KIND.fruitBowl, KIND.eggCarton, KIND.vase, 38, 37, 21],
  fridge: [KIND.vase, KIND.pottedPlant, KIND.bookStack, KIND.fruitBowl, 21],
  shelf: [KIND.vase, KIND.pottedPlant, KIND.bookStack, KIND.mug, KIND.wineGlass, 44],
  table: [KIND.wineGlass, KIND.mug, KIND.plateStack, KIND.fruitBowl, KIND.cake, 58, 48],
  sideboard: [KIND.vase, KIND.pottedPlant, KIND.tvRemote, KIND.bookStack, 44],
  bench: [KIND.tvRemote, KIND.bookStack, KIND.mug, KIND.pottedPlant, 57],
  footstool: [KIND.wineGlass, KIND.mug, KIND.fruitBowl, KIND.vase],
  console: [KIND.vase, KIND.pottedPlant, KIND.bookStack, KIND.tvRemote, 44, 42, 40],
  coffee: [KIND.mug, KIND.wineGlass, 22, KIND.tvRemote, 41, 58, 57],
  sofa: [KIND.tvRemote, 57, 42, 22],
  bookcase: [KIND.bookStack, KIND.vase, KIND.pottedPlant, 44, 51],
  cabinet: [KIND.pottedPlant, KIND.bookStack, KIND.vase, 44],
  vanity: [25, 13, 45, 58, 44, 57],
  towels: [46, 12, 13, KIND.pottedPlant, 44],
  washer: [33, 46, 12],
  toilet: [12, 44, 57],
  tub: [45, 44, 12, 46, 58],
  desk: [KIND.mug, 26, 57, KIND.bookStack, KIND.pottedPlant, 58, 53],
  credenza: [40, KIND.bookStack, KIND.pottedPlant, 53, 44, 51],
  armchair: [KIND.bookStack, KIND.mug, KIND.tvRemote, 57],
  plantstand: [KIND.pottedPlant],
  buffet: [KIND.cake, 27, 31, 41, KIND.plateStack, 22, KIND.wineGlass],
  partytable: [KIND.cake, 27, 28, KIND.wineGlass, KIND.plateStack, 30, 22],
  giftshelf: [28, 30, KIND.vase, KIND.pottedPlant],
  stage: [28, 42, 57, KIND.wineGlass],
  nightstand: [34, 58, 57, 35, KIND.bookStack],
  dresser: [35, 13, 44, KIND.vase, 34],
  wardrobe: [51, KIND.bookStack, 33, KIND.pottedPlant],
  bed: [57, KIND.bookStack, 33, KIND.tvRemote, KIND.laptop],
  mantle: [60, 16, 44, KIND.vase],
  bar: [KIND.wineGlass, 62, 27, 58, 22],
  cocktail: [KIND.wineGlass, 62, 58, 22],
  dj: [42, 57, 27, 62],
  headtable: [KIND.wineGlass, 56, KIND.plateStack, 58, 44],
  caketable: [KIND.cake, KIND.plateStack, KIND.wineGlass, 56],
  champagne: [55, KIND.wineGlass, 62, 58],
};

/** Theme kinds mixed into the fillers (about one slot in three). */
export const THEME_KINDS: Partial<Record<RoomTheme, readonly number[]>> = {
  xmas: [16, 60, 36, 61, 30],
  birthday: [28, 30, 27, KIND.cake],
  wedding: [55, 56, KIND.cake, KIND.wineGlass],
  nye: [62, 27, 28, KIND.wineGlass],
  valentine: [56, 44, KIND.wineGlass, KIND.cake],
  thanksgiving: [47, 48, 49],
  spring: [KIND.pottedPlant, KIND.vase],
};

/** Cheap fillers used to keep a room under its chaos budget. */
export const CHEAP_KINDS: readonly number[] = [KIND.tvRemote, 26, 21, KIND.mug];

// ----- Kitchen (FULL-build dailies; same slot ideas as the frozen variants, the Roomba starts on its loop) -----
const KITCHEN_KIT: Kit = {
  shell: SHELL.kitchen,
  slots: [
    ...S('counter', [3, 1], [4, 1], [6, 1], [7, 1], [9, 1]),
    ...S('fridge', [10, 1], [11, 1]),
    ...S('shelf', [1, 2], [1, 3], [0, 4], [1, 4]),
    ...S('table', [4, 6], [7, 6], [4, 5], [7, 5]),
    ...S('sideboard', [10, 5], [10, 6], [10, 4], [11, 4]),
    ...S('bench', [6, 8], [7, 8], [8, 8], [9, 8]),
    ...S('footstool', [3, 7]),
  ],
  floor: [[3, 3], [4, 3], [4, 9], [11, 9], [2, 3], [0, 9]],
  cloth: { x: 4, z: 5, w: 4, d: 2 },
  spawn: { x: 1, z: 8 },
};

// ----- Thanksgiving kitchen: Grandma sits on the chair at (8,6), so nothing is pushed east off the table onto her -----
const KITCHEN_DINNER_KIT: Kit = {
  ...KITCHEN_KIT,
  shell: SHELL.kitchenDinner,
  slots: KITCHEN_KIT.slots.filter((s) => !(s.x === 7 && s.z === 6)),
};

// ----- Living room -----
const LIVING_SLOTS: KitSlot[] = [
  ...S('bookcase', [0, 1], [1, 1]),
  ...S('console', [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]),
  ...S('shelf', [10, 0]),
  ...S('cabinet', [11, 1]),
  ...S('coffee', [5, 5], [6, 5], [7, 5], [8, 5], [8, 4]),
  LAMP('sideboard', 1, 8, 0, 8),
  ...S('sofa', [2, 8], [3, 8], [4, 8], [6, 8], [7, 8]),
];
const LIVING_KIT: Kit = {
  shell: SHELL.living,
  slots: LIVING_SLOTS,
  floor: [[3, 2], [1, 4], [9, 3], [0, 5], [4, 9], [7, 9]],
  extra: [[11, 3], [11, 4], [0, 6], [10, 2]],
  extraKinds: [KIND.pottedPlant, KIND.bookStack, 40],
  spawn: { x: 2, z: 4 },
};
const LIVING_ZOOM_KIT: Kit = { ...LIVING_KIT, shell: SHELL.livingZoom };

// ----- Bathroom -----
const BATH_KIT: Kit = {
  shell: SHELL.bathroom,
  slots: [
    ...S('towels', [0, 1], [1, 1]),
    ...S('vanity', [2, 1], [3, 1], [5, 1], [6, 1]),
    ...S('washer', [11, 1]),
    ...S('toilet', [10, 4]),
    ...S('tub', [0, 8], [1, 8], [2, 8], [3, 8], [4, 8]),
    ...S('towels', [1, 3], [1, 4]),
    ...S('tub', [6, 9], [8, 9]),
  ],
  floor: [[8, 2], [2, 5], [5, 6], [3, 4], [10, 8], [11, 8]],
  // the laundry nobody has done, spare toilet rolls stacked by the loo
  decor: [{ kind: 33, x: 8, z: 0 }, { kind: 12, x: 11, z: 4 }],
  extra: [[11, 3], [11, 6], [0, 6], [11, 7]],
  extraKinds: [46, KIND.pottedPlant, 12, 33],
  // round 2: the perfume tray on the high shelf, over the Roomba's road (a big crash for the clip)
  hero: { x: 1, z: 1, kind: KIND.perfumeTray },
  spawn: { x: 9, z: 6 },
};

// ----- Home office -----
const OFFICE_KIT: Kit = {
  shell: SHELL.office,
  slots: [
    ...S('bookcase', [0, 1], [1, 1]),
    ...S('desk', [2, 1], [3, 1], [4, 1], [6, 1]),
    ...S('shelf', [10, 0]),
    ...S('credenza', [9, 6], [10, 6], [11, 6]),
    ...S('armchair', [0, 7], [1, 7]),
    LAMP('sideboard', 2, 7, 3, 7),
    ...S('bench', [6, 9], [8, 9]),
    ...S('plantstand', [11, 7]),
  ],
  floor: [[7, 3], [1, 3], [9, 8], [10, 3], [4, 9], [3, 2]],
  // the work laptop on the desk (in front of the worker) and the parcel nobody opened
  decor: [{ kind: KIND.laptop, x: 5, z: 1 }, { kind: 51, x: 9, z: 2 }],
  extra: [[11, 2], [0, 9], [11, 4], [0, 4]],
  extraKinds: [51, KIND.pottedPlant, 53, KIND.bookStack],
  spawn: { x: 7, z: 5 },
};

// ----- Party room -----
const PARTY_KIT: Kit = {
  shell: SHELL.party,
  slots: [
    ...S('giftshelf', [0, 1], [1, 1]),
    ...S('buffet', [2, 1], [3, 1], [4, 1], [6, 1]),
    ...S('giftshelf', [10, 0]),
    ...S('partytable', [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]),
    ...S('stage', [2, 8], [2, 9]),
  ],
  floor: [[1, 3], [10, 3], [1, 6], [11, 6], [3, 7], [9, 7]],
  decor: [{ kind: 28, x: 11, z: 8 }, { kind: 28, x: 10, z: 9 }],
  cloth: { x: 3, z: 4, w: 6, d: 2 },
  extra: [[0, 7], [11, 3], [11, 5], [9, 9], [0, 4]],
  extraKinds: [28, 30, 27],
  spawn: { x: 10, z: 5 },
  // one cloth pull dropped two cakes, gift stacks and a cups tower at once: fillers stay small here
  noFill: [KIND.cake, KIND.plateStack, 27, 30, 41],
};

// ----- Bedroom -----
const BED_KIT: Kit = {
  shell: SHELL.bedroom,
  slots: [
    ...S('wardrobe', [0, 1], [1, 1]),
    LAMP('nightstand', 2, 1, 2, 2),
    ...S('nightstand', [7, 1]),
    // SIM_VERSION 8 content (QA round 3: only 8 of 28 Bedroom props could be knocked off, other rooms 16–24): the bed's
    // front edge, the ottoman and both armchair cells hold breakables too, so a Sunday has at least 14 to wreck
    // SIM_VERSION 8 content (QA round 3: a Sunday had 8 of 28 props to knock off, other rooms 16–24): the bed's corners
    // by the sleeper and the ottoman hold breakables too (14+ to wreck; more bed cells blocked the cat's lane)
    ...S('bed', [3, 2], [5, 3], [6, 3], [6, 2], [3, 3]),
    ...S('footstool', [8, 1]),
    // the dresser of tiny breakables: (9,0) falls to the floor by the window, (9,1) onto the ottoman or the floor
    ...S('dresser', [9, 0], [9, 1], [10, 1], [11, 1]),
    ...S('armchair', [10, 7]),
  ],
  floor: [[4, 9], [8, 4], [9, 5], [2, 8], [8, 9], [0, 3], [5, 9]],
  // the laundry pile in the corner, a box under the window
  decor: [{ kind: 33, x: 0, z: 9 }, { kind: 51, x: 8, z: 0 }],
  extra: [[11, 4], [11, 5], [8, 5], [0, 5], [9, 9], [10, 5], [7, 4], [9, 7], [2, 6], [1, 9]],
  extraKinds: [33, 51, KIND.bookStack, KIND.pottedPlant],
  grabbables: [KIND.sock, KIND.slipper, KIND.sock],
  // round 2: by the bed, a hop from the first breakable (the first crash in seconds), 4 cells from the sleeper
  spawn: { x: 1, z: 4 },
  // round 2: the perfume tray on top of the wardrobe (a big crash for the clip)
  hero: { x: 1, z: 1, kind: KIND.perfumeTray },
  keepAreas: ['nightstand', 'dresser', 'bed', 'footstool'],
};

// ----- Boss: Birthday hall -----
const BIRTHDAY_KIT: Kit = {
  shell: SHELL.bossBirthday,
  slots: [
    ...S('giftshelf', [0, 1], [1, 1]),
    ...S('buffet', [2, 1], [3, 1], [4, 1], [6, 1]),
    ...S('table', [10, 1], [11, 1]),
    ...S('giftshelf', [12, 1], [13, 1]),
    ...S('partytable', [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]),
    ...S('table', [12, 4], [10, 5], [11, 5], [12, 5]),
    ...S('caketable', [12, 8], [13, 8]),
    ...S('stage', [2, 8], [2, 10]),
  ],
  floor: [[1, 3], [10, 3], [13, 5], [1, 6], [3, 11], [10, 8]],
  extra: [[0, 3], [13, 3], [13, 4], [6, 7], [0, 6]],
  extraKinds: [28, 30, 27],
  decor: [{ kind: 28, x: 13, z: 2 }, { kind: 28, x: 0, z: 11 }, { kind: 30, x: 9, z: 2 }],
  cloth: { x: 3, z: 4, w: 6, d: 2 },
  spawn: { x: 11, z: 9 },
};

// ----- Boss: Wedding -----
const WEDDING_KIT: Kit = {
  shell: SHELL.bossWedding,
  slots: [
    ...S('shelf', [0, 1], [1, 1]),
    ...S('headtable', [2, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1]),
    ...S('shelf', [12, 0]),
    ...S('caketable', [5, 6], [6, 6], [7, 6], [8, 6]),
    ...S('champagne', [11, 6], [12, 6], [13, 6]),
    ...S('table', [2, 8], [3, 8]),
    ...S('bench', [1, 10], [1, 11]),
  ],
  floor: [[1, 4], [9, 3], [3, 5], [10, 8], [6, 11], [12, 10]],
  decor: [{ kind: 56, x: 11, z: 2 }],
  cloth: { x: 5, z: 5, w: 4, d: 2 },
  extra: [[0, 3], [13, 3], [0, 7], [13, 10], [7, 3]],
  extraKinds: [56, 30, KIND.vase],
  // round 2: between the cake and the champagne tables (the first crash in seconds)
  spawn: { x: 11, z: 9 },
};

// ----- Boss: Christmas living room -----
const XMAS_KIT: Kit = {
  shell: SHELL.bossChristmas,
  slots: [
    ...S('mantle', [3, 0]),
    ...S('cabinet', [8, 1], [9, 1], [11, 1]),
    ...S('bookcase', [12, 1], [13, 1]),
    ...S('coffee', [4, 6], [5, 6], [6, 6], [7, 6]),
    ...S('sofa', [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9]),
    LAMP('sideboard', 10, 9, 11, 9),
  ],
  floor: [[2, 3], [9, 3], [1, 6], [12, 4], [2, 11], [13, 8]],
  // presents under the tree (the tree topples onto them), a stack of firewood-shaped gifts by the hearth
  decor: [{ kind: 30, x: 4, z: 1 }, { kind: 30, x: 6, z: 1 }, { kind: 61, x: 7, z: 1 }],
  cloth: { x: 4, z: 5, w: 4, d: 2 },
  extra: [[1, 4], [2, 6], [13, 5], [0, 10], [1, 11], [12, 2], [9, 6]],
  extraKinds: [30, 30, 61, KIND.pottedPlant],
  spawn: { x: 12, z: 9 },
};

// ----- Boss: New Year's party -----
const NYE_KIT: Kit = {
  shell: SHELL.bossNye,
  slots: [
    ...S('shelf', [0, 1], [1, 1]),
    ...S('bar', [2, 1], [3, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1]),
    ...S('shelf', [12, 0]),
    ...S('cocktail', [5, 4], [5, 5], [9, 4], [9, 5]),
    ...S('dj', [11, 9], [12, 9]),
    ...S('sofa', [0, 10], [1, 10], [5, 10]),
  ],
  floor: [[2, 3], [7, 3], [12, 3], [1, 7], [9, 11], [12, 11]],
  decor: [{ kind: 28, x: 13, z: 4 }, { kind: 28, x: 0, z: 6 }],
  extra: [[0, 4], [13, 10], [6, 11], [1, 8], [13, 2]],
  extraKinds: [28, 62, 27],
  spawn: { x: 13, z: 6 },
};

/** Kits indexed by shell. */
export const KITS: readonly Kit[] = [
  KITCHEN_KIT,
  LIVING_KIT,
  BATH_KIT,
  OFFICE_KIT,
  PARTY_KIT,
  BED_KIT,
  BIRTHDAY_KIT,
  WEDDING_KIT,
  XMAS_KIT,
  NYE_KIT,
  KITCHEN_DINNER_KIT,
  LIVING_ZOOM_KIT,
];
