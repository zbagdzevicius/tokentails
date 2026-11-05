/**
 * Card skins as champion names (lobby spec §3b): a hero wearing one of the player's own Token Tails cats is called by
 * that cat's name ("Simas"), with the hero underneath ("Clem the Fighter"). Pure and render-free: it reads the skin
 * store (a leaf module) and the hero texts, nothing else, and never touches the sim. Cosmetic only: a name changes no
 * number anywhere.
 *
 * Stable API for the lobby and Nature lanes:
 * - `cardIdentity(hero, look)` (alias `getEquippedCard`): the worn card, or null for no card, a featured (unowned)
 *   preview, or a skin the store no longer has. Callers pass the RESOLVED look (app `lookFor(hero)`), which already
 *   drops cats that left the roster.
 * - `displayName(hero, look)`: the cat's name, else the hero title.
 * - `heroSub(hero)`: "Clem the Fighter".
 * - `selfNames(names, mySlot, id)`: the match's slot names with only the player's slot renamed (bots keep theirs).
 * - `cutName(name, max)`: the plate cut ("Bartholomew T…").
 *
 * Names are data from the host (already cleaned by meta/roster.ts parseRoster: ≤ 24 chars, no `<>` or control
 * characters). Render them with textContent, an escaper or the canvas only.
 */
import type { HeroId } from '../sim/api';
import type { Look } from '../render/cosmetics';
import { getSkin, isCardSkinId } from '../render/skins/skinStore';
import { HERO_TEXT } from '../ui/heroText';
import { ELEMENT_NAME, type CatTier, type Element } from './roster';

export interface CardIdentity {
  /** The skin id (`cat.<rosterId>`). */
  skinId: string;
  /** The roster cat id. */
  catId: string;
  /** The cat's name: the champion's display name while it wears this card. */
  name: string;
  /** The hero's own title ("Clem", "Sir Brutus"). */
  heroTitle: string;
  role: string;
  /** "Clem the Fighter". */
  sub: string;
  element: Element;
  /** "Fire", "Shadow", "Spark", "Star". */
  elementName: string;
  rung: CatTier;
  bond: number;
  art?: string;
  sprite?: string;
}

/** "Clem the Fighter", "Sir Brutus the Tank". */
export function heroSub(hero: HeroId): string {
  const t = HERO_TEXT[hero];
  return t ? `${t.title} the ${t.role}` : '';
}

/**
 * A host name made safe to show everywhere (title, plates, kill feed, scoreboard): format characters (zero-width,
 * bidi overrides such as U+202E that reorder "· Clem (you)"), line and paragraph separators and lone surrogates (a
 * cut emoji) are dropped, runs of 3+ combining marks collapse to 2 (no "Zalgo" overflowing the plates), whitespace
 * collapses. '' unless a letter, digit or symbol is left (cardIdentity then falls back to the hero title). QA, on top
 * of meta/roster.ts cleanName (C0 controls and `<>`), which stays as it is.
 */
export function tidyName(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  const out = s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/[\s\u2028\u2029]+/g, ' ')
    .replace(/[\p{Cf}\p{Cc}]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
  return /[\p{L}\p{N}\p{So}]/u.test(out) ? out : '';
}

/** The card `hero` wears in `look`, or null (no card, a featured preview, an unknown skin, an empty name). */
export function cardIdentity(hero: HeroId, look: Pick<Look, 'coat'> | null | undefined): CardIdentity | null {
  const coat = look?.coat;
  if (!isCardSkinId(coat)) return null;
  const sk = getSkin(coat);
  if (!sk || sk.featured) return null;
  const name = tidyName(sk.name);
  const t = HERO_TEXT[hero];
  if (!name || !t) return null;
  return {
    skinId: sk.id,
    catId: sk.catId,
    name,
    heroTitle: t.title,
    role: t.role,
    sub: heroSub(hero),
    element: sk.element,
    elementName: ELEMENT_NAME[sk.element] ?? sk.element,
    rung: sk.rung,
    bond: sk.bond,
    ...(sk.art ? { art: sk.art } : {}),
    ...(sk.sprite ? { sprite: sk.sprite } : {}),
  };
}

/** Alias for the lobby lane. */
export const getEquippedCard = cardIdentity;

/** The champion's display name: the worn cat's, else the hero title. */
export function displayName(hero: HeroId, look: Pick<Look, 'coat'> | null | undefined): string {
  return cardIdentity(hero, look)?.name ?? HERO_TEXT[hero]?.title ?? 'A hero';
}

/** The slot names with only the player's slot renamed to the worn cat (bots and allies keep theirs). */
export function selfNames(names: readonly string[], mySlot: number, id: Pick<CardIdentity, 'name'> | null | undefined): string[] {
  const out = [...names];
  if (id && id.name && mySlot >= 0 && mySlot < out.length) out[mySlot] = id.name;
  return out;
}

/** A name cut to `max` characters with "…" (code points, so an emoji is never split). */
export function cutName(name: string, max = 14): string {
  const cps = Array.from(name);
  return cps.length <= max ? name : `${cps.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

/** The loading veil's hero line: "Simas (Clem)" in a card, else "Clem" ("First match as Simas (Clem)"). */
export function veilName(hero: HeroId, look: Pick<Look, 'coat'> | null | undefined): string {
  const id = cardIdentity(hero, look);
  return id ? `${id.name} (${id.heroTitle})` : (HERO_TEXT[hero]?.title ?? 'A hero');
}
