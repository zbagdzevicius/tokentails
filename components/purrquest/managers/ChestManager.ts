import { Chest } from "../objects/Chest";
import { Cat } from "@/components/catbassadors/objects/Catbassador";

export interface IChestManagerConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  chestTileIndex: number;
  cat: Cat;
  onChestOpened: (score: number) => void;
  onChestRequiresKey: (x: number, y: number) => void;
}

export class ChestManager {
  private scene: Phaser.Scene;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private chestTileIndex: number;
  private cat: Cat;
  private chest!: Chest;
  private onChestOpened: (score: number) => void;
  private onChestRequiresKey: (x: number, y: number) => void;

  constructor(config: IChestManagerConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;
    this.chestTileIndex = config.chestTileIndex;
    this.cat = config.cat;
    this.onChestOpened = config.onChestOpened;
    this.onChestRequiresKey = config.onChestRequiresKey;

    this.spawnChest();
    this.setupCollider();
  }

  private spawnChest() {
    const tile = this.groundLayer.findByIndex(this.chestTileIndex);
    if (tile) {
      const x = tile.getCenterX();
      const y = tile.getCenterY();
      this.chest = new Chest(this.scene, x, y);
      this.scene.physics.add.collider(this.chest, this.groundLayer);
    }
  }

  private setupCollider() {
    this.scene.physics.add.overlap(
      this.cat.sprite,
      this.chest,
      () => {
        if (this.cat.hasKey) {
          this.chest.open();
          this.onChestOpened(5000);
        } else {
          this.onChestRequiresKey(this.chest.x, this.chest.y - 50);
        }
      },
      undefined,
      this
    );
  }

  destroy() {
    this.chest?.destroy();
  }
}
