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
