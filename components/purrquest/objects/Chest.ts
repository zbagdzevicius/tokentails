export enum ChestAnimation {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  OPENING = "OPENING",
}

const animationConfigurations: {
  key: ChestAnimation;
  frames: number;
  repeat: -1 | 0;
}[] = [
  { key: ChestAnimation.CLOSED, frames: 1, repeat: -1 },
  { key: ChestAnimation.OPEN, frames: 2, repeat: -1 },
  { key: ChestAnimation.OPENING, frames: 4, repeat: 0 },
];

export class Chest extends Phaser.Physics.Arcade.Sprite {
  private isOpen: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "chest");
    this.isOpen = false;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(64, 32);
    this.setImmovable(true);
    this.body!.setSize(64, 32);
    this.body!.setOffset(0, 20);

    this.initAnimations();
    this.play(ChestAnimation.CLOSED);
  }

  private initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      if (!this.scene.anims.exists(animationConfiguration.key)) {
        let startFrame = 0;
        let endFrame = animationConfiguration.frames - 1;

        if (animationConfiguration.key === ChestAnimation.OPENING) {
          startFrame = 1;
          endFrame = 4;
        } else if (animationConfiguration.key === ChestAnimation.OPEN) {
          startFrame = 5;
          endFrame = 6;
        }

        this.scene.anims.create({
          key: animationConfiguration.key,
          frames: this.scene.anims.generateFrameNumbers("chest", {
            start: startFrame,
            end: endFrame,
          }),
          frameRate: 8,
          repeat: animationConfiguration.repeat,
        });
      }
    }
  }

  public open() {
    if (!this.isOpen) {
      this.isOpen = true;
      this.play(ChestAnimation.OPENING);
      this.once(`animationcomplete-${ChestAnimation.OPENING}`, () => {
        this.play(ChestAnimation.OPEN);
      });
    }
  }

  public isChestOpen(): boolean {
    return this.isOpen;
  }
}
