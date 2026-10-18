/**
 * Match clock and timeline (POC.md §7.3). Integer ticks at 30 Hz. Seconds in comments only; data stores
 * round(s × 30), half up (§4.2).
 */
export const TICK_HZ = 30;

export const TIMELINE = Object.freeze({
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
  /** Easy and Normal: 5:00 Sunset, 7:00 Sudden Death (v4; 8:00 and 10:00 before). Rookie: TIMELINE_BY. */
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
});

/** Per-difficulty phase ticks (the match stores them in its globals at createMatch). */
export interface PhaseTimes {
  sunset: number;
  suddenDeath: number;
}
export const TIMELINE_BY: Readonly<Record<'rookie' | 'easy' | 'normal', Readonly<PhaseTimes>>> = Object.freeze({
  /** Match 1: 4:00 Sunset, 6:15 Sudden Death (the plan said 5:30; at 5:30 a third of the fun1 matches reached it). */
  rookie: Object.freeze({ sunset: 7200, suddenDeath: 11700 }),
  easy: Object.freeze({ sunset: TIMELINE.sunset, suddenDeath: TIMELINE.suddenDeath }),
  /** Sim v5: 6:00 Sunset, 7:45 Sudden Death, so a late teamfight can still turn a Normal match. */
  normal: Object.freeze({ sunset: 10800, suddenDeath: 13950 }),
});
