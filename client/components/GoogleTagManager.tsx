import { useRouter } from "next/router";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer: any[];
  }
}

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

export const GoogleTagManager = () => {
  const router = useRouter();

  useEffect(() => {
    // Ensure dataLayer is initialized (should already be done in _document.js, but ensure it exists)
    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer || [];
    }

    // Track page views on route changes
    const handleRouteChange = (url: string) => {
      if (typeof window !== "undefined" && window.dataLayer) {
        window.dataLayer.push({
          event: "page_view",
          page_path: url,
        });
      }
    };

    // Track initial page load after a short delay to ensure GTM is loaded
    const trackInitialPageView = () => {
      if (typeof window !== "undefined" && window.dataLayer) {
        window.dataLayer.push({
          event: "page_view",
          page_path: window.location.pathname,
        });
      }
    };

    // Small delay to ensure GTM is fully initialized
    const timeoutId = setTimeout(trackInitialPageView, 100);

    // Listen for route changes
    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      clearTimeout(timeoutId);
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return null;
};

// Utility function to track events via Google Tag Manager dataLayer
export function trackEvent<T extends EventName>(
  eventName: T,
  params?: TrackEventMap[T]
): void {
  if (typeof window !== "undefined") {
    // Ensure dataLayer exists
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      ...params,
    });
  }
}
