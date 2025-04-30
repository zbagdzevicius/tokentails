import React from "react";
import {
  catnipChaosChapterBGImage,
  catnipChaosLevelsList,
} from "../Phaser/map";
import { useProfile } from "@/context/ProfileContext";

export const CatnipChaosLevels = ({
  setSelectedLevel,
}: {
  setSelectedLevel: (level: string) => void;
}) => {
  const { profile } = useProfile();
  const unlockedLevels = [...(profile?.catnipChaos || [])].filter(
    (level) => level > 0
  ).length;

  return (
    <div className="flex flex-col items-center gap-4 mt-14 lg:mt-24">
      <img
        src="/game/select/catnip-chaos.webp"
        className="aspect-square w-36 md:w-48 rounded-2xl"
      />
      <div className="flex font-primary text-h5 md:text-h4">SELECT A LEVEL</div>
      <div className="flex flex-wrap gap-4 justify-center max-w-[40rem]">
        {catnipChaosLevelsList.map((level, i) => (
          <div
            key={i}
            onClick={() => i <= unlockedLevels && setSelectedLevel(level)}
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
          </div>
        ))}
      </div>
      <div className="flex flex-col items-start text-p4 md:text-p2">
        <div className="flex font-secondary text-center items-center gap-1">
          <img src="/logo/catnip.webp" className="w-8 h-8 mr-2" />
          {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0}
          <span>/120</span>
          <span>COLLECTED</span>
        </div>
        <div className="flex font-secondary text-center items-center gap-1">
          <img src="/purrquest/sprites/key.png" className="w-8 h-8 mr-2" />
          {profile?.catnipChaos?.length || 0}
          <span>/12</span>
          <span>COMPLETED LEVELS</span>
        </div>
      </div>
    </div>
  );
};
