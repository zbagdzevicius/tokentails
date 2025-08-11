import { QUEST_API } from "@/api/quest-api";
import { getMultiplier } from "@/constants/cat-utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameModal } from "@/models/game";
import { ChainType } from "@/web3/contracts";
import { chaptersBadges, IMysteryBox } from "@/web3/web3.model";
import { useCallback } from "react";
import {
  catnipChaosChapterBGImage,
  CatnipChaosLevelMap,
  catnipChaosLevelsList,
} from "../Phaser/map";
import { PixelButton } from "../shared/PixelButton";
import { TrailheadsData } from "../shared/QuestsModal";
import { ConnectWallet, Web3Mint } from "../web3/minting/Web3Mint";
import { Web3Providers } from "../web3/Web3Providers";

export const CatnipChaosLevels = ({
  setSelectedLevel,
}: {
  setSelectedLevel: (level: string) => void;
}) => {
  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const { setOpenedModal } = useGame();
  const unlockedLevels = [...(profile?.catnipChaos || [])].filter(
    (level) => level > 0
  ).length;
  const multiplier = getMultiplier(profile?.cat);
  const isGuard = profile?.codex?.filter((item) => item === 1)?.length || 0;
  const havePassToPlay = multiplier >= 15 || isGuard;

  const selectLevel = (level: string, index: number) => {
    if (index > unlockedLevels && !havePassToPlay) {
      showToast({
        message: "You need to complete previous levels to play this level",
        img: "/purrquest/sprites/key.png",
      });
      return;
    }
    setSelectedLevel(level);
  };

  const onRedeem = async (mysteryBox: IMysteryBox) => {
    const result = await QUEST_API.complete(mysteryBox.key);
    if (result.success) {
      setProfileUpdate({
        quests: [...(profile?.quests || []), mysteryBox.key],
        catpoints: (profile?.catpoints || 0) + 10000,
      });
      showToast({ message: result.message });
    }
  };

  const isRedeemed = useCallback(
    (mysteryBox: IMysteryBox) => {
      return !!profile?.quests?.includes(mysteryBox.key);
    },
    [profile?.quests]
  );
  return (
    <div className="flex flex-col items-center gap-4 mt-14 lg:mt-24 pb-20 animate-opacity">
      <div className="flex flex-col md:flex-row lg:flex-col gap-4 items-center">
        <img
          src="/game/select/catnip-chaos.webp"
          className="aspect-square w-36 md:w-20 lg:w-48 rounded-2xl"
        />
        <Web3Providers>
          <ConnectWallet />
        </Web3Providers>
      </div>
      <div className="flex flex-wrap gap-4 justify-center max-w-[44rem]">
        {catnipChaosLevelsList.map((level, i) => (
          <div className="flex items-center" key={i}>
            <div
              key={i}
              onClick={() => selectLevel(level, i)}
              style={{
                backgroundImage: `url(${catnipChaosChapterBGImage[level[0]]})`,
                backgroundSize: "cover",
                backgroundPosition: "top",
              }}
              className="hover:brightness-110 clickable relative border hover:border-4 hover:border-yellow-300 hover:scale-110 transition-all flex flex-col items-center justify-center w-20 h-20 rounded-full"
            >
              <div className="z-10 text-center rounded-full flex items-center justify-center text-p1 leading-none font-primary">
                <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                  {level?.split("").join("-")}
                </span>
              </div>
              {!(
                unlockedLevels >= i ||
                (havePassToPlay && level[0] === "5")
              ) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full p-1 w-full h-full z-20">
                  <img className="w-8 h-8" src="/purrquest/sprites/key.png" />
                </div>
              )}
              <span className="font-primary text-p6 flex items-center">
                <img src="/logo/catnip.webp" className="w-4 h-4 mr-1" />
                <span className="">{profile?.catnipChaos?.[i] || 0} / 10</span>
              </span>
              {level[0] === "5" && (
                <img
                  src={TrailheadsData[parseInt(level[1]) - 1].icon}
                  className="w-20 rounded-2xl -mx-6 absolute -left-4 z-40 pixelated"
                />
              )}
              {level === "41" && (
                <img
                  src={
                    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/STICKY/base/RUNNING.gif"
                  }
                  className="w-20 rounded-2xl -mx-6 absolute -left-4 z-40 pixelated"
                />
              )}
              {level === "61" && (
                <img
                  src={
                    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YAK/base/RUNNING.gif"
                  }
                  className="w-20 rounded-2xl -mx-6 absolute -left-4 z-40 pixelated"
                />
              )}
            </div>
            {level[1] === "6" && (
              <div
                className={`flex flex-col items-center ml-4 xl:ml-8 h-full relative ${
                  unlockedLevels >= i ? "pb-8 -mt-3" : ""
                }`}
              >
                {unlockedLevels >= i && (
                  <div className="flex flex-col items-center absolute -bottom-5">
                    {isRedeemed(
                      chaptersBadges[ChainType.CAMP_TEST]![
                        parseInt(level[0]) - 1
                      ]
                    ) ? (
                      <PixelButton
                        text="REDEEMED"
                        isDisabled
                        isSmall
                      ></PixelButton>
                    ) : (
                      <Web3Providers>
                        <Web3Mint
                          hideAddress
                          user={profile?._id!}
                          ownedNFTCallback={() =>
                            onRedeem(
                              chaptersBadges[ChainType.CAMP_TEST]![
                                parseInt(level[0]) - 1
                              ]
                            )
                          }
                          mysteryBox={
                            chaptersBadges[ChainType.CAMP_TEST]![
                              parseInt(level[0]) - 1
                            ]
                          }
                        />
                      </Web3Providers>
                    )}
                  </div>
                )}
                <img
                  src={`/catnip-chaos/badges/chapter${level[0]}.webp`}
                  className="w-20 h-20 rounded-t-xl"
                />
                {!(unlockedLevels >= i || havePassToPlay) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-1 w-full h-full z-20">
                    <img className="w-8 h-8" src="/purrquest/sprites/key.png" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-row items-center gap-8">
        <div className="flex flex-col items-start text-p4 md:text-p2">
          <div className="flex font-secondary text-center items-center gap-1">
            <img src="/logo/catnip.webp" className="w-8 h-8 mr-2" />
            {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0}
            <span>/{Object.keys(CatnipChaosLevelMap).length * 10}</span>
            <span>COLLECTED</span>
          </div>
          <div className="flex font-secondary text-center items-center gap-1">
            <img src="/purrquest/sprites/key.png" className="w-8 h-8 mr-2" />
            {profile?.catnipChaos?.length || 0}
            <span>/{Object.keys(CatnipChaosLevelMap).length}</span>
            <span>COMPLETED LEVELS</span>
          </div>
        </div>
        <div
          onClick={() => setOpenedModal(GameModal.FEATURED_CAT)}
          className="flex hover:brightness-110 flex-col w-24 relative items-center font-secondary rounded-xl px-1 py-2"
          style={{
            backgroundImage: "url(/backgrounds/bg-4.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
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
          <div className="text-p4 font-bold flex items-center gap-1 whitespace-nowrap">
            ABOUT STICKY
          </div>
        </div>
      </div>
    </div>
  );
};
