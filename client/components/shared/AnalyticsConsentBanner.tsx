import {
  analytics,
  CONSENT_OPEN_EVENT,
  openConsentSettings,
} from "@/analytics";
import { PixelButton } from "@/components/shared/PixelButton";
import { useEffect, useState } from "react";

const PRIVACY_POLICY_URL =
  "https://docs.tokentails.com/community-and-social-impact/privacy-policy";

/**
 * Asks once for analytics consent. Nothing is sent before "Accept". Mount it
 * with `next/dynamic` and `ssr: false`: it reads localStorage on first render.
 */
export const AnalyticsConsentBanner = () => {
  const [isOpen, setIsOpen] = useState(
    () => analytics.enabled && analytics.getConsent() === "unset",
  );

  useEffect(() => {
    if (!analytics.enabled) return;
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

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 pb-safe"
    >
      <div className="max-w-xl w-full rounded-xl border-4 border-yellow-300 bg-yellow-50 shadow-lg p-4 font-secondary text-p5 text-yellow-900">
        <p>
          Can we count game starts and finishes to make Token Tails better? It
          is anonymous: no email, name or wallet, and it never touches your
          scores. You can change this any time in your profile.{" "}
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
            isSmall
            text="NO THANKS"
            onClick={() => choose("denied")}
          />
          <PixelButton isSmall text="ACCEPT" onClick={() => choose("granted")} />
        </div>
      </div>
    </div>
  );
};

/** Reopens the banner so the player can change or revoke consent. */
export const AnalyticsSettingsButton = () => {
  if (!analytics.enabled) return null;
  return (
    <PixelButton isSmall text="ANALYTICS" onClick={openConsentSettings} />
  );
};

/** Text link variant for footers. */
export const AnalyticsSettingsLink = ({
  className = "text-blue-700",
}: {
  className?: string;
}) => {
  if (!analytics.enabled) return null;
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      Analytics settings
    </button>
  );
};

export default AnalyticsConsentBanner;
