import type { PurchaseContext } from "@/api/stripe-api";
import { TailsCardMini } from "@/components/tailsCard/TailsCardMini";
import { GameModal } from "@/components/ui/GameModal";
import { LoadingState, ModalButton, StatusPill } from "@/components/ui/modal";
import { isPaymentLayer } from "@/components/web3/paymentLayer";
import { useProfile } from "@/context/ProfileContext";
import { invalidateStorefront } from "@/hooks/useStorefront";
import { Tier, type ICat, type IMessage, Prices } from "@/models/cats";
import { EntityType } from "@/models/save";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  deviceId,
  MEET_PERKS,
  PAWLEGENDS_AGE_BANDS,
  PAWLEGENDS_CONSENT_VERSION,
  readAgeBand,
  UNDER_16_MESSAGE,
  writeAgeBand,
  type PawlegendsAgeBand,
} from "./checkout";
import { PAWLEGENDS_PRIVACY_URL, PAWLEGENDS_TERMS_PATH } from "./flags";

const Payment = dynamic(() => import("@/components/web3/Payment").then((module) => module.Payment), {
  ssr: false,
  loading: () => <LoadingState rows={4} label="Loading payment options" className="py-2" />,
});

export const AGE_LABELS: Record<PawlegendsAgeBand, string> = {
  under16: "Under 16",
  "16-17": "16 or 17",
  "18+": "18 or older",
};

/** Re-exported for older imports; the list lives in `checkout.ts` so the terms page can show it too. */
export { MEET_PERKS };

interface PawlegendsCatSheetProps {
  cat: ICat;
  /** The checkout granted the cat (the host tells the game and refreshes the roster at once). */
  onBought?: (got: ICat) => void;
  onClose: (bought: ICat | null) => void;
}

/**
 * "Meet <name>": the Token Tails $5 named-cat checkout, opened from the Pawlegends game (integration plan section 2).
 * Direct purchase only: the cat, its element and its name are on screen before paying, the card is the Common
 * copy every shelter-cat purchase grants, and nothing here is random. No pack link, no `/cats/<id>` link, no
 * `Header`. The age band is asked once per device (Under 16 stops here, with the guardian line); the server checks
 * it again with the 30-day spend cap (`context: 'pawlegends'` on both checkouts).
 *
 * Before the checkout mounts, the sheet shows the terms and privacy links and the EU withdrawal notice, and asks for
 * a required consent tick (deliver now, lose the 14-day withdrawal right on delivery; launch item U5). The tick
 * sends `consentVersion` (the `/pawlegends/terms` version) with the context; the server refuses any other version
 * and records the accepted one with the payment. Unticking removes the checkout again.
 *
 * Web only: the host never opens it in an app build.
 */
export const PawlegendsCatSheet = ({ cat, onBought, onClose }: PawlegendsCatSheetProps) => {
  const [storedBand] = useState(() => readAgeBand());
  const [band, setBand] = useState<PawlegendsAgeBand | null>(storedBand);
  const [processing, setProcessing] = useState(false);
  const [bought, setBought] = useState<ICat | null>(null);
  const [consented, setConsented] = useState(false);
  const { profile, setProfileUpdate } = useProfile();
  const queryClient = useQueryClient();
  const card = useMemo(() => ({ ...cat, tier: Tier.COMMON }) as ICat, [cat]);

  const chooseBand = (value: PawlegendsAgeBand) => {
    // Under 16 locks the question on this device (a later 18+ tap must not unlock the checkout).
    if (band === "under16") return;
    setBand(value);
    writeAgeBand(value);
  };

  const canBuy = !!band && band !== "under16";
  const context: PurchaseContext | null = useMemo(
    () =>
      band && band !== "under16" && consented
        ? { context: "pawlegends", ageBand: band, deviceId: deviceId(), consentVersion: PAWLEGENDS_CONSENT_VERSION }
        : null,
    [band, consented]
  );

  const onSuccess = (response: IMessage) => {
    if (!response.success || !response.cat) return;
    const got = response.cat;
    setProfileUpdate({ cats: [...(profile?.cats || []), got] });
    setBought(got);
    onBought?.(got);
    void invalidateStorefront(queryClient);
  };

  const close = () => onClose(bought);
  const paying = !bought;

  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={bought ? `${bought.name || cat.name} joined your squad` : `Meet ${cat.name}`}
      icon="paw"
      name="pawlegends-cat"
      surface="panel"
      size="md"
      // Stripe's 3DS layer lives outside the dialog; a payment in flight cannot be closed.
      modal={!paying}
      allowOutside={paying ? isPaymentLayer : undefined}
      canClose={!processing}
    >
      <div className="flex flex-col gap-4 font-sans text-p5 text-tt-cream" data-testid="pawlegends-cat-sheet" data-cat={cat._id}>
        <div className="flex items-center gap-4">
          <div className="w-28 shrink-0" data-testid="pawlegends-cat-card">
            <TailsCardMini cat={bought ?? card} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <StatusPill tone="gold" icon="star">
              Common card
            </StatusPill>
            <ul className="flex flex-col gap-1 text-p6 font-semibold leading-snug" data-testid="pawlegends-cat-perks">
              {MEET_PERKS.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
          </div>
        </div>
        {bought ? (
          <div className="flex flex-col items-center gap-3 text-center" data-testid="pawlegends-cat-bought">
            <p className="font-semibold">Back in the lobby, {bought.name || cat.name} is in your squad.</p>
            <ModalButton variant="primary" icon="check" onClick={close}>
              PLAY
            </ModalButton>
          </div>
        ) : (
          <>
            {!storedBand && (
              <fieldset className="flex flex-col gap-2" data-testid="pawlegends-age">
                <legend className="font-bold">How old are you?</legend>
                {PAWLEGENDS_AGE_BANDS.map((value) => (
                  <label key={value} className="flex min-h-[44px] items-center gap-2">
                    <input
                      type="radio"
                      name="pawlegends-age"
                      value={value}
                      checked={band === value}
                      disabled={band === "under16" && value !== "under16"}
                      onChange={() => chooseBand(value)}
                    />
                    {AGE_LABELS[value]}
                  </label>
                ))}
              </fieldset>
            )}
            {band === "under16" && (
              <p role="alert" data-testid="pawlegends-under16">
                {UNDER_16_MESSAGE}
              </p>
            )}
            {canBuy && (
              <div className="flex flex-col gap-2 text-p6 leading-snug" data-testid="pawlegends-cat-legal">
                <p data-testid="pawlegends-withdrawal">
                  {cat.name} is digital content, delivered to your account as soon as the payment goes through. In
                  the EU you can normally cancel an online purchase within 14 days. For digital content that right
                  ends once it is delivered.
                </p>
                <p>
                  Read the{" "}
                  <a href={PAWLEGENDS_TERMS_PATH} target="_blank" rel="noopener noreferrer" className="font-bold text-tt-gold-400 underline underline-offset-4">
                    Terms
                  </a>{" "}
                  and the{" "}
                  <a href={PAWLEGENDS_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-tt-gold-400 underline underline-offset-4">
                    Privacy Policy
                  </a>{" "}
                  before you buy.
                </p>
                <label className="flex min-h-[44px] items-start gap-2 font-semibold">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={consented}
                    disabled={processing}
                    required
                    aria-required="true"
                    data-testid="pawlegends-consent"
                    onChange={(event) => setConsented(event.target.checked)}
                  />
                  <span>
                    I accept the Terms. I want {cat.name} delivered right away, and I understand that I lose my 14-day
                    right of withdrawal once it is delivered.
                  </span>
                </label>
              </div>
            )}
            {context && (
              <div data-testid="pawlegends-cat-payment">
                <Payment
                  price={Prices.shelterCat}
                  entityType={EntityType.CAT}
                  id={cat._id}
                  productName={cat.name}
                  onSuccess={onSuccess}
                  onProcessingChange={setProcessing}
                  purchaseContext={context}
                  onRemove={close}
                  hideMascot
                  compact
                />
              </div>
            )}
            <ModalButton variant="ghost" icon="close" onClick={close} disabled={processing}>
              NOT NOW
            </ModalButton>
          </>
        )}
      </div>
    </GameModal>
  );
};

export default PawlegendsCatSheet;
