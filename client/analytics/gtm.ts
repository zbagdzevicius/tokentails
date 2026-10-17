/**
 * Google Tag Manager for every visitor, next to PostHog.
 *
 * `start()` loads gtm.js at once when a container id is set. No Consent Mode
 * commands are pushed, so GA4 in the container runs with its default
 * (granted) storage and sets its cookies. Pushes go to the dataLayer at once;
 * the container reads them when it loads. Without an id everything is a
 * no-op, and nothing touches `window` during SSR.
 */

export const GTM_SCRIPT_URL = "https://www.googletagmanager.com/gtm.js";

type GtmWindow = Window & { dataLayer?: unknown[] };

export interface GtmOptions {
  /** Container id. Empty or missing turns GTM into a no-op. */
  gtmId?: string;
  /** Returns undefined during SSR. */
  getWindow?: () => GtmWindow | undefined;
}

export interface Gtm {
  readonly enabled: boolean;
  isLoaded(): boolean;
  /** Pushes to the dataLayer (loading GTM first). False when disabled. */
  push(data: Record<string, unknown>): boolean;
  /** Loads GTM now. Returns a cleanup function (nothing to undo today). */
  start(): () => void;
}

const defaultGetWindow = (): GtmWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as GtmWindow);

export function createGtm(options: GtmOptions = {}): Gtm {
  const gtmId = options.gtmId?.trim() || "";
  const getWindow = options.getWindow ?? defaultGetWindow;
  const enabled = gtmId.length > 0;

  let loaded = false;

  const dataLayerOf = (win: GtmWindow): unknown[] => {
    win.dataLayer = win.dataLayer || [];
    return win.dataLayer;
  };

  const load = (win: GtmWindow) => {
    if (loaded) return;
    loaded = true;
    dataLayerOf(win).push({ "gtm.start": Date.now(), event: "gtm.js" });

    const script = win.document.createElement("script");
    script.async = true;
    script.src = `${GTM_SCRIPT_URL}?id=${encodeURIComponent(gtmId)}`;
    script.dataset.ttGtm = "true";
    win.document.head.appendChild(script);
  };

  const push = (data: Record<string, unknown>) => {
    const win = getWindow();
    if (!enabled || !win) return false;
    load(win);
    dataLayerOf(win).push(data);
    return true;
  };

  const start = () => {
    const win = getWindow();
    if (enabled && win) load(win);
    return () => {};
  };

  return { enabled, isLoaded: () => loaded, push, start };
}

export const gtm = createGtm({ gtmId: process.env.NEXT_PUBLIC_GTM_ID });
