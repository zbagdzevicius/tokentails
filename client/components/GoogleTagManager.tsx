import { analytics } from "@/analytics";
import { gtm } from "@/analytics/gtm";
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

/** Fired by the Pawlegends landing (components/pawlegends/landing/motion.js) once its intro has played. */
export const LANDING_READY_EVENT = "pawlegends:landing-ready";
/** The longest a landing waits before analytics starts anyway (ms after mount). */
export const ANALYTICS_DEFER_MAX_MS = 4000;
/**
 * Pages whose first seconds belong to the page: the Pawlegends landing hides its hero until the GSAP intro runs, and
 * GTM's tags (about 470 KB of third-party script) would compete with it for the network and the main thread.
 */
const DEFERRED_PATHS: ReadonlySet<string> = new Set(["/pawlegends"]);

/**
 * Calls `start` once, after the landing says it is ready, the visitor's first tap, key or scroll, or
 * ANALYTICS_DEFER_MAX_MS, whichever comes first, then in an idle moment. Returns a cleanup.
 */
export function afterLandingReady(start: () => void, win: Window = window): () => void {
  let done = false;
  let idleId: number | undefined;
  const events = [LANDING_READY_EVENT, "pointerdown", "keydown", "scroll"] as const;
  const go = () => {
    if (done) return;
    done = true;
    off();
    if (typeof win.requestIdleCallback === "function") idleId = win.requestIdleCallback(start, { timeout: 1000 });
    else start();
  };
  const timer = win.setTimeout(go, ANALYTICS_DEFER_MAX_MS);
  const off = () => {
    win.clearTimeout(timer);
    for (const e of events) win.removeEventListener(e, go);
  };
  for (const e of events) win.addEventListener(e, go, { once: true, passive: true });
  return () => {
    done = true;
    off();
    if (idleId !== undefined) win.cancelIdleCallback?.(idleId);
  };
}

/**
 * Starts GTM and PostHog on mount for every visitor (see `analytics/gtm.ts`)
 * and pushes `page_view` on route changes. On the Pawlegends landing the start
 * waits for its intro (afterLandingReady); a route change starts it at once.
 * Renders nothing and only touches `window` in effects, so it is SSR safe.
 */
export const GoogleTagManager = () => {
  const router = useRouter();

  useEffect(() => {
    const pushPageView = (pagePath: string) => {
      gtm.push({ event: "page_view", page_path: pagePath });
    };

    let started = false;
    let stop = () => {};
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (started) return;
      started = true;
      stop = gtm.start();
      analytics.init();
      // Small delay so the container can initialise before the first event.
      timeoutId = setTimeout(() => pushPageView(window.location.pathname), 100);
    };
    const cancelDefer = DEFERRED_PATHS.has(window.location.pathname) ? afterLandingReady(start) : (start(), () => {});

    // Before the deferred start, a route change starts analytics (its first page_view is the new page).
    const onRouteChange = (pagePath: string) => (started ? pushPageView(pagePath) : start());
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
