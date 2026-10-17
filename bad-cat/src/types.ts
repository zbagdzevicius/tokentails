/**
 * Bad Cat Daily: frozen cross-lane interfaces (GDD section 13.3, adapted to the MVP build).
 *
 * Owned by LEAD. Lanes import ONLY from this file and from the exports listed in LANES.md.
 * A change here needs a note in LANES.md ("Interface changes"). Fields marked M1/M2 are optional
 * and may be ignored by M0 code.
 *
 * Conventions
 * - Grid: x = column (0..width-1, west -> east), z = row (0..depth-1, north/back wall -> south/camera).
 *   Cell index = z * width + x. 0.4 m per cell (CELL_M).
 * - Dir8: 0 = none, 1 = N (z-1), 2 = NE, 3 = E (x+1), 4 = SE, 5 = S (z+1), 6 = SW, 7 = W, 8 = NW.
 *   A facing is always 1..8. Offsets are in DIR_DX / DIR_DZ.
 * - The sim is integer-only and deterministic: no floats in SimState, no Math.random, no trig.
 *   Suspicion is in milli-units (0..SUSPICION_MAX = 100_000 means 0..100 %).
 */

// ---------------------------------------------------------------------------------------------
// Versions and timing
// ---------------------------------------------------------------------------------------------

/**
 * FULL build (FULL-PLAN.md): SIM_VERSION 5 adds the M1a/M2 rules (spill-slide, stack bonus, cloth and cable pull,
 * Roomba + framing, accomplice wish, mirror cone, on-camera bonus, tall props, Napper noise meter, two-human boss).
 * The sim keeps the v4 rule set behind `SimState.rules` so v4 ghosts replay bit-exact ("replay only").
 *
 * SIM_VERSION 6 (review round 1 balance): the Napper hears swats and pushes (NOISE_V6), the human's cone reaches 7
 * cells in normal rooms (CONE_RANGE_V6; boss rooms keep 10), the mirror only watches in a "checks the mirror" phase
 * after a glint warning, the first heist never ends caught (FTUE_SUSPICION_CAP) and warns 30 ticks ahead, and a
 * stack in the Party room chains at most PARTY_STACK_CAP items. v5 ghosts replay bit-exact on the v5 rules.
 *
 * SIM_VERSION 7 (QA round 2 game feel): JUMP toward a surface two levels up hops through any adjacent seat and then
 * on up (SEAT_CHAIN), lands, spills and props hit by a landing extend the combo too, the combo window holds while
 * a fall is in flight, a stack adds at most STACK_COMBO_CAP_V7 to the combo outside the Party room, a fall within
 * FRAME_RANGE_V7 cells of the Roomba frames it when a human looks at the Roomba or the landing cell, and the Napper
 * forgets faster while the cat loafs and each wake look lasts WAKE_LOOK_BONUS_V7 longer. v6 ghosts replay bit-exact.
 *
 * SIM_VERSION 8 (QA round 3 balance): freezing has a risk. A cat frozen in a human's cone within 2 cells of a mess
 * younger than RED_PAWED_MESS_TICKS_V8 is "red-pawed" (+RED_PAWED_GAIN_V8 a tick). Fake-outs are FAKEOUT_PCT_V8 % of
 * turns after FAKEOUT_AFTER_TICK_V8, every turn warning is a quarter shorter (telegraphV8: Monday 24 -> 18,
 * Saturday 15 -> 12), the mirror glints once per MIRROR_CYCLE_TICKS_V8, two humans never warn at once (the second
 * waits TWO_HUMAN_GAP_TICKS_V8 after the first's turn), and the Napper forgets 1.5x faster while the cat loafs, hears
 * crashes and swats a little less (NOISE_V8) and her wake look loses the v7 bonus. A human who sees the cat move keeps
 * his eyes on it for the rest of the look (his cone follows it, full length), and the Couch Potato sits up to look
 * over the coffee table (RoutineDef.lookOverV8).
 * v7 ghosts replay on the v7 rules ("replay only"; the daily content changed with v8 too).
 */
export const SIM_VERSION = 8;
/** Oldest recorded run the sim can still replay exactly (played as "replay only" when < SIM_VERSION). */
export const MIN_REPLAY_SIM_VERSION = 4;
export const TICK_HZ = 30;
export const RUN_TICKS = 2250; // 75 s ranked/practice
export const FTUE_TICKS = 1200; // 40 s first heist from a link
export const BOSS_TICKS = 2700; // 90 s (M2)

// ---------------------------------------------------------------------------------------------
// Directions and input
// ---------------------------------------------------------------------------------------------

export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** A facing is never 0. */
export type Facing = Exclude<Dir8, 0>;
/** dx per Dir8 index (index 0 = none). */
export const DIR_DX: readonly number[] = [0, 0, 1, 1, 1, 0, -1, -1, -1];
/** dz per Dir8 index (N = -z). */
export const DIR_DZ: readonly number[] = [0, -1, -1, 0, 1, 1, 1, 0, -1];
export function isDiagonal(d: Dir8): boolean {
  return d === 2 || d === 4 || d === 6 || d === 8;
}

export const BTN_SWAT = 1;
export const BTN_JUMP = 2;
export const BTN_GRAB = 4;
export const BTN_ZOOM = 8; // reserved, unused in the MVP

/** 0 = no movement, 1 = sneak (0.9 m/s, silent), 2 = trot (1.8 m/s, quiet). */
export type Speed = 0 | 1 | 2;
/** One per sim tick, already quantised (direction and speed hysteresis live in the input layer). */
export interface TickInput {
  dir: Dir8;
  speed: Speed;
  buttons: number; // BTN_* bitmask, latched until the tick reads it
}
export const NO_INPUT: TickInput = Object.freeze({ dir: 0, speed: 0, buttons: 0 }) as TickInput;

// ---------------------------------------------------------------------------------------------
// Room geometry and rules constants (GDD 4.1 - 4.5)
// ---------------------------------------------------------------------------------------------

export const ROOM_W = 12;
export const ROOM_D = 10;
export const CELL_M = 0.4;
/** Surface heights in metres per level L0..L3 (render only; the sim uses level numbers). */
export const LEVEL_HEIGHT_M: readonly number[] = [0, 0.45, 0.9, 1.8];
export type Level = 0 | 1 | 2 | 3;

export const STEP_TICKS = { sneakOrtho: 13, trotOrtho: 7, sneakDiag: 19, trotDiag: 10 } as const;
export const JUMP_TICKS = 12;
export const SWAT_TICKS = 8; // swat animation lock (cat cannot step meanwhile)
export const GRAB_TICKS = 8;
export const LOAF_DELAY_TICKS = 10;
export const CUDDLE_TICKS = 75; // 2.5 s caught animation before the run ends
/** Fall ticks indexed [fromLevel][toLevel]; 0 where not a fall. L3->L1 uses the L3->L0 time minus L1->L0. */
export const FALL_TICKS: readonly (readonly number[])[] = [
  [0, 0, 0, 0],
  [9, 0, 0, 0],
  [13, 6, 0, 0],
  [18, 13, 9, 0],
];
export const MAX_CHAIN_STEPS = 6;
export const COMBO_WINDOW_TICKS = 90;
/** SIM_VERSION 7: the combo window (4 s; v4..v6: 3 s). It also holds while a fall is in flight. */
export const COMBO_WINDOW_V7 = 120;
export const COMBO_MAX = 8;
export const LAST_CALL_TICKS = 150; // final 5 s double points
export const EVENT_TICKS = 180; // room event: human away / facing away for 6 s

/** Height multiplier x2 per level (1.0 / 1.5 / 2.5 for L1 / L2 / L3; L0 counts as L1). */
export const HEIGHT_MULT_X2: readonly number[] = [2, 2, 3, 5];

export const SUSPICION_MAX = 100_000;
/** Per-tick suspicion deltas in milli-units (per-second GDD rates / 30, rounded). */
export const SUSPICION = {
  moveSneakInCone: 1333, // +40/s
  moveTrotInCone: 2333, // +70/s
  fallInCone: 35_000, // once per prop
  breakInCone: 60_000, // once per prop (instead of fallInCone)
  heardCrash: 15_000, // crash during LOOK outside the cone
  loafInCone: -333, // -10/s
  decayBusy: -267, // -8/s
  perfectLimit: 50_000, // never above this = Perfect Crime
} as const;

export const BONUS = {
  target: 1000,
  wish: 500,
  stash: 500,
  stashMax: 2,
  framed: 300, // M1a
} as const;

// ----- v5 rule constants (SIM_VERSION 5) -----
/** Napper noise meter (Sunday), milli-units like suspicion. At `max` the napper wakes: TELEGRAPH then LOOK. */
export const NOISE = {
  max: 100_000,
  trotStep: 4_000, // per trot step (sneaking is silent)
  jumpDown: 6_000, // landing from L2+
  crash: 30_000, // break / spill anywhere
  land: 12_000, // a non-fragile prop landing
  decayPerTick: -120, // about -3.6 %/s while quiet
  afterWake: 40_000, // meter value after the wake look ends
} as const;
/** SIM_VERSION 6 Napper: louder trot steps, swats and pushes are heard, and the meter forgets half as fast. */
export const NOISE_V6 = {
  ...NOISE,
  trotStep: 6_000,
  swat: 8_000, // a swat or a push (the cat batting at things), wherever it lands
  decayPerTick: -60, // about -1.8 %/s while quiet
} as const;
/** SIM_VERSION 6: the human's cone length in cells in normal rooms (boss rooms keep CONE_RANGE 10). */
export const CONE_RANGE_V6 = 7;
/** SIM_VERSION 6 first heist: suspicion never passes this (the first run never ends caught). */
export const FTUE_SUSPICION_CAP = 90_000;
/** SIM_VERSION 6 first heist: every turn warning (TELEGRAPH) lasts this long. */
export const FTUE_TELEGRAPH_V6 = 30;
/** SIM_VERSION 6 mirror: BUSY ticks before the first glint, glint warning, check (live cone), cycle length. */
export const MIRROR_FIRST_GLINT = 30;
export const MIRROR_GLINT_TICKS = 15;
export const MIRROR_CHECK_TICKS = 45;
export const MIRROR_CYCLE_TICKS = 120;
/** SIM_VERSION 7: outside the Party room a stack adds at most this much to the combo (a few huge hits decided runs). */
export const STACK_COMBO_CAP_V7 = 3;
/** SIM_VERSION 7: a fall this close (Chebyshev cells) to the Roomba can frame it (v5/v6: 1). */
export const FRAME_RANGE_V7 = 2;
/** SIM_VERSION 7 Napper: trot steps a little quieter, quiet ticks forget like v5 (v6 doubled the memory). */
export const NOISE_V7 = { ...NOISE_V6, trotStep: 3_500, decayPerTick: -150 } as const;
/** SIM_VERSION 7 Napper: quiet ticks while the cat loafs forget this much per tick (v6: -60 on any quiet tick). */
export const NOISE_LOAF_DECAY_V7 = -260;
/** SIM_VERSION 7 Napper: every wake look lasts this many ticks (1 s) longer: fewer, scarier wakes. */
export const WAKE_LOOK_BONUS_V7 = 30;
/** SIM_VERSION 7 Napper: the meter value after a wake look (v5/v6: NOISE.afterWake 40 %). */
export const NOISE_AFTER_WAKE_V7 = 10_000;
/** SIM_VERSION 8: red-pawed suspicion per tick (+25/s) for a frozen cat in a cone beside a fresh mess. */
export const RED_PAWED_GAIN_V8 = 833;
/** SIM_VERSION 8: a mess (a prop that broke, spilled or landed) counts as fresh this long (2 s). */
export const RED_PAWED_MESS_TICKS_V8 = 60;
/** SIM_VERSION 8: once red-pawed, the stretch lasts while the cat stays frozen in sight beside that mess (up to 3 s). */
export const RED_PAWED_HOLD_TICKS_V8 = 90;
/**
 * SIM_VERSION 8: "beside" the mess = within this many cells (Chebyshev). The review asked for 1; with 1 the planner
 * bot was red-pawed in 1 room of 15 (it walks on after a swat), with 2 a 0.5 s reaction loses PERFECT CRIME in
 * 6 of 15 rooms and is caught in none (the review's target: about 30 %, 50–90 % peak, never caught).
 */
export const RED_PAWED_RANGE_V8 = 2;
/** SIM_VERSION 8: share of turns (percent) that are fake-outs from FAKEOUT_AFTER_TICK_V8 on (v4..v7: routine's, 20 % after 30 s). */
export const FAKEOUT_PCT_V8 = 35;
export const FAKEOUT_AFTER_TICK_V8 = 600;
/** SIM_VERSION 8: the mirror's glint-and-check cycle (one glint per 8 s; v6/v7: every 4 s). */
export const MIRROR_CYCLE_TICKS_V8 = 240;
/** SIM_VERSION 8: in two-human rooms a human may not start a turn while the other warns or looks, nor this soon after. */
export const TWO_HUMAN_GAP_TICKS_V8 = 60;
/**
 * SIM_VERSION 8 Napper: a crash and a swat are a little quieter (QA round 3: the Bedroom planner woke her 8 times and
 * the Sunday was half waiting), and the wake look loses v7's WAKE_LOOK_BONUS_V7.
 */
export const NOISE_V8 = { ...NOISE_V7, crash: 22_000, swat: 6_000 } as const;
/** SIM_VERSION 8 Napper: loafing forgets 1.5x faster than v7's NOISE_LOAF_DECAY_V7. */
export const NOISE_LOAF_DECAY_V8 = -390;
/** SIM_VERSION 8: a turn warning is a quarter shorter, rounded up (24 -> 18, 22 -> 17, 20 -> 15, 17 -> 13, 15 -> 12). */
export function telegraphV8(ticks: number): number {
  return Math.max(1, Math.ceil((ticks * 3) / 4));
}
/** SIM_VERSION 6: a stack in the Party room scores and chains at most this many items (cups tower x6 -> x4). */
export const PARTY_STACK_CAP = 4;
/** ShellDef.id of the (weekday) Party room. */
export const PARTY_SHELL_ID = 4;
/** Ticks the Roomba takes per loop cell (0.8 s). */
export const ROOMBA_STEP_TICKS = 24;
/** Mirror and webcam cone length in cells (half the human's 10). */
export const MIRROR_RANGE = 5;
/** Thursday: points bonus for crashes in the webcam's view. */
export const ON_CAMERA_PCT = 50;
/** Mirror sightings add this share (percent) of the normal in-cone suspicion rates. */
export const MIRROR_SUSPICION_PCT = 50;

/** Rank titles by final score (GDD 4.5), ascending thresholds. */
export const RANKS: readonly { min: number; title: string }[] = [
  { min: 0, title: 'Nap Champion' }, // no chaos at all (round 3: 0 chaos read as a compliment)
  { min: 1, title: 'Mildly Naughty' },
  { min: 800, title: 'Troublemaker' }, // first-heist scores (300-2,000) no longer share one title
  { min: 2000, title: 'Menace' },
  { min: 5000, title: 'Gremlin' },
  { min: 9000, title: 'Agent of Chaos' },
  { min: 14000, title: 'Legendary Bad Cat' },
];
/**
 * Rank titles per room (review round 1): the RANKS thresholds scaled by the shell's scoring potential, from the
 * balance bots' 90th percentiles (Kitchen = 100). Only Friday reached Gremlin with one fixed table. Display only:
 * scores, ghosts and leaderboards are unchanged.
 */
export const RANK_PCT_BY_SHELL: Readonly<Record<number, number>> = {
  0: 100, // Kitchen
  1: 60, // Living room
  2: 40, // Bathroom
  3: 55, // Home office
  4: 150, // Party room
  5: 30, // Bedroom (the Napper)
  6: 150, // Boss: Birthday hall (round 2: 250 % buried most players; Menace needed 5,000 against a median of 500)
  7: 100, // Boss: Wedding hall
  8: 150, // Boss: Christmas
  9: 150, // Boss: New Year's
  10: 100, // Kitchen (dinner)
  11: 55, // Living room (Zoom)
};

/**
 * Rank thresholds of a room from its planner-bot score (QA round 3: titles were inflated, the planner reached
 * Legendary in 9 of 16 rooms): Legendary = bot × 0.9, Gremlin = bot × 0.35, Troublemaker / Menace keep their share
 * of Gremlin and Agent of Chaos sits where it did between Gremlin and Legendary. Until par paws exist
 * (content/rank-bot.json, written by `BADCAT_WRITE_RANKS=1 npx vitest run src/content/rank-bot.test.ts`).
 */
export function rankMinsFromBot(bot: number): number[] {
  const b = Math.max(0, Math.floor(bot));
  const g = Math.floor((b * 35) / 100);
  const l = Math.floor((b * 90) / 100);
  const mins = [0, 1, Math.floor((g * 800) / 5000), Math.floor((g * 2000) / 5000), g, g + Math.floor(((l - g) * 4000) / 9000), l];
  for (let i = 2; i < mins.length; i++) mins[i] = Math.max(mins[i], mins[i - 1] + 1, 2);
  return mins;
}

/** Threshold of rank `i` at `pct` percent (the first two, 0 and 1, never scale); `mins` (a room's bot table) wins. */
export function rankMin(i: number, pct = 100, mins?: readonly number[]): number {
  if (mins && mins.length === RANKS.length && i >= 0 && i < mins.length) return mins[i];
  const r = RANKS[i];
  if (!r) return Infinity;
  if (r.min <= 1 || pct === 100) return r.min;
  return Math.max(2, Math.floor((r.min * pct) / 100));
}

/**
 * "seen 2×" for the result, card and group-chat text (round 3). On a Perfect Crime the count reads as what it was:
 * "spotted 2×, never suspected" (never above 50), or "never spotted"; seenCount counts moving-in-cone moments only.
 */
export function seenText(seenCount: number, stamp: 'perfect' | 'clean' | 'caught'): string {
  const n = Math.max(0, seenCount | 0);
  if (stamp === 'perfect') return n > 0 ? `spotted ${n}×, never suspected` : 'never spotted';
  return n > 0 ? `seen ${n}×` : 'never seen';
}

/** Rank title of a caught run, whatever the score (SIM_VERSION 3). */
export const CAUGHT_RANK = 'Cuddled';

// ---------------------------------------------------------------------------------------------
// Prop catalog (Appendix B, MVP kinds). Shared data: sim scoring, render shapes, audio material.
// ---------------------------------------------------------------------------------------------

export type PropMaterial = 'glass' | 'ceramic' | 'paper' | 'food' | 'plastic' | 'tech' | 'fabric' | 'metal' | 'actor';
/** What happens on landing. */
export type LandKind = 'break' | 'land' | 'spill';

export interface PropKindDef {
  kind: number; // Appendix B id (1..20), FULL build 21..64 (7 bits in the room codec)
  id: string; // stable slug, e.g. 'wine-glass'
  name: string;
  base: number; // base points (M0: stacks count as one prop with the summed base)
  material: PropMaterial;
  onLand: LandKind;
  fragile: boolean;
  /** Swats needed to tip it (heavy props wobble first). */
  swats: 1 | 2 | 3;
  grabbable: boolean;
  /** Blocks the cat's cell like a wall until it falls (all intact props do; decoration does not). */
  blocks: boolean;
  /**
   * M0 decoration only (tablecloth, roomba): never pushed. The v4 rule set reads this as is; the v5 rule set
   * ignores it for kinds that have `pull` or `actor` (those become interactive). Never change it for kinds 1..20.
   */
  inert: boolean;
  /** Toon palette hint for render/shards (0xRRGGBB). */
  color: number;
  // ----- v5 rule data (SIM_VERSION 5; ignored by the v4 rule set) -----
  /** Stack rule (GDD 4.4): falls as one chain event, `items` x `itemBase`, combo +1 per item. base = items x itemBase. */
  stack?: { items: number; itemBase: number };
  /** Puddle left on landing (2 x 2 cells): 'slip' makes the cat slide 1 cell (v5), 'soil' is visual only. */
  puddle?: 'slip' | 'soil';
  /** Pull rule: a cloth drags every prop on it one cell; a cable tips its lamp toward the pull. */
  pull?: 'cloth' | 'cable';
  /** Moving actor (the Roomba). */
  actor?: 'roomba';
  /** Tall prop (Christmas tree): stands on the floor but is swatted from this level; topples `topple` cells. */
  tall?: Level;
  topple?: number;
  /** The cat can step into it (cardboard box; "sit in it" wish). Never blocks, never falls. */
  enterable?: boolean;
  /** Season or theme the kind belongs to (render decoration hint; any room may still place it). */
  theme?: RoomTheme;
  /** Sponsor product: render prints `RoomDef.sponsor.label` on it. */
  sponsor?: boolean;
}

export const PROP_KINDS: readonly PropKindDef[] = [
  // ----- Appendix B MVP kinds (1..20). Fields used by the v4 rule set are frozen; v5 data is additive. -----
  { kind: 1, id: 'wine-glass', name: 'Wine glass', base: 150, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xd8f0ff },
  { kind: 2, id: 'mug', name: 'Mug', base: 100, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xff9f7a },
  { kind: 3, id: 'plate-stack', name: 'Plate stack', base: 320, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xf5efe6, stack: { items: 4, itemBase: 80 } },
  { kind: 4, id: 'fruit-bowl', name: 'Fruit bowl', base: 120, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x8fc7a4 },
  { kind: 5, id: 'egg-carton', name: 'Egg carton', base: 200, material: 'food', onLand: 'spill', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xe9d3a8, puddle: 'slip' },
  { kind: 6, id: 'cake', name: 'Cake', base: 400, material: 'food', onLand: 'spill', fragile: true, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xffc3d5, puddle: 'slip' },
  { kind: 7, id: 'vase', name: 'Vase with flowers', base: 250, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x7fb0e0, puddle: 'slip' },
  { kind: 8, id: 'potted-plant', name: 'Potted plant', base: 180, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xc96f4a, puddle: 'soil' },
  { kind: 9, id: 'lamp', name: 'Lamp', base: 220, material: 'metal', onLand: 'break', fragile: true, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xf2d27a, pull: 'cable' },
  { kind: 10, id: 'tv-remote', name: 'TV remote', base: 60, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x3a3a46 },
  { kind: 11, id: 'laptop', name: 'Laptop', base: 300, material: 'tech', onLand: 'break', fragile: true, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xb8bcc8 },
  { kind: 12, id: 'toilet-roll', name: 'Toilet roll', base: 120, material: 'paper', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xfbfbf5 },
  { kind: 13, id: 'perfume', name: 'Perfume bottle', base: 200, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xf3a6c8 },
  { kind: 14, id: 'tablecloth', name: 'Tablecloth', base: 0, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: false, inert: true, color: 0xe25b5b, pull: 'cloth' },
  { kind: 15, id: 'book-stack', name: 'Book stack', base: 200, material: 'paper', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x6b8fd6, stack: { items: 5, itemBase: 40 } },
  { kind: 16, id: 'ornament', name: 'Christmas ornament', base: 90, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xe63946, theme: 'xmas' },
  { kind: 17, id: 'christmas-tree', name: 'Christmas tree', base: 1500, material: 'fabric', onLand: 'land', fragile: false, swats: 3, grabbable: false, blocks: true, inert: false, color: 0x2f8f4e, tall: 3, topple: 4, theme: 'xmas' },
  { kind: 18, id: 'slipper', name: 'Slipper', base: 0, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xffb3c7 },
  { kind: 19, id: 'sock', name: 'Sock', base: 0, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xfff3dc },
  { kind: 20, id: 'roomba', name: 'Roomba', base: 0, material: 'actor', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: true, color: 0x2f3138, actor: 'roomba' },
  // ----- FULL build kinds (21..63): Appendix A targets and wishes, Season 1, sponsor product. v5 rooms only. -----
  { kind: 21, id: 'tuna-can', name: 'Tuna can', base: 90, material: 'metal', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x9fb8c8 },
  { kind: 22, id: 'popcorn-bowl', name: 'Popcorn bowl', base: 140, material: 'food', onLand: 'spill', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xfff1b8 },
  { kind: 23, id: 'yarn-ball', name: 'Knitting yarn', base: 0, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xc77dff },
  { kind: 24, id: 'rubber-duck', name: 'Rubber duck', base: 0, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xffd23f },
  { kind: 25, id: 'toothbrush-cup', name: 'Toothbrush cup', base: 110, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x9be7d8 },
  { kind: 26, id: 'pen-cup', name: 'Pen cup', base: 90, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x4a6fa5 },
  { kind: 27, id: 'cups-tower', name: 'Cups tower', base: 180, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xff595e, stack: { items: 6, itemBase: 30 } },
  { kind: 28, id: 'balloon', name: 'Balloon', base: 80, material: 'plastic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x8ac926, theme: 'birthday' },
  { kind: 29, id: 'ribbon', name: 'Ribbon', base: 0, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xff4d8d },
  { kind: 30, id: 'gift-stack', name: 'Gift stack', base: 360, material: 'paper', onLand: 'land', fragile: false, swats: 2, grabbable: false, blocks: true, inert: false, color: 0x5ec2b7, stack: { items: 3, itemBase: 120 } },
  { kind: 31, id: 'punch-bowl', name: 'Punch bowl', base: 260, material: 'glass', onLand: 'spill', fragile: true, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xff7b9c, puddle: 'slip' },
  { kind: 32, id: 'birthday-candles', name: 'Birthday candles', base: 60, material: 'food', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xfff275, theme: 'birthday' },
  { kind: 33, id: 'laundry-basket', name: 'Laundry basket', base: 150, material: 'fabric', onLand: 'spill', fragile: false, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xd9c5a0 },
  { kind: 34, id: 'alarm-clock', name: 'Alarm clock', base: 80, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xef476f },
  { kind: 35, id: 'jewellery-dish', name: 'Jewellery dish', base: 140, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xf6d6ad },
  { kind: 36, id: 'cookie-tray', name: 'Cookie tray', base: 220, material: 'metal', onLand: 'spill', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xc68b59 },
  { kind: 37, id: 'flour-bag', name: 'Flour bag', base: 160, material: 'paper', onLand: 'spill', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xf4efe3, puddle: 'soil' },
  { kind: 38, id: 'mixer-bowl', name: 'Mixer bowl', base: 160, material: 'ceramic', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xe5e5e5 },
  { kind: 39, id: 'butter', name: 'Butter', base: 0, material: 'food', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xffe08a },
  { kind: 40, id: 'board-game', name: 'Board game', base: 130, material: 'paper', onLand: 'spill', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x3d5a80 },
  { kind: 41, id: 'snack-tower', name: 'Snack tower', base: 200, material: 'food', onLand: 'spill', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xf4a259, stack: { items: 4, itemBase: 50 } },
  { kind: 42, id: 'controller', name: 'Game controller', base: 110, material: 'tech', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x2b2d42 },
  { kind: 43, id: 'dice', name: 'Dice', base: 0, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xfdfdfd },
  { kind: 44, id: 'scented-candle', name: 'Scented candle', base: 120, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xe9c46a },
  { kind: 45, id: 'face-mask-jar', name: 'Face-mask jar', base: 150, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xb5e2fa },
  { kind: 46, id: 'towel-stack', name: 'Towel stack', base: 120, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x90caf9, stack: { items: 3, itemBase: 40 } },
  { kind: 47, id: 'gravy-boat', name: 'Gravy boat', base: 180, material: 'ceramic', onLand: 'spill', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xa47148, puddle: 'slip', theme: 'thanksgiving' },
  { kind: 48, id: 'pie', name: 'Pie', base: 300, material: 'food', onLand: 'spill', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xe76f51, puddle: 'slip' },
  { kind: 49, id: 'turkey-platter', name: 'Turkey platter', base: 350, material: 'ceramic', onLand: 'break', fragile: true, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xbc6c25, theme: 'thanksgiving' },
  { kind: 50, id: 'turkey-leg', name: 'Turkey leg', base: 0, material: 'food', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0xc97c3d },
  { kind: 51, id: 'box-tower', name: 'Box tower', base: 210, material: 'paper', onLand: 'land', fragile: false, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xc89f6d, stack: { items: 3, itemBase: 70 } },
  { kind: 52, id: 'bubble-wrap', name: 'Bubble wrap', base: 30, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xdff6ff },
  { kind: 53, id: 'receipt-pile', name: 'Receipt pile', base: 40, material: 'paper', onLand: 'spill', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xfefae0 },
  { kind: 54, id: 'cardboard-box', name: 'Cardboard box', base: 0, material: 'paper', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: false, inert: false, color: 0xb08955, enterable: true },
  { kind: 55, id: 'champagne-tower', name: 'Champagne tower', base: 360, material: 'glass', onLand: 'break', fragile: true, swats: 2, grabbable: false, blocks: true, inert: false, color: 0xf7e7b4, stack: { items: 6, itemBase: 60 }, theme: 'wedding' },
  { kind: 56, id: 'bouquet', name: 'Bouquet', base: 90, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xffafcc, theme: 'wedding' },
  { kind: 57, id: 'phone', name: 'Phone', base: 250, material: 'tech', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x22223b },
  { kind: 58, id: 'water-glass', name: 'Water glass', base: 120, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xcdeffd, puddle: 'slip' },
  { kind: 59, id: 'blanket', name: 'Blanket', base: 0, material: 'fabric', onLand: 'land', fragile: false, swats: 1, grabbable: true, blocks: false, inert: false, color: 0x8ecae6 },
  { kind: 60, id: 'snow-globe', name: 'Snow globe', base: 200, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xe0fbfc, puddle: 'slip', theme: 'xmas' },
  { kind: 61, id: 'gift-wrap', name: 'Gift wrap roll', base: 60, material: 'paper', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xd62828, theme: 'xmas' },
  { kind: 62, id: 'champagne-bottle', name: 'Champagne bottle', base: 200, material: 'glass', onLand: 'spill', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0x386641, puddle: 'slip', theme: 'nye' },
  { kind: 63, id: 'sponsor-product', name: 'Sponsor product', base: 150, material: 'plastic', onLand: 'land', fragile: false, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xff8fab, sponsor: true },
  // ----- Round 2 (QA): the high-shelf hero of the Bathroom and the Bedroom (they had no big crash) -----
  { kind: 64, id: 'perfume-tray', name: 'Perfume tray', base: 280, material: 'glass', onLand: 'break', fragile: true, swats: 1, grabbable: false, blocks: true, inert: false, color: 0xf3a6c8, stack: { items: 4, itemBase: 70 } },
];

/** Lookup by Appendix B kind id; undefined for unknown kinds. */
export function propKind(kind: number): PropKindDef | undefined {
  for (let i = 0; i < PROP_KINDS.length; i++) if (PROP_KINDS[i].kind === kind) return PROP_KINDS[i];
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------------------------

export type Pattern = 'solid' | 'tabby' | 'tuxedo' | 'bicolor' | 'calico' | 'colorpoint' | 'tortie';
export const PATTERNS: readonly Pattern[] = ['solid', 'tabby', 'tuxedo', 'bicolor', 'calico', 'colorpoint', 'tortie'];
/** M0 ships these two (GDD 6.1). */
export const M0_PATTERNS: readonly Pattern[] = ['solid', 'tabby'];

export interface CatSpec {
  pattern: Pattern;
  ears: 'normal' | 'fold';
  tail: 'normal' | 'fluffy' | 'bob';
  body: 'slim' | 'normal' | 'chonk';
  eyes: number; // 0..5 index into EYE_COLORS
  base: number; // RGB565
  secondary: number; // RGB565
  tertiary: number; // RGB565
  collar: number; // cosmetic id, 0 = none
  hat: number; // cosmetic id, 0 = none
  name: string; // filtered, <= 12 chars
}
export const EYE_COLORS: readonly number[] = [0xf2c14e, 0x7cc36a, 0x5fa8e8, 0xd98b3a, 0x9bd6c8, 0xb07fd8];

/** RGB888 (0xRRGGBB) -> RGB565. */
export function rgb565(rgb: number): number {
  return (((rgb >> 19) & 0x1f) << 11) | (((rgb >> 10) & 0x3f) << 5) | ((rgb >> 3) & 0x1f);
}
/** RGB565 -> RGB888 (0xRRGGBB). */
export function rgb888(c: number): number {
  const r = (c >> 11) & 0x1f;
  const g = (c >> 5) & 0x3f;
  const b = c & 0x1f;
  return (((r << 3) | (r >> 2)) << 16) | (((g << 2) | (g >> 4)) << 8) | ((b << 3) | (b >> 2));
}

/** FTUE skip cat: grey tabby "Tofu" (GDD 8). */
export const DEFAULT_CAT: CatSpec = Object.freeze({
  pattern: 'tabby',
  ears: 'normal',
  tail: 'normal',
  body: 'normal',
  eyes: 0,
  base: rgb565(0x9a9aa2),
  secondary: rgb565(0x5b5b66),
  tertiary: rgb565(0xf2efe9),
  collar: 0,
  hat: 0,
  name: 'Tofu',
}) as CatSpec;

/** Face decal: on device only (IndexedDB), never in links. */
export interface FaceDecal {
  texture: Blob; // 256 x 256 PNG with feathered alpha
  crop: { x: number; y: number; w: number; h: number }; // crop rect in OPENER-photo pixels (round 3; was source px)
}

// ---------------------------------------------------------------------------------------------
// Rooms: definition (data, links), shell (furniture heightmap), routine (human), resolved bundle
// ---------------------------------------------------------------------------------------------

export interface Cell {
  level: Level;
  occludes: 0 | 1;
  propId: number; // -1 = none
}

export interface PropPlacement {
  kind: number;
  x: number;
  z: number;
  level: Level; // must equal the shell's surface level at (x, z)
  rot: 0 | 1 | 2 | 3; // render only
  target?: boolean; // Must-Wreck
  /** v5 cloth (kind 14): cells covered along x / z from (x, z), default 1. Props on covered cells ride the cloth. */
  w?: number;
  d?: number;
  /** v5 cable (pull 'cable'): floor cell where the cable hangs; default = the floor cell next to (x, z) in `rot` direction. */
  cable?: { x: number; z: number };
}

export interface RoomDef {
  id: string; // 'daily-018', 'glass', 'kitchen-v3', 'ugc-<crc32>'
  shell: number; // index into content SHELLS
  routine: number; // index into content ROUTINES
  event: number; // RoomEventKind
  width: number; // 12 (boss 14)
  depth: number; // 10 (boss 12)
  spawn: { x: number; z: number };
  props: PropPlacement[];
  seed: number; // uint32, seeds the sim RNG
  ticks: number; // RUN_TICKS unless FTUE/boss
  title?: string; // "Kitchen #18: Breakfast Heist"
  /** M1b: today's Pink Paw cat lounges at (x, z, level) (render only) and wishes for prop `wishPropIndex` (+500). */
  accomplice?: { pinkPawId: string; wishPropIndex: number; x?: number; z?: number; level?: Level };
  sponsor?: { propIndex: number; label: string; url?: string }; // M1b
  par?: { bronze: number; silver: number; gold: number }; // M1a
  author?: string; // M2
  ancestors?: string[]; // M2
  /** M2 boss rooms: second human's routine index (two humans, one shared suspicion meter). */
  routine2?: number;
  /** Decoration theme (render, audio): S1 Christmas, birthday, wedding, NYE... Default 'default'. */
  theme?: RoomTheme;
  /** Boss room (Saturday, 90 s, 14 x 12). */
  boss?: boolean;
  /**
   * Weekday difficulty (GDD 4.3): telegraph length in ticks for every human of this room (Mon 24 -> Sat 15).
   * Overrides RoutineDef.telegraph in `resolve`; travels in room codec v2 (5 bits) so ghosts replay exactly.
   */
  telegraph?: number;
}

/** Visual/audio themes (render decorations, audio layers). Never changes rules. */
export type RoomTheme = 'default' | 'xmas' | 'birthday' | 'wedding' | 'nye' | 'valentine' | 'thanksgiving' | 'spring';

/** Furniture piece in a shell (render draws it; the sim only sees the heightmap). */
export type FurnitureType =
  // M0 Kitchen
  | 'counter' | 'table' | 'chair' | 'shelf' | 'fridge' | 'stove' | 'sink' | 'sofa' | 'cat-bed' | 'rug' | 'window' | 'cabinet'
  // FULL build shells (living room, bathroom, home office, party room, bedroom, boss rooms)
  | 'bathtub' | 'toilet' | 'mirror' | 'vanity' | 'tv' | 'tv-stand' | 'coffee-table' | 'desk' | 'office-chair'
  | 'bookcase' | 'bed' | 'nightstand' | 'wardrobe' | 'dresser' | 'party-table' | 'buffet' | 'fireplace'
  | 'washing-machine' | 'arch' | 'webcam' | 'door' | 'armchair' | 'plant-stand' | 'stage';
export interface FurniturePiece {
  type: FurnitureType;
  x: number;
  z: number;
  w: number; // cells along x
  d: number; // cells along z
  level: Level; // top surface level
  color?: number; // 0xRRGGBB toon colour override
}

export interface ShellDef {
  id: number;
  name: string; // 'Kitchen'
  width: number;
  depth: number;
  /** Surface level per cell, row-major (z * width + x), length width * depth. */
  levels: readonly Level[];
  /** 1 where furniture is L2+ and blocks sight, same layout. */
  occludes: readonly (0 | 1)[];
  furniture: readonly FurniturePiece[];
  /** Where the human stands (a floor or seat cell, L0-L1: sofa, bed, office chair; the cat cannot enter it). */
  humanSpot: { x: number; z: number };
  /** Cell the human walks to (or faces away from) during the room event; may be outside the grid (left the room). */
  humanEventSpot: { x: number; z: number };
  /** Stash target for grabbables. */
  catBed: { x: number; z: number };
  wallColor?: number;
  floorColor?: number;
  // ----- FULL build (all optional; the Kitchen has none of the v5 ones except roombaLoop/spectators/fridgeWall) -----
  /** Second human (boss rooms). */
  humanSpot2?: { x: number; z: number };
  humanEventSpot2?: { x: number; z: number };
  /** Roomba loop: floor cells in order (closed loop, each step to an 8-way neighbour). v5 sim + render. */
  roombaLoop?: readonly { x: number; z: number }[];
  /** Wednesday mirror: a second, short cone (MIRROR_RANGE) from this cell while the human is BUSY (v5). */
  mirror?: { x: number; z: number; facing: Facing };
  /** Thursday webcam: crashes inside its cone (MIRROR_RANGE cells) score +ON_CAMERA_PCT % (v5). */
  webcam?: { x: number; z: number; facing: Facing };
  /** Cameo spectator spots (windowsills, shelves): render only, never in the sim. 10..15 per shell. */
  spectatorSlots?: readonly { x: number; z: number; level: Level }[];
  /** Club fridge wall (40 face magnets): render only. Kitchen-type shells. */
  fridgeWall?: { x: number; z: number; w: number };
  /** Default accomplice lounge spot (render only) when the room does not give one. */
  accompliceSpot?: { x: number; z: number; level: Level };
  /** Room Maker: offered as a shell in the editor (the 6 home shells). */
  maker?: boolean;
}

/**
 * 0 doorbell, 1 kettle, 2 phone call, 3 ad break (M0) | 4 oven ding, 5 lights off ("Surprise!"), 6 alarm,
 * 7 song / speeches, 8 guests arrive, 9 courier, 10 pizza delivery, 11 you're on mute (FULL build; 4 bits in room codec v2).
 */
export type RoomEventKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export const ROOM_EVENT_NAMES: readonly string[] = [
  'DELIVERY!',
  'KETTLE!',
  'PHONE CALL!',
  'AD BREAK!',
  'OVEN DING!',
  'SURPRISE!',
  'ALARM!',
  'SPEECHES!',
  'GUESTS!',
  'COURIER!',
  'PIZZA!',
  "YOU'RE ON MUTE!",
];

/** Human routine (GDD 4.3). All durations in ticks; ranges are inclusive [min, max], rolled with the sim RNG. */
export interface RoutineDef {
  id: number;
  name: string; // 'Chef Dad'
  busy: [number, number]; // 90..270
  telegraph: [number, number]; // 15..24 (day difficulty)
  look: [number, number]; // 45..105
  fakeOutPct: number; // 20 = 20 % of turns after fakeOutAfterTick
  fakeOutAfterTick: number; // 900 (30 s)
  escalateAfterTick: number; // 1350 (45 s): look +15 ticks, busy -30 ticks
  lookBonusTicks: number; // 15
  busyCutTicks: number; // 30
  /** Tick the room event starts (≈ 35-45 s; FTUE fixes it at 450 = 15 s). */
  eventTick: number;
  /** Facing while BUSY (away from the room). */
  busyFacing: Facing;
  /** Facings the LOOK picks from with the RNG (toward the room). */
  lookFacings: readonly Facing[];
  /** Telegraph cue label for UI/audio ('stove timer', 'TV jingle'). */
  cue: string;
  outfitColor?: number;
  // ----- FULL build (optional) -----
  /** 'napper' (Sunday): sleeps; a noise meter (NOISE) replaces the cone until it wakes. Default 'watcher'. */
  kind?: 'watcher' | 'napper';
  /** Wednesday: a mirror cone while BUSY (needs ShellDef.mirror). */
  mirror?: boolean;
  /** Thursday: on-camera bonus (needs ShellDef.webcam); "you're on mute" telegraph cue. */
  onCamera?: boolean;
  /** Who it is, for render (outfit, prop in hand, pose) and audio (voice). */
  persona?: 'chef-dad' | 'couch-potato' | 'skincare-sis' | 'wfh-worker' | 'party-host' | 'napper' | 'grandma' | 'caterer';
  /** Prop in hand (render only). */
  holding?: 'pan' | 'remote' | 'phone' | 'laptop' | 'tray' | 'mug' | 'book' | 'none';
  /** Pose while BUSY (render only): napper lies down, couch potato sits. */
  pose?: 'stand' | 'sit' | 'lie';
  /** Room Maker: offered in the editor (Chef Dad, Couch Potato, WFH Worker, Napper). */
  maker?: boolean;
  /**
   * SIM_VERSION 8: this human's looks see over furniture up to this level (the Couch Potato sits up from the sofa and
   * looks over the coffee table; QA round 3: his cones covered 37–47 % of the swat cells and a cat that never froze
   * was never seen). Ignored under the v4..v7 rules.
   */
  lookOverV8?: number;
  /**
   * SIM_VERSION 8: this human's cone length in cells (normal rooms use CONE_RANGE_V6 = 7). The Party Host works the
   * whole room (QA round 3: a cat that never froze camped in the front corners, 8 cells away, and was never caught).
   */
  coneRangeV8?: number;
}

/** What the sim, render and validator consume: a RoomDef resolved against its shell and routine. */
export interface PlayableRoom {
  room: RoomDef;
  shell: ShellDef;
  routine: RoutineDef;
  /** 'ranked' | 'practice' | 'ftue' changes ticks and first-turn/event timing (FTUE: first turn 240, event 450). */
  mode: RunMode;
  dayNo?: number;
  /** Boss rooms (FULL build): the second human's routine (RoomDef.routine2 resolved). */
  routine2?: RoutineDef;
  /** Rank title thresholds of this room in percent of RANKS (content.resolve: RANK_PCT_BY_SHELL; default 100). */
  rankPct?: number;
  /** Rank thresholds of this room from its planner-bot score (rankMinsFromBot); wins over rankPct when set. */
  rankMins?: readonly number[];
}
export type RunMode = 'ranked' | 'practice' | 'ftue';

// ---------------------------------------------------------------------------------------------
// Sim state (plain data only; snapshot = structuredClone(state))
// ---------------------------------------------------------------------------------------------

/** Cat action states. (Task naming: trot = SNEAK, run = TROT.) */
export const CatAct = {
  IDLE: 0,
  SNEAK: 1,
  TROT: 2,
  JUMP: 3,
  SWAT: 4,
  GRAB: 5,
  LOAF: 6,
  CUDDLED: 7,
} as const;
export type CatAct = (typeof CatAct)[keyof typeof CatAct];
/** Acts that gain suspicion in a cone (GDD 4.3). IDLE and LOAF are frozen: "he can't tell". Shared by sim, HUD and render. */
export function catActGainsSuspicion(act: number): boolean {
  return act === CatAct.SNEAK || act === CatAct.TROT || act === CatAct.JUMP || act === CatAct.SWAT || act === CatAct.GRAB;
}

export interface CatState {
  x: number; // current (target) cell
  z: number;
  level: Level;
  fromX: number; // cell the current step/jump started in (== x,z when at rest)
  fromZ: number;
  fromLevel: Level;
  stepTicks: number; // total ticks of the current step/jump (0 = at rest)
  stepProgress: number; // ticks elapsed in the current step/jump (0..stepTicks)
  facing: Facing;
  act: CatAct;
  actTimer: number; // ticks left in SWAT/GRAB lock or CUDDLED
  idleTicks: number; // consecutive ticks with no input (loaf after LOAF_DELAY_TICKS)
  carrying: number; // prop index in the mouth, -1 = none
  stashed: number; // grabbables stashed in the cat bed (max BONUS.stashMax)
}

export const HumanSt = {
  BUSY: 0,
  TELEGRAPH: 1,
  LOOK: 2,
  FAKEOUT: 3,
  EVENT: 4,
  /** v5 Napper: asleep, no cone; the noise meter decides when it wakes (TELEGRAPH = yawn). */
  NAP: 5,
} as const;
export type HumanSt = (typeof HumanSt)[keyof typeof HumanSt];

export interface HumanState {
  x: number; // head cell (cone origin)
  z: number;
  facing: Facing;
  state: HumanSt;
  timer: number; // ticks left in the current state
  stateTicks: number; // total ticks of the current state (for render progress)
  telegraph: number; // length of the current/next telegraph in ticks
  fakeOut: 0 | 1; // the current TELEGRAPH ends in FAKEOUT, not LOOK
  lookFacing: Facing; // facing the next/current LOOK uses
  eventDone: 0 | 1; // the once-per-room event has happened
  turns: number; // LOOKs started (stats)
  lookStartTick: number; // tick the last LOOK started (-1 none), for "turned too late"
  /** v5: routine index this human runs (boss rooms: humans[1] uses RoomDef.routine2). */
  routine?: number;
  /** v8: this human looks over furniture up to this level (RoutineDef.lookOverV8: the Couch Potato sits up). */
  over?: number;
  /** v8: the last turn was a fake-out (two in a row never happen: the next turn is a real look). */
  lastFake?: 0 | 1;
  /** v8: squared cone length of this human (RoutineDef.coneRangeV8), overrides the room's. */
  r2?: number;
}

export const PropSt = {
  REST: 0,
  WOBBLE: 1,
  FALLING: 2,
  BROKEN: 3,
  LANDED: 4,
  SPILLED: 5,
  CARRIED: 6,
  STASHED: 7,
} as const;
export type PropSt = (typeof PropSt)[keyof typeof PropSt];

export interface PropState {
  kind: number;
  x: number; // current cell (landing cell once FALLING)
  z: number;
  level: Level; // current level (target level once FALLING)
  fromX: number; // fall start cell
  fromZ: number;
  fromLevel: Level;
  state: PropSt;
  swats: number; // swats received (heavy props tip at PropKindDef.swats)
  fallTimer: number; // ticks left in FALLING (0 otherwise)
  fallTicks: number; // total fall ticks (render lerp)
  dir: Dir8; // push direction of the fall
  chain: number; // cascade depth (0 = pushed by the cat)
  points: number; // points awarded for this prop (0 until scored)
  target: 0 | 1; // Must-Wreck
  hit: 0 | 1; // counted as "hit" by an occupied-landing collision
  seen: 0 | 1; // its fall already added suspicion
  restTick: number; // tick it reached BROKEN/LANDED/SPILLED (-1 while intact)
  // ----- v5 (optional; set by initSim under rules >= 5) -----
  /** Cloth: times pulled (max 2). Cable lamp: 1 once its cable was pulled. */
  pulls?: number;
  /** Cloth: current covered extent (moves with each pull). */
  w?: number;
  d?: number;
  /** Swats taken while standing (tall props) or wobble count; render reads it for the sway. */
  sway?: number;
  /** 1 = it fell or was hit while a human looked at the Roomba within 1 cell (framed). */
  framed?: 0 | 1;
  /** 1 = its crash happened inside the webcam's view (Thursday +50 %). */
  onCam?: 0 | 1;
}

/** Static grid + dynamic prop occupancy (typed arrays copy with structuredClone). */
export interface GridState {
  w: number;
  d: number;
  level: Uint8Array; // Level per cell (shell, static)
  occludes: Uint8Array; // 0/1 per cell (shell, static)
  propAt: Int16Array; // intact prop index resting on the cell's top surface, -1 none
  /** v5: floor puddles per cell, 0 none, 1 slippery (cat slides 1 cell), 2 soil (visual only). */
  puddle?: Uint8Array;
}

/** v5 Roomba (prop kind 20 placed on a floor cell of ShellDef.roombaLoop). Integer state like the cat's steps. */
export interface RoombaState {
  prop: number; // prop index of the Roomba
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  loopIndex: number; // index into ShellDef.roombaLoop of (x, z)
  stepProgress: number; // 0..ROOMBA_STEP_TICKS
  facing: Facing;
  /** Ticks left paused (bumped by a falling prop or the cat in its way). */
  pause: number;
}

export interface SimState {
  tick: number;
  ticks: number; // run length (room.ticks or FTUE_TICKS)
  rng: number; // xorshift32 state (sim/rng.ts)
  grid: GridState;
  cat: CatState;
  humans: HumanState[]; // 1 in M0 (2 in boss rooms, M2)
  props: PropState[];
  suspicion: number; // milli-units 0..SUSPICION_MAX (shared by all humans)
  maxSuspicion: number;
  seen: 0 | 1; // cat visible in an active cone this tick
  seenCount: number; // distinct spotted episodes
  score: number; // running total before end-of-run modifiers
  combo: number; // current multiplier 1..COMBO_MAX
  maxCombo: number;
  comboTimer: number; // ticks left before the chain ends
  targetsHit: number; // Must-Wreck targets wrecked (0..3)
  wish: 0 | 1; // accomplice wish granted (M1b)
  framed: number; // M1a
  eventActive: 0 | 1; // room event window
  lastCall: 0 | 1;
  firstCrashTick: number; // -1 until the first break/land/spill
  stamp: 0 | 1 | 2 | 3; // 0 none yet, 1 perfect, 2 clean, 3 caught (set when ended)
  caughtTick: number; // -1 unless caught
  ended: 0 | 1;
  finalScore: number; // score after Perfect/Caught modifiers (set when ended)
  /** Buttons pressed while the cat was mid-step or locked; they fire on the first free tick (L1). */
  btnBuf: number;
  // ----- v5 (optional so v4 fixtures still type-check; initSim always sets them) -----
  /** Rule set of this run: SIM_VERSION when recorded (4 = M0 rules, 5 = FULL). hashState hashes this, not the constant. */
  rules?: number;
  /** Napper noise meter, 0..NOISE.max (0 when no napper). */
  noise?: number;
  maxNoise?: number;
  roomba?: RoombaState | null;
  /** Times the cat slid on a puddle; cloth/cable pulls done; crashes on camera (stats for result, Rap Sheet). */
  slides?: number;
  pulls?: number;
  onCamera?: number;
  /** The cat is inside an enterable prop (box), prop index or -1. */
  inBox?: number;
  // v5 internals (hashed under rules 5; survive structuredClone). Read-only outside src/sim.
  /** 1 while the current step is a puddle slide (slides never chain). */
  slideStep?: number;
  /** 1 when something made noise this tick (the napper's meter decays only on quiet ticks). */
  noisy?: number;
  /** Prop index of the accomplice's wish (RoomDef.accomplice.wishPropIndex), -1 none. */
  wishProp?: number;
  /** Human index of the napper, -1 none. */
  napper?: number;
  /** Cable cells of cable lamps: [propIndex, x, z, propIndex, x, z, ...]. */
  cables?: number[];
}

export type StampId = 'perfect' | 'clean' | 'caught';
export const STAMP_IDS: readonly (StampId | null)[] = [null, 'perfect', 'clean', 'caught'];

// ---------------------------------------------------------------------------------------------
// Sim events (renderer, audio, highlights, analytics read these; never write state)
// ---------------------------------------------------------------------------------------------

export type HumanStateName = 'busy' | 'telegraph' | 'look' | 'fakeout' | 'event' | 'nap';

export type SimEvent =
  | { t: 'step'; tick: number; level: Level; speed: Speed }
  | { t: 'jump'; tick: number; from: Level; to: Level }
  | { t: 'swat'; tick: number; prop: number } // prop -1 = swat at air
  | { t: 'wobble'; tick: number; prop: number }
  | { t: 'push'; tick: number; prop: number }
  | { t: 'fall'; tick: number; prop: number; from: Level; dir: Dir8 }
  | {
      t: 'break' | 'land' | 'spill' | 'hit';
      tick: number;
      prop: number;
      points: number;
      combo: number;
      /** v5: inside the webcam view (Thursday +50 %). */
      cam?: boolean;
      /** v5: the crash was blamed on the Roomba (no suspicion from it). */
      framed?: boolean;
    }
  | { t: 'target'; tick: number; prop: number }
  | { t: 'wish'; tick: number }
  | { t: 'framed'; tick: number; prop: number }
  | { t: 'grab' | 'drop' | 'stash'; tick: number; prop: number }
  | { t: 'loaf'; tick: number }
  | { t: 'human'; tick: number; human: number; state: HumanStateName }
  /** SIM_VERSION 4: the cat moved (gained suspicion) in a cone; a frozen cat in sight is not "seen". v5: `by` who saw. */
  | { t: 'seen'; tick: number; suspicion: number; by?: 'human' | 'mirror'; human?: number }
  /** SIM_VERSION 8: frozen in a cone right next to a fresh mess ("red-pawed"); once per stretch. */
  | { t: 'redpaw'; tick: number; human: number }
  // ----- v5 events (SIM_VERSION 5) -----
  /** The cat slid on a slippery puddle from one cell to the next. */
  | { t: 'slide'; tick: number; fromX: number; fromZ: number; x: number; z: number }
  /** A stack prop came down: `items` pieces, `points` total (combo rose by `items`). Followed by its break/land. */
  | { t: 'stack'; tick: number; prop: number; items: number; points: number }
  /** Cloth or cable pulled toward the cat; `moved` = props dragged (cloth) or 1 (cable). */
  | { t: 'pull'; tick: number; prop: number; dir: Dir8; kind: 'cloth' | 'cable'; moved: number }
  /** A tall prop (tree) toppled across `cells` cells. */
  | { t: 'topple'; tick: number; prop: number; cells: number; dir: Dir8 }
  /** A puddle appeared (or the Roomba spread one) at (x, z). */
  | { t: 'puddle'; tick: number; x: number; z: number; kind: 1 | 2 }
  /** Napper: the noise meter crossed a quarter (25/50/75/100 %) going up; level in milli-units. */
  | { t: 'noise'; tick: number; level: number }
  /** Napper woke up (noise hit the max): a yawn TELEGRAPH and a LOOK follow. */
  | { t: 'wake'; tick: number; human: number }
  /** The cat sat in an enterable prop (box). */
  | { t: 'enter'; tick: number; prop: number }
  /** The Roomba moved to a new cell (render can also read SimState.roomba). */
  | { t: 'roomba'; tick: number; x: number; z: number }
  /** SIM_VERSION 4: a jump (or a push into a ledge) aimed at a surface 2+ levels up with no seat to hop through. */
  | { t: 'cantReach'; tick: number; level: Level }
  | { t: 'lastcall'; tick: number }
  | { t: 'caught'; tick: number }
  | { t: 'end'; tick: number };

export interface RunResult {
  roomId: string;
  dayNo?: number;
  mode: RunMode;
  simVersion: number;
  score: number; // final score after modifiers
  stamp: StampId;
  rank: string;
  maxCombo: number;
  seenCount: number;
  targets: number;
  framed: number;
  ticks: number; // ticks actually played
  timeline: string; // emoji line (M1a may leave '')
  inputs: TickInput[];
  events: SimEvent[];
  finalHash: number;
  // ----- v5 (optional) -----
  wish?: boolean;
  stashed?: number;
  slides?: number;
  pulls?: number;
  onCamera?: number;
  maxNoise?: number;
  /** Number of humans in the room (2 in boss rooms). */
  humans?: number;
}

/** Sim API (L1, src/sim/index.ts). */
export interface SimApi {
  /** `opts.simVersion` (default SIM_VERSION) picks the rule set; MIN_REPLAY_SIM_VERSION..SIM_VERSION are valid. */
  initSim(play: PlayableRoom, cat: CatSpec, opts?: { simVersion?: number }): SimState;
  stepSim(s: SimState, play: PlayableRoom, input: TickInput, out: SimEvent[]): void; // mutates s
  runToEnd(play: PlayableRoom, cat: CatSpec, inputs: readonly TickInput[], opts?: { simVersion?: number }): RunResult;
  hashState(s: SimState): number;
}

// ---------------------------------------------------------------------------------------------
// Render (L3)
// ---------------------------------------------------------------------------------------------

export interface ClipShot {
  focusProp: number; // -1 = focus the cat
  push: number; // 0..1 push-in progress
  closeUp: boolean; // match-cut pose framing (face fills FACE_RECT)
  /** Round 3: keep the human's head in the follow shot (a TELEGRAPH or LOOK overlaps the clip window). */
  human?: boolean;
  /** Round 2 (QA): a wide establishing shot of the whole room (a run with no crime to follow). */
  wide?: boolean;
  /** Round 2 (QA): a 0.6 s cut to the human as he turns ("turned too late" reads on his face). */
  humanCut?: boolean;
  /**
   * Round 3 (virality): 2–11 s, the camera is locked to a box around the cat and the target (CRIME_BOX_W wide), the
   * target at least a quarter of the frame height. Set by shotForFrame on every crime frame.
   */
  crimeBox?: boolean;
  /** Round 3 (virality): 9–11 s, a 2-shot of the falling object and the human (his double-take in frame). */
  twoShot?: boolean;
}
/** Face rectangle in 720 x 1280 clip space that the match-cut pose fills (L6 aligns the photo crop to it). */
export const CLIP_W = 720;
export const CLIP_H = 1280;
export const FACE_RECT = { x: 210, y: 380, w: 300, h: 300 } as const;

export interface RenderOptions {
  reduceMotion?: boolean;
  quality?: 'low' | 'mid' | 'high';
}

export type RenderLayout = 'portrait' | 'streamer' | 'editor';

export interface Renderer {
  readonly canvas: HTMLCanvasElement;
  load(play: PlayableRoom, cats: CatSpec[], faces?: Map<number, FaceDecal>): Promise<void>; // cats[0] = player; [1..] ghosts (M1)
  /** Draw one frame. alpha = fraction (0..1) of the next tick elapsed, for interpolation. */
  frame(s: SimState, alpha: number, events: readonly SimEvent[]): void;
  /** Live: fit the container. Clip pass: { w: 720, h: 1280, hud: false }. */
  setTarget(size: { w: number; h: number; hud: boolean }): void;
  /** null = gameplay camera (whole room); a shot = clip camera. */
  setClipShot(shot: ClipShot | null): void;
  /** Ghost cats (M1): sim states of ghost runs drawn translucent. */
  setGhosts?(states: SimState[]): void;
  /** Run intro (GDD 3.1): 0..1 progress from the cat's close-up to the whole room; null = off. Render only. */
  setIntro?(p: number | null): void;
  /** Screen position (0..1, y down) of prop `i` as last drawn (HUD point pops), null if unknown. */
  projectProp?(i: number): { x: number; y: number } | null;
  /** The current frame as an image URL (result backdrop before the clip pass), null if unavailable. */
  snapshot?(type?: string, quality?: number): string | null;
  /** Same as snapshot, as a Blob (encoded off the main thread where the browser can). */
  snapshotBlob?(type?: string, quality?: number): Promise<Blob | null>;
  onContextLost(cb: (lost: boolean) => void): void;
  dispose(): void;
  // ----- FULL build (optional) -----
  /** Cameo spectators on windowsills/shelves and the Club fridge wall (render only). null clears. */
  setCameos?(bundle: CameoBundle | null, faces?: ReadonlyMap<string, ImageBitmap | HTMLCanvasElement>): void;
  /** Today's Pink Paw accomplice lounging in the room, with its wish bubble. null clears. */
  setAccomplice?(a: AccompliceView | null): void;
  /** Screen point (client px) -> grid cell under it (top surface), null outside the room. Room Maker. */
  pickCell?(clientX: number, clientY: number): { x: number; z: number; level: Level } | null;
  /** Room Maker overlay (grid, hover cell, invalid cells, target rings). null hides it. */
  setEditorOverlay?(o: EditorOverlay | null): void;
  /** Screen position (0..1, y down) of a world cell centre at a level; onScreen false when outside the view. */
  projectWorld?(x: number, z: number, level: number): { x: number; y: number; onScreen: boolean } | null;
  /**
   * Club streamer flag: 16:9 layout with the stage centred (the DOM adds the dare QR). `editor`: the Room Maker's
   * whole-room pose at a steep pitch, so cells behind tall furniture stay tappable.
   */
  setLayout?(layout: RenderLayout): void;
  /** Cosmetic trail id behind the player cat (0 = none). */
  setTrail?(id: number): void;
  /** Cameo under a screen point (client px): spectator or fridge magnet, for name tags (GDD 3.4). */
  spectatorAt?(clientX: number, clientY: number): CameoEntry | null;
  /** Screen position (0..1, y down) of human i's head, for the HUD suspicion eye; null when unknown. */
  projectHuman?(i: number): { x: number; y: number; onScreen: boolean } | null;
}

/** Render-side view of the accomplice (GDD 3.4, 4.6). */
export interface AccompliceView {
  spec: CatSpec;
  name: string;
  x: number;
  z: number;
  level: Level;
  wishProp: number; // prop index, -1 none
  granted: boolean;
  /** Felony Friday: the guest star lounges too. */
  badge?: 'accomplice' | 'guest_star' | 'alumni';
}

/** Room Maker overlay drawn by the renderer. Cell indices are z * width + x. */
export interface EditorOverlay {
  grid: boolean;
  hover?: { x: number; z: number } | null;
  bad?: readonly number[]; // red cells (unreachable target, blocked spawn...)
  look?: readonly number[]; // blue cells: where the human looks when they turn (the Targets step)
  targets?: readonly number[]; // prop indices with a gold Must-Wreck ring
  spawn?: { x: number; z: number } | null;
  road?: readonly number[]; // grey-green cells: the Roomba's road (keep it clear), shown while placing props
  human?: readonly number[]; // peach cells: where the human(s) stand, shown while placing props
}

export interface RenderApi {
  createRenderer(container: HTMLElement, opts?: RenderOptions): Renderer;
  /** Re-runs the sim from inputs and calls onFrame per clip frame (30 fps) on the live renderer's canvas. */
  renderFrames(
    r: Renderer,
    play: PlayableRoom,
    cat: CatSpec,
    inputs: readonly TickInput[],
    plan: ClipPlan,
    onFrame: (c: HTMLCanvasElement, i: number) => Promise<void>,
  ): Promise<void>;
  /**
   * FULL build: a still of a cat (plinth turntable pose or mugshot pose in front of a height chart) for the cat
   * card, cameo card and Rap Sheet mugshot. Uses an offscreen canvas; null when WebGL is unavailable.
   */
  renderCatPortrait?(
    spec: CatSpec,
    face: HTMLCanvasElement | ImageBitmap | null,
    opts: { w: number; h: number; pose: 'plinth' | 'mugshot' },
  ): Promise<HTMLCanvasElement | null>;
  /** FULL build: a still of a whole room (OG 1200 x 630, picker thumbnails). Used by tools/render-og.mjs. */
  renderRoomStill?(play: PlayableRoom, opts: { w: number; h: number }): Promise<Blob | null>;
}

// ---------------------------------------------------------------------------------------------
// Share + clip (L6)
// ---------------------------------------------------------------------------------------------

export interface ClipPlan {
  opener?: { media: Blob; kind: 'photo' | 'video' };
  /** Clip frames: total 12 s * 30 = 360. Ticks below are sim ticks of the recorded run. */
  matchCutTick: number;
  /** lookTick (round 3): first TELEGRAPH/LOOK start inside the window, when the human turns on camera. */
  crime: { prop: number; fromTick: number; breakTick: number; toTick: number; turnGapTicks?: number; lookTick?: number };
  slowMo: { fromTick: number; toTick: number; speed: number }; // speed 0.35
  pick: 'tension' | 'turned_late' | 'default';
  hook: string; // caption line 0-10 s
  overlay?: string; // @handle (M1a)
  urlLine: string; // last 2 s: "{short URL} · Kitchen #18"
  // ----- FULL build (optional; defaults = the 12 s 720 x 1280 POV clip) -----
  format?: ShareFormat;
  /** Total clip frames at 30 fps (default 360 = 12 s; 'roomba' = 180). renderFrames honours it. */
  frames?: number;
  /** Output size (default 720 x 1280; 'irl_vs_game' = 720 x 640). renderFrames sets this target. */
  size?: { w: number; h: number };
  /** Club caption style 0..4 (0 = default). */
  captionStyle?: number;
  /** Replaces the URL line in the last 2 s (e.g. "Mila is still waiting"); the URL then moves to the watermark only. */
  endLine?: string;
  /** Add the 12 s music sting to the clip audio. */
  music?: boolean;
  /** SIM_VERSION of the recorded run (RunResult.simVersion): the clip pass re-simulates on these rules. */
  simVersion?: number;
}

/** The six post formats (GDD 7.5) plus the household variant. */
export type ShareFormat = 'pov' | 'stitch' | 'reply' | 'irl_vs_game' | 'roomba' | 'carousel' | 'still_waiting' | 'household';
/** What was shared (analytics `artifact`). */
export type ShareArtifact = 'clip' | 'reply_video' | 'card' | 'story' | 'rapsheet' | 'cat' | 'cameo' | 'dare' | 'room' | 'emoji_chat';

/** "Post as..." template in the share sheet (GDD 7.5). */
export interface FormatTemplate {
  format: ShareFormat;
  artifact: ShareArtifact;
  label: string; // "I put @owner's cat in my game"
  caption: string; // pre-filled post caption (sound-off readable)
  needsHandle: boolean;
  available: boolean;
  reason?: string; // why not available ("Needs a Roomba crime", "Club: up to 5 cats")
}
export interface FormatContext {
  run: RunResult;
  play: PlayableRoom;
  cat: CatSpec;
  dayLabel: string; // "Kitchen #18"
  shortUrl: string;
  club: boolean;
  streak: number;
  hasSecondCat: boolean;
  handle?: string;
  pinkPaw?: { name: string; waiting: boolean; adoptUrl?: string };
  /** Name of the household's second cat ("Mochi vs Luna"); without it the label reads "your other cat". */
  secondName?: string;
  /** The cat has a real photo on this device (IRL vs game needs one); undefined counts as yes. */
  hasPhoto?: boolean;
}
/** Second run for the household clip ("Mochi vs Luna: who's worse?"): same room, another cat. */
export interface HouseholdSecond {
  cat: CatSpec;
  run: RunResult;
  opener?: Blob;
  faceCrop?: FaceDecal['crop'] | null;
}

/** Image cards (GDD 7.4). */
export type CardInput =
  | {
      kind: 'result' | 'story';
      run: RunResult;
      play: PlayableRoom;
      cat: CatSpec;
      link: string;
      freeze?: CanvasImageSource | null;
      photo?: ImageBitmap | HTMLCanvasElement | HTMLImageElement | null;
      captionStyle?: number;
    }
  | {
      kind: 'rapsheet';
      cat: CatSpec;
      portrait?: HTMLCanvasElement | null; // render.renderCatPortrait(..., 'mugshot')
      photo?: ImageBitmap | HTMLCanvasElement | HTMLImageElement | null;
      summary: RapSheetSummary;
      week?: WeeklySummary | null;
      link: string;
      club?: boolean; // gold stamps, animated variant handled by the caller (frames)
    }
  | { kind: 'cat'; cat: CatSpec; portrait?: HTMLCanvasElement | null; link: string }
  | { kind: 'cameo'; cat: CatSpec; portrait?: HTMLCanvasElement | null; dayLabel: string; where: 'fridge' | 'window' | 'shelf' | 'guest_star'; link: string };

export interface ClipExportResult {
  blob: Blob | null;
  mime: string; // 'video/mp4'
  encoder: 'webcodecs' | 'mediarecorder' | 'fallback';
  audio: boolean;
  ms: number;
  error?: string;
  /** Fallback 2 (GDD 7.3): when no encoder works, a result card plus a 2 s GIF of the slow-motion crash. */
  card?: Blob | null;
  gif?: Blob | null;
}

export interface ShareApi {
  planClip(r: RunResult, play: PlayableRoom, catName: string): ClipPlan;
  /** Lazy-loads mediabunny + share/clip/* internally. */
  exportClip(
    render: RenderApi,
    renderer: Renderer,
    play: PlayableRoom,
    cat: CatSpec,
    r: RunResult,
    opts: {
      opener?: Blob;
      music: boolean;
      overlay?: string;
      audio?: AudioEngine;
      onProgress?: (p: number) => void;
      faceCrop?: FaceDecal['crop'] | null;
      /** Aborting hands the renderer back after the current frame (the player left for a new run). */
      signal?: AbortSignal;
      /** FULL build: post format (default 'pov'), household second run, Club caption style, end line. */
      format?: ShareFormat;
      second?: HouseholdSecond;
      captionStyle?: number;
      endLine?: string;
      /** still_waiting: the Pink Paw cat went home ("went home" end line). */
      adopted?: boolean;
      /** Fallback 2: the link printed on the crash card. */
      link?: string;
      /** Household: the second cat's face decal for pass B. */
      secondFaces?: Map<number, FaceDecal>;
      /** Household: cats (and faces) the live renderer reloads after the clip (default: `[cat]` without a face). */
      restore?: { cats: CatSpec[]; faces?: Map<number, FaceDecal> };
    },
  ): Promise<ClipExportResult>;
  /** Must be called from a fresh user gesture. Resolves to the method used. */
  shareClip(clip: Blob, text: string): Promise<'native_share' | 'download' | 'long_press' | 'cancelled'>;
  /** In-app browser: copy the clip handoff link. */
  copyHandoffLink(link: string): Promise<boolean>;
  /** Result card PNG (1080x1350) or story card (1080x1920); null when the canvas is unavailable. */
  /** `freeze`: the run's best frame; `photo`: the cat's face crop (only when photos in clips are allowed). */
  renderResultCard?(input: {
    run: RunResult;
    play: PlayableRoom;
    cat: CatSpec;
    link: string;
    format?: 'result' | 'story';
    freeze?: CanvasImageSource | null;
    photo?: ImageBitmap | HTMLCanvasElement | HTMLImageElement | null;
    /** Round 2: the player's own cat rendered on its plinth (the inset when there is no photo). */
    catArt?: CanvasImageSource | null;
  }): Promise<Blob | null>;
  /** Share or save a still image (native share with files, else download). */
  shareImage?(png: Blob, text: string, filename: string): Promise<'native_share' | 'download' | 'long_press' | 'cancelled'>;
  // ----- FULL build -----
  /** "Post as..." templates for this run (GDD 7.5). */
  formats?(ctx: FormatContext): FormatTemplate[];
  /** Every image card (result, story, Rap Sheet mugshot, cat card, cameo card). */
  renderCard?(input: CardInput): Promise<Blob | null>;
  /** Carousel (TikTok photo mode / IG): real photo -> cat card -> freeze-frame -> mugshot -> "Your cat next?". */
  renderCarousel?(input: { cards: Blob[]; photo?: Blob | null; shortUrl: string }): Promise<Blob[]>;
  /** Android Chrome `intent://` link for an in-app browser handoff; null on iOS / desktop. */
  androidIntent?(link: string): string | null;
  /** Native share of several files (carousel); falls back to downloading each. */
  shareFiles?(files: Blob[], text: string, basename: string): Promise<'native_share' | 'download' | 'cancelled'>;
  /** Animated Club Rap Sheet (3 s loop, 720 x 1280); null when no encoder works. */
  renderRapSheetLoop?(
    input: Extract<CardInput, { kind: 'rapsheet' }>,
    opts?: { signal?: AbortSignal },
  ): Promise<{ blob: Blob; mime: string } | null>;
}

// ---------------------------------------------------------------------------------------------
// Codec + links (L2)
// ---------------------------------------------------------------------------------------------

export interface GhostRef {
  inputs: TickInput[];
  cat: CatSpec;
  name?: string;
  /** Sim version the ghost was recorded with (from the ghost header). */
  simVersion?: number;
  /** Recorded with an older (still replayable) rule set: watch only, no "beat" result. */
  replayOnly?: boolean;
  /** Final score of the ghost run, when the sender's link carried it (s / s2). */
  score?: number;
}

/** Non-game routes that live in links (Stripe return pages, gifts, restore, editor). */
export type LinkRoute = 'thanks' | 'redeem' | 'restore' | 'maker' | 'club' | 'archive' | 'rapsheet' | 'brand' | 'cameo' | 'settings' | 'gift' | 'shop';
export interface LinkState {
  dayNo?: number;
  room?: RoomDef; // M2 player room
  glass?: boolean;
  pick?: boolean;
  catCode?: string; // a cat card link /c/<cat>
  ghosts: GhostRef[]; // M1
  replay?: GhostRef; // clip handoff (rp)
  clip?: boolean; // ?clip=1
  via?: string;
  entry?: 'typed';
  studio?: boolean; // ?studio=1 (dev only)
  /** The replay / ghost was recorded in the 40 s first heist (m=f); FTUE timing differs from ranked. */
  ftue?: boolean;
  // ----- FULL build -----
  /** /badcat/<route>?...: thanks?session_id=, redeem?code=, restore?t=, maker (remix with r=), club, ... */
  route?: LinkRoute;
  /** Route parameters, already filtered (session_id, code, t, sku, ...). */
  params?: Record<string, string>;
  /** Open the room (`room`) in the Room Maker as a remix. */
  remix?: boolean;
  /** Raw room payload as it appeared in the link (for report hashes and re-sharing). */
  roomCode?: string;
}

export interface CodecApi {
  encodeCat(c: CatSpec): string; // 18-char base64url (88 bits + CRC-16)
  decodeCat(code: string, name?: string): CatSpec | null;
  parseLink(url: URL): LinkState; // sync; ghost payloads decode lazily in M1 (see LANES.md)
  /** Async parse that also decodes every ghost (g, g2) and a deflated rp. */
  parseLinkFull?(url: URL): Promise<LinkState>;
  buildLink(s: LinkState, base: string): string;
  /** Same link with deflated ghosts (shorter dare links). */
  buildLinkAsync?(s: LinkState, base: string): Promise<string>;
  filterName(raw: string, max?: number): string;
  // ----- FULL build -----
  /** Room codec v2 (shell:4 routine:4 routine2:4 event:4 theme, cloth extents, ancestors); decodes v1 too. */
  encodeRoom?(room: RoomDef): string;
  decodeRoom?(code: string): RoomDef | null;
  /** Short stable hash of a link payload (ugc_reported, hide list). */
  payloadHash?(payload: string): string;
  /** Creator code rule: 6..12 chars [a-z0-9_], filtered. Returns the normalised code or null. */
  creatorCode?(raw: string): string | null;
}

// ---------------------------------------------------------------------------------------------
// Content (L2)
// ---------------------------------------------------------------------------------------------

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  firstTargetTicks: number; // trot ticks along the shortest path to the nearest target, -1 unreachable
}

export interface ContentApi {
  /** Day number for a local date: daysBetween(DAY1, date) + 1. */
  dayNoFor(date: Date): number;
  dailyRoom(dayNo: number): RoomDef;
  glassRoom(): RoomDef;
  /** Picker rooms: The Glass, today, then up to 14 past dailies (pre-launch: the 7 Kitchen variants). */
  pickerRooms(todayNo: number): { dayNo?: number; room: RoomDef; label: string }[];
  resolve(room: RoomDef, mode: RunMode, dayNo?: number): PlayableRoom;
  validate(play: PlayableRoom): ValidationReport;
  // ----- FULL build -----
  /** The schedule entry of a day (weekday room, twist, human, boss, theme, accomplice, sponsor, community). */
  dailyEntry?(dayNo: number): DailyEntry;
  /** Past dailies, newest first (picker: 14; archive: up to `count`). */
  archive?(todayNo: number, count: number): DailyEntry[];
  /** "Kitchen #18", "Boss: Birthday Party #6", "Living room · Nov 2" (preview). */
  roomLabel?(dayNo: number): string;
  /** Shell and routine catalogs (index = RoomDef.shell / routine). */
  shells?: readonly ShellDef[];
  routines?: readonly RoutineDef[];
}

/** One day of the schedule (public/daily/index.json, GDD 3.5, 13.7, Appendix A). */
export interface DailyEntry {
  dayNo: number;
  date: string; // local YYYY-MM-DD
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
  roomId: string; // 'daily-018'
  title: string; // "Kitchen #18: Breakfast Heist"
  label: string; // "Kitchen #18"
  shell: number;
  routine: number;
  routine2?: number;
  human: string; // "Chef Dad" / "Party Host + Grandma"
  twist?: string; // "Mirror: she can see you in it"
  event: string; // ROOM_EVENT_NAMES entry
  targets: string[]; // prop slugs
  wish?: string; // prop slug the accomplice wants
  boss?: boolean;
  theme?: RoomTheme;
  season?: string; // SEASONS id
  /** Pink Paw id of today's accomplice (Friday: also the playable criminal). */
  accomplice?: string;
  felonyFriday?: boolean;
  /** Community Sunday (week 3+): a player room picked by the founder, credited on the briefing card. */
  community?: { code: string; title: string; author: string };
  /** Sponsor prop of the day / Brand Shelf placement (manual, GDD 9.2). */
  sponsor?: { label: string; url?: string; propIndex?: number; brandShelf?: boolean };
  par?: { bronze: number; silver: number; gold: number };
  preview?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Cat maker (L4)
// ---------------------------------------------------------------------------------------------

export interface CatMakerResult {
  spec: CatSpec;
  face?: FaceDecal;
  opener?: { media: Blob; kind: 'photo' | 'video' };
  method: 'camera' | 'gallery' | 'video' | 'manual' | 'skipped';
  /** Studio / reply template: the @handle typed by the poster (never stored in links). */
  handle?: string;
  /** The slot the cat was saved in (0..4). */
  catIndex?: number;
  /** `linked` only: "Keep my cat", the player's slot stays as it was (spec is the linked cat, not to be saved). */
  kept?: boolean;
  /** `linked` only: "Play as this cat" (the shell adds it to a free slot or plays it this visit only). */
  adopted?: boolean;
}

/** Options added in the FULL build (all optional). */
export interface CatMakerOpenExtras {
  /** Save into this cat slot (Club: 0..4). Default 0. -1 = memory only (studio: no slot is read or written). */
  catIndex?: number;
  /** ?studio=1 and the Stitch / reply template: ask for an @handle, accept a screenshot. */
  studio?: boolean;
  /** After an in-app handoff: "Add Mochi's photo again for the clip opener" (skippable, keeps the spec). */
  reAdd?: { name: string };
  /** Allow a 2 s video opener (default true). */
  allowVideo?: boolean;
  /** Cosmetics the player owns (collar / hat ids) for the chips; an unowned collar or hat in `initial` comes off. */
  owned?: { collars: number[]; hats: number[] };
  /**
   * `initial` is someone else's cat from a /c/ link and the player already has a cat (`keepName`): the maker offers
   * "Play as" (result `adopted`) or "Keep my cat" (result `kept`) and never reads or writes a photo slot.
   * `canAdd`: a free slot exists, so the copy says "add to your gang".
   */
  linked?: { keepName: string; canAdd?: boolean };
}

export interface CatMakerApi {
  /** Mounts the flow in `host`, resolves when the player confirms or skips. */
  /** `dare`: "Mochi dared you: 6,375", shown on the intro of a first visit from a dare link. */
  open(
    host: HTMLElement,
    opts: { initial?: CatSpec; fromLink: boolean; render: RenderApi; dare?: string } & CatMakerOpenExtras,
  ): Promise<CatMakerResult>;
  loadFace(catIndex: number): Promise<FaceDecal | null>;
  loadOpener(catIndex: number): Promise<{ media: Blob; kind: 'photo' | 'video' } | null>;
  // ----- FULL build -----
  /** Up to `maxCats` cats: switch, add, delete (frees the slot's photos). Resolves with the new profile cats. */
  manage?(
    host: HTMLElement,
    opts: { cats: CatSpec[]; active: number; maxCats: number; render: RenderApi; onUpsell?(): void },
  ): Promise<{ cats: CatSpec[]; active: number }>;
  /** Delete a slot's face + opener (IndexedDB). */
  forget?(catIndex: number): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Audio (L7)
// ---------------------------------------------------------------------------------------------

export interface AudioEngine {
  /** Call inside the first user gesture (iOS). Safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  /** Feed the events of each sim tick (plus the state for context: human state, suspicion). */
  onEvents(events: readonly SimEvent[], s: SimState): void;
  /** Music loop on/off; its layers (calm / sneaky during TELEGRAPH+LOOK / full band in the event) follow onEvents. */
  setMusic(on: boolean): void;
  stinger(kind: 'perfect' | 'caught' | 'go' | 'stamp'): void;
  setVolumes(v: { master?: number; music?: number; sfx?: number }): void;
  setMuted(muted: boolean): void;
  /** Clip pass (L6): route SFX into a stream destination; null = none. */
  captureStream(): MediaStream | null;
  /** Offline clip mix (L6, WebCodecs path): render SFX for the given events into a buffer. */
  renderOffline?(events: readonly SimEvent[], fromTick: number, toTick: number, slowMo?: ClipPlan['slowMo']): Promise<AudioBuffer | null>;
  /** Room context for the event cue and prop materials (L7); call before each run. */
  setRoom?(play: PlayableRoom): void;
  dispose(): void;
  // ----- FULL build -----
  /**
   * Offline clip mix with options: `music` adds the 12 s music sting under the SFX; `theme` picks the S1 sleigh
   * layer etc. Same buffer timing as renderOffline (time 0 = fromTick).
   */
  renderClipMix?(
    events: readonly SimEvent[],
    fromTick: number,
    toTick: number,
    slowMo: ClipPlan['slowMo'] | undefined,
    opts: { music: boolean; theme?: RoomTheme },
  ): Promise<AudioBuffer | null>;
  /**
   * MediaRecorder clip path (iOS without AudioEncoder): schedule the clip's SFX in real time into the
   * captureStream() destination, starting at AudioContext time `startAt` (seconds) = clip time 2.0 s.
   * Returns a cancel function.
   */
  scheduleClip?(
    events: readonly SimEvent[],
    fromTick: number,
    toTick: number,
    slowMo: ClipPlan['slowMo'] | undefined,
    startAt: number,
    opts?: { music?: boolean; theme?: RoomTheme },
  ): () => void;
  /** Current AudioContext time in seconds (null before unlock). */
  now?(): number | null;
}

// ---------------------------------------------------------------------------------------------
// Platform + progress (L8)
// ---------------------------------------------------------------------------------------------

/** localStorage wrapper, keys prefixed `bcd:v1:`. Never throws. */
export interface Store {
  get<T>(k: string, fallback: T): T;
  set<T>(k: string, v: T): boolean;
  readonly persistent: boolean; // false = storage blocked ("this browser only")
}

export type InAppBrowser = 'tiktok' | 'instagram' | 'facebook' | 'none';
export interface EnvInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isTouch: boolean;
  inApp: InAppBrowser;
  dev: boolean;
  qa: boolean; // VITE_BADCAT_QA=1 (e2e hooks)
  presaleUrl: string | null; // VITE_BADCAT_PRESALE_URL, null when unset
  shortUrl: string; // e.g. 'tokentails.com/badcat' (clip URL line)
  canShareFiles: boolean;
  webcodecs: boolean;
  audioEncoder: boolean;
  // ----- FULL build (optional) -----
  /** VITE_BADCAT_API_URL (backend origin, e.g. https://api.tokentails.com); null = offline, every server feature off. */
  apiUrl?: string | null;
  /** VITE_BADCAT_CLUB=1: show Club / cameo / gift / shop UI (still needs the server's status flags). */
  clubUi?: boolean;
  /** VITE_BADCAT_POSTHOG_KEY (PostHog EU project key); null = no analytics network at all. */
  posthogKey?: string | null;
  /** ?studio=1 is honoured (dev builds, or VITE_BADCAT_STUDIO=1). */
  studioAllowed?: boolean;
  isAndroidChrome?: boolean;
}

export interface Profile {
  cats: CatSpec[];
  active: number;
  createdAt: number;
  sessions: number;
  settings: { audio: boolean; reduceMotion: boolean; showPhotoInClips: boolean };
  /** FULL build preferences (kept apart from `settings`, whose keys are all booleans). */
  prefs?: ProfilePrefs;
  /** A/B arm for the paywall test (stable per device). */
  abArm?: 'A' | 'B';
  /** Per-cat cosmetic trail ids (not in CatSpec, never in links). */
  trails?: number[];
  /** Pink Paw / guest star choice on Felony Friday is per run, not stored. */
  lastSeenWeekly?: string; // weekId of the last opened weekly Rap Sheet card
}
export interface ProfilePrefs {
  music?: number; // 0..1
  sfx?: number; // 0..1
  master?: number; // 0..1
  /** Club: clean 16:9 stream layout with a dare QR code. */
  streamer?: boolean;
  /** Club caption style 0..4 for clips. */
  captionStyle?: number;
  /** "Add music" toggle for clips (12 s sting). */
  clipMusic?: boolean;
  /** Daily reminder time "HH:MM" for the .ics file. */
  reminder?: string;
}
export interface DayRecord {
  score: number;
  stamp: StampId;
  rank: string;
  shared: boolean;
  inputsB64?: string; // M1a
}

export type AnalyticsEvent =
  | 'bc_boot'
  | 'bc_link_open'
  | 'bc_picker'
  | 'bc_run_start'
  | 'bc_first_crash'
  | 'bc_run_end'
  | 'bc_catmaker_open'
  | 'bc_catmaker_done'
  | 'bc_share_open'
  | 'bc_share_action'
  | 'bc_clip_export'
  | 'bc_clip_saved'
  | 'bc_inapp_handoff'
  | 'bc_dare_result'
  | 'bc_streak'
  | 'bc_rapsheet_new'
  | 'bc_room_maker'
  | 'bc_paywall_view'
  | 'bc_checkout_start'
  | 'bc_checkout_complete'
  | 'bc_cameo_seen'
  | 'bc_restore'
  | 'bc_pinkpaw_adopt_click'
  | 'bc_a2hs'
  | 'ugc_reported'
  // ----- Phase 2 (src/online) -----
  | 'bc_account'
  | 'bc_push'
  | 'bc_treat_click'
  | 'bc_rank_save';
export type AnalyticsProps = Record<string, string | number | boolean>;

export interface PlatformApi {
  env: EnvInfo;
  store: Store;
  /** M0: no network (dev console only); M1a: PostHog EU after consent. Never throws. */
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
  profile(): Profile;
  saveProfile(p: Profile): boolean;
  dayRecord(dayNo: number): DayRecord | null;
  saveDayRecord(dayNo: number, r: DayRecord): boolean;
  /** Pre-sale Payment Link (VITE_BADCAT_PRESALE_URL) or null. */
  presaleUrl(): string | null;
  vibrate(ms: number): void;
  // ----- FULL build (optional) -----
  /** Shared consent key `tt-analytics-consent` (same origin as tokentails.com). */
  consent?(): 'granted' | 'denied' | 'unset';
  setConsent?(granted: boolean): void;
  /** Random id per page load (never stored): cameo shuffle hash, paywall A/B. */
  sessionId?(): string;
  /** Stable A/B arm (stored in the profile). */
  abArm?(): 'A' | 'B';
  /** .ics with a daily VEVENT at "HH:MM" local linking `url`. */
  icsReminder?(time: string, url: string): Blob;
  /** Add to Home Screen: available after the 2nd daily (beforeinstallprompt, or iOS instructions). */
  a2hs?(): { available: boolean; ios: boolean; prompt(): Promise<boolean> };
  registerServiceWorker?(): void;
  /** public/treat-meter.json: this month's Pink Paw total (by hand in the MVP). */
  treatMeter?(): Promise<TreatMeter | null>;
}

export interface TreatMeter {
  month: string; // '2026-11'
  cents: number;
  currency: string; // 'usd'
  collars: number;
  updated: string;
}

// ---------------------------------------------------------------------------------------------
// Input (L5)
// ---------------------------------------------------------------------------------------------

export interface InputSource {
  /** Called once per sim tick: returns the quantised input and clears latched buttons. */
  sample(): TickInput;
  /** UI hint: show GRAB instead of SWAT. */
  setGrabHint(on: boolean): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Composition root: main.ts (L5) builds this and hands it to the app shell.
// ---------------------------------------------------------------------------------------------

export interface GameServices {
  platform: PlatformApi;
  content: ContentApi;
  codec: CodecApi;
  sim: SimApi;
  render: RenderApi;
  createAudio(): AudioEngine;
  catMaker: CatMakerApi;
  /** Lazy: share/clip code is imported after the run ends (450 KB first-load budget). */
  loadShare(): Promise<ShareApi>;
  /** Streak and rap sheet (L8). Optional so a missing lane never blocks a run. */
  progress?: ProgressApi;
  // ----- FULL build (optional; main.ts wires them) -----
  money?: MoneyApi;
  meta?: MetaApi;
  /** Lazy: the Room Maker loads on demand. */
  loadEditor?(): Promise<EditorApi>;
  /** Phase 2 (src/online): accounts, ranked saves, boards, short links, the room feed, live data, push. */
  online?: OnlineApi;
}

export interface ProgressApi {
  recordRankedDay(store: Store, dayNo: number, opts?: { freezesPerWeek?: number }): { current: number; best: number };
  recordCrimes?(store: Store, events: readonly SimEvent[], propKinds?: readonly number[], dayNo?: number): string[];
  streakStatus?(store: Store, todayNo: number): { current: number; best: number };
  // ----- FULL build -----
  /** Streak detail for the home flame and the streak-break paywall moment. */
  streakDetail?(store: Store, todayNo: number, opts?: { freezesPerWeek?: number }): StreakView;
  rapSheet?(store: Store, opts?: { club?: boolean }): RapSheetSummary;
  crimes?(store: Store, opts?: { club?: boolean }): CrimeView[];
  /** Weekly identity card data for the week of `todayNo` (ready Sunday 18:00 local). */
  weekly?(store: Store, now: Date, opts?: { club?: boolean; seen?: number; mostWanted?: string[] }): WeeklySummary | null;
  /** Season XP: ranked = 100 + score/100; practice capped at 5 a day. Returns the season view after the run. */
  addRunXp?(store: Store, run: RunResult, opts: { ranked: boolean; dayNo: number; now: Date; club: boolean }): SeasonView;
  season?(store: Store, now: Date, opts: { club: boolean }): SeasonView;
  claimTier?(store: Store, tier: number, now: Date, opts: { club: boolean }): CosmeticDef | null;
  /** 0 none, 1 bronze, 2 silver, 3 gold. */
  parPaws?(score: number, par?: { bronze: number; silver: number; gold: number }): 0 | 1 | 2 | 3;
  /** Friends board: received dare ghosts per room (local, max 50 overall). */
  friends?(store: Store, roomId: string): FriendGhost[];
  saveFriend?(store: Store, g: FriendGhost): void;
  hideFriend?(store: Store, roomId: string, ghost: string): void;
  /** My rooms (Room Maker, max 30). */
  myRooms?(store: Store): MyRoom[];
  saveMyRoom?(store: Store, r: MyRoom): void;
  /** Phase 2: the published room's short id (and whether it was sent to the feed). */
  markMyRoomFeed?(store: Store, code: string, feedId: string, inFeed: boolean): void;
  /**
   * Owned cosmetics from season tiers and streak milestones (shop / Club ones come from entitlements). Keys are
   * `slotIndex * 256 + id` (slots collar 0, hat 1, trail 2, caption 3, stamp 4; ids are unique per slot only), so a
   * collar key equals its CatSpec.collar id. Decode with progress `cosmeticFromKey`.
   */
  ownedCosmetics?(store: Store): number[];
}

export interface StreakView {
  current: number;
  best: number;
  freezesLeft: number;
  /** A ranked run today keeps it; false = already safe today. */
  atRisk: boolean;
  /** The streak breaks tonight unless played (no freeze left). */
  breaksTonight: boolean;
  /** "this browser only" when storage is not persistent. */
  local: boolean;
}

export interface CrimeView {
  id: string; // 'kind-1' | 'framed-roomba' | ...
  name: string; // "Wine glass", "Framed the Roomba"
  icon: string; // emoji
  count: number;
  firstAt?: string; // YYYY-MM-DD
  gold: boolean; // Club gold stamp (5+ of it)
  special: boolean;
}
export interface RapSheetSummary {
  total: number; // all crimes ever
  distinct: number; // stamped entries
  catalog: number; // entries in the catalog (48+)
  framed: number;
  topCrimes: { name: string; icon: string; count: number }[]; // "212 vases"
  rank: string;
  streak: number;
}
export interface WeeklySummary {
  weekId: string; // ISO week 'YYYY-Www' of the Monday
  crimes: number;
  topCrimes: { name: string; icon: string; count: number }[];
  framed: number;
  mostWantedIn?: string; // "Kitchen"
  seen?: number; // cameo seen counter this week (Club)
  mostWanted?: string[]; // Club cats credited by name
  ready: boolean; // Sunday 18:00 local has passed
}
export interface SeasonView {
  id: string;
  name: string;
  start: string;
  end: string;
  daysLeft: number;
  xp: number;
  tier: number; // 0..30 reached
  xpPerTier: number;
  /** `title`: the tier's title (progress `tierTitle`), shown on tiers without a cosmetic. */
  tiers: { tier: number; title?: string; free?: CosmeticDef; club?: CosmeticDef; claimed: boolean; unlocked: boolean }[];
}
export interface FriendGhost {
  roomId: string;
  ghost: string; // ghost payload (codec)
  catCode: string;
  name: string;
  score: number;
  at: number; // ms
  simVersion: number;
}
export interface MyRoom {
  code: string; // room payload (codec v2)
  title: string;
  author: string;
  cleared: boolean;
  at: number;
  ancestors?: string[];
  buildMs?: number;
  /** Phase 2: the maker's clear run (input runs), replayed by the server before a room enters the feed. */
  clear?: [number, number, number, number][];
  /** Phase 2: the room's short id once published (POST /badcat/room), and whether it was sent to the feed. */
  feedId?: string;
  inFeed?: boolean;
}

// =============================================================================================
// FULL build contracts (FULL-PLAN.md). Everything below is new; nothing above depends on it at runtime.
// =============================================================================================

// ---------------------------------------------------------------------------------------------
// Cosmetics and seasons (GDD 8, 9.2). Shared data: render (cat rig), progress (tracks), money (shop), share (cards).
// ---------------------------------------------------------------------------------------------

export type CosmeticSlot = 'collar' | 'hat' | 'trail' | 'caption' | 'stamp';
export type CosmeticSource = 'free_track' | 'club_track' | 'club' | 'shop' | 'charity' | 'streak';
export interface CosmeticDef {
  /** Unique per slot: CatSpec.collar / CatSpec.hat hold the id (8 bits); trails, captions, stamps live in the profile. */
  id: number;
  slot: CosmeticSlot;
  name: string;
  source: CosmeticSource;
  season?: string; // SEASONS id for track items
  sku?: BadcatSku; // shop / charity items
  color?: number; // render hint 0xRRGGBB
}
export const COSMETICS: readonly CosmeticDef[] = [
  // collars (CatSpec.collar)
  { id: 1, slot: 'collar', name: 'Chaos Club collar', source: 'club', color: 0x7b2cbf },
  { id: 2, slot: 'collar', name: 'Pink Paw charity collar', source: 'charity', sku: 'collar_pinkpaw', color: 0xff69b4 },
  { id: 3, slot: 'collar', name: 'Elf collar', source: 'club_track', season: 's1', color: 0x2a9d8f },
  { id: 4, slot: 'collar', name: 'Bell collar', source: 'free_track', season: 's0', color: 0xe9c46a },
  { id: 5, slot: 'collar', name: 'Bandana', source: 'shop', sku: 'cosmetic_collar', color: 0xe63946 },
  { id: 6, slot: 'collar', name: 'Candy-cane collar', source: 'free_track', season: 's1', color: 0xf1faee },
  { id: 7, slot: 'collar', name: 'Streak star collar', source: 'streak', color: 0xffd166 },
  { id: 8, slot: 'collar', name: 'Spiked collar', source: 'shop', sku: 'cosmetic_collar_spiked', color: 0x2b2d42 },
  // hats (CatSpec.hat)
  { id: 1, slot: 'hat', name: 'Santa hat', source: 'club_track', season: 's1', color: 0xd62828 },
  { id: 2, slot: 'hat', name: 'Sweatband', source: 'club_track', season: 's2', color: 0x06d6a0 },
  { id: 3, slot: 'hat', name: 'Heart glasses', source: 'club_track', season: 's2', color: 0xff4d6d },
  { id: 4, slot: 'hat', name: 'Party hat', source: 'free_track', season: 's0', color: 0x4cc9f0 },
  { id: 5, slot: 'hat', name: 'Tiny crown', source: 'shop', sku: 'cosmetic_hat', color: 0xffc300 },
  { id: 6, slot: 'hat', name: 'Beanie', source: 'free_track', season: 's1', color: 0x588157 },
  { id: 7, slot: 'hat', name: 'Chef hat', source: 'free_track', season: 's2', color: 0xffffff },
  { id: 8, slot: 'hat', name: 'Wizard hat', source: 'shop', sku: 'cosmetic_hat_wizard', color: 0x3a0ca3 },
  // trails (Profile.trails)
  { id: 1, slot: 'trail', name: 'Tinsel trail', source: 'club_track', season: 's1', color: 0xffd700 },
  { id: 2, slot: 'trail', name: 'Paw prints', source: 'free_track', season: 's0', color: 0x6d6875 },
  { id: 3, slot: 'trail', name: 'Glitter trail', source: 'shop', sku: 'cosmetic_trail', color: 0xf72585 },
  { id: 4, slot: 'trail', name: 'Bubble trail', source: 'shop', sku: 'cosmetic_trail_bubbles', color: 0x8ecae6 },
  // clip caption styles (Club; ProfilePrefs.captionStyle)
  { id: 1, slot: 'caption', name: 'Classic', source: 'club' },
  { id: 2, slot: 'caption', name: 'Comic', source: 'club' },
  { id: 3, slot: 'caption', name: 'Neon', source: 'club' },
  { id: 4, slot: 'caption', name: 'Typewriter', source: 'club' },
  // card stamps
  { id: 1, slot: 'stamp', name: 'Grinch stamp', source: 'club_track', season: 's1', color: 0x80b918 },
  { id: 2, slot: 'stamp', name: 'Gold stamp', source: 'club', color: 0xffd166 },
  { id: 3, slot: 'stamp', name: 'Neon stamp', source: 'shop', sku: 'cosmetic_stamp_neon', color: 0x39ff14 },
];
export function cosmetic(slot: CosmeticSlot, id: number): CosmeticDef | undefined {
  for (const c of COSMETICS) if (c.slot === slot && c.id === id) return c;
  return undefined;
}

export interface SeasonDef {
  id: string; // 's0'..'s3', 'pre' before launch
  name: string;
  start: string; // local YYYY-MM-DD inclusive
  end: string; // inclusive
  theme: RoomTheme;
}
/** GDD 8 seasons. 6-week seasons, 30 tiers (15 free + 15 Club). 'pre' covers preview days. */
export const SEASONS: readonly SeasonDef[] = [
  { id: 'pre', name: 'Preview', start: '2026-01-01', end: '2026-11-15', theme: 'default' },
  { id: 's0', name: 'Soft Launch', start: '2026-11-16', end: '2026-11-30', theme: 'default' },
  { id: 's1', name: 'Deck the Halls', start: '2026-12-01', end: '2027-01-10', theme: 'xmas' },
  { id: 's2', name: 'New Year, Same Cat', start: '2027-01-11', end: '2027-02-21', theme: 'default' },
  { id: 's3', name: 'Spring Cleaning', start: '2027-02-22', end: '2027-04-04', theme: 'spring' },
];
export const SEASON_TIERS = 30;
export const FREE_SEASON_TIERS = 15;
/** Season XP: ranked run = 100 + floor(score / 100); practice the same, at most 5 practice runs a day. */
export const XP_RANKED_BASE = 100;
export const XP_PRACTICE_CAP_PER_DAY = 5;

// ---------------------------------------------------------------------------------------------
// Cameos (GDD 6.5). Server bundle per (day, shuffle); offline fallback = Pink Paw alumni.
// ---------------------------------------------------------------------------------------------

export type CameoKind = 'paid' | 'guest_star' | 'club' | 'free' | 'gift' | 'streak' | 'reply' | 'community' | 'pinkpaw';
export interface CameoEntry {
  id: string;
  name: string; // filtered
  catCode: string; // codec cat code
  kind: CameoKind;
  /**
   * Approved face only, as a backend-relative path (`/badcat/face/<id>.png`): prefix VITE_BADCAT_API_URL before
   * loading it (render never fetches; the caller decodes it and passes it to Renderer.setCameos). null = default face.
   */
  faceUrl?: string | null;
  club?: boolean;
  alumni?: boolean; // Pink Paw "found a home" badge
}
export interface CameoBundle {
  dayNo: number;
  /** hash(sessionId, dayNo) % CAMEO_SHUFFLES */
  shuffle: number;
  /** Up to the shell's spectatorSlots, in slot order. */
  spectators: CameoEntry[];
  /** Up to FRIDGE_MAGNETS (Club cats weight 2, the day's other cameo cats weight 1). */
  fridge: CameoEntry[];
  /** Friday guest stars (playable criminals next to the Pink Paw cat). */
  guestStars: CameoEntry[];
  source: 'server' | 'offline';
}
export const CAMEO_SHUFFLES = 8;
export const FRIDGE_MAGNETS = 40;
export const CAMEO_LOADS_GUARANTEE = 300;
/** Pool weights per kind in a shuffle (GDD 6.5). */
export const CAMEO_WEIGHTS: Readonly<Record<CameoKind, number>> = {
  paid: 4,
  guest_star: 4,
  club: 2,
  free: 1,
  gift: 4,
  streak: 1,
  reply: 1,
  community: 1,
  pinkpaw: 1,
};

// ---------------------------------------------------------------------------------------------
// Money: SKUs, prices, the backend contract (backend/src/badcat/badcat.contracts.ts mirrors this block).
// All server features are off unless the backend's BADCAT_* flags say otherwise; Stripe runs in TEST mode.
// ---------------------------------------------------------------------------------------------

export type BadcatSku =
  | 'club_monthly'
  | 'club_annual'
  | 'founding'
  | 'cameo'
  | 'guest_star'
  | 'gift_cameo'
  | 'gift_club_3m'
  | 'brand_shelf'
  | 'sponsor_day'
  | 'sponsor_week'
  | 'collar_pinkpaw'
  | 'cosmetic_collar'
  | 'cosmetic_hat'
  | 'cosmetic_trail'
  | 'cosmetic_bundle'
  // Phase 2 full store (GDD 9.2: $1.99 collar or stamp style, $2.99 hat or trail, $4.99 bundle of 3)
  | 'cosmetic_collar_spiked'
  | 'cosmetic_hat_wizard'
  | 'cosmetic_trail_bubbles'
  | 'cosmetic_stamp_neon'
  | 'cosmetic_bundle2';
export interface SkuDef {
  sku: BadcatSku;
  label: string;
  cents: number; // USD cents
  recurring?: 'month' | 'year';
  /** false for the Pink Paw collar (a donation, 100 % net to the shelter). */
  revenueBearing: boolean;
  /** Needs a chosen day (cameo, guest star, sponsor). */
  needsDay?: boolean;
  /** Needs a cat (cat code + name). */
  needsCat?: boolean;
}
export const BADCAT_SKUS: Readonly<Record<BadcatSku, SkuDef>> = {
  club_monthly: { sku: 'club_monthly', label: 'Chaos Club, monthly', cents: 499, recurring: 'month', revenueBearing: true },
  club_annual: { sku: 'club_annual', label: 'Chaos Club, yearly', cents: 3999, recurring: 'year', revenueBearing: true },
  founding: { sku: 'founding', label: 'Founding Bad Cat (first year)', cents: 2499, recurring: 'year', revenueBearing: true },
  cameo: { sku: 'cameo', label: 'Cameo', cents: 499, revenueBearing: true, needsDay: true, needsCat: true },
  guest_star: { sku: 'guest_star', label: 'Guest star (a Friday)', cents: 999, revenueBearing: true, needsDay: true, needsCat: true },
  gift_cameo: { sku: 'gift_cameo', label: 'Gift a cameo', cents: 499, revenueBearing: true },
  gift_club_3m: { sku: 'gift_club_3m', label: 'Gift 3 months of Club', cents: 1499, revenueBearing: true },
  brand_shelf: { sku: 'brand_shelf', label: 'Brand Shelf', cents: 19900, recurring: 'month', revenueBearing: true },
  sponsor_day: { sku: 'sponsor_day', label: 'Sponsor prop of the day', cents: 9900, revenueBearing: true, needsDay: true },
  sponsor_week: { sku: 'sponsor_week', label: 'Sponsor room of the week', cents: 49900, revenueBearing: true, needsDay: true },
  collar_pinkpaw: { sku: 'collar_pinkpaw', label: 'Pink Paw charity collar', cents: 499, revenueBearing: false },
  cosmetic_collar: { sku: 'cosmetic_collar', label: 'Bandana', cents: 199, revenueBearing: true },
  cosmetic_hat: { sku: 'cosmetic_hat', label: 'Tiny crown', cents: 299, revenueBearing: true },
  cosmetic_trail: { sku: 'cosmetic_trail', label: 'Glitter trail', cents: 299, revenueBearing: true },
  cosmetic_bundle: { sku: 'cosmetic_bundle', label: 'Bundle of 3', cents: 499, revenueBearing: true },
  cosmetic_collar_spiked: { sku: 'cosmetic_collar_spiked', label: 'Spiked collar', cents: 199, revenueBearing: true },
  cosmetic_hat_wizard: { sku: 'cosmetic_hat_wizard', label: 'Wizard hat', cents: 299, revenueBearing: true },
  cosmetic_trail_bubbles: { sku: 'cosmetic_trail_bubbles', label: 'Bubble trail', cents: 299, revenueBearing: true },
  cosmetic_stamp_neon: { sku: 'cosmetic_stamp_neon', label: 'Neon stamp', cents: 199, revenueBearing: true },
  cosmetic_bundle2: { sku: 'cosmetic_bundle2', label: 'Bundle of 3: Spiked, Wizard, Bubbles', cents: 499, revenueBearing: true },
};
/** Founding pre-sale cap (GDD 9.2). */
export const FOUNDING_CAP = 200;

/** Stripe Checkout metadata on every session (GDD 10, 14): purchases are counted from Stripe. */
export interface CheckoutMeta {
  trigger: PaywallTrigger | 'home' | 'settings' | 'shop' | 'cameo_flow' | 'gift_flow' | 'brand' | 'presale' | 'thanks';
  via?: string; // creator code
  entry?: string; // analytics entry kind
  from_in_app: boolean;
  ab_arm?: 'A' | 'B';
  session_index?: number;
}
/** POST /badcat/checkout */
export interface CheckoutRequest {
  sku: BadcatSku;
  email?: string; // prefill; Stripe always collects one
  catCode?: string;
  catName?: string;
  dayNo?: number;
  /** Gift: recipient display name (the redeem link goes to the buyer). */
  giftFor?: string;
  /** Brand Shelf / sponsor: free-text brief (manual placement). */
  brand?: { name: string; url?: string; note?: string };
  /** The face-photo upload is offered on the thanks page after payment (moderated). */
  faceOptIn?: boolean;
  meta: CheckoutMeta;
  /** Origin + base path the Stripe return URLs are built on, e.g. 'https://tokentails.com/badcat'. */
  returnBase: string;
}
export interface CheckoutResponse {
  url: string; // Stripe Checkout URL (test mode)
  sessionId: string;
}
/** Decoded entitlement token payload (the token is `<base64url json>.<base64url HMAC>`; the client never verifies it). */
export interface Entitlements {
  club: boolean;
  plan?: 'monthly' | 'annual' | 'founding' | 'gift';
  skus: string[]; // owned one-off SKUs (collar_pinkpaw, cosmetic_*)
  cosmetics: number[]; // owned shop/charity collar+hat ids are expanded by the client from skus
  maxCats: number; // 1 free, 5 Club
  freezesPerWeek: number; // 1 free, 3 Club
  archiveDays: number; // 14 free, all Club
  seasonTiers: number; // 15 free, 30 Club
  expiresAt: number; // ms; the cache is trusted until then, then refreshed online
  email?: string;
  source: 'free' | 'cache' | 'server';
}
export interface EntitlementResponse {
  token: string;
  entitlements: Entitlements;
}
/** POST /badcat/entitlement { sessionId } answer on the thanks page. */
export interface CheckoutCompletion {
  ok: boolean;
  sku?: BadcatSku;
  token?: string;
  entitlements?: Entitlements | null;
  /** Gift purchases: the redeem code (link: <base>/redeem?code=...). */
  gift?: { code: string; sku: BadcatSku };
  /** Cameo / guest star purchases: id for the optional face upload and the cameo card. */
  cameoId?: string;
  dayNo?: number;
  /** Stripe session still pending (webhook not processed yet): poll again. */
  pending?: boolean;
  error?: string;
}
/** POST /badcat/redeem */
export interface RedeemRequest {
  code: string;
  email: string;
  catCode?: string;
  catName?: string;
  dayNo?: number;
  /** The device's cached entitlement token (the redeem adds to its scope); set by money/core, not by screens. */
  token?: string;
}
export interface RedeemResponse {
  ok: boolean;
  kind?: 'cameo' | 'club';
  token?: string;
  entitlements?: Entitlements;
  error?: string;
  /** A redeemed gift cameo: its id, so the recipient can upload a face (POST /badcat/face/:cameoId). */
  cameoId?: string;
}
/** GET /badcat/status: what the server has switched on (all false when BADCAT_ENABLED is unset). */
export interface BadcatServerStatus {
  enabled: boolean;
  checkout: boolean;
  cameos: boolean;
  gifts: boolean;
  restoreEmail: boolean;
  faceUploads: boolean;
  creatorCodes: boolean;
  brand: boolean;
  /** Stripe key is a test key (the server refuses live keys unless BADCAT_STRIPE_ALLOW_LIVE=true). */
  testMode: boolean;
  foundingLeft?: number;
  // ----- Phase 2 (GDD 10, 17.3); absent from older backends = off -----
  scores?: boolean;
  boards?: boolean;
  accounts?: boolean;
  shortLinks?: boolean;
  feed?: boolean;
  meter?: boolean;
  push?: boolean;
  streakEmail?: boolean;
  creatorDashboard?: boolean;
}
/** GET /badcat/seen?cat=<code> */
export interface SeenResponse {
  week: number;
  total: number;
}
/** Backend routes (no global prefix; all public except /badcat/admin/*, which need PermissionGuard(ADMIN)). */
export const BADCAT_ROUTES = {
  status: '/badcat/status',
  checkout: '/badcat/checkout',
  webhook: '/badcat/stripe/webhook',
  entitlement: '/badcat/entitlement', // POST { sessionId } | { token }
  restore: '/badcat/restore', // POST { email }
  restoreVerify: '/badcat/restore/verify', // POST { t }
  portal: '/badcat/portal', // POST { token }
  redeem: '/badcat/redeem',
  cameos: '/badcat/cameos', // GET ?day=&s=
  seen: '/badcat/seen', // GET ?cat=
  face: '/badcat/face', // POST /badcat/face/:cameoId (token), GET /badcat/face/:id.png (approved only)
  clubCat: '/badcat/club/cat', // POST { token, catCode, name }
  creatorCode: '/badcat/creator-code', // POST { code, email }
  typed: '/badcat/t', // GET: 302 to <public>/badcat/pick?e=t, counts typed arrivals per day
  adminFaces: '/badcat/admin/faces',
  adminCameo: '/badcat/admin/cameo',
  adminStats: '/badcat/admin/stats',
  adminCreatorCodes: '/badcat/admin/creator-codes',
  // ----- Phase 2 (src/online) -----
  sim: '/badcat/sim', // GET: the sim bundle the backend replays with
  board: '/badcat/board', // GET /badcat/board/:day (top 100), GET /badcat/board/:day/me (accesstoken)
  account: '/badcat/account', // GET (accesstoken)
  accountClaim: '/badcat/account/claim', // POST (accesstoken, verified email): purchases of that email
  streakEmail: '/badcat/account/streak-email', // POST { on } (accesstoken, verified email)
  link: '/badcat/link', // POST ShortLinkRequest
  shortLink: '/badcat/s', // GET /badcat/s/:id: OG page + redirect
  og: '/badcat/og', // GET /badcat/og/:id.png
  room: '/badcat/room', // POST RoomPublishRequest; GET /badcat/room/:id; POST /badcat/room/:id/play | /report
  feed: '/badcat/feed', // GET ?sort=new|top&cursor=
  meter: '/badcat/meter', // GET TreatMeter
  pushKey: '/badcat/push/key', // GET { publicKey }
  pushSubscribe: '/badcat/push/subscribe', // POST PushSubscribeRequest
  pushUnsubscribe: '/badcat/push/unsubscribe', // POST { endpoint }
  creatorDashboard: '/badcat/creator/me', // GET (accesstoken, verified email)
  adminRooms: '/badcat/admin/rooms',
} as const;

// ---------------------------------------------------------------------------------------------
// Paywall moments (GDD 9.2): small cards, never in session 1, never before the share, at most one per session.
// ---------------------------------------------------------------------------------------------

export type PaywallTrigger = 'post_share' | 'perfect_crime' | 'catmaker_saved' | 'streak_break' | 'archive_old' | 'gift_s1';
export interface PaywallContext {
  trigger: PaywallTrigger;
  sessionIndex: number; // 1 = first session
  shownThisSession: boolean;
  /** The share sheet was shared or dismissed (post_share / perfect_crime need it). */
  afterShare: boolean;
  abArm: 'A' | 'B';
  club: boolean;
  now: Date;
  catName: string;
  nextDayLabel: string; // "Kitchen #19"
  streak?: number;
  freezesLeft?: number;
  /** streak_break: the streak breaks tonight unless played (ProgressApi.streakDetail). Undefined = trust the caller. */
  breaksTonight?: boolean;
  stamp?: StampId;
  serverCheckout: boolean; // BadcatServerStatus.checkout && env.clubUi
}
export interface PaywallOffer {
  trigger: PaywallTrigger;
  offer: 'club' | 'cameo' | 'gift';
  sku: BadcatSku;
  title: string;
  body: string;
  cta: string;
  secondary?: { label: string; sku: BadcatSku };
  abArm: 'A' | 'B';
}

// ---------------------------------------------------------------------------------------------
// Mountable screens. Every mount returns an unmount function. Packages ship their own CSS (imported by the
// module) and reuse the shared classes/variables of src/ui/styles.css read-only.
// ---------------------------------------------------------------------------------------------

export type Unmount = () => void;

export interface ClubSheetProps {
  trigger: CheckoutMeta['trigger'];
  catName: string;
  entitlements: Entitlements;
  status: BadcatServerStatus;
  inApp: boolean;
  onClose(): void;
}
export interface ThanksProps {
  sessionId: string;
  cat: CatSpec;
  onDone(c: CheckoutCompletion): void;
  /** Cameo buyers: upload the face photo for approval (optional). */
  face?: () => Promise<Blob | null>;
  todayNo?: number;
  dayLabel?(dayNo: number): string;
}
export interface RedeemProps {
  code: string;
  cats: CatSpec[];
  onDone(e: Entitlements | null): void;
  /** Day picker for a gift cameo (hidden without it); labels read "Day #N" without dayLabel. */
  todayNo?: number;
  dayLabel?(dayNo: number): string;
}
export interface RestoreProps {
  token?: string; // ?t= from the magic link
  onDone(e: Entitlements | null): void;
  onBack(): void;
}
export interface CameoFlowProps {
  cat: CatSpec;
  todayNo: number;
  dayLabel(dayNo: number): string;
  guestStar: boolean;
  status: BadcatServerStatus;
  onClose(): void;
}
export interface GiftFlowProps {
  status: BadcatServerStatus;
  onClose(): void;
}
export interface ShopProps {
  entitlements: Entitlements;
  status: BadcatServerStatus;
  onClose(): void;
}
export interface BrandProps {
  status: BadcatServerStatus;
  todayNo: number;
  onClose(): void;
  dayLabel?(dayNo: number): string;
}
export interface OfferCardProps {
  offer: PaywallOffer;
  onAccept(): void;
  onDismiss(): void;
  /** The offer's secondary button (e.g. "every week with Club"); without it the secondary calls onAccept. */
  onSecondary?(sku: BadcatSku): void;
}

/** src/money (wave 1): the client side of every paid feature. Works offline (all off) with no API URL. */
export interface MoneyApi {
  status(): Promise<BadcatServerStatus>;
  /** Cached entitlements (sync, never throws; free when nothing cached or expired). */
  entitlements(): Entitlements;
  refreshEntitlements(): Promise<Entitlements>;
  /** Creates a Checkout session and navigates to it (in-app browsers stay in place). */
  checkout(req: Omit<CheckoutRequest, 'returnBase'>): Promise<{ ok: boolean; error?: string }>;
  /** Thanks page: exchange the Stripe session id for the entitlement token (polls while pending, max ~20 s). */
  completeCheckout(sessionId: string): Promise<CheckoutCompletion>;
  /** Club members: which cat appears in the weekly cameo and on the fridge wall. */
  setClubCat(catCode: string, name: string): Promise<boolean>;
  restore(email: string): Promise<{ ok: boolean; devLink?: string; error?: string }>;
  verifyRestore(token: string): Promise<Entitlements | null>;
  /** Stripe customer portal (cancel, change plan). */
  portal(): Promise<{ url?: string; error?: string }>;
  redeem(req: RedeemRequest): Promise<RedeemResponse>;
  /** Cameo bundle for a day (server when on, else offline Pink Paw alumni); fires the shuffle load counter once. */
  cameos(dayNo: number, shells: { spectators: number }): Promise<CameoBundle>;
  seen(catCode: string): Promise<SeenResponse | null>;
  uploadFace(cameoId: string, png: Blob): Promise<boolean>;
  requestCreatorCode(code: string, email: string): Promise<{ ok: boolean; error?: string }>;
  /** Pure decision for a paywall moment; null = show nothing. Call markPaywallShown when it is displayed. */
  paywall(ctx: PaywallContext): PaywallOffer | null;
  markPaywallShown(offer: PaywallOffer): void;
  mount: {
    club(host: HTMLElement, p: ClubSheetProps): Unmount;
    thanks(host: HTMLElement, p: ThanksProps): Unmount;
    redeem(host: HTMLElement, p: RedeemProps): Unmount;
    restore(host: HTMLElement, p: RestoreProps): Unmount;
    cameo(host: HTMLElement, p: CameoFlowProps): Unmount;
    gift(host: HTMLElement, p: GiftFlowProps): Unmount;
    shop(host: HTMLElement, p: ShopProps): Unmount;
    brand(host: HTMLElement, p: BrandProps): Unmount;
    offerCard(host: HTMLElement, p: OfferCardProps): Unmount;
  };
}

// ---------------------------------------------------------------------------------------------
// Room Maker (GDD 6.4), src/editor (wave 2). Loaded lazily via GameServices.loadEditor.
// ---------------------------------------------------------------------------------------------

export interface RoomMakerOptions {
  render: RenderApi;
  content: ContentApi;
  codec: CodecApi;
  /** Remix: the room opened from a link (ancestors keep up to 3 author names). */
  initial?: RoomDef;
  author: string; // filtered, 12 chars
  speedBuild?: boolean; // 90 s timer, "built in 0:87" badge
  /** Admin mode (dev or ?studio=1): no prop budget, writes RoomDef JSON for content authoring. */
  admin?: boolean;
  /** Play the room once (the shell runs a normal practice run). null = the player quit. */
  playtest(room: RoomDef): Promise<RunResult | null>;
  /** Builds the shareable room link (codec + base). */
  linkFor(room: RoomDef): string;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
  onExit(): void;
  /** Reuse the live renderer (one WebGL context); without it the editor makes and disposes its own. */
  renderer?: Renderer;
  /** The player's cat for the preview. */
  cat?: CatSpec;
  /** Long-press (delete) delay in ms (default 480). */
  longPressMs?: number;
  /** "Today" for the Remix today button (tests; default the clock). */
  today?: Date;
}
export interface RoomMakerResult {
  kind: 'published' | 'cancelled';
  room?: RoomDef;
  code?: string;
  link?: string;
  buildMs?: number;
  /** 1200 x 630 room card for the share sheet (client canvas). */
  card?: Blob | null;
}
export interface EditorApi {
  open(host: HTMLElement, opts: RoomMakerOptions): Promise<RoomMakerResult>;
  /** Pure: limits of GDD 6.4 (40 props, 3,000 chaos budget, an occluder, 3 targets, BFS reachability). */
  check(room: RoomDef, content: ContentApi, opts?: { admin?: boolean }): { ok: boolean; errors: string[]; budget: number; bad?: number[] };
}

// ---------------------------------------------------------------------------------------------
// Meta screens (src/meta, wave 2): archive, Rap Sheet, season track, settings, friends board, weekly card,
// consent banner, my rooms. Mounted by the UI shell (wave 3).
// ---------------------------------------------------------------------------------------------

export interface ArchiveProps {
  todayNo: number;
  entries: DailyEntry[]; // newest first
  records: (dayNo: number) => DayRecord | null;
  club: boolean;
  /** Club UI is on (flags + server). False: no Club rows, locks or "Join" buttons (GDD 7.4, 0c). Default true. */
  clubUi?: boolean;
  freeDays: number; // 14
  onPlay(dayNo: number): void;
  onGlass(): void;
  onLocked(dayNo: number): void; // archive_old paywall moment
  onBack(): void;
}
export interface RapSheetProps {
  catName: string;
  /** The player's cat on the mugshot board: an SVG string (meta/cat-face.ts) or an image URL (the face photo). */
  mugshot?: string;
  summary: RapSheetSummary;
  crimes: CrimeView[];
  onShareCard(): void;
  onBack(): void;
}
export interface SeasonProps {
  view: SeasonView;
  club: boolean;
  /** Club UI is on. False: the Club track and every "Join Club" button are hidden. Default true. */
  clubUi?: boolean;
  onClaim(tier: number): void;
  onJoinClub(): void;
  onBack(): void;
}
export interface SettingsScreenProps {
  profile: Profile;
  persistent: boolean;
  club: boolean;
  consent: 'granted' | 'denied' | 'unset';
  hasPhoto: boolean | Promise<boolean>;
  a2hs: { available: boolean; ios: boolean; prompt(): Promise<boolean> } | null;
  exportSave(): Promise<string>;
  importSave(code: string): Promise<boolean>;
  /** QR code SVG for a string (qrcode-generator), '' when it does not fit. */
  qr(text: string): string;
  onIcs(time: string): void;
  onChange(p: Profile): void;
  onConsent(granted: boolean): void;
  onRestore(): void;
  onPortal(): void;
  onManageCats(): void;
  onCreatorCode(): void;
  onClub(): void;
  /** Club UI is on. False: Restore purchases, Creator code and the Club rows are hidden. Default true. */
  clubUi?: boolean;
  /** "For brands" (shown when set: brand sheet is on). It lives here, not on Home (GDD 8 FTUE). */
  onBrand?(): void;
  /** Phase 2: the "Online" section (account, purchases, streak emails, push reminder, /yourcat import, creator). */
  online?: OnlineSettingsProps;
  /** Phase 2: a gamepad was seen (the controls hint mentions it). */
  gamepad?: boolean;
  onBack(): void;
}

/** Settings → Online (Phase 2). Rows appear only for features the server reports on. */
export interface OnlineSettingsProps {
  features: OnlineFeatures;
  session: OnlineSession | null;
  /** Loaded after mount (signed in only). */
  account?: Promise<AccountResponse | null>;
  push?: { state: Promise<'on' | 'off' | 'unsupported' | 'denied'>; hour: number; onToggle(on: boolean, hour: number): Promise<boolean> };
  onSignIn(): void;
  onSignOut(): void;
  onClaim(): void;
  onStreakEmail?(on: boolean): Promise<boolean>;
  onYourcat?(): void;
  onCreator?(): void;
  onFeed?(): void;
}

/** The daily board (Phase 2, top 100 registered players; the player's own run and rank). */
export interface BoardProps {
  dayNo: number;
  label: string;
  load(dayNo: number): Promise<BoardResponse | null>;
  loadMe(dayNo: number): Promise<BoardMeResponse | null>;
  /** Today's number: the day stepper stops there. */
  todayNo: number;
  signedIn: boolean;
  /** The local ranked score of the day (shown when the server has none). */
  localScore?(dayNo: number): number | undefined;
  onSignIn(): void;
  onPlay(dayNo: number): void;
  onBack(): void;
}

/** The public room feed (Phase 2): approved player rooms, newest or most played. */
export interface FeedProps {
  load(sort: 'new' | 'top', cursor?: string): Promise<FeedResponse | null>;
  thumb?(code: string, shell: number): string | null;
  onPlay(room: FeedRoom): void;
  onReport(room: FeedRoom): Promise<boolean>;
  onBuild(): void;
  onBack(): void;
}
export interface FriendsProps {
  roomLabel: string;
  entries: FriendGhost[];
  myScore?: number;
  onRace(g: FriendGhost): void;
  onHide(g: FriendGhost): void;
  /** Round 3: the empty board offers "Send a dare" (the shell shares today's run, or plays it first). */
  onDare?(): void;
  onBack(): void;
}
export interface WeeklyProps {
  summary: WeeklySummary;
  catName: string;
  animated: boolean; // Club
  onShare(): void;
  onClose(): void;
}
export interface ConsentProps {
  onChoice(granted: boolean): void;
}
export interface MyRoomsProps {
  rooms: MyRoom[];
  /** Phase 2 room feed: "Post to the feed" on a cleared room with its clear run (shown only when set). */
  onFeed?(r: MyRoom): void;
  /** The room card thumbnail (an SVG string from meta/room-thumb.ts), null when it cannot be drawn. */
  thumb?(r: MyRoom): string | null;
  onPlay(r: MyRoom): void;
  onShare(r: MyRoom): void;
  onRemix(r: MyRoom): void;
  onNew(): void;
  onBack(): void;
}
export interface MetaApi {
  /** Phase 2 screens. */
  board?(host: HTMLElement, p: BoardProps): Unmount;
  feed?(host: HTMLElement, p: FeedProps): Unmount;
  archive(host: HTMLElement, p: ArchiveProps): Unmount;
  rapSheet(host: HTMLElement, p: RapSheetProps): Unmount;
  season(host: HTMLElement, p: SeasonProps): Unmount;
  settings(host: HTMLElement, p: SettingsScreenProps): Unmount;
  friends(host: HTMLElement, p: FriendsProps): Unmount;
  weekly(host: HTMLElement, p: WeeklyProps): Unmount;
  consent(host: HTMLElement, p: ConsentProps): Unmount;
  myRooms(host: HTMLElement, p: MyRoomsProps): Unmount;
}

// ---------------------------------------------------------------------------------------------
// Online (Phase 2, GDD 10, 17.3; src/online): ranked saves, boards, accounts, short links, the room feed, the live
// treat meter, web push. Mirror: backend/src/badcat/badcat.contracts.ts (routes and status checked by its spec).
// Every piece is off unless its VITE_BADCAT_* flag and the backend's BADCAT_* flag are on.
// ---------------------------------------------------------------------------------------------

/** The `badcat` field of a BAD_CAT `POST /user/catbassadors/live` body (src/server/index.ts BadcatRunLog). */
export interface BadcatRunLogBody {
  dayNo: number;
  simVersion: number;
  runs: [number, number, number, number][];
  finalHash?: number;
  score?: number;
  catCode?: string;
  name?: string;
}

export interface BadcatSaveResponse {
  dayNo: number;
  score: number;
  stamp: string;
  rank: string;
  ticks: number;
  finalHash: number;
  hashMatch?: boolean;
  level: string;
}

export const BOARD_SIZE = 100;

export interface BoardRow {
  rank: number;
  score: number;
  stamp: string;
  name: string;
  catCode?: string;
}

export interface BoardResponse {
  dayNo: number;
  label: string;
  rows: BoardRow[];
  updatedAt: string;
}

export interface BoardMeResponse {
  dayNo: number;
  saved: boolean;
  guest: boolean;
  score?: number;
  stamp?: string;
  rank?: number;
}

export interface AccountResponse {
  signedIn: boolean;
  guest: boolean;
  emailVerified: boolean;
  ranked: { days: number; best: number; lastDay: number | null; streak: number };
  streakEmail: boolean;
  canClaim: boolean;
}

export type ShortLinkKind = 'dare' | 'room' | 'cat' | 'day' | 'other';

export interface ShortLinkRequest {
  path: string;
  kind: ShortLinkKind;
  name?: string;
  score?: number;
  dayNo?: number;
  catCode?: string;
}

export interface ShortLinkResponse {
  id: string;
  url: string;
}

export const SHORT_LINK_MAX_PATH = 4000;

export type FeedRoomStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export interface RoomPublishRequest {
  code: string;
  clear?: [number, number, number, number][];
  feed?: boolean;
}

export interface RoomPublishResponse {
  id: string;
  url: string;
  status: FeedRoomStatus;
  feed: boolean;
}

export interface FeedRoom {
  id: string;
  code: string;
  title: string;
  author: string;
  shell: number;
  props: number;
  plays: number;
  ancestors: string[];
  createdAt: string;
}

export interface FeedResponse {
  rooms: FeedRoom[];
  next?: string;
}

export interface PushSubscribeRequest {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  hour: number;
  tzOffsetMin: number;
}

export interface CreatorDashboardRow {
  code: string;
  status: 'pending' | 'approved' | 'rejected';
  purchases: number;
  grossCents: number;
  shareCents: number;
}

export interface CreatorDashboard {
  rows: CreatorDashboardRow[];
  minPayoutCents: number;
}

/** What the backend says is on (GET /badcat/status, Phase 2 fields) plus the game's own flags. All false offline. */
export interface OnlineFeatures {
  accounts: boolean;
  scores: boolean;
  boards: boolean;
  shortLinks: boolean;
  feed: boolean;
  meter: boolean;
  push: boolean;
  streakEmail: boolean;
  creatorDashboard: boolean;
  /** Pink Paw statuses from the shelter gallery (VITE_BADCAT_LIVE_PINKPAW=1). */
  livePinkPaw: boolean;
  /** "Import my /yourcat cat" (VITE_BADCAT_YOURCAT_IMPORT=1, signed in). */
  yourcat: boolean;
}

export interface OnlineSession {
  /** A Token Tails account (not a guest). */
  signedIn: boolean;
  guest: boolean;
  verified: boolean;
}

/** The outcome of saving a ranked run (`POST /user/catbassadors/live`, type BAD_CAT). */
export type RankedSaveOutcome =
  | { status: 'saved'; save: BadcatSaveResponse; rank?: number }
  | { status: 'queued' | 'signed_out' | 'off' | 'duplicate' | 'already' | 'stale_sim' | 'rejected' | 'closed' };

export interface YourcatImport {
  /** Colours and pattern for the active cat (the shape, cosmetics and name stay). */
  spec: Pick<CatSpec, 'pattern' | 'base' | 'secondary' | 'tertiary' | 'eyes'>;
  name?: string;
  familyLabel: string;
  avatarUrl: string | null;
}

/**
 * Phase 2 services (GDD 10, 17.3). Every call answers `null` / `false` / 'off' with ZERO requests unless
 * VITE_BADCAT_ONLINE=1, VITE_BADCAT_API_URL is set and the backend reports the feature on.
 */
export interface OnlineApi {
  readonly enabled: boolean;
  /** Fetches the server flags once per session (cached). */
  features(): Promise<OnlineFeatures>;
  /** The Token Tails session through the account bridge (null while unknown / off). */
  session(): OnlineSession | null;
  onSession(fn: (s: OnlineSession | null) => void): () => void;
  /** Leaves for the Token Tails sign-in page and comes back to `returnUrl` (default: this page). */
  signIn(returnUrl?: string): void;
  signOut(): Promise<void>;
  /** Saves a ranked daily run (replayed by the server); queues it when offline or signed out. */
  submitRanked(r: RunResult, ctx: { catCode?: string; name?: string }): Promise<RankedSaveOutcome>;
  /** Retries queued ranked runs (after sign-in, on boot). Resolves with how many were saved. */
  flushRanked(): Promise<number>;
  board(dayNo: number): Promise<BoardResponse | null>;
  boardMe(dayNo: number): Promise<BoardMeResponse | null>;
  account(): Promise<AccountResponse | null>;
  claimPurchases(): Promise<EntitlementResponse | null>;
  setStreakEmail(on: boolean): Promise<boolean>;
  /** A short link for a long game link (the long one when short links are off or the call fails). */
  shorten(longUrl: string, meta: Omit<ShortLinkRequest, 'path'>): Promise<string>;
  publishRoom(code: string, clear: [number, number, number, number][] | undefined, feed: boolean): Promise<RoomPublishResponse | null>;
  feed(sort: 'new' | 'top', cursor?: string): Promise<FeedResponse | null>;
  room(id: string): Promise<FeedRoom | null>;
  playRoom(id: string): Promise<void>;
  reportRoom(id: string): Promise<boolean>;
  meter(): Promise<TreatMeter | null>;
  /** Live Pink Paw statuses by id (null when off or unreachable). */
  pinkPaw(): Promise<Record<string, 'WAITING' | 'RECOVERING' | 'ADOPTED'> | null>;
  yourcat(): Promise<YourcatImport | null>;
  creator(): Promise<CreatorDashboard | null>;
  push: {
    supported(): boolean;
    state(): Promise<'on' | 'off' | 'unsupported' | 'denied'>;
    subscribe(localHour: number): Promise<boolean>;
    unsubscribe(): Promise<boolean>;
  };
}
