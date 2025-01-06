import { useProfile } from "@/context/ProfileContext";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Countdown } from "./Countdown";
import { getNextDayMidnight } from "@/constants/utils";
import { PostFriendInvited } from "@/constants/telegram-api";
import { GameModal } from "@/models/game";
import { useState } from "react";
import { Tag } from "./Tag";
import { Web3Mint } from "../web3/minting/Web3Mint";
import { Web3Providers } from "../web3/Web3Providers";
import { ChainImg, ChainType } from "@/web3/contracts";

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
    PostFriendInvited();
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
          <h2 className="text-center font-secondary uppercase text-p5 md:text-p4 mt-2">
            Mint Free NFT on ZETACHAIN
          </h2>
          <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
            Redeemal of NFT will be available starting February 15th
          </h2>
          <img
            className="w-64 aspect-square rounded-2xl mt-2 mb-4"
            src="/utilities/mystery-boxes/mystery-box.jpg"
          />
          <img
            src={ChainImg[ChainType.ZETA]}
            className="w-8 aspect-square mb-8 rem:-mt-[72px]"
          />
          <Countdown targetDate="2025-02-15" isDaysDisplayed></Countdown>
          <Web3Providers>
            <Web3Mint user={profile?._id!} />
          </Web3Providers>
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
