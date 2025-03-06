import { Game } from "phaser";
import { StoryModeScene } from "./scenes/StoryModeScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  dom: {
    createContainer: true, // Enable DOM element rendering
  },
  pixelArt: true,
  roundPixels: true,
  scene: StoryModeScene,
  physics: {
    default: "arcade",
    arcade: {
      fps: 60,
      gravity: { x: 0, y: 700 },
      debug: true,
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
