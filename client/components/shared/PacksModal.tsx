import { CloseButton } from "@/components/shared/CloseButton";
import { GameModal } from "@/components/ui/GameModal";
import { ART_PANEL_FULL_WIDTH, ART_PANEL_MAX_HEIGHT } from "@/components/shared/WheelModal";
import { useAccountAction } from "@/hooks/useAccountAction";
import { PixelButton } from "@/components/shared/PixelButton";
import { Tag } from "@/components/shared/Tag";
import { TailsCardPack } from "@/components/tailsCard/TailsCardPack";
import { AppCheckoutNotice } from "@/components/web3/AppCheckoutNotice";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { isApp } from "@/models/app";
import { useToast } from "@/context/ToastContext";
import { ICat, IMessage } from "@/models/cats";
import { PackType } from "@/models/order";
import { EntityType } from "@/models/save";
import dynamic from "next/dynamic";
import { useState } from "react";

const Payment = dynamic(
  () => import("@/components/web3/Payment").then((module) => module.Payment),
  { ssr: false }
);

const packPrices = {
  [PackType.STARTER]: 5,
  [PackType.INFLUENCER]: 25,
  [PackType.LEGENDARY]: 400,
};

export const packImages = {
  [PackType.STARTER]: cdnFile(`cards/packs/${PackType.STARTER}.webp`),
  [PackType.INFLUENCER]: cdnFile(`cards/packs/${PackType.INFLUENCER}.webp`),
  [PackType.LEGENDARY]: cdnFile(`cards/packs/${PackType.LEGENDARY}.webp`),
};

const PackRaritySummary = ({ close }: { close: () => void }) => {
  const rarities = [
    {
      tier: "COMMON",
      quantity: "500 / cat",
      description: "Start your journey. Fill collections. Support cats.",
      cardImage: cdnFile("cards/backgrounds/pattern-COMMON.webp"),
      textColor: "from-gray-100 to-gray-400",
      bgColor: "bg-gray-700/90 glow-box-AIR",
    },
    {
      tier: "RARE",
      quantity: "50 / cat",
      description: "Character cards. Early flex. Recognizable pulls.",
      cardImage: cdnFile("cards/backgrounds/pattern-RARE.webp"),
      textColor: "from-blue-300 to-blue-500",
      bgColor: "bg-blue-700/90 glow-box-WATER",
    },
    {
      tier: "EPIC",
      quantity: "5 / cat",
      description: "The real chase. Feels special. Worth showing off.",
      cardImage: cdnFile("cards/backgrounds/pattern-EPIC.webp"),
      textColor: "from-purple-300 to-purple-500",
      bgColor: "bg-purple-700/90 glow-box-STELLAR",
    },
    {
      tier: "LEGENDARY",
      quantity: "1 / cat",
      description: "The apex. Permanent flex. Once pulled - never repeated.",
      cardImage: cdnFile("cards/backgrounds/pattern-LEGENDARY.webp"),
      textColor: "from-tt-cream to-yellow-500",
      bgColor: "bg-amber-600/90 glow-box",
    },
  ];

  return (
    <div className="bg-gradient-to-b from-tt-night-700/95 to-tt-night-800/95 border-4 border-tt-gold-500 shadow-[0_6px_0_rgb(var(--tt-night-950))] w-[95%] lg:rem:w-[800px] max-w-none m-auto rounded-2xl p-4 pt-0 relative z-10 mb-8 animate-appear mt-8">
      <CloseButton placement="inside" label="Close rarity summary" onClick={close} />

      {/* Pattern Background Overlay */}
      <img
        alt=""
        aria-hidden="true"
        src={cdnFile("cards/backgrounds/pattern-LEGENDARY.webp")}
        className="absolute inset-0 w-full h-full object-cover opacity-15 mix-blend-color-dodge z-10 rounded-2xl"
      />

      {/* Header */}
      <div className="bg-tt-night-950 rounded-lg px-2 text-center w-fit m-auto border-4 border-tt-gold-500 z-20 absolute -mt-4 left-1/2 -translate-x-1/2">
        <span className="text-p5 font-bold text-tt-gold-400 font-primary uppercase">
          PACKS RARITY SUMMARY
        </span>
      </div>

      {/* Rarity Columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-x-12 lg:gap-x-4 mb-4 relative z-10 uppercase pt-8">
        {rarities.map((rarity) => (
          <div
            key={rarity.tier}
            className="flex flex-col items-center text-center"
          >
            {/* Card Image */}
            <div className="relative mb-2">
              <img
                alt=""
                aria-hidden="true"
                src={cdnFile(`cards/backgrounds/pattern-${rarity.tier}.webp`)}
                className="w-full h-full object-cover absolute rounded-lg p-1 mix-blend-color-dodge opacity-50"
              />
              <img
                alt=""
                aria-hidden="true"
                src={cdnFile(`cards/packs/teaser/${rarity.tier}.webp`)}
                className="object-cover h-24 lg:h-32"
              />
            </div>

            {/* Title */}
            <div
              className={`relative z-10 px-2 ${rarity.bgColor} rounded-lg -mt-8 w-full lg:w-fit`}
            >
              <h3
                className={`text-p5 lg:text-p4 font-bold font-primary ${rarity.textColor} bg-clip-text text-transparent bg-gradient-to-r `}
              >
                {rarity.tier}: {rarity.quantity}
              </h3>
            </div>

            {/* Description */}
            <p className="text-p5 text-white font-secondary mt-2">
              {rarity.description}
            </p>
          </div>
        ))}
      </div>

      {/* Bottom Message */}
      <div className="bg-tt-night-900/80 rounded-lg px-4 py-3 border-2 border-tt-gold-500/60 relative z-10">
        <p className="text-p5 text-center text-tt-cream font-secondary">
          Rarities are globally capped. When they&apos;re gone, they&apos;re
          gone.
        </p>
      </div>
    </div>
  );
};

const PacksSelect = ({
  onSelect,
}: {
  onSelect: (packType: PackType) => void;
}) => {
  return (
    <div className="flex justify-center flex-col md:flex-row gap-16 md:gap-0 overflow-hidden lg:overflow-visible animate-appear">
      <div
        className="flex flex-col items-center relative z-10 justify-center lg:-rotate-6 hover:rotate-0 transition-all duration-500 group lg:hover:mr-8 md:scale-75 hover:scale-100"
        onClick={() => onSelect(PackType.STARTER)}
      >
        <img
          alt=""
          aria-hidden="true"
          src={cdnFile(`tail/mascot-matters.webp`)}
          className="w-36 mt-48 z-[10] absolute top-0 mr-16 lg:group-hover:-mt-48 transition-all duration-500 hidden lg:block"
        />
        <div className="font-primary text-h5 glow mb-2 text-yellow-50">
          STARTER
        </div>
        <img
          alt=""
          aria-hidden="true"
          src={packImages[PackType.STARTER]}
          className="h-72 lg:h-96 w-auto z-10 relative lg:group-hover:-mt-12 transition-all duration-500 lg:group-hover:scale-125 max-w-none"
        />
        <div className="-mt-8 relative z-30 lg:group-hover:z-10 lg:group-hover:opacity-0 transition-all duration-500">
          <Tag>BEST FOR NEWCOMERS</Tag>
        </div>
        <div className="mt-2 lg:mt-4 lg:group-hover:opacity-0 transition-all duration-500">
          {!isApp && <PixelButton text="$5" />}
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center relative md:scale-[0.9] lg:scale-110 group -mt-4"
        onClick={() => onSelect(PackType.INFLUENCER)}
      >
        <div className="font-primary text-h5 glow mb-2 text-pink-100 animate-colormax">
          INFLUENCER
        </div>
        <img
          alt=""
          aria-hidden="true"
          src={packImages[PackType.INFLUENCER]}
          className="h-72 lg:h-96 w-auto z-20 relative mb-0 lg:group-hover:-mt-12 animate-colormax transition-all duration-500 lg:group-hover:scale-125 max-w-none"
        />
        <img
          alt=""
          aria-hidden="true"
          src={cdnFile(`cards/packs/most-popular.webp`)}
          className="w-16 lg:w-24 absolute top-12 z-40 right-20 lg:-right-8 lg:group-hover:opacity-0 transition-all duration-500 lg:group-hover:z-0"
        />
        <img
          alt=""
          aria-hidden="true"
          src={cdnFile(`cards/packs/influencer-bg.webp`)}
          className="rem:w-[500px] min-w-0 max-w-none absolute z-0 animate-pulseWeak"
        />
        <div className="-mt-10 relative z-30 lg:group-hover:z-10 lg:group-hover:opacity-0 transition-all duration-500">
          <Tag size="sm">MOST POPULAR</Tag>
        </div>
        <div className="mt-6 lg:mt-5 lg:group-hover:opacity-0 transition-all duration-500 glow-box">
          {!isApp && <PixelButton text="$25" />}
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center lg:rotate-6 hover:rotate-0 transition-all duration-500 group lg:hover:ml-8 md:scale-75 hover:scale-100"
        onClick={() => onSelect(PackType.LEGENDARY)}
      >
        <img
          alt=""
          aria-hidden="true"
          src={cdnFile("tail/mascot-card.webp")}
          className="w-40 mt-48 z-[10] absolute top-0 ml-8 lg:group-hover:-mt-44 transition-all duration-500 hidden lg:block"
        />
        <div className="font-primary text-h5 glow mb-2 text-yellow-200">
          LEGENDARY
        </div>
        <img
          alt=""
          aria-hidden="true"
          src={packImages[PackType.LEGENDARY]}
          className="h-72 lg:h-96 w-auto z-10 relative  lg:group-hover:-mt-12 transition-all duration-500 lg:group-hover:scale-125 max-w-none"
        />
        <div className="-mt-8 relative z-30 lg:group-hover:z-10 lg:group-hover:opacity-0 transition-all duration-500">
          <Tag>LAST CHANCE TO GET</Tag>
        </div>
        <div className="mt-2 lg:mt-4 lg:group-hover:opacity-0 transition-all duration-500">
          {!isApp && <PixelButton text="$400" />}
        </div>
      </div>
    </div>
  );
};

/**
 * True for the elements of a third-party payment layer that lives outside the dialog: Stripe's
 * card and 3DS iframes, the 3DS challenge container Stripe appends to `<body>`, and the Stellar
 * Wallets Kit modal (a plain `<div>` appended to `<body>`, `z-[999]`). Everything the app renders
 * sits under `#__next` or in a Radix portal, so "outside both" is a third party.
 */
export const isPaymentLayer = (target: Element): boolean => {
  if (target.closest('iframe[name^="__privateStripeFrame"], iframe[src*="js.stripe.com"]')) return true;
  if (target.closest("#__next, [role='dialog'], [data-testid='game-modal-scrim']")) {
    return false;
  }
  return !!target.closest("body > *");
};

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
  const { packType, setPackType, cat, setRolledCat, setProcessing } = checkout ?? local;
  // Buying is an account action (decision #9): a guest gets the AuthSheet, and the checkout
  // opens once they signed in.
  const { runWithAccount } = useAccountAction();
  const [showRaritySummary, setShowRaritySummary] = useState(false);

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

  return (
    <div className="pb-24 relative z-10">
      <div className="flex flex-col items-center relative mb-6 lg:mb-12 mt-4">
        <img
          alt=""
          aria-hidden="true"
          src={cdnFile("logo/logo-pure-text.webp")}
          className="w-96 relative z-20"
        />
        <div className="relative -mt-4">
          <div
            className="absolute opacity-50 font-primary -left-1 top-0.5 text-[6.5rem] leading-[6.5rem] inline-block =
bg-clip-text text-transparent -mt-4 z-20 glow"
          >
            PACKS
          </div>
          <div
            className="font-primary text-h1 tracking-wide inline-block bg-gradient-to-r from-yellow-50 via-pink-200 to-yellow-200
bg-clip-text text-transparent -mt-4 relative z-30"
          >
            PACKS
          </div>
        </div>
        {!isApp && (
          <div className="z-10 absolute -bottom-3">
            <Tag size="sm">PURCHASE A PACK TO SAVE A CAT</Tag>
          </div>
        )}
      </div>
      {!packType && !cat && (
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
          {!showRaritySummary ? (
            <div className="flex justify-center mt-8 md:mt-0 lg:mt-8">
              <PixelButton
                size="sm"
                text="PACKS RARITY SUMMARY"
                onClick={() => setShowRaritySummary(true)}
              />
            </div>
          ) : (
            <PackRaritySummary close={() => setShowRaritySummary(false)} />
          )}
        </>
      )}
      {packType && !cat && (
        <>
          <img
            alt=""
            aria-hidden="true"
            src={cdnFile(`cards/packs/${packType}.webp`)}
            className="w-48 m-auto relative z-10 animate-colormax"
          />

          <Payment
            price={packPrices[packType]}
            entityType={EntityType.PACK}
            id={packType}
            productName={`1 ${packType} Booster Pack`}
            onRemove={() => setPackType(null)}
            onSuccess={onSuccess}
            onProcessingChange={setProcessing}
          />
        </>
      )}
      {cat && (
        <TailsCardPack packType={packType!} cat={cat} showGoToGame={!close} />
      )}
    </div>
  );
};

const PacksBackdrop = ({ fixed }: { fixed?: boolean }) => (
  <div
    aria-hidden="true"
    className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-x-0 bottom-0 z-0 flex justify-center overflow-hidden`}
  >
    <img
      src={cdnFile("cards/packs/packs-bg.webp")}
      alt=""
      className="rem:w-[1000px] max-w-none"
      draggable={false}
    />
  </div>
);

const PACKS_BG = {
  backgroundImage: `linear-gradient(rgb(var(--tt-night-900) / 0.35), rgb(var(--tt-night-900) / 0.55)), url(${cdnFile("landing/card-bg.webp")})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
} as const;

/**
 * The packs store. With `close` (the lobby) it is a GameModal on the `art` surface; without it
 * (`/packs`) it is the page itself, so there is no dialog to dismiss.
 *
 * While the checkout is on screen the dialog goes non-modal (`modal={false}`) and lets Stripe's
 * iframes, its 3DS container and the Stellar Wallets Kit take pointer and focus (plan F3.3, G6
 * "Third parties"); a stray tap on the scrim does not close a checkout in progress.
 */
export const PacksModal = ({ close }: { close?: () => void }) => {
  const checkout = usePacksCheckoutState();
  // The checkout is on screen (Stripe or Stellar) until the pack is rolled.
  const paymentStep = !!checkout.packType && !checkout.cat;

  if (!close) {
    return (
      <main
        className="relative min-h-screen w-full overflow-x-hidden pt-safe"
        style={PACKS_BG}
      >
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
