/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md): the shared numbers of the pool maps' objectives and of the bots that play
 * them (each map's own row is its ObjectiveSpec in data/maps/*.ts). Integer mm, ticks, bp.
 */
export const OBJECTIVE = Object.freeze({
  /** Ground gem rows in the world state (the most gems in play on any map). */
  gemRows: 20,
  /** The ring round the Geode a gem pops on (2 m, in mirror pairs), and round a fallen hero (×3/4: 1.5 m). */
  gemRing: Object.freeze([
    Object.freeze([2000, 0] as const),
    Object.freeze([-2000, 0] as const),
    Object.freeze([0, 2000] as const),
    Object.freeze([0, -2000] as const),
    Object.freeze([1414, 1414] as const),
    Object.freeze([-1414, 1414] as const),
    Object.freeze([1414, -1414] as const),
    Object.freeze([-1414, -1414] as const),
  ]),
  /** A dropped gem stays this far inside the map edge. */
  gemEdge: 2500,
  /** A ball that stops looks this far ahead along its roll for a crate, with this much slack round the crate. */
  crateProbe: 1500,
  crateSlack: 500,
});

/** Sim v34: how the in-sim bots play the objectives (bots/objective.ts). */
export const OBJECTIVE_BOT = Object.freeze({
  /** The roamer goes to the mill once its pot holds this much (or an ally or enemy is on it). */
  millPot: 120,
  /** Laners join a mill fight within this distance of it. */
  millJoin: 30000,
  /** Bots go for a Paw Shrine within this distance; the roamer from anywhere. */
  shrineRange: 22000,
  /** Allies near the enemy shrine (within shrineAllies) that make an invade worth it. */
  shrineAllyRange: 15000,
  shrineAllies: 2,
  /** A ground gem within this of a bot, with no enemy hero within gemSafe of the gem, is taken. */
  gemRange: 10000,
  gemSafe: 8000,
  /** The roamer collects gems within this of the Geode. */
  gemRoam: 16000,
  /** Where the roamer waits for gems (arena entrance) and where carriers hold during their countdown (team 0). */
  gemWaitX: 38000,
  gemHoldX: 24000,
  /** A carrier with this many gems stays back from fights (adds holdHp to its retreat threshold). */
  gemCarrier: 3,
  /** Pawball Park: bots within ballRange of a resting ball play it; a ball within defend of the own goal is cleared. */
  ballRange: 15000,
  // V34-MAPS.md §2b: 13 m (was 14 m): at 14 m the clears met every ball in the crate line, and 69% of matches had a
  // goal (62% with the pool late ramp); 13 m gives 75%. Below ~12.5 m the clears stop and a match has 8+ goals.
  defend: 13000,
  /** The approach point behind the ball, the kick walk past it, the side step when ahead of it. */
  behind: 2000,
  through: 2000,
  side: 3500,
  /** A bot more than this on the goal side of the ball steps round it first. */
  aheadSlack: 500,
  /** Within this of the approach point the kick walk starts. */
  ready: 700,
  /** Aim offsets (y) at the goal line tried when the straight line is blocked. */
  aimOffset: 2500,
});
