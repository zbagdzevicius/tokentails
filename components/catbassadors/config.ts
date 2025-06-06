import { Game } from "phaser";
import { CatbassadorsScene } from "./scenes/CatbassadorsScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  scene: CatbassadorsScene,
  powerPreference: "high-performance",
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: {
      fps: 60,
      gravity: { x: 0, y: 600 },
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
