import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useEffect } from "react";
import { GameEvents } from "../Phaser/events";
import { catnipChaosChapterBGImage } from "../Phaser/map";
import { PixelRescueLevels } from "./PixelRescueLevels";
import { cdnFile } from "../../constants/utils";

import dynamic from "next/dynamic";

const PixelRescueGame = dynamic(() => import("./config"), { ssr: false });

function PixelRescue() {
  const { cat } = useCat();
  const { setLevel, level } = useGame();
  const isGameLoaded = GameEvents.GAME_LOADED.use();
  const gameUpdate = GameEvents.GAME_UPDATE.use();
  const healthUpdate = GameEvents.CAT_HEALTH_UPDATE.use();
  const objectiveUpdate = GameEvents.OBJECTIVE_UPDATE.use();
  const time = gameUpdate?.time ?? 90;

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      id="app"
      style={{
        backgroundImage: `url(${catnipChaosChapterBGImage["1"]})`,
        backgroundSize: "cover",
        backgroundPosition: "top",
      }}
      className="z-20 overflow-y-auto max-h-screen relative"
    >
      {!level && <PixelRescueLevels setSelectedLevel={setLevel} />}
      {isGameLoaded && objectiveUpdate && (
        <div className="fixed top-4 left-4 md:left-6 z-50 bg-gradient-to-br from-rose-900/60 to-pink-900/60 backdrop-blur-xl px-2 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl border border-pink-400/50 flex flex-col items-center shadow-[0_0_20px_rgba(244,114,182,0.5)] transition-all duration-300">
          <span className="text-pink-200/80 text-[7px] md:text-[9px] uppercase tracking-[0.1em] md:tracking-[0.15em] font-black mb-0.5 flex items-center gap-0.5">
            💝 Quest
          </span>
          <span className="text-xs md:text-base font-bold text-rose-100 drop-shadow-[0_2px_8px_rgba(251,113,133,0.7)] text-center leading-tight">
            {objectiveUpdate.objective}
          </span>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 md:w-10 h-0.5 bg-gradient-to-r from-transparent via-pink-400/50 to-transparent rounded-full" />
        </div>
      )}

      {level && isGameLoaded && (
        <div className="fixed top-4 right-4 md:top-6 md:right-6 z-50 bg-gradient-to-br from-rose-900/60 to-pink-800/60 backdrop-blur-xl px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl border-2 border-pink-400/50 flex flex-col items-center shadow-[0_0_30px_rgba(244,114,182,0.6)] transition-all duration-300 hover:scale-105">
          <span className="text-pink-200/80 text-[6px] md:text-xs uppercase tracking-wider font-black mb-0.5 flex items-center gap-1">
            Time
          </span>
          <span
            className={`text-lg md:text-xl font-mono font-bold tabular-nums drop-shadow-[0_2px_10px_rgba(251,113,133,0.8)] ${
              time <= 10 ? "text-red-300 animate-pulse" : "text-rose-100"
            }`}
          >
            {formatTime(time)}
          </span>
        </div>
      )}

      {level && isGameLoaded && healthUpdate && (
        <div className="fixed top-20 left-4 md:left-6 z-50 flex items-center transition-all duration-300">
          <div className="relative w-8 h-8 md:w-12 md:h-12 z-10">
            <img
              src={cdnFile("pixel-rescue/items/heart.webp")}
              alt="Health"
              className="w-full h-full object-contain"
              style={{
                imageRendering: "pixelated",
              }}
            />
          </div>
          <div className="relative -ml-4 -top-1">
            <div
              className="relative bg-black p-[2px] md:p-1 rounded-sm"
              style={{
                imageRendering: "pixelated",
              }}
            >
              <div className="relative w-24 md:w-36 h-3 md:h-4 bg-gray-800 rounded-sm overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full transition-all duration-300"
                  style={{
                    width: `${
                      (healthUpdate.health / healthUpdate.maxHealth) * 100
                    }%`,
                    background:
                      "linear-gradient(to bottom, #fb7185 0%, #f43f5e 50%, #fb7185 100%)",
                    imageRendering: "pixelated",
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {level && <PixelRescueGame level={level} />}
    </div>
  );
}

export default PixelRescue;
