/** Hero table. Order is the HeroId index used by the sim and the command stream. */
import { AVIETE } from './aviete';
import { BENGAS } from './bengas';
import { BRAVO } from './bravo';
import { BRUTUS } from './brutus';
import { CACKLEJAW } from './cacklejaw';
import { CHILI } from './chili';
import { CLEM } from './clem';
import { DOMINO } from './domino';
import { DUCHESS } from './duchess';
import { FRANKIE } from './frankie';
import { GABE } from './gabe';
import { HOWLER } from './howler';
import { LAMBO } from './lambo';
import { MARSHMALLOW } from './marshmallow';
import { MEATBALL } from './meatball';
import { NUGGET } from './nugget';
import { PIXEL } from './pixel';
import { ROCKET } from './rocket';
import { SAGE } from './sage';
import { STILTS } from './stilts';
import type { HeroData, HeroId } from './types';

export { GROWTH_FLOOR, RANK_KEYS, RANK_LEVELS, ROLE_GROWTH, type Growth } from './growth';
export type { AbilityData, AbilitySlot, Element, HeroBase, HeroData, HeroId, HeroRole, HeroSide, TalentData } from './types';

/**
 * Sim v9: the shelter champions are appended, so Clem (0), Sage (1), Sir Brutus (2) and Cacklejaw (3) keep their indices.
 * Sim v11: the four original cats follow (Meatball 8, Pixel 9, Duchess 10, Stilts 11).
 * Sim v14: the five original dogs follow (Nugget 12, Marshmallow 13, Bravo 14, Chili 15, Howler 16;
 * docs/plans/moba/DOGS-V13.md).
 * Sim v15: three more dogs make the sides 10 v 10 with the same roles (Rocket 17, Frankie 18, Domino 19;
 * docs/plans/moba/DOGS-V15.md).
 */
export const HERO_IDS: readonly HeroId[] = Object.freeze([
  'clem',
  'sage',
  'brutus',
  'cacklejaw',
  'lambo',
  'aviete',
  'bengas',
  'gabe',
  'meatball',
  'pixel',
  'duchess',
  'stilts',
  'nugget',
  'marshmallow',
  'bravo',
  'chili',
  'howler',
  'rocket',
  'frankie',
  'domino',
] as HeroId[]);

export const HEROES: Readonly<Record<HeroId, HeroData>> = Object.freeze({
  clem: CLEM,
  sage: SAGE,
  brutus: BRUTUS,
  cacklejaw: CACKLEJAW,
  lambo: LAMBO,
  aviete: AVIETE,
  bengas: BENGAS,
  gabe: GABE,
  meatball: MEATBALL,
  pixel: PIXEL,
  duchess: DUCHESS,
  stilts: STILTS,
  nugget: NUGGET,
  marshmallow: MARSHMALLOW,
  bravo: BRAVO,
  chili: CHILI,
  howler: HOWLER,
  rocket: ROCKET,
  frankie: FRANKIE,
  domino: DOMINO,
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
  meatball: null,
  pixel: null,
  duchess: null,
  stilts: null,
  nugget: null,
  marshmallow: null,
  bravo: null,
  chili: null,
  howler: null,
  rocket: null,
  frankie: null,
  domino: null,
});

/** Heroes with a level-6 shape branch, HERO_IDS order. */
export const BRANCH_HEROES: readonly HeroId[] = Object.freeze(HERO_IDS.filter((h) => BRANCH_TALENT[h] !== null));

/**
 * Every hero's HP (base and per level) × this. The fun plan started at × 1.2; tuning settled on × 1.0 with
 * HERO_VS_HERO_BP and Nine Lives instead (fun1: "90% to dead" median 5.5 s, p10 3.9 s). The kit numbers in ./*.ts
 * stay as POC.md §6 states them.
 */
export const HERO_HP_BP = 10000;

/**
 * Hero damage to enemy heroes × this (sim v4): fights end in takedowns instead of everyone walking home. Sim v18: 13000
 * → 10500 with HERO_BASIC_VS_HERO_BP, since basic attacks now land while chasing (takedowns went 3.3 → 4.7 a minute).
 */
export const HERO_VS_HERO_BP = 10500;

/**
 * Sim v18 (founder bug 2026-11-08, chasing): basic attacks land on a target walking away now, so a hero's basic
 * attacks on enemy heroes deal × this on top of HERO_VS_HERO_BP (docs/plans/moba/V18-CHASE.md: takedowns a minute back
 * in 2.5–3.5). Sim v20 (Wild Rift basic attacks, docs/plans/moba/V20-CHASE.md): 6500 → 6000, since a started swing
 * now completes and a cancelled one costs no attack timer (takedowns 3.63 → ~3.5 a minute).
 */
export const HERO_BASIC_VS_HERO_BP = 6000;

// Sim v8: the species edge (SIDE_EDGE: dogs × 1.13 dealt, × 0.915 taken) is per hero now, HeroData.pvp.
