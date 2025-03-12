import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameModal } from "@/models/game";
import { forwardRef, useLayoutEffect, useRef } from "react";
import { useBackground } from "../../constants/hooks";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StartGame } from "./config";

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
      game.current = StartGame();

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
  const { isStarted, playGame, setOpenedModal } = useGame();
  const background = useBackground();
  const { profile } = useProfile();

  return (
    <div style={background} id="app">
      {!isStarted && (
        <div
          className="absolute top-16 lg:top-24 z-[2] left-1/2 -translate-x-1/2 pt-2 rounded-lg px-4 animate-appear flex flex-col md:flex-row lg:flex-col"
          style={{
            backgroundImage: "url(/backgrounds/bg-5.png)",
            backgroundSize: "100% 100%",
            backgroundPosition: "center",
          }}
        >
          <div className="flex flex-col">
            <img
              className="w-28 aspect-square m-auto rounded-t-xl -mb-4 relative z-0"
              src="/game/select/purrquest.jpg"
              draggable="false"
            />
            <div className="relative z-10">
              <Tag>HOW TO PLAY</Tag>
            </div>
            <div className="flex gap-2 items-center font-secondary text-p3">
              <span>Find KEY</span>
              <img className="h-8" src="purrquest/sprites/key.png"></img>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-row items-center gap-2  font-secondary text-p3">
                <span className="whitespace-nowrap">OPEN TREASURE</span>
                <img className="h-8" src="logo/chest.webp"></img>
              </div>
              <div className="sm:hidden lg:flex ">
                <PixelButton
                  onClick={() => {
                    setOpenedModal(GameModal.CONTROL_SETTINGS);
                  }}
                  text="CONTROLS"
                  isSmall
                ></PixelButton>
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <div>
              <Tag>PRIZE</Tag>
            </div>
            <div className="flex gap-2 justify-center items-center font-secondary text-p3 mt-2">
              <img className="h-8" src="logo/coin.webp"></img>
              <span className="whitespace-nowrap">WIN 5000+</span>
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
        </div>
      )}
      <PhaserGame ref={phaserRef} />
    </div>
  );
};

export default Purrquest;
