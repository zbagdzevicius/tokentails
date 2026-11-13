/**
 * Champion card art in Paw Legends: the asset paths under `public/assets/cards/` (copied and shrunk from
 * `client/public/cards/`, LICENSES.md) and the per-element card colours from `client/models/cats.ts`
 * (`cardsBorderColor`, `cardsGradient`). Pure: no DOM writes, nothing loads until a screen puts a URL in a style.
 *
 * Every URL is absolute (resolved against the document), because a relative `url()` inside a CSS custom property
 * resolves against the stylesheet that uses it, not the page, and the embed build serves under `/pawlegends-game/`.
 */
import type { CatTier, Element } from '../../meta/roster';
export { TIER_NAME, cardAttrs, heroElement } from './el';

export type CardElement = Element;
export type CardTier = CatTier;

const BASE: string = (() => {
  try {
    return (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  } catch {
    return './';
  }
})();

/** The absolute URL of a card asset (`el/fire.webp`, `fx/sparkle.webp`, ...). */
export function cardUrl(path: string): string {
  const rel = `${BASE.endsWith('/') ? BASE : `${BASE}/`}assets/cards/${path}`;
  try {
    return typeof document !== 'undefined' ? new URL(rel, document.baseURI).href : rel;
  } catch {
    return rel;
  }
}

const lower = (e: Element): string => e.toLowerCase();
/** The element's card background (512 px art, about 7–38 KB). */
export const elBg = (e: Element): string => cardUrl(`el/${lower(e)}.webp`);
/** The element's pixel icon (64 px, shown with image-rendering: pixelated). */
export const elIcon = (e: Element): string => cardUrl(`icons/${lower(e)}.webp`);
/** The tier's foil pattern (shown through a color-dodge glare). */
export const tierPattern = (t: CatTier): string => cardUrl(`tier/${t}.webp`);
/** fx art: sparkle, legendary-sparkle, golden-burst, white-burst, reveal-sparkle, legendary-bg, legendary-paws, ... */
export const fxUrl = (name: string): string => cardUrl(`fx/${name}.webp`);

/** `cardsBorderColor` (client/models/cats.ts). */
export const CARD_BORDER: Readonly<Record<Element, string>> = Object.freeze({
  DARK: '#A9A9A9',
  ELECTRIC: '#FFF9B8',
  FIRE: '#FFDBF1',
  ICE: '#d4e7f4',
  SAND: '#FCDDC3',
  WATER: '#80C5FF',
  WIND: '#FFFFFF',
  GRASS: '#B3E7DB',
  STELLAR: '#C5BDFF',
  FAIRY: '#FFFFFF',
});

/** `cardsGradient` (client/models/cats.ts): the card body fill behind the portrait. */
export const CARD_GRADIENT: Readonly<Record<Element, string>> = Object.freeze({
  FIRE: 'radial-gradient(circle at 60% 30%, #FFDBF1 0%, #FF6F71 100%)',
  SAND: 'radial-gradient(circle at 60% 30%, #FCDDC3 0%, #F9BA88 100%)',
  ELECTRIC: 'radial-gradient(circle at 60% 30%, #FFF9B8 0%, #FFF371 100%)',
  GRASS: 'radial-gradient(circle at 60% 30%, #B3E7DB 0%, #68D0B6 100%)',
  WATER: 'radial-gradient(circle at 60% 30%, #B3E7DB 0%, #80C5FF 100%)',
  STELLAR: 'radial-gradient(circle at 60% 30%, #C5BDFF 0%, #8B7CFF 100%)',
  DARK: 'radial-gradient(circle at 60% 30%, #A9A9A9 0%, #545454 100%)',
  WIND: 'radial-gradient(circle at 60% 30%, #FFFFFF 0%, #D2D2D2 100%)',
  ICE: 'radial-gradient(circle at 60% 30%, #d4e7f4 0%, #a0d1f0 100%)',
  FAIRY: 'linear-gradient(135deg, #FF6FC6 0%, #F9BA88 20%, #FFE371 40%, #68D0B6 60%, #008CFF 80%, #8B7CFF 100%)',
});

/** A saturated accent per element for rings and glows (the kill-feed ring, the reveal flash). */
export const CARD_ACCENT: Readonly<Record<Element, string>> = Object.freeze({
  FIRE: '#FF6F71',
  SAND: '#F9BA88',
  ELECTRIC: '#FFE34D',
  GRASS: '#68D0B6',
  WATER: '#4FB3FF',
  STELLAR: '#8B7CFF',
  DARK: '#9A7BC8',
  WIND: '#E9F3F6',
  ICE: '#7FC8F0',
  FAIRY: '#FF6FC6',
});

/** `STATIC_TIER_GLOW` (client CardWrapper.tsx) in px (a card's own box-shadow cannot use its own cqw): the still tier glow. */
export const TIER_GLOW: Readonly<Record<CatTier, string>> = Object.freeze({
  COMMON: '0 0 0 transparent',
  RARE: '0 0 10px 2px rgba(110, 190, 255, 0.55)',
  EPIC: '0 0 12px 3px rgba(214, 120, 255, 0.6)',
  LEGENDARY: '0 0 14px 4px rgba(255, 205, 90, 0.7)',
});

/** The inline custom properties a card needs for its element and tier. */
export function cardVars(el: Element, tier: CatTier | null | undefined): string {
  const t = tier ?? 'COMMON';
  const x = t === 'RARE' ? `;--tt-x:url(${fxUrl('blue-sparkle')})` : t === 'EPIC' ? `;--tt-x:url(${fxUrl('purple-sparkle')})` : t === 'LEGENDARY' ? `;--tt-x:url(${fxUrl('legendary-sparkle')});--tt-lp:url(${fxUrl('legendary-paws')})` : '';
  return `--tt-bg:url(${elBg(el)});--tt-border:${CARD_BORDER[el]};--tt-grad:${CARD_GRADIENT[el]};--tt-accent:${CARD_ACCENT[el]};--tt-pat:url(${tierPattern(t)});--tt-glow:${TIER_GLOW[t]};--tt-ico:url(${elIcon(el)});--tt-sparkle:url(${fxUrl('sparkle')})${x}`;
}

const warmed = new Set<string>();
/**
 * Warm the browser cache for some card art (the VS screen preloads the match's six element backgrounds and the fx it
 * flips with). Idempotent, never throws, does nothing outside a browser.
 */
export function preloadCardArt(urls: readonly string[]): void {
  if (typeof Image === 'undefined') return;
  for (const u of urls) {
    if (warmed.has(u)) continue;
    warmed.add(u);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = u;
    } catch {
      /* ignore */
    }
  }
}
