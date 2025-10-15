import { Game } from "phaser";
import { CatnipChaosScene, ICatnipChaosProps } from "./scenes/CatnipChaos";
import { useLayoutEffect, useRef } from "react";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  pixelArt: true,
  roundPixels: true,
  scene: CatnipChaosScene,
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

export const StartGame = (props: ICatnipChaosProps) => {
  const game = new Game({
    ...config,
    parent: "game-container",
    width: window.innerWidth,
    height: window.innerHeight,
  });
  game.scene.start("CatnipChaosScene", props);
  return game;
};

const CatnipChaosGame = ({ level }: { level: string }) => {
  const game = useRef<Phaser.Game | null>(null!);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame({ level });
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, []);

  return <div id="game-container" className="animate-opacity"></div>;
};

export default CatnipChaosGame;
