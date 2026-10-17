/**
 * Match clock and timeline (POC.md §7.3). Integer ticks at 30 Hz. Seconds in comments only; data stores
 * round(s × 30), half up (§4.2).
 */
export const TICK_HZ = 30;

export const TIMELINE = Object.freeze({
  /** 0:10 gate barrier drops. */
  barrierDrop: 300,
  /** 0:30 first minion wave. */
  firstWave: 900,
  /** 25 s between waves. */
  waveEvery: 750,
  /** 1:00 rat camps up. */
  campsUp: 1800,
  /** 3:00 siege units start (every 3rd wave). */
  siegeFrom: 5400,
  siegeEveryNthWave: 3,
  /** 5:00 Pudding. */
  pudding: 9000,
  /** 8:00 Sunset. */
  sunset: 14400,
  /** 10:00 Sudden Death. */
  suddenDeath: 18000,
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
  /** Towers and cores take +40% damage. */
  structureDamageBp: 14000,
  /** Respawn × 1.5. */
  respawnBp: 15000,
  /** Minions +25% damage. */
  minionDamageBp: 12500,
});

export const SUDDEN_DEATH = Object.freeze({
  /** Cores lose 2% max HP a second. */
  coreDecayBpPerSecond: 200,
  /** Each takedown deals 10% core damage to the victim's core. */
  takedownCoreBp: 1000,
});
