import { useCat } from "@/context/CatContext";
import { useProfile } from "@/context/ProfileContext";
import { StatusType } from "@/models/status";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PixelButton } from "../button/PixelButton";
import { StatusBar } from "../shared/game/StatusBar";
import BaseBus from "./BaseBus";
import { BaseBusEvent } from "./BaseBus.events";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";
import { useGameLoadedEvent } from "../catbassadors/hooks";

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
  const { profile } = useProfile();
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const { setCat, setCatStatus, cat } = useCat();
  const isGameLoaded = useGameLoadedEvent();
  useEffect(() => {
    if (setCat && profile?.cat) {
      setCat(profile.cat!);
    }
  }, [profile?.cat]);
  useEffect(() => {
    if (profile?.cat && isGameLoaded) {
      BaseBus.emit(BaseBusEvent.SPAWN_CAT, profile.cat);

      if ((profile.cat.status.EAT || 0) < 4) {
        BaseBus.emit(BaseBusEvent.MEOW);
      }
    }
  }, [profile?.cat, isGameLoaded]);

  useEffect(() => {
    BaseBus.addListener(BaseBusEvent.EATEN, () => {
      const status = cat?.status[StatusType.EAT] || 0;
      if ((cat?.status[StatusType.EAT] || 0) < 4) {
        setCatStatus({ type: StatusType.EAT, status: status + 1 });
      }
    });
    BaseBus.addListener(BaseBusEvent.PLAYED, () => {
      const status = cat?.status[StatusType.PLAY] || 0;
      if (status < 4) {
        setCatStatus({ type: StatusType.PLAY, status: status + 1 });
      }
    });
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

  const [isClicked, setIsClicked] = useState(false);
  useEffect(() => {
    window.onclick = () => {
      setIsClicked(true);
    };
  }, []);

  return (
    <div id="app">
      {isClicked && (
        <audio className="display: none" autoPlay>
          <source
            src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
            type="audio/mpeg"
          />
        </audio>
      )}
      <div className="fixed right-0 top-0 z-50">
        {cat && (
          <>
            <div className="flex flex-col justify-center relative gap-2 items-end pr-2 md:pr-4 pt-1 md:pt-4">
              <StatusBar
                status={cat.status[StatusType.EAT]!}
                type={StatusType.EAT}
              />
              <StatusBar
                status={cat.status[StatusType.PLAY]!}
                type={StatusType.PLAY}
              />
              <div className="flex items-center gap-2 ">
                <p className="font-bold font-secondary text-p3 z-10">9 X</p>
                <img className="w-8 z-10" src="/base/heart.png" />
              </div>
              <div className="flex items-center gap-2 ">
                <p className="font-bold font-secondary text-p3 z-10">
                  {profile?.score || 0} X
                </p>
                <img className="w-8 z-10" src="/logo/coin.webp" />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="fixed bottom-4 left-0 right-0 z-50 flex justify-center gap-2 px-4">
        <PixelButton text="Play" onClick={onPlayClick} />
        <PixelButton text="Feed" onClick={onFeedClick} />
      </div>
      <BaseGame ref={phaserRef} />
    </div>
  );
}

export default Base;
