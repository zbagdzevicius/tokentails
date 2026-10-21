/**
 * Wave C (C1, sim v10): level growth beyond HP, attack and armour. Every level above 1 adds the role's attack speed
 * (bp, the same sum as an attack-speed buff) and move speed (mm/s). Integer maths in the sim (`attackEvery`,
 * `moveSpeed` in src/sim/units/kinds.ts); a hero may override its role's numbers in `HeroBase`.
 */
import type { HeroRole } from './types';

export interface Growth {
  /** Attack speed per level above 1 (bp): ticks between basics = attackEvery × 10000 / (10000 + this × (level − 1) + buffs). */
  attackSpeedPerLevelBp: number;
  /** Move speed per level above 1 (mm/s). */
  speedPerLevel: number;
}

export const ROLE_GROWTH: Readonly<Record<HeroRole, Readonly<Growth>>> = Object.freeze({
  fighter: Object.freeze({ attackSpeedPerLevelBp: 250, speedPerLevel: 30 }),
  marksman: Object.freeze({ attackSpeedPerLevelBp: 300, speedPerLevel: 25 }),
  tank: Object.freeze({ attackSpeedPerLevelBp: 150, speedPerLevel: 25 }),
  assassin: Object.freeze({ attackSpeedPerLevelBp: 250, speedPerLevel: 40 }),
  mage: Object.freeze({ attackSpeedPerLevelBp: 150, speedPerLevel: 25 }),
  support: Object.freeze({ attackSpeedPerLevelBp: 150, speedPerLevel: 30 }),
});

/** Floors: a hero never swings faster than once every `attackEveryMin` ticks, whatever its level and buffs. */
export const GROWTH_FLOOR = Object.freeze({ attackEveryMin: 12 });

/**
 * Wave C (C2): ability ranks come with levels, the same for the human and the bots (no choice, no command). Q, W and
 * E have rank 1 at level 1 and rank up at levels 2, 5 and 8; R unlocks at level 4 (rank 1) and ranks up at 7 and 10.
 * The levels sit between the talent levels (3, 6, 9), so every level-up brings exactly one new thing.
 */
export const RANK_LEVELS = Object.freeze({
  basic: Object.freeze([1, 2, 5, 8]),
  ultimate: Object.freeze([4, 7, 10]),
});

/** The numbers a rank may change (fixed order: the sim adds them in this order, never by object key iteration). */
export const RANK_KEYS: readonly string[] = Object.freeze(['cooldown', 'dmg', 'heal', 'shield', 'waveDmg']);
