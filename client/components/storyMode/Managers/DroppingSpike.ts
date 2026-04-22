export interface IDroppingSpikeConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
}

export class DroppingSpike {
  private scene: Phaser.Scene;
  private spike: Phaser.Physics.Arcade.Sprite;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private initialX: number;
  private initialY: number;
  isDropping: boolean = false;

  constructor(config: IDroppingSpikeConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;
    this.initialX = config.x;
    this.initialY = config.y;

    this.spike = this.scene.physics.add.sprite(config.x, config.y - 8, "spike");
    this.spike.setOrigin(0.5, 0.5);
    this.initializeSpike();
  }

  private initializeSpike() {
    (this.spike.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    this.spike.setImmovable(true);

    // Add collision detection with the ground layer
    this.scene.physics.add.collider(
      this.spike,
      this.groundLayer,
      this.destroySpike,
      undefined,
      this
    );
  }

  startDrop() {
    if (!this.isDropping) {
      this.isDropping = true;
      (this.spike.body as Phaser.Physics.Arcade.Body).allowGravity = true;
      this.spike.setVelocityY(200);
    }
  }

  destroySpike() {
    this.spike.destroy();

    this.scene.time.delayedCall(6000, () => {
      this.respawnSpike();
    });
  }

  respawnSpike() {
    this.spike = this.scene.physics.add.sprite(
      this.initialX,
      this.initialY - 8,
      "spike"
    );
    this.isDropping = false;
    this.initializeSpike();

    if ((this.scene as any).onSpikeRespawn) {
      (this.scene as any).onSpikeRespawn(this);
    }
  }

  checkPlayerUnder(player: Phaser.Physics.Arcade.Sprite) {
    const playerX = player.x;
    const playerY = player.y;

    const spikeX = this.spike.x;
    const spikeY = this.spike.y;

    if (
      Math.abs(playerX - spikeX) < 50 &&
      playerY > spikeY &&
      playerY - spikeY <= 200
    ) {
      this.startDrop();
    }
  }

  getSprite() {
    return this.spike;
  }

  destroy() {
    if (this.spike) {
      this.spike.destroy();
    }
  }
}
