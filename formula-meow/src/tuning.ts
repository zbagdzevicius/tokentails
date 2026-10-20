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
  /** highest AI top-speed scale, reached only behind a player who leads (SIM_VERSION 7) */
  maxScale: number;
}

export const CLASSES: readonly ClassTuning[] = [
  // SIM_VERSION 7 (playtest round 2): narrower skill bands and a pull toward the pack (AI.packK) keep the field
  // together; 100cc and 150cc are faster (24 / 28 / 33 m/s), so each class feels like a step up
  { name: 'Kitten', cc: '50cc', topSpeed: 24, zeroTo90: 1.4, aiSkill: [0.58, 0.8], bandDown: 0.08, bandUp: 0.1, aiTop: 0.93, aiTopHi: 0.98, maxScale: 1.03 },
  { name: 'Alley Cat', cc: '100cc', topSpeed: 28, zeroTo90: 1.5, aiSkill: [0.72, 0.93], bandDown: 0.07, bandUp: 0.12, aiTop: 0.96, aiTopHi: 1, maxScale: 1.05 },
  // SIM_VERSION 8 (integration, iteration 3): the set-piece assists even out the stretches where skill told, so the 150cc
  // bot reached the podium 88 % of the time (target ≤ 75 %): the leading cats give back less (bandDown 0.06 → 0.04)
  { name: 'Zoomies', cc: '150cc', topSpeed: 32, zeroTo90: 1.6, aiSkill: [0.85, 1], bandDown: 0.04, bandUp: 0.14, aiTop: 0.98, aiTopHi: 1, maxScale: 1.05 },
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
  /**
   * yaw rate: 120°/s at ≤ 8 m/s falling linearly to 66°/s at top speed (SIM_VERSION 6, was 75°/s): at 50cc top speed a
   * bend under ~22 m radius needs a drift or a lift, so drifting is how you go fast, not an option
   */
  yawLow: 120 * DEG,
  yawHigh: 66 * DEG,
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
  /** kart-kart contact: two circles per kart at ±kartCircleOffset along the heading (B7); 0.85 / 0.75 covers the
   * drawn 2.9 m × 1.6 m kart (SIM_VERSION 6: noses no longer sink into the kart ahead) */
  kartRadius: 0.85,
  kartCircleOffset: 0.75,
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
  /** SIM_VERSION 7 hit cap: after an item hit a human shrugs off item hits for this long (first race: longer) */
  guard: 10,
  guardForgiving: 15,
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
  /** SIM_VERSION 7: 0.5 → 2 s, so the pack ahead does not empty every row onto the player */
  boxRespawn: 2,
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
  /** top speed bonus per coin held (SIM_VERSION 6: 0.01, ten coins = +10 %, about Mario Kart's) */
  speedPer: 0.01,
  /** a spin or a leap drops this many (SIM_VERSION 7: 3 → 2) */
  drop: 2,
  /** spacing of a coin row across the road, m */
  spacing: 1.6,
} as const;

// ---------------------------------------------------------------------------------------------
// items (GDD 4): one-slot weights by effective position, owned by the items-ai lane
// ---------------------------------------------------------------------------------------------
export const ITEM_WEIGHTS: readonly (readonly number[])[] = [
  // hairball, yarn, cucumber, catnip, box, bell, zoomies, laser
  // SIM_VERSION 7: fewer hairballs and yarn in places 1–4 (too many hits in the pack): the leader drops cucumbers,
  // 2nd–4th get more catnip and boxes
  [24, 24, 40, 4, 8, 0, 0, 0],
  [18, 14, 18, 22, 18, 10, 0, 0],
  [14, 11, 13, 27, 15, 15, 5, 0],
  [12, 10, 12, 26, 14, 16, 10, 0],
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
  bandK: 0.005,
  /** SIM_VERSION 7: pull toward the median kart, per metre of gap (ahead of the pack slows, behind it speeds up) */
  packK: 0.0035,
  /** SIM_VERSION 7: the band moves the AI's corner speed by this multiple of its top-speed adjustment */
  cornerBand: 1.5,
  /** SIM_VERSION 7: AI corner speed rises this much per class step (150cc cats carry more speed) */
  cornerClass: 0.06,
  /** SIM_VERSION 7 wall guard: steer away when the wall is this many seconds away at the sideways speed (× 0.6–1.2
   * by skill), plus this margin in metres */
  wallLook: 0.5,
  /** SIM_VERSION 7: AI steers onto a fish coin up to coinLook m ahead (× 0.5–1 by skill), at most coinReach m aside */
  coinLook: 22,
  coinReach: 3.5,
  wallPad: 0.4,
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
  missTurbo: 0.45,
  /** AI fights: how eager an AI is to use items when it is far ahead of the player (1 = as eager as near) */
  farAheadEager: 0.75,
  /** the player's rival (RacerInfo.rival): top scale bonus, extra rubber band up (only behind the player), item eagerness at the player */
  /** SIM_VERSION 7: the top bonus is per class (none at 50cc), so the rival stays close instead of running away */
  rival: { top: [0, 0.015, 0.03] as readonly number[], bandUp: 0.04, eager: 2, grudge: 20 },
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

// ---------------------------------------------------------------------------------------------
// set pieces (SIM_VERSION 8, iteration 3: docs/plans/formula-meow/SETPIECES.md, core/sim/stunt.ts)
// Spectacle with assist: thrilling, never hard. Times in s, lengths in m, speeds as fractions of the kart's top speed.
// ---------------------------------------------------------------------------------------------
export const STUNT = {
  loop: {
    /** shadow zone on the main loop (the kart's planar position while on the rail) */
    zone: 44,
    /** the boost strip the build puts before the zone (a full-width pad: 1.35 for 0.8 s) */
    strip: 10,
    /** ribbon (render shape and the rail length): loop radius, forward drift per radian (a teardrop loop), corkscrew sway */
    radius: 6.5,
    drift: 0.45,
    sway: 4.7,
    /** deck half width (render) and the rail's lateral limit (the kart's centre) */
    deckHalfW: 3.6,
    maxSd: 2,
    /** never slower than this on the rail (nobody stalls upside down) */
    floor: 0.75,
    /** SIM_VERSION 9: overlapping railed karts the lateral limit cannot separate spread along the ribbon (m a tick) */
    alongPush: 0.1,
    /** a Stunt boost held for the whole ride (the ribbon is longer than its shadow) */
    railLevel: 1.35,
    /** steering: m/s at full lock, auto-centre speed when |steer| < centreSteer (of 7) */
    steerRate: 2.4,
    centre: 1.5,
    centreSteer: 2,
    /** the boost strip's lead-in assist: heading toward the road (rad/s), slide toward the centre (m/s) */
    leadTurn: 1.6,
    leadMagnet: 2.5,
    /** exit boost */
    exitLevel: 1.35,
    exitTime: 1.3,
    /** a respawn inside a loop puts the kart this far before the strip at the floor speed */
    respawnBack: 8,
  },
  wall: {
    /** lane width beyond the road edge, and the taper at each end (wall slope ≤ 1:2.7: never a head-on) */
    lane: 6,
    taper: 16,
    /** the soft outer rail sits this far past the lane */
    rail: 0.6,
    /** boost refreshed every tick on the lane (SIM_VERSION 9: 1.15 → 1.3, the lane is the faster line) */
    level: 1.3,
    time: 0.25,
    /** magnet toward the lane centre, m/s; off while steering inward at |steer| ≥ magnetOff (of 7) */
    magnet: 1,
    magnetOff: 4,
    /** SIM_VERSION 9: a kart in this outer share of the road on the lane's side is drawn onto the lane at drawIn m/s */
    drawShare: 0.4,
    drawIn: 3,
    /** SIM_VERSION 9: the lane's carry (the extra way round the bend) is at most this share of the kart's own move */
    carryMax: 0.6,
    /** SIM_VERSION 9: a clean ride's exit boost (the sling off the wall) */
    exitLevel: 1.35,
    exitTime: 1,
    /** stuntEnter after this long on the lane; a clean stuntExit needs this share of the lane ridden */
    enter: 0.3,
    clean: 0.7,
    /** render curl: radius of the quarter pipe and its maximum angle (degrees) */
    curlR: 3.8,
    curlMax: 75,
  },
  jump: {
    gap: 10,
    /** the landing target is this far past the far lip; the landing window this long */
    aim: 5,
    land: 16,
    /** launch speed floor (fraction of top); heading error clamp at the lip (degrees) */
    floor: 0.75,
    lipAngle: 10,
    /** a kicker's aimed flight time limits (s) */
    tMin: 0.55,
    tMax: 1.0,
    /**
     * SIM_VERSION 9: a gap's flight peaks this high over the lip (m; hang time ~0.9 s over a flat gap, longer over a
     * drop); the landing lies between `landMin` m past the far lip and `landMargin` m before the window's end
     */
    apex: 2.2,
    landMin: 2,
    landMargin: 3,
    /** air magnet: toward the racing line (m/s), heading toward the tangent (rad/s) */
    magnet: 3,
    turn: 2,
    /** clean landing: within this heading error (degrees) → a Stunt boost */
    cleanAngle: 25,
    landLevel: 1.2,
    landTime: 0.5,
    /** catch net: below the far deck by this much, or this long in the air (s) */
    netBelow: 1.5,
    netAir: 1.5,
    netHold: 0.4,
    /** set down this far past the far lip at this speed (fraction of top), invincible for invTime */
    netPlace: 4,
    netSpeed: 0.7,
    invTime: 0.5,
    /** the far deck climbs back from `drop` over this many metres after the landing window */
    climb: 24,
    /** run-up: banking is forced to 0 over this many metres before the lip */
    runUp: 25,
  },
  tunnel: {
    /** render: ceiling height over the road, neon ring spacing (m) */
    ceiling: 6.5,
    ring: 6,
    /** SIM_VERSION 9: the full-width boost pad at a tunnel's middle (half its length, m) */
    padHalfLen: 2.5,
  },
} as const;
