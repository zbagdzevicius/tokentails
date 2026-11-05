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
 */
import type { HeroRole } from './heroes/types';

/** Step cost of tier 1..4 (index 0..3): 500, 1200, 2000 and 3000 Fish cumulative. */
export const TOY_COST: readonly number[] = Object.freeze([500, 700, 800, 1000]);
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
  fighter: Object.freeze([t(800, 0, 0, 0), t(0, 1, 300, 0), t(800, 0, 0, 0), t(600, 1, 0, 0)]),
  marksman: Object.freeze([t(0, 0, 900, 0), t(800, 0, 0, 0), t(0, 0, 500, 400), t(1000, 0, 0, 0)]),
  tank: Object.freeze([t(0, 2, 0, 0), t(300, 1, 0, 0), t(0, 2, 0, 0), t(0, 2, 0, 400)]),
  assassin: Object.freeze([t(900, 0, 0, 0), t(500, 0, 0, 600), t(1000, 0, 0, 0), t(1200, 0, 0, 0)]),
  mage: Object.freeze([t(800, 0, 0, 0), t(600, 1, 0, 0), t(800, 0, 0, 0), t(1000, 0, 0, 0)]),
  support: Object.freeze([t(300, 1, 0, 0), t(500, 0, 0, 400), t(0, 2, 0, 0), t(500, 1, 0, 0)]),
});

/**
 * Running totals per role and owned tier count (index 0 = no Toys .. 4 = all), as literals so the hot path reads one
 * entry. A unit test checks every row against TOY_TIER.
 */
export const TOY_SUM: Readonly<Record<HeroRole, readonly Readonly<ToyStats>[]>> = Object.freeze({
  fighter: Object.freeze([t(0, 0, 0, 0), t(800, 0, 0, 0), t(800, 1, 300, 0), t(1600, 1, 300, 0), t(2200, 2, 300, 0)]),
  marksman: Object.freeze([t(0, 0, 0, 0), t(0, 0, 900, 0), t(800, 0, 900, 0), t(800, 0, 1400, 400), t(1800, 0, 1400, 400)]),
  tank: Object.freeze([t(0, 0, 0, 0), t(0, 2, 0, 0), t(300, 3, 0, 0), t(300, 5, 0, 0), t(300, 7, 0, 400)]),
  assassin: Object.freeze([t(0, 0, 0, 0), t(900, 0, 0, 0), t(1400, 0, 0, 600), t(2400, 0, 0, 600), t(3600, 0, 0, 600)]),
  mage: Object.freeze([t(0, 0, 0, 0), t(800, 0, 0, 0), t(1400, 1, 0, 0), t(2200, 1, 0, 0), t(3200, 1, 0, 0)]),
  support: Object.freeze([t(0, 0, 0, 0), t(300, 1, 0, 0), t(800, 1, 0, 400), t(800, 3, 0, 400), t(1300, 4, 0, 400)]),
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
