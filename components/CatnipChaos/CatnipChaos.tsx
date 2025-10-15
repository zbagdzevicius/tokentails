import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useEffect } from "react";
import { GameEvents } from "../Phaser/events";
import { CatnipChaosLevels } from "./CatnipChaosLevels";
import dynamic from "next/dynamic";

const CatnipChaosGame = dynamic(() => import("./config"), { ssr: false });

function CatnipChaos() {
  const { cat } = useCat();
  const { setLevel, level } = useGame();

  const isGameLoaded = GameEvents.GAME_LOADED.use();

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  return (
    <div id="app" className="z-20 overflow-y-auto max-h-screen">
      {!level && <CatnipChaosLevels setSelectedLevel={setLevel} />}
      {level && <CatnipChaosGame level={level} />}
    </div>
  );
}

export default CatnipChaos;
