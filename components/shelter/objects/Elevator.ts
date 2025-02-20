import { Scene } from "phaser";

export class Elevator {
  private scene: Scene;
  public sprite: Phaser.Physics.Arcade.Sprite;
  private startY: number;
  private timer: number = 0;
  private isPlayerOn: boolean = false;
  private isMovingUp: boolean = false;
  private readonly ELEVATOR_SPEED: number = 175;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private lastPlayerOnTime: number = 0;
  private readonly PLAYER_GRACE_PERIOD: number = 700;

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
    this.sprite.setDisplaySize(96, 32);

    scene.physics.add.collider(this.sprite, this.groundLayer);
  }

  update(delta: number) {
    const currentTime = this.scene.time.now;

    const isWithinGracePeriod =
      currentTime - this.lastPlayerOnTime < this.PLAYER_GRACE_PERIOD;
    const shouldMoveUp = this.isPlayerOn || isWithinGracePeriod;

    if (shouldMoveUp) {
      const tileAbove = this.groundLayer.getTileAtWorldXY(
        this.sprite.x,
        this.sprite.y - 96,
        true
      );

      if (tileAbove && tileAbove.index !== -1) {
        this.sprite.setVelocityY(0);
      } else {
        this.sprite.setVelocityY(-this.ELEVATOR_SPEED);
      }
    } else {
      if (this.sprite.y < this.startY) {
        const tileBelow = this.groundLayer.getTileAtWorldXY(
          this.sprite.x,
          this.sprite.y + 32,
          true
        );

        if (tileBelow && tileBelow.index !== -1) {
          this.sprite.setVelocityY(0);
        } else {
          this.sprite.setVelocityY(this.ELEVATOR_SPEED);
        }
      } else {
        this.sprite.setVelocityY(0);
        this.sprite.y = this.startY;
      }
    }
  }

  setPlayerOn(isOn: boolean) {
    this.isPlayerOn = isOn;
    if (isOn) {
      this.lastPlayerOnTime = this.scene.time.now;
    }
    this.timer = 0;
  }
}
