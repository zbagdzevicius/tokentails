/**
 * Prop catalog (GDD Appendix B: the 15 MVP kinds plus the FULL-build kinds 21..63). The data itself lives in `types.ts` (PROP_KINDS) so the
 * sim, render and audio lanes do not depend on content; this module adds the authoring helpers.
 */
import { PROP_KINDS, propKind, type PropKindDef } from '../types';

export { PROP_KINDS, propKind };

/** Kind ids by slug. */
export const KIND = {
  wineGlass: 1,
  mug: 2,
  plateStack: 3,
  fruitBowl: 4,
  eggCarton: 5,
  cake: 6,
  vase: 7,
  pottedPlant: 8,
  lamp: 9,
  tvRemote: 10,
  laptop: 11,
  toiletRoll: 12,
  perfume: 13,
  tablecloth: 14,
  bookStack: 15,
  ornament: 16,
  christmasTree: 17,
  slipper: 18,
  sock: 19,
  roomba: 20,
  tunaCan: 21,
  popcornBowl: 22,
  yarnBall: 23,
  rubberDuck: 24,
  toothbrushCup: 25,
  penCup: 26,
  cupsTower: 27,
  balloon: 28,
  ribbon: 29,
  giftStack: 30,
  punchBowl: 31,
  birthdayCandles: 32,
  laundryBasket: 33,
  alarmClock: 34,
  jewelleryDish: 35,
  cookieTray: 36,
  flourBag: 37,
  mixerBowl: 38,
  butter: 39,
  boardGame: 40,
  snackTower: 41,
  controller: 42,
  dice: 43,
  scentedCandle: 44,
  faceMaskJar: 45,
  towelStack: 46,
  gravyBoat: 47,
  pie: 48,
  turkeyPlatter: 49,
  turkeyLeg: 50,
  boxTower: 51,
  bubbleWrap: 52,
  receiptPile: 53,
  cardboardBox: 54,
  champagneTower: 55,
  bouquet: 56,
  phone: 57,
  waterGlass: 58,
  blanket: 59,
  snowGlobe: 60,
  giftWrap: 61,
  champagneBottle: 62,
  sponsorProduct: 63,
  perfumeTray: 64,
} as const;

/** Kinds that can be pushed and score (not inert, not grabbable-only). */
export const WRECKABLE_KINDS: readonly number[] = PROP_KINDS.filter((k) => !k.inert && !k.grabbable).map((k) => k.kind);
/** Kinds the cat can carry to the cat bed. */
export const GRABBABLE_KINDS: readonly number[] = PROP_KINDS.filter((k) => k.grabbable).map((k) => k.kind);

/** A kind is a valid Must-Wreck target when it can be pushed and scores points. */
export function isTargetable(kind: number): boolean {
  const k: PropKindDef | undefined = propKind(kind);
  return !!k && !k.inert && !k.grabbable && k.base > 0;
}

export function kindBySlug(slug: string): PropKindDef | undefined {
  return PROP_KINDS.find((k) => k.id === slug);
}
