import { AUTO, Game } from "phaser";
import { DevScene } from "./scenes/DevScene";
import { GameOver } from "./scenes/GameOver";
import { Preloader } from "./scenes/Preloader";
import { UIScene } from "./scenes/UIScene";

export const GAME_WIDTH = window.innerWidth;
export const GAME_HEIGHT = window.innerHeight;

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  transparent: true,
  scene: [DevScene, GameOver, UIScene, Preloader],
  physics: {
    default: "arcade",
    arcade: {
      fps: 60,
      gravity: { x: 0, y: 500 },
      debug: false,
    },
  },
};

export const StartGame = (parent: string, width: number, height: number) => {
  return new Game({ ...config, parent, width, height });
};
