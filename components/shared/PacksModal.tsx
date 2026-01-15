import { CloseButton } from "@/components/shared/CloseButton";
import { Countdown } from "@/components/shared/Countdown";
import { PixelButton } from "@/components/shared/PixelButton";
import { Tag } from "@/components/shared/Tag";
import { TailsCardPack } from "@/components/tailsCard/TailsCardPack";
import { Payment } from "@/components/web3/Payment";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { ICat, IMessage } from "@/models/cats";
import { PackType } from "@/models/order";
import { EntityType } from "@/models/save";
import { useState } from "react";

const endDate = new Date("2026-02-01");

const packPrices = {
  [PackType.STARTER]: 5,
  [PackType.INFLUENCER]: 25,
  [PackType.LEGENDARY]: 350,
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
      textColor: "from-yellow-300 to-yellow-500",
      bgColor: "bg-amber-600/90 glow-box",
    },
  ];

  return (
    <div className="bg-gradient-to-b from-yellow-900/95 to-yellow-700/95 glow-box w-[95%] md:rem:w-[800px] max-w-none m-auto rounded-2xl p-4 pt-0 relative z-10 mb-8 animate-appear mt-8">
      <div className="absolute top-0 md:-top-8 right-0 md:-right-8">
        <CloseButton onClick={close} />
      </div>

      {/* Pattern Background Overlay */}
      <img
        src={cdnFile("cards/backgrounds/pattern-LEGENDARY.webp")}
        className="absolute inset-0 w-full h-full object-cover opacity-15 mix-blend-color-dodge z-10 rounded-2xl"
      />

      {/* Header */}
      <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-lg px-2 text-center w-fit m-auto border-4 border-yellow-200 z-20 absolute -mt-4 left-1/2 -translate-x-1/2">
        <span className="text-p5 font-bold text-yellow-900 font-primary uppercase">
          PACKS RARITY SUMMARY
        </span>
      </div>

      {/* Rarity Columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 relative z-10 uppercase pt-8">
        {rarities.map((rarity) => (
          <div
            key={rarity.tier}
            className="flex flex-col items-center text-center"
          >
            {/* Card Image */}
            <div className="relative mb-2">
              <img
                src={cdnFile(`cards/backgrounds/pattern-${rarity.tier}.webp`)}
                className="w-full h-full object-cover absolute rounded-lg p-1 mix-blend-color-dodge opacity-50"
              />
              <img
                src={cdnFile(`cards/packs/teaser/${rarity.tier}.webp`)}
                className="object-cover h-24 md:h-32"
              />
            </div>

            {/* Title */}
            <div
              className={`relative z-10 px-2 ${rarity.bgColor} rounded-lg -mt-8 w-full md:w-fit`}
            >
              <h3
                className={`text-p5 md:text-p4 font-bold font-primary ${rarity.textColor} bg-clip-text text-transparent bg-gradient-to-r `}
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
      <div className="bg-gradient-to-r from-yellow-800/80 to-yellow-900/80 rounded-lg px-4 py-3 border-4 border-yellow-700 relative z-10">
        <p className="text-p5 text-center text-yellow-100 font-secondary">
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
    <div className="flex lg:gap-24 justify-center flex-col md:flex-row gap-16 md:gap-0 overflow-hidden md:overflow-visible animate-appear">
      <div
        className="flex flex-col items-center relative z-10 justify-center md:-rotate-6 hover:rotate-0 transition-all duration-500 group md:hover:mr-8 md:scale-75 hover:scale-100"
        onClick={() => onSelect(PackType.STARTER)}
      >
        <img
          src={cdnFile(`tail/mascot-matters.webp`)}
          className="w-36 mt-48 z-[10] absolute top-0 mr-16 md:group-hover:-mt-48 transition-all duration-500 hidden md:block"
        />
        <div className="font-primary text-h5 glow mb-2 text-yellow-50">
          STARTER
        </div>
        <img
          src={packImages[PackType.STARTER]}
          className="h-72 md:h-96 w-auto z-10 relative md:group-hover:-mt-12 transition-all duration-500 md:group-hover:scale-125 max-w-none"
        />
        <div className="-mt-8 relative z-30 md:group-hover:z-10 md:group-hover:opacity-0 transition-all duration-500">
          <Tag>BEST FOR NEWCOMERS</Tag>
        </div>
        <div className="mt-2 md:mt-4 md:group-hover:opacity-0 transition-all duration-500">
          <PixelButton text="$5" />
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center relative md:scale-110 group -mt-4"
        onClick={() => onSelect(PackType.INFLUENCER)}
      >
        <div className="font-primary text-h5 glow mb-2 text-pink-100 animate-colormax">
          INFLUENCER
        </div>
        <img
          src={packImages[PackType.INFLUENCER]}
          className="h-72 md:h-96 w-auto z-20 relative mb-0 md:group-hover:-mt-12 animate-colormax transition-all duration-500 md:group-hover:scale-125 max-w-none"
        />
        <img
          src={cdnFile(`cards/packs/most-popular.webp`)}
          className="w-16 md:w-24 absolute top-12 z-40 right-20 md:-right-8 md:group-hover:opacity-0 transition-all duration-500 md:group-hover:z-0"
        />
        <img
          src={cdnFile(`cards/packs/influencer-bg.webp`)}
          className="rem:w-[500px] min-w-0 max-w-none absolute z-0 animate-pulseWeak"
        />
        <div className="-mt-10 relative z-30 md:group-hover:z-10 md:group-hover:opacity-0 transition-all duration-500">
          <Tag isSmall>MOST POPULAR</Tag>
        </div>
        <div className="mt-6 md:mt-5 md:group-hover:opacity-0 transition-all duration-500 glow-box">
          <PixelButton text="$25" />
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center md:rotate-6 hover:rotate-0 transition-all duration-500 group md:hover:ml-8 md:scale-75 hover:scale-100"
        onClick={() => onSelect(PackType.LEGENDARY)}
      >
        <img
          src={cdnFile("tail/mascot-card.webp")}
          className="w-40 mt-48 z-[10] absolute top-0 ml-8 md:group-hover:-mt-44 transition-all duration-500 hidden md:block"
        />
        <div className="-mt-8 md:group-hover:opacity-0 transition-all duration-500 relative z-20">
          <Countdown isDaysDisplayed targetDate={endDate} />
        </div>
        <div className="font-primary text-h5 glow mb-2 text-yellow-200">
          LEGENDARY
        </div>
        <img
          src={packImages[PackType.LEGENDARY]}
          className="h-72 md:h-96 w-auto z-10 relative  md:group-hover:-mt-12 transition-all duration-500 md:group-hover:scale-125 max-w-none"
        />
        <div className="-mt-8 relative z-30 md:group-hover:z-10 md:group-hover:opacity-0 transition-all duration-500">
          <Tag>TIME LIMITED CHANCE</Tag>
        </div>
        <div className="mt-2 md:mt-4 md:group-hover:opacity-0 transition-all duration-500">
          <PixelButton text="$350" />
        </div>
      </div>
    </div>
  );
};

export const PacksModalContent = ({ close }: { close?: () => void }) => {
  const [packType, setPackType] = useState<PackType | null>(null);
  const [showRaritySummary, setShowRaritySummary] = useState(false);

  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const [cat, setRolledCat] = useState<null | ICat>();

  const onSuccess = (transactionStatus: IMessage) => {
    const { cat } = transactionStatus;
    if (cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), cat],
        monthBoxes: (profile?.monthBoxes || 0) + 1,
      });
      setRolledCat(cat);
      toast({ message: `Now let's roll into adventures`, img: cat.catImg });
    }
  };

  return (
    <div className="pb-24 relative z-10">
      <div className="flex flex-col items-center relative mb-6 md:mb-12 mt-4">
        <img
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
        <div className="z-10 absolute -bottom-3">
          <Tag isSmall>PURCHASE A PACK TO SAVE A CAT</Tag>
        </div>
      </div>
      {!packType && !cat && (
        <>
          <PacksSelect onSelect={(packType) => setPackType(packType)} />
          {!showRaritySummary ? (
            <div className="flex justify-center mt-8">
              <PixelButton
                isSmall
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
            src={cdnFile(`cards/packs/${packType}.webp`)}
            className="w-48 m-auto relative z-10 animate-colormax"
          />
          {/* <TailsCardPack packType={packType} /> */}

          <Payment
            price={packPrices[packType]}
            entityType={EntityType.PACK}
            id={packType}
            productName={`1 ${packType} Booster Pack`}
            onRemove={() => setPackType(null)}
            onSuccess={onSuccess}
          />
        </>
      )}
      {cat && (
        <TailsCardPack packType={packType!} cat={cat} showGoToGame={!close} />
      )}
    </div>
  );
};

export const PacksModal = ({ close }: { close?: () => void }) => {
  return (
    <Web3Providers>
      <div
        className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full"
        style={{
          backgroundImage: `url(${cdnFile("landing/card-bg.webp")})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div
          onClick={close}
          className="z-40 h-full w-full absolute inset-0 opacity-50"
        ></div>
        <div className="m-auto z-50 max-w-full w-full absolute inset-0 max-h-screen overflow-y-auto">
          {close && <CloseButton onClick={() => close?.()} />}
          <PacksModalContent close={close} />
          <div className="fixed z-0 bottom-0 left-1/2 -translate-x-1/2">
            <img
              src={cdnFile("cards/packs/packs-bg.webp")}
              className="rem:w-[1000px] max-w-none"
            />
          </div>
        </div>
      </div>
    </Web3Providers>
  );
};
