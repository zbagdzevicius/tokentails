/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §9.1): Hearthwood's jungle route graph and the bots' jungle tuning.
 * Team 0's south quadrant is authored; `sim/bots/jungle.ts` copies it to the four quadrants (the swap gives the west
 * quadrant, the river mirror (x, y) → (W − y, W − x) gives team 1's two). Derived at bind, never hashed.
 */

/** Node kinds: the jungle base mouth, a camp clearing, a trunk junction, side-lane and mid exits, river entrances. */
export const JNODE = Object.freeze({ Base: 0, Camp: 1, Junction: 2, LaneSafe: 3, LaneRisky: 4, MidSafe: 5, MidRisky: 6, RiverUp: 7, RiverPit: 8 });

/** Hearthwood's width (mm): team 1's nodes are the river mirror (x, y) → (W − y, W − x) of team 0's. */
export const JUNGLE_W = 128000;

/** Team 0's pit-mouth bushes where bots wait for an objective (§9.4): Grizzlechop's, then the Great Pudding's. */
export const PIT_WAITS = Object.freeze([Object.freeze([86000, 27000] as const), Object.freeze([27000, 86000] as const)]);

/** South quadrant nodes [kind, x, y] (mm), in this order; edges below use these indices. */
export const SOUTH_NODES = Object.freeze([
  Object.freeze([JNODE.Base, 30000, 18000] as const),
  Object.freeze([JNODE.Camp, 42000, 22000] as const),
  Object.freeze([JNODE.Camp, 58000, 30000] as const),
  Object.freeze([JNODE.Camp, 80000, 24000] as const),
  Object.freeze([JNODE.Camp, 64000, 42000] as const),
  Object.freeze([JNODE.Junction, 50000, 26000] as const),
  Object.freeze([JNODE.LaneSafe, 48000, 13000] as const),
  Object.freeze([JNODE.LaneRisky, 88000, 13000] as const),
  Object.freeze([JNODE.MidSafe, 35000, 30000] as const),
  Object.freeze([JNODE.MidRisky, 57000, 51000] as const),
  Object.freeze([JNODE.RiverUp, 76000, 48000] as const),
  Object.freeze([JNODE.RiverPit, 87000, 30000] as const),
]) as readonly (readonly [number, number, number])[];

/** South quadrant edges (node indices): the corridors P1 to P10. */
export const SOUTH_EDGES = Object.freeze([
  [0, 1],
  [1, 5],
  [5, 2],
  [2, 3],
  [2, 4],
  [4, 9],
  [4, 10],
  [3, 11],
  [3, 7],
  [5, 6],
  [1, 8],
] as const) as readonly (readonly [number, number])[];

/**
 * Bot jungle tuning (§9.2 to §9.4; mm and ticks). Rookie and Easy Prowls keep the v19 camp-then-lane habit; Normal adds
 * the fixed first clear, ganks, objective waits and the laners' danger read; Hard adds invades.
 */
export const JUNGLE_BOT = Object.freeze({
  /** Gank: an enemy laner visible within this of one of our exits (a side lane's wave meets ~25 m past its exit). */
  gankExit: 26000,
  /** … that our Prowl reaches within this walk (straight line to the exit). */
  gankReach: 60000,
  /** … at or below this HP share, or on our side of the river. */
  gankHpBp: 7000,
  /** During the first clear: only an exit this near, and a target at or below this HP share. */
  earlyGankReach: 25000,
  earlyGankHpBp: 5000,
  /** … with an allied hero within this of it. */
  gankAlly: 10000,
  /** … and no more enemy heroes within this of it than our side there plus the Prowl. */
  gankCount: 12000,
  /** A gank gives up after this long past the walk to its target (6 s); the walk at about 4.8 m/s (mm a tick). */
  gankTicks: 180,
  walkMmPerTick: 160,
  /** The Prowl waits at its pit-mouth bush from this long before an objective spawns (20 s). */
  objectiveSoon: 600,
  /** Contest: heroes counted within this of the pit (ours and theirs); our Prowl within objectiveProwl counts too. */
  objectiveCount: 20000,
  objectiveProwl: 25000,
  /** Contest holds apply within this of the pit (farther, a bot keeps walking to it). */
  holdNear: 30000,
  /** A hold at the mouth bush lasts at least this long (3 s) before the bot looks again. */
  holdTicks: 90,
  /** Steal: the objective at or below this HP share with one of us within stealRange. */
  stealHpBp: 1500,
  stealRange: 10000,
  /** Danger read: a laner past the river backs off when the enemy Prowl is unseen this long (12 s). */
  dangerUnseen: 360,
  /** … only within this of its own standing outer structure in its lane (a bot elsewhere is not laning). */
  dangerLane: 60000,
  /** Invade (Hard): an enemy buff up within this (10 s), the enemy Prowl seen within invadeSeen far from it. */
  invadeSoon: 300,
  invadeSeen: 450,
  invadeFar: 40000,
  /** Invade: give up when this many enemy heroes are visible within invadeRetreat. */
  invadeQuit: 2,
  invadeRetreat: 15000,
  /** The Prowl keeps to its plan (camps, ganks) down to this HP share (the other objectives: BOT_AI.objectiveHpBp). */
  campHpBp: 3000,
  /**
   * Balance pass: a Normal or Hard team groups in one push lane from this tick (BotParams.groupAt, 3:55, is the
   * Crossing's); before it, a team BOT_AI.leadGroup takedowns ahead still groups (leadPressure).
   */
  groupAt: 14400,
  /** A bot keeps a walk goal at least this long (1.5 s) before a goal more than goalFar away replaces it. */
  goalHold: 45,
  goalFar: 5000,
  /** An attack on a target within the attacker's reach plus this (mm) needs no walk: never held (brain.ts holdWalk). */
  reachSlack: 1000,
  /** Farm: a camp due within this long is walked to and waited at (15 s); a buff wins over a small camp this much nearer. */
  farmWait: 450,
  buffBias: 4000,
});
