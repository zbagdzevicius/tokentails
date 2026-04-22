import { Scene } from "phaser";

export class FallingColumnManager {
  private sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Scene;
  private hasTriggered: boolean = false;
  private knockbackForce: number = 300;
  private textureHeight: number;
  private textureWidth: number;

  constructor(config: {
    scene: Scene;
    x: number;
    y: number;
    texture: string;
    height: number;
    width: number;
  }) {
    this.scene = config.scene;
    this.textureHeight = config.height;
    this.textureWidth = config.width;

    this.sprite = this.scene.physics.add.sprite(
      config.x,
      config.y,
      config.texture
    );
    this.sprite.setOrigin(0.5, 0.89);
    this.sprite.setDisplaySize(this.textureHeight, this.textureWidth);
    this.sprite.setImmovable(true);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(this.textureHeight, this.textureWidth);
  }

  triggerFall(playerSprite: Phaser.Physics.Arcade.Sprite) {
    if (!this.hasTriggered) {
      this.hasTriggered = true;

      // Add shaking effect for 2 seconds before falling
      const shakeTween = this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + 2,
        duration: 50,
        yoyo: true,
        repeat: 20,
        ease: "Linear",
      });

      // Start falling after 2 seconds
      this.scene.time.delayedCall(2000, () => {
        const isPlayerOnLeft = playerSprite.x < this.sprite.x;
        const rotationAngle = isPlayerOnLeft ? 90 : -90;

        // Apply knockback to player
        const knockbackDirection = isPlayerOnLeft ? -1 : 1;
        playerSprite.setVelocityX(this.knockbackForce * knockbackDirection);
        playerSprite.setVelocityY(-400);

        const height = this.sprite.displayWidth;
        this.sprite.setDisplaySize(this.textureHeight, this.textureWidth);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(this.textureWidth, this.textureHeight);

        if (isPlayerOnLeft) {
          body.setOffset(0, 100);
        } else {
          body.setOffset(-this.textureWidth + 32, 100);
        }

        this.scene.tweens.add({
          targets: this.sprite,
          angle: rotationAngle,
          x: this.sprite.x + height / 2,
          duration: 2500,
          ease: "Cubic.easeIn",
          onComplete: () => {
            const body = this.sprite.body as Phaser.Physics.Arcade.Body;
            body.setImmovable(true);
          },
        });
      });
    }
  }

  getSprite() {
    return this.sprite;
  }

  destroy() {
    this.sprite.destroy();
  }
}
