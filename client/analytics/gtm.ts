/**
 * Google Tag Manager, next to PostHog: Token Tails' container (`NEXT_PUBLIC_GTM_ID`) on every page. No Consent Mode
 * commands are pushed, so GA4 in that container runs with its default (granted) storage. Paw Legends has its own app
 * and container on pawlegends.app (pawlegends-web/). `start()` loads gtm.js (the official snippet's head part).
 * Pushes go to the shared dataLayer at once; the container reads them when it loads. Without an id everything is a
 * no-op, and nothing touches `window` during SSR.
 */
export const GTM_SCRIPT_URL = "https://www.googletagmanager.com/gtm.js";

type GtmWindow = Window & { dataLayer?: unknown[] };

export interface GtmOptions {
  /** Container id. Empty or missing turns GTM into a no-op. */
  gtmId?: string;
  /** Returns undefined during SSR. */
  getWindow?: () => GtmWindow | undefined;
  /** False turns GTM into a no-op (app builds). Read at call time. */
  allowed?: () => boolean;
}

export interface Gtm {
  readonly enabled: boolean;
  /** The container id this instance loads ("" when none). */
  readonly id: string;
  isLoaded(): boolean;
  /** Pushes to the dataLayer (loading GTM first). False when disabled. */
  push(data: Record<string, unknown>): boolean;
  /** Loads GTM now. Returns a cleanup function (nothing to undo today). */
  start(): () => void;
}

export function createGtm(options: GtmOptions = {}): Gtm {
  const gtmId = options.gtmId?.trim() || "";
  const getWindow = options.getWindow ?? defaultGetWindow;
  const allowed = options.allowed ?? (() => true);
  const isEnabled = () => gtmId.length > 0 && allowed();

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
    if (!isEnabled() || !win) return false;
    load(win);
    dataLayerOf(win).push(data);
    return true;
  };

  const start = () => {
    const win = getWindow();
    if (isEnabled() && win) load(win);
    return () => {};
  };

  return {
    get enabled() {
      return isEnabled();
    },
    id: gtmId,
    isLoaded: () => loaded,
    push,
    start,
  };
}

const defaultGetWindow = (): GtmWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as GtmWindow);

/** Token Tails' container. */
export const gtm = createGtm({ gtmId: process.env.NEXT_PUBLIC_GTM_ID });
