import { CAT_API } from "@/api/cat-api";
import { QUEST_API } from "@/api/quest-api";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { isApp } from "@/models/app";
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
import dynamic from "next/dynamic";

const Web3MintStellar = dynamic(
  () =>
    import("../web3/minting/Web3MintStellar").then(
      (mod) => mod.Web3MintStellar
    ),
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

export const MysteryCat = () => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const { setGameType } = useGame();
  const mysteryBox = useMemo(() => {
    return mysteryBoxes[ChainType.STELLAR]![0];
  }, []);
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
    return true;
  }, [profile?.quests, mysteryBox.chain, mysteryBox.key]);

  const onRedeem = async () => {
    const result = await QUEST_API.redeemContest(mysteryBox.key);
    if (result.success && result.cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), result.cat],
        cat: result.cat,
        quests: [...(profile?.quests || []), mysteryBox.key],
      });
      setGameType(GameType.HOME);
    }
    if (result.success && result.catpoints) {
      setProfileUpdate({
        quests: [...(profile?.quests || []), mysteryBox.key],
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
          <Tag isSmall>MINT IT NOW, DON'T MISS IT</Tag>
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
                <Web3MintStellar
                  user={profile?._id!}
                  ownedNFTCallback={onRedeem}
                  mysteryBox={mysteryBox}
                />
              </Web3Providers>
            ))}
          <a href="https://lobstr.co/" target="_blank" className="m-auto">
            <PixelButton
              isSmall
              text="I DON'T HAVE A WALLET"
              onClick={() => {}}
            ></PixelButton>
          </a>
        </div>
      </div>
    </div>
  );
};
