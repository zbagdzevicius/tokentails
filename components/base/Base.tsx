import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { StartGame, GAME_HEIGHT, GAME_WIDTH } from "./config";
import BaseBus from "./BaseBus";
import { StatusBar } from "../shared/game/StatusBar";
import { StatusType } from "@/models/status";
import { BaseBusEvent } from "./BaseBus.events";
import { useCat } from "@/context/CatContext";
import { CatAbilitySkill, CatConsts } from "@/models/cats";
import { PixelButton } from "../button/PixelButton";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";

export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const BaseGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame(
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
    BaseBus.on("current-scene-ready", (scene_instance: Phaser.Scene) => {
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
      console.log('cool')
    });
    return () => {
      BaseBus.removeListener("current-scene-ready");
    };
  }, [currentActiveScene, ref]);

  return <div id="game-container"></div>;
});

function Base() {
  // The sprite can only be moved in the MainMenu Scene
  //  References to the PhaserGame component (game and scene are exposed)
  const { profile, showProfilePopup } = useFirebaseAuth();
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const { setCat, setStatus, cat } = useCat();
  useEffect(() => {
    if (setCat) {
      setCat(CatConsts[0]);
      console.log(CatConsts[0]);
    }
  }, []);
  useEffect(() => {
    if (profile?.cat) {
      console.log(profile?.cat.spriteImg);
      setTimeout(() => {

        BaseBus.emit(BaseBusEvent.SPAWN_CAT);
      }, 3000)
    }
  }, [profile?.cat]);

  useEffect(() => {
    BaseBus.addListener(BaseBusEvent.EATEN, () => {
      const status = cat?.status[StatusType.EAT] || 0;
      if ((cat?.status[StatusType.EAT] || 0) < 4) {
        setStatus({ type: StatusType.EAT, status: status + 1 });
      }
    });
    BaseBus.addListener(BaseBusEvent.PLAYED, () => {
      const status = cat?.status[StatusType.PLAY] || 0;
      if (status < 4) {
        setStatus({ type: StatusType.PLAY, status: status + 1 });
      }
    });
    console.log({ catStatus: cat?.status });
    return () => {
      BaseBus.removeListener(BaseBusEvent.EATEN);
      BaseBus.removeListener(BaseBusEvent.PLAYED);
    };
  }, [cat?.status]);

  const onPlayClick = useCallback(() => {
    BaseBus.emit(BaseBusEvent.SPAWN_PLAY);
  }, []);

  const onFeedClick = useCallback(() => {
    BaseBus.emit(BaseBusEvent.SPAWN_EAT);
  }, []);

  return (
    <div id="app">
      <div className="fixed right-0 top-0 z-50">
        {cat && (
          <>
            <div className="flex flex-col justify-center relative gap-2 items-end pr-4 pt-1 pl-8 pb-6">
              <div className="z-0 absolute bg-white opacity-50 text-center rounded-bl-full inset-0"></div>
              <StatusBar
                status={cat.status[StatusType.EAT]!}
                type={StatusType.EAT}
              />
              <StatusBar
                status={cat.status[StatusType.PLAY]!}
                type={StatusType.PLAY}
              />
              <div className="flex items-center gap-2 ">
                <img className="w-8 z-10" src="/base/heart.png" />
                <p className="font-bold font-secondary text-p3 z-10">x 9</p>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="fixed bottom-4 left-0 right-0 z-50 flex justify-center gap-2 px-4">
        <PixelButton text="Play" onClick={onPlayClick} />
        <PixelButton text="Feed" onClick={onFeedClick} />
        <PixelButton text="PROFILE" onClick={showProfilePopup} />
        <a href="/adopt">
          <PixelButton text="ADOPT" onClick={onFeedClick} />
        </a>
      </div>
      <BaseGame ref={phaserRef} />
    </div>
  );
}

export default Base;
