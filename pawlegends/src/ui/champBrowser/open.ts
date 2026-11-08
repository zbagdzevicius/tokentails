/**
 * The champion browser's tiny first-load part: the "i" dot on a pick card and a lazy opener. The browser itself (the
 * codex, the lore, the CSS and, on a skill tap, three.js for the clip) loads only when a player asks for it.
 */
import type { HeroId } from '../../data/heroes/types';
import { HERO_TEXT } from '../heroText';
import type { ChampBrowser, ChampBrowserOpts } from './champBrowser';
import { infoLabel } from './meta';

/**
 * The "i" on a pick card. It sits inside the card's button, so it is not a second tab stop (aria-hidden): keyboard and
 * screen reader players reach the same browser from the detail's "Skills & lore" button. Its hit area is larger than
 * the dot (CSS ::before).
 */
export const infoDot = (h: HeroId): string => `<span class="hero-info" data-info="${h}" aria-hidden="true" title="${infoLabel(HERO_TEXT[h].title)}">i</span>`;

let loading: Promise<ChampBrowser | null> | null = null;
/** The chunk was loaded once (closing needs it; a session that never opened the browser never loads it). */
let loaded = false;

/** Open the browser (one at a time; a second call while the chunk loads is ignored). Null when the chunk failed. */
export function openChampInfo(o: ChampBrowserOpts): Promise<ChampBrowser | null> {
  if (loading) return loading;
  loading = import('./champBrowser')
    .then((m) => {
      loaded = true;
      return m.openChampBrowser(o);
    })
    .catch(() => null)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Close the open browser, if any (a screen change). */
export function closeChampInfo(): void {
  if (!loaded) return;
  void import('./champBrowser').then((m) => m.openBrowser()?.close()).catch(() => undefined);
}
