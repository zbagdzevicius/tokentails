/**
 * Hero portraits for the pick cards, the HUD, the cards and the avatars: painted faces (ui/art.ts), no longer a 3D
 * model rendered into a 128 px target at runtime (founder, Nov 13: "we show too much of champs look rendered rather
 * than images in in-game UI"). The default look is the hero's face in the game bundle; a look with skin art shows the
 * skin's face once it has loaded (`warmPortraits`), the hero's face until then and offline. No WebGL, no GPU pass at
 * boot, never null.
 *
 * The module keeps its name and its `portraitUrl` signature so every caller (and the unit-test mocks) stays as it was.
 */
import type { HeroId } from '../sim/api';
import type { Look } from './cosmetics';
import { faceFor, faceReady, warmLooks } from '../ui/art';

/** What each store SKU's card shows (its headline look on Clem). */
export const SKU_LOOK: Readonly<Record<'pl_starter' | 'pl_founder' | 'pl_founder_legend' | 'pl_founder_legend_upgrade', Look>> = Object.freeze({
  pl_starter: { coat: 'skin.clem.pink_bow', chroma: null },
  pl_founder: { coat: 'coat.founder.clem', chroma: null },
  pl_founder_legend: { coat: 'skin.clem.dawnblade', chroma: null },
  pl_founder_legend_upgrade: { coat: 'skin.clem.dawnblade', chroma: null },
});

/** The face of `hero` in `look` (an image URL): the skin's face once loaded, else the hero's own face. */
export const portraitUrl = (hero: HeroId, look?: Look | null): string => faceFor(hero, look);

/** The face of `hero` in exactly `look` when it is final (no skin art, or its art loaded), else null. */
export const cachedPortraitUrl = (hero: HeroId, look: Look | null): string | null => (faceReady(look) ? faceFor(hero, look) : null);

/** Starts loading these looks' skin faces; `onReady` runs for each one that arrives. Never throws. */
export function warmPortraits(jobs: readonly [HeroId, Look | null][], onReady?: () => void): void {
  warmLooks(
    jobs.map(([, l]) => l),
    onReady ? () => onReady() : undefined,
  );
}
