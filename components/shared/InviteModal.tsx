import { QUEST_API } from "@/api/quest-api";
import { getNextDayMidnight } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { GameModal, GameType } from "@/models/game";
import { ChainImg, ChainType } from "@/web3/contracts";
import { useState } from "react";
import { Web3Mint } from "../web3/minting/Web3Mint";
import { Web3Providers } from "../web3/Web3Providers";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { useToast } from "@/context/ToastContext";
import { useGame } from "@/context/GameContext";
import { mysteryBoxes } from "@/web3/web3.model";

const mysteryBox = mysteryBoxes[ChainType.CAMP_TEST]!;

export const InviteModalContent = () => {
  const { utils, shareUrl, profile, setProfileUpdate } = useProfile();
  const nextDayTargetDate = getNextDayMidnight();
  const [type, setType] = useState(GameModal.MYSTERY_BOX);
  const toast = useToast();
  const { setGameType } = useGame();

  const onInvite = () => {
    if (!profile?.canInviteFriend) {
      return;
    }
    utils?.shareURL(shareUrl!);
    setProfileUpdate({ canInviteFriend: false });
    QUEST_API.friendInvited();
  };

  const onRedeem = async () => {
    const result = await QUEST_API.redeemContest("zetachain");
    if (result.success && result.cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), result.cat],
        cat: result.cat,
        quests: [...(profile?.quests || []), "zetachain"],
      });
      toast({ message: "Congratz on your adopted cat !" });
      setGameType(GameType.HOME);
    }
  };

  return (
    <div className="pt-4 pb-8 px-4 md:px-12 md:pt-4 md:pb-12 text-gray-700 flex flex-col justify-between items-center animate-appear">
      <Tag>GIFTS</Tag>
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === GameModal.MYSTERY_BOX}
          text="FREE MINT"
          onClick={() => setType(GameModal.MYSTERY_BOX)}
        ></PixelButton>
        <PixelButton
          active={type === GameModal.INVITE}
          text="SHARING IS CARING"
          onClick={() => setType(GameModal.INVITE)}
        ></PixelButton>
      </div>
      {type === GameModal.INVITE ? (
        <>
          <div className="flex flex-col mb-4">
            <div className="flex flex-row items-center">
              <img
                className="w-7 md:w-8 md:h-8 lg:w-10 lg:h-10 h-7 mr-1"
                src="/logo/coin.png"
              />
              <p className="font-secondary text-p4">
                Get 20% earnings of your friends
              </p>
            </div>
            <div className="flex flex-row items-center">
              <img
                className="w-7 h-7  md:w-8 md:h-8 lg:w-10 lg:h-10 mr-1"
                src="/icons/invites/gift.png"
              />
              <p className="font-secondary text-p4">
                Get 5k for every redeemed gift
              </p>
            </div>
            <div className="flex flex-row items-center">
              <img
                className="w-7 h-7  md:w-8 md:h-8 lg:w-10 lg:h-10 mr-1"
                src="/base/heart.png"
              />
              <p className="font-secondary text-p4">
                Get 10 lives for every redeemed gift
              </p>
            </div>
            <div className="flex flex-row items-center">
              <img
                className="w-7 h-6  md:w-8 md:h-7 lg:w-10 lg:h-9 mr-1"
                src="/icons/invites/gift-coin.png"
              />
              <p className="font-secondary text-p4">
                Gift contains 50k coins to your friend
              </p>
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
      ) : (
        <div className="flex justify-center items-center flex-col">
          <Tag isSmall>TIME LIMITED EVENT</Tag>
          <img
            className="w-64 aspect-square rounded-2xl mt-2 mb-4"
            src={mysteryBox.image}
          />
          <Countdown targetDate="2025-03-10" isDaysDisplayed></Countdown>
          {profile?.quests?.includes(mysteryBox.chain) ? (
            <PixelButton text="REDEEMED" isDisabled></PixelButton>
          ) : (
            <Web3Providers>
              <Web3Mint user={profile?._id!} ownedNFTCallback={onRedeem} />
            </Web3Providers>
          )}
          {mysteryBox.faucet && (
            <div className="flex font-secondary font-bold text-p4 items-center justify-center pt-4">
              Out of gas ?{" "}
              <a href={mysteryBox.faucet}>
                <PixelButton isSmall text="Get Gas" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const InviteModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full bg-gradient-to-b from-purple-300 to-blue-300 absolute top-1/2 -translate-y-1/2 rounded-xl shadow h-fit">
        <InviteModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
        <CloseButton onClick={() => close()} />
      </div>
    </div>
  );
};
