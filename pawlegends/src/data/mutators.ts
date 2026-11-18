/**
 * Sim v22 (docs/plans/moba/WR-BS-PLAN.md §4): the match mutators' rule table. One frozen row per mutator, read by the
 * tower and core setup, XP, respawn, the Kibble Cannon, the phase clock and the win check (sim/mutator.ts `mutOf`),
 * so no system carries its own `if (blitz)`. Every value of the 'none' row is the neutral one: a 'none' match plays
 * exactly as in v21 (gate G1).
 *
 * Blitz: a ~3-minute Crossing match. Start at level 4 (the level-3 talent is offered at once), XP ×2, towers ×0.45 and
 * cores ×0.5 HP (of the v21 values), respawn 6 s rising to 8 s, the cannon at 0:20 and 40 s after each shot, Sunset at
 * 1:30, late Sunset from 2:30 (sim v32; Sudden Death until v31), and a hard end at 3:15 (EndReason 4 timeUp, won on
 * structures, then core HP, then takedowns, then structure damage, else a draw).
 */
import type { HeroId, MapId, Mutator } from '../sim/api';
import { CROSSING_CANNON, type CannonData } from './fun';

export interface MutatorRules {
  /** The maps it may be played on (empty: every map). */
  maps: readonly MapId[];
  /** Level every hero starts at (1: the normal start). The talents of the levels passed are offered at tick 0. */
  startLevel: number;
  /** XP from every source × this (bp; 10000 = ×1). */
  xpBp: number;
  /** Tower and core HP × this, after the difficulty's own scale (bp). */
  towerHpBp: number;
  coreHpBp: number;
  /** Respawn wait, ticks: `respawnFrom` at 0:00 rising in a straight line to `respawnTo` at the hard end; 0: the normal
   *  rules (level, Sunset, lead pressure, caps). */
  respawnFrom: number;
  respawnTo: number;
  /** Kibble Cannon row (its first spawn and the wait after a shot or fizzle); null: the map's own. */
  cannon: CannonData | null;
  /** Towers are Fortified until this tick (−1: the map's own, TOWERS.fortifyUntil; 0: never). */
  fortifyUntil: number;
  /** Catch-up XP starts at this tick (−1: the difficulty's DifficultyRules.catchUpFrom). */
  catchUpFrom: number;
  /** Hero-vs-hero damage × this (bp), then the per-hero row (`hero`, its own balance pass). */
  heroVsHeroBp: number;
  hero: Readonly<Partial<Record<HeroId, Readonly<{ dmgBp: number; takenBp: number }>>>>;
  /** The Underdog Cannon favours a team this many takedowns behind (0: the COMEBACK trigger's own). */
  underdogTakedowns: number;
  /** Core damage from takedowns (the chip before Sunset, the Sunset share) × this (bp). */
  takedownCoreBp: number;
  /** Enemy bots leave the human alone until this tick (−1: the difficulty's DifficultyRules.truceUntil). */
  truceUntil: number;
  /** Sunset and late Sunset ticks (0: the difficulty's). Sim v32: `late` (data/timeline.ts LATE_SUNSET) replaced
   *  `suddenDeath` (the same ticks). */
  sunset: number;
  late: number;
  /** Sim v32: late Sunset's extra structure damage (LATE_SUNSET.structureBpPerMinute and structureMaxBp) × this (bp). */
  lateRampBp: number;
  /** Sim v32: late Sunset's takedown-lead structure bonus (LATE_SUNSET.leadBpPerTakedown) where the difficulty has lead
   *  pressure; false: the same for both teams (Blitz; sim v22 to v31 switched Sudden Death's takedown-gap burn off,
   *  `decayLead`). */
  lateLead: boolean;
  /** The designed end (0: none, only the map's safety end). At this tick the match ends with reason 'timeUp'. */
  hardEnd: number;
  /**
   * Sim v37 (V37.md §3): at the designed end a team this many takedowns ahead wins (a rout) before the structure
   * tie-breakers (0: never). Blitz 8: a team that lost the fights 10-0 no longer wins on one extra tower at 3:15.
   */
  routTakedowns: number;
  /** Sim v27: ability and Paw Trick cooldowns × this (bp; at least one tick). */
  cooldownBp: number;
  /** Sim v27: Fish from every source × this (bp), so Toys come sooner. */
  fishBp: number;
  /** Sim v27: the waits of Frenzy Catnip and Fish Snacks × this (bp; their first spawn too). */
  pickupEveryBp: number;
  /** Sim v27: the takedown-streak bounty (XP.killPerStreak, killStreakMax) and the shutdown Fish × this (bp). */
  bountyBp: number;
  /** Sim v27: the human may forfeit (leave) from this tick (−1: the difficulty's DifficultyRules.forfeitFrom). */
  forfeitFrom: number;
  /**
   * Sim v27 (V27.md §2): the Practice ground. No lane waves and no Pudding, the cores never open, the bots never think;
   * the enemy heroes are training dummies (data/practice.ts) that stand or walk on their spots and never strike.
   */
  practice: boolean;
  /**
   * Sim v28 (docs/plans/moba/V28.md §2): the match plays on the Crossing's Sunny Lane strip (data/map.ts
   * CROSSING_STRIP). One lane of waves, every bot in it; no rat camps, Pudding, Kibble Cannon, yarn balls or Boing Beds
   * (they stand off the strip); Frenzy Catnip and Fish Snacks only on the strip.
   */
  strip: boolean;
  /** Sim v28: no Nap (recall) and the fountain heals nobody: heal from Fish Snacks, Frenzy Catnip and respawns. */
  noRecall: boolean;
  /** Sim v28: heroes in play per team (0: all). The others sit out the match (never spawn, never think). */
  playing: readonly [number, number];
  /** Sim v28: lane waves spawn (false: no lane minions at all). */
  waves: boolean;
  /** Sim v28: towers and cores can be damaged (false: no structure takes damage, takedowns chip nothing). */
  structures: boolean;
  /** Sim v28: the first team to this many takedowns wins ('goal'; 0: none). */
  goalTakedowns: number;
  /** Sim v28: the first team to destroy a tower wins ('goal'). */
  goalTower: boolean;
  /** Sim v28 (V28.md §4): Boss Weekend. The enemy team's one hero is the boss (data/boss.ts); felling it wins ('goal'). */
  boss: boolean;
}

const NONE: MutatorRules = Object.freeze({
  maps: Object.freeze([] as MapId[]),
  startLevel: 1,
  xpBp: 10000,
  towerHpBp: 10000,
  coreHpBp: 10000,
  respawnFrom: 0,
  respawnTo: 0,
  cannon: null,
  fortifyUntil: -1,
  catchUpFrom: -1,
  heroVsHeroBp: 10000,
  hero: Object.freeze({}),
  underdogTakedowns: 0,
  takedownCoreBp: 10000,
  truceUntil: -1,
  sunset: 0,
  late: 0,
  lateRampBp: 10000,
  lateLead: true,
  hardEnd: 0,
  routTakedowns: 0,
  cooldownBp: 10000,
  fishBp: 10000,
  pickupEveryBp: 10000,
  bountyBp: 10000,
  forfeitFrom: -1,
  practice: false,
  strip: false,
  noRecall: false,
  playing: Object.freeze([0, 0] as [number, number]),
  waves: true,
  structures: true,
  goalTakedowns: 0,
  goalTower: false,
  boss: false,
});

const BLITZ: MutatorRules = Object.freeze({
  maps: Object.freeze(['crossing'] as MapId[]),
  startLevel: 4,
  xpBp: 20000,
  // v21 Crossing towers 2,250 / 2,750 → about 1,010 / 1,240
  towerHpBp: 4500,
  coreHpBp: 5000,
  // 6 s → 8 s
  respawnFrom: 180,
  respawnTo: 240,
  // 0:20, then 40 s after each shot or fizzle (none from late Sunset on, as on every map)
  cannon: Object.freeze({ ...CROSSING_CANNON, first: 600, respawn: 1200 }),
  // Crossing's Fortified would cover the whole match. Sim v21 to v25: no Fortify; sim v26 (V26-TOWERS.md §1.B): a
  // short one, 0:45, so the first tower does not fall in the opening minute (0:30 gave a 1:14 median first tower for an
  // Easy novice, under the 1:15 floor; V26-TOWERS.md §2)
  fortifyUntil: 1350,
  // Normal's catch-up starts at 3:00 (never in Blitz): from 0:45
  catchUpFrom: 1350,
  // takedowns 3.5 a minute at ×1; the Blitz band is 4 to 6 (BLITZ.md §4)
  heroVsHeroBp: 13500,
  // fitted on the Blitz gate (4,000-seed windows 980001 and 990001, then four outliers): every match is cats vs dogs, so
  // a species shift moves ten heroes at once (about 2.6 points per 1% relative); one hero moves about 0.8 points per 1%.
  // Rebased on main's v20 + v21 (fresh windows 3500001 and 3700001, 4,000 matches): cats 47.8%; every cat row +1% gave
  // 53.0% (4000001, 4100001), so every cat row +0.5% but Duchess (52.4% before), and Aviete (44.3%) +1.6% in all
  // Sim v32 (no Sudden Death; the 3:15 tie-breakers decide nearly every match): cats read 53.4% on seeds 20001-22000,
  // so every cat row −0.5% (the v29 and v31 cats get rows at −0.5%).
  // Sim v33 (V33-KILLS.md): every row × the inverse of its hero's 3v3 row change (the 3v3 row applies here too), so the
  // 3v3 refit for the bigger kill rewards leaves Blitz where it was.
  // Sim v37 (V37.md §4): refit with the v37 bots (they commit to a walk goal) and the rout rule: two rounds on seeds
  // 1-8,000 (a logistic fit over the line-ups, damped), verified on 20,001-28,000: every hero 46.8-52.5%, cats 50.4%.
  hero: Object.freeze({
    aviete: { dmgBp: 9172, takenBp: 10831 },
    bengas: { dmgBp: 10703, takenBp: 9296 },
    bravo: { dmgBp: 10570, takenBp: 9394 },
    brutus: { dmgBp: 10307, takenBp: 9668 },
    cacklejaw: { dmgBp: 9486, takenBp: 10453 },
    chili: { dmgBp: 10219, takenBp: 9771 },
    clem: { dmgBp: 9231, takenBp: 10805 },
    domino: { dmgBp: 10086, takenBp: 9912 },
    duchess: { dmgBp: 9769, takenBp: 10227 },
    frankie: { dmgBp: 9257, takenBp: 10675 },
    gabe: { dmgBp: 10405, takenBp: 9576 },
    howler: { dmgBp: 9035, takenBp: 11027 },
    lambo: { dmgBp: 10350, takenBp: 9632 },
    marshmallow: { dmgBp: 10354, takenBp: 9647 },
    meatball: { dmgBp: 11633, takenBp: 8356 },
    nugget: { dmgBp: 10678, takenBp: 9347 },
    pixel: { dmgBp: 9374, takenBp: 10601 },
    rocket: { dmgBp: 10084, takenBp: 9912 },
    sage: { dmgBp: 9286, takenBp: 10743 },
    stilts: { dmgBp: 9546, takenBp: 10394 },
    mochi: { dmgBp: 10263, takenBp: 9728 },
    ziggy: { dmgBp: 9533, takenBp: 10461 },
    nova: { dmgBp: 9643, takenBp: 10365 },
    dusty: { dmgBp: 10018, takenBp: 9980 },
    barkula: { dmgBp: 10194, takenBp: 9805 },
    biscuit: { dmgBp: 10144, takenBp: 9853 },
    champ: { dmgBp: 9283, takenBp: 10726 },
    ranger: { dmgBp: 10622, takenBp: 9400 },
  }),
  // the cannon goes to a team 3 takedowns behind (8 on every other match): a short match needs its comeback early
  underdogTakedowns: 3,
  // half the takedown core damage: kills still count, the core and the towers decide
  takedownCoreBp: 5000,
  truceUntil: -1,
  // 1:30 Sunset, 2:30 late Sunset, 3:15 time up
  sunset: 2700,
  late: 4500,
  lateRampBp: 10000,
  // every core takes the same late Sunset bonus (sim v22 to v31: decayLead false, the same core burn for both)
  lateLead: false,
  hardEnd: 5850,
  // Sim v37: 8+ takedowns ahead at 3:15 wins (a team down 10+ won 8.1% of 356 such matches, all at the time up on towers)
  routTakedowns: 8,
  cooldownBp: 10000,
  fishBp: 10000,
  pickupEveryBp: 10000,
  bountyBp: 10000,
  forfeitFrom: -1,
  practice: false,
  strip: false,
  noRecall: false,
  playing: Object.freeze([0, 0] as [number, number]),
  waves: true,
  structures: true,
  goalTakedowns: 0,
  goalTower: false,
  boss: false,
});

/**
 * Sim v27 (V27.md §3): Cannon Chaos, a ~5-minute Crossing party match built on the Kibble Cannon. The cannon is up at
 * 0:15 and back 20 s after every shot or fizzle (the Underdog Cannon still favours a team 3 takedowns behind), heroes
 * start at level 3 with XP ×1.5 and cooldowns ×0.7, towers ×0.7 and cores ×0.8 HP, Fortified until 1:00, respawns 5 s
 * rising to 7 s, Sunset at 3:00, late Sunset from 4:15 and time up at 5:15.
 */
const CANNON_CHAOS: MutatorRules = Object.freeze({
  ...NONE,
  maps: Object.freeze(['crossing'] as MapId[]),
  startLevel: 3,
  xpBp: 15000,
  towerHpBp: 7000,
  coreHpBp: 8000,
  respawnFrom: 150,
  respawnTo: 210,
  cannon: Object.freeze({ ...CROSSING_CANNON, first: 450, respawn: 600 }),
  fortifyUntil: 1800,
  catchUpFrom: 1800,
  underdogTakedowns: 3,
  takedownCoreBp: 7500,
  sunset: 5400,
  late: 7650,
  lateLead: false,
  hardEnd: 9450,
  cooldownBp: 7000,
});

/**
 * Sim v27 (V27.md §2): the Practice ground. One hero on the Crossing against three training dummies (data/practice.ts);
 * respawns take 2 s, Fish comes three times as fast for trying Toys, and the hero may leave at once. The match ends at
 * the map's safety end (11:00) if the player stays that long.
 */
const PRACTICE: MutatorRules = Object.freeze({
  ...NONE,
  // Sim v34 (V34-MAPS.md §7): the Practice ground on any 3v3 map.
  maps: Object.freeze(['crossing', 'ridge', 'thicket', 'quarry', 'pitch'] as MapId[]),
  respawnFrom: 60,
  respawnTo: 60,
  // never: the safety end comes first
  sunset: 30000,
  late: 30000,
  fortifyUntil: 0,
  fishBp: 30000,
  forfeitFrom: 1,
  practice: true,
});

/** Sim v27 weekly twist (V27.md §4): Toy Box. Fish ×2 (Toys come twice as fast), Frenzy Catnip and Fish Snacks twice as often. */
const TOYBOX: MutatorRules = Object.freeze({ ...NONE, maps: Object.freeze(['crossing'] as MapId[]), fishBp: 20000, pickupEveryBp: 5000 });
/** Sim v27 weekly twist: Rapid Paws. Every ability and Paw Trick cooldown ×0.6. */
const RAPID: MutatorRules = Object.freeze({ ...NONE, maps: Object.freeze(['crossing'] as MapId[]), cooldownBp: 6000 });
/**
 * Sim v27 weekly twist: Bounty Hunt. A takedown streak's bounty XP and the shutdown Fish ×3: a hero on a streak is
 * worth hunting, and the team that ends it catches up.
 */
const BOUNTY: MutatorRules = Object.freeze({ ...NONE, maps: Object.freeze(['crossing'] as MapId[]), bountyBp: 30000 });

/**
 * Sim v28 (V28.md §2): One Lane Brawl, ARAM-like. 3v3 on the Sunny Lane strip, any champion: start at level 3, XP ×1.5
 * and Fish ×2 (Toys come fast), no Nap and no fountain heal (Fish Snacks every 15 s are the heals), towers ×0.7 and
 * cores ×0.8 HP, Fortified until 0:45, respawns 8 s rising to 14 s, Sunset 5:00, late Sunset 7:00, time up at 8:00.
 */
const ONELANE: MutatorRules = Object.freeze({
  ...NONE,
  maps: Object.freeze(['crossing'] as MapId[]),
  startLevel: 3,
  xpBp: 15000,
  fishBp: 20000,
  towerHpBp: 7000,
  coreHpBp: 8000,
  respawnFrom: 240,
  respawnTo: 420,
  fortifyUntil: 1350,
  catchUpFrom: 1800,
  pickupEveryBp: 5000,
  sunset: 9000,
  late: 12600,
  hardEnd: 14400,
  strip: true,
  noRecall: true,
});

/**
 * Sim v28 (V28.md §3): the Duel, 1v1 on the Sunny Lane strip with its waves. The first to 2 takedowns or to the first
 * tower wins. Start at level 3, XP ×1.5, Fish ×1.5, outer towers ×0.6 HP, Fortified until 0:30, respawn 5 s, no Nap and
 * no fountain heal (Fish Snacks every 15 s), time up at 5:00 (towers, then core HP, then takedowns).
 */
const DUEL: MutatorRules = Object.freeze({
  ...NONE,
  maps: Object.freeze(['crossing'] as MapId[]),
  startLevel: 3,
  xpBp: 15000,
  fishBp: 15000,
  towerHpBp: 6000,
  respawnFrom: 150,
  respawnTo: 150,
  fortifyUntil: 900,
  catchUpFrom: 30000,
  pickupEveryBp: 5000,
  // past the time up: no Sunset in a Duel
  sunset: 30000,
  late: 30000,
  hardEnd: 9000,
  strip: true,
  noRecall: true,
  playing: Object.freeze([1, 1] as [number, number]),
  goalTakedowns: 2,
  goalTower: true,
});

/**
 * Sim v28 (V28.md §4): Boss Weekend, co-op against one huge bot-driven boss (data/boss.ts) on the Sunny Lane strip. No
 * waves, no structure takes damage; heroes start at level 6 with XP ×2 and Fish ×2, respawns 8 s rising to 12 s. Fell
 * the boss before 6:30 to win; at 6:30 the boss wins (time up).
 */
const BOSS: MutatorRules = Object.freeze({
  ...NONE,
  maps: Object.freeze(['crossing'] as MapId[]),
  startLevel: 6,
  xpBp: 20000,
  fishBp: 20000,
  respawnFrom: 240,
  respawnTo: 360,
  fortifyUntil: 0,
  catchUpFrom: 30000,
  truceUntil: 0,
  sunset: 30000,
  late: 30000,
  hardEnd: 11700,
  strip: true,
  playing: Object.freeze([0, 1] as [number, number]),
  waves: false,
  structures: false,
  boss: true,
});

export const MUTATOR_RULES: Readonly<Record<Mutator, MutatorRules>> = Object.freeze({
  none: NONE,
  blitz: BLITZ,
  cannon: CANNON_CHAOS,
  practice: PRACTICE,
  toybox: TOYBOX,
  rapid: RAPID,
  bounty: BOUNTY,
  onelane: ONELANE,
  duel: DUEL,
  boss: BOSS,
});
