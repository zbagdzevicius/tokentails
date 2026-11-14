/**
 * Sim v22 (docs/plans/moba/WR-BS-PLAN.md §4): the match mutators' rule table. One frozen row per mutator, read by the
 * tower and core setup, XP, respawn, the Kibble Cannon, the phase clock and the win check (sim/mutator.ts `mutOf`),
 * so no system carries its own `if (blitz)`. Every value of the 'none' row is the neutral one: a 'none' match plays
 * exactly as in v21 (gate G1).
 *
 * Blitz: a ~3-minute Crossing match. Start at level 4 (the level-3 talent is offered at once), XP ×2, towers ×0.45 and
 * cores ×0.5 HP (of the v21 values), respawn 6 s rising to 8 s, the cannon at 0:20 and 40 s after each shot, Sunset at
 * 1:30, Sudden Death at 2:30, and a hard end at 3:15 (EndReason 4 timeUp, won on structures, then core HP, then
 * takedowns, then structure damage, else a draw).
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
  /** Sudden Death decay follows the takedown gap (SUDDEN_DEATH.decayPerTakedownBp) when the difficulty has lead
   *  pressure; false: every core burns at the base rate. */
  decayLead: boolean;
  /** The Underdog Cannon favours a team this many takedowns behind (0: the COMEBACK trigger's own). */
  underdogTakedowns: number;
  /** Core damage from takedowns (the chip before Sunset, the Sunset and Sudden Death share) × this (bp). */
  takedownCoreBp: number;
  /** Enemy bots leave the human alone until this tick (−1: the difficulty's DifficultyRules.truceUntil). */
  truceUntil: number;
  /** Sunset and Sudden Death ticks (0: the difficulty's). */
  sunset: number;
  suddenDeath: number;
  /** The designed end (0: none, only the map's safety end). At this tick the match ends with reason 'timeUp'. */
  hardEnd: number;
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
  decayLead: true,
  underdogTakedowns: 0,
  takedownCoreBp: 10000,
  truceUntil: -1,
  sunset: 0,
  suddenDeath: 0,
  hardEnd: 0,
  cooldownBp: 10000,
  fishBp: 10000,
  pickupEveryBp: 10000,
  bountyBp: 10000,
  forfeitFrom: -1,
  practice: false,
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
  // 0:20, then 40 s after each shot or fizzle (none from Sudden Death on, as on every map)
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
  hero: Object.freeze({
    aviete: { dmgBp: 9409, takenBp: 10567 },
    bengas: { dmgBp: 9853, takenBp: 10145 },
    bravo: { dmgBp: 10820, takenBp: 9180 },
    brutus: { dmgBp: 10577, takenBp: 9423 },
    cacklejaw: { dmgBp: 9111, takenBp: 10889 },
    chili: { dmgBp: 9934, takenBp: 10066 },
    clem: { dmgBp: 9707, takenBp: 10289 },
    domino: { dmgBp: 9987, takenBp: 10013 },
    duchess: { dmgBp: 10147, takenBp: 9853 },
    frankie: { dmgBp: 8991, takenBp: 11009 },
    gabe: { dmgBp: 10701, takenBp: 9305 },
    howler: { dmgBp: 9720, takenBp: 10280 },
    lambo: { dmgBp: 10624, takenBp: 9382 },
    marshmallow: { dmgBp: 10285, takenBp: 9715 },
    meatball: { dmgBp: 11781, takenBp: 8237 },
    nugget: { dmgBp: 10321, takenBp: 9679 },
    pixel: { dmgBp: 9312, takenBp: 10680 },
    rocket: { dmgBp: 9740, takenBp: 10260 },
    sage: { dmgBp: 9684, takenBp: 10312 },
    stilts: { dmgBp: 9258, takenBp: 10734 },
  }),
  // every core burns 3% a second in Sudden Death: with the takedown-gap burn the team behind at 1:30 won 4% to 8%
  decayLead: false,
  // the cannon goes to a team 3 takedowns behind (8 on every other match): a short match needs its comeback early
  underdogTakedowns: 3,
  // half the takedown core damage: kills still count, the core and the towers decide
  takedownCoreBp: 5000,
  truceUntil: -1,
  // 1:30 Sunset, 2:30 Sudden Death, 3:15 time up
  sunset: 2700,
  suddenDeath: 4500,
  hardEnd: 5850,
  cooldownBp: 10000,
  fishBp: 10000,
  pickupEveryBp: 10000,
  bountyBp: 10000,
  forfeitFrom: -1,
  practice: false,
});

/**
 * Sim v27 (V27.md §3): Cannon Chaos, a ~5-minute Crossing party match built on the Kibble Cannon. The cannon is up at
 * 0:15 and back 20 s after every shot or fizzle (the Underdog Cannon still favours a team 3 takedowns behind), heroes
 * start at level 3 with XP ×1.5 and cooldowns ×0.7, towers ×0.7 and cores ×0.8 HP, Fortified until 1:00, respawns 5 s
 * rising to 7 s, Sunset at 3:00, Sudden Death at 4:15 and time up at 5:15.
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
  decayLead: false,
  underdogTakedowns: 3,
  takedownCoreBp: 7500,
  sunset: 5400,
  suddenDeath: 7650,
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
  maps: Object.freeze(['crossing'] as MapId[]),
  respawnFrom: 60,
  respawnTo: 60,
  // never: the safety end comes first
  sunset: 30000,
  suddenDeath: 30000,
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

export const MUTATOR_RULES: Readonly<Record<Mutator, MutatorRules>> = Object.freeze({
  none: NONE,
  blitz: BLITZ,
  cannon: CANNON_CHAOS,
  practice: PRACTICE,
  toybox: TOYBOX,
  rapid: RAPID,
  bounty: BOUNTY,
});
