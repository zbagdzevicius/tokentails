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
 * Starts GTM and PostHog on mount for every visitor (see `analytics/gtm.ts`)
 * and pushes `page_view` on route changes. Renders nothing and only touches
 * `window` in effects, so it is SSR safe.
 */
export const GoogleTagManager = () => {
  const router = useRouter();

  useEffect(() => {
    const pushPageView = (pagePath: string) => {
      gtm.push({ event: "page_view", page_path: pagePath });
    };

    const stop = gtm.start();
    analytics.init();

    // Small delay so the container can initialise before the first event.
    const timeoutId = setTimeout(
      () => pushPageView(window.location.pathname),
      100,
    );

    router.events.on("routeChangeComplete", pushPageView);

    return () => {
      clearTimeout(timeoutId);
      stop();
      router.events.off("routeChangeComplete", pushPageView);
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
