import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";

export class ReverseGravityManager {
  private scene: Scene;
  private tilemapLayer: Phaser.Tilemaps.TilemapLayer;
  private player: Cat;
  private reverseGravityTile: number; // Tile 29
  private normalGravityTile: number; // Tile 30
  private zones: Phaser.GameObjects.Zone[] = [];

  constructor({
    scene,
    tilemapLayer,
    gravityTiles: [reverseGravityTile, normalGravityTile],
    player,
  }: {
    scene: Scene;
    tilemapLayer: Phaser.Tilemaps.TilemapLayer;
    gravityTiles: [number, number]; // Expect exactly two tiles
    player: Cat;
  }) {
    this.scene = scene;
    this.tilemapLayer = tilemapLayer;
    this.reverseGravityTile = reverseGravityTile;
    this.normalGravityTile = normalGravityTile;
    this.player = player;

    this.setupGravityTiles();
  }

  private setupGravityTiles() {
    this.tilemapLayer.forEachTile((tile) => {
      if (
        tile.index === this.reverseGravityTile ||
        tile.index === this.normalGravityTile
      ) {
        const tileWorldX = tile.getCenterX();
        const tileWorldY = tile.getCenterY();

        const zone = this.scene.add.zone(tileWorldX, tileWorldY, 32, 32);
        this.scene.physics.world.enable(zone);

        const body = zone.body as Phaser.Physics.Arcade.Body;
        body.setImmovable(true);
        body.allowGravity = false;

        this.scene.physics.add.overlap(this.player.sprite, zone, () => {
          const isReversed = tile.index === this.reverseGravityTile;
          // Set gravity for player
          this.player.movement.setGravityReversed(isReversed);

          // Set gravity for enemies through EnemyManager if it exists
          if ((this.scene as any).enemyManager) {
            (this.scene as any).enemyManager.setGravityReversed(isReversed);
          }
        });

        this.zones.push(zone);
      }
    });
  }

  destroy() {
    this.zones.forEach((zone) => zone.destroy());
    this.zones = [];
  }
}
