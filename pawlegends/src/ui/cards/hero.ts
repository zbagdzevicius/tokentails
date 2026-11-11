/**
 * A champion as a Token Tails card: the hero's element frame, its portrait on the element's body gradient in the navy
 * inset, and its name. Shared by the VS screen, the respawn card, the scoreboard and the MVP card.
 */
import type { HeroId } from '../../sim/api';
import type { CatTier } from '../../meta/roster';
import { HERO_TEXT } from '../heroText';
import { heroElement, heroPic } from './el';
export { heroPic };
import { cardFrame, type CardFrameOpts } from './frame';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface HeroCardOpts {
  /** The portrait data URL (render/portraits.ts); default: the hero's baked default portrait, or initials. */
  portrait?: string | null;
  tier?: CatTier | null;
  /** Shown under the portrait (default: the hero's title); '' hides it. */
  name?: string;
  /** A second, smaller line ("Cat · Tank", "Bond 4"). */
  sub?: string;
  cls?: string;
  attrs?: string;
  style?: string;
  foil?: CardFrameOpts['foil'];
  sparkles?: boolean;
  icon?: boolean;
  foot?: CardFrameOpts['foot'];
  /** CARD-SKINS.md Awakened stage (frame.ts `awakened`). */
  awakened?: CardFrameOpts['awakened'];
}

/** A hero card's HTML (front face). Uses no <b> (pick-screen tests read the tile's one <b>, the hero's name). */
export function heroCard(hero: HeroId, o: HeroCardOpts = {}): string {
  const name = o.name ?? HERO_TEXT[hero].title;
  const inner = `${heroPic(hero, o.portrait)}${name ? `<span class="tt-name">${esc(name)}</span>` : ''}${o.sub ? `<small class="tt-sub">${esc(o.sub)}</small>` : ''}`;
  return cardFrame({
    el: heroElement(hero),
    tier: o.tier ?? null,
    inner,
    cls: o.cls,
    attrs: o.attrs,
    style: o.style,
    foil: o.foil,
    sparkles: o.sparkles,
    icon: o.icon ?? true,
    foot: o.foot,
    awakened: o.awakened,
  });
}

/** The card back (the Token Tails card placeholder art); `inner` sits on top (a countdown number). */
export function cardBack(inner = ''): string {
  return `<div class="tt-back">${inner}</div>`;
}

/**
 * A flippable card: the back shows until `.up` is added to the returned element's root (`.tt-flip`), then it turns
 * to the front. `front` is a card's HTML (heroCard / cardFrame).
 */
export function flipCard(front: string, o: { cls?: string; back?: string; style?: string; attrs?: string } = {}): string {
  return `<div class="tt-flip${o.cls ? ` ${o.cls}` : ''}" ${o.attrs ?? ''}${o.style ? ` style="${o.style}"` : ''}><div class="tt-flip-in"><div class="tt-face tt-face-back">${cardBack(o.back ?? '')}</div><div class="tt-face tt-face-front">${front}</div></div></div>`;
}
