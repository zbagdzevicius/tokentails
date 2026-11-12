import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { useState } from "react";
import { browserTimeZone, checkoutErrorLine, currencyFor, deviceId, isEmail, priceLabel, type PawlegendsApi } from "./checkout";
import { PAWLEGENDS_TERMS_PATH } from "./flags";

/**
 * The store, champion and Legends Pass purchase sheet (docs/plans/moba/STORE-PASS.md §3, web only, signed-in accounts
 * only). The game posts `purchase-intent{sku}`; this sheet shows the server price (`GET /pawlegends/status`) and the
 * email Stripe locks, then `POST /pawlegends/checkout/account` (lowercase `accesstoken`) and a full redirect to Stripe
 * Checkout. The game never sees a payment detail. Cosmetic only: nothing changes a match.
 *
 * No age question and no consent box (founder, Nov 12). The purchase button is the consent: it reads "Buy now ·
 * delivered instantly" and the line right under it says the 14-day withdrawal right ends at delivery, so pressing it
 * is the express request for delivery now and the acknowledgement EU law asks for (Directive 2011/83/EU art. 16(m)).
 * Only that press sends `consent: true`; the server refuses a store checkout without it and records the time.
 */

/** The line under the purchase button: what pressing it agrees to. */
export const CONSENT_LINE = "Delivered right away, so the 14-day withdrawal right ends at delivery.";
export const BUY_LABEL = "Buy now · delivered instantly";

export const safeguardsText = (currency: "usd" | "eur") => {
  const c = currency === "eur" ? "€" : "$";
  return `Prices include VAT. Spending limit ${c}30 per 30 days (${c}200 if you told us earlier you are 18 or older).`;
};

export const PawlegendsStoreSheet = ({
  api,
  sku,
  label,
  cents,
  initialEmail,
  go,
  onClose,
}: {
  api: PawlegendsApi;
  sku: string;
  label: string;
  cents: { usd: number; eur: number };
  initialEmail: string;
  go: (url: string) => void;
  onClose: (bought: boolean) => void;
}) => {
  const currency = currencyFor(browserTimeZone());
  const [email, setEmail] = useState(initialEmail);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const buy = async () => {
    if (!isEmail(email)) return setLine("Enter your email first.");
    setBusy(true);
    // the press of this button is the consent (CONSENT_LINE sits right under it)
    const result = await api.storeCheckout({ sku, currency, email: email.trim(), deviceId: deviceId(), consent: true });
    setBusy(false);
    if (result.ok && result.body) return go(result.body.url);
    setLine(result.code === "PAWLEGENDS_SIGN_IN" ? "Sign in to buy." : checkoutErrorLine(result));
  };
  return (
    <GameModal open onOpenChange={(open) => !open && onClose(false)} title={label} icon="paw" size="sm" surface="panel" name="pawlegends-store">
      <div className="flex flex-col gap-3 font-sans text-p5 text-tt-cream" data-testid="pawlegends-store-sheet" data-sku={sku}>
        <p className="font-semibold" data-testid="pawlegends-store-price">
          {priceLabel(cents[currency], currency)} · cosmetic only, nothing here changes a match
        </p>
        <label className="flex flex-col gap-1">
          <span>Email for the receipt</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] w-full rounded-md border-2 border-tt-night-950 bg-tt-cream px-3 font-sans text-p5 text-tt-night-950 outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
            data-testid="pawlegends-store-email"
          />
        </label>
        {line && <p role="status">{line}</p>}
        <ActionRow>
          <ModalButton
            variant="primary"
            icon="check"
            onClick={() => void buy()}
            busy={busy}
            data-testid="pawlegends-store-buy"
            aria-describedby="pawlegends-store-consent-line"
          >
            {BUY_LABEL}
          </ModalButton>
        </ActionRow>
        {/* right under the button, so it is read with it: pressing the button is the consent */}
        <p id="pawlegends-store-consent-line" className="-mt-1 text-p6" data-testid="pawlegends-store-consent-line">
          {CONSENT_LINE}{" "}
          <a href={PAWLEGENDS_TERMS_PATH} target="_blank" rel="noopener noreferrer" className="font-bold text-tt-gold-400 underline underline-offset-2">
            Terms and refunds
          </a>
        </p>
        <p className="text-p6 opacity-80" data-testid="pawlegends-store-safeguards">
          {safeguardsText(currency)}
        </p>
        <ActionRow>
          <ModalButton variant="secondary" icon="close" onClick={() => onClose(false)}>
            CLOSE
          </ModalButton>
        </ActionRow>
      </div>
    </GameModal>
  );
};
