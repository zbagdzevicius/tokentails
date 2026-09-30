import {
  CONSENT_CHANGE_EVENT,
  readConsent,
  type ConsentState,
} from "./consent";

/**
 * Google Tag Manager behind the same opt-in as PostHog (`tt-analytics-consent`).
 *
 * Before consent nothing is sent: gtm.js is not requested, the dataLayer is
 * not created, and pushes are dropped rather than queued, so accepting later
 * never replays earlier events. After "Accept" the container loads with
 * Consent Mode v2 set to denied by default and only `analytics_storage`
 * granted, because the banner asks about analytics and nothing else. After a
 * revoke, pushes stop and GTM is told `analytics_storage: denied`; the
 * already-loaded script stays until the next page load.
 */

export const GTM_SCRIPT_URL = "https://www.googletagmanager.com/gtm.js";

type GtmWindow = Window & { dataLayer?: unknown[] };

export interface GtmGateOptions {
  /** Container id. Empty or missing turns GTM into a no-op. */
  gtmId?: string;
  readConsent?: () => ConsentState;
  /** Returns undefined during SSR. */
  getWindow?: () => GtmWindow | undefined;
}

export interface GtmGate {
  readonly enabled: boolean;
  isLoaded(): boolean;
  /** Dropped (not queued) unless consent is granted and an id is set. */
  push(data: Record<string, unknown>): boolean;
  /** Applies a consent choice: loads on grant, downgrades on revoke. */
  applyConsent(state: ConsentState): void;
  /**
   * Loads GTM now if consent is already stored, then follows consent
   * changes. Returns a cleanup function.
   */
  start(onGranted?: () => void): () => void;
}

const DENIED_DEFAULTS = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

const defaultGetWindow = (): GtmWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as GtmWindow);

export function createGtmGate(options: GtmGateOptions = {}): GtmGate {
  const gtmId = options.gtmId?.trim() || "";
  const read = options.readConsent ?? readConsent;
  const getWindow = options.getWindow ?? defaultGetWindow;
  const enabled = gtmId.length > 0;

  let loaded = false;
  // Cached like the PostHog client, so a choice holds for this page view
  // even when storage is blocked and cannot be read back.
  let consent: ConsentState | null = null;
  const getConsent = (): ConsentState => {
    if (consent === null) consent = read();
    return consent;
  };

  const dataLayerOf = (win: GtmWindow): unknown[] => {
    win.dataLayer = win.dataLayer || [];
    return win.dataLayer;
  };

  const gtag = (win: GtmWindow, ...args: unknown[]) => {
    dataLayerOf(win).push(gtagArguments(...args));
  };

  const load = (win: GtmWindow) => {
    if (loaded) return;
    loaded = true;
    gtag(win, "consent", "default", { ...DENIED_DEFAULTS });
    gtag(win, "consent", "update", { analytics_storage: "granted" });
    dataLayerOf(win).push({ "gtm.start": Date.now(), event: "gtm.js" });

    const script = win.document.createElement("script");
    script.async = true;
    script.src = `${GTM_SCRIPT_URL}?id=${encodeURIComponent(gtmId)}`;
    script.dataset.ttGtm = "true";
    win.document.head.appendChild(script);
  };

  const applyConsent = (state: ConsentState) => {
    const win = getWindow();
    if (!enabled || !win) return;
    consent = state;
    if (state === "granted") {
      if (loaded) {
        gtag(win, "consent", "update", { analytics_storage: "granted" });
      } else {
        load(win);
      }
      return;
    }
    // Revoked (or reset): only talk to GTM if it was loaded this page view.
    if (loaded) {
      gtag(win, "consent", "update", { analytics_storage: "denied" });
    }
  };

  const push = (data: Record<string, unknown>) => {
    const win = getWindow();
    if (!enabled || !win || getConsent() !== "granted") return false;
    load(win);
    dataLayerOf(win).push(data);
    return true;
  };

  const start = (onGranted?: () => void) => {
    const win = getWindow();
    if (!enabled || !win) return () => {};

    let granted = getConsent() === "granted";
    if (granted) applyConsent("granted");

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ConsentState>).detail;
      const state =
        detail === "granted" || detail === "denied" ? detail : read();
      applyConsent(state);
      // Only a fresh opt-in counts; re-accepting does not repeat onGranted.
      if (state === "granted" && !granted) onGranted?.();
      granted = state === "granted";
    };
    win.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => win.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  };

  return { enabled, isLoaded: () => loaded, push, applyConsent, start };
}

/**
 * Consent Mode commands must reach the dataLayer as an `arguments` object,
 * the way Google's own gtag() snippet pushes them; plain arrays are ignored.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read via `arguments`
function gtagArguments(..._args: unknown[]): IArguments {
  // eslint-disable-next-line prefer-rest-params
  return arguments;
}

export const gtm = createGtmGate({ gtmId: process.env.NEXT_PUBLIC_GTM_ID });
