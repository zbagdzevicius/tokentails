import Phaser from "phaser";
import { TextButton } from "../objects/TextButton"; // Import the TextButton class

export class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  create() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    new TextButton(
      this,
      centerX,
      centerY,
      "Retry",
      { fontSize: "48px", color: "#ffffff" },
      () => {
        console.log("Retry button clicked");
        this.scene.stop("UIScene");
        this.scene.get("DevScene").scene.restart();
      }
    );

    new TextButton(
      this,
      centerX,
      centerY + 100,
      "Exit",
      { fontSize: "48px", color: "#ffffff" },
      () => {
        console.log("Exit button clicked");
        this.scene.stop("UIScene");
        this.scene.start("MainMenu");
      }
    );
  }
}
