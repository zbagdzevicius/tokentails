/**
 * Toys (sim v12, docs/FUN-PROGRESSION-V12.md S1): four in-match item tiers per role, bought automatically with Fish
 * (data/fish.ts) the moment a hero can afford the next one. Each tier is a set of four stats:
 *
 * - `dmgBp`: extra damage against heroes, minions and neutrals (never towers or cores);
 * - `hpLevels`: extra max HP of hpLevels × the hero's per-level HP;
 * - `asBp`: attack speed (added in attackEvery, like the level growth);
 * - `speedBp`: move speed (added to the move-speed bp sum, so slows still apply).
 *
 * Tier 3 also turns on the role's passive (TOY_PASSIVE). Target: each tier about +10% fight power, the full set
 * about +45%, within ±10% across roles (sim-v12.test.ts measures it at level 6 as effective HP × basic damage a
 * second × move speed). S6 tuning: the spec's starting table gave tanks +75% and marksmen +34% on that measure
 * (fighter tier 2 +18%), so HP tiers carry fewer levels, marksmen more attack speed; the balance gate keeps every
 * hero within 46% to 54% and cats 48.9% / dogs 51.1%.
 *
 * Fun pass (playtest #4: "+8% damage" after 500 to 1,000 Fish was too small to feel): every tier is about 1.7× the S6
 * row, so a tier is +10% to +24% fight power (avg ~+16%) and the full set +70% to +92% (avg ~+79%, still within ±10%
 * across roles), at slightly higher prices (550, 1,300, 2,200, 3,150 cumulative). Balance gate (2,000 seeds): every
 * hero 47.0% to 53.8%, cats 51.6% / dogs 48.4%, Toy tier 1 to 4 at 2:20, 4:27, 6:43, 7:37 for the median hero.
 * Each tier also shows underfoot on the hero (render/views/heroView.ts toyRings).
 */
import type { HeroRole } from './heroes/types';

/** Step cost of tier 1..4 (index 0..3): 550, 1300, 2200 and 3150 Fish cumulative (fun pass; 500, 1200, 2000, 3000 before). */
export const TOY_COST: readonly number[] = Object.freeze([550, 750, 900, 950]);
export const TOY_TIERS = 4;
/** The tier whose purchase turns the role passive on (1-based). */
export const TOY_PASSIVE_TIER = 3;

export interface ToyStats {
  dmgBp: number;
  hpLevels: number;
  asBp: number;
  speedBp: number;
}

const t = (dmgBp: number, hpLevels: number, asBp: number, speedBp: number): Readonly<ToyStats> => Object.freeze({ dmgBp, hpLevels, asBp, speedBp });

/** What each tier adds, per role (index 0 = tier 1). */
export const TOY_TIER: Readonly<Record<HeroRole, readonly Readonly<ToyStats>[]>> = Object.freeze({
  fighter: Object.freeze([t(1400, 0, 0, 0), t(0, 2, 500, 0), t(1300, 0, 0, 0), t(1000, 2, 0, 0)]),
  marksman: Object.freeze([t(0, 0, 1500, 0), t(1400, 0, 0, 0), t(0, 0, 800, 700), t(1700, 0, 0, 0)]),
  tank: Object.freeze([t(0, 3, 0, 0), t(500, 2, 0, 0), t(0, 2, 0, 0), t(0, 3, 0, 600)]),
  assassin: Object.freeze([t(1500, 0, 0, 0), t(800, 0, 0, 1000), t(1700, 0, 0, 0), t(2000, 0, 0, 0)]),
  mage: Object.freeze([t(1400, 0, 0, 0), t(1000, 2, 0, 0), t(1300, 0, 0, 0), t(1700, 0, 0, 0)]),
  support: Object.freeze([t(500, 2, 0, 0), t(800, 0, 0, 700), t(0, 3, 0, 0), t(800, 2, 0, 0)]),
});

/**
 * Running totals per role and owned tier count (index 0 = no Toys .. 4 = all), as literals so the hot path reads one
 * entry. A unit test checks every row against TOY_TIER.
 */
export const TOY_SUM: Readonly<Record<HeroRole, readonly Readonly<ToyStats>[]>> = Object.freeze({
  fighter: Object.freeze([t(0, 0, 0, 0), t(1400, 0, 0, 0), t(1400, 2, 500, 0), t(2700, 2, 500, 0), t(3700, 4, 500, 0)]),
  marksman: Object.freeze([t(0, 0, 0, 0), t(0, 0, 1500, 0), t(1400, 0, 1500, 0), t(1400, 0, 2300, 700), t(3100, 0, 2300, 700)]),
  tank: Object.freeze([t(0, 0, 0, 0), t(0, 3, 0, 0), t(500, 5, 0, 0), t(500, 7, 0, 0), t(500, 10, 0, 600)]),
  assassin: Object.freeze([t(0, 0, 0, 0), t(1500, 0, 0, 0), t(2300, 0, 0, 1000), t(4000, 0, 0, 1000), t(6000, 0, 0, 1000)]),
  mage: Object.freeze([t(0, 0, 0, 0), t(1400, 0, 0, 0), t(2400, 2, 0, 0), t(3700, 2, 0, 0), t(5400, 2, 0, 0)]),
  support: Object.freeze([t(0, 0, 0, 0), t(500, 2, 0, 0), t(1300, 2, 0, 700), t(1300, 5, 0, 700), t(2100, 7, 0, 700)]),
});

/** Tiers owned (0..4) that add no HP, per role: what the bots' fight check counts (BOT_AI.powerPerToy). */
export const TOY_POWER_TIERS: Readonly<Record<HeroRole, readonly number[]>> = Object.freeze({
  fighter: Object.freeze([0, 1, 1, 2, 2]),
  marksman: Object.freeze([0, 1, 2, 3, 4]),
  tank: Object.freeze([0, 0, 0, 0, 0]),
  assassin: Object.freeze([0, 1, 2, 3, 4]),
  mage: Object.freeze([0, 1, 1, 2, 3]),
  support: Object.freeze([0, 0, 1, 1, 1]),
});

/**
 * Role passives from tier 3 (bp):
 * - fighter: basic attacks on heroes heal `fighterLifestealBp` of the damage dealt;
 * - marksman: basic attacks deal +`marksmanFarBp` to heroes beyond `marksmanFarRange` mm (centre to centre);
 * - tank: −`tankReduceBp` damage taken from heroes;
 * - assassin: +`assassinExecuteBp` damage to heroes below `assassinExecuteHpBp` of their max HP;
 * - mage: abilities deal +`mageAbilityBp` to heroes;
 * - support: heals and shields it gives are +`supportBp` stronger.
 */
export const TOY_PASSIVE = Object.freeze({
  fighterLifestealBp: 800,
  marksmanFarBp: 1500,
  marksmanFarRange: 5000,
  tankReduceBp: 1000,
  assassinExecuteBp: 1500,
  assassinExecuteHpBp: 3000,
  mageAbilityBp: 1000,
  supportBp: 1500,
});
