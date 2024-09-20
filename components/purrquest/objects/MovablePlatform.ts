export class MovablePlatform extends Phaser.Physics.Arcade.Sprite {
  private speed: number;
  private direction: number;
  private distance: number;
  private startPositionX: number;
  private traveledDistance: number = 0;
  private isOneWay: boolean;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    speed: number = 100,
    distance: number = 200,
    isOneWay: boolean = false
  ) {
    super(scene, x, y, texture);
    this.speed = speed;
    this.direction = 1;
    this.distance = distance;
    this.startPositionX = x;
    this.isOneWay = isOneWay;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setImmovable(true);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.setupCollision();
  }

  update() {
    if (this.body) {
      this.setVelocityX(this.speed * this.direction);
      this.traveledDistance = Math.abs(this.x - this.startPositionX);
      if (this.traveledDistance >= this.distance) {
        this.direction *= -1;
        this.startPositionX = this.x;
      }
    }
  }
  private setupCollision() {
    if (this.body) {
      this.body.checkCollision.up = true;
      this.body.checkCollision.down = !this.isOneWay;
      this.body.checkCollision.left = true;
      this.body.checkCollision.right = true;
    }
  }
  changeDirection(side: "left" | "right") {
    if (side === "left") {
      this.direction = 1;
    } else if (side === "right") {
      this.direction = -1;
    }
  }

  static isPlayerOnPlatform(
    player: Phaser.Physics.Arcade.Sprite,
    platform: MovablePlatform
  ) {
    return player.body!.touching.down && platform.body!.touching.up;
  }
}
