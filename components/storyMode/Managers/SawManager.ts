export interface ISawConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  x: number;
  y: number;
  route: "horizontal" | "vertical"; // Movement direction
  speed: number; // Movement speed in pixels per second
  distance: number; // Total distance the saw should travel
}

export class Saw {
  private sprite: Phaser.GameObjects.Sprite;
  private config: ISawConfig;
  private direction: number; // 1 for forward, -1 for backward
  private startPosition: { x: number; y: number };
  private distanceLimit: number; // Distance to travel
  private speed: number; // Pixels per second
  private route: "horizontal" | "vertical";

  constructor(config: ISawConfig) {
    this.config = config;
    const { scene, x, y, route, distance, speed } = config;

    // Create the saw sprite
    this.sprite = scene.add.sprite(x, y, "saw");
    scene.physics.add.existing(this.sprite);
    (this.sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    // Initialize movement properties
    this.direction = 1; // Start moving forward
    this.startPosition = { x, y };
    this.distanceLimit = distance;
    this.speed = speed;
    this.route = route;

    this.sprite.play("saw-anim");
    (this.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
  }

  update(delta: number) {
    const movementDelta = (this.speed * delta) / 1000; // Calculate movement per frame in pixels

    if (this.route === "horizontal") {
      // Move horizontally
      this.sprite.x += this.direction * movementDelta;

      // Check if the saw needs to reverse direction
      if (
        this.direction === 1 &&
        this.sprite.x >= this.startPosition.x + this.distanceLimit
      ) {
        this.sprite.x = this.startPosition.x + this.distanceLimit; // Snap to the end position
        this.direction = -1; // Reverse direction
      } else if (
        this.direction === -1 &&
        this.sprite.x <= this.startPosition.x
      ) {
        this.sprite.x = this.startPosition.x; // Snap to the start position
        this.direction = 1; // Reverse direction
      }
    } else if (this.route === "vertical") {
      // Move vertically
      this.sprite.y += this.direction * movementDelta;

      // Check if the saw needs to reverse direction
      if (
        this.direction === 1 &&
        this.sprite.y >= this.startPosition.y + this.distanceLimit
      ) {
        this.sprite.y = this.startPosition.y + this.distanceLimit; // Snap to the end position
        this.direction = -1; // Reverse direction
      } else if (
        this.direction === -1 &&
        this.sprite.y <= this.startPosition.y
      ) {
        this.sprite.y = this.startPosition.y; // Snap to the start position
        this.direction = 1; // Reverse direction
      }
    }
  }

  getSprite() {
    return this.sprite;
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
    }
  }
}
