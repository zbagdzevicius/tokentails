import {
  analytics,
  CONSENT_OPEN_EVENT,
  openConsentSettings,
} from "@/analytics";
import { gtm } from "@/analytics/gtm";
import { PixelButton } from "@/components/shared/PixelButton";
import { useEffect, useState } from "react";

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
 * Asks once for analytics consent. Nothing is sent before "Accept". Mount it
 * with `next/dynamic` and `ssr: false`: it reads localStorage on first render.
 */
export const AnalyticsConsentBanner = () => {
  const [isOpen, setIsOpen] = useState(
    () => consentNeeded() && analytics.getConsent() === "unset",
  );

  useEffect(() => {
    if (!consentNeeded()) return;
    const open = () => setIsOpen(true);
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
