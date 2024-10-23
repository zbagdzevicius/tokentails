import { useCat } from "@/context/CatContext";
import { StatusType } from "@/models/status";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useCatChangeEvent, useGameLoadedEvent } from "../catbassadors/hooks";
import { StatusBar } from "../shared/game/StatusBar";
import BaseBus from "./BaseBus";
import { BaseBusEvent } from "./BaseBus.events";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";
import { useGame } from "@/context/GameContext";

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
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const { setCatStatus, cat } = useCat();
  const { setGameType } = useGame();
  useCatChangeEvent(({ detail: newCat }) => {
    if (newCat) {
      phaserRef.current?.scene?.scene.restart();
      setTimeout(() => {
        BaseBus.emit(BaseBusEvent.SPAWN_CAT, newCat);
      }, 1000);
    }
  });
  const isGameLoaded = useGameLoadedEvent();
  useEffect(() => {
    if (cat && isGameLoaded) {
      if (!(phaserRef.current?.scene as any)?.cat) {
        BaseBus.emit(BaseBusEvent.SPAWN_CAT, cat);
      }

      if ((cat.status.EAT || 0) < 4) {
        BaseBus.emit(BaseBusEvent.MEOW);
      }
    }
  }, [cat, isGameLoaded]);

  useEffect(() => {
    BaseBus.addListener(BaseBusEvent.EATEN, () => {
      if ((cat?.status[StatusType.EAT] || 0) < 4) {
        setCatStatus({ type: StatusType.EAT, status: 4 });
      }
    });
    return () => {
      BaseBus.removeListener(BaseBusEvent.EATEN);
    };
  }, [cat?.status]);

  useEffect(() => {
    if (cat?.status.EAT === 4) {
      setGameType(null);
    }
  }, [cat, setGameType])

  const [isClicked, setIsClicked] = useState(false);
  useEffect(() => {
    window.onclick = () => {
      setIsClicked(true);
    };
  }, []);

  return (
    <div id="app" className="z-20">
      {isClicked && (
        <audio className="display: none" autoPlay>
          <source
            src="https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music/music.mp3"
            type="audio/mpeg"
          />
        </audio>
      )}
      <div className="fixed right-1/2 translate-x-[50%] z-50">
        {cat && (
          <div className="flex flex-col justify-center relative gap-2 items-end pr-2 md:pr-4 pt-1 md:pt-4">
            <StatusBar
              status={cat.status[StatusType.EAT]!}
              type={StatusType.EAT}
            />
          </div>
        )}
      </div>
      <BaseGame ref={phaserRef} />
    </div>
  );
}

export default Base;
