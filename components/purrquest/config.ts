import { AUTO, Game } from "phaser";
import { PurrquestScene } from "./scenes/PurrquestScene";

export const GAME_WIDTH = window.innerWidth;
export const GAME_HEIGHT = window.innerHeight;

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  transparent: true,
  scene: [PurrquestScene],
  physics: {
    default: "arcade",
    arcade: {
      fps: 60,
      gravity: { x: 0, y: 700 },
      debug: false,
    },
  },
};

export const StartGame = (parent: string, width: number, height: number) => {
  return new Game({ ...config, parent, width, height });
};
