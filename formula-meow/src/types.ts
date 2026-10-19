/**
 * SHARED CONTRACT (GDD 16). Every lane imports from here. Changes after M0 need all lanes (see LANES.md).
 *
 * The sim (core/sim, core/track build/query, items-ai) only uses the math allowed by GDD 3.1: + - * /, sqrt,
 * floor, round, abs, min, max, and the LUT trig in core/sim/fixed.ts. State is plain objects and arrays.
 */

/** Bumped whenever a tuning number or a sim rule changes (GDD 3.1). Ghosts of another version open as a target-time race. */
export const SIM_VERSION = 3;
/** Fixed sim rate. The sim never reads wall-clock time. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

/** One input per human kart per tick. Steering is quantized to 15 levels (-7..+7) for ghosts (GDD 2). */
export interface TickInput {
  /** -7..+7, positive = right */
  steer: number;
  gas: boolean;
  brake: boolean;
  /** hop on the press edge, drift while held (also the trick tap after a ramp lip, and a Pounce Start press) */
  drift: boolean;
  /** use the held item (press edge) */
  item: boolean;
  /** with `item`: throw / drop it backwards */
  itemBack: boolean;
}

export const NO_INPUT: Readonly<TickInput> = Object.freeze({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false });

/** Pack a TickInput into 10 bits (steer 4 + 6 flags). Replays and ghosts store these. */
export function packInput(i: TickInput): number {
  const s = Math.max(-7, Math.min(7, Math.round(i.steer))) + 7;
  return s | (i.gas ? 16 : 0) | (i.brake ? 32 : 0) | (i.drift ? 64 : 0) | (i.item ? 128 : 0) | (i.itemBack ? 256 : 0);
}

export function unpackInput(v: number): TickInput {
  return { steer: (v & 15) - 7, gas: (v & 16) !== 0, brake: (v & 32) !== 0, drift: (v & 64) !== 0, item: (v & 128) !== 0, itemBack: (v & 256) !== 0 };
}

// ---------------------------------------------------------------------------------------------
// Tracks (GDD 6.2: one format for authored and UGC tracks)
// ---------------------------------------------------------------------------------------------

export type FeatureKind = 'items' | 'pad' | 'ramp' | 'lowgrip' | 'offroad' | 'hazard' | 'shortcut' | 'start';
export const FEATURE_KINDS: readonly FeatureKind[] = ['items', 'pad', 'ramp', 'lowgrip', 'offroad', 'hazard', 'shortcut', 'start'];

export interface TrackPoint {
  /** metres on a 4 m grid within ±128 m */
  x: number;
  z: number;
  /** height step 0..7 (×1.5 m) */
  h: number;
  /** width class 0..3 = 10/12/14/16 m */
  w: 0 | 1 | 2 | 3;
}

export interface TrackFeature {
  /** 0..255 fraction of the lap, measured along the control polygon's spline from point 0 */
  s: number;
  kind: FeatureKind;
  /** -1 left, 0 centre / both, +1 right */
  side?: -1 | 0 | 1;
}

export type ThemeId = 0 | 1 | 2 | 3; // kitchen, rooftops, laundry, yarn

export interface TrackDef {
  v: 1;
  id: string;
  name: string;
  creator?: string;
  parent?: number;
  theme: ThemeId;
  timeOfDay: 0 | 1 | 2;
  laps: 3 | 5;
  points: TrackPoint[];
  features: TrackFeature[];
  props?: number[];
}

/** Surface under a kart (GDD 3.2). */
export const Surface = {
  Road: 0,
  Curb: 1,
  Offroad: 2,
  Boost: 3,
  LowGrip: 4,
  Void: 5,
} as const;
export type Surface = (typeof Surface)[keyof typeof Surface];

// ---------------------------------------------------------------------------------------------
// Racers, items, karts
// ---------------------------------------------------------------------------------------------

export type RaceClass = 0 | 1 | 2; // Kitten 50cc, Alley Cat 100cc, Zoomies 150cc

export type ItemId = 'hairball' | 'yarn' | 'cucumber' | 'catnip' | 'box' | 'bell' | 'zoomies' | 'laser';
export const ITEM_IDS: readonly ItemId[] = ['hairball', 'yarn', 'cucumber', 'catnip', 'box', 'bell', 'zoomies', 'laser'];

/** Hit kinds the core physics knows how to play out (GDD 3.6). Items call `applyHit`. */
export type HitKind = 'spin' | 'leap' | 'wobble' | 'chase';

/** Per-AI numbers (GDD 5.1). Deterministic from the race seed and slot. */
export interface Personality {
  skill: number; // 0..1
  aggression: number; // 0..1
  mistakeRate: number; // 0..1
  lineBias: number; // -0.6..+0.6 of the half width
}

export type Pattern = 'solid' | 'tabby' | 'tuxedo' | 'bicolor' | 'calico' | 'colorpoint' | 'tortie';

/** Cat look (copied from bad-cat/src/types.ts CatSpec, same field meanings, so the cat codec can be copied as is). */
export interface CatSpec {
  pattern: Pattern;
  ears: 'normal' | 'fold';
  tail: 'normal' | 'fluffy' | 'bob';
  body: 'slim' | 'normal' | 'chonk';
  eyes: number; // 0..5 index into EYE_COLORS
  base: number; // RGB565
  secondary: number; // RGB565
  tertiary: number; // RGB565
  collar: number;
  hat: number;
  name: string;
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

/** The player's default cat before the cat maker: grey tabby "Tofu" (same as Bad Cat). */
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

/** Kart look (garage lane). Bodies differ in looks only (GDD 7). */
export interface KartLook {
  body: number; // 0 Tuna Can, 1 Shoebox, 2 Sardine F1
  paint: [number, number, number]; // 0xRRGGBB
  number: number; // 0..99
}

export interface RacerInfo {
  name: string;
  cat: CatSpec;
  kart: KartLook;
  /** present for AI racers */
  ai?: Personality;
  /** Pink Paw id, when the racer is a real shelter cat (share lane shows status + adopt link) */
  pinkPawId?: string;
}

/**
 * Kart sim state. Plain numbers only (hashed in a fixed field order by core/sim/hash.ts). Timers are in ticks.
 * Angles in radians; heading 0 faces +z, and a positive steer (right) decreases the heading.
 */
export interface KartState {
  x: number;
  y: number;
  z: number;
  /** body facing */
  heading: number;
  vx: number;
  vy: number;
  vz: number;
  /** smoothed steer -1..1 */
  steer: number;
  /** 1 while airborne */
  air: number;
  airTicks: number;
  /** visual hop countdown (opens the drift window) */
  hopTicks: number;
  /** drift entry window after a hop: a held drift starts once steering passes the minimum within it */
  armTicks: number;
  /** ticks spent pinned against a wall at low speed (wall-pin respawn) */
  pinTicks: number;
  /** -1 left, +1 right, 0 none */
  driftDir: number;
  /** drift charge in tick units (scaled by the tight/wide factor) */
  driftCharge: number;
  /** 0 none, 1 blue, 2 orange, 3 pink */
  driftTier: number;
  boostTicks: number;
  boostLevel: number;
  /** hit timers (GDD 3.6) */
  spinTicks: number;
  leapTicks: number;
  wobbleTicks: number;
  chaseTicks: number;
  /** cardboard box shield, zoomies autopilot, generic invincibility (respawn) */
  shieldTicks: number;
  autoTicks: number;
  invTicks: number;
  /** stalled after an early start press (race 2+) */
  stallTicks: number;
  /** "big hand" respawn countdown */
  respawnTicks: number;
  /** ticks since leaving a ramp lip (trick window), -1 when not set */
  lipTicks: number;
  /** 1 when a trick was performed during this jump */
  trick: number;
  /** slipstream charge in ticks */
  slipTicks: number;
  /** track sample index (local search hint), arc length on the lap, lateral offset */
  si: number;
  s: number;
  d: number;
  /** continuous distance along the track since the start line (negative on the grid) */
  dist: number;
  surface: number;
  /** 1 while touching a wall (wall graze penalty fires once per contact) */
  wall: number;
  /** previous-tick button states for edge detection */
  pGas: number;
  pDrift: number;
  pItem: number;
  /** 1 once the first press of the race was judged for a Pounce Start */
  startJudged: number;
  /** held item, charges (catnip ×3), roulette ticks left (item hidden while > 0) */
  item: ItemId | null;
  itemCount: number;
  rouletteTicks: number;
  /** separate RNG streams (GDD 3.1) */
  rngItems: number;
  rngAi: number;
  /** race */
  lap: number;
  lapStartTick: number;
  bestLapTicks: number;
  finished: number;
  /** finish time in ticks since GO, fractional (interpolated across the line) */
  finishTime: number;
  place: number;
  stuckTicks: number;
  /** progress watchdog: best `dist` reached recently (the big hand comes when it stalls, GDD 3.3) */
  progDist: number;
  /** the AI's current top-speed scale from the rubber band (1 for humans) */
  topScale: number;
}

/** One item box (GDD 4). */
export interface ItemBox {
  x: number;
  y: number;
  z: number;
  s: number;
  /** 0 = available, else ticks until respawn */
  respawn: number;
}

/** Race event log (the only way juice and share react to the sim). `a`/`b` carry event specific numbers. */
export type RaceEventType =
  | 'countdown' // a = 3,2,1
  | 'go'
  | 'pounce' // kart got a Pounce Start
  | 'stall' // kart pressed too early
  | 'hop'
  | 'driftStart' // a = dir
  | 'driftTier' // a = tier 1..3
  | 'driftEnd'
  | 'miniTurbo' // a = tier
  | 'boost' // a = source (BoostSource), b = level
  | 'pad'
  | 'ramp'
  | 'trick'
  | 'land' // a = air ticks
  | 'wall' // a = 1 graze, 2 head-on
  | 'bump' // kart-kart contact, b = other kart
  | 'itemPickup'
  | 'itemReady' // roulette ended; item id in `item`
  | 'itemUse' // item id in `item`, a = 1 when thrown back
  | 'hit' // a = HitKind index (spin 0, leap 1, wobble 2, chase 3), b = attacker or -1
  | 'blocked' // a hit bounced off a shield
  | 'respawn'
  | 'lap' // a = lap number just started (2..laps)
  | 'finalLap'
  | 'overtake' // kart passed kart b, a = new place
  | 'finish'; // a = place, b = finish time in ticks

export const BoostSource = {
  MiniTurbo: 0,
  Pad: 1,
  Pounce: 2,
  Trick: 3,
  Slipstream: 4,
  Catnip: 5,
  Zoomies: 6,
} as const;
export type BoostSource = (typeof BoostSource)[keyof typeof BoostSource];

export interface RaceEvent {
  tick: number;
  type: RaceEventType;
  kart: number;
  a?: number;
  b?: number;
  item?: ItemId;
}

/** Daily modifiers and settings that change the sim. Bit flags so they pack into ghosts. */
export const Modifier = {
  Mirror: 1,
  Night: 2,
  CucumbersOnly: 4,
  CatnipRain: 8,
  ZoomiesPlus: 16,
  BoxParty: 32,
} as const;
export type Modifier = (typeof Modifier)[keyof typeof Modifier];

export interface RaceConfig {
  track: TrackDef;
  seed: number;
  cls: RaceClass;
  modifiers: number;
  /** field, index = kart index. AI racers carry `ai`. */
  racers: RacerInfo[];
  /** kart indices driven by TickInputs (usually [playerIndex]) */
  humans: number[];
  /** race 1 rules: early presses are not punished (GDD 1.1) */
  forgiving: boolean;
  /** stop the race this many ticks after the first human finishes (AI-only races: after the leader) */
  tailTicks?: number;
}

export type RacePhase = 'countdown' | 'race' | 'done';

export interface RaceState {
  tick: number;
  phase: RacePhase;
  karts: KartState[];
  boxes: ItemBox[];
  events: RaceEvent[];
  /** kart indices in race order (index 0 = leader) */
  order: number[];
  laps: number;
  lapLength: number;
  /** tick the first human (or the leader in AI-only races) finished, -1 before */
  firstFinishTick: number;
  rngHazards: number;
  /** free slot for the items lane (projectiles, traps, cooldowns). Must be plain data; hashed by the items lane. */
  items: Record<string, unknown>;
}

/** Final result of a race (results screen, share lane). Times are seconds since GO. */
export interface RaceResult {
  places: Array<{ kart: number; name: string; place: number; time: number | null; bestLap: number | null }>;
  /** the first human's numbers */
  player: { kart: number; place: number; time: number | null; bestLap: number | null };
  trackId: string;
  cls: RaceClass;
  seed: number;
  simVersion: number;
}
