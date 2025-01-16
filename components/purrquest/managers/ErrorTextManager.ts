export interface IErrorTextManagerConfig {
  scene: Phaser.Scene;
  fontSize?: number;
  defaultDurationMs?: number;
}

export class ErrorTextManager {
  private scene: Phaser.Scene;
  private errorMessageText!: Phaser.GameObjects.Text;
  private fontSize: number;
  private defaultDurationMs: number;

  constructor(config: IErrorTextManagerConfig) {
    this.scene = config.scene;
    this.fontSize = config.fontSize || 16;
    this.defaultDurationMs = config.defaultDurationMs || 3000;
  }

  public displayError(
    message: string,
    x?: number,
    y?: number,
    durationMs?: number
  ) {
    const defaultX = this.scene.cameras.main.width / 2;
    const defaultY = this.scene.cameras.main.height / 4;

    if (!this.errorMessageText) {
      this.errorMessageText = this.scene.add
        .text(x || defaultX, y || defaultY, message, {
          fontSize: `${this.fontSize}px`,
          color: "#ff0000",
        })
        .setOrigin(0.5)
        .setDepth(10);
    } else {
      this.errorMessageText.setText(message);
      this.errorMessageText.setPosition(x || defaultX, y || defaultY);
      this.errorMessageText.setStyle({ fontSize: `${this.fontSize}px` });
      this.errorMessageText.setVisible(true);
    }

    this.scene.time.delayedCall(durationMs || this.defaultDurationMs, () => {
      this.errorMessageText.setVisible(false);
    });
  }

  public destroy() {
    if (this.errorMessageText) {
      this.errorMessageText.destroy();
    }
  }
}
