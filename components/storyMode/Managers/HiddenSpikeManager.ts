import { Cat } from "@/components/catbassadors/objects/Catbassador";

export interface IHiddenSpikeConfig {
  scene: Phaser.Scene;
  texture: string;
  x: number;
  y: number;
  animationKey: string;
  cat: Cat;
}

export class HiddenSpikeManager {
  private scene: Phaser.Scene;
  private spikes: Phaser.Physics.Arcade.Sprite[] = [];
  private config: IHiddenSpikeConfig;
  private cat: Cat;

  constructor(scene: Phaser.Scene, config: IHiddenSpikeConfig) {
    this.scene = scene;
    this.config = config;
    this.cat = config.cat;

    this.initAnimation();
  }

  private initAnimation() {
    this.scene.anims.create({
      key: this.config.animationKey,
      frames: this.scene.anims.generateFrameNumbers(this.config.texture, {
        start: 0,
        end: 12,
      }),
      frameRate: 8,
      repeat: 0, // Play the animation once and stop
    });
  }

  createSpike(x: number, y: number) {
    const spike = this.scene.physics.add.sprite(x, y, this.config.texture);
    spike.setOrigin(0.5, 0);
    spike.setImmovable(true);
    spike.body.allowGravity = false;
    // Set default collision size to 0 (non-damaging) and disable further collision
    spike.body.setSize(spike.width, 0);
    spike.body.enable = false;

    this.spikes.push(spike);
    this.scene.physics.add.overlap(
      this.cat.sprite,
      spike,
      (obj1, obj2) =>
        this.handlePlayerCollision(
          obj1 as Phaser.Types.Physics.Arcade.GameObjectWithBody,
          obj2 as Phaser.Types.Physics.Arcade.GameObjectWithBody
        ),
      undefined,
      this
    );

    this.startSpikeAnimationWithDelay(spike);
  }

  private startSpikeAnimationWithDelay(spike: Phaser.Physics.Arcade.Sprite) {
    const randomDelay = Phaser.Math.Between(1000, 3000);

    this.scene.time.addEvent({
      delay: randomDelay,
      callback: () => {
        spike.play(this.config.animationKey);
      },
    });

    spike.on("animationcomplete", () => {
      this.startSpikeAnimationWithDelay(spike);
    });
  }

  handlePlayerCollision(
    object1:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    object2:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ) {
    // object1 is the spike and object2 is the player (cat)
    const spike = object1 as Phaser.Physics.Arcade.Sprite;
    const player = object2 as Phaser.Physics.Arcade.Sprite;

    if (spike.anims && player) {
      const currentFrame = spike.anims.currentFrame;
      if (!currentFrame) return;
      const frameIndex = currentFrame.index;

      // Only trigger the kill when the spike is in its active damaging frames
      if (
        (frameIndex >= 2 && frameIndex <= 6) ||
        frameIndex === 7 ||
        frameIndex === 8 ||
        (frameIndex >= 9 && frameIndex <= 11)
      ) {
        (this.scene as any).endGame && (this.scene as any).endGame();
      }
    }
  }

  update() {
    this.spikes.forEach((spike) => {
      const currentFrame = spike.anims.currentFrame;
      if (!currentFrame) {
        spike.body!.setSize(spike.width, 0);
        spike.body!.enable = false;
        return;
      }
      const frameIndex = currentFrame.index;

      // Enable collision only during the active damaging frames.
      if (frameIndex >= 2 && frameIndex <= 6) {
        spike.body!.setSize(spike.width, 8); // Active damaging
        spike.body!.enable = true;
      } else if (frameIndex === 7 || frameIndex === 8) {
        spike.body!.setSize(spike.width, 18); // Active damaging
        spike.body!.enable = true;
      } else if (frameIndex >= 9 && frameIndex <= 11) {
        spike.body!.setSize(spike.width, 8); // Active damaging
        spike.body!.enable = true;
      } else {
        // For frames 0-1 and frame 12, disable collision entirely.
        spike.body!.setSize(spike.width, 0);
        spike.body!.enable = false;
      }
    });
  }

  getSpikes() {
    return this.spikes;
  }

  destroy() {
    this.spikes.forEach((spike) => spike.destroy());
    this.spikes = [];
  }
}
