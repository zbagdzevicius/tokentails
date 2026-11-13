import { GameModal } from "@/components/ui/GameModal";
import { ActionRow, ModalButton } from "@/components/ui/modal";
import { useEffect, useState } from "react";
import {
  browserTimeZone,
  checkoutErrorLine,
  creatorCodeOf,
  currencyFor,
  deviceId,
  isEmail,
  priceLabel,
  type GrowthCheckout,
  type PawlegendsApi,
} from "./checkout";
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
 *
 * Growth (backend `pawlegends/growth`): before the account's first order the sheet offers a first-purchase gift, a
 * fixed choice of 5 Rare coats (no chance involved), granted once by the webhook when the order is paid. A creator code
 * field credits a creator (checked as typed; it then applies to this account's purchases for 30 days). Web only: the
 * apps never open this sheet.
 */

/** Names of the gift coats (the backend's FIRST_GIFT_COATS); any other id is named from its parts. */
const GIFT_NAMES: Readonly<Record<string, string>> = {
  "coat.clem.store_calico": "Clem · Patchwork Calico",
  "coat.pixel.store_leopard": "Pixel · Leopard",
  "coat.duchess.store_blue_point": "Duchess · Blue Point",
  "coat.brutus.store_brindle": "Brutus · Brindle",
  "coat.rocket.store_tiger": "Rocket · Tiger Brindle",
};
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
export const giftName = (id: string): string => {
  if (GIFT_NAMES[id]) return GIFT_NAMES[id];
  const [, hero = "", rest = ""] = id.split(".");
  return `${cap(hero)} · ${rest.replace(/^store_/, "").split("_").map(cap).join(" ")}`;
};

const CAT_SET = ["clem", "sage", "meatball", "pixel", "duchess", "stilts"];
const DOG_SET = ["brutus", "cacklejaw", "nugget", "marshmallow", "bravo", "chili"];
/** Whether the SKU being bought already contains this coat (then it cannot be the gift). */
export function skuHasCoat(sku: string, coatId: string): boolean {
  const hero = coatId.split(".")[1] ?? "";
  if (sku === "pl_set_cats_s1") return CAT_SET.includes(hero);
  if (sku === "pl_set_dogs_s1") return DOG_SET.includes(hero);
  const m = /^pl_coat_([a-z]+)_([a-z_]+)$/.exec(sku);
  return !!m && coatId === `coat.${m[1]}.store_${m[2]}`;
}

/** The gift coats the buyer may pick for this SKU (owned ones and ones in this order cannot be). */
export const giftChoices = (growth: GrowthCheckout | null, sku: string) =>
  growth?.gift.eligible ? growth.gift.coats.map((c) => ({ ...c, blocked: c.owned || skuHasCoat(sku, c.id) })) : [];

const inputClass =
  "min-h-[44px] w-full rounded-md border-2 border-tt-night-950 bg-tt-cream px-3 font-sans text-p5 text-tt-night-950 outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400";

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
  const [growth, setGrowth] = useState<GrowthCheckout | null>(null);
  const [gift, setGift] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeLine, setCodeLine] = useState<string | null>(null);
  const loadGrowth = () => {
    // a test double or an older host may leave the growth routes out: the sheet then sells as before
    if (typeof api.growthCheckout !== "function") return () => undefined;
    let live = true;
    void api
      .growthCheckout()
      .then((r) => {
        if (!live || !r.ok || !r.body) return;
        setGrowth(r.body);
        const first = giftChoices(r.body, sku).find((c) => !c.blocked);
        setGift(first ? first.id : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  };
  useEffect(loadGrowth, [api, sku]);
  const choices = giftChoices(growth, sku);
  const checkCode = async () => {
    const typed = code.trim();
    if (!typed) return setCodeLine(null);
    const normal = creatorCodeOf(typed);
    if (!normal || typeof api.creator !== "function") return setCodeLine("That is not a creator code.");
    const r = await api.creator(normal);
    setCodeLine(r.ok && r.body ? `Supporting ${r.body.name}` : r.status === 404 || r.status === 400 ? "That is not a creator code." : null);
  };
  const buy = async () => {
    if (!isEmail(email)) return setLine("Enter your email first.");
    const creatorCode = code.trim() ? creatorCodeOf(code.trim()) : null;
    if (code.trim() && !creatorCode) return setCodeLine("That is not a creator code.");
    setBusy(true);
    // the press of this button is the consent (CONSENT_LINE sits right under it)
    const result = await api.storeCheckout({
      sku,
      currency,
      email: email.trim(),
      deviceId: deviceId(),
      consent: true,
      ...(creatorCode ? { creatorCode } : {}),
      ...(gift && choices.some((c) => c.id === gift && !c.blocked) ? { giftCoat: gift } : {}),
    });
    setBusy(false);
    if (result.ok && result.body) return go(result.body.url);
    // the offer moved (another order was paid meanwhile): read it again
    if (result.code === "PAWLEGENDS_GIFT_UNAVAILABLE") loadGrowth();
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
            className={inputClass}
            data-testid="pawlegends-store-email"
          />
        </label>
        {choices.length > 0 && (
          <fieldset className="flex flex-col gap-2 rounded-md border-2 border-tt-gold-400 p-2" data-testid="pawlegends-store-gift">
            <legend className="px-1 font-bold text-tt-gold-400">First purchase gift: pick 1 Rare coat</legend>
            <div role="radiogroup" aria-label="First purchase gift coat" className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={gift === c.id}
                  disabled={c.blocked}
                  onClick={() => setGift(c.id)}
                  data-testid="pawlegends-store-gift-coat"
                  data-coat={c.id}
                  className={`min-h-[44px] rounded-md border-2 border-tt-night-950 px-3 text-p6 font-bold outline-none focus-visible:ring-4 focus-visible:ring-tt-cream disabled:opacity-40 ${
                    gift === c.id ? "bg-tt-gold-400 text-tt-night-950" : "bg-tt-night-900 text-tt-cream"
                  }`}
                >
                  {giftName(c.id)}
                  {c.owned ? " (owned)" : ""}
                </button>
              ))}
            </div>
            <p className="text-p6 opacity-80">Added to this order for free, once. A fixed choice: no chance involved.</p>
          </fieldset>
        )}
        {growth?.creator && !codeOpen ? (
          <p className="text-p6" data-testid="pawlegends-store-creator-linked">
            Supporting {growth.creator.name} (creator code {growth.creator.code}).{" "}
            <button type="button" className="font-bold text-tt-gold-400 underline underline-offset-2" onClick={() => setCodeOpen(true)}>
              Change
            </button>
          </p>
        ) : codeOpen ? (
          <label className="flex flex-col gap-1">
            <span>Creator code (optional)</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={24}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeLine(null);
              }}
              onBlur={() => void checkCode()}
              className={inputClass}
              data-testid="pawlegends-store-creator"
            />
            {codeLine && (
              <span role="status" className="text-p6" data-testid="pawlegends-store-creator-line">
                {codeLine}
              </span>
            )}
          </label>
        ) : (
          <button
            type="button"
            className="self-start text-p6 font-bold text-tt-gold-400 underline underline-offset-2"
            onClick={() => setCodeOpen(true)}
            data-testid="pawlegends-store-creator-open"
          >
            Have a creator code?
          </button>
        )}
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
