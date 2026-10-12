import {
  analytics,
  CONSENT_OPEN_EVENT,
  openConsentSettings,
} from "@/analytics";
import { gtm } from "@/analytics/gtm";
import { PixelButton } from "@/components/shared/PixelButton";
import { useEffect, useId, useState } from "react";

const PRIVACY_POLICY_URL =
  "https://docs.tokentails.com/community-and-social-impact/privacy-policy";

/**
 * True when this build sends anything after consent: PostHog (`NEXT_PUBLIC_POSTHOG_KEY`) or Google
 * Tag Manager (`NEXT_PUBLIC_GTM_ID`). Both wait for the same choice (`analytics/gtm.ts`), so a build
 * with only one of them still has to ask.
 */
const consentNeeded = () => analytics.enabled || gtm.enabled;

/**
 * The banner text names what "Accept" turns on in this build, and nothing that is off.
 * Exported for __test__/analytics-consent-banner.test.tsx.
 */
export const consentCopy = (
  posthogOn: boolean,
  gtmOn: boolean,
): { lead: string; details: string[] } => {
  const details: string[] = [];
  if (posthogOn) {
    // PostHog receives the core catalog (`shared/analytics-core.ts`: runs, sign-in, onboarding, scrubbed
    // errors) and the /yourcat growth events (`analytics/growth-events.ts`: upload, share, portrait
    // checkout and payment; `upload_started` carries the incoming UTM tags). Name all of it here.
    details.push(
      "We count game starts and finishes, app errors, and the steps of signing in, picking a starter cat, making your cat and buying a portrait, with the link that brought you here. No photo, name or email is sent, and it never touches your scores.",
    );
  }
  if (gtmOn) {
    details.push(
      "We load Google Tag Manager, which sends page views and the portrait shop steps (portrait viewed, added to cart, checkout started, purchase) to Google Analytics. Google Analytics sets cookies in this browser to do that.",
    );
  }
  return {
    lead: "Can we measure how Token Tails is used, to make it better?",
    details,
  };
};

/**
 * "default" is the full bottom card used on every page. "compact" is the small chip /yourcat puts in
 * its own header, next to the logo (polish §15): it is part of the header, not a layer over the page,
 * so it never covers a button, a link or a field on any screen (S1, the cap screen, the manual pick,
 * S3) at any width. Two short rows on phones (the question; Details, No thanks and Accept, 28 px
 * targets), one row from xl. The full text, the Privacy Policy and the current choice open under it behind "Details"
 * (and open by themselves when the chip is reopened from the settings link). Same consent semantics:
 * same stored choice, same Accept and No thanks, nothing sent before Accept. The host places it: the
 * variant has no position of its own.
 */
export type ConsentBannerVariant = "default" | "compact";

/** The compact chip's short question on phones; the full `consentCopy` lead shows from md up. */
export const COMPACT_LEAD_SHORT = "Can we measure how the game is used?";

/**
 * Asks once for analytics consent. Nothing is sent before "Accept". Mount it
 * with `next/dynamic` and `ssr: false`: it reads localStorage on first render.
 */
export const AnalyticsConsentBanner = ({
  variant = "default",
}: {
  variant?: ConsentBannerVariant;
} = {}) => {
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(
    () => analytics.getConsent() !== "unset",
  );
  const [isOpen, setIsOpen] = useState(
    () => consentNeeded() && analytics.getConsent() === "unset",
  );

  useEffect(() => {
    if (!consentNeeded()) return;
    const open = () => {
      setIsOpen(true);
      // Reopened from the settings link: show the current choice and the full text at once.
      setDetailsOpen(analytics.getConsent() !== "unset");
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  if (!isOpen) return null;

  const choose = (state: "granted" | "denied") => {
    void analytics.setConsent(state);
    setIsOpen(false);
  };

  const consent = analytics.getConsent();
  const copy = consentCopy(analytics.enabled, gtm.enabled);

  if (variant === "compact") {
    const button =
      "min-h-7 shrink-0 rounded-lg border-2 px-2.5 leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream md:min-h-9 md:px-3";
    return (
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Analytics consent"
        data-variant="compact"
        data-testid="analytics-consent-compact"
        className="relative min-w-0 font-secondary text-p5 tracking-wide text-tt-cream"
        onKeyDown={(event) => {
          if (event.key === "Escape" && detailsOpen) setDetailsOpen(false);
        }}
      >
        {/* One grid, three areas: the question (q), Details (d) and the two choices (b). Phones: q
            on top, d and b under it (54 px, inside the 72 px header). md: q and d, then b. xl: one row. */}
        <div
          className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800/95 px-2 py-0.5 shadow-[0_3px_0_rgb(var(--tt-night-950))] [grid-template-areas:'q_q'_'d_b'] md:gap-y-1 md:py-1 md:[grid-template-areas:'q_d'_'b_b'] xl:grid-cols-[auto_auto_auto] xl:gap-x-3 xl:px-3 xl:[grid-template-areas:'q_d_b']"
          data-testid="analytics-consent-compact-chip"
        >
          <p className="min-w-0 leading-[1.1] [grid-area:q]">
            <span className="md:hidden">{COMPACT_LEAD_SHORT}</span>
            <span className="hidden md:inline">{copy.lead}</span>
          </p>
          <button
            type="button"
            className="min-h-7 justify-self-start text-tt-lilac underline underline-offset-2 [grid-area:d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((v) => !v)}
          >
            {detailsOpen ? "Less" : "Details"}
          </button>
          <div className="flex justify-end gap-1.5 [grid-area:b]">
            <button
              type="button"
              className={`${button} border-tt-night-500 text-tt-cream hover:bg-tt-night-700`}
              onClick={() => choose("denied")}
            >
              No thanks
            </button>
            <button
              type="button"
              className={`${button} border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink hover:brightness-105`}
              onClick={() => choose("granted")}
            >
              Accept
            </button>
          </div>
        </div>
        {/* Opens under the chip on request, over the sky, never under the header's own edge. */}
        <div
          id={detailsId}
          hidden={!detailsOpen}
          className="absolute right-0 top-full z-10 mt-2 max-h-[min(60svh,22rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800 p-3 font-sans text-p6 leading-snug tracking-normal text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950))]"
          data-testid="analytics-consent-compact-details"
        >
          <p>
            {copy.details.join(" ")} Nothing is sent before you accept,
            and you can change this any time in your profile.{" "}
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-tt-lilac underline"
            >
              Privacy Policy
            </a>
          </p>
          {consent !== "unset" && (
            <p className="mt-1 text-tt-muted">
              Current choice:{" "}
              {consent === "granted" ? "allowed" : "not allowed"}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 pb-safe"
    >
      <div className="max-w-xl w-full rounded-xl border-4 border-tt-cream bg-yellow-50 shadow-lg p-4 font-secondary text-p5 text-tt-gold-ink">
        <p>
          {copy.lead} {copy.details.join(" ")} Nothing is sent before you
          accept, and you can change this any time in your profile.{" "}
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            Privacy Policy
          </a>
        </p>
        {consent !== "unset" && (
          <p className="mt-1 text-p6">
            Current choice: {consent === "granted" ? "allowed" : "not allowed"}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <PixelButton
            size="sm"
            text="NO THANKS"
            onClick={() => choose("denied")}
          />
          <PixelButton size="sm" text="ACCEPT" onClick={() => choose("granted")} />
        </div>
      </div>
    </div>
  );
};

/** Reopens the banner so the player can change or revoke consent. */
export const AnalyticsSettingsButton = () => {
  if (!consentNeeded()) return null;
  return (
    <PixelButton size="sm" text="ANALYTICS" onClick={openConsentSettings} />
  );
};

/** Text link variant for footers. */
export const AnalyticsSettingsLink = ({
  className = "text-blue-700",
}: {
  className?: string;
}) => {
  if (!consentNeeded()) return null;
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      Analytics settings
    </button>
  );
};

export default AnalyticsConsentBanner;
