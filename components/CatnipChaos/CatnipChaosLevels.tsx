import React from "react";
import {
  catnipChaosChapterBGImage,
  CatnipChaosLevelMap,
  catnipChaosLevelsList,
} from "../Phaser/map";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameModal } from "@/models/game";
import { useGame } from "@/context/GameContext";

export const CatnipChaosLevels = ({
  setSelectedLevel,
}: {
  setSelectedLevel: (level: string) => void;
}) => {
  const { profile } = useProfile();
  const showToast = useToast();
  const { setOpenedModal } = useGame();
  const unlockedLevels = [...(profile?.catnipChaos || [])].filter(
    (level) => level > 0
  ).length;

  const selectLevel = (level: string) => {
    if (level.startsWith("3") && profile?.cat?.name !== "Sticky") {
      showToast({
        message: "You need to select Sticky to play this level",
      });
      return;
    }
    setSelectedLevel(level);
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-14 lg:mt-24">
      <div className="flex flex-col md:flex-row lg:flex-col gap-4 items-center">
        <img
          src="/game/select/catnip-chaos.webp"
          className="aspect-square w-36 md:w-20 lg:w-48 rounded-2xl"
        />
        <div className="flex font-primary text-h5 md:text-h4">
          SELECT A LEVEL
        </div>
      </div>
      <div className="flex flex-wrap gap-4 justify-center max-w-[40rem]">
        {catnipChaosLevelsList.map((level, i) => (
          <div
            key={i}
            onClick={() => selectLevel(level)}
            style={{
              backgroundImage: `url(${catnipChaosChapterBGImage[level[0]]})`,
              backgroundSize: "cover",
              backgroundPosition: "top",
            }}
            className="hover:brightness-125 clickable relative border flex flex-col items-center justify-center w-20 h-20 rounded-full"
          >
            <div className="z-10 text-center rounded-full flex items-center justify-center text-p1 leading-none font-primary">
              <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                {level?.split("").join("-")}
              </span>
            </div>
            {unlockedLevels < i && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full p-1 w-full h-full z-20">
                <img className="w-8 h-8" src="/purrquest/sprites/key.png" />
              </div>
            )}
            <span className="font-primary text-p6 flex items-center">
              <img src="/logo/catnip.webp" className="w-4 h-4 mr-1" />
              <span className="">{profile?.catnipChaos?.[i] || 0} / 10</span>
            </span>
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
