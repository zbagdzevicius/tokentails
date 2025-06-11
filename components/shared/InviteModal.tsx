import { QUEST_API } from "@/api/quest-api";
import { getNextDayMidnight } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { GameModal } from "@/models/game";
import { useState } from "react";
import { MysteryBox } from "../mystery/MysteryBox";
import { MysteryCat } from "../mystery/MysteryCat";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { Web3Providers } from "../web3/Web3Providers";
import dynamic from "next/dynamic";

const MysteryBoxCat = dynamic(
  () => import("../mystery/MysteryBoxCat").then((mod) => mod.MysteryBoxCat),
  {
    ssr: false,
    loading: () => (
      <img
        src="/icons/loader.webp"
        className="w-8 h-8 m-auto animate-spin pixelated"
      />
    ),
  }
);

export const InviteModalContent = () => {
  const { utils, shareUrl, profile, setProfileUpdate } = useProfile();
  const nextDayTargetDate = getNextDayMidnight();
  const [type, setType] = useState(GameModal.MYSTERY_BOX);

  const onInvite = () => {
    if (!profile?.canInviteFriend) {
      return;
    }
    utils?.shareURL(shareUrl!);
    setProfileUpdate({ canInviteFriend: false });
    QUEST_API.friendInvited();
  };

  return (
    <div className="pt-4 pb-8 px-4 text-gray-700 flex flex-col justify-between items-center animate-appear">
      <Tag>GIFTS</Tag>
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === GameModal.MYSTERY_BOX}
          text="CAMP"
          onClick={() => setType(GameModal.MYSTERY_BOX)}
        ></PixelButton>
        <PixelButton
          active={type === GameModal.INVITE}
          text="INVITE"
          onClick={() => setType(GameModal.INVITE)}
        ></PixelButton>
        <div className="relative">
          <div className="absolute -top-2 -right-3 z-0 rotate-45">
            <Tag isSmall> NEW</Tag>
          </div>
          <PixelButton
            active={type === GameModal.MYSTERY_CAT}
            text="EVENT"
            onClick={() => setType(GameModal.MYSTERY_CAT)}
          ></PixelButton>
        </div>
      </div>
      {type === GameModal.INVITE && (
        <>
          <div
            className="flex flex-col mb-4 font-primary uppercase px-2 relative rounded-lg py-2 text-main-black mt-8"
            style={{
              backgroundImage: "url(/backgrounds/bg-6.webp)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute -top-3 -left-3 z-0 -rotate-45">
              <img
                draggable={false}
                className="h-6 w-6"
                src="/logo/heart.webp"
              />
            </div>
            <div className="absolute -top-3 -right-3 z-0 rotate-45">
              <img
                draggable={false}
                className="h-6 w-6"
                src="/logo/heart.webp"
              />
            </div>
            <div className="flex flex-row items-center">
              <img
                draggable={false}
                className="w-7 md:w-8 md:h-8 lg:w-10 lg:h-10 h-7 mr-1"
                src="/logo/coin.png"
              />
              <p className="text-p4">MORE FRIENS = MORE DAILY REWARDS</p>
            </div>
            <div className="flex flex-row items-center">
              <img
                draggable={false}
                className="w-7 h-7  md:w-8 md:h-8 lg:w-10 lg:h-10 mr-1"
                src="/icons/invites/gift.png"
              />
              <p className="text-p4">REDEEMED = +5k COINS TO YOU</p>
            </div>
            <div className="flex flex-row items-center">
              <img
                draggable={false}
                className="w-7 h-7  md:w-8 md:h-8 lg:w-10 lg:h-10 mr-1"
                src="/base/heart.png"
              />
              <p className="text-p4">GIFT = +10 LIVES TO YOU</p>
            </div>
            <div className="flex flex-row items-center">
              <img
                draggable={false}
                className="w-7 h-6  md:w-8 md:h-7 lg:w-10 lg:h-9 mr-1"
                src="/icons/invites/gift-coin.png"
              />
              <p className="text-p4">+50k COINS FOR YOUR FRIEND</p>
            </div>
          </div>

          {!profile?.canInviteFriend && (
            <Countdown targetDate={nextDayTargetDate} />
          )}
          <PixelButton
            text="Give a gift TO EARN"
            isDisabled={!profile?.canInviteFriend}
            onClick={onInvite}
          />
        </>
      )}
      {type === GameModal.MYSTERY_BOX && <MysteryBox />}
      {type === GameModal.MYSTERY_CAT && (
        <Web3Providers>
          <MysteryBoxCat />
        </Web3Providers>
      )}
      {/* {type === GameModal.MYSTERY_CAT && <MysteryCat />} */}
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
        className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full absolute top-1/2 -translate-y-1/2 h-full rounded-xl shadow max-h-screen overflow-y-auto"
        style={{
          backgroundImage: "url('/backgrounds/bg-5.webp')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
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
