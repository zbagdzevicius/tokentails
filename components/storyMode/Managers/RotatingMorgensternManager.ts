import Phaser from "phaser";

export interface IRotatingMorgensternManagerConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  platformsLayer: Phaser.Tilemaps.TilemapLayer;
  x: number; // Center point for rotation
  y: number; // Center point for rotation
  radius: number; // Radius of the circular path
  speed?: number; // Speed of rotation (angular velocity)
  texture: string; // Texture for the Morgenstern sprite
  chainTexture: string; // Texture for the chain
}

export class RotatingMorgensternTrapManager {
  private scene: Phaser.Scene;
  private centerX: number;
  private centerY: number;
  private radius: number;
  private angle: number;
  private speed: number;
  private morgenstern: Phaser.Physics.Arcade.Sprite;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private chain: Phaser.GameObjects.TileSprite;

  constructor(config: IRotatingMorgensternManagerConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;

    this.centerX = config.x;
    this.centerY = config.y;
    this.radius = config.radius;
    this.angle = 0;
    this.speed = config.speed || 0.05;

    // Create the Morgenstern sprite
    this.morgenstern = this.scene.physics.add.sprite(
      this.centerX + this.radius,
      this.centerY,
      config.texture
    );
    this.morgenstern.setOrigin(0.5, 0.5).setDepth(2).setScale(1.5);
    this.morgenstern.setImmovable(true);
    if (this.morgenstern.body instanceof Phaser.Physics.Arcade.Body) {
      this.morgenstern.body.setAllowGravity(false);
    }

    // Create the chain
    this.chain = this.scene.add.tileSprite(
      this.centerX,
      this.centerY,
      this.radius,
      10, // Adjust the height as needed for the chain's appearance
      config.chainTexture
    );
    this.chain.setOrigin(0, 0.5).setDepth(1);

    // Add rotation animation
    this.scene.tweens.add({
      targets: this.morgenstern,
      angle: 360,
      duration: 1000,
      repeat: -1,
    });

    // Add collision with ground layer
    this.scene.physics.add.collider(
      this.morgenstern,
      this.groundLayer,
      this.handleCollision,
      undefined,
      this
    );
  }

  handleCollision(): void {
    this.speed = -this.speed;
  }

  update(time: number, delta: number): void {
    this.angle += this.speed * (delta / 16.66);

    const x = this.centerX + this.radius * Math.cos(this.angle);
    const y = this.centerY + this.radius * Math.sin(this.angle);

    this.morgenstern.setPosition(x, y);

    const distance = Phaser.Math.Distance.Between(
      this.centerX,
      this.centerY,
      x,
      y
    );
    this.chain.setDisplaySize(distance, this.chain.height);
    this.chain.setRotation(
      Phaser.Math.Angle.Between(this.centerX, this.centerY, x, y)
    );

    const tile = this.groundLayer.getTileAtWorldXY(x, y);
    if (tile && tile.index !== -1) {
      this.handleCollision();
    }
  }

  destroy(): void {
    this.morgenstern.destroy();
    this.chain.destroy();
  }
  getMorgenstern(): Phaser.Physics.Arcade.Sprite {
    return this.morgenstern;
  }
}
