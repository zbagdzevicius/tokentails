import { Game } from "phaser";
import { CatnipChaosScene, ICatnipChaosProps } from "./scenes/CatnipChaos";

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
      tileBias: 128,
      checkCollision: {
        up: true,
        down: true,
        left: true,
        right: true
      },
      overlapBias: 64,
      fixedStep: true
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
