import { Game } from "phaser";
import { CatnipChaosScene } from "./scenes/CatnipChaos";

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
      fps: 60,
      gravity: { x: 0, y: 700 },
      debug: false,
    },
  },
};

export const StartGame = () => {
  return new Game({
    ...config,
    parent: "game-container",
    width: window.innerWidth,
    height: window.innerHeight,
  });
};
