/** Hero table. Order is the HeroId index used by the sim and the command stream. */
import { AVIETE } from './aviete';
import { BENGAS } from './bengas';
import { BRUTUS } from './brutus';
import { CACKLEJAW } from './cacklejaw';
import { CLEM } from './clem';
import { GABE } from './gabe';
import { LAMBO } from './lambo';
import { SAGE } from './sage';
import type { HeroData, HeroId } from './types';

export { GROWTH_FLOOR, RANK_KEYS, RANK_LEVELS, ROLE_GROWTH, type Growth } from './growth';
export type { AbilityData, AbilitySlot, Element, HeroBase, HeroData, HeroId, HeroRole, HeroSide, TalentData } from './types';

/** Sim v9: the shelter champions are appended, so Clem (0), Sage (1), Sir Brutus (2) and Cacklejaw (3) keep their indices. */
export const HERO_IDS: readonly HeroId[] = Object.freeze(['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe'] as HeroId[]);

export const HEROES: Readonly<Record<HeroId, HeroData>> = Object.freeze({
  clem: CLEM,
  sage: SAGE,
  brutus: BRUTUS,
  cacklejaw: CACKLEJAW,
  lambo: LAMBO,
  aviete: AVIETE,
  bengas: BENGAS,
  gabe: GABE,
});

/**
 * Sim v10 (GAPS B6): the level-6 shape branch per hero (talent tier 1, option 1), or null where it still is a number
 * talent ("Branch coming soon"). The snapshot marks a hero that took it (`EntitySnap.branch`), so the other side can read it.
 */
export const BRANCH_TALENT: Readonly<Record<HeroId, string | null>> = Object.freeze({
  clem: null,
  sage: 'piercing-shot',
  brutus: 'guard-post',
  cacklejaw: null,
  lambo: null,
  aviete: null,
  bengas: null,
  gabe: null,
});

/** Heroes with a level-6 shape branch, HERO_IDS order. */
export const BRANCH_HEROES: readonly HeroId[] = Object.freeze(HERO_IDS.filter((h) => BRANCH_TALENT[h] !== null));

/**
 * Every hero's HP (base and per level) × this. The fun plan started at × 1.2; tuning settled on × 1.0 with
 * HERO_VS_HERO_BP and Nine Lives instead (fun1: "90% to dead" median 5.5 s, p10 3.9 s). The kit numbers in ./*.ts
 * stay as POC.md §6 states them.
 */
export const HERO_HP_BP = 10000;

/** Hero damage to enemy heroes × this (sim v4): fights end in takedowns instead of everyone walking home. */
export const HERO_VS_HERO_BP = 13000;

// Sim v8: the species edge (SIDE_EDGE: dogs × 1.13 dealt, × 0.915 taken) is per hero now, HeroData.pvp.
