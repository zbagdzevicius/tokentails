/**
 * The results screen's MVP card (GAPS A2 MVP, Token Tails card art): the MVP's hero as a full card (element frame,
 * portrait, name, "MVP" ribbon, the tier footer), a golden burst turning slowly behind it, and the foil sweeping by
 * itself. A Legendary card adds the legendary background and paws. It lies face down and flips 600 ms after the
 * screen opens (the companion card flip's timing in ui/cards.ts); the flip is pure CSS on `.pl-results.in`.
 */
import type { HeroId } from '../../sim/api';
import type { CatTier } from '../../meta/roster';
import { cardAttrs, fxUrl, heroElement } from './art';
import { flipCard, heroCard } from './hero';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface MvpCardOpts {
  hero: HeroId;
  /** "You" or the slot name. */
  name: string;
  you: boolean;
  portrait?: string | null;
  tier?: CatTier | null;
  won: boolean;
}

export function mvpCard(o: MvpCardOpts): string {
  const tier = o.tier ?? 'COMMON';
  // the tier's card effects, as the client's cardEffects/ (Common whiskers, Rare swirl, Epic claw marks, Legendary bg)
  const leg =
    tier === 'LEGENDARY'
      ? `<i class="tt-mvp-leg" style="background-image:url(${fxUrl('legendary-bg')})"></i>`
      : tier === 'RARE'
        ? `<i class="tt-mvp-leg rare" style="background-image:url(${fxUrl('rare-swirl')})"></i>`
        : '';
  const deco =
    tier === 'COMMON'
      ? `<i class="tt-mvp-deco wl" style="background-image:url(${fxUrl('whiskers-left')})"></i><i class="tt-mvp-deco wr" style="background-image:url(${fxUrl('whiskers-right')})"></i>`
      : tier === 'EPIC'
        ? `<i class="tt-mvp-deco claw" style="background-image:url(${fxUrl('epic-claw')})"></i><i class="tt-mvp-deco paw" style="background-image:url(${fxUrl('epic-paw')})"></i>`
        : '';
  const front = heroCard(o.hero, { portrait: o.portrait, tier, name: o.name, foil: 'sweep', sparkles: true, foot: true });
  return `<div class="tt-mvp${o.you ? ' you' : ''}${o.won ? ' won' : ''}" data-mvp-card="${o.hero}" ${cardAttrs(heroElement(o.hero), tier)} aria-label="${esc(`MVP: ${o.name}`)}" role="img">${leg}<i class="tt-mvp-burst" style="background-image:url(${fxUrl('golden-burst')})"></i>${flipCard(front, { cls: 'tt-mvp-flip' })}${deco}<span class="tt-mvp-ribbon">MVP</span></div>`;
}
