/**
 * SHARED: every feel number from GDD sections 3–5. Changing one changes the sim: bump SIM_VERSION in types.ts.
 * Times are given in seconds here and converted to ticks where the sim needs them (`ticks()`).
 */
import { TICK_HZ, type RaceClass } from './types';

export const ticks = (seconds: number): number => Math.round(seconds * TICK_HZ);
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// physics (GDD 3.3)
// ---------------------------------------------------------------------------------------------
export interface ClassTuning {
  name: string;
  cc: string;
  topSpeed: number; // m/s, no boost
  zeroTo90: number; // s
  aiSkill: [number, number];
  /** rubber band: an AI ahead of the player may go this much slower, one behind this much faster (fractions) */
  bandDown: number;
  bandUp: number;
  /**
   * AI top-speed scale before the rubber band, from the band's least skilled cat (`aiTop`) to its most skilled
   * (`aiTopHi`), linear in skill (never above 1). The gap between them is what spreads the field out.
   */
  aiTop: number;
  aiTopHi: number;
}

export const CLASSES: readonly ClassTuning[] = [
  // skill bands are 1.6× wider than v1 (feel lane): the field spreads out instead of driving as one pack
  { name: 'Kitten', cc: '50cc', topSpeed: 22, zeroTo90: 1.4, aiSkill: [0.49, 0.81], bandDown: 0.04, bandUp: 0.02, aiTop: 0.78, aiTopHi: 0.99 },
  { name: 'Alley Cat', cc: '100cc', topSpeed: 26, zeroTo90: 1.5, aiSkill: [0.66, 0.9], bandDown: 0.03, bandUp: 0.04, aiTop: 0.82, aiTopHi: 1 },
  { name: 'Zoomies', cc: '150cc', topSpeed: 30, zeroTo90: 1.6, aiSkill: [0.84, 1], bandDown: 0.01, bandUp: 0.045, aiTop: 0.78, aiTopHi: 1 },
];

export function classTuning(cls: RaceClass): ClassTuning {
  return CLASSES[cls] ?? CLASSES[0];
}

/**
 * Peak acceleration a0 for `a = a0·(1 − v/vmax)^0.6` so that 0 → 90 % of top takes `zeroTo90` seconds:
 * (1 − v/V)^0.4 = 1 − 0.4·a0·t/V, and 0.1^0.4 ≈ 0.398, so a0 = 0.602·V / (0.4·T).
 */
export function peakAccel(c: ClassTuning): number {
  return (0.6019 * c.topSpeed) / (0.4 * c.zeroTo90);
}

export const PHYS = {
  accelExponent: 0.6,
  /** above the target speed (boost ended, off-road) the kart sheds speed at this rate, m/s² */
  overspeedDrag: 14,
  coastDrag: 4,
  brakeDecel: 32,
  reverseMax: 7,
  /** yaw rate: 120°/s at ≤ 8 m/s falling linearly to 75°/s at top speed */
  yawLow: 120 * DEG,
  yawHigh: 75 * DEG,
  yawLowSpeed: 8,
  /** below this speed the steering authority fades to zero (no turning on the spot) */
  yawFadeSpeed: 3,
  /** steering authority kept at a standstill, so a stopped kart can always turn out (touch has no reverse) */
  yawFadeMin: 0.35,
  /** 1/s: how fast wall contact turns the nose toward the track direction */
  wallAlign: 4,
  /** s pinned on a wall below 25 % of top speed before the respawn hand */
  pinRespawn: 1.5,
  steerSmooth: 0.08, // s to full lock
  grip: 10, // 1/s
  gripDrift: 2.5,
  gripLow: 6,
  gripAir: 0.6,
  airSteer: 0.3,
  gravity: 22,
  hop: 0.15, // s (visual hop height in render: 0.25 m)
  hopHeight: 0.25,
  /** off-road: top speed ×0.6, acceleration ×0.5, unless boosting */
  offroadTop: 0.6,
  offroadAccel: 0.5,
  curbTop: 0.92,
  /** graze (< 50°): lose this once on contact, then `wallScrape` per second while scraping (the tangent is kept) */
  wallGrazeLoss: 0.12,
  wallScrape: 0.1,
  /** head-on (> 50°): bounce back this fast along the wall normal, with a short wobble */
  wallHeadOnAngle: 50 * DEG,
  wallBounce: 3,
  wallWobble: 0.3,
  /** kart footprint for walls: the body's half width (the barrier face is drawn at the wall line) */
  kartHalfWidth: 0.8,
  /** kart-kart contact: two circles per kart at ±kartCircleOffset along the heading (B7) */
  kartRadius: 0.75,
  kartCircleOffset: 0.8,
  /** ticks between two `bump` events of one kart pair (the push itself runs every tick) */
  bumpCooldownTicks: 20,
  /** how far past the road edge the wall sits, m (the kerb band fills it) */
  wallMargin: 1.5,
  /** off-road features push the wall out this far beyond the road edge */
  offroadMargin: 9,
  /** kerb band: halfW .. halfW + curbWidth is Surface.Curb (drivable, small drag), beyond is off-road */
  curbWidth: 1.5,
  /** grounded height follow per tick (B12): at most this much up / down plus `stepGrade` × travel */
  stepUp: 0.12,
  stepDown: 0.25,
  stepGrade: 0.3,
  respawnDelay: 1.2,
  respawnImmunity: 0.5,
  /** wrong way: banner after this long, respawn facing forward after `wrongWayRespawn` (GDD 3.3) */
  wrongWay: 1.5,
  wrongWayRespawn: 3,
  /** progress watchdog counts only below this speed (m/s), and never while reversing on purpose */
  stuckSpeed: 4,
} as const;

// ---------------------------------------------------------------------------------------------
// drift and mini-turbo (GDD 3.4)
// ---------------------------------------------------------------------------------------------
export const DRIFT = {
  minSpeed: 10, // entry
  dropSpeed: 8, // ends below this
  minSteer: 0.3,
  /** s after the hop in which a held drift still starts once steering passes minSteer */
  entryWindow: 0.4,
  /** charge time per tier, s (iteration 2: reachable in normal bends) */
  tiers: [0.5, 1.0, 1.7],
  /** boost duration per tier, s */
  boost: [0.6, 1.0, 1.5],
  level: 1.3,
  /** charge rate steering into the turn (tight) and out of it (wide) */
  tightFactor: 1.5,
  /** steer into the drift (0..1 of lock) above which the tight rate applies */
  tightSteer: 0.5,
  wideFactor: 0.75,
  slipMin: 15 * DEG,
  slipMax: 35 * DEG,
  yawWide: 45 * DEG,
  yawTight: 120 * DEG,
  colors: [0x3aa8ff, 0xff8a3d, 0xff3ea5],
} as const;

// ---------------------------------------------------------------------------------------------
// boosts (GDD 3.5)
// ---------------------------------------------------------------------------------------------
export const BOOST = {
  cap: 1.35,
  zoomies: 1.4,
  /** boost acceleration is this multiple of the normal peak until boosted top speed */
  accelMult: 3,
  pad: { level: 1.35, time: 0.8 },
  pounce: { level: 1.3, time: 1.0, window: 0.25, stall: 0.8 },
  trick: { level: 1.25, time: 0.6, window: 0.2 },
  slip: { level: 1.25, time: 1.0, charge: 1.2, range: 8, cone: 15 * DEG },
  catnip: { level: 1.35, time: 1.0 },
  /** ramp launch vertical speed, m/s (~0.65 s of air at g = 22) */
  rampLaunch: 7.2,
  rampMinSpeed: 8,
} as const;

// ---------------------------------------------------------------------------------------------
// hits (GDD 3.6): never more than ~1.5 s lost
// ---------------------------------------------------------------------------------------------
export const HITS = {
  spin: { time: 1.1, speed: 0.3 },
  leap: { time: 0.9, keep: 0.5, height: 2 },
  wobble: { time: 0.8, noise: 0.25, speed: 0.85 },
  chase: { time: 0.5, authority: 0.8 },
} as const;

// ---------------------------------------------------------------------------------------------
// race (GDD 1.2)
// ---------------------------------------------------------------------------------------------
export const RACE = {
  karts: 8,
  countdown: 3, // s before GO
  /** the race ends this long after the first human finishes (AI karts get projected places) */
  tail: 6,
  /** hard stop in s (AI-only safety) */
  maxTime: 240,
  gridRowGap: 6.5,
  gridColGap: 4.2,
  gridFirstRow: 5,
  boxRespawn: 0.5,
  roulette: 1.2,
  boxRadius: 1.7,
  stuckRespawn: 4,
  /** position hysteresis (B3): a kart moves ahead when it leads by this much, or has led for `leadTicks` */
  leadMargin: 0.6,
  leadTicks: 8,
  /** overtake events: per ordered pair cooldown, and none this long after GO */
  overtakeCooldownTicks: 45,
  overtakeQuietTicks: 180,
  /** an item press is kept this long until it can fire (B22) */
  itemBufferTicks: 9,
} as const;

// ---------------------------------------------------------------------------------------------
// fish coins (iteration 2, core/sim/coins.ts)
// ---------------------------------------------------------------------------------------------
export const COINS = {
  radius: 1.3,
  respawn: 10,
  max: 10,
  /** top speed bonus per coin held */
  speedPer: 0.005,
  /** a spin or a leap drops this many */
  drop: 3,
  /** spacing of a coin row across the road, m */
  spacing: 1.6,
} as const;

// ---------------------------------------------------------------------------------------------
// items (GDD 4): one-slot weights by effective position, owned by the items-ai lane
// ---------------------------------------------------------------------------------------------
export const ITEM_WEIGHTS: readonly (readonly number[])[] = [
  // hairball, yarn, cucumber, catnip, box, bell, zoomies, laser
  [30, 35, 25, 5, 5, 0, 0, 0],
  [25, 20, 20, 15, 10, 10, 0, 0],
  [20, 15, 15, 20, 10, 15, 5, 0],
  [15, 10, 10, 25, 15, 15, 10, 0],
  [10, 15, 10, 25, 15, 15, 10, 0],
  [5, 15, 5, 30, 15, 10, 15, 5],
  [0, 18, 5, 25, 12, 5, 20, 15],
  [0, 20, 0, 25, 10, 5, 20, 20],
];

/** Item feel numbers (GDD 4), owned by the items-ai lane. Times in s, distances in m, speeds in m/s. */
export const ITEMS = {
  hairball: { speed: 45, life: 4, bounces: 3, radius: 1.5, spawn: 2.4, ownerImmune: 0.4, align: 1.2 },
  /** thrown forward: a homing yarn ball that runs along the road at the kart ahead (GDD deviation, see LANES.md) */
  yarnBall: { speedMin: 38, speedTop: 1.55, life: 5, radius: 1.5, lockRange: 45, lateral: 14 },
  /** dropped behind: a tangle on the road */
  trap: { life: 30, max: 12, radius: 1.45, drop: 2.6, ownerImmune: 0.5 },
  cucumber: { lob: 18, flight: 0.6, ownerPass: 2.5 },
  box: { time: 3 },
  bell: { radius: 25 },
  /** knock: hull gap (m) at which a Zoomies kart spins a kart out (core/sim/contact.ts hullGap) */
  zoomies: { time: 3, knock: 0.5 },
  /** minArm: never hits within this many seconds of firing (the warning always shows first) */
  laser: { speedMult: 1.5, warn: 1.5, cooldown: 10, life: 20, minArm: 0.75 },
  /** ticks between two `blocked` events of one attacker → victim pair */
  blockedCooldownTicks: 30,
} as const;

// ---------------------------------------------------------------------------------------------
// AI (GDD 5)
// ---------------------------------------------------------------------------------------------
export const AI = {
  lookMin: 8,
  lookMax: 18,
  /** rubber band gain per metre of gap to the player */
  bandK: 0.003,
  /** drift where the turn ahead exceeds this curvature (1/m) */
  driftCurv: 0.035,
  /** the drift curvature threshold scales by (1.25 − driftSkill × skill): skilled cats drift gentler bends */
  driftSkill: 0.4,
  /** the line target stays this far inside the road edge (B15) */
  edge: 1.5,
  /** look-ahead time (s) for the line target, clamped to lookMin..lookMax metres */
  lookTime: 0.6,
  /** lateral acceleration an AI corners at without drifting, m/s²: it lifts above it (B15) */
  cornerAccel: 34,
  /** skilled cats carry more speed through bends: cornerAccel × (1 + cornerSkill × (skill − 0.7)) */
  cornerSkill: 1.5,
  /** AI with skill ≥ padSkill aims at a boost pad within padLook metres (B16) */
  padSkill: 0.5,
  padLook: 40,
  /** chance of a ramp trick = trickBase + (1 − trickBase) × skill */
  trickBase: 0.2,
  /**
   * Mistakes (low skill): per tick chance `mistakeRate × mistakeChance` of running wide for `wideTime` s, and per
   * drift a `(1 − skill) × missTurbo` chance of letting go before the first tier (no mini-turbo).
   */
  mistakeChance: 0.006,
  wideTime: 0.4,
  missTurbo: 0.35,
  /** AI fights: how eager an AI is to use items when it is far ahead of the player (1 = as eager as near) */
  farAheadEager: 0.75,
  /** the player's rival (RacerInfo.rival): top scale bonus, its own rubber band up, item eagerness at the player */
  rival: { top: 0.04, bandUp: 0.08, eager: 2, grudge: 20 },
} as const;

// ---------------------------------------------------------------------------------------------
// track build (GDD 6.2)
// ---------------------------------------------------------------------------------------------
export const TRACK = {
  grid: 4,
  heightStep: 1.5,
  widths: [10, 12, 14, 16],
  sample: 0.5,
  maxBank: 12 * DEG,
  bankK: 3.5,
  cell: 8,
} as const;
