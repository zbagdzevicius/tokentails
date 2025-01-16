import { MovablePlatform } from "../objects/MovablePlatform";

export class PlatformManager {
  private scene: Phaser.Scene;
  private platforms: MovablePlatform[] = [];
  private groundLayer: Phaser.Tilemaps.TilemapLayer;

  constructor(scene: Phaser.Scene, groundLayer: Phaser.Tilemaps.TilemapLayer) {
    this.scene = scene;
    this.groundLayer = groundLayer;
  }

  spawnMovablePlatforms(
    tileIndices: number[],
    configs: { [key: number]: any },
    player: Phaser.Physics.Arcade.Sprite
  ) {
    const tiles = this.groundLayer.getTilesWithin();
    tiles.forEach((tile) => {
      if (tileIndices.includes(tile.index)) {
        const platformX = tile.getCenterX();
        const platformY = tile.getCenterY();
        const config = configs[tile.index];

        if (config) {
          const platform = new MovablePlatform(
            this.scene,
            platformX,
            platformY,
            config.image,
            config.speed,
            config.distance,
            config.oneWay
          );
          this.scene.physics.add.existing(platform);
          this.platforms.push(platform);

          // Add collision between player and platform
          this.scene.physics.add.collider(player, platform);

          // Add collision between platform and groundLayer tiles
          this.scene.physics.add.collider(platform, this.groundLayer, () =>
            this.handlePlatformTileCollision(platform, tile)
          );
        }
      }
    });
  }

  private handlePlatformTileCollision(
    platform: MovablePlatform,
    tile: Phaser.Tilemaps.Tile
  ) {
    if (platform.body!.blocked.right) {
      platform.changeDirection("right");
    }
    if (platform.body!.blocked.left) {
      platform.changeDirection("left");
    }
  }

  updatePlatforms() {
    this.platforms.forEach((platform) => {
      if (platform && typeof platform.update === "function") {
        platform.update();
      }
    });
  }

  destroyPlatforms() {
    this.platforms.forEach((platform) => platform.destroy());
    this.platforms = [];
  }
}
