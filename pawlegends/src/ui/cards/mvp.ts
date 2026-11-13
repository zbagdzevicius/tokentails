/**
 * The results screen's MVP card (GAPS A2 MVP, champion card art): the MVP's hero as a full card (element frame,
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
  /** The ribbon text (default "MVP"); a defeat's best-on-your-team card says "TEAM BEST". */
  ribbon?: string;
  /** CARD-SKINS.md: the MVP's Awakened stage at the end of the match (null: not an Awakened card). */
  awakened?: 0 | 1 | 2 | 3 | null;
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
  const front = heroCard(o.hero, { portrait: o.portrait, tier, name: o.name, foil: 'sweep', sparkles: true, foot: true, awakened: o.awakened ?? null });
  const ribbon = o.ribbon ?? 'MVP';
  // a defeat: no turning sunburst behind the card (it read as the enemy celebrating), the tier art stays
  const burst = o.won ? `<i class="tt-mvp-burst" style="background-image:url(${fxUrl('golden-burst')})"></i>` : '';
  return `<div class="tt-mvp${o.you ? ' you' : ''}${o.won ? ' won' : ' lost'}" data-mvp-card="${o.hero}" ${cardAttrs(heroElement(o.hero), tier)} aria-label="${esc(`${ribbon === 'MVP' ? 'MVP' : 'Best on your team'}: ${o.name}`)}" role="img">${leg}${burst}${flipCard(front, { cls: 'tt-mvp-flip' })}${deco}<span class="tt-mvp-ribbon">${esc(ribbon)}</span></div>`;
}
