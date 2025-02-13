import { Game } from "phaser";
import { StoryModeScene } from "./scenes/StoryModeScene";

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
export const GAME_WIDTH = window.innerWidth;
// export const GAME_WIDTH = 1000 || window.innerWidth;
export const GAME_HEIGHT = window.innerHeight;
// export const GAME_HEIGHT = 768 || window.innerHeight;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  transparent: true,
  dom: {
    createContainer: true, // Enable DOM element rendering
  },
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

export const StartGame = (parent: string, width: number, height: number) => {
  return new Game({ ...config, parent, width, height });
};
