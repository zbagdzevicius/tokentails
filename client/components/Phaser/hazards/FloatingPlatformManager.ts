import { Scene } from "phaser";

export interface IFloatingPlatformConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  platformsLayer: Phaser.Tilemaps.TilemapLayer;
  x: number;
  y: number;
}

export class FloatingPlatformManager {
  private scene: Phaser.Scene;
  private platforms: Phaser.Physics.Arcade.Group;
  private platformTimers: Map<
    Phaser.Physics.Arcade.Sprite,
    Phaser.Time.TimerEvent
  >;
  private x: number;
  private y: number;

  constructor(config: IFloatingPlatformConfig) {
    this.scene = config.scene;
    this.platformTimers = new Map();
    this.x = config.x;
    this.y = config.y;

    // Create a group for the floating platforms
    this.platforms = this.scene.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.createFloatingPlatform();

    // this.scene.physics.add.collider(this.platforms, config.groundLayer);
    // this.scene.physics.add.collider(this.platforms, config.platformsLayer);
  }

  createFloatingPlatform() {
    const platform = this.platforms.create(
      this.x,
      this.y,
      "floating-platform"
    ) as Phaser.Physics.Arcade.Sprite;
    platform.setImmovable(true);
  }

  setupPlayerCollision(player: Phaser.Physics.Arcade.Sprite) {
    this.scene.physics.add.collider(
      player,
      this.platforms,
      (_player, platform) => {
        if (platform instanceof Phaser.Physics.Arcade.Sprite) {
          this.startPlatformTimer(player, platform);
        }
      },
      undefined,
      this
    );

    this.scene.physics.add.overlap(
      player,
      this.platforms,
      (_player, platform) => {
        if (platform instanceof Phaser.Physics.Arcade.Sprite) {
          this.resetPlatformTimer(platform);
        }
      },
      undefined,
      this
    );
  }

  startPlatformTimer(
    player: Phaser.Physics.Arcade.Sprite,
    platform: Phaser.Physics.Arcade.Sprite
  ) {
    if (!this.platformTimers.has(platform)) {
      const timer = this.scene.time.delayedCall(100, () => {
        this.dropPlatform(platform);
      });
      this.platformTimers.set(platform, timer);
    }
  }

  resetPlatformTimer(platform: Phaser.Physics.Arcade.Sprite) {
    const timer = this.platformTimers.get(platform);
    if (timer) {
      timer.remove();
      this.platformTimers.delete(platform);
    }
  }

  dropPlatform(platform: Phaser.Physics.Arcade.Sprite) {
    if (!platform.active) {
      return;
    }

    platform.setImmovable(false);
    (platform.body as Phaser.Physics.Arcade.Body).allowGravity = true;

    this.scene.time.delayedCall(1000, () => {
      if (platform.active) {
        platform.destroy();
        this.platformTimers.delete(platform);
      }
    });

    this.platformTimers.delete(platform);
  }

  getPlatforms(): Phaser.Physics.Arcade.Group {
    return this.platforms;
  }

  destroy() {
    if (this.platforms) {
      this.platforms.destroy();
    }
  }
}
