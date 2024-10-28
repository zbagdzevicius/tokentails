import { GameEvents } from "@/components/Phaser/events";
import { Scene } from "phaser";

export class Game extends Scene {
  camera!: Phaser.Cameras.Scene2D.Camera;
  background!: Phaser.GameObjects.Image;
  gameText!: Phaser.GameObjects.Text;

  constructor() {
    super("Game");
  }

  create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0x00ff00);

    this.gameText = this.add
      .text(
        512,
        384,
        "Make something fun!\nand share it with us:\nsupport@phaser.io",
        {
          fontFamily: "Arial Black",
          fontSize: 38,
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 8,
          align: "center",
        }
      )
      .setOrigin(0.5)
      .setDepth(100);

    GameEvents.GAME_LOADED.push({ scene: this });
  }

  preload() {
    // this.load.image("background", "assets/bg.png"););
  }

  changeScene() {
    this.scene.start("GameOver");
  }
}
