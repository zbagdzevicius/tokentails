import { CAT_API } from "@/api/cat-api";
import { QUEST_API } from "@/api/quest-api";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameType } from "@/models/game";
import { ChainType } from "@/web3/contracts";
import {
  IMysteryBox,
  mysteryBoxes,
  MysteryBoxRequirementType,
} from "@/web3/web3.model";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { Web3Providers } from "../web3/Web3Providers";
import { isApp } from "@/models/app";
import dynamic from "next/dynamic";

const Web3Mint = dynamic(
  () => import("../web3/minting/Web3Mint").then((mod) => mod.Web3Mint),
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
      style={{
        backgroundImage: "url(/backgrounds/bg-5.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex items-center gap-2 font-bold font-primary text-p2">
        {isEligible ? (
          <img draggable={false} className="w-8" src="/icons/check.webp" />
        ) : (
          <img
            draggable={false}
            className="w-8 pixelated"
            src="/purrquest/sprites/key.png"
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
  const { setGameType } = useGame();
  const mysteryBox = useMemo(() => {
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![0].key)) {
      return mysteryBoxes[ChainType.CAMP_TEST]![0];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![1].key)) {
      return mysteryBoxes[ChainType.CAMP_TEST]![1];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![2].key)) {
      return mysteryBoxes[ChainType.CAMP_TEST]![2];
    }
    if (!profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![3].key)) {
      return mysteryBoxes[ChainType.CAMP_TEST]![3];
    }
    return mysteryBoxes[ChainType.CAMP_TEST]![4];
  }, [profile?.quests]);
  const unlockedIndex = useMemo(() => {
    return mysteryBoxes[ChainType.CAMP_TEST]?.findIndex(
      (box) => box.key === mysteryBox.key
    );
  }, [mysteryBox]);
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
    <div className="flex flex-col w-full">
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
          <Countdown targetDate="2025-06-01" isDaysDisplayed></Countdown>
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
      <div className="flex flex-col gap-2">
        <Tag isSmall>Complete all 5 mints for maximum rewards !</Tag>
        <div className="flex w-full justify-between">
          {mysteryBoxes.CAMP_TEST?.map((box, i) => (
            <div key={i} className="relative rounded-2xl overflow-hidden">
              <img draggable={false} className="w-16 md:w-20" src={box.image} />
              {i < (unlockedIndex ?? 0) && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-300/50">
                  <img
                    draggable={false}
                    className="w-8"
                    src="/icons/check.webp"
                  />
                </div>
              )}
              {i > (unlockedIndex ?? 0) && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-300/50">
                  <img
                    draggable={false}
                    className="w-8 pixelated"
                    src="/purrquest/sprites/key.png"
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
