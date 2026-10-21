/**
 * Wave C (C4): the card-tier effect preview on the pick screen, the results screen and the Treat Track collection.
 * "Legendary card: Ficus burst", what the rung adds, and a small CSS demo in the coat colour (a glow trail at Rare,
 * twinkles at Epic, a paw-print burst at Legendary; still under reduce motion). Looks only, and the copy says so.
 */
import type { CatTier } from '../meta/roster';
import { cardFxDetail, cardFxLine } from '../render/skins/cardFx';
import { icon } from './icons';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const hex = (c: number): string => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

export interface CardFxTile {
  name: string;
  rung: CatTier;
  /** The coat glow (render/skins/cardFx.ts coatGlow), or none for the default colour. */
  tint?: number;
}

/** The demo glyph alone (the collection rows use it small). */
export function cardFxDemo(k: CardFxTile): string {
  const stars = k.rung === 'EPIC' || k.rung === 'LEGENDARY' ? '<i class="tw a"></i><i class="tw b"></i><i class="tw c"></i>' : '';
  const paw = k.rung === 'LEGENDARY' ? `<i class="paw">${icon('paw')}</i>` : '';
  return `<i class="fx-demo" data-rung="${k.rung}" aria-hidden="true"><i class="trail"></i>${stars}${paw}</i>`;
}

/** The preview line: demo, "<Rung> card: <name> <effect>" and what it adds. */
export function cardFxPreview(k: CardFxTile, cls = 'card-fx'): string {
  const style = k.tint !== undefined ? ` style="--fx:${hex(k.tint)}"` : '';
  return `<p class="${cls}" data-card-fx="${k.rung}"${style}>${cardFxDemo(k)}<span><b>${esc(cardFxLine(k.rung, k.name))}</b><small>${esc(cardFxDetail(k.rung))} Looks only.</small></span></p>`;
}
