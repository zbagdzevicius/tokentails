/**
 * PERF-IOS §8 Track C: is the champion browser open? A flag of its own (no DOM query, no browser chunk), read by the
 * app's frame loop: the browser covers the 3D view, so the lobby behind it stops drawing while it is open.
 */
let open = 0;

export const champCovered = (): boolean => open > 0;

/** The browser opened (true) or closed (false). */
export function setChampCovered(on: boolean): void {
  if ((open > 0) === on) return;
  open = on ? 1 : 0;
  // html[data-champ]: champBrowser.css pauses the covered screen's idle card animations under the panel
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.champ = '1';
  else delete document.documentElement.dataset.champ;
}
