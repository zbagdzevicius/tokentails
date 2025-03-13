import { GameObjects, Physics, Scene } from "phaser";

type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

const gravity = 0.05;
const bounceFactor = 0.7;

export interface ExtendedScene extends Scene {
  groundLayer: Phaser.Tilemaps.TilemapLayer | null;
}

/**
 * A generic physics entity that handles gravity, collision, and bounce logic.
 */
export abstract class BaseCoinPhysicsEntity {
  protected scene: ExtendedScene;
  sprite: Physics.Arcade.Sprite;
  protected vx: number = 5;
  protected vy: number = 5;
  protected bounce: number = bounceFactor;
  private isRotating = true;

  constructor(
    scene: ExtendedScene,
    x: number,
    y: number,
    texture: string,
    disableRotation: boolean = false
  ) {
    if (!scene || !scene.physics) {
      throw new Error(
        "Invalid or uninitialized scene passed to BaseCoinPhysicsEntity."
      );
    }
    this.isRotating = !disableRotation;
    if (!this.isRotating) {
      this.vx = 0;
      this.vy = 0;
    }
    this.scene = scene;

    // Create the sprite
    this.sprite = this.scene.physics.add.sprite(x, y, texture);

    this.sprite.setSize(32, 32).setDepth(3);

    // Example: you might want upward gravity if your tilemap is built that way
    this.sprite.setGravityY(-900);
  }

  update() {
    this.checkCollisions();
    if (this.isRotating) {
      this.applyGravity();
      this.applyRotation();
    }
  }

  protected applyGravity() {
    this.vy += gravity;
    this.sprite.y += this.vy;
    this.sprite.x += this.vx;
  }

  protected applyRotation() {
    this.sprite.rotation += 0.25;
  }

  protected checkCollisions() {
    // Check collision with ground tiles
    const groundTile = this.scene.groundLayer!.getTileAtWorldXY(
      this.sprite.x,
      this.sprite.y + this.sprite.height
    );
    if (groundTile) {
      this.sprite.y = groundTile.getTop() - this.sprite.height;
      this.vy *= -this.bounce;
      if (Math.abs(this.vy) < 1) {
        this.vy = -Math.abs(this.vy) * 0.9;
      }
    }

    // Check collision with tiles on the left
    const leftTile = this.scene.groundLayer!.getTileAtWorldXY(
      this.sprite.x - this.sprite.width / 2,
      this.sprite.y
    );
    if (leftTile) {
      this.sprite.x = leftTile.getRight() + this.sprite.width / 2;
      this.vx *= -this.bounce;
    }

    // Check collision with tiles on the right
    const rightTile = this.scene.groundLayer!.getTileAtWorldXY(
      this.sprite.x + this.sprite.width / 2,
      this.sprite.y
    );
    if (rightTile) {
      this.sprite.x = rightTile.getLeft() - this.sprite.width / 2;
      this.vx *= -this.bounce;
    }

    // Check collision with tiles above
    const topTile = this.scene.groundLayer!.getTileAtWorldXY(
      this.sprite.x,
      this.sprite.y - this.sprite.height / 2
    );
    if (topTile) {
      this.sprite.y = topTile.getBottom() + this.sprite.height / 2;
      this.vy *= -this.bounce;
    }
  }

  addCollider(collider: ColliderType) {
    if (this.sprite) {
      this.scene.physics.add.collider(this.sprite, collider);
    }
  }
}
