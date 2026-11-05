/**
 * The Token Tails card frame, rebuilt in plain CSS from `client/components/tailsCard/CardWrapper.tsx`: the element
 * art as the card, a navy inset at 6 %, the element border, four sparkle stars on the inner edges, the tier pattern
 * through a color-dodge glare that follows the pointer (or sweeps by itself on touch), and the "TOKEN TAILS" footer.
 * Sized in `cqw` like the client, so a 64 px pick tile is a scale model of the 220 px MVP card.
 *
 * Reduced motion: no tilt, no sweep, no twinkle; the still tier glow (STATIC_TIER_GLOW) instead. The pointer tilt is
 * `tilt.ts` (its own chunk: `attachCardTilt`).
 */
import type { CatTier, Element } from '../../meta/roster';
import { TIER_NAME, cardAttrs } from './el';
import './vars.css';
import './cards.css';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface CardFrameOpts {
  el: Element;
  /** The tier (the foil pattern and glow); COMMON when none. */
  tier?: CatTier | null;
  /** HTML inside the navy inset (trusted: callers escape their own text). */
  inner: string;
  /** Extra classes on the card (`on`, `hero-card`, ...). */
  cls?: string;
  /** Extra raw attributes (`data-h="clem"`, ...). */
  attrs?: string;
  /** Extra inline style (appended after the card vars). */
  style?: string;
  tag?: 'div' | 'button' | 'span';
  /** 'hover': the glare follows the pointer (attachCardTilt); 'sweep': it also sweeps by itself; 'none' (default). */
  foil?: 'hover' | 'sweep' | 'none';
  /** The four sparkle stars on the inner edges. */
  sparkles?: boolean;
  /** The element icon in the inset corner. */
  icon?: boolean;
  /** Footer text ("Legendary · TOKEN TAILS"); true = the tier and TOKEN TAILS; omitted = none. */
  foot?: string | true;
}

/** One card's HTML. */
export function cardFrame(o: CardFrameOpts): string {
  const tag = o.tag ?? 'div';
  const tier = o.tier ?? 'COMMON';
  const foil = o.foil ?? 'none';
  const cls = `tt-card${o.cls ? ` ${o.cls}` : ''}${foil !== 'none' ? ` foil-${foil}` : ''}`;
  const sp = o.sparkles ? '<span class="tt-sp t"></span><span class="tt-sp b"></span><span class="tt-sp l"></span><span class="tt-sp r"></span>' : '';
  const ico = o.icon ? '<span class="tt-ico" aria-hidden="true"></span>' : '';
  const footText = o.foot === true ? `${TIER_NAME[tier]} · TOKEN TAILS` : (o.foot ?? '');
  const foot = footText ? `<span class="tt-foot">${esc(footText)}</span>` : '';
  const type = tag === 'button' ? ' type="button"' : '';
  return `<${tag} class="${cls}" data-el="${o.el}" data-tier="${tier}" ${cardAttrs(o.el, tier)}${type} ${o.attrs ?? ''}${o.style ? ` style="${o.style}"` : ''}><span class="tt-bg" aria-hidden="true"></span><span class="tt-in">${o.inner}</span>${ico}${sp}<span class="tt-glare" aria-hidden="true"></span>${foot}</${tag}>`;
}
