/**
 * Coat → skin-effect profile (docs/plans/moba/CARD-SKINS.md §5, §6.1): a store or pass coat's FIXED rung (from its
 * price band, render/cosmetics.ts PAID_COATS `rung`), its element and its fur pattern's motif, as a SkinFxProfile for
 * the shared kit (render/skins/effectKit.ts). Ownership comes from server entitlements (the wardrobe only offers owned
 * coats), never from bond or play, so faking local bond can never unlock a sold look. Render only.
 */
import type { CatTier, Element } from '../../meta/roster';
import type { HeroId } from '../../sim/api';
import { PAID_COATS } from '../cosmetics';
import { profileFromCard, profileFromCoatSpec, type SkinFxProfile } from './effectKit';
import type { CatSkin } from './skinStore';

/** A coat's rung and element (null: not a store or pass coat, or not this hero's). */
export function coatRung(coatId: string | null | undefined, hero?: HeroId | null): { rung: CatTier; element: Element } | null {
  if (!coatId) return null;
  const c = PAID_COATS[coatId];
  if (!c || (hero && c.hero !== hero)) return null;
  return { rung: c.rung, element: c.element };
}

/** The profile a worn coat gives hero slot `id` (null below Rare, or for a coat the hero cannot wear). */
export function profileFromCoat(coatId: string | null | undefined, hero: HeroId | null | undefined, id: number, self: boolean, team: 0 | 1, extras: boolean, low: boolean, out?: SkinFxProfile, mate: boolean | null = null): SkinFxProfile | null {
  if (!coatId) return null;
  const c = PAID_COATS[coatId];
  if (!c || (hero && c.hero !== hero)) return null;
  return profileFromCoatSpec(c.coat, c.name, c.rung, c.element, id, self, team, extras, low, out, mate);
}

/**
 * A hero's skin-effect profile: its card skin when it wears one (a card wins over a coat), else its store or pass
 * coat. `level` is the hero level (an Awakened card's stage). Null below Rare.
 */
export function skinFxFor(skin: CatSkin | null, coatId: string | null | undefined, hero: HeroId | null | undefined, id: number, self: boolean, team: 0 | 1, extras: boolean, low: boolean, level: number, out?: SkinFxProfile, mate: boolean | null = null): SkinFxProfile | null {
  if (skin) return profileFromCard(skin, id, self, team, extras, low, level, out, mate);
  return profileFromCoat(coatId, hero, id, self, team, extras, low, out, mate);
}
