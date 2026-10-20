/**
 * SHARED CONTRACT (GDD 16). Every lane imports from here. Changes after M0 need all lanes (see LANES.md).
 *
 * The sim (core/sim, core/track build/query, items-ai) only uses the math allowed by GDD 3.1: + - * /, sqrt,
 * floor, round, abs, min, max, and the LUT trig in core/sim/fixed.ts. State is plain objects and arrays.
 */

/** Bumped whenever a tuning number or a sim rule changes (GDD 3.1). Ghosts of another version open as a target-time race. */
export const SIM_VERSION = 9;
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

/** 0 kitchen, 1 rooftops, 2 laundry, 3 yarn, 4 café, 5 shelter, 6 arena rug, 7 reserved */
export type ThemeId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * An alternative route (iteration 2, tracks lane): a second spline from main-loop lap fraction `from` to `to` (0..255,
 * like features). Progress on a branch maps linearly onto the main loop's `s` range, so laps and places keep working.
 */
export interface TrackBranch {
  from: number;
  to: number;
  points: TrackPoint[];
  surface?: 'road' | 'offroad' | 'lowgrip';
  label?: string;
}

/** Track hazards (iteration 2, tracks lane). Adding a kind is a contract change (integrator). */
export type HazardKind = 'roomba' | 'laundry' | 'milk' | 'toaster' | 'steam' | 'drum';
export const HAZARD_KINDS: readonly HazardKind[] = ['roomba', 'laundry', 'milk', 'toaster', 'steam', 'drum'];

export interface HazardSpot {
  kind: HazardKind;
  /** 0..255 lap fraction */
  s: number;
  side?: -1 | 0 | 1;
  /** seconds per cycle, phase 0..1 (hazard defaults when omitted) */
  period?: number;
  phase?: number;
  /** index into `branches` when the hazard sits on an alternative route */
  branch?: number;
}

/** A row of fish coins across the road (iteration 2): `s` 0..255 lap fraction, `d` lateral centre in metres. */
export interface CoinRow {
  s: number;
  d: number;
  count: 3 | 4 | 5;
  branch?: number;
}

/** Intro flyover camera key (render only): position, look-at, time in seconds from the start of the flyover. */
export interface FlyoverKey {
  x: number;
  y: number;
  z: number;
  lx: number;
  ly: number;
  lz: number;
  t: number;
}

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
  // iteration 2: all optional so UGC v1 codes and ghost headers are unchanged
  /** 'arena' = no laps, no wrong way (battle); default 'circuit' */
  kind?: 'circuit' | 'arena';
  branches?: TrackBranch[];
  hazards?: HazardSpot[];
  coins?: CoinRow[];
  /** SIM_VERSION 7: false = no coin trails on the racing line (tests); arenas never get them */
  lineCoins?: boolean;
  flyover?: FlyoverKey[];
  /** song index for the audio-ui lane */
  music?: number;
  /** SIM_VERSION 8 (iteration 3): loops, wall rides, jump gaps and tunnels on the main loop (core/track/stunt.ts) */
  setPieces?: SetPiece[];
}

/**
 * Set pieces (SIM_VERSION 8, docs/plans/formula-meow/SETPIECES.md). The sim stays 2.5D ("shadow zones"): each piece is
 * a stretch of the main loop with special sim rules, and the render bends it into 3D. Optional, so v1/v2 track codes
 * and authored ghost headers are unchanged.
 */
export type SetPieceKind = 'loop' | 'wall' | 'jump' | 'tunnel';
/** order = the `a` of stuntEnter / stuntExit events */
export const SET_PIECE_KINDS: readonly SetPieceKind[] = ['loop', 'wall', 'jump', 'tunnel'];

export interface SetPiece {
  kind: SetPieceKind;
  /** main-loop lap fraction 0..255 (like features): loop = zone start (the boost strip is built before it), jump = lip, wall/tunnel = start */
  s: number;
  /** wall/tunnel length in lap units (wall 8..20, tunnel 10..26). Loop and jump lengths are fixed in metres (STUNT). */
  len?: number;
  /** wall: -1 left / +1 right, 0 both sides (a half-pipe, for straights); omitted = the outer side of the bend. Mirror flips it. */
  side?: -1 | 0 | 1;
  /** jump: gap length m 6..12 (default 10); the far deck is `drop` m lower (0..2.5, default 0) */
  gap?: number;
  drop?: number;
  /** render skin 0..15 per theme (tracks/skins registry); 0 = the generic look */
  skin?: number;
}

/** Surface under a kart (GDD 3.2). */
export const Surface = {
  Road: 0,
  Curb: 1,
  Offroad: 2,
  Boost: 3,
  LowGrip: 4,
  Void: 5,
  /** SIM_VERSION 8: the wall-ride lane of a set piece (road grip, a mild boost, a soft magnet) */
  WallRide: 6,
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

/** Kart bodies (content/ids.ts BODY_IDS): 0 Tuna Can, 1 Shoebox, 2 Sardine F1, 3 Laundry Basket, 4 Roomba, 5 Teacup. */
export type BodyId = 0 | 1 | 2 | 3 | 4 | 5;

/** Kart look (garage). The body's stats (content/karts.ts KART_BODIES) apply in the sim, so ghosts carry the body. */
export interface KartLook {
  body: BodyId;
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
  /** this AI is the player's rival for the race (progression picks it, feel lane gives it behaviour) */
  rival?: boolean;
  /** cosmetic ids (content/ids.ts HAT_IDS / TRAIL_IDS), 0 = none; render only */
  hat?: number;
  trail?: number;
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
  /** SIM_VERSION 7: a human just hit by an item shrugs off further item hits until this runs out (hit cap) */
  guardTicks: number;
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
  // --- iteration 2 (SIM_VERSION 4) ---
  /** highest lap number ever reached (a lap taken back and re-crossed is not a new lap) */
  lapMax: number;
  /** lapStartTick of the previous lap (restored when a lap is taken back) */
  lapStartPrev: number;
  /** fish coins held (0..COINS.max) */
  coins: number;
  /** battle: balloons left; out = 1 once eliminated */
  balloons: number;
  out: number;
  /** buffered item press: ticks left and its throw-back flag */
  itemBuf: number;
  itemBufBack: number;
  /** ticks spent going the wrong way (banner at 1.5 s, respawn facing forward at 3 s) */
  wrongTicks: number;
  /** alternative route the kart is on, -1 = the main loop */
  branch: number;
  // --- iteration 3 (SIM_VERSION 8): set pieces (core/sim/stunt.ts) ---
  /** 0, or the set-piece index + 1 while riding a loop's rail */
  rail: number;
  /** metres along the loop ribbon, and the lateral offset on it (m) */
  su: number;
  sd: number;
  /** catch-net freeze countdown (ticks), 0 = none */
  netTicks: number;
  /** index + 1 of the jump gap the kart launched from, 0 = none; cleared on landing or a net catch */
  gapLaunch: number;
  /** ticks in a row on a wall-ride lane (the stuntEnter / stuntExit events) */
  laneTicks: number;
  /** SIM_VERSION 9: the speed a jump gap's launch took off the kart for its fixed-time flight (paid back on landing) */
  gapV: number;
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
  | 'finish' // a = place, b = finish time in ticks
  // iteration 2
  | 'coin' // a = coins held
  | 'coinLoss' // a = coins dropped
  | 'hazard' // a = HazardKind index (HAZARD_KINDS), b = hazard id
  | 'wrongWay' // the wrong-way banner is up (respawn facing forward follows if it lasts)
  | 'checkpoint' // a = checkpoint index, b = ticks since GO
  | 'balloonPop' // b = attacker or -1
  | 'balloonSteal' // b = thief
  | 'eliminated'
  | 'grudge' // b = target
  | 'trickLand' // a = pose
  | 'respawnStart'
  | 'itemFizzle' // item id in `item`
  // iteration 3 (SIM_VERSION 8): set pieces; a = SET_PIECE_KINDS index, b = piece index (stuntEnter) or 1 = clean (stuntExit)
  | 'stuntEnter'
  | 'stuntExit'
  | 'stuntLand' // a clean landing after a jump gap; a = air ticks, b = piece index
  | 'netCatch'; // b = piece index

export const BoostSource = {
  MiniTurbo: 0,
  Pad: 1,
  Pounce: 2,
  Trick: 3,
  Slipstream: 4,
  Catnip: 5,
  Zoomies: 6,
  /** SIM_VERSION 8: set pieces (loop exit, wall lane, clean landing) */
  Stunt: 7,
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

/** Race modes (iteration 2): the modes lane owns gp / tt / battle; daily and dare are share-lane routes. */
export type RaceMode = 'race' | 'gp' | 'tt' | 'battle' | 'daily' | 'dare';
export const RACE_MODES: readonly RaceMode[] = ['race', 'gp', 'tt', 'battle', 'daily', 'dare'];

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
  /** default 'race' */
  mode?: RaceMode;
  /** battle: the round ends after this many ticks of racing */
  timeLimitTicks?: number;
  /** Grand Prix: cup id and race index 0..3 */
  cupId?: string;
  raceIndex?: number;
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
  /** free slot for the hazard system (tracks lane), plain data, hashed by it */
  hazards: Record<string, unknown>;
  /** free slot for the mode rules (modes lane: battle, tt), plain data, hashed by it */
  mode: Record<string, unknown>;
  /** per coin of BuiltTrack.coins: 0 = available, else ticks until it respawns */
  coins: number[];
  /**
   * Per ordered kart pair (index a × karts + b) timers and counters, hashed: event cooldowns (bump, overtake, blocked)
   * and how many ticks in a row a has been ahead of b (position hysteresis). `blocked` has an extra row for by = -1.
   */
  pairs: PairState;
}

export interface PairState {
  bump: number[];
  overtake: number[];
  blocked: number[];
  lead: number[];
}

/** Final result of a race (results screen, share lane). Times are seconds since GO. */
export interface RaceResult {
  /** `gap`: a kart still racing, its projected gap to the winner in s (or −n: n laps down; null: unknown) */
  places: Array<{ kart: number; name: string; place: number; time: number | null; bestLap: number | null; gap?: number | null }>;
  /** the first human's numbers */
  player: { kart: number; place: number; time: number | null; bestLap: number | null };
  trackId: string;
  cls: RaceClass;
  seed: number;
  simVersion: number;
  // iteration 2
  mode: RaceMode;
  /** coins the player held at the end */
  coins: number;
  /** per-kart numbers built from the event log (core/app/race-stats.ts) */
  stats: RaceStats[];
  /** battle: balloons left and eliminated flags per kart */
  battle?: { balloons: number[]; out: number[]; score?: number[] };
  /** time trial: the player's checkpoint split times in seconds */
  splits?: number[];
}

/** Numbers one kart did in one race, built from the event log (core/app/race-stats.ts). Progression reads only this. */
export interface RaceStats {
  kart: number;
  hitsDealt: number;
  hitsTaken: number;
  /** mini-turbos by tier: [blue, orange, pink] */
  miniTurbos: [number, number, number];
  pounce: boolean;
  tricks: number;
  coinsPicked: number;
  itemsUsed: number;
  overtakes: number;
  /** best gain in places from the worst place held after GO to the finish (0 when none) */
  bestPlaceGain: number;
  /** worst place held after the first lap began */
  worstPlace: number;
  wallHits: number;
  respawns: number;
  slipstreams: number;
  shortcuts: number;
  balloonPops: number;
  balloonSteals: number;
}
