import { Game } from "phaser";
import { BaseScene } from "./scenes/BaseScene";

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
export const GAME_WIDTH = window.innerWidth;
// export const GAME_WIDTH = 1000 || window.innerWidth;
export const GAME_HEIGHT = window.innerHeight;
// export const GAME_HEIGHT = 768 || window.innerHeight;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-container",
  backgroundColor: "#fff",
  scene: BaseScene,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 800 },
      debug: false,
    },
  },
};

export const StartGame = (parent: string, width: number, height: number) => {
  return new Game({ ...config, parent, width, height });
};
