import { ICat } from "@/models/cats";
import { IProfile } from "@/models/profile";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import CatbassadorsBus from "./CatbassadorsBus";
import { CatbassadorsBusEvent } from "./CatbassadorsBus.events";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";
import { useGameLoadedEvent } from "./hooks";

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

export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const CatbassadorsGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame(
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
    CatbassadorsBus.on(
      "current-scene-ready",
      (scene_instance: Phaser.Scene) => {
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
      }
    );
    return () => {
      CatbassadorsBus.removeListener("current-scene-ready");
    };
  }, [currentActiveScene, ref]);

  return <div id="game-container"></div>;
});

interface ICatbassadorsProps {
  cat: ICat;
  profile: IProfile;
  timer: number;
}

const Catbassadors = ({ cat, profile, timer }: ICatbassadorsProps) => {
  // The sprite can only be moved in the MainMenu Scene
  //  References to the PhaserGame component (game and scene are exposed)
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const isGameLoaded = useGameLoadedEvent();

  useEffect(() => {
    if (cat && isGameLoaded) {
      CatbassadorsBus.emit(CatbassadorsBusEvent.SPAWN_CAT, cat);
      setTimeout(() => {
        CatbassadorsBus.emit(CatbassadorsBusEvent.SPAWN_CAT, cat);
      }, 1000);
    }
  }, [cat, isGameLoaded]);

  return (
    <div id="app">
      <div className="fixed right-0 top-0 z-50">
        {cat && (
          <>
            <div className="flex flex-col justify-center relative gap-2 items-end pr-2 md:pr-4 pt-1 md:pt-4">
              {timer !== 0 && (
                <div className="flex items-center gap-2 ">
                  <p className="font-bold font-secondary text-p3 z-10">
                    {timer} s
                  </p>
                  <img className="w-8 z-10" src="/icons/clock.png" />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <CatbassadorsGame ref={phaserRef} />
    </div>
  );
};

export default Catbassadors;
