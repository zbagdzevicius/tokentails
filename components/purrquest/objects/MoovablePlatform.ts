import Phaser from "phaser";

export class MoovablePlatform {
  private scene: Phaser.Scene;
  private platforms: Phaser.Physics.Arcade.Group;
  private platformConfigs: {
    speed: number;
    distance: number;
    tileIndex: number;
  }[];

  constructor(
    scene: Phaser.Scene,
    platformConfigs: { speed: number; distance: number; tileIndex: number }[]
  ) {
    this.scene = scene;
    this.platformConfigs = platformConfigs;
    this.platforms = this.scene.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
  }

  private createPlatform(
    x: number,
    y: number,
    config: { speed: number; distance: number }
  ) {
    const platform = this.platforms.create(
      x,
      y,
      "platform"
    ) as Phaser.Physics.Arcade.Image;

    platform.setData("startX", x);
    platform.setData("previousX", x);
    platform.setData("previousY", y);
    platform.setData("vx", 0);
    platform.setData("vy", 0);

    const duration = (config.distance / config.speed) * 1000;

    this.scene.tweens.add({
      targets: platform,
      x: x + config.distance,
      duration: duration,
      yoyo: true,
      repeat: -1,
      ease: "Linear",
      onUpdate: () => {
        const newVx = platform.body!.position.x - platform.getData("previousX");
        platform.setData("vx", newVx);
        platform.setData(
          "vy",
          platform.body!.position.y - platform.getData("previousY")
        );
        platform.setData("previousX", platform.body!.position.x);
        platform.setData("previousY", platform.body!.position.y);
      },
    });
  }

  createPlatformsForTiles(
    groundLayer: Phaser.Tilemaps.TilemapLayer,
    player: Phaser.Physics.Arcade.Sprite
  ) {
    const platformTiles = groundLayer.getTilesWithin(
      0,
      0,
      groundLayer.width,
      groundLayer.height,
      { isNotEmpty: true }
    );

    platformTiles.forEach((tile) => {
      const config = this.platformConfigs.find(
        (cfg) => cfg.tileIndex === tile.index
      );
      if (config) {
        const platformX = tile.getCenterX();
        const platformY = tile.getCenterY();
        this.createPlatform(platformX, platformY, config);
      }
    });

    this.scene.physics.add.collider(
      player,
      this.platforms,
      this
        .collisionMovingPlatform as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      this
        .isCollisionFromTop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      this
    );
  }

  collisionMovingPlatform(
    player: Phaser.Physics.Arcade.Sprite,
    platform: Phaser.Physics.Arcade.Image
  ) {
    if (platform.body!.touching.up && player.body!.touching.down) {
      player.setData("isOnPlatform", true);
      player.setData("currentPlatform", platform);
    }
  }

  isCollisionFromTop(
    object1: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    object2: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ) {
    const player = object1 as Phaser.Physics.Arcade.Sprite;
    const platform = object2 as Phaser.Physics.Arcade.Image;

    return platform.body!.y > player.body!.y;
  }

  update(
    player: Phaser.Physics.Arcade.Sprite,
    groundLayer: Phaser.Tilemaps.TilemapLayer
  ) {
    const currentPlatform = player.getData("currentPlatform");

    if (player.getData("isOnPlatform") && currentPlatform) {
      const playerTileCollision = this.checkPlayerTilemapCollision(
        player,
        groundLayer
      );
      if (playerTileCollision) {
      //push player by one pixe to another side when player is on tilemap near

        player.setData("isOnPlatform", false);
        player.setData("currentPlatform", null);

        
        const newX =
          currentPlatform.getData("vx") < 0 ? player.x + 1 : player.x - 1;

      
        player.x = newX;
        const collisionAtNewX = this.checkPlayerTilemapCollision(
          player,
          groundLayer
        );

        if (collisionAtNewX) {
          player.x =
            currentPlatform.getData("vx") < 0 ? player.x - 1 : player.x + 1;
        }

        return;
      }

      // Move the player with the platform
      player.x += currentPlatform.getData("vx");
      player.y += currentPlatform.getData("vy");

      player.setData("isOnPlatform", false);
      player.setData("currentPlatform", null);
    } else {
      if (
        currentPlatform &&
        player.body!.touching.down &&
        currentPlatform.body.touching.up
      ) {
        player.setData("isOnPlatform", true);
        player.setData("currentPlatform", currentPlatform);
      }
    }
  }

  checkPlayerTilemapCollision(
    player: Phaser.GameObjects.Sprite,
    groundLayer: Phaser.Tilemaps.TilemapLayer
  ): boolean {
    const playerBounds = player.getBounds();

    const padding = 16;
    const tiles = groundLayer.getTilesWithinWorldXY(
      playerBounds.left + padding,
      playerBounds.top + padding,
      playerBounds.width - 2 * padding,
      playerBounds.height - 2 * padding
    );

    for (const tile of tiles) {
      if (tile && tile.collides) {
        return true;
      }
    }

    return false;
  }

  getGroup() {
    return this.platforms;
  }
}
