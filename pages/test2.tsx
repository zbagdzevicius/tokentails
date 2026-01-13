import { Analytics } from "@/components/Analytics";
import { CloseButton } from "@/components/shared/CloseButton";
import { Countdown } from "@/components/shared/Countdown";
import { PixelButton } from "@/components/shared/PixelButton";
import { Tag } from "@/components/shared/Tag";
import { Payment } from "@/components/web3/Payment";
import { Web3Providers } from "@/components/web3/Web3Providers";
import { cdnFile } from "@/constants/utils";
import { CatProvider } from "@/context/CatContext";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { queryClient } from "@/context/query";
import { ToastProvider } from "@/context/ToastContext";
import { PackType } from "@/models/order";
import { EntityType } from "@/models/save";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const endDate = new Date("2026-02-01");

const packPrices = {
  [PackType.STARTER]: 5,
  [PackType.INFLUENCER]: 25,
  [PackType.LEGENDARY]: 350,
};

const packImages = {
  [PackType.STARTER]: cdnFile(`cards/packs/${PackType.STARTER}.webp`),
  [PackType.INFLUENCER]: cdnFile(`cards/packs/${PackType.INFLUENCER}.webp`),
  [PackType.LEGENDARY]: cdnFile(`cards/packs/${PackType.LEGENDARY}.webp`),
};

const PacksSelect = ({
  onSelect,
}: {
  onSelect: (packType: PackType) => void;
}) => {
  return (
    <div className="flex gap-24 justify-center">
      <div
        className="flex flex-col items-center relative z-10 justify-center -rotate-6 hover:rotate-0 transition-all duration-500 group hover:mr-8 scale-75 hover:scale-100"
        onClick={() => onSelect(PackType.STARTER)}
      >
        <div className="font-primary text-h5 glow mb-2 text-yellow-50">
          STARTER
        </div>
        <img
          src={packImages[PackType.STARTER]}
          className="h-96 w-auto z-10 relative group-hover:-mt-12 transition-all duration-500 group-hover:scale-125 max-w-none"
        />
        <div className="-mt-8 relative z-30 group-hover:z-10 group-hover:opacity-0 transition-all duration-500">
          <Tag>BEST FOR NEWCOMERS</Tag>
        </div>
        <div className="mt-4 group-hover:opacity-0 transition-all duration-500">
          <PixelButton text="$5" />
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center relative scale-110 group -mt-4"
        onClick={() => onSelect(PackType.INFLUENCER)}
      >
        <div className="font-primary text-h5 glow mb-2 text-pink-100 animate-colormax">
          INFLUENCER
        </div>
        <img
          src={packImages[PackType.INFLUENCER]}
          className="h-96 w-auto z-20 relative mb-0 group-hover:-mt-12 animate-colormax transition-all duration-500 group-hover:scale-125 max-w-none"
        />
        <img
          src={cdnFile(`cards/packs/most-popular.webp`)}
          className="w-24 absolute top-12 z-40 -right-8 group-hover:opacity-0 transition-all duration-500 group-hover:z-0"
        />
        <img
          src={cdnFile(`cards/packs/influencer-bg.webp`)}
          className="rem:w-[500px] min-w-0 max-w-none absolute z-0 animate-pulseWeak"
        />
        <div className="-mt-10 relative z-30 group-hover:z-10 group-hover:opacity-0 transition-all duration-500">
          <Tag isSmall>MOST POPULAR</Tag>
        </div>
        <div className="mt-5 group-hover:opacity-0 transition-all duration-500 glow-box">
          <PixelButton text="$25" />
        </div>
      </div>
      <div
        className="flex flex-col items-center justify-center rotate-6 hover:rotate-0 transition-all duration-500 group hover:ml-8 scale-75 hover:scale-100"
        onClick={() => onSelect(PackType.LEGENDARY)}
      >
        <img
          src={cdnFile("tail/mascot-card.webp")}
          className="w-40 mt-48 z-[10] absolute top-0 ml-8 group-hover:-mt-40 transition-all duration-500"
        />
        <div className="-mt-8 group-hover:opacity-0 transition-all duration-500 relative z-20">
          <Countdown isDaysDisplayed targetDate={endDate} />
        </div>
        <div className="font-primary text-h5 glow mb-2 text-yellow-200">
          LEGENDARY
        </div>
        <img
          src={packImages[PackType.LEGENDARY]}
          className="h-96 w-auto z-10 relative  group-hover:-mt-12 transition-all duration-500 group-hover:scale-125 max-w-none"
        />
        <div className="-mt-8 relative z-30 group-hover:z-10 group-hover:opacity-0 transition-all duration-500">
          <Tag>TIME LIMITED CHANCE</Tag>
        </div>
        <div className="mt-4 group-hover:opacity-0 transition-all duration-500">
          <PixelButton text="$350" />
        </div>
      </div>
    </div>
  );
};

export const PacksModalContent = ({ close }: { close: () => void }) => {
  const [packType, setPackType] = useState<PackType | null>(null);
  return (
    <div className="pb-24 mt-safe">
      <div className="fixed z-0 bottom-0 left-1/2 -translate-x-1/2">
        <img
          src={cdnFile("cards/packs/packs-bg.webp")}
          className="rem:w-[1000px] max-w-none"
        />
      </div>
      <div className="flex flex-col items-center relative mb-16 md:mb-12 mt-4">
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
      {!packType && (
        <PacksSelect onSelect={(packType) => setPackType(packType)} />
      )}
      {packType && (
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
            onSuccess={() => {}}
            productName={`1 ${packType} Booster Pack`}
            onRemove={() => setPackType(null)}
          />
        </>
      )}
    </div>
  );
};

export default function TestPage({ close }: { close: () => void }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Analytics />
      <ToastProvider>
        <ProfileProvider>
          <CatProvider>
            <FirebaseAuthProvider>
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
                    <CloseButton onClick={close} />
                    <PacksModalContent close={close} />
                  </div>
                </div>
              </Web3Providers>
            </FirebaseAuthProvider>
          </CatProvider>
        </ProfileProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
