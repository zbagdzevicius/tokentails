import { isPaymentLayer } from "@/components/web3/paymentLayer";
import { PixelButton } from "@/components/shared/PixelButton";
import { GameModal } from "@/components/ui/GameModal";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { invalidateStorefront } from "@/hooks/useStorefront";
import { isApp } from "@/models/app";
import { BlessingStatus, ICat, IMessage, Prices } from "@/models/cats";
import { EntityType } from "@/models/save";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";

const Payment = dynamic(() => import("@/components/web3/Payment").then((module) => module.Payment), { ssr: false });

/**
 * Shelter cats bought one by one (docs/API.md "Crypto checkout", SKU `CAT`; Stripe `entityType: CAT`):
 * a basic-tier (COMMON) copy for $5, by card or crypto. Rarer tiers come only from card packs. The
 * server decides what is for sale (an unowned rescue cat of GET /cat/sale whose blessing is not
 * ADOPTED or HEAVEN, and that is not a starter: ShelterCatSaleService.check); this mirrors that rule
 * so the offer only shows where the server would sell.
 *
 * App builds never show it: digital goods there must use store IAP, which is not built (AppCheckoutNotice).
 */

const NOT_FOR_SALE: readonly string[] = [BlessingStatus.ADOPTED, BlessingStatus.HEAVEN];

export function isCatForSale(
  cat: Pick<ICat, "_id" | "owner" | "blessing" | "isStarter" | "isGuestStarter"> | null | undefined
): boolean {
  if (!cat?._id || !/^[0-9a-f]{24}$/i.test(cat._id) || cat.owner || !cat.blessing) return false;
  if (cat.isStarter || cat.isGuestStarter) return false;
  return !NOT_FOR_SALE.includes(String(cat.blessing.status || ""));
}

const idOf = (value: unknown): string =>
  typeof value === "string" ? value : value && typeof value === "object" ? String((value as { _id?: unknown })._id ?? "") : "";

/** The player already holds a copy (same cat, or a copy of its blessing): the server would refuse. */
export function ownsCopy(owned: ICat[] | undefined, cat: Pick<ICat, "_id" | "blessing">): boolean {
  const blessing = idOf(cat.blessing);
  return (owned || []).some(
    (mine) =>
      (!!cat._id && (mine._id === cat._id || idOf((mine as ICat & { sourceCat?: unknown }).sourceCat) === cat._id)) ||
      (!!blessing && idOf(mine.blessing) === blessing)
  );
}

/** The offer under a shelter cat's card: price, tier, and where rarer tiers come from. */
export const ShelterCatOffer = ({ cat, onBuy, bought = false }: { cat: ICat; onBuy: () => void; bought?: boolean }) => {
  const { profile } = useProfile();
  if (isApp || !isCatForSale(cat)) return null;
  const owned = bought || ownsCopy(profile?.cats, cat);
  return (
    <div
      data-testid="shelter-cat-offer"
      className="flex w-[min(84vw,20rem)] flex-col items-center gap-2 rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-b from-tt-night-700/95 to-tt-night-800/95 px-4 py-3 text-center shadow-[0_6px_0_rgb(var(--tt-night-950))]"
    >
      <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950 px-2 font-primary text-p6 uppercase tracking-wide text-tt-gold-400">
        Basic tier · ${Prices.shelterCat}
      </span>
      <p className="font-sans text-p5 text-tt-cream">
        {owned ? `${cat.name} is already in your collection.` : `Get ${cat.name} as a basic-tier card, by card or crypto.`}
      </p>
      <p className="font-sans text-p6 text-tt-cream/75">Rare, Epic and Legendary cards come only from card packs.</p>
      {!owned && <PixelButton text={`BUY FOR $${Prices.shelterCat}`} onClick={onBuy} />}
    </div>
  );
};

/** The checkout for one shelter cat, in its own modal (card or crypto, through Payment). */
export const ShelterCatCheckoutModal = ({ cat, close, onBought }: { cat: ICat; close: () => void; onBought?: () => void }) => {
  const [processing, setProcessing] = useState(false);
  const [bought, setBought] = useState<ICat | null>(null);
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const queryClient = useQueryClient();

  const onSuccess = (response: IMessage) => {
    if (!response.success || !response.cat) return;
    const got = response.cat;
    setProfileUpdate({ cats: [...(profile?.cats || []), got] });
    setBought(got);
    onBought?.();
    toast({ message: `${got.name || cat.name} joined your cats`, img: got.catImg || cat.catImg });
    void invalidateStorefront(queryClient);
  };

  const paying = !bought;
  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={`Buy ${cat.name}`}
      name="shelter-cat-checkout"
      surface="panel"
      size="md"
      layer="modal-nested"
      // Stripe's 3DS layer lives outside the dialog; a payment in flight cannot be closed.
      modal={!paying}
      allowOutside={paying ? isPaymentLayer : undefined}
      canClose={!processing}
    >
      <div data-testid="shelter-cat-checkout" className="flex flex-col items-center gap-6 pb-4 pt-2">
        {bought ? (
          <div data-testid="shelter-cat-bought" className="flex flex-col items-center gap-3 text-center">
            <img src={bought.catImg || cat.catImg} alt="" aria-hidden="true" className="pixelated h-28 w-28 object-contain" />
            <p className="font-primary text-h6 uppercase text-tt-mint">{bought.name || cat.name} is yours</p>
            <p className="font-sans text-p5 text-tt-cream">Basic tier. Find it with your cats.</p>
            <PixelButton text="DONE" onClick={close} />
          </div>
        ) : (
          <>
            <img src={cat.catImg} alt="" aria-hidden="true" className="pixelated h-24 w-24 object-contain" />
            <p className="max-w-sm text-center font-sans text-p5 text-tt-cream/85">
              Basic tier only. Rare, Epic and Legendary cards come only from card packs.
            </p>
            <Payment
              price={Prices.shelterCat}
              entityType={EntityType.CAT}
              id={cat._id}
              productName={`${cat.name} · Basic tier`}
              onSuccess={onSuccess}
              onProcessingChange={setProcessing}
              hideMascot
            />
          </>
        )}
      </div>
    </GameModal>
  );
};

/** Offer and checkout together, for pages that show one shelter cat (the cat details page). */
export const ShelterCatBuy = ({ cat }: { cat: ICat }) => {
  const [open, setOpen] = useState(false);
  const [bought, setBought] = useState(false);
  if (isApp || !isCatForSale(cat)) return null;
  return (
    <>
      <ShelterCatOffer cat={cat} bought={bought} onBuy={() => setOpen(true)} />
      {open && <ShelterCatCheckoutModal cat={cat} close={() => setOpen(false)} onBought={() => setBought(true)} />}
    </>
  );
};
