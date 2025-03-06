import { AUTO, Game } from "phaser";
import { PurrquestScene } from "./scenes/PurrquestScene";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  transparent: true,
  scene: [PurrquestScene],
  pixelArt: true,
  roundPixels: true,
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
