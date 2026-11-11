import { analytics } from "@/analytics";
import { gtm } from "@/analytics/gtm";
import { pagePathOf } from "@/analytics/pawlegends-site";
import { useRouter } from "next/router";
import { useEffect } from "react";

// Event parameter types
type PageViewParams = {
  page_path?: string;
  page_title?: string;
  referrer?: string;
  user_id?: string;
  client_id?: string;
};

type ViewItemParams = {
  item_id?: string | string[];
  item_name?: string;
  item_category?: string;
  value?: number;
  currency?: string;
  user_id?: string;
};

type AddToCartParams = {
  event_id?: string;
  item_id?: string | string[];
  item_name?: string;
  item_category?: string;
  quantity?: number;
  value?: number;
  currency?: string;
  user_id?: string;
};

type BeginCheckoutParams = {
  event_id?: string;
  item_id?: string | string[];
  item_name?: string;
  value?: number;
  currency?: string;
  coupon?: string;
  payment_method?: string;
  user_id?: string;
};

type PurchaseParams = {
  event_id?: string;
  transaction_id?: string;
  item_id?: string | string[];
  item_name?: string;
  value?: number;
  currency?: string;
  coupon?: string;
  payment_method?: string;
  tax?: number;
  shipping?: number;
  user_id?: string;
};

// Event type definitions with discriminated unions
type TrackEventMap = {
  page_view: PageViewParams;
  view_item: ViewItemParams;
  add_to_cart: AddToCartParams;
  begin_checkout: BeginCheckoutParams;
  purchase: PurchaseParams;
};

type EventName = keyof TrackEventMap;

/** Fired by the Pawlegends landings (landing/motion.js on `/pawlegends`, legends/motion.js on `/legends`) once their intro has played. */
export const LANDING_READY_EVENT = "pawlegends:landing-ready";
/** The longest a landing waits before analytics starts anyway (ms after mount). */
export const ANALYTICS_DEFER_MAX_MS = 4000;
/**
 * Pages whose first seconds belong to the page: the Pawlegends landings hide their hero until the GSAP intro runs, and
 * GTM's tags (about 470 KB of third-party script) would compete with it for the network and the main thread. These two
 * pages are the landing A/B arms, so GTM starts on the same rule on both (the visitor's first tap, key or scroll,
 * leaving, or ANALYTICS_DEFER_MAX_MS) and not on their intros' ready signal: `/legends`'s intro is about 2 s shorter, and
 * an earlier start there would load the third-party tags during its intro and skew the comparison.
 */
const DEFERRED_PATHS: ReadonlySet<string> = new Set(["/pawlegends", "/legends"]);

/**
 * Calls `start` once, after the landing says it is ready, the visitor's first tap, key or scroll, or
 * ANALYTICS_DEFER_MAX_MS, whichever comes first, then in an idle moment. When the page is hidden or left first (the
 * visitor switches app or tab, or closes it), `start` runs at once, so a quick bounce still has a chance to send its
 * page_view. `waitForIntro: false` ignores the landing's ready signal (the landing A/B pages, see DEFERRED_PATHS).
 * Returns a cleanup.
 */
export function afterLandingReady(
  start: () => void,
  win: Window = window,
  { waitForIntro = true }: { waitForIntro?: boolean } = {}
): () => void {
  let done = false;
  let idleId: number | undefined;
  const events = waitForIntro ? [LANDING_READY_EVENT, "pointerdown", "keydown", "scroll"] : ["pointerdown", "keydown", "scroll"];
  const go = () => {
    if (done) return;
    done = true;
    off();
    if (typeof win.requestIdleCallback === "function") idleId = win.requestIdleCallback(start, { timeout: 1000 });
    else start();
  };
  const leaving = () => {
    if (done || win.document.visibilityState !== "hidden") return;
    done = true;
    off();
    start();
  };
  const timer = win.setTimeout(go, ANALYTICS_DEFER_MAX_MS);
  const off = () => {
    win.clearTimeout(timer);
    for (const e of events) win.removeEventListener(e, go);
    win.document.removeEventListener("visibilitychange", leaving);
    win.removeEventListener("pagehide", leaving);
  };
  for (const e of events) win.addEventListener(e, go, { once: true, passive: true });
  win.document.addEventListener("visibilitychange", leaving);
  win.addEventListener("pagehide", leaving);
  return () => {
    done = true;
    off();
    if (idleId !== undefined) win.cancelIdleCallback?.(idleId);
  };
}

/**
 * Starts GTM and PostHog on mount for every visitor (see `analytics/gtm.ts`: the Paw Legends container on the Paw
 * Legends pages and pawlegends.app, with Consent Mode v2; Token Tails' container everywhere else)
 * and pushes `page_view` on route changes. On the Pawlegends landings the start
 * is deferred (afterLandingReady, DEFERRED_PATHS); a route change starts it at once,
 * and the first page_view is still the page the visitor landed on.
 * Renders nothing and only touches `window` in effects, so it is SSR safe.
 */
export const GoogleTagManager = () => {
  const router = useRouter();

  useEffect(() => {
    const pushPageView = (pagePath: string) => {
      gtm.push({ event: "page_view", page_path: pagePath });
    };

    // The page the visitor landed on: its page_view goes first even when a route change starts analytics.
    const landedOn = window.location.pathname;
    // Route changes before the first page_view went out, sent right after it in order.
    const queued: string[] = [];
    let started = false;
    let flushed = false;
    let stop = () => {};
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      flushed = true;
      pushPageView(landedOn);
      for (const path of queued.splice(0)) pushPageView(path);
    };
    const start = () => {
      if (started) return;
      started = true;
      stop = gtm.start();
      analytics.init();
      // Small delay so the container can initialise before the first event; none when the page is being hidden.
      if (document.visibilityState === "hidden") flush();
      else timeoutId = setTimeout(flush, 100);
    };
    // pawlegends.app's "/" is the `/pawlegends` landing (next.config.js), so it defers the same way.
    const cancelDefer = DEFERRED_PATHS.has(pagePathOf(window.location)) ? afterLandingReady(start, window, { waitForIntro: false }) : (start(), () => {});

    const onRouteChange = (pagePath: string) => {
      if (flushed) return pushPageView(pagePath);
      queued.push(pagePath);
      start();
    };
    router.events.on("routeChangeComplete", onRouteChange);

    return () => {
      cancelDefer();
      clearTimeout(timeoutId);
      stop();
      router.events.off("routeChangeComplete", onRouteChange);
    };
  }, [router.events]);

  return null;
};

/**
 * Pushes an event to the GTM dataLayer. A no-op without a container id.
 */
export function trackEvent<T extends EventName>(
  eventName: T,
  params?: TrackEventMap[T]
): void {
  gtm.push({ event: eventName, ...params });
}
