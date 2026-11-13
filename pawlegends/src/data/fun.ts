/**
 * Sim v21 (docs/plans/moba/V21-FUN.md): the Kibble Cannon, Boing Beds and the Mega Yarn Ball. Integer mm, ticks
 * (30 Hz), bp. Every spot is authored for team 0's side and is fair to both teams: Crossing's river spots sit on
 * x = 50 m (their own mirror) and its beds mirror left to right; Hearthwood's spots sit on the river line x + y = W
 * or come in swap pairs, and team 1's beds are the 180° reflection of team 0's.
 *
 * All names are original (no other game's items).
 */

/** One map's Kibble Cannon. */
export interface CannonData {
  /** First spawn tick, then this long after each shot or fizzle. */
  first: number;
  respawn: number;
  /** Spawn spots (x, y), used in turn. */
  spots: readonly (readonly [number, number])[];
  /** Underdog Cannon: a trailing team's cannon spawns this far (mm) toward its side, along (dx, dy) for team 0. */
  underdog: number;
  underdogDx: number;
  underdogDy: number;
  /** Shot range (mm). */
  range: number;
}

export const CANNON = Object.freeze({
  /** The `cannonSoon` warning comes this many ticks before a spawn (10 s). */
  warn: 300,
  /**
   * Pick-up reach from the hero's edge (hero centre within reach + RADIUS.hero = 2.0 m). Sim v25 keeps it: the gold
   * ring is drawn out to it instead (funView CANNON_RING), so a hero's body touches the ring as it can take the cannon.
   * (A 1.5 m reach moved Hearthwood's 5v5 balance: 12 of 20 heroes in band against 20 of 20 on the same seeds.)
   */
  reach: 1500,
  /**
   * Sim v25: a walking hero takes it only when its move goal is within this of the cannon (a tap on the cannon, a touch
   * stick pushed at it, a bot walking to its spot); a hero stopped on it always does. A walk past to somewhere else does
   * not pick it up (there is no drop, only Fire).
   */
  aim: 800,
  /** Fuse while carried: 20 s. It pauses while the cannon lies on the ground. */
  fuse: 600,
  /** A dropped cannon (death, Nap, fumble) lies this long (8 s) for either team, then fizzles. */
  dropTicks: 240,
  /** A dropped or fumbled cannon always keeps at least this much fuse (5 s), so a steal can still fire. */
  fuseFloor: 150,
  /** The carrier moves this much slower (bp of base, in the move-speed sum). */
  slowBp: 1500,
  /** Windup before the shot (0.75 s): the carrier is planted; hard CC fumbles it. */
  windup: 23,
  /** Kibble: speed (mm/s), radius (mm). */
  speed: 24000,
  radius: 700,
  /** Minions in the lane take this much (the kibble rolls on); towers and cores 12% of max HP; neutrals 10%. */
  minionDamage: 250,
  structureBp: 1200,
  neutralBp: 1000,
  /** The carrier stays revealed to both teams (ticks refreshed each tick). */
  revealTicks: 2,
});

export const CROSSING_CANNON: CannonData = Object.freeze({
  first: 2700,
  // 120 s (75 s in the plan): the 3v3 balance gate's takedowns ceiling (3.5 a minute) failed at 75 s (3.52) and at
  // 105 s (3.50), so the plan's fallback (V21-FUN §1.7) went to 120 s
  respawn: 3600,
  spots: Object.freeze([Object.freeze([50000, 36000] as const), Object.freeze([50000, 24000] as const)]),
  underdog: 5000,
  underdogDx: -1000,
  underdogDy: 0,
  range: 16000,
});

export const HEARTHWOOD_CANNON: CannonData = Object.freeze({
  first: 5400,
  respawn: 2700,
  spots: Object.freeze([Object.freeze([78000, 50000] as const), Object.freeze([50000, 78000] as const)]),
  underdog: 5000,
  // toward team 0's corner along the diagonal (normalised in the sim)
  underdogDx: -1000,
  underdogDy: -1000,
  range: 18000,
});

/**
 * Boing Beds: a hero that steps onto one is launched to the landing point over the wall in a fixed flight. Rows are
 * [bedX, bedY, landX, landY], team 0's side; team 1 has the reflection of each. Sim v24 (V21-FUN.md §2.1): a walk that
 * steps onto the disc launches at once, a hero stopped on it after `stand` ticks (src/sim/units/boing.ts).
 */
export const BOING = Object.freeze({
  /**
   * Sim v24: the bed's disc, hero centre to bed centre: the drawn rim's outer edge (1.15 m), so a hero half on the
   * cushion is on it; one brushing the rim from outside (centre 1.65 m out) is not. v21–v23: 900.
   */
  reach: 1200,
  /**
   * Sim v24: a walking goal within this of the bed steps onto it (a touch stick's 2 m look-ahead from anywhere on it).
   * Sim v25: only a walk heading within 60° of the throw (from behind the bed toward the landing). v21–v23: 600 (`aim`).
   */
  near: 3200,
  /**
   * A hero stopped (Order.None) in the disc this many ticks is launched: sim v25 15 (0.5 s), and only one that did
   * not walk across the disc toward somewhere else or fight on it first (`bedT` −1). v24: 8 (0.27 s), anyone.
   */
  stand: 15,
  /**
   * Sim v25: a move whose goal is on the cushion counts as walking onto the bed (a tap on it) only within this of that
   * goal, i.e. as it arrives. A touch stick's goal stays over 1 m ahead of the hero, so a stick crossing the cushion
   * and let go there is not thrown.
   */
  arrive: 600,
  /** Flight: 0.9 s. */
  flight: 27,
  /** Per-hero cooldown after landing (3 s). */
  cooldown: 90,
  /** Bots use a bed within this distance whose landing is at least `botGain` closer to their goal. */
  botRange: 5000,
  botGain: 8000,
});

export const CROSSING_BEDS: readonly (readonly [number, number, number, number])[] = Object.freeze([
  // The rat camp, east over the camp wall to the river. Sim v25: 1.5 m nearer the wall (4.5 m from the camp's centre,
  // out of the rat fight), the same 8 m throw. v21–v24: [33000, 30000, 41000, 30000].
  Object.freeze([34500, 30000, 42500, 30000] as const),
  // Sunny side, south over the north wall to the rat camp.
  Object.freeze([27000, 45500, 27000, 34500] as const),
  // Puddle side, north over the south wall to the rat camp.
  Object.freeze([27000, 14500, 27000, 25500] as const),
]);

/**
 * Sim v22 (MAP-5V5-STANDARD.md §7.3): one bed per quadrant, a lane-to-buff launch pad. The cushion sits on Gutterway's
 * shoulder just past the inner tower and lands at the edge of Prickle Hollow's clearing (12.5 m over the forest); its
 * swap does the same from Fenceline to Crow Roost. (v21's four beds launched over rocks the carved jungle no longer has.)
 */
export const HEARTHWOOD_BEDS: readonly (readonly [number, number, number, number])[] = Object.freeze([
  Object.freeze([58000, 12500, 58000, 25000] as const),
  Object.freeze([12500, 58000, 25000, 58000] as const),
]);

/** One map's Mega Yarn Balls. */
export interface YarnData {
  /** Up from this tick. */
  first: number;
  /** Home spots (x, y), one ball each (at most YARN_BALLS). */
  homes: readonly (readonly [number, number])[];
}

/** Ball slots in the world state (both maps). */
export const YARN_BALLS = 2;

export const YARN = Object.freeze({
  /**
   * A hero walking into the ball whose centre comes this close kicks it: sim v25 1350, the drawn ball (0.85 m) plus a
   * hero's body (0.5 m), so a kick is a visible touch. v21–v24: 1600.
   */
  kickReach: 1350,
  /**
   * Sim v25: only a walk heading within 60° of the ball whose goal is within this of it (a touch stick's 2 m look-ahead,
   * a tap on or just past the ball, a bot walking to it) kicks, along the walk. A walk to somewhere farther passes.
   */
  near: 3200,
  /** Rest between kicks (1.5 s). */
  rest: 45,
  /** Roll: speed (mm/s), range (mm), radius (mm). */
  speed: 11000,
  range: 20000,
  radius: 1200,
  /** Enemy heroes: this much + heroBp of max HP; minions minionDamage; both knocked back `knock` mm along the roll. */
  heroDamage: 120,
  heroBp: 500,
  minionDamage: 150,
  knock: 2500,
  /** An enemy structure that stops it takes 5% of max HP. */
  structureBp: 500,
  /** Unravels after this many kicks; back home 45 s later. */
  kicks: 3,
  respawn: 1350,
  /** A roll that hits this many heroes is a STRIKE. */
  strike: 3,
  /** Bots kick a ball within botRange toward an enemy within botAim of it, along their approach (cos ≥ botCosBp). */
  botRange: 4000,
  botAim: 15000,
  botCosBp: 8660,
});

export const CROSSING_YARN: YarnData = Object.freeze({
  first: 1800,
  homes: Object.freeze([Object.freeze([50000, 46000] as const), Object.freeze([50000, 14000] as const)]),
});

export const HEARTHWOOD_YARN: YarnData = Object.freeze({
  first: 3600,
  homes: Object.freeze([Object.freeze([64000, 64000] as const)]),
});

/** Per map (MAP_IDS order: Crossing, Hearthwood). */
export const FUN_BY_MAP = Object.freeze([
  Object.freeze({ cannon: CROSSING_CANNON, beds: CROSSING_BEDS, yarn: CROSSING_YARN }),
  Object.freeze({ cannon: HEARTHWOOD_CANNON, beds: HEARTHWOOD_BEDS, yarn: HEARTHWOOD_YARN }),
]);

/** Bots and the Kibble Cannon (bots/brain.ts). */
export const CANNON_BOT = Object.freeze({
  /** A bot goes for a cannon on the ground when it is its team's nearest hero to it, or within this distance. */
  grabRange: 15000,
  /** Not below this share of max HP. */
  grabHpBp: 3500,
  /** Fires at a visible enemy hero this far away (centre to centre). */
  fireMin: 6000,
  fireMax: 14000,
  /** With this little fuse left it fires at the nearest enemy tower in range, else straight ahead (3 s). */
  dumpFuse: 90,
});
