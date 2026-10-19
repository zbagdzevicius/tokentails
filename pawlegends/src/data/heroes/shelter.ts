/**
 * Shelter champions (sim v9): the four heroes inspired by real Pink Paw cats' Token Tails cards (licence for the
 * cats' names and photos, Oct 11). Meta and render only: the sim never reads this file. Every champion is free to
 * play in every build; owning the card (roster `catalogIds`) adds cosmetics only (a card badge, the Companion
 * Kitten, the element chroma).
 *
 * The catalog ids live in three places (docs/DEVELOPMENT.md): here, backend/src/pawlegends/pawlegends-champions.ts
 * and the host, which reads them from GET /pawlegends/champions.
 */
import type { HeroId } from './types';

export type ChampionId = 'lambo' | 'aviete' | 'bengas' | 'gabe';

export interface ShelterChampion {
  hero: ChampionId;
  /** The Token Tails catalog cat (`cat._id`) the champion is inspired by. */
  catalogId: string;
  /** The card's name as the UI writes it (`uiName`: Avietė and Gabė decomposed, so Fredoka draws the dot). */
  cardName: string;
  pronoun: 'he' | 'she';
}

/**
 * A name as the game UI writes it: Unicode NFD. Fredoka (the UI font) has no precomposed ė (U+0117) but has e and
 * the combining dot (U+0307); written decomposed, the browser draws both from Fredoka instead of a fallback face.
 */
export const uiName = (name: string): string => name.normalize('NFD');

export const SHELTER_CHAMPIONS: readonly ShelterChampion[] = Object.freeze([
  { hero: 'lambo', catalogId: '6a30473c1d6649b19b03622b', cardName: uiName('Lambo'), pronoun: 'he' },
  { hero: 'aviete', catalogId: '6965203d0a2c7b325b78f7e2', cardName: uiName('Avietė'), pronoun: 'she' },
  { hero: 'bengas', catalogId: '6963fd97f5f542518922871b', cardName: uiName('Bengas'), pronoun: 'he' },
  { hero: 'gabe', catalogId: '6992227d890a12f52a317e22', cardName: uiName('Gabė'), pronoun: 'she' },
] as ShelterChampion[]);

export const CHAMPION_IDS: readonly ChampionId[] = Object.freeze(SHELTER_CHAMPIONS.map((c) => c.hero));

/** The champion of a hero id, or null for the four original heroes. */
export function championOf(hero: HeroId): ShelterChampion | null {
  return SHELTER_CHAMPIONS.find((c) => c.hero === hero) ?? null;
}

/** The champion inspired by a catalog cat, or null. */
export function championByCatalogId(catalogId: string): ShelterChampion | null {
  return SHELTER_CHAMPIONS.find((c) => c.catalogId === catalogId) ?? null;
}
