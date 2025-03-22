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
import { Web3Mint } from "../web3/minting/Web3Mint";
import { Web3Providers } from "../web3/Web3Providers";
import { isApp } from "@/models/app";

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
    if (
      !(
        profile?.quests?.includes(
          mysteryBoxes[ChainType.CAMP_TEST]![0].chain
        ) ||
        !profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![0].name)
      )
    ) {
      return mysteryBoxes[ChainType.CAMP_TEST]![0];
    }
    if (
      !profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![1].name)
    ) {
      return mysteryBoxes[ChainType.CAMP_TEST]![1];
    }
    if (
      !profile?.quests?.includes(mysteryBoxes[ChainType.CAMP_TEST]![2].name)
    ) {
      return mysteryBoxes[ChainType.CAMP_TEST]![2];
    }
    return mysteryBoxes[ChainType.CAMP_TEST]![3];
  }, []);
  const unlockedIndex = useMemo(() => {
    return mysteryBoxes[ChainType.CAMP_TEST]?.findIndex(
      (box) => box.name === mysteryBox.name
    );
  }, [mysteryBox]);
  const isRedeemed = useMemo(() => {
    return (
      !!profile?.quests?.includes(mysteryBox.name) ||
      (unlockedIndex === 0 && !!profile?.quests?.includes(mysteryBox.chain))
    );
  }, [profile?.quests, mysteryBox.name]);
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
      return !!cats?.some(
        (cat) => cat.blessings?.length || cat.price || cat.ai
      );
    }
    if (mysteryBox.requirements?.type === MysteryBoxRequirementType.COINS) {
      return (
        (profile?.catpoints || 0) >= mysteryBox.requirements.metadata.catpoints
      );
    }
    return true;
  }, [profile?.quests, mysteryBox.chain, mysteryBox.name]);

  const onRedeem = async () => {
    const result = await QUEST_API.redeemContest(mysteryBox.name);
    if (result.success && result.cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), result.cat],
        cat: result.cat,
        quests: [...(profile?.quests || []), mysteryBox.name],
      });
      setGameType(GameType.HOME);
    }
    if (result.success && result.catpoints) {
      setProfileUpdate({
        quests: [...(profile?.quests || []), mysteryBox.name],
        catpoints: (profile!.catpoints || 0) + result.catpoints,
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
          <Countdown targetDate="2025-04-28" isDaysDisplayed></Countdown>
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
        <Tag isSmall>Complete all 4 mints for maximum rewards !</Tag>
        <div className="flex w-full justify-between">
          {mysteryBoxes.CAMP_TEST?.map((box, i) => (
            <div key={i} className="relative rounded-2xl overflow-hidden">
              <img draggable={false} className="w-16 md:w-24" src={box.image} />
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
