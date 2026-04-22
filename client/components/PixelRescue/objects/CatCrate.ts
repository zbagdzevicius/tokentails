import { Scene } from "phaser";

export class CatCrate extends Phaser.Physics.Arcade.Sprite {
  private containsCat = true;
  private collisionStartTime = 0;
  private isColliding = false;
  private collisionProgress = 0;

  private progressBar!: Phaser.GameObjects.Graphics;
  private readonly RESCUE_TIME = 1500;

  private catSprite?: Phaser.GameObjects.Sprite;
  private catKey?: string;
  private requirementText?: Phaser.GameObjects.Text;
  private coinsRequired: number = 0;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    texture: string = "crate",
    catKey?: string,
  ) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(180, 150);
    body.setOffset(10, 10);

    this.setDisplaySize(70, 70);

    this.catKey = catKey;

    if (catKey) {
      this.catSprite = scene.add.sprite(x - 2, y - 9, catKey);
      this.catSprite.setDisplaySize(48, 48);
      this.catSprite.setDepth(this.depth - 1);
      this.catSprite.setAlpha(0.9);

      const animKey = `${catKey}-anim`;
      if (scene.anims.exists(animKey)) {
        this.catSprite.play(animKey);
      }
    }

    this.progressBar = scene.add.graphics();
    this.progressBar.setDepth(10);

    this.requirementText = scene.add.text(x, y - 50, "", {
      fontSize: "10px",
      fontFamily: "Arial",
      color: "#ffff00",
      stroke: "#000000",
      strokeThickness: 3,
      align: "center",
    });
    this.requirementText.setOrigin(0.5);
    this.requirementText.setDepth(15);
  }

  startCollision(time: number) {
    if (!this.isColliding && this.containsCat) {
      this.isColliding = true;
      this.collisionStartTime = time;
    }
  }

  updateCollision(time: number): boolean {
    if (!this.isColliding || !this.containsCat) {
      this.resetProgress();
      return false;
    }

    const elapsedTime = time - this.collisionStartTime;
    this.collisionProgress = Phaser.Math.Clamp(
      elapsedTime / this.RESCUE_TIME,
      0,
      1,
    );

    this.updateProgressBar();

    if (elapsedTime >= this.RESCUE_TIME) {
      this.onRescueComplete();
      return true;
    }

    return false;
  }

  stopCollision() {
    this.resetProgress();
  }

  private onRescueComplete() {
    this.containsCat = false;
    this.isColliding = false;
    this.resetProgress();

    this.catSprite?.destroy();
    this.catSprite = undefined;
  }

  private resetProgress() {
    this.isColliding = false;
    this.collisionStartTime = 0;
    this.collisionProgress = 0;
    this.progressBar.clear();
  }

  private updateProgressBar() {
    this.progressBar.clear();

    if (!this.containsCat || this.collisionProgress <= 0) return;

    const barWidth = 48;
    const barHeight = 4;
    const barX = this.x - barWidth / 2;
    const barY = this.y - 35;

    this.progressBar.fillStyle(0x000000, 0.5);
    this.progressBar.fillRect(barX, barY, barWidth, barHeight);

    this.progressBar.fillStyle(0x00ff00, 1);
    this.progressBar.fillRect(
      barX,
      barY,
      barWidth * this.collisionProgress,
      barHeight,
    );

    this.progressBar.lineStyle(1, 0xffffff, 1);
    this.progressBar.strokeRect(barX, barY, barWidth, barHeight);
  }

  hasCat(): boolean {
    return this.containsCat;
  }

  getCatSprite(): Phaser.GameObjects.Sprite | undefined {
    return this.catSprite;
  }

  destroy(fromScene?: boolean) {
    if (!fromScene) {
      this.catSprite?.destroy();
      this.progressBar?.destroy();
      this.requirementText?.destroy();
    }
    super.destroy(fromScene);
  }
}
