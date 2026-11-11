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
  /** Pick-up reach from the hero's centre (the Frenzy pickup's). */
  reach: 1500,
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
 * Boing Beds: a hero that steps onto one with a move order that goes on past it (or that was sent onto the bed itself)
 * is launched to the landing point over the wall in a fixed flight. Rows are [bedX, bedY, landX, landY], team 0's
 * side; team 1 has the reflection of each.
 */
export const BOING = Object.freeze({
  /** Trigger reach from the hero's centre to the bed centre. */
  reach: 900,
  /** A move goal within this distance of the bed counts as "sent onto the bed" (a tap on the cushion). */
  aim: 600,
  /** Flight: 0.9 s. */
  flight: 27,
  /** Per-hero cooldown after landing (3 s). */
  cooldown: 90,
  /** Bots use a bed within this distance whose landing is at least `botGain` closer to their goal. */
  botRange: 5000,
  botGain: 8000,
});

export const CROSSING_BEDS: readonly (readonly [number, number, number, number])[] = Object.freeze([
  // The rat camp, east over the camp wall to the river.
  Object.freeze([33000, 30000, 41000, 30000] as const),
  // Sunny side, south over the north wall to the rat camp.
  Object.freeze([27000, 45500, 27000, 34500] as const),
  // Puddle side, north over the south wall to the rat camp.
  Object.freeze([27000, 14500, 27000, 25500] as const),
]);

export const HEARTHWOOD_BEDS: readonly (readonly [number, number, number, number])[] = Object.freeze([
  // Prickle Hollow, east over the rocks to Yarn Road; and its swap (the Crow Roost side, north to Yarn Road).
  Object.freeze([56000, 35000, 65000, 35000] as const),
  Object.freeze([35000, 56000, 35000, 65000] as const),
  // The Frog Pond, south over the rocks to Gutterway; and its swap (west to Fenceline).
  Object.freeze([68000, 23500, 68000, 12500] as const),
  Object.freeze([23500, 68000, 12500, 68000] as const),
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
  /** A hero with a move or attack-move order whose centre comes this close kicks the ball. */
  kickReach: 1600,
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
