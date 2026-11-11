import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { useState } from "react";
import {
  browserTimeZone,
  checkoutErrorLine,
  currencyFor,
  deviceId,
  isAgeBand,
  isEmail,
  PAWLEGENDS_AGE_BANDS,
  priceLabel,
  readAgeBand,
  UNDER_16_MESSAGE,
  writeAgeBand,
  type PawlegendsAgeBand,
  type PawlegendsApi,
} from "./checkout";
import { PAWLEGENDS_TERMS_PATH } from "./flags";

/**
 * The store and Legends Pass purchase sheet (docs/plans/moba/STORE-PASS.md §3, web only, signed-in accounts only).
 * The game posts `purchase-intent{sku}`; this sheet shows the server price (`GET /pawlegends/status`), asks the age
 * band, the email Stripe locks, and the consent (digital items delivered now; the 14-day withdrawal right ends at
 * delivery), shows the spending safeguards, then `POST /pawlegends/checkout/account` (lowercase `accesstoken`) and a
 * full redirect to Stripe Checkout. The game never sees a payment detail. Cosmetic only: nothing changes a match.
 */
const AGE_LABEL: Record<PawlegendsAgeBand, string> = { under16: "Under 16", "16-17": "16 to 17", "18+": "18 or older" };

export const safeguardsText = (currency: "usd" | "eur") => {
  const c = currency === "eur" ? "€" : "$";
  return `Prices include VAT. Under 16 can't buy. Spending limit ${c}30 (age 16 to 17) or ${c}200 (18+) per 30 days.`;
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
  const [band, setBand] = useState<PawlegendsAgeBand | null>(() => readAgeBand());
  const [consent, setConsent] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const buy = async () => {
    if (!band) return setLine("Choose your age first.");
    if (band === "under16") return setLine(UNDER_16_MESSAGE);
    if (!isEmail(email)) return setLine("Enter your email first.");
    if (!consent) return setLine("Tick the box to continue.");
    writeAgeBand(band);
    setBusy(true);
    const result = await api.storeCheckout({ sku, currency, email: email.trim(), ageBand: band, deviceId: deviceId() });
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
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1">Your age</legend>
          {PAWLEGENDS_AGE_BANDS.map((b) => (
            <label key={b} className="flex items-center gap-1">
              <input type="radio" name="pl-age" value={b} checked={band === b} onChange={(e) => isAgeBand(e.target.value) && setBand(e.target.value)} />
              {AGE_LABEL[b]}
            </label>
          ))}
        </fieldset>
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
        <label className="flex items-start gap-2 text-p6">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="pawlegends-store-consent" />
          <span>
            Deliver my items now. I understand I lose the 14-day right to withdraw once they are delivered.{" "}
            <a href={PAWLEGENDS_TERMS_PATH} target="_blank" rel="noopener noreferrer" className="font-bold text-tt-gold-400 underline underline-offset-2">
              Terms and refunds
            </a>
          </span>
        </label>
        <p className="text-p6 opacity-80" data-testid="pawlegends-store-safeguards">
          {safeguardsText(currency)}
        </p>
        {line && <p role="status">{line}</p>}
        <ActionRow>
          <ModalButton variant="primary" icon="check" onClick={() => void buy()} busy={busy} data-testid="pawlegends-store-buy">
            CONTINUE TO PAYMENT
          </ModalButton>
          <ModalButton variant="secondary" icon="close" onClick={() => onClose(false)}>
            CLOSE
          </ModalButton>
        </ActionRow>
      </div>
    </GameModal>
  );
};
