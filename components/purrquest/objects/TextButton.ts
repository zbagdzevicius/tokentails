import Phaser from "phaser";

export class TextButton extends Phaser.GameObjects.Text {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    callback: () => void
  ) {
    super(scene, x, y, text, style);

    this.setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.enterButtonHoverState())
      .on("pointerout", () => this.enterButtonRestState())
      .on("pointerdown", () => this.enterButtonActiveState())
      .on("pointerup", () => {
        this.enterButtonHoverState();
        console.log(`${text} button clicked`); // Log button click
        callback();
      });

    this.enterButtonRestState();
    scene.add.existing(this);
  }

  enterButtonHoverState() {
    this.setStyle({ fill: "#ff0" });
  }

  enterButtonRestState() {
    this.setStyle({ fill: "#0f0" });
  }

  enterButtonActiveState() {
    this.setStyle({ fill: "#0ff" });
  }
}
