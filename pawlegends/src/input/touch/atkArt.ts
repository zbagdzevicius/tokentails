/**
 * The touch Attack button's art (founder ask, Nov 13: "attack button looks basic, update it to look extraordinary"):
 * the v6 claw-slash medallion with a bolt core. One inline SVG drawn inside the button circle (viewBox 0 0 100 100,
 * scales with the button), styled and animated in ui/css/match.css. Each layer has a job in a state: the gold ring
 * flashes on a hit and turns cream on a lock, the bolt core glows while a unit is in reach and pops on a swing and a big
 * hit, the claws slide on each attack, the burst shows on a big hit. Decorative only (aria-hidden): the button keeps its
 * label span (first child) and its aria-label.
 *
 * The pattern's colour is --v6-berry written out: SVG pattern children do not take the class rules in every WebKit.
 */
export const ATK_ART =
  '<svg class="atk-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<defs><pattern id="pl-atk-ht" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="#3e0820" opacity="0.3"/></pattern></defs>' +
  '<path class="ht" d="M50 50H100A50 50 0 0 1 50 100Z"/>' +
  '<circle class="glow" cx="50" cy="50" r="23"/>' +
  '<circle class="ring-ink" cx="50" cy="50" r="37"/>' +
  '<circle class="ring" cx="50" cy="50" r="37"/>' +
  '<circle class="ring-hi" cx="50" cy="50" r="37"/>' +
  '<g class="claws">' +
  '<path d="M58 10Q50 40 16 70Q30 54 50 12Z"/>' +
  '<path d="M75 15Q65 50 28 86Q43 66 66 16Z"/>' +
  '<path d="M87 31Q78 60 48 88Q60 71 79 30Z"/>' +
  '</g>' +
  '<g class="burst"><path d="M50 22L54 41L72 30L59 46L78 50L59 54L72 70L54 59L50 78L46 59L28 70L41 54L22 50L41 46L28 30L46 41Z"/></g>' +
  '<g class="core">' +
  '<circle cx="50" cy="50" r="15" stroke-width="3"/>' +
  '<circle class="rim" cx="50" cy="50" r="12.5"/>' +
  '<path d="M54 36L41 52.6H48.7L45 64.3L59 46.1H51.3L55.2 36Z"/>' +
  '</g>' +
  '</svg>';

const timers = new WeakMap<HTMLElement, Map<string, ReturnType<typeof setTimeout>>>();

/** Restart a one-shot state class (remove, reflow, add) and drop it after `ms`. */
export function pulse(el: HTMLElement, cls: string, ms: number): void {
  // reflow only to restart a class that is still on (a fresh add needs none: no forced layout per hit in a teamfight)
  if (el.classList.contains(cls)) {
    el.classList.remove(cls);
    void el.offsetWidth;
  }
  el.classList.add(cls);
  let t = timers.get(el);
  if (!t) timers.set(el, (t = new Map()));
  const old = t.get(cls);
  if (old !== undefined) clearTimeout(old);
  t.set(cls, setTimeout(() => el.classList.remove(cls), ms));
}
