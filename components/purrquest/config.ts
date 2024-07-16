import { AUTO, Game } from "phaser";
import { Boot } from "./scenes/Boot";
import { GameOver } from "./scenes/GameOver";
import { Game as MainGame } from "./scenes/Game";
import { MainMenu } from "./scenes/MainMenu";
import { Preloader } from "./scenes/Preloader";
import { DevScene } from "./scenes/DevScene";
// import { ProceduralLevelGenerator } from "./level/ProceduralLevelGenerator";
//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
export const GAME_WIDTH = window.innerWidth;
// export const GAME_WIDTH = 1000 || window.innerWidth;
export const GAME_HEIGHT = window.innerHeight;
// export const GAME_HEIGHT = 768 || window.innerHeight;

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  backgroundColor: "#34eb6b",
  // scene: [Boot, Preloader, MainMenu, MainGame, GameOver],
  scene: [DevScene, GameOver],
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 500 },
      debug: true,
    },
  },
};

export const StartGame = (parent: string, width: number, height: number) => {
  return new Game({ ...config, parent, width, height });
};
