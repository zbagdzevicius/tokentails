/**
 * The champion browser's tiny first-load part: a lazy opener (the champion select's Preview, the party pick, the
 * collection). The browser itself (the codex, the lore, the CSS and, on a skill tap, three.js for the clip) loads only
 * when a player asks for it.
 */
import type { ChampBrowser, ChampBrowserOpts } from './champBrowser';

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
