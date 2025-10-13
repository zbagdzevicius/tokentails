import { REWARDS } from "@/constants/rewards";
import { bgStyle, cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { GameModal } from "@/models/game";
import { useState } from "react";
import { MysteryBox } from "../mystery/MysteryBox";
import { Trailheads } from "../mystery/Trailheads";
import { Web3Providers } from "../web3/Web3Providers";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { MysteryBoxCat } from "../mystery/MysteryBoxCat";

export const InviteModalContent = () => {
  const { utils, shareUrl } = useProfile();
  const [type, setType] = useState(GameModal.CAMP);
  const [campView, setCampView] = useState<"mystery" | "trailheads">("mystery");

  const onInvite = () => {
    utils?.shareURL(shareUrl!);
  };

  return (
    <div className="pt-4 pb-8 px-4 text-gray-700 flex flex-col justify-between items-center animate-appear">
      <Tag>GIFTS</Tag>
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === GameModal.CAMP}
          text="CAMP"
          onClick={() => setType(GameModal.CAMP)}
        ></PixelButton>
        <PixelButton
          active={type === GameModal.INVITE}
          text="INVITE"
          onClick={() => setType(GameModal.INVITE)}
        ></PixelButton>
        <PixelButton
          active={type === GameModal.MYSTERY_CAT}
          text="BOXES"
          onClick={() => setType(GameModal.MYSTERY_CAT)}
        ></PixelButton>
      </div>
      {type === GameModal.INVITE && (
        <>
          <div
            className="flex flex-col mb-4 font-primary uppercase px-2 relative rounded-lg py-2 text-main-black mt-8"
            style={bgStyle("6")}
          >
            <Tag isSmall>WHAT I'LL GET FOR INVITING A FRIEND?</Tag>

            <div className="flex flex-row items-center mb-1">
              <img
                draggable={false}
                className="md:h-8 lg:h-10 h-7 mr-1"
                src={cdnFile("logo/logo.webp")}
              />
              <p className="text-p4">{REWARDS.INVITE_FRIEND} $TAILS</p>
            </div>
            <div className="flex flex-row items-center">
              <img
                draggable={false}
                className="w-7 h-6  md:w-8 md:h-7 lg:w-10 lg:h-9 mr-1"
                src={cdnFile("icons/invites/gift-coin.png")}
              />
              <p className="text-p4">
                {REWARDS.INVITE_FRIEND} $TAILS FOR YOUR FRIEND
              </p>
            </div>
            <div className="absolute -top-3 -left-3 z-0 -rotate-45">
              <img
                draggable={false}
                className="h-6 w-6"
                src={cdnFile("logo/heart.webp")}
              />
            </div>
            <div className="absolute -top-3 -right-3 z-0 rotate-45">
              <img
                draggable={false}
                className="h-6 w-6"
                src={cdnFile("logo/heart.webp")}
              />
            </div>
            <div className="flex flex-col gap-4 uppercase text-center">
              You feel that? That’s what purpose on-chain looks like
            </div>
          </div>
          <PixelButton text="GET INVITE LINK" onClick={onInvite} />
        </>
      )}
      {type === GameModal.CAMP && (
        <div className="flex flex-col items-center mt-1">
          <div className="flex flex-row items-center">
            <PixelButton
              isSmall
              text="MATCHSTICKS TASKS"
              active={campView === "mystery"}
              onClick={() => setCampView("mystery")}
            />
            <PixelButton
              isSmall
              text="Trail heads"
              active={campView === "trailheads"}
              onClick={() => setCampView("trailheads")}
            />
          </div>
          {campView === "mystery" && <MysteryBox />}
          {campView === "trailheads" && <Trailheads />}
        </div>
      )}
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
