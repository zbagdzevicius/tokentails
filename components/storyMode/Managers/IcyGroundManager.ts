import { Cat } from "@/components/catbassadors/objects/Catbassador";
import { Scene } from "phaser";

export interface IIcyGroundConfig {
  scene: Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  icyTiles: number[];
  player: Cat;
}

export class IcyGroundManager {
  private scene: Phaser.Scene;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private icyTiles: number[];
  private player: Cat;

  constructor(config: IIcyGroundConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;
    this.icyTiles = config.icyTiles;
    this.player = config.player;
  }

  public checkIcyGround(): void {
    const sprite = this.player.sprite as Phaser.Physics.Arcade.Sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body;

    // Check multiple points along the bottom of the sprite for better detection
    const points = [
      { x: sprite.x - sprite.width * 0.3, y: sprite.y + sprite.height * 0.5 },
      { x: sprite.x, y: sprite.y + sprite.height * 0.5 },
      { x: sprite.x + sprite.width * 0.3, y: sprite.y + sprite.height * 0.5 },
    ];

    let isOnIce = false;
    for (const point of points) {
      const tileBelow = this.groundLayer.getTileAtWorldXY(point.x, point.y);
      if (tileBelow && this.icyTiles.includes(tileBelow.index)) {
        isOnIce = true;
        break;
      }
    }

    this.player.isOnIcyTile = isOnIce;
  }

  destroy() {
    // Clean up any event listeners or physics
    this.player = undefined as unknown as Cat;
    this.groundLayer = undefined as unknown as Phaser.Tilemaps.TilemapLayer;
  }
}
