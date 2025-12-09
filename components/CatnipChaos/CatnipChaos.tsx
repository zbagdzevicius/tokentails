import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useEffect } from "react";
import { GameEvents } from "../Phaser/events";
import { CatnipChaosLevels } from "./CatnipChaosLevels";
import dynamic from "next/dynamic";
import { ProgressBar } from "./ProgressBar";
import { cdnFile } from "@/constants/utils";

const CatnipChaosGame = dynamic(() => import("./config"), { ssr: false });

function CatnipChaos() {
  const { cat } = useCat();
  const { setLevel, level, progress } = useGame();

  const isGameLoaded = GameEvents.GAME_LOADED.use();

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  return (
    <div id="app" className="relative z-20 overflow-y-auto max-h-screen">
      {!level && <CatnipChaosLevels setSelectedLevel={setLevel} />}
      {level && (
        <>
          <CatnipChaosGame level={level} />
          {level !== "01" && <ProgressBar progress={progress} />}
          <div className="absolute top-0 right-0 mt-safe">
            <img
              draggable={false}
              src={cdnFile("icons/pixel-close.png")}
              className={`hover:brightness-150 hover:translate hover:scale-125 lg:w-9 w-7 lg:h-9 h-7 mt-3 -mb-9 lg:-mb-10 ml-auto mr-4 z-[90]`}
              onClick={() => setLevel(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default CatnipChaos;
