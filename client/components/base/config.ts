import { Game } from "phaser";
import { makeGameConfig } from "@/components/Phaser/look/makeGameConfig";
import { registerGame } from "@/lib/game/gameRegistry";
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
  // F10: backing store at CSS size x capped dpr, zoom 1 / dpr, resize-aware.
  const game = new Game(makeGameConfig({ ...config, parent: "game-container" }));
  registerGame(game);
  return game;
};
