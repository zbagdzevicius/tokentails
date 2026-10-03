import { Game } from "phaser";
import { makeGameConfig } from "@/components/Phaser/look/makeGameConfig";
import { registerGame } from "@/lib/game/gameRegistry";
import { PixelRescueScene } from "./scenes/PixelRescueScene";
import { useLayoutEffect, useRef } from "react";
import { IPixelRescueProps } from "./scenes/PixelRescueScene";
export const ENEMY_DEBUG_MODE = false;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  pixelArt: true,
  roundPixels: true,
  scene: PixelRescueScene,
  physics: {
    default: "arcade",
    arcade: {
      fps: 240,
      timeScale: 1,
      gravity: { x: 0, y: 600 },
      debug: false,
      tileBias: 32,
      checkCollision: {
        up: true,
        down: true,
        left: true,
        right: true,
      },
      overlapBias: 32,
    },
  },
};

export const StartGame = (props: IPixelRescueProps) => {
  // F10: backing store at CSS size x capped dpr, zoom 1 / dpr, resize-aware.
  const game = new Game(makeGameConfig({ ...config, parent: "game-container" }));
  registerGame(game);
  game.scene.start("PixelRescueScene", props);
  return game;
};

const PixelRescueGame = ({
  level,
  starterShield,
  recordLocalClears,
}: {
  level: string;
  starterShield?: boolean;
  recordLocalClears?: boolean;
}) => {
  const game = useRef<Phaser.Game | null>(null!);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame({
        level,
        starterShield: !!starterShield,
        recordLocalClears: !!recordLocalClears,
      });
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
    // One game per mount: the container keys this component by level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div id="game-container" className="animate-opacity"></div>;
};

export default PixelRescueGame;
