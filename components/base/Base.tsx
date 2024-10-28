import { useCat } from "@/context/CatContext";
import { StatusType } from "@/models/status";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { StatusBar } from "../shared/game/StatusBar";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const BaseGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
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
    const scene = event.scene;
    if (currentActiveScene && typeof currentActiveScene === "function") {
      currentActiveScene(scene);
    }

    if (typeof ref === "function") {
      ref({ game: game.current, scene });
    } else if (ref) {
      ref.current = {
        game: game.current,
        scene: event.scene,
      };
    }
  });

  return <div id="game-container"></div>;
});

function Base() {
  const phaserRef = useRef<IPhaserGame | null>(null);
  const { setCatStatus, cat } = useCat();

  const isGameLoaded = GameEvents.GAME_LOADED.use();
  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });

      if ((cat.status.EAT || 0) < 4) {
        GameEvents.CAT_MEOW.push({ cat });
      }
    }
  }, [cat, isGameLoaded]);

  useEffect(() => {
    const setStatus = () => {
      if ((cat?.status[StatusType.EAT] || 0) < 4) {
        setCatStatus({ type: StatusType.EAT, status: 4 });
      }
    };
    GameEvents.CAT_EATEN.addEventListener(setStatus);

    return () => {
      GameEvents.CAT_EATEN.removeEventListener(setStatus);
    };
  }, [cat?.status]);

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
