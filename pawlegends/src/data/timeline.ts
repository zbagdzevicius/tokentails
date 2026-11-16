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
  /** Default 5:00 Sunset (v4; 8:00 before) and 7:00 late Sunset (sim v32; Sudden Death's tick until sim v31). Every
   *  difficulty has its own row in TIMELINE_BY (sim v12: Easy too); these stay the defaults of respawnTicks and clockAt. */
  sunset: 9000,
  late: 12600,
  /** 11:00 safety end (= PAWLEGENDS_MAX_TICKS in shared/caps.ts). */
  safetyEnd: 19800,
  /** Hash trail cadence: one hash every 30 ticks (§4.3 step 9). */
  hashEvery: 30,
  /** Bots think every 6 ticks, staggered by slot (§4.3 step 2). */
  botThinkEvery: 6,
  /** Per-second effects (fountain, regeneration, trickle XP) run on ticks that are a multiple of this. */
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

/**
 * Sim v32 (docs/plans/moba/V32-NO-SUDDEN-DEATH.md): there is no Sudden Death any more (sim v4 to v31: cores burned 3%
 * a second and every takedown hit the core for 10%). Matches still end on structures: from the match's late tick
 * (TIMELINE_BY `late`, a mutator's own) Sunset deepens, the same for both teams, so the side that wins the fights and
 * the lanes takes the core:
 * - every minute past the late tick adds structureBpPerMinute to the damage towers and cores take (on top of Sunset's
 *   ×2, prorated by the tick), up to structureMaxBp more;
 * - respawn waits grow by respawnBpPerMinute a minute past the late tick, up to respawnMaxBp more, and may reach
 *   respawnHardCap (RESPAWN.hardCap before it), so a won teamfight has the time to reach the core;
 * - with lead pressure, the team ahead on takedowns hits structures harder (leadBpPerTakedown a takedown).
 * Takedowns keep Sunset's core share (SUNSET.takedownCoreBp / closedCoreBp) to the end.
 */
export const LATE_SUNSET = Object.freeze({
  structureBpPerMinute: 20000,
  structureMaxBp: 100000,
  respawnBpPerMinute: 5000,
  respawnMaxBp: 20000,
  respawnHardCap: 1350,
  /** Where the difficulty has lead pressure (DifficultyRules.leadPressure) and the mode allows it
   *  (MutatorRules.lateLead): from the late tick each takedown a team is ahead adds this to its structure damage, up to
   *  leadMaxBp (sim v7 to v31 burned the trailing team's core faster in Sudden Death instead). */
  leadBpPerTakedown: 1500,
  leadMaxBp: 15000,
  /** Towers' damage to minions falls by this much a minute past the late tick, to towerMinionMinBp: the waves push
   *  through, so both bases open and the team that wins the fights gets there first. */
  towerMinionBpPerMinute: 2500,
  towerMinionMinBp: 2500,
});

/** Per-difficulty phase ticks (the match stores them in its globals at createMatch). Sim v32: `late` is the late
 *  Sunset tick (LATE_SUNSET; Sudden Death's tick until sim v31, the same numbers). */
export interface PhaseTimes {
  sunset: number;
  late: number;
}
const C_TIMELINE_BY: Readonly<Record<'rookie' | 'easy' | 'normal' | 'hard', Readonly<PhaseTimes>>> = Object.freeze({
  /** Match 1: 4:00 Sunset, late from 6:15 (the plan said 5:30; at 5:30 a third of the fun1 matches reached it). */
  rookie: Object.freeze({ sunset: 7200, late: 11700 }),
  /** Sim v12 (docs/FUN-PROGRESSION-V12.md S3): 5:45 Sunset, late from 7:45 (the TIMELINE defaults, 5:00 and 7:00,
   *  before), so Toys and the longer XP curve have time to matter. */
  easy: Object.freeze({ sunset: 10350, late: 13950 }),
  /** Sim v5: 6:00 Sunset, so a late teamfight can still turn a Normal match. Sim v12: 6:45, late from 8:30. */
  normal: Object.freeze({ sunset: 12150, late: 15300 }),
  hard: Object.freeze({ sunset: 12150, late: 15300 }),
});

export type LateSunset = { readonly [K in keyof typeof LATE_SUNSET]: number };
/**
 * Sim v32: Hearthwood's late Sunset (late.ts picks it on the 5v5 map). Three lanes of towers and five defenders a side
 * need a steeper ramp: on 600 PvP matches (V32-NO-SUDDEN-DEATH.md §4) Crossing's numbers left 37.8% at the 16:00
 * safety end; these end the median match at about 12:10 with 2% or less at the safety end.
 */
export const HEARTHWOOD_LATE: LateSunset = Object.freeze({
  ...LATE_SUNSET,
  structureBpPerMinute: 60000,
  structureMaxBp: 400000,
  respawnBpPerMinute: 10000,
  respawnMaxBp: 30000,
  respawnHardCap: 1800,
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
  late: 16200,
  safetyEnd: 28800,
});
/**
 * Hearthwood's Sunset and late Sunset per difficulty (Normal and Hard 10:00 and 9:00). Sim v32: the late tick is 4:00
 * earlier than Sudden Death's was (13:00 on Normal and Hard): with no core burn the 5v5 match needs the longer ramp
 * (HEARTHWOOD_LATE) to end at about 12 to 14 minutes. Before Sunset only the respawn waits grow; the structure share
 * starts with Sunset, a minute into the ramp.
 */
export const HEARTHWOOD_TIMELINE_BY: TimelineBy = Object.freeze({
  rookie: Object.freeze({ sunset: 16200, late: 14400 }),
  easy: Object.freeze({ sunset: 18900, late: 17100 }),
  normal: Object.freeze({ sunset: 18000, late: 16200 }),
  hard: Object.freeze({ sunset: 18000, late: 16200 }),
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
