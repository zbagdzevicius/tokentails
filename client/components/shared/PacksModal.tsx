import { GameModal } from "@/components/ui/GameModal";
import { ART_PANEL_FULL_WIDTH, ART_PANEL_MAX_HEIGHT } from "@/components/shared/WheelModal";
import { useAccountAction } from "@/hooks/useAccountAction";
import { LegendaryPrice } from "@/components/shared/LegendaryPrice";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { LoadingState, ModalButton, StatusPill } from "@/components/ui/modal";
import { TailsCardPack } from "@/components/tailsCard/TailsCardPack";
import { AppCheckoutNotice } from "@/components/web3/AppCheckoutNotice";
import { isPaymentLayer } from "@/components/web3/paymentLayer";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { isApp } from "@/models/app";
import { useToast } from "@/context/ToastContext";
import { ICat, IMessage } from "@/models/cats";
import { isLegendaryPromoActive, PACK_ODDS, packPriceUsd, PackType } from "@/models/order";
import { EntityType } from "@/models/save";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { useId, useState } from "react";

const Payment = dynamic(() => import("@/components/web3/Payment").then((module) => module.Payment), {
  ssr: false,
  // The form's chunk can take a moment: show its shape instead of an empty card.
  loading: () => (
    <LoadingState rows={4} label="Loading payment options" className="mx-auto w-full max-w-[420px] py-4" />
  ),
});

export const packImages = {
  [PackType.STARTER]: cdnFile(`cards/packs/${PackType.STARTER}.webp`),
  [PackType.INFLUENCER]: cdnFile(`cards/packs/${PackType.INFLUENCER}.webp`),
  [PackType.LEGENDARY]: cdnFile(`cards/packs/${PackType.LEGENDARY}.webp`),
};

/**
 * The four card tiers and where each one drops. Only what the pack odds (PACK_ODDS, the same
 * table as the backend's getPackCardTier) back up: no supply numbers, which nothing enforces.
 * The shard is the tier's mark in My Pets, so a player sees the same sign in both places.
 */
const RARITIES = [
  { tier: "COMMON", name: "Common", ink: "text-tt-cream", where: "Starter and Influencer packs", line: "Most cards are Common. Start here." },
  { tier: "RARE", name: "Rare", ink: "text-tt-sky", where: "Every pack", line: "An early find to show off." },
  { tier: "EPIC", name: "Epic", ink: "text-tt-lilac", where: "Every pack", line: "The real chase. Best odds in the Legendary pack." },
  { tier: "LEGENDARY", name: "Legendary", ink: "text-tt-gold-400", where: "Influencer and Legendary packs", line: "The rarest card. Best odds in the Legendary pack." },
] as const;

const PackRaritySummary = ({ id }: { id: string }) => (
  <div className="mx-auto w-full max-w-4xl bg-tt-night-900/95">
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-testid="packs-rarity"
      className="tt-card relative mx-auto w-full max-w-4xl p-4 md:p-5 motion-safe:animate-appear"
    >
      <header className="mb-4 flex items-start gap-2">
        <span aria-hidden="true" className="mt-[2px] text-tt-gold-400">
          <PixelIcon name="sparkles" size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={`${id}-title`} className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-gold-400">
            Card tiers, rarest last
          </h3>
          <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">
            Every pack holds one card. Its tier is rolled with the odds shown on the pack.
          </p>
        </div>
      </header>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {RARITIES.map((rarity) => (
          <li key={rarity.tier} className="tt-card flex flex-col items-center gap-1.5 p-3 text-center">
            <img
              alt=""
              aria-hidden="true"
              src={cdnFile(`utilities/cats-modal/${rarity.tier.toLowerCase()}_shard.webp`)}
              className="h-12 w-12 object-contain lg:h-14 lg:w-14"
              draggable={false}
            />
            <h4 className={`font-primary text-p4 uppercase leading-none tracking-wide ${rarity.ink}`}>{rarity.name}</h4>
            <p className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-cream">{rarity.where}</p>
            <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">{rarity.line}</p>
          </li>
        ))}
      </ul>
    </section>
  </div>
);

interface PackOfferConfig {
  type: PackType;
  name: string;
  pill: string;
  pillTone: "gold" | "pink" | "mint";
  /** Hide the pill while the Legendary sale runs: the sale pill says it, one pill is enough. */
  pillOutsideSale?: boolean;
  /** The big glowing name over the art (md+), in the pack's colour. */
  glow: string;
  /** Glow effect for that name: the shared gold `glow`, or the Influencer's neon holo pink. */
  glowFx?: "glow" | "glow-holo-pink";
  featured?: boolean;
  tilt?: string;
}

const PACK_OFFERS: PackOfferConfig[] = [
  {
    type: PackType.STARTER,
    name: "Starter",
    pill: "Best for newcomers",
    pillTone: "mint",
    glow: "text-tt-cream",
    tilt: "lg:-rotate-3",
  },
  {
    type: PackType.INFLUENCER,
    name: "Influencer",
    // A claim the odds back (0.5% Legendary in PACK_ODDS), not a popularity we do not measure.
    pill: "Can hold a Legendary",
    pillTone: "pink",
    glow: "text-tt-pink",
    glowFx: "glow-holo-pink",
    featured: true,
  },
  {
    type: PackType.LEGENDARY,
    name: "Legendary",
    // The pack stays; only its sale ends (the sale pill under the price says when).
    pill: "Best Legendary odds",
    pillTone: "gold",
    pillOutsideSale: true,
    glow: "text-tt-gold-400",
    tilt: "lg:rotate-3",
  },
];

/**
 * One pack in the store: the art, then a night card with what is inside and the price. Phones show
 * a compact row (art left, card right) so all three packs fit on about one screen; from md up the
 * packs stand side by side. The price is the button; the rest of the pack is a mouse shortcut.
 */
const PackOffer = ({ offer, onSelect }: { offer: PackOfferConfig; onSelect: (packType: PackType) => void }) => {
  const select = () => onSelect(offer.type);
  return (
    <div
      data-testid={`pack-offer-${offer.type}`}
      onClick={select}
      className={clsx(
        "group relative flex cursor-pointer items-center gap-3 md:flex-1 md:flex-col md:gap-0",
        // Landscape phones: the phone row (art left, card right), three side by side, so every
        // price shows without scrolling.
        "short:!max-w-none short:min-w-0 short:!flex-row short:!items-center short:!gap-2",
        offer.featured ? "md:max-w-[19rem]" : "md:max-w-[16rem]"
      )}
    >
      <p
        aria-hidden="true"
        className={clsx(offer.glowFx ?? "glow", "mb-1 hidden font-primary text-h6 uppercase leading-none md:block short:!hidden", offer.glow)}
      >
        {offer.name}
      </p>
      <div className="relative flex shrink-0 justify-center">
        {offer.featured && (
          <>
            <img
              alt=""
              aria-hidden="true"
              src={cdnFile(`cards/packs/influencer-bg.webp`)}
              className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 motion-safe:animate-pulseWeak md:block"
            />
          </>
        )}
        <img
          alt=""
          aria-hidden="true"
          src={packImages[offer.type]}
          draggable={false}
          className={clsx(
            "relative z-10 w-24 max-w-none drop-shadow-[0_10px_18px_rgb(var(--tt-night-950)/0.6)] transition-transform duration-300 motion-reduce:transition-none",
            "motion-safe:group-hover:-translate-y-2 md:w-auto",
            offer.featured ? "md:h-72 lg:h-80" : "md:h-56 lg:h-64",
            "short:!h-24 short:!w-auto",
            offer.tilt,
            "lg:group-hover:rotate-0"
          )}
        />
      </div>
      <div
        className={clsx(
          "relative z-20 min-w-0 flex-1 bg-tt-night-950/60 md:-mt-6 md:w-full md:flex-none",
          "short:!mt-0 short:!w-auto short:!flex-1"
        )}
      >
        <div
          data-tone={offer.featured ? "highlight" : "default"}
          className="tt-card flex flex-col items-start gap-2 p-3 md:items-center md:text-center short:!items-start short:!gap-1.5 short:!p-2 short:!text-left"
        >
          <p className={clsx("font-primary text-p3 uppercase leading-none md:hidden short:!block", offer.glow)}>
            {offer.name}
          </p>
          {!(offer.pillOutsideSale && isLegendaryPromoActive()) && (
            // Landscape phones: no pill; the odds line under it says the same, and the row is narrow.
            <StatusPill tone={offer.pillTone} className="short:hidden">
              {offer.pill}
            </StatusPill>
          )}
          <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">
            <span className="text-tt-cream">One cat card.</span> {PACK_ODDS[offer.type]}.
          </p>
          {!isApp &&
            (offer.type === PackType.LEGENDARY ? (
              <LegendaryPrice className="min-w-[7rem]" saleClassName="short:!whitespace-normal" />
            ) : (
              <ModalButton variant="primary" className="min-w-[7rem]">
                {`$${packPriceUsd(offer.type)}`}
              </ModalButton>
            ))}
        </div>
      </div>
    </div>
  );
};

const PacksSelect = ({ onSelect }: { onSelect: (packType: PackType) => void }) => (
  <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:flex-row md:items-end md:justify-center md:gap-6 lg:gap-10 short:!items-stretch short:!gap-3 motion-safe:animate-appear">
    {PACK_OFFERS.map((offer) => (
      <PackOffer key={offer.type} offer={offer} onSelect={onSelect} />
    ))}
  </div>
);

const PACK_NAMES: Record<PackType, string> = {
  [PackType.STARTER]: "Starter pack",
  [PackType.INFLUENCER]: "Influencer pack",
  [PackType.LEGENDARY]: "Legendary pack",
};

/**
 * The checkout step: one opaque card with what you buy (Back, the pack, its name and odds, each
 * once) beside the compact Payment form (the total, the discount code, how to pay).
 */
const PackCheckout = ({
  packType,
  processing,
  onBack,
  onSuccess,
  onProcessingChange,
}: {
  packType: PackType;
  processing: boolean;
  onBack: () => void;
  onSuccess: (status: IMessage) => void;
  onProcessingChange: (processing: boolean) => void;
}) => (
  <div data-testid="packs-checkout" className="mx-auto flex w-full max-w-4xl flex-col gap-3 motion-safe:animate-appear">
    <h3 className="text-center font-primary text-p2 uppercase leading-none tracking-wide text-tt-gold-400 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))] short:hidden">
      Checkout
    </h3>
    {/* Opaque under the card's own gradient, so the platform art never shows through the form. */}
    <div className="bg-tt-night-900/95">
      <div className="tt-card grid items-start gap-4 p-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 md:p-6 short:!grid-cols-[10rem_minmax(0,1fr)] short:!gap-4 short:!p-3">
        <div className="flex flex-col gap-3 md:items-center md:text-center short:!items-start short:!text-left">
          <ModalButton
            variant="ghost"
            size="sm"
            icon="chevron-left"
            onClick={onBack}
            disabled={processing}
            className="self-start !px-1"
          >
            <span className="max-md:sr-only">Back to packs</span>
            <span className="md:hidden" aria-hidden="true">
              Back
            </span>
          </ModalButton>
          <div className="flex items-center gap-4 md:flex-col md:items-center">
            <img
              alt=""
              aria-hidden="true"
              src={packImages[packType]}
              className="w-20 shrink-0 drop-shadow-[0_8px_14px_rgb(var(--tt-night-950)/0.7)] motion-safe:animate-colormax md:w-44 short:hidden"
              draggable={false}
            />
            <div className="flex min-w-0 flex-col gap-1.5 md:items-center short:!items-start">
              <p className="font-primary text-p3 uppercase leading-none text-tt-gold-400">{PACK_NAMES[packType]}</p>
              <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">
                <span className="text-tt-cream">One cat card.</span> {PACK_ODDS[packType]}.
              </p>
              <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted short:hidden">
                Your pack opens right after you pay.
              </p>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <Payment
            price={packPriceUsd(packType)}
            entityType={EntityType.PACK}
            id={packType}
            productName={PACK_NAMES[packType]}
            onRemove={onBack}
            onSuccess={onSuccess}
            onProcessingChange={onProcessingChange}
            hideMascot
            compact
          />
        </div>
      </div>
    </div>
  </div>
);

export { isPaymentLayer };

/** During checkout neither a third-party layer nor a stray tap on the scrim closes the modal. */
const allowDuringPayment = (target: Element): boolean =>
  isPaymentLayer(target) || !!target.closest("[data-testid='game-modal-scrim']");

/** The checkout selection and the rolled cat, owned by whoever must keep them across a remount. */
export interface PacksCheckoutState {
  packType: PackType | null;
  setPackType: (next: PackType | null) => void;
  cat: ICat | null | undefined;
  setRolledCat: (cat: ICat | null) => void;
  /** A card payment or a transfer is in flight: closing now would lose the pack reveal. */
  processing: boolean;
  setProcessing: (processing: boolean) => void;
}

const usePacksCheckoutState = (): PacksCheckoutState => {
  const [packType, setPackType] = useState<PackType | null>(null);
  const [cat, setRolledCat] = useState<null | ICat>();
  const [processing, setProcessing] = useState(false);
  return { packType, setPackType, cat, setRolledCat, processing, setProcessing };
};

export const PacksModalContent = ({
  close,
  checkout,
}: {
  close?: () => void;
  /**
   * Lifted checkout state. PacksModal passes it because the dialog turns non-modal for the
   * checkout, and Radix then remounts the content: state kept in here would reset to the pack
   * select at the very moment a pack was picked.
   */
  checkout?: PacksCheckoutState;
}) => {
  const local = usePacksCheckoutState();
  const { packType, setPackType, cat, setRolledCat, processing, setProcessing } = checkout ?? local;
  // Buying is an account action (decision #9): a guest gets the AuthSheet, and the checkout
  // opens once they signed in.
  const { runWithAccount } = useAccountAction();
  const [showRaritySummary, setShowRaritySummary] = useState(false);
  const rarityId = useId();

  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();

  const onSuccess = (transactionStatus: IMessage) => {
    const { cat } = transactionStatus;
    if (cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), cat],
        monthPacks: (profile?.monthPacks || 0) + 1,
      });
      setRolledCat(cat);
      toast({ message: `Now let's roll into adventures`, img: cat.catImg });
    }
  };

  const selecting = !packType && !cat;
  return (
    <div className="relative z-10 px-3 pb-10 pt-4 md:px-6 md:pb-12">
      {selecting ? (
        <div className="mb-5 flex flex-col items-center md:mb-6 short:!mb-3">
          <img
            alt=""
            aria-hidden="true"
            src={cdnFile("logo/logo-pure-text.webp")}
            className="relative z-20 w-56 md:w-72 lg:w-80 short:hidden"
          />
          <p
            aria-hidden="true"
            className="relative z-30 -mt-2 inline-block bg-gradient-to-r from-tt-cream via-tt-pink to-tt-gold-400 bg-clip-text font-primary text-h4 leading-none tracking-wide text-transparent md:-mt-4 md:text-h1 short:!mt-0 short:!text-h6"
          >
            PACKS
          </p>
          <p className="mt-2 max-w-[34ch] bg-tt-night-950/90 px-3 py-1.5 short:!mt-1 short:!max-w-none short:!py-1 short:!text-p6 text-center font-sans text-p6 font-bold leading-snug text-tt-cream md:text-p5">
            Every pack holds one cat card. Rarer packs find rarer cats.
          </p>
        </div>
      ) : null}
      {selecting && (
        <>
          {/* App builds show the packs without prices; IAP is not built yet. */}
          <PacksSelect
            onSelect={(packType) => {
              if (isApp) return;
              void runWithAccount("purchase", () => setPackType(packType));
            }}
          />
          {isApp && (
            <div className="mt-8">
              <AppCheckoutNotice />
            </div>
          )}
          <div className="mt-6 flex flex-col items-center gap-4 md:mt-8 short:!mt-4">
            {/* One toggle that stays put, so focus never drops when the summary opens or closes. */}
            <ModalButton
              variant="secondary"
              size="sm"
              icon="info-box"
              aria-expanded={showRaritySummary}
              aria-controls={showRaritySummary ? rarityId : undefined}
              onClick={() => setShowRaritySummary((open) => !open)}
            >
              How rare is each card?
            </ModalButton>
            {showRaritySummary && <PackRaritySummary id={rarityId} />}
          </div>
        </>
      )}
      {packType && !cat && (
        <PackCheckout
          packType={packType}
          processing={processing}
          onBack={() => setPackType(null)}
          onSuccess={onSuccess}
          onProcessingChange={setProcessing}
        />
      )}
      {cat && <TailsCardPack packType={packType!} cat={cat} showGoToGame={!close} />}
    </div>
  );
};

const PacksBackdrop = ({ fixed }: { fixed?: boolean }) => (
  <div
    aria-hidden="true"
    className={`pointer-events-none ${
      fixed ? "fixed" : "absolute"
    } inset-x-0 bottom-0 z-0 flex justify-center overflow-hidden`}
  >
    <img src={cdnFile("cards/packs/packs-bg.webp")} alt="" className="rem:w-[1000px] max-w-none" draggable={false} />
  </div>
);

const PACKS_BG = {
  backgroundImage: `linear-gradient(rgb(var(--tt-night-900) / 0.35), rgb(var(--tt-night-900) / 0.55)), url(${cdnFile(
    "landing/card-bg.webp"
  )})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
} as const;

/**
 * The packs store. With `close` (the lobby) it is a GameModal on the `art` surface; without it
 * (`/packs`) it is the page itself, so there is no dialog to dismiss.
 *
 * While the checkout is on screen the dialog goes non-modal (`modal={false}`) and lets Stripe's
 * iframes and its 3DS container take pointer and focus (plan F3.3, G6
 * "Third parties"); a stray tap on the scrim does not close a checkout in progress.
 */
export const PacksModal = ({ close }: { close?: () => void }) => {
  const checkout = usePacksCheckoutState();
  // The checkout is on screen (card or crypto) until the pack is rolled.
  const paymentStep = !!checkout.packType && !checkout.cat;

  if (!close) {
    return (
      <main className="relative min-h-screen w-full overflow-x-hidden pt-safe" style={PACKS_BG}>
        <h1 className="sr-only">Packs</h1>
        <PacksBackdrop fixed />
        <div className="relative z-10">
          <PacksModalContent />
        </div>
      </main>
    );
  }

  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="PACKS"
      name="packs"
      surface="art"
      size="full"
      modal={!paymentStep}
      // While a payment is confirming the X is aria-disabled and Esc does nothing (plan F3.3
      // `canClose`): the player paid, and closing would unmount the form before the reveal.
      canClose={!(paymentStep && checkout.processing)}
      allowOutside={paymentStep ? allowDuringPayment : undefined}
      className={`!h-auto ${ART_PANEL_FULL_WIDTH}`}
    >
      <div
        data-testid="packs-panel"
        data-payment-step={paymentStep || undefined}
        className="relative isolate flex flex-col overflow-hidden rounded-lg border-4 border-tt-gold-500 shadow-[0_6px_0_rgb(var(--tt-night-950))]"
        style={{ ...PACKS_BG, maxHeight: ART_PANEL_MAX_HEIGHT }}
      >
        <PacksBackdrop />
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <PacksModalContent close={close} checkout={checkout} />
        </div>
      </div>
    </GameModal>
  );
};
