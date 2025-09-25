import { CAT_API } from "@/api/cat-api";
import { QUEST_API } from "@/api/quest-api";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { isApp } from "@/models/app";
import { GameModal, GameType } from "@/models/game";
import { ChainType } from "@/web3/contracts";
import {
  IMysteryBox,
  mysteryBoxes,
  MysteryBoxRequirementType,
} from "@/web3/web3.model";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { Web3Providers } from "../web3/Web3Providers";
import { bgStyle, cdnFile } from "@/constants/utils";

const ConnectWallet = dynamic(
  () => import("../web3/minting/Web3Mint").then((mod) => mod.ConnectWallet),
  {
    ssr: false,
    loading: () => (
      <img
        src={cdnFile("icons/loader.webp")}
        className="w-8 h-8 m-auto animate-spin pixelated"
      />
    ),
  }
);

const Web3Mint = dynamic(
  () => import("../web3/minting/Web3Mint").then((mod) => mod.Web3Mint),
  {
    ssr: false,
    loading: () => (
      <img
        src={cdnFile("icons/loader.webp")}
        className="w-8 h-8 m-auto animate-spin pixelated"
      />
    ),
  }
);

const MysteryBoxEligibility = ({
  mysteryBox,
  isEligible,
  isRedeemed,
}: {
  mysteryBox: IMysteryBox;
  isEligible: boolean;
  isRedeemed: boolean;
}) => {
  const text = isRedeemed ? "COMPLETED" : isEligible ? "ELIGIBLE" : "TASK";
  return (
    <div
      className="flex flex-col items-center my-2 md:mb-0 rounded-xl w-full md:w-auto"
      style={bgStyle("min-4")}
    >
      <div className="flex items-center gap-2 font-bold font-primary text-p2">
        {isEligible ? (
          <img
            draggable={false}
            className="w-8"
            src={cdnFile("icons/check.webp")}
          />
        ) : (
          <img
            draggable={false}
            className="w-8 pixelated"
            src={cdnFile("purrquest/sprites/key.png")}
          />
        )}
        {text}
      </div>
      <span className="font-secondary text-p3 md:text-p5 font-bold h-8 flex items-center justify-center px-2 rounded-xl">
        {mysteryBox.requirements?.text} {isEligible ? "" : "To Unlock"}
      </span>
    </div>
  );
};

export const MysteryBox = () => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const { setGameType, setOpenedModal } = useGame();
  const mysteryBox = useMemo(() => {
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![0].key)) {
      return mysteryBoxes[ChainType.CAMP]![0];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![1].key)) {
      return mysteryBoxes[ChainType.CAMP]![1];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![2].key)) {
      return mysteryBoxes[ChainType.CAMP]![2];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![3].key)) {
      return mysteryBoxes[ChainType.CAMP]![3];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![4].key)) {
      return mysteryBoxes[ChainType.CAMP]![4];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![5].key)) {
      return mysteryBoxes[ChainType.CAMP]![5];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![6].key)) {
      return mysteryBoxes[ChainType.CAMP]![6];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP]![7].key)) {
      return mysteryBoxes[ChainType.CAMP]![7];
    }
    return mysteryBoxes[ChainType.CAMP]![8];
  }, [profile?.quests]);
  const unlockedIndex = useMemo(() => {
    return mysteryBoxes[ChainType.CAMP]?.findIndex(
      (box) => box.key === mysteryBox.key
    );
  }, [mysteryBox]);
  const finished = useMemo(() => {
    return profile?.quests?.find(
      (quest) => quest === mysteryBoxes[ChainType.CAMP]![8].key
    );
  }, [profile?.quests]);
  const isRedeemed = useMemo(() => {
    return !!profile?.quests?.includes(mysteryBox.key);
  }, [profile?.quests, mysteryBox.key]);
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => CAT_API.cats(),
  });
  const isEligible = useMemo(() => {
    if (
      mysteryBox.requirements?.type === MysteryBoxRequirementType.APP_DOWNLOAD
    ) {
      return isApp;
    }
    if (mysteryBox.requirements?.type === MysteryBoxRequirementType.PURCHASE) {
      return !!cats?.some((cat) => cat.blessings?.length || cat.price);
    }
    if (mysteryBox.requirements?.type === MysteryBoxRequirementType.COINS) {
      return (
        (profile?.catpoints || 0) >= mysteryBox.requirements.metadata.catpoints
      );
    }
    if (mysteryBox.requirements?.type === MysteryBoxRequirementType.STREAK) {
      return (profile?.streak || 0) >= mysteryBox.requirements.metadata.streak;
    }
    if (mysteryBox.requirements?.type === MysteryBoxRequirementType.TITLES) {
      return (
        (profile?.codex?.filter((item) => item === 1)?.length || 0) >=
        mysteryBox.requirements.metadata.titles
      );
    }
    if (mysteryBox.requirements?.type === MysteryBoxRequirementType.CATNIP) {
      return (
        (profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0) >=
        mysteryBox.requirements.metadata.catnip
      );
    }
    return true;
  }, [profile?.quests, mysteryBox.chain, mysteryBox.key]);

  const onRedeem = async () => {
    const result = await QUEST_API.redeemContest(mysteryBox.key);
    if (result.success && result.cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), result.cat],
        cat: result.cat,
        quests: [...(profile?.quests || []), mysteryBox.key],
        catbassadorsLives:
          (profile?.catbassadorsLives || 0) + (result.catbassadorsLives || 0),
      });
      setGameType(GameType.HOME);
    } else if (
      result.success &&
      (result.catpoints || result.catbassadorsLives)
    ) {
      setProfileUpdate({
        quests: [...(profile?.quests || []), mysteryBox.key],
        catpoints: (profile!.catpoints || 0) + (result.catpoints || 0),
        catbassadorsLives:
          (profile?.catbassadorsLives || 0) + (result.catbassadorsLives || 0),
      });
    }
    toast({ message: result.message });
  };

  return (
    <div className="flex flex-col w-full animate-opacity">
      {!finished ? (
        <div className="flex justify-center items-center flex-col md:flex-row md:gap-4">
          <div>
            <img
              draggable={false}
              className="w-64 aspect-square rounded-2xl mt-2 mb-4"
              src={mysteryBox.image}
            />
          </div>
          <div className="flex flex-col md:gap-2 w-full md:w-auto">
            <Tag isSmall>TIME LIMITED FREE MINT</Tag>
            <MysteryBoxEligibility
              mysteryBox={mysteryBox}
              isEligible={isEligible}
              isRedeemed={isRedeemed}
            />
            {isEligible &&
              (isRedeemed ? (
                <PixelButton text="REDEEMED" isDisabled></PixelButton>
              ) : (
                <Web3Providers>
                  <Web3Mint
                    user={profile?._id!}
                    ownedNFTCallback={onRedeem}
                    mysteryBox={mysteryBox}
                  />
                </Web3Providers>
              ))}
            {mysteryBox.faucet && isEligible && (
              <div className="flex md:flex-col font-secondary font-bold text-p4 items-center justify-center">
                <span className="md:-mb-2">Out of gas ?</span>
                <a href={mysteryBox.faucet} target="_blank">
                  <PixelButton isSmall text="Get Gas" />
                </a>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center mb-4">
          <div className="font-primary uppercase">
            <Tag isSmall>You've Completed Camp tasks!</Tag>
            <div className="mt-4 text-balance text-p5 text-center">
              This isn’t Web3 hype. This is soulbound proof. The algorithm
              noticed. So did the Codex.{" "}
              <div className="font-bold text-p4 text-center">
                Now you're eligible for Sticky!
              </div>
              You feel that? That’s what purpose on-chain looks like.
            </div>
          </div>
          <div>
            <img
              src={cdnFile("tail/cat-celebrate.webp")}
              className="w-16 -scale-x-100"
            />
            <div
              onClick={() => setOpenedModal(GameModal.FEATURED_CAT)}
              className="flex hover:brightness-110 flex-col w-24 relative items-center font-secondary rounded-xl px-1 py-2"
              style={bgStyle("4")}
            >
              <div className="relative -mt-8 -mb-4">
                <img
                  draggable={false}
                  className="w-24 h-24 pixelated"
                  src={
                    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/STICKY/base/RUNNING.gif"
                  }
                />
              </div>
              <div className="text-p4 font-bold flex items-center gap-1">
                ABOUT STICKY
              </div>
            </div>
          </div>
        </div>
      )}

      <Web3Providers>
        <ConnectWallet />
      </Web3Providers>
      <div className="flex flex-col gap-2 mt-2">
        {!finished && (
          <Tag isSmall>Complete all 5 mints for maximum rewards !</Tag>
        )}
        <div className="flex w-full justify-center gap-4 gap-y-8 flex-wrap">
          {mysteryBoxes.CAMP?.map((box, i) => (
            <div key={i} className="relative rounded-2xl">
              <img
                draggable={false}
                className="w-24 md:w-20 rounded-2xl"
                src={box.image}
              />
              {profile?.quests?.includes(box.key) && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-300/50 rounded-2xl">
                  <img
                    draggable={false}
                    className="w-8"
                    src={cdnFile("icons/check.webp")}
                  />
                </div>
              )}
              {profile?.quests?.includes(box.key) && (
                <div className="absolute left-0 right-0 flex items-center justify-center -bottom-8 -mx-4 rounded-2xl overflow-hidden">
                  <Web3Providers>
                    <Web3Mint
                      hideAddress
                      user={profile?._id!}
                      mysteryBox={box}
                      text="REMINT"
                    />
                  </Web3Providers>
                </div>
              )}
              {i > (unlockedIndex ?? 0) && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-300/50 rounded-2xl">
                  <img
                    draggable={false}
                    className="w-8 pixelated overflow-hidden"
                    src={cdnFile("purrquest/sprites/key.png")}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
