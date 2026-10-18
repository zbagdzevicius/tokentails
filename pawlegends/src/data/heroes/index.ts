/** Hero table. Order is the HeroId index used by the sim and the command stream. */
import { BRUTUS } from './brutus';
import { CACKLEJAW } from './cacklejaw';
import { CLEM } from './clem';
import { SAGE } from './sage';
import type { HeroData, HeroId } from './types';

export type { AbilityData, AbilitySlot, HeroBase, HeroData, HeroId, HeroRole, HeroSide, TalentData } from './types';

export const HERO_IDS: readonly HeroId[] = Object.freeze(['clem', 'sage', 'brutus', 'cacklejaw'] as HeroId[]);

export const HEROES: Readonly<Record<HeroId, HeroData>> = Object.freeze({
  clem: CLEM,
  sage: SAGE,
  brutus: BRUTUS,
  cacklejaw: CACKLEJAW,
});

/**
 * Every hero's HP (base and per level) × this. The fun plan started at × 1.2; tuning settled on × 1.0 with
 * HERO_VS_HERO_BP and Nine Lives instead (fun1: "90% to dead" median 5.5 s, p10 3.9 s). The kit numbers in ./*.ts
 * stay as POC.md §6 states them.
 */
export const HERO_HP_BP = 10000;

/** Hero damage to enemy heroes × this (sim v4): fights end in takedowns instead of everyone walking home. */
export const HERO_VS_HERO_BP = 13000;

/**
 * Species edge (sim v5, species teams: cats vs dogs). A team is all cats or all dogs, so the two sides are tuned as
 * a whole: in hero-vs-hero damage, each side's heroes deal heroDmgBp and take heroTakenBp (balance gate: every
 * hero 42% to 58% on Normal vs Normal). Only where DifficultyRules.sideEdge is on (the sim's G.SideEdge flag).
 */
export const SIDE_EDGE = Object.freeze({
  cat: Object.freeze({ heroDmgBp: 10000, heroTakenBp: 10000 }),
  dog: Object.freeze({ heroDmgBp: 11800, heroTakenBp: 8800 }),
});
