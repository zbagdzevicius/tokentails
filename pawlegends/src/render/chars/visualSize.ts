/**
 * Per-hero visual size helpers (RENDER ONLY) for every lane that anchors something to a hero's body: hit sparks,
 * cast bursts, skill VFX, respawn rings, emotes, damage numbers. The sim never reads these.
 *
 * Fixed effect heights in the code were authored for Clem's 2.6 m body (REF_HEIGHT). Use `heroY(hero, y)` to move
 * such a height onto any hero (Pixel's chest is lower, Brutus's higher), or the fractions below for new anchors.
 * Every helper accepts `null`/`undefined` (a non-hero unit) and then returns the unscaled value.
 *
 *   import { heroY, heroTop, heroBodyScale } from '../chars/visualSize';
 *   particles.burst(_p.set(x, heroY(w.hero, 0.9), z), …)       // chest-height spark that follows the body
 *   shockwaves.ring(x, z, 1.2 * heroBodyScale(w.hero), …)      // a body-sized ring
 */
import type { HeroId } from '../../sim/api';
import { HERO_BUILD } from './heroSize';
import { HERO_HEIGHT, HERO_TOP } from './specs';

export { HERO_BUILD } from './heroSize';
export type { HeroBuild } from './heroSize';

/** The body every fixed effect height was authored for (Clem, m). */
export const REF_HEIGHT = 2.6;

type H = HeroId | null | undefined;

/** Drawn standing height (m, ear tips) of a hero; REF_HEIGHT for a non-hero. */
export const heroHeight = (hero: H): number => (hero ? HERO_HEIGHT[hero] : REF_HEIGHT);

/** Top of the drawn bounds (m: ears, bow, plume, Duchess's cushion crown); where overhead things sit above. */
export const heroTop = (hero: H): number => (hero ? HERO_TOP[hero] : REF_HEIGHT);

/** Height ratio to the reference body (Pixel ≈ 0.77, Brutus ≈ 1.24). Multiply authored heights by it. */
export const heroScale = (hero: H): number => heroHeight(hero) / REF_HEIGHT;

/** A fixed effect height authored for a 2.6 m hero, moved onto this hero's body. */
export const heroY = (hero: H, y: number): number => y * heroScale(hero);

/** Girth multiplier of the drawn mesh (1 = Clem; Meatball 1.25, Aviete 0.9). */
export const heroGirth = (hero: H): number => (hero ? HERO_BUILD[hero].w : 1);

/**
 * Size factor for body-sized horizontal effects (bursts, rings around the body): the mean of height and girth ratio,
 * so wide Meatball gets wider rings and lanky Cacklejaw slightly narrower ones than his height alone would give.
 */
export const heroBodyScale = (hero: H): number => (heroScale(hero) + heroGirth(hero)) / 2;

/** Common anchor points (m) on a hero's body, standing. */
export const heroFeetY = (_hero: H): number => 0.2;
export const heroChestY = (hero: H): number => 0.35 * heroHeight(hero);
export const heroHeadY = (hero: H): number => 0.72 * heroHeight(hero);
/** Above the overhead plate: damage numbers, emotes, "!" pings. */
export const heroOverheadY = (hero: H, lift = 1.0): number => heroTop(hero) + lift;
