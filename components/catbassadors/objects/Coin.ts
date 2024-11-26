import { GameObjects, Physics, Scene } from "phaser";

/**
 * Physics objects that could be colliders
 */
type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

const gravity = 0.05;
const bounceFactor = 0.7; // Adjusted bounce factor for more controlled bouncing

interface ExtendedScene extends Scene {
  groundLayer: Phaser.Tilemaps.TilemapLayer;
}

export enum CoinType {
  COIN = "COIN",
  BOSS_COIN = "BOSS_COIN",
  CANDY_CANE = "CANDY_CANE",
  TIME_COIN = "TIME_COIN",
  KEY = "KEY",
}

const EnemyTypeSriteMap: Record<CoinType, string> = {
  [CoinType.COIN]: "coin",
  [CoinType.BOSS_COIN]: "bosscoin",
  [CoinType.CANDY_CANE]: "candy-cane",
  [CoinType.TIME_COIN]: "timecoin",
  [CoinType.KEY]: "key",
};

const getCoinType = (): CoinType => {
  const type = Math.random() * 100;

  switch (true) {
    case type < 3:
      return CoinType.TIME_COIN;
    case type < 8:
      return CoinType.BOSS_COIN;
    case type < 25:
      return CoinType.CANDY_CANE;
    default:
      return CoinType.COIN;
  }
};

const EnemyTypeCoinReward: Record<CoinType, number> = {
  [CoinType.COIN]: 1,
  [CoinType.CANDY_CANE]: 10,
  [CoinType.BOSS_COIN]: 100,
  [CoinType.TIME_COIN]: 1000,
  [CoinType.KEY]: 0,
};

const EnemyTypeTimeReward: Record<CoinType, number> = {
  [CoinType.COIN]: 0,
  [CoinType.CANDY_CANE]: 1,
  [CoinType.BOSS_COIN]: 3,
  [CoinType.TIME_COIN]: 10,
  [CoinType.KEY]: 0,
};

const EnemyTypeVelocity: Record<CoinType, number> = {
  [CoinType.COIN]: 5,
  [CoinType.CANDY_CANE]: 5,
  [CoinType.BOSS_COIN]: 8,
  [CoinType.TIME_COIN]: 12,
  [CoinType.KEY]: 12,
};

export class Coin {
  scene: ExtendedScene;
  sprite: Physics.Arcade.Sprite;
  vy: number;
  vx: number;
  bounce: number = bounceFactor;
  coinReward: number;
  timeReward: number;
  type: CoinType;

  constructor(scene: ExtendedScene, x: number, y: number, type?: CoinType) {
    this.scene = scene;
    this.type = type || getCoinType();
    this.vy = EnemyTypeVelocity[this.type];
    this.vx = EnemyTypeVelocity[this.type];
    this.coinReward = EnemyTypeCoinReward[this.type];
    this.timeReward = EnemyTypeTimeReward[this.type];
    this.sprite = this.scene.physics.add
      .sprite(x, y, EnemyTypeSriteMap[this.type])
      .setSize(32, 32);
    this.sprite.setGravityY(-900);
  }

  async update() {
    this.applyGravity();
    this.checkCollisions();
  }

  private applyGravity() {
    this.vy += gravity;
    this.sprite.y += this.vy;
    this.sprite.x += this.vx;
  }

  private checkCollisions() {
    // Check collision with ground tiles
    const groundTile = this.scene.groundLayer.getTileAtWorldXY(
      this.sprite.x,
      this.sprite.y + this.sprite.height
    );
    if (groundTile) {
      this.sprite.y = groundTile.getTop() - this.sprite.height;
      this.vy *= -this.bounce;

      // Gradually reduce the vertical velocity for controlled bouncing
      if (Math.abs(this.vy) < 1) {
        this.vy = -Math.abs(this.vy) * 0.9;
      }
    }

    // Check collision with tiles on the left side
    const leftTile = this.scene.groundLayer.getTileAtWorldXY(
      this.sprite.x - this.sprite.width / 2,
      this.sprite.y
    );
    if (leftTile) {
      this.sprite.x = leftTile.getRight() + this.sprite.width / 2;
      this.vx *= -this.bounce;
    }

    // Check collision with tiles on the right side
    const rightTile = this.scene.groundLayer.getTileAtWorldXY(
      this.sprite.x + this.sprite.width / 2,
      this.sprite.y
    );
    if (rightTile) {
      this.sprite.x = rightTile.getLeft() - this.sprite.width / 2;
      this.vx *= -this.bounce;
    }

    // Check collision with tiles above the enemy
    const topTile = this.scene.groundLayer.getTileAtWorldXY(
      this.sprite.x,
      this.sprite.y - this.sprite.height / 2
    );
    if (topTile) {
      this.sprite.y = topTile.getBottom() + this.sprite.height / 2;
      this.vy *= -this.bounce;
    }
  }

  addCollider(collider: ColliderType) {
    if (this?.sprite) {
      this.scene.physics.add.collider(this.sprite, collider);
    }
  }
}
