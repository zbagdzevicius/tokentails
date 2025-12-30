import { bgStyle, cdnFile } from "@/constants/utils";
import { EntityType } from "@/models/save";
import { useState } from "react";
import { MysteryBoxCat } from "../mystery/MysteryBoxCat";
import { Web3Providers } from "../web3/Web3Providers";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { PixelButton } from "./PixelButton";

export const InviteModalContent = () => {
  const [type, setType] = useState(EntityType.LOOT_BOX);

  return (
    <div className="pt-4 pb-8 px-4 text-yellow-900 flex flex-col justify-between items-center animate-appear">
      <div className="font-paws text-h2 glow">SHOP</div>
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === EntityType.LOOT_BOX}
          text="LOOT BOX"
          onClick={() => setType(EntityType.LOOT_BOX)}
        ></PixelButton>
        <PixelButton
          active={type === EntityType.PACK}
          text="PACKS"
          onClick={() => setType(EntityType.PACK)}
        ></PixelButton>
      </div>
      {type === EntityType.LOOT_BOX && (
        <Web3Providers>
          <MysteryBoxCat />
        </Web3Providers>
      )}
      {type === EntityType.PACK && (
        <div className="flex flex-col items-center justify-center">
          <img
            src={cdnFile("tail/cat-celebrate.webp")}
            alt="pack"
            className="w-32 -mb-4"
          />
          <Countdown isBig isDaysDisplayed targetDate={new Date(2026, 0, 15)} />
          <div className="text-h4 text-center font-primary mt-4">
            COMING SOON
          </div>
          <div className="text-p4 text-center font-primary -mt-2">
            STAY TUNED FOR MORE INFO ABOUT PACKS!
          </div>
        </div>
      )}
    </div>
  );
};

export const InviteModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center max-h-screen h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div
        className="m-auto z-50 rem:w-[370px] md:w-[480px] max-w-full absolute top-1/2 -translate-y-1/2 h-full rounded-xl shadow max-h-screen overflow-y-auto"
        style={bgStyle("4")}
      >
        <CloseButton onClick={() => close()} />
        <InviteModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
