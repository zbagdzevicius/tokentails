/**
 * Champion browser data that is not in the sim or the codex: how hard each hero is to learn (the stars under the name,
 * as on a MOBA hero page), the browse order and the side's look. Words only: the sim never reads this file.
 *
 * Difficulty is a learning hint, judged from the kit: 1 = few buttons that do one clear thing (Clem, the guided first
 * match hero), 3 = a resource to manage, a recast or a set-up to land (Avietė's charge, Stilts' Stride, Domino's dots).
 */
import { HERO_IDS, HEROES } from '../../data/heroes';
import type { HeroId } from '../../data/heroes/types';

export type Difficulty = 1 | 2 | 3;

export const HERO_DIFFICULTY: Readonly<Record<HeroId, Difficulty>> = Object.freeze({
  clem: 1,
  sage: 2,
  brutus: 1,
  cacklejaw: 3,
  lambo: 2,
  aviete: 3,
  bengas: 2,
  gabe: 2,
  meatball: 1,
  pixel: 2,
  duchess: 2,
  stilts: 3,
  nugget: 2,
  marshmallow: 2,
  bravo: 2,
  chili: 3,
  howler: 1,
  rocket: 3,
  frankie: 2,
  domino: 3,
} as Record<HeroId, Difficulty>);

export const DIFFICULTY_NAME: Readonly<Record<Difficulty, string>> = Object.freeze({ 1: 'Easy', 2: 'Medium', 3: 'Hard' });

/** Every hero, cats then dogs (the pick grid's order): the arrows and swipes walk this list and wrap. */
export const BROWSE_ORDER: readonly HeroId[] = Object.freeze([
  ...HERO_IDS.filter((h) => HEROES[h].side === 'cat'),
  ...HERO_IDS.filter((h) => HEROES[h].side === 'dog'),
]);

/** The hero `step` places away from `hero` in `order` (wrapping). A hero missing from `order` starts at its front. */
export function stepHero(order: readonly HeroId[], hero: HeroId, step: number): HeroId {
  if (!order.length) return hero;
  const i = order.indexOf(hero);
  const n = order.length;
  return order[(((i < 0 ? 0 : i) + step) % n + n) % n] as HeroId;
}
