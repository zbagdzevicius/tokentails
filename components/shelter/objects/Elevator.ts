import { Scene } from "phaser";

export class Elevator {
  private scene: Scene;
  public sprite: Phaser.Physics.Arcade.Sprite;
  private startY: number;
  private timer: number = 0;
  private isPlayerOn: boolean = false;
  private isMovingUp: boolean = false;
  private readonly ELEVATOR_SPEED: number = 175;
  private readonly WAIT_TIME: number = 500;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    groundLayer: Phaser.Tilemaps.TilemapLayer
  ) {
    this.scene = scene;
    this.startY = y;
    this.groundLayer = groundLayer;

    // Create elevator sprite
    this.sprite = scene.physics.add.sprite(x, y, "elevator");
    this.sprite.setImmovable(true);
    (this.sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    this.sprite.setDisplaySize(96, 32); // Adjust size as needed

    // Add collision with ground layer
    scene.physics.add.collider(this.sprite, this.groundLayer);
  }

  update(delta: number) {
    if (this.isPlayerOn) {
      const tileAbove = this.groundLayer.getTileAtWorldXY(
        this.sprite.x,
        this.sprite.y - 96,
        true
      );

      if (tileAbove && tileAbove.index !== -1) {
        // Stop at collision point
        this.sprite.setVelocityY(0);
      } else {
        // Move up
        this.sprite.setVelocityY(-this.ELEVATOR_SPEED);
      }
    } else {
      // When player is not on, move down
      const tileBelow = this.groundLayer.getTileAtWorldXY(
        this.sprite.x,
        this.sprite.y + 32,
        true
      );

      if (tileBelow && tileBelow.index !== -1) {
        // Stop at collision point
        this.sprite.setVelocityY(0);
      } else {
        // Move down
        this.sprite.setVelocityY(this.ELEVATOR_SPEED);
      }
    }
  }

  setPlayerOn(isOn: boolean) {
    this.isPlayerOn = isOn;
    if (!isOn) {
      this.timer = 0;
    }
  }
}
