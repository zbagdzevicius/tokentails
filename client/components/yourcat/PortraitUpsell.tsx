import { analytics } from "@/analytics";
import { buildGrowthEvent } from "@/analytics/growth-events";
import { YOURCAT_API, YourcatRequestError } from "@/api/yourcat-api";
import { trackEvent } from "@/components/GoogleTagManager";
import type { YourcatPortraitStyle, YourcatStatusView, YourcatView } from "@/models/yourcat";
import { useState } from "react";
import { ERROR_TEXT, formatPrice, PORTRAIT_STYLES, S5 } from "./copy";
import { ALERT, BODY, CAPTION, GOLD_BUTTON, SUBTITLE } from "./ui";

export interface PortraitUpsellProps {
  record: YourcatView;
  name: string;
  portrait: YourcatStatusView["portrait"];
  /** 409 PORTRAIT_EXISTS: the page reloads the record and shows that order's state. */
  onExists: () => void;
  /** Navigates to Stripe Checkout (window.location.assign in the page). */
  navigate?: (url: string) => void;
}

/**
 * S5 "HD portrait upsell": web only, below the share block after a visible gap, never next to the
 * Share button or the Pink Paw panel. The price comes from `GET /yourcat/status`; nothing is painted
 * before payment.
 */
export function PortraitUpsell({ record, name, portrait, onExists, navigate }: PortraitUpsellProps) {
  const [style, setStyle] = useState<YourcatPortraitStyle>(
    (portrait.styles.find((value) => PORTRAIT_STYLES.some((item) => item.id === value)) as YourcatPortraitStyle) || "highness",
  );
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = formatPrice(portrait.priceCents, portrait.currency);
  const styles = PORTRAIT_STYLES.filter((item) => portrait.styles.length === 0 || portrait.styles.includes(item.id));

  const checkout = async () => {
    setOpening(true);
    setError(null);
    try {
      const view = await YOURCAT_API.portraitCheckout(record.id, style);
      analytics.track(
        buildGrowthEvent("portrait_checkout_started", {
          surface: "yourcat",
          style,
          priceCents: portrait.priceCents,
          currency: portrait.currency,
        }),
      );
      trackEvent("begin_checkout", {
        currency: portrait.currency,
        value: portrait.priceCents / 100,
        item_name: "HD portrait",
        item_id: `portrait-digital-${style}`,
      });
      (navigate ?? ((url: string) => window.location.assign(url)))(view.checkoutUrl);
    } catch (caught) {
      setOpening(false);
      const code = caught instanceof YourcatRequestError ? caught.code : null;
      if (code === "YOURCAT_PORTRAIT_EXISTS") {
        setError(S5.exists);
        onExists();
      } else if (code === "YOURCAT_PHOTO_EXPIRED") setError(S5.photoExpired);
      else if (code === "YOURCAT_PORTRAIT_DISABLED") setError(S5.unavailable);
      else if (caught instanceof YourcatRequestError && caught.kind === "rate-limited") setError(ERROR_TEXT.burst);
      else setError(ERROR_TEXT.generic);
    }
  };

  return (
    <section
      aria-labelledby="yourcat-upsell-title"
      className="mt-24 flex w-full flex-col gap-4 border-t-2 border-tt-cream/30 pt-12"
      data-testid="yourcat-upsell"
    >
      <h2 id="yourcat-upsell-title" className={SUBTITLE}>
        {S5.title(name)}
      </h2>
      <p className={BODY}>{S5.body(name, price)}</p>
      <fieldset>
        <legend className="mb-2 text-p5 md:text-p4 text-tt-cream">{S5.styleLegend}</legend>
        <div role="radiogroup" aria-label={S5.styleLegend} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {styles.map((item) => {
            const checked = item.id === style;
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-2 text-p5 text-tt-cream focus-within:outline focus-within:outline-2 focus-within:outline-tt-gold-400 ${
                  checked ? "border-tt-gold-400 bg-tt-night-600" : "border-tt-cream/30 bg-tt-night-800/70"
                }`}
              >
                <input
                  type="radio"
                  name="yourcat-portrait-style"
                  value={item.id}
                  checked={checked}
                  onChange={() => setStyle(item.id)}
                  className="sr-only"
                />
                <img src={item.image} alt={S5.styleAlt(item.label)} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button type="button" className={`${GOLD_BUTTON} self-start`} disabled={opening} onClick={checkout}>
        {opening ? S5.opening : S5.button(price)}
      </button>
      {error && (
        <p className={ALERT} role="alert">
          {error}
        </p>
      )}
      <p className={CAPTION}>{S5.finePrint}</p>
    </section>
  );
}
