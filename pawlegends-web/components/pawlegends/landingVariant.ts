/**
 * The Pawlegends landing A/B test. Two landings link to the same game:
 * - `A`: the vs-screen landing at `/pawlegends` (components/pawlegends/landing);
 * - `B`: the scroll-lane-map landing at `/legends` (components/pawlegends/legends).
 *
 * There is no random split: each URL is one arm, and traffic is split by where it is sent (ads, posts, links).
 * Each landing reports its arm three ways, so a conversion can be attributed to it:
 * 1. on view: `landing_variant_view` in the GTM dataLayer and `pawlegends_landing_view` in PostHog. A view is the same
 *    thing on both arms: the visitor stayed LANDING_VIEW_DWELL_MS on the page, or pressed a play button sooner. It
 *    never waits for a landing's own intro, since the two intros differ in length and a shorter one would count more
 *    short visits as views;
 * 2. on a play-button click: `landing_variant_cta` in the dataLayer and `pawlegends_landing_cta` in PostHog. These
 *    are best effort: the click leaves the page at once, so a push made before GTM or PostHog has loaded can be lost;
 * 3. in the play link itself (`/pawlegends/play?from=<cta>&lv=<arm>`): the game page reads `lv` into its
 *    `pawlegends_open` event (PawlegendsHost) and drops it from the address bar with `from`.
 *
 * Count conversions from `pawlegends_open` with `landing_variant` (3), divided by the views (1), never from the CTA
 * events. Campaign links to an arm carry `utm_*`, never `from` (routes.ts: `?from=` skips the landing).
 */
import { analytics } from "@/analytics";
import { gtm } from "@/analytics/gtm";
import { buildPawlegendsEvent, type LandingVariant } from "@/analytics/pawlegends-events";
import { ANALYTICS_DEFER_MAX_MS } from "@/components/GoogleTagManager";
import { useEffect, type RefObject } from "react";
import { PAWLEGENDS_PLAY_PATH } from "./routes";

export type { LandingVariant };

/** The query key on the play link that names the landing arm. */
export const LANDING_VARIANT_PARAM = "lv";
export const LANDING_VARIANTS: readonly LandingVariant[] = Object.freeze(["A", "B"] as LandingVariant[]);
/** How long a visitor stays on a landing before it counts as a view (ms after mount); the same on both arms. */
export const LANDING_VIEW_DWELL_MS = ANALYTICS_DEFER_MAX_MS;

/** A play link from landing arm `variant`; `from` feeds `pawlegends_open {from}` (`^[a-z0-9_-]{1,24}$`). */
export function variantPlayHref(from: string, variant: LandingVariant): string {
  return `${PAWLEGENDS_PLAY_PATH}?from=${encodeURIComponent(from)}&${LANDING_VARIANT_PARAM}=${variant}`;
}

/** The landing arm a play page URL came from (`?lv=A` / `?lv=B`), or null. Anything else is ignored. */
export function landingVariantOf(search: string): LandingVariant | null {
  let v: string | null = null;
  try {
    v = new URLSearchParams(search).get(LANDING_VARIANT_PARAM);
  } catch {
    return null;
  }
  const up = v ? v.toUpperCase() : "";
  return (LANDING_VARIANTS as readonly string[]).includes(up) ? (up as LandingVariant) : null;
}

/** The landing was seen: one dataLayer push and one PostHog event. */
export function trackLandingView(variant: LandingVariant, path: string): void {
  gtm.push({ event: "landing_variant_view", landing_variant: variant, landing_path: path });
  analytics.track(buildPawlegendsEvent("pawlegends_landing_view", { landing_variant: variant }));
}

/** A play button (or the App Store badge, `cta` `appstore_*`) on the landing was pressed. */
export function trackLandingCta(variant: LandingVariant, cta: string, path: string): void {
  gtm.push({ event: "landing_variant_cta", landing_variant: variant, landing_path: path, cta });
  // the same click under a plain name for GTM triggers: the App Store badge or a play button
  gtm.push({
    event: cta.startsWith("appstore_") ? "pawlegends_app_store_click" : "pawlegends_play_click",
    landing_variant: variant,
    landing_path: path,
    cta,
  });
  analytics.track(buildPawlegendsEvent("pawlegends_landing_cta", { landing_variant: variant, cta }));
}

/** The `from` tag of a landing play link (`data-cta`), or null for any other click. */
export function ctaOf(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest("a[data-cta]") : null;
  const cta = el?.getAttribute("data-cta") ?? "";
  return /^[a-z0-9_-]{1,24}$/.test(cta) ? cta : null;
}

/**
 * Reports the landing arm on view and on every play click inside `rootRef`. The view goes out after a fixed dwell
 * (LANDING_VIEW_DWELL_MS, which is also when the deferred analytics start at the latest), or just before the first
 * play click when that comes sooner, so both arms count a view by the same rule.
 */
export function useLandingVariant(rootRef: RefObject<HTMLElement | null>, variant: LandingVariant): void {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const path = window.location.pathname;
    let viewed = false;
    const view = () => {
      if (viewed) return;
      viewed = true;
      clearTimeout(timer);
      trackLandingView(variant, path);
    };
    const timer = setTimeout(view, LANDING_VIEW_DWELL_MS);
    const onClick = (e: MouseEvent) => {
      const cta = ctaOf(e.target);
      if (!cta) return;
      view();
      trackLandingCta(variant, cta, path);
    };
    el.addEventListener("click", onClick);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("click", onClick);
    };
  }, [rootRef, variant]);
}
