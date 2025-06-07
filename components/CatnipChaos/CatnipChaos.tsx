import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GameEvents } from "../Phaser/events";
import { CatnipChaosLevels } from "./CatnipChaosLevels";
import { StartGame } from "./config";
import { ICatnipChaosProps } from "./scenes/CatnipChaos";

const CatnipChaosGame = ({ level }: ICatnipChaosProps) => {
  const game = useRef<Phaser.Game | null>(null!);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame({ level });
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, []);

  return <div id="game-container" className="animate-opacity"></div>;
};

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
    <div id="app" className="z-20">
      {!level && <CatnipChaosLevels setSelectedLevel={setLevel} />}
      {level && <CatnipChaosGame level={level} />}
    </div>
  );
}

export default CatnipChaos;
