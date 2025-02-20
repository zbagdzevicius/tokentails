import Phaser from "phaser";

export interface IFanConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  windStrength: number;
  windDirection: Phaser.Math.Vector2;
  texture: string;
}

export class FanManager {
  private scene: Phaser.Scene;
  private fanSprite: Phaser.GameObjects.Sprite;
  private windZone: Phaser.GameObjects.Zone;
  private windStrength: number;
  private windDirection: Phaser.Math.Vector2;

  constructor(config: IFanConfig) {
    this.scene = config.scene;
    this.windStrength = config.windStrength;
    this.windDirection = config.windDirection;

    // Create the fan sprite
    this.fanSprite = this.scene.add.sprite(config.x, config.y, config.texture);
    this.fanSprite.setOrigin(0.5, 0);
    this.fanSprite.play("fan-anim");

    // Initialize windZone and adjust dimensions based on direction
    this.windZone = this.scene.add.zone(config.x, config.y, 96, 264);
    this.updateWindZone();

    this.scene.physics.add.existing(this.windZone);
    (this.windZone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (this.windZone.body as Phaser.Physics.Arcade.Body).setImmovable(true);
  }

  setupPlayerInteraction(player: Phaser.Physics.Arcade.Sprite) {
    this.scene.physics.add.overlap(player, this.windZone, () => {
      const windForce = this.windDirection.clone().scale(this.windStrength);
      player.setVelocity(
        player.body!.velocity.x + windForce.x,
        player.body!.velocity.y + windForce.y
      );
    });
  }

  /**
   * Adjusts the wind zone's position and size based on the wind direction.
   */
  updateWindZone() {
    const isVertical = Math.abs(this.windDirection.y) > 0;
    const isUpward = this.windDirection.y < 0;
    const isDownward = this.windDirection.y > 0;
    const isLeftward = this.windDirection.x < 0;
    const isRightward = this.windDirection.x > 0;

    // Adjust the dimensions and position of the wind zone
    if (isVertical) {
      this.windZone.setSize(96, 132);
      if (isUpward) {
        this.windZone.setPosition(this.fanSprite.x, this.fanSprite.y - 64);
      } else if (isDownward) {
        this.windZone.setPosition(this.fanSprite.x, this.fanSprite.y + 64);
      }
    } else if (isLeftward || isRightward) {
      this.windZone.setSize(132, 96);
      if (isLeftward) {
        this.windZone.setPosition(this.fanSprite.x - 64, this.fanSprite.y);
      } else if (isRightward) {
        this.windZone.setPosition(this.fanSprite.x + 64, this.fanSprite.y);
      }
    }
  }

  updateWindDirection(newDirection: Phaser.Math.Vector2) {
    this.windDirection = newDirection;
    this.updateWindZone();
  }

  update() {
    // Optional: Add fan animation or dynamic effects here
  }

  destroy() {
    if (this.fanSprite) {
      this.fanSprite.destroy();
    }
  }
}
