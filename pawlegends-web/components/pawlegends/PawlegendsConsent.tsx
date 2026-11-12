import { asksForConsent, gtm as defaultGtm, readConsentChoice, type ConsentChoice, type Gtm } from "@/analytics/gtm";
import { afterLandingReady } from "@/components/GoogleTagManager";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Dispatch on `window` to show the bar again (the privacy page's "Change my choice"). */
export const CONSENT_OPEN_EVENT = "pawlegends:consent-open";
export const openConsentChoice = (win: Window = window) => win.dispatchEvent(new Event(CONSENT_OPEN_EVENT));

/** The landings hold the bar until their intro has played (like analytics itself), so it never covers the hero. */
const HELD_PATHS: ReadonlySet<string> = new Set(["/", "/legends"]);

/** Whether to ask (analytics/gtm.ts): a European or unknown time zone. Re-exported for the tests and callers here. */
export { asksForConsent };

const noSubscription = () => () => {};

const buttonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-tt-night-950 px-4 font-sans text-p6 font-bold outline-none focus-visible:ring-4 focus-visible:ring-tt-cream";

interface PawlegendsConsentProps {
  /** The GTM router (tests pass a fake). */
  gtm?: Pick<Gtm, "enabled" | "consentMode" | "setConsent">;
  /** Override the time-zone check (tests). */
  asks?: () => boolean;
}

/**
 * The Paw Legends analytics consent bar (Google Consent Mode v2, analytics/gtm.ts). Shown when the container runs (never
 * in a native WebView), until the visitor chooses. Renders nothing during SSR.
 */
export function PawlegendsConsent({ gtm = defaultGtm, asks = asksForConsent }: PawlegendsConsentProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!gtm.enabled || !gtm.consentMode) return;
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    let cancel = () => {};
    if (!readConsentChoice() && asks()) {
      const show = () => setOpen(true);
      cancel = HELD_PATHS.has(window.location.pathname) ? afterLandingReady(show, window) : (show(), () => {});
    }
    return () => {
      cancel();
      window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
    };
  }, [gtm, asks]);

  // `open` turns true only in an effect, so window exists here and the server HTML never has the bar
  if (!open) return null;

  const choose = (choice: ConsentChoice) => {
    gtm.setConsent(choice);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Analytics cookies"
      data-testid="pawlegends-consent"
      className="fixed left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 flex-col gap-3 rounded-lg border-2 border-tt-night-950 bg-tt-night-900/95 p-3 font-sans text-p6 text-tt-cream shadow-[0_2px_0_rgb(var(--tt-night-950))]"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <p>
        May we use Google Analytics cookies to count visits and see which links bring players? You can change this any
        time on the{" "}
        <Link href="/privacy#web-analytics" className="text-tt-gold-400 underline underline-offset-4">
          privacy page
        </Link>
        .
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" data-testid="pawlegends-consent-deny" onClick={() => choose("denied")} className={`${buttonClass} bg-tt-night-900 text-tt-cream`}>
          No thanks
        </button>
        <button type="button" data-testid="pawlegends-consent-allow" onClick={() => choose("granted")} className={`${buttonClass} bg-tt-gold-400 text-tt-night-950`}>
          Allow
        </button>
      </div>
    </div>
  );
}

/**
 * "Change my choice" on the privacy page: shows the bar again. Only where the bar can run (the Paw Legends container on
 * the web); nothing during SSR or in an app build.
 */
export function ConsentChoiceButton({ gtm = defaultGtm }: Pick<PawlegendsConsentProps, "gtm">) {
  const shown = useSyncExternalStore(
    noSubscription,
    () => gtm.enabled && gtm.consentMode,
    () => false
  );
  if (!shown) return null;
  return (
    <button type="button" data-testid="pawlegends-consent-change" onClick={() => openConsentChoice()} className={`${buttonClass} self-start bg-tt-gold-400 text-tt-night-950`}>
      Change my analytics choice
    </button>
  );
}
