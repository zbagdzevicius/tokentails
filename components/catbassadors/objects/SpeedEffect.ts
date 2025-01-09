import { Scene } from "phaser";

export class SpeedEffect {
  private effectSprite: Phaser.GameObjects.Sprite | null = null;
  private scene: Scene;
  private updateEvent: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  play(target: Phaser.GameObjects.Sprite, duration: number): void {

    this.destroy();

    this.effectSprite = this.scene.add
      .sprite(target.x, target.y, "speed-effect")
      .setVisible(true)
      .setSize(40, 40)
      .setDepth(3)

    this.scene.anims.create({
      key: "speed_effect_animation",
      frames: this.scene.anims.generateFrameNumbers("speed-effect", {
        start: 0,
        end: 44,
      }),
      frameRate: 16,
      repeat: -1,
    });

    this.effectSprite.play("speed_effect_animation");

    this.updateEvent = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (target.active && target.body) {
          const velocityX = target.body.velocity.x;
          const targetX = target.x + velocityX * 0.015;
          this.effectSprite?.setPosition(targetX, target.y);
        } else {
          this.destroy();
        }
      },
    });

    this.scene.time.delayedCall(duration, () => this.destroy());
  }

  destroy(): void {
    if (this.effectSprite) {
      this.effectSprite.destroy();
      this.effectSprite = null;
    }
    if (this.updateEvent) {
      this.updateEvent.remove();
      this.updateEvent = null;
    }
  }
}
