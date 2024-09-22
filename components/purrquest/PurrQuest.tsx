import { useGame } from "@/context/GameContext";
import { ICat } from "@/models/cats";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { useBackground } from "../catbassadors/hooks";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";
import { EventBus } from "./EventBus";
export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame(
  { currentActiveScene },
  ref
) {
  const game = useRef<Phaser.Game | null>(null!);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame("game-container", GAME_WIDTH, GAME_HEIGHT);

      if (typeof ref === "function") {
        ref({ game: game.current, scene: null });
      } else if (ref) {
        ref.current = { game: game.current, scene: null };
      }
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, [ref]);

  useEffect(() => {
    EventBus.on("current-scene-ready", (scene_instance: Phaser.Scene) => {
      if (currentActiveScene && typeof currentActiveScene === "function") {
        currentActiveScene(scene_instance);
      }

      if (typeof ref === "function") {
        ref({ game: game.current, scene: scene_instance });
      } else if (ref) {
        ref.current = {
          game: game.current,
          scene: scene_instance,
        };
      }
    });
    return () => {
      EventBus.removeListener("current-scene-ready");
    };
  }, [currentActiveScene, ref]);

  return <div id="game-container"></div>;
});

interface IPurrquestProps {
  cat: ICat;
}

const Purrquest = ({ cat }: IPurrquestProps) => {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const { isStarted } = useGame();
  const background = useBackground();

  return (
    <div style={background} id="app">
      {!isStarted && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2">
          <div className="flex gap-2 items-center font-secondary text-p3">
            <span>Find</span>
            <img className="h-8" src="purrquest/sprites/key.png"></img>
            <span>OPEN</span>
            <img className="h-8" src="logo/chest.webp"></img>
          </div>
          <div className="flex gap-2 justify-center items-center font-secondary text-p3 mt-2">
            <img className="h-8" src="logo/coin.webp"></img>
            <span>WIN 5000</span>
            <img className="h-8" src="logo/coin.webp"></img>
          </div>
        </div>
      )}
      <PhaserGame ref={phaserRef} />
    </div>
  );
};

export default Purrquest;
