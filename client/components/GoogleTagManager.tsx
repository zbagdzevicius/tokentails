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

/**
 * Starts GTM (`analytics/gtm.ts`, Token Tails' container) and PostHog on mount for every visitor and pushes
 * `page_view` on route changes; the first page_view is the page the visitor landed on.
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
    start();

    const onRouteChange = (pagePath: string) => {
      if (flushed) return pushPageView(pagePath);
      queued.push(pagePath);
      start();
    };
    router.events.on("routeChangeComplete", onRouteChange);

    return () => {
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
