import { bgStyle } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { GameModal } from "@/models/game";
import { useState } from "react";
import { MysteryBoxCat } from "../mystery/MysteryBoxCat";
import { Web3Providers } from "../web3/Web3Providers";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";

export const InviteModalContent = () => {
  const [type, setType] = useState(GameModal.MYSTERY_CAT);

  return (
    <div className="pt-4 pb-8 px-4 text-yellow-900 flex flex-col justify-between items-center animate-appear">
      <div className="font-paws text-h2 glow">SHOP</div>
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === GameModal.MYSTERY_CAT}
          text="BOXES"
          onClick={() => setType(GameModal.MYSTERY_CAT)}
        ></PixelButton>
      </div>
      {type === GameModal.MYSTERY_CAT && (
        <Web3Providers>
          <MysteryBoxCat />
        </Web3Providers>
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
        style={bgStyle("5")}
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
