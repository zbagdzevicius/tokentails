/**
 * Match clock and timeline (POC.md §7.3). Integer ticks at 30 Hz. Seconds in comments only; data stores
 * round(s × 30), half up (§4.2).
 */
export const TICK_HZ = 30;

const C_TIMELINE = Object.freeze({
  /** 0:03 gate barrier drops (sim v4; 0:10 before). */
  barrierDrop: 90,
  /** 0:08 first minion wave (v4; 0:30 before). */
  firstWave: 240,
  /** 20 s between waves (v4; 25 s before). */
  waveEvery: 600,
  /** 0:30 rat camps up (v4; 1:00 before). */
  campsUp: 900,
  /** 2:00 siege units start (every 3rd wave; v4, 3:00 before). */
  siegeFrom: 3600,
  siegeEveryNthWave: 3,
  /** 2:30 Pudding (v4; 5:00 before). */
  pudding: 4500,
  /** Default 5:00 Sunset, 7:00 Sudden Death (v4; 8:00 and 10:00 before). Every difficulty has its own row in
   *  TIMELINE_BY (sim v12: Easy too); these stay the defaults of respawnTicks and clockAt. */
  sunset: 9000,
  suddenDeath: 12600,
  /** 11:00 safety end (= PAWLEGENDS_MAX_TICKS in shared/caps.ts). */
  safetyEnd: 19800,
  /** Hash trail cadence: one hash every 30 ticks (§4.3 step 9). */
  hashEvery: 30,
  /** Bots think every 6 ticks, staggered by slot (§4.3 step 2). */
  botThinkEvery: 6,
  /** Per-second effects (fountain, Sudden Death decay) run on ticks that are a multiple of this. */
  second: 30,
  /** Minion HP growth is per whole minute. */
  minute: 1800,
});

export const SUNSET = Object.freeze({
  /** Towers and cores take double damage (sim v4; +40% before). */
  structureDamageBp: 20000,
  /** Respawn × 1.25 (v4; × 1.5 before). */
  respawnBp: 12500,
  /** Minions +25% damage. */
  minionDamageBp: 12500,
  /** v4: from Sunset, each takedown deals this share of max HP to the victim's core (it pierces invulnerability):
   *  the player's kills close the match. */
  takedownCoreBp: 1500,
  /** Sim v5: while all of the victim's inner towers stand, a takedown deals only this share (5%). */
  closedCoreBp: 500,
});

export const SUDDEN_DEATH = Object.freeze({
  /** Cores lose 3% max HP a second (v4; 2% before). */
  coreDecayBpPerSecond: 300,
  /** Each takedown deals 10% core damage to the victim's core. */
  takedownCoreBp: 1000,
  /**
   * Sim v7 (playtest round 1: "losing every fight still wins"): a core's decay grows by this much per takedown its
   * team trails by (and shrinks by it per takedown ahead), within decayMinBp..decayMaxBp. A team 10 behind burns at
   * 5.5% a second, the team ahead at 1%.
   */
  decayPerTakedownBp: 25,
  decayMinBp: 100,
  decayMaxBp: 600,
});

/** Per-difficulty phase ticks (the match stores them in its globals at createMatch). */
export interface PhaseTimes {
  sunset: number;
  suddenDeath: number;
}
const C_TIMELINE_BY: Readonly<Record<'rookie' | 'easy' | 'normal' | 'hard', Readonly<PhaseTimes>>> = Object.freeze({
  /** Match 1: 4:00 Sunset, 6:15 Sudden Death (the plan said 5:30; at 5:30 a third of the fun1 matches reached it). */
  rookie: Object.freeze({ sunset: 7200, suddenDeath: 11700 }),
  /** Sim v12 (docs/FUN-PROGRESSION-V12.md S3): 5:45 Sunset, 7:45 Sudden Death (the TIMELINE defaults, 5:00 and
   *  7:00, before), so Toys and the longer XP curve have time to matter. */
  easy: Object.freeze({ sunset: 10350, suddenDeath: 13950 }),
  /** Sim v5: 6:00 Sunset, 7:45 Sudden Death, so a late teamfight can still turn a Normal match. Sim v12: 6:45 and 8:30. */
  normal: Object.freeze({ sunset: 12150, suddenDeath: 15300 }),
  hard: Object.freeze({ sunset: 12150, suddenDeath: 15300 }),
});

export type Timeline = { readonly [K in keyof typeof C_TIMELINE]: number };
export type TimelineBy = typeof C_TIMELINE_BY;

/** Sim v19 (MAP-5V5.md §1.9): Hearthwood's 5v5 timeline: 0:05 barrier, waves from 0:20 every 30 s, sieges from 3:00,
 *  Great Pudding at 8:00, the 16:00 safety end (= its MAX_TICKS in data/limits.ts). */
export const HEARTHWOOD_TIMELINE: Timeline = Object.freeze({
  ...C_TIMELINE,
  barrierDrop: 150,
  firstWave: 600,
  waveEvery: 900,
  campsUp: 900,
  siegeFrom: 5400,
  pudding: 14400,
  sunset: 18000,
  suddenDeath: 23400,
  safetyEnd: 28800,
});
/** Hearthwood's Sunset and Sudden Death per difficulty (Normal and Hard 10:00 and 13:00). */
export const HEARTHWOOD_TIMELINE_BY: TimelineBy = Object.freeze({
  rookie: Object.freeze({ sunset: 16200, suddenDeath: 21600 }),
  easy: Object.freeze({ sunset: 18900, suddenDeath: 24300 }),
  normal: Object.freeze({ sunset: 18000, suddenDeath: 23400 }),
  hard: Object.freeze({ sunset: 18000, suddenDeath: 23400 }),
});

export const CROSSING_TIMELINE: Timeline = C_TIMELINE;
export const CROSSING_TIMELINE_BY: TimelineBy = C_TIMELINE_BY;

/** Live bindings (sim v19): the active match's map's timeline (src/sim/map/runtime.ts bindMap). */
export let TIMELINE: Timeline = C_TIMELINE;
export let TIMELINE_BY: TimelineBy = C_TIMELINE_BY;

export function setTimeline(t: Timeline, by: TimelineBy): void {
  TIMELINE = t;
  TIMELINE_BY = by;
}
