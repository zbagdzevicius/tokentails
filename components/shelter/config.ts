import { Game } from "phaser";
import { ShelterScene } from "./scenes/ShelterScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  powerPreference: "high-performance",
  scene: ShelterScene,
  pixelArt: true,
  roundPixels: true,
  dom: {
    createContainer: true, // Enable DOM element rendering
  },
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
