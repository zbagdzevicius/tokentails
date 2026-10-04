import { isPaymentLayer } from "@/components/web3/paymentLayer";
import { GameModal } from "@/components/ui/GameModal";
import { LoadingState, ModalButton, ModalSection, ModalStack, StatusPill } from "@/components/ui/modal";
import { nameFont } from "@/lib/glyphs";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { invalidateStorefront } from "@/hooks/useStorefront";
import { isApp } from "@/models/app";
import { BlessingStatus, ICat, IMessage, Prices } from "@/models/cats";
import { EntityType } from "@/models/save";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";

const Payment = dynamic(() => import("@/components/web3/Payment").then((module) => module.Payment), {
  ssr: false,
  // The form's chunk can take a moment: show its shape instead of an empty panel.
  loading: () => <LoadingState rows={4} label="Loading payment options" className="py-2" />,
});

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
  typeof value === "string"
    ? value
    : value && typeof value === "object"
    ? String((value as { _id?: unknown })._id ?? "")
    : "";

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
    <div className="w-[min(84vw,20rem)] bg-tt-night-900 md:w-full">
      <div
        data-testid="shelter-cat-offer"
        data-tone={owned ? "success" : "highlight"}
        className="tt-card flex flex-col items-start gap-2 p-3 md:p-4"
      >
        <div className="flex w-full items-center justify-between gap-2">
          <StatusPill tone="gold" icon="star">
            Common · ${Prices.shelterCat}
          </StatusPill>
          {owned && (
            <StatusPill tone="mint" icon="check">
              Yours
            </StatusPill>
          )}
        </div>
        <p className="font-sans text-p5 font-semibold leading-snug text-tt-cream">
          {owned
            ? `${cat.name} is already in your collection.`
            : `Get ${cat.name} as a Common card, by card or crypto.`}
        </p>
        <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">
          Rare, Epic and Legendary cards come from packs.
        </p>
        {!owned && (
          <ModalButton variant="primary" icon="shopping-bag" fullWidth onClick={onBuy}>
            {`Buy for $${Prices.shelterCat}`}
          </ModalButton>
        )}
      </div>
    </div>
  );
};

/** The checkout for one shelter cat, in its own modal (card or crypto, through Payment). */
export const ShelterCatCheckoutModal = ({
  cat,
  close,
  onBought,
}: {
  cat: ICat;
  close: () => void;
  onBought?: () => void;
}) => {
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
      icon="shopping-bag"
      description={bought ? undefined : "Add this cat to your collection as a Common card, by card or crypto."}
      name="shelter-cat-checkout"
      surface="panel"
      size="md"
      layer="modal-nested"
      // Stripe's 3DS layer lives outside the dialog; a payment in flight cannot be closed.
      modal={!paying}
      allowOutside={paying ? isPaymentLayer : undefined}
      canClose={!processing}
    >
      <div data-testid="shelter-cat-checkout">
        {bought ? (
          <ModalSection tone="success" data-testid="shelter-cat-bought" bodyClassName="items-center text-center">
            <CatPedestal src={bought.catImg || cat.catImg} />
            <p className="font-primary text-h6 uppercase leading-none text-tt-mint">
              {bought.name || cat.name} is yours
            </p>
            <p className="font-sans text-p5 font-semibold text-tt-cream">Common card. Find it in My Pets.</p>
            <ModalButton variant="primary" icon="check" onClick={close}>
              Done
            </ModalButton>
          </ModalSection>
        ) : (
          <ModalStack>
            {/* What you get, once: the name, the tier and the sprite. The price is the checkout's. */}
            <ModalSection tone="highlight" bodyClassName="!flex-row items-center !gap-4 short:!gap-3">
              {/* Landscape phones: no sprite, so the Pay button stays on screen. */}
              <CatPedestal src={cat.catImg} small className="short:hidden" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <p className={`${nameFont(cat.name)} text-p3 uppercase leading-none text-tt-cream`}>{cat.name}</p>
                <StatusPill tone="gold" icon="star">
                  Common card
                </StatusPill>
                <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted short:hidden">
                  Rare, Epic and Legendary come from packs.
                </p>
              </div>
            </ModalSection>
            <Payment
              price={Prices.shelterCat}
              entityType={EntityType.CAT}
              id={cat._id}
              productName={cat.name}
              onSuccess={onSuccess}
              onProcessingChange={setProcessing}
              hideMascot
              compact
            />
          </ModalStack>
        )}
      </div>
    </GameModal>
  );
};

/** The cat's sprite on a soft gold glow, crisp at an integer-ish size. */
const CatPedestal = ({ src, small, className = "" }: { src?: string; small?: boolean; className?: string }) => (
  <span
    aria-hidden="true"
    className={`relative flex shrink-0 items-end justify-center ${small ? "h-24 w-24" : "h-32 w-32"} ${className}`}
    style={{ background: "radial-gradient(closest-side, rgb(var(--tt-gold-400) / 0.25), transparent 75%)" }}
  >
    {src && <img src={src} alt="" className={`pixelated object-contain ${small ? "h-24 w-24" : "h-28 w-28"}`} />}
  </span>
);

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
