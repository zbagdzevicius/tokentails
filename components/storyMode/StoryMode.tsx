import { useCat } from "@/context/CatContext";
import { useProfile } from "@/context/ProfileContext";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { StartGame } from "./config";
interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const StoryModeGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
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

  return <div id="game-container" className="animate-opacity"></div>;
});

function StoryMode() {
  const { profile } = useProfile();

  const { cat } = useCat();

  const phaserRef = useRef<IPhaserGame | null>(null);
  const isGameLoaded = GameEvents.GAME_LOADED.use();

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  return (
    <div id="app" className="z-20">
      <StoryModeGame ref={phaserRef} />
    </div>
  );
}

export default StoryMode;
