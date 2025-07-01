import { currentDayCoin } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { ICat } from "@/models/cats";
import { GameModal } from "@/models/game";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StartGame } from "./config";

export interface IGameOverEvent extends Event {
  detail: {
    score: number;
  };
}

export interface GameStartEvent extends Event {
  detail: {
    start: boolean;
  };
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const CatbassadorsGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
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

interface ICatbassadorsProps {
  cat: ICat;
  timer: number;
}

const Catbassadors = ({ cat, timer }: ICatbassadorsProps) => {
  const phaserRef = useRef<IPhaserGame | null>(null);
  const isGameLoaded = GameEvents.GAME_LOADED.use();
  const { isStarted, playGame, setOpenedModal } = useGame();
  const { profile } = useProfile();

  useEffect(() => {
    if (cat && isGameLoaded) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);
  return (
    <div id="app">
      <div className="fixed right-2 md:right-4 top-12 z-50">
        {cat && (
          <>
            <div className="flex flex-col justify-center relative gap-2 items-end">
              {timer !== 0 && (
                <div className="flex items-center gap-2 ">
                  <p className="font-bold font-secondary text-p3 z-10">
                    {timer} s
                  </p>
                  <img
                    draggable={false}
                    className="w-8 z-10"
                    src="/icons/clock.png"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!isStarted && (
        <div
          className="absolute top-16 lg:top-24 z-[2] left-1/2 -translate-x-1/2 bg-yellow-300 pt-2 rounded-lg px-4 flex flex-col md:flex-row lg:flex-col animate-appear"
          style={{
            backgroundImage: "url(/backgrounds/bg-9.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="flex flex-col">
            <img
              className="w-28 aspect-square m-auto rounded-t-xl -mb-4 relative z-0"
              src="/game/select/catbassadors.jpg"
              draggable="false"
            />
            <div className="relative z-10">
              <Tag>HOW TO PLAY</Tag>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-row items-center gap-2  font-secondary text-p3">
                <span>CATCH COINS</span>
                <img
                  draggable={false}
                  className="h-8"
                  src="logo/coin.webp"
                ></img>
              </div>

              <div className="sm:hidden lg:flex">
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
            <Tag>COINS REWARDS</Tag>
            <div className="flex gap-2 items-center justify-center font-secondary text-p4 pt-2">
              <img draggable={false} className="h-6" src="logo/coin.png"></img>
              <span className="whitespace-nowrap">GIVES 1</span>
              <img draggable={false} className="h-6" src="logo/coin.png"></img>
            </div>
            <div className="flex gap-2 items-center justify-center font-secondary text-p4">
              <img draggable={false} className="h-5" src={currentDayCoin}></img>
              <span className="whitespace-nowrap">GIVES 10</span>
              <img draggable={false} className="h-6" src="logo/coin.png"></img>
            </div>
            <div className="flex gap-2 items-center justify-center font-secondary text-p4">
              <img draggable={false} className="h-5" src="logo/coin.webp"></img>
              <span className="whitespace-nowrap">GIVES 100</span>
              <img draggable={false} className="h-6" src="logo/coin.png"></img>
            </div>
            <div className="flex gap-2 items-center justify-center font-secondary text-p4 pb-2">
              <img
                draggable={false}
                className="h-5"
                src="icons/clock.png"
              ></img>
              <span className="whitespace-nowrap">GIVES 1000</span>
              <img draggable={false} className="h-6" src="logo/coin.png"></img>
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
      <CatbassadorsGame ref={phaserRef} />
    </div>
  );
};

export default Catbassadors;
