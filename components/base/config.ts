import { Game } from "phaser";
import { BaseScene } from "./scenes/BaseScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  scene: BaseScene,
  pixelArt: true,
  roundPixels: true,
  dom: {
    createContainer: true, // Enable DOM element rendering
  },
  physics: {
    default: "arcade",
    arcade: {
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
