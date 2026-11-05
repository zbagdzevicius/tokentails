/**
 * The small, first-load part of the card art (ui/cards/): a hero's card element and the attributes that pick the
 * element and tier look from `vars.css`. The colour tables and asset URLs stay in CSS (and in `art.ts`, which only the
 * lazy chunks import), so the entry bundle carries almost nothing.
 */
import type { HeroId } from '../../sim/api';
import { HEROES } from '../../data/heroes';
import type { CatTier, Element } from '../../meta/roster';
import { portraitUrl } from '../../render/portraits';
import { HERO_TEXT } from '../heroText';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A hero's card element (`src/data/heroes/<id>.ts`). */
export const heroElement = (h: HeroId): Element => (HEROES[h]?.element ?? 'FAIRY') as Element;

/** `data-tt-el` / `data-tt-tier` for a card-styled element (vars.css sets the art, colours and foil from them). */
export const cardAttrs = (el: Element, tier?: CatTier | null): string => `data-tt-el="${el}" data-tt-tier="${tier ?? 'COMMON'}"`;

/** The tier names on the card footer. */
export const TIER_NAME: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });

/** The portrait block inside the inset (a picture on the element gradient, or the hero's initials). */
export function heroPic(hero: HeroId, portrait?: string | null): string {
  const pic = portrait === undefined ? portraitUrl(hero) : portrait;
  const initials = HERO_TEXT[hero].title.replace('Sir ', '').slice(0, 2);
  return pic ? `<span class="tt-pic" style="background-image:url(${pic}),var(--tt-grad)"></span>` : `<span class="tt-pic none">${esc(initials)}</span>`;
}
