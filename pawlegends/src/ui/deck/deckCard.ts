/**
 * "Your cards" drawer (lobby spec §3b): one Token Tails card per owned cat, built on the shared card frame
 * (ui/cards/frame, read only). Pure HTML builders, no DOM writes: every name and URL goes through `esc` or `cssUrl`.
 *
 * The cat on the card: its card art (GIF) when the host sent one, else frame 0 of its IDLE row from the sprite sheet
 * (48 px cells, row 4: the same frame render/skins/spriteProbe.ts reads), scaled with pixelated edges, else a paw.
 * Every card carries `data-nature="<element>"` and `pl-nature` for the Nature lane's CSS layers.
 */
import type { HeroId } from '../../sim/api';
import { ELEMENT_NAME, type CatTier, type Element } from '../../meta/roster';
import { cardFrame } from '../cards/frame';
import { heroElement, heroPic } from '../cards/el';
import { HERO_TEXT } from '../heroText';
import { icon } from '../icons';
import '../nature/natureCss';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A URL safe inside `url("…")` in an inline style: http(s) only, no quotes, brackets, backslashes or spaces. */
export function cssUrl(u: string | undefined): string | null {
  if (!u || !/^https?:\/\//i.test(u) || /["'\\()\s<>]/.test(u)) return null;
  return `url(&quot;${u}&quot;)`;
}

export interface DeckCard {
  id: string;
  name: string;
  element: Element;
  rung: CatTier;
  bond: number;
  /** The next bond threshold (null at Legendary). */
  next?: number | null;
  art?: string;
  sprite?: string;
  fromPack?: boolean;
  /** The coat glow (render/skins/cardFx.ts coatGlow) for the effect demo. */
  tint?: number;
  /** A featured cat the player does not own (Preview only; no price, no link). */
  locked?: boolean;
}

export const RUNG_NAME: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });
const RUNG_UP: readonly CatTier[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** The cat picture inside a card: art, else the sprite's idle frame, else a paw. */
export function catFace(k: Pick<DeckCard, 'art' | 'sprite'>): string {
  if (k.art && cssUrl(k.art)) return `<img class="dk-art" src="${esc(k.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`;
  const sp = cssUrl(k.sprite);
  if (sp) return `<span class="dk-sprite" aria-hidden="true"><i style="background-image:${sp}"></i></span>`;
  return `<span class="dk-noart" aria-hidden="true">${icon('paw')}</span>`;
}

/** "Bond 4 · 6 more to Rare" (the rung the next threshold gives), or "Bond 31 · max". */
export function bondLine(k: Pick<DeckCard, 'bond' | 'next' | 'rung'>): string {
  if (k.next === null || k.next === undefined) return `Bond ${k.bond}`;
  const left = Math.max(1, k.next - k.bond);
  const target = k.next >= 30 ? 'LEGENDARY' : k.next >= 10 ? 'EPIC' : 'RARE';
  if (RUNG_UP.indexOf(target) <= RUNG_UP.indexOf(k.rung)) return `Bond ${k.bond}`;
  return `Bond ${k.bond} · ${left} more to ${RUNG_NAME[target]}`;
}

/** The accessible label: "Simas, Fire, Legendary card. Wear on Clem" (or "Wearing on Clem"). */
export function cardLabel(k: DeckCard, hero: HeroId, on: boolean): string {
  const t = HERO_TEXT[hero]?.title ?? 'your hero';
  const what = `${k.name}, ${ELEMENT_NAME[k.element] ?? k.element}, ${RUNG_NAME[k.rung]} card`;
  if (k.locked) return `${what}. Not in your collection: preview it on ${t}`;
  return `${what}. ${on ? `Wearing on ${t}` : `Wear on ${t}`}`;
}

/** One owned card (a button) or a locked featured card (a div with a Preview button). */
export function deckCard(k: DeckCard, hero: HeroId, on: boolean): string {
  const el = ELEMENT_NAME[k.element] ?? k.element;
  const inner = `${catFace(k)}<b class="dk-name">${esc(k.name)}</b><small class="dk-meta"><span class="pip" data-rung="${k.rung}">${RUNG_NAME[k.rung]}</span><span class="dk-el">${esc(el)}</span></small>${k.locked ? '' : `<small class="bond">Bond ${k.bond}</small>`}`;
  const epic = k.rung === 'EPIC' || k.rung === 'LEGENDARY';
  if (k.locked) {
    const preview = `<button type="button" class="chip small dk-preview" data-preview="${esc(k.id)}" tabindex="-1" aria-label="${esc(cardLabel(k, hero, false))}">Preview</button>`;
    return `<div class="dk-slot locked" role="listitem">${cardFrame({ el: k.element, tier: k.rung, cls: 'dk-card locked pl-nature', attrs: `data-locked="${esc(k.id)}" data-nature="${k.element}"`, foil: 'none', icon: true, inner })}${preview}</div>`;
  }
  const title = k.fromPack ? ` title="${esc(`${k.name}: it gives its look and earns Bond; frames come from cats you adopted by name`)}" data-noframe="1"` : '';
  const card = cardFrame({
    tag: 'button',
    el: k.element,
    tier: k.rung,
    cls: `dk-card pl-nature${on ? ' on' : ''}`,
    attrs: `data-coat="${esc(k.id)}" data-rung="${k.rung}" data-nature="${k.element}" aria-pressed="${on}" aria-label="${esc(cardLabel(k, hero, on))}" tabindex="-1"${title}`,
    foil: on ? 'sweep' : 'hover',
    sparkles: epic,
    icon: true,
    inner,
  });
  return `<div class="dk-slot" role="listitem">${card}${on ? '<span class="dk-worn" aria-hidden="true">Wearing</span>' : ''}</div>`;
}

/** The "Classic" card: the hero's own look (first in the row). */
export function classicCard(hero: HeroId, on: boolean, portrait?: string | null): string {
  const t = HERO_TEXT[hero];
  const card = cardFrame({
    tag: 'button',
    el: heroElement(hero),
    tier: null,
    cls: `dk-card dk-classic${on ? ' on' : ''}`,
    attrs: `data-coat="" aria-pressed="${on}" aria-label="${esc(`Classic ${t.title}: no card. ${on ? 'Wearing' : 'Wear'} ${t.title}'s own look`)}" tabindex="-1"`,
    foil: 'none',
    icon: true,
    inner: `${heroPic(hero, portrait)}<b class="dk-name">Classic</b><small class="dk-meta">${esc(`${t.title}'s own look`)}</small>`,
  });
  return `<div class="dk-slot" role="listitem">${card}${on ? '<span class="dk-worn" aria-hidden="true">Wearing</span>' : ''}</div>`;
}
