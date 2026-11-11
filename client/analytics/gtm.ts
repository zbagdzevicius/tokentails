/**
 * Google Tag Manager, next to PostHog. Two containers, one per brand:
 *
 * - Token Tails (`NEXT_PUBLIC_GTM_ID`) on every Token Tails page. No Consent Mode commands are pushed, so GA4 in that
 *   container runs with its default (granted) storage, as before.
 * - Paw Legends (`GTM-K6RTRKSR`, PAWLEGENDS_GTM_ID) on the Paw Legends web pages (`/pawlegends`, `/pawlegends/**`, the
 *   `/legends` landing arm) and on every page served on pawlegends.app. It runs Google Consent Mode v2: storage is
 *   denied by default in the EEA, the UK and Switzerland (CONSENT_REGIONS) until the visitor allows it on the consent
 *   bar (components/pawlegends/PawlegendsConsent.tsx); the choice is kept in localStorage. Never in an app build
 *   (`NEXT_PUBLIC_IS_APP`) or a native WebView: the App Store and Google Play answers say no analytics.
 *
 * `gtm` picks the container from the first page it runs on and keeps it for the page's life, so a visitor who moves
 * between brands in one tab never gets a second container (and a Paw Legends visitor's consent is never bypassed).
 * `start()` loads gtm.js (the official snippet's head part); _document adds the noscript iframe on Paw Legends pages.
 * Pushes go to the shared dataLayer at once; the container reads them when it loads. Without an id everything is a
 * no-op, and nothing touches `window` during SSR.
 */
import { getPlatform } from "./platform";
import { isPawlegendsLocation, PAWLEGENDS_GTM_ID } from "./pawlegends-site";

export { isPawlegendsHost, isPawlegendsLocation, isPawlegendsPath, pagePathOf, PAWLEGENDS_GTM_ID, PAWLEGENDS_HOSTS } from "./pawlegends-site";

export const GTM_SCRIPT_URL = "https://www.googletagmanager.com/gtm.js";
export const GTM_NOSCRIPT_URL = "https://www.googletagmanager.com/ns.html";

/** Where storage is denied until the visitor allows it: the EU 27, Iceland, Liechtenstein, Norway, the UK, Switzerland. */
export const CONSENT_REGIONS: readonly string[] = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
]);

/** The visitor's choice on the consent bar, kept per browser. */
export const CONSENT_STORAGE_KEY = "pawlegends.analytics-consent.v1";
export type ConsentChoice = "granted" | "denied";

/** The four Consent Mode v2 signals, all set to `state`. */
export const consentState = (state: ConsentChoice) => ({
  ad_storage: state,
  ad_user_data: state,
  ad_personalization: state,
  analytics_storage: state,
});

/** The stored consent choice, or null (none yet, or storage blocked). */
export function readConsentChoice(storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage()): ConsentChoice | null {
  try {
    const v = storage?.getItem(CONSENT_STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsentChoice(choice: ConsentChoice, storage: Pick<Storage, "setItem"> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

type GtmWindow = Window & { dataLayer?: unknown[] };

export interface GtmConsentOptions {
  /** Regions (ISO 3166-1 alpha-2) where every signal starts denied. Elsewhere they start granted. */
  regions: readonly string[];
  /** The visitor's stored choice, applied as an update right after the defaults. */
  stored: () => ConsentChoice | null;
  /** Keeps a new choice (the consent bar). */
  store: (choice: ConsentChoice) => void;
  /**
   * True while gtm.js must not load at all (a visitor the consent bar asks, before Allow): no tag runs, not even
   * Consent Mode's cookieless pings. Pushes wait in memory (at most HELD_PUSH_LIMIT) and go out once the visitor allows.
   */
  hold?: () => boolean;
}

/** The most pushes kept while gtm.js is held for consent; older ones are dropped. */
export const HELD_PUSH_LIMIT = 50;

export interface GtmOptions {
  /** Container id. Empty or missing turns GTM into a no-op. */
  gtmId?: string;
  /** Returns undefined during SSR. */
  getWindow?: () => GtmWindow | undefined;
  /** Google Consent Mode v2 defaults, pushed before gtm.js. Without it no consent command is pushed. */
  consent?: GtmConsentOptions;
  /** False turns GTM into a no-op (app builds). Read at call time. */
  allowed?: () => boolean;
}

export interface Gtm {
  readonly enabled: boolean;
  /** The container id this instance loads ("" when none). */
  readonly id: string;
  /** True when the container runs Consent Mode (the Paw Legends one). */
  readonly consentMode: boolean;
  isLoaded(): boolean;
  /** Pushes to the dataLayer (loading GTM first). False when disabled. */
  push(data: Record<string, unknown>): boolean;
  /** Loads GTM now. Returns a cleanup function (nothing to undo today). */
  start(): () => void;
  /** Keeps the visitor's choice and, once GTM is loaded, sends it as a consent update. No-op without consent mode. */
  setConsent(choice: ConsentChoice): void;
}

export function createGtm(options: GtmOptions = {}): Gtm {
  const gtmId = options.gtmId?.trim() || "";
  const getWindow = options.getWindow ?? defaultGetWindow;
  const consent = options.consent;
  const allowed = options.allowed ?? (() => true);
  const isEnabled = () => gtmId.length > 0 && allowed();

  let loaded = false;
  let held: Record<string, unknown>[] | null = null;
  // this page's choice, so Allow still loads when storage is blocked (private mode)
  let choiceNow: ConsentChoice | null = null;
  const storedChoice = () => choiceNow ?? consent?.stored() ?? null;

  const dataLayerOf = (win: GtmWindow): unknown[] => {
    win.dataLayer = win.dataLayer || [];
    return win.dataLayer;
  };

  // gtag() as in Google's snippet: GTM reads consent commands only from an `arguments` object, never from an array.
  const gtag = (win: GtmWindow, ...args: unknown[]) => {
    dataLayerOf(win).push(argumentsOf(...args));
  };

  const isHeld = () => choiceNow !== "granted" && !!consent?.hold?.();

  const load = (win: GtmWindow) => {
    if (loaded) return;
    if (isHeld()) {
      held = held ?? [];
      return;
    }
    loaded = true;
    if (consent) {
      gtag(win, "consent", "default", { ...consentState("denied"), region: [...consent.regions], wait_for_update: 500 });
      gtag(win, "consent", "default", consentState("granted"));
      const stored = storedChoice();
      if (stored) gtag(win, "consent", "update", consentState(stored));
    }
    dataLayerOf(win).push({ "gtm.start": Date.now(), event: "gtm.js" });

    const script = win.document.createElement("script");
    script.async = true;
    script.src = `${GTM_SCRIPT_URL}?id=${encodeURIComponent(gtmId)}`;
    script.dataset.ttGtm = "true";
    win.document.head.appendChild(script);

    const queued = held ?? [];
    held = null;
    for (const data of queued) dataLayerOf(win).push(data);
  };

  const push = (data: Record<string, unknown>) => {
    const win = getWindow();
    if (!isEnabled() || !win) return false;
    load(win);
    if (!loaded) {
      // held for consent: nothing reaches the dataLayer (or Google) before Allow
      held = [...(held ?? []), data].slice(-HELD_PUSH_LIMIT);
      return true;
    }
    dataLayerOf(win).push(data);
    return true;
  };

  const start = () => {
    const win = getWindow();
    if (isEnabled() && win) load(win);
    return () => {};
  };

  const setConsent = (choice: ConsentChoice) => {
    if (!consent) return;
    choiceNow = choice;
    consent.store(choice);
    const win = getWindow();
    if (loaded && win) gtag(win, "consent", "update", consentState(choice));
    // Allow after a held start: load now (the stored choice goes in as the consent update) and send what waited
    else if (!loaded && win && held && isEnabled()) load(win);
    if (choice === "denied" && !loaded) held = held ? [] : null;
  };

  return {
    get enabled() {
      return isEnabled();
    },
    id: gtmId,
    consentMode: !!consent,
    isLoaded: () => loaded,
    push,
    start,
    setConsent,
  };
}

/** The real `arguments` object of a call, which is what gtag() pushes. */
function argumentsOf(...args: unknown[]): IArguments {
  void args;
  // eslint-disable-next-line prefer-rest-params
  return arguments;
}

const defaultGetWindow = (): GtmWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as GtmWindow);

const EUROPE_ATLANTIC = /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe|Faeroe)$/;

/**
 * Whether the consent bar asks this visitor: a European time zone (where Consent Mode starts denied, CONSENT_REGIONS),
 * or an unknown one. These visitors get no gtm.js until they press Allow. Elsewhere storage starts granted, nobody is
 * asked, and the privacy page still offers the choice (Google's own region check still denies storage by IP in Europe).
 */
export function asksForConsent(timeZone: string | undefined = currentTimeZone()): boolean {
  if (!timeZone) return true;
  return timeZone.startsWith("Europe/") || EUROPE_ATLANTIC.test(timeZone) || timeZone === "Arctic/Longyearbyen";
}

function currentTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Paw Legends analytics runs only in a web browser: never in an app build or a native WebView. */
export const pawlegendsWebOnly = (): boolean => !process.env.NEXT_PUBLIC_IS_APP && getPlatform() === "web";

/** Token Tails' own container, as before. */
export const tokenTailsGtm = createGtm({ gtmId: process.env.NEXT_PUBLIC_GTM_ID });

/** The Paw Legends container, with Consent Mode v2. */
export const pawlegendsGtm = createGtm({
  gtmId: PAWLEGENDS_GTM_ID,
  allowed: pawlegendsWebOnly,
  consent: {
    regions: CONSENT_REGIONS,
    stored: () => readConsentChoice(),
    store: (c) => writeConsentChoice(c),
    // Basic consent mode for the visitors the bar asks (European time zones): gtm.js waits for Allow.
    hold: () => asksForConsent() && readConsentChoice() !== "granted",
  },
});

/**
 * One `Gtm` that sends to the container of the first page it runs on (`pick`), and keeps it.
 * Before a window exists (SSR) it is a no-op and picks nothing.
 */
export function createGtmRouter(
  pick: (win: GtmWindow) => Gtm,
  getWindow: () => GtmWindow | undefined = defaultGetWindow
): Gtm & { active(): Gtm | null } {
  let chosen: Gtm | null = null;
  const active = () => {
    if (chosen) return chosen;
    const win = getWindow();
    if (!win) return null;
    chosen = pick(win);
    return chosen;
  };
  return {
    get enabled() {
      return !!active()?.enabled;
    },
    get id() {
      return active()?.id ?? "";
    },
    get consentMode() {
      return !!active()?.consentMode;
    },
    active,
    isLoaded: () => !!chosen?.isLoaded(),
    push: (data) => active()?.push(data) ?? false,
    start: () => active()?.start() ?? (() => {}),
    setConsent: (choice) => active()?.setConsent(choice),
  };
}

/** The container for this page: Paw Legends on its pages and domain, Token Tails everywhere else. */
export const gtm = createGtmRouter((win) => (isPawlegendsLocation(win.location) ? pawlegendsGtm : tokenTailsGtm));
