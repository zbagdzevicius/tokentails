/**
 * Synthetic player personas. Every number is a human-scale limit, not a tuning knob for winning:
 * ticks are sim ticks (30 per second).
 */
export type PersonaId = 'novice' | 'cautious' | 'rusher' | 'explorer' | 'oracle';

export interface Persona {
  id: PersonaId;
  label: string;
  description: string;
  /** Reaction delay range (ticks) applied to everything the bot perceives about the world. */
  reaction: readonly [number, number];
  /** Fraction of the desktop camera view the player actually attends to (1 = the whole screen). */
  viewScale: number;
  /** Ticks between replans (the path is still steered every tick). */
  decisionEvery: number;
  /** How far ahead (ticks) the player extrapolates a visible dog's walk. */
  horizon: number;
  /** Safety window (ticks) either side of the predicted arrival on a tile. */
  timeBuffer: number;
  /** Extra tiles of reach the player allows a vision cone (0 = trust the drawn cone edge). */
  coneMargin: 0 | 1;
  /** Ticks the player waits for a safe gap before risking a dash past the current cones only. */
  patience: number;
  /** Chance per replan of a sloppy key press (screen-relative keys: one of two keys dropped). */
  pathNoise: number;
  /** Duration (ticks) of one sloppy press. */
  wobble: readonly [number, number];
  /** Ticks the player keeps holding a key after arriving where they wanted to stop. */
  overshoot: readonly [number, number];
  /** Unintended swaps per minute (fat-fingered Q/Tab). */
  wrongSwapPerMin: number;
  /** Max extra tiles of detour for a visible coin. */
  coinDetour: number;
  /** Explores every reachable room and grabs every known coin before heading out. */
  exploreAll: boolean;
  /** Knows from the start that a meow lures a dog / that a plate held by one cat opens a door. */
  knowsLure: boolean;
  knowsPlates: boolean;
  /** Chance of reading a newly shown hint or objective line (and learning from it). */
  readsHints: number;
  /** Ticks spent standing still reading a hint. */
  hintRead: readonly [number, number];
  /** Ticks stuck before trying an unknown mechanic anyway (experimenting). */
  experimentAfter: number;
  /** Soft cost (ticks) for crossing a cone direction a sentry was seen facing before. */
  sentryCaution: number;
  /** Soft cost (ticks) for tiles where this player was caught before. */
  spotMemoryCost: number;
  /** Chance per replan of checking the parked plate holder when it is on screen. */
  watchHolder: number;
  /** Waiting, hiding and parking spots: -1 anywhere; 0 out of sight of the dog beats the player has watched; 1 also off the beats; 2 also not next to one. */
  trackClearance: number;
  /** Chance of moving a cat off a dog's route before swapping away from it. */
  parkSafely: number;
  /** Retry from the pause menu after this many seconds without any plan (soft-locked or lost), at most `maxRetries` times. */
  retryAfterSec: number;
  maxRetries: number;
  /** Fraction of the true meow radius the player believes (read off the meow wave). */
  meowRadiusBelief: readonly [number, number];
  /** Frustration: quit after `spots` spots within `windowSec`, or no progress for `noProgressSec`. */
  quit: { spots: number; windowSec: number; noProgressSec: number };
  /** Diagnostic only: starts with the whole map known (no exploration). */
  fullKnowledge?: boolean;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  novice: {
    id: 'novice',
    label: 'Novice',
    description: 'First stealth game. Slow reactions, narrow attention, sloppy keys, learns lures and plates from the hint text.',
    reaction: [11, 14],
    viewScale: 0.7,
    decisionEvery: 4,
    horizon: 24,
    timeBuffer: 3,
    coneMargin: 0,
    patience: 120,
    pathNoise: 0.1,
    wobble: [3, 8],
    overshoot: [0, 4],
    wrongSwapPerMin: 0.6,
    coinDetour: 3,
    exploreAll: false,
    knowsLure: false,
    knowsPlates: false,
    readsHints: 0.85,
    hintRead: [45, 90],
    experimentAfter: 1200,
    sentryCaution: 0,
    spotMemoryCost: 6,
    watchHolder: 0.05,
    trackClearance: -1,
    parkSafely: 0.15,
    retryAfterSec: 30,
    maxRetries: 1,
    meowRadiusBelief: [0.9, 1.05],
    quit: { spots: 5, windowSec: 60, noProgressSec: 90 },
  },
  cautious: {
    id: 'cautious',
    label: 'Cautious',
    description: 'Waits for clear gaps, keeps a tile of clearance from cones, remembers where dogs turn, hates being caught.',
    reaction: [8, 12],
    viewScale: 0.9,
    decisionEvery: 3,
    horizon: 60,
    timeBuffer: 6,
    coneMargin: 1,
    patience: 360,
    pathNoise: 0.03,
    wobble: [2, 4],
    overshoot: [0, 2],
    wrongSwapPerMin: 0.1,
    coinDetour: 5,
    exploreAll: false,
    knowsLure: true,
    knowsPlates: true,
    readsHints: 1,
    hintRead: [20, 40],
    experimentAfter: 900,
    sentryCaution: 18,
    spotMemoryCost: 30,
    watchHolder: 0.5,
    trackClearance: 1,
    parkSafely: 1,
    retryAfterSec: 20,
    maxRetries: 2,
    meowRadiusBelief: [0.95, 1.0],
    quit: { spots: 4, windowSec: 60, noProgressSec: 150 },
  },
  rusher: {
    id: 'rusher',
    label: 'Rusher',
    description: 'Fast hands, short look-ahead, little patience: dashes past cones and shrugs off getting caught.',
    reaction: [6, 9],
    viewScale: 0.85,
    decisionEvery: 3,
    horizon: 24,
    timeBuffer: 2,
    coneMargin: 0,
    patience: 30,
    pathNoise: 0.05,
    wobble: [2, 5],
    overshoot: [0, 3],
    wrongSwapPerMin: 0.3,
    coinDetour: 1,
    exploreAll: false,
    knowsLure: true,
    knowsPlates: true,
    readsHints: 0.3,
    hintRead: [10, 20],
    experimentAfter: 600,
    sentryCaution: 0,
    spotMemoryCost: 3,
    watchHolder: 0.05,
    trackClearance: -1,
    parkSafely: 0,
    retryAfterSec: 10,
    maxRetries: 3,
    meowRadiusBelief: [0.95, 1.1],
    quit: { spots: 8, windowSec: 45, noProgressSec: 90 },
  },
  explorer: {
    id: 'explorer',
    label: 'Explorer',
    description: 'Completionist: opens every room and grabs every coin before the exit, careful but not timid.',
    reaction: [7, 11],
    viewScale: 1,
    decisionEvery: 3,
    horizon: 36,
    timeBuffer: 4,
    coneMargin: 0,
    patience: 180,
    pathNoise: 0.04,
    wobble: [2, 5],
    overshoot: [0, 2],
    wrongSwapPerMin: 0.15,
    coinDetour: 99,
    exploreAll: true,
    knowsLure: true,
    knowsPlates: true,
    readsHints: 0.9,
    hintRead: [20, 45],
    experimentAfter: 900,
    sentryCaution: 8,
    spotMemoryCost: 15,
    watchHolder: 0.3,
    trackClearance: 0,
    parkSafely: 0.7,
    retryAfterSec: 25,
    maxRetries: 2,
    meowRadiusBelief: [0.95, 1.05],
    quit: { spots: 6, windowSec: 90, noProgressSec: 180 },
  },
  oracle: {
    id: 'oracle',
    label: 'Oracle (diagnostic)',
    description: 'No delay, whole map known, no noise, never quits early. Upper bound for the planner, not a human.',
    reaction: [0, 0],
    viewScale: 4,
    decisionEvery: 3,
    horizon: 60,
    timeBuffer: 4,
    coneMargin: 0,
    patience: 600,
    pathNoise: 0,
    wobble: [0, 0],
    overshoot: [0, 0],
    wrongSwapPerMin: 0,
    coinDetour: 4,
    exploreAll: false,
    knowsLure: true,
    knowsPlates: true,
    readsHints: 0,
    hintRead: [0, 0],
    experimentAfter: 600,
    sentryCaution: 8,
    spotMemoryCost: 10,
    watchHolder: 1,
    trackClearance: 0,
    parkSafely: 1,
    retryAfterSec: 10,
    maxRetries: 3,
    meowRadiusBelief: [1, 1],
    quit: { spots: 1000, windowSec: 1, noProgressSec: 100000 },
    fullKnowledge: true,
  },
};

/** The four human personas the report covers (oracle is a diagnostic). */
export const HUMAN_PERSONAS: readonly PersonaId[] = ['novice', 'cautious', 'rusher', 'explorer'];
