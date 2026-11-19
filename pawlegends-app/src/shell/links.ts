/**
 * Party links into the app (docs/plans/moba/DEEP-LINKS.md). `https://pawlegends.app/p/<code>` is claimed by the app:
 * iOS Universal Links (Associated Domains `applinks:pawlegends.app`, the site's apple-app-site-association) and
 * Android App Links (the verified intent filter in AndroidManifest.xml, the site's assetlinks.json). A QR scan or a
 * tapped link then opens the app instead of the browser, and Capacitor's App plugin hands the URL over:
 *
 * - cold start: `App.getLaunchUrl()` (and on iOS also a retained `appUrlOpen`, the same URL);
 * - warm start: `appUrlOpen` (the app was in the background).
 *
 * The shell only queues the URL on `window.__PL_LINKS__` and fires `pl:link`; the game (pawlegends src/app/links.ts)
 * takes it off the queue once its title is up, so a link that arrives while the game still loads is not lost, and the
 * game decides what the link means (a party code, a broken code, nothing).
 *
 * Each URL is handled once: iOS's launch URL is the last URL the app was opened with for as long as the process lives,
 * and an OTA update or a renderer restart reloads the page in the same process, so the URLs already handed over are
 * kept in sessionStorage (cleared with the process) and `getLaunchUrl` skips them; the same URL from `appUrlOpen` within
 * a few seconds of the launch URL is the cold-start duplicate.
 */

/** The game's queue (pawlegends src/app/links.ts LINKS_GLOBAL). */
export const LINKS_GLOBAL = '__PL_LINKS__';
/** Fired after a URL is queued (pawlegends src/app/links.ts LINK_EVENT). */
export const LINK_EVENT = 'pl:link';
/** sessionStorage key: the URLs handed over in this process, newest last. */
export const SEEN_KEY = 'pl.links.seen';
/** The same URL again within this long is a duplicate delivery, not a second scan. */
export const DUP_MS = 5_000;
const SEEN_MAX = 10;

export interface LinkApp {
  getLaunchUrl(): Promise<{ url?: string } | undefined | null>;
  addListener(event: 'appUrlOpen', fn: (e: { url?: string }) => void): unknown;
}

interface Seen {
  url: string;
  at: number;
}

function readSeen(s: Pick<Storage, 'getItem'> | null): Seen[] {
  try {
    const v: unknown = JSON.parse(s?.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is Seen => !!x && typeof x.url === 'string' && typeof x.at === 'number') : [];
  } catch {
    return [];
  }
}

/** Only https links are handed to the game (the app claims nothing else); bounded so a hostile URL stays small. */
const usable = (u: unknown): u is string => typeof u === 'string' && u.length <= 512 && /^https:\/\//i.test(u);

/** Listen for links (call once, before the game's module runs). Never throws. */
export function installLinks(app: LinkApp, w: Window, now: () => number = Date.now): void {
  let store: Storage | null = null;
  try {
    store = w.sessionStorage;
  } catch {
    store = null;
  }
  // without storage the list lives for this page view only
  let mem: Seen[] = readSeen(store);
  const remember = (url: string): void => {
    mem = [...mem.filter((x) => x.url !== url), { url, at: now() }].slice(-SEEN_MAX);
    try {
      store?.setItem(SEEN_KEY, JSON.stringify(mem));
    } catch {
      /* blocked storage */
    }
  };
  const hand = (url: string): void => {
    remember(url);
    const rec = w as unknown as Record<string, unknown>;
    const q = Array.isArray(rec[LINKS_GLOBAL]) ? (rec[LINKS_GLOBAL] as unknown[]) : (rec[LINKS_GLOBAL] = []);
    (q as unknown[]).push(url);
    try {
      w.dispatchEvent(new Event(LINK_EVENT));
    } catch {
      /* the game drains the queue at boot anyway */
    }
  };

  try {
    app.addListener('appUrlOpen', (e) => {
      const url = e?.url;
      if (!usable(url)) return;
      const last = mem.find((x) => x.url === url);
      if (last && now() - last.at < DUP_MS) return;
      hand(url);
    });
  } catch (err) {
    console.warn('[links] no appUrlOpen', err);
  }
  void Promise.resolve()
    .then(() => app.getLaunchUrl())
    .then((r) => {
      const url = r?.url;
      if (!usable(url) || mem.some((x) => x.url === url)) return;
      hand(url);
    })
    .catch(() => undefined);
}
