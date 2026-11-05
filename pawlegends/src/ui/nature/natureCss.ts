/**
 * Cat Nature on card faces in the DOM (ui/nature/nature.css): helpers for the lanes that draw cards (the "Your cards"
 * drawer, the lobby's card peek, the collection). Importing this module adds the stylesheet (Vite puts it in the
 * importer's chunk, so it stays out of the first load when the importer is lazy).
 *
 * Use on a `cardFrame` (ui/cards/frame.ts):
 *   cardFrame({ el, tier, cls: NATURE_CLASS, attrs: natureAttr(el), inner })
 * The card then shows a still element glow; it animates while hovered, focused, `aria-pressed="true"` or marked
 * with `setNatureLive(node, true)`. Reduced motion keeps the still glow only. Cosmetic only.
 */
import './nature.css';
import { ELEMENTS, type Element } from '../../meta/roster';
import { NATURE } from '../../render/nature/natureDefs';

export const NATURE_CLASS = 'pl-nature';
export const NATURE_LIVE_CLASS = 'pl-nature-live';

const isElement = (v: unknown): v is Element => (ELEMENTS as readonly unknown[]).includes(v);

/** The `data-nature` attribute for an HTML string (empty for an unknown element, so nothing shows). */
export function natureAttr(el: Element | null | undefined): string {
  return isElement(el) ? `data-nature="${NATURE[el].css}"` : '';
}

/** Mark a node with an element's Nature (null clears it). */
export function setNature(node: HTMLElement, el: Element | null | undefined): void {
  if (isElement(el)) {
    node.classList.add(NATURE_CLASS);
    node.dataset.nature = NATURE[el].css;
  } else {
    node.classList.remove(NATURE_CLASS, NATURE_LIVE_CLASS);
    delete node.dataset.nature;
  }
}

/** Animate this card even without hover or focus (the selected card in a carousel, the lobby peek's top card). */
export function setNatureLive(node: HTMLElement, on: boolean): void {
  node.classList.toggle(NATURE_LIVE_CLASS, on);
}
