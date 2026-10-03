import { Game } from "phaser";
import { makeGameConfig } from "@/components/Phaser/look/makeGameConfig";
import { registerGame } from "@/lib/game/gameRegistry";
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
      fps: 240,
      timeScale: 1,
      gravity: { x: 0, y: 600 },
      debug: false,
      tileBias: 128,
      checkCollision: {
        up: true,
        down: true,
        left: true,
        right: true
      },
      overlapBias: 32,
      fixedStep: true
    },
  },
};

export const StartGame = () => {
  // F10: backing store at CSS size x capped dpr, zoom 1 / dpr, resize-aware.
  const game = new Game(makeGameConfig({ ...config, parent: "game-container" }));
  registerGame(game);
  return game;
};
