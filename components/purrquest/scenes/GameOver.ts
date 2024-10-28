import { GameEvents } from "@/components/Phaser/events";
import { Scene } from "phaser";

export class GameOver extends Scene {
  camera!: Phaser.Cameras.Scene2D.Camera;
  background!: Phaser.GameObjects.Image;
  gameOverText!: Phaser.GameObjects.Text;

  constructor() {
    super("GameOver");
  }

  create() {
    this.camera = this.cameras.main;
    this.camera;

    this.gameOverText = this.add
      .text(512, 384, "Game Over", {
        fontFamily: "Arial Black",
        fontSize: 64,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(100);

    GameEvents.GAME_LOADED.push({ scene: this });
  }

  changeScene() {
    this.scene.start("MainMenu");
  }
}
