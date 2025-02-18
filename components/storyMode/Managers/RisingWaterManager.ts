import { Scene } from "phaser";

export interface IRisingPlatformConfig {
  scene: Scene;
  startX: number;
  startY: number;
  width: number;
  height: number;
  speed: number;
  texture?: string;
}

export class RisingWaterManager {
  private scene: Scene;
  private waterSprite: Phaser.GameObjects.TileSprite;
  private speed: number;

  constructor(config: IRisingPlatformConfig) {
    this.scene = config.scene;
    this.speed = config.speed;

    this.waterSprite = this.scene.add.tileSprite(
      config.startX,
      config.startY,
      config.width, // Full width
      config.height, // Full height
      "water"
    );

    // Add physics
    this.scene.physics.add.existing(this.waterSprite, true);
  }

  update(delta: number) {
    const waterBody = this.waterSprite.body as Phaser.Physics.Arcade.StaticBody;

    // Move water upwards
    this.waterSprite.y -= (this.speed * delta) / 1000;
    waterBody.y -= (this.speed * delta) / 1000;
    waterBody.updateFromGameObject();

    // Scroll the texture to create an animation effect
    this.waterSprite.tilePositionX += 0.3; // Adjust speed as needed
  }

  getPlatform() {
    return this.waterSprite;
  }

  destroy() {
    if (this.waterSprite) {
      this.waterSprite.destroy();
    }
  }
}
