/**
 * The Pawlegends landing A/B test. Two landings link to the same game:
 * - `A`: the vs-screen landing at `/pawlegends` (components/pawlegends/landing);
 * - `B`: the scroll-lane-map landing at `/legends` (components/pawlegends/legends).
 *
 * There is no random split: each URL is one arm, and traffic is split by where it is sent (ads, posts, links).
 * Each landing reports its arm three ways, so a conversion can be attributed to it:
 * 1. on view (after its intro, with the deferred analytics): `landing_variant_view` in the GTM dataLayer and
 *    `pawlegends_landing_view` in PostHog;
 * 2. on a play-button click: `landing_variant_cta` in the dataLayer and `pawlegends_landing_cta` in PostHog;
 * 3. in the play link itself (`/pawlegends/play?from=<cta>&lv=<arm>`): the game page reads `lv` into its
 *    `pawlegends_open` event (PawlegendsHost) and drops it from the address bar with `from`.
 */
import { analytics } from "@/analytics";
import { gtm } from "@/analytics/gtm";
import { buildPawlegendsEvent, type LandingVariant } from "@/analytics/pawlegends-events";
import { afterLandingReady } from "@/components/GoogleTagManager";
import { useEffect, type RefObject } from "react";
import { PAWLEGENDS_PLAY_PATH } from "./routes";

export type { LandingVariant };

/** The query key on the play link that names the landing arm. */
export const LANDING_VARIANT_PARAM = "lv";
export const LANDING_VARIANTS: readonly LandingVariant[] = Object.freeze(["A", "B"] as LandingVariant[]);

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

/** A play button on the landing was pressed. */
export function trackLandingCta(variant: LandingVariant, cta: string, path: string): void {
  gtm.push({ event: "landing_variant_cta", landing_variant: variant, landing_path: path, cta });
  analytics.track(buildPawlegendsEvent("pawlegends_landing_cta", { landing_variant: variant, cta }));
}

/** The `from` tag of a landing play link (`data-cta`), or null for any other click. */
export function ctaOf(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest("a[data-cta]") : null;
  const cta = el?.getAttribute("data-cta") ?? "";
  return /^[a-z0-9_-]{1,24}$/.test(cta) ? cta : null;
}

/**
 * Reports the landing arm on view and on every play click inside `rootRef`. The view waits for the landing's intro
 * (afterLandingReady, like GTM itself on these pages), since a dataLayer push loads GTM at once.
 */
export function useLandingVariant(rootRef: RefObject<HTMLElement | null>, variant: LandingVariant): void {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const path = window.location.pathname;
    const cancelView = afterLandingReady(() => trackLandingView(variant, path));
    const onClick = (e: MouseEvent) => {
      const cta = ctaOf(e.target);
      if (cta) trackLandingCta(variant, cta, path);
    };
    el.addEventListener("click", onClick);
    return () => {
      cancelView();
      el.removeEventListener("click", onClick);
    };
  }, [rootRef, variant]);
}
