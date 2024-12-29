import { useGame } from "@/context/GameContext";
import { forwardRef, useLayoutEffect, useRef } from "react";
import { useBackground } from "../../constants/hooks";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";
import { Tag } from "../shared/Tag";
import { PixelButton } from "../shared/PixelButton";
import { useProfile } from "@/context/ProfileContext";

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

  return <div id="game-container" className="animate-opacity"></div>;
});

const Purrquest = () => {
  const phaserRef = useRef<IPhaserGame | null>(null);
  const { isStarted, playGame } = useGame();
  const background = useBackground();
  const { profile } = useProfile();

  return (
    <div style={background} id="app">
      {!isStarted && (
        <div
          className="absolute top-16 md:top-24 z-[2] left-1/2 -translate-x-1/2 pt-2 rounded-lg px-4 animate-appear"
          style={{
            backgroundImage: "url(/base/bg-5.png)",
            backgroundSize: "100% 100%",
            backgroundPosition: "center",
          }}
        >
          <img
            className="w-28 aspect-square m-auto rounded-t-xl -mb-4 relative z-0"
            src="/game/select/purrquest.jpg"
          />
          <div className="relative z-10">
            <Tag>HOW TO PLAY</Tag>
          </div>
          <div className="flex gap-2 items-center font-secondary text-p3 pt-2">
            <span>Control CAT</span>
            <img className="h-8" src="images/cats-winners/cat.gif"></img>
          </div>
          <div className="flex gap-2 items-center font-secondary text-p3">
            <span>Find KEY</span>
            <img className="h-8" src="purrquest/sprites/key.png"></img>
          </div>
          <div className="flex gap-2 items-center font-secondary text-p3 pb-2">
            <span>OPEN TREASURE</span>
            <img className="h-8" src="logo/chest.webp"></img>
          </div>
          <Tag>PRIZE</Tag>
          <div className="flex gap-2 justify-center items-center font-secondary text-p3 mt-2">
            <img className="h-8" src="logo/coin.webp"></img>
            <span>WIN 5000+</span>
            <img className="h-8" src="logo/coin.webp"></img>
          </div>
          <div className="flex gap-2 justify-center items-center font-secondary text-p5">
            <span>REACH THE TOP FOR WEEKLY PRIZE</span>
          </div>
          <div className="flex justify-center -mb-6">
            <PixelButton
              active={!profile?.catbassadorsLives}
              onClick={playGame}
              text="Play"
              isBig
            ></PixelButton>
          </div>
        </div>
      )}
      <PhaserGame ref={phaserRef} />
    </div>
  );
};

export default Purrquest;
