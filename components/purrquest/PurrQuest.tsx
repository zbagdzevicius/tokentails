import { useGame } from "@/context/GameContext";
import { forwardRef, useLayoutEffect, useRef } from "react";
import { useBackground } from "../../constants/hooks";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const PhaserGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
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

  GameEvents.GAME_LOADED.use((event) => {
    if (!event) {
      return;
    }
    if (currentActiveScene && typeof currentActiveScene === "function") {
      currentActiveScene(event.scene);
    }

    if (typeof ref === "function") {
      ref({ game: game.current, scene: event.scene! });
    } else if (ref) {
      ref.current = {
        game: game.current,
        scene: event.scene,
      };
    }
  });

  return <div id="game-container"></div>;
});

const Purrquest = () => {
  const phaserRef = useRef<IPhaserGame | null>(null);
  const { isStarted } = useGame();
  const background = useBackground();

  return (
    <div style={background} id="app">
      {!isStarted && (
        <div className="absolute top-32 md:top-56 left-1/2 -translate-x-1/2 bg-yellow-300 pt-8 pb-4 rounded-lg px-4">
          <div className="flex gap-2 items-center justify-center font-secondary text-p3">
            <span>Find</span>
            <img className="h-8" src="purrquest/sprites/key.png"></img>
            <span>OPEN</span>
            <img className="h-8" src="logo/chest.webp"></img>
          </div>
          <div className="flex gap-2 justify-center items-center font-secondary text-p3 mt-2">
            <img className="h-8" src="logo/coin.webp"></img>
            <span>WIN 5000+</span>
            <img className="h-8" src="logo/coin.webp"></img>
          </div>
          <div className="flex gap-2 justify-center items-center font-secondary text-p3 mt-2">
            <span>CLICK PLAY BELOW</span>
          </div>
          <div className="flex gap-2 justify-center items-center font-secondary text-p3">
            <img className="h-6 rotate-90" src="icons/arrow.webp"></img>
          </div>
        </div>
      )}
      <PhaserGame ref={phaserRef} />
    </div>
  );
};

export default Purrquest;
