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

export enum EnemyType {
  COIN = "COIN",
  BOSS_COIN = "BOSS_COIN",
  TIME_COIN = "TIME_COIN",
}

const EnemyTypeSriteMap: Record<EnemyType, string> = {
  [EnemyType.COIN]: "coin",
  [EnemyType.BOSS_COIN]: "bosscoin",
  [EnemyType.TIME_COIN]: "timecoin",
};

const getEnemyType = (): EnemyType => {
  const type = Math.random() * 100;

  switch (true) {
    case type < 3:
      return EnemyType.TIME_COIN;
    case type < 8:
      return EnemyType.BOSS_COIN;
    default:
      return EnemyType.COIN;
  }
};

const EnemyTypeCoinReward: Record<EnemyType, number> = {
  [EnemyType.COIN]: 1,
  [EnemyType.BOSS_COIN]: 30,
  [EnemyType.TIME_COIN]: 0,
};

const EnemyTypeTimeReward: Record<EnemyType, number> = {
  [EnemyType.COIN]: 0,
  [EnemyType.BOSS_COIN]: 3,
  [EnemyType.TIME_COIN]: 10,
};

const EnemyTypeVelocity: Record<EnemyType, number> = {
  [EnemyType.COIN]: 5,
  [EnemyType.BOSS_COIN]: 8,
  [EnemyType.TIME_COIN]: 12,
};

export class Enemy {
  scene: ExtendedScene;
  sprite: Physics.Arcade.Sprite;
  vy: number;
  vx: number;
  bounce: number = bounceFactor;
  coinReward: number;
  timeReward: number;
  type: EnemyType;

  constructor(scene: ExtendedScene, x: number, y: number) {
    this.scene = scene;
    this.type = getEnemyType();
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
