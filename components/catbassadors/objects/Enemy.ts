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

export enum EnemyAnimation {
  ENEMY_ALERT = "ENEMY_ALERT",
  ENEMY_ATTACK = "ENEMY_ATTACK",
  ENEMY_AWAKE = "ENEMY_AWAKE",
  ENEMY_DEATH = "ENEMY_DEATH",
  ENEMY_DOUBLE_PECK = "ENEMY_DOUBLE_PECK",
  ENEMY_FLY = "ENEMY_FLY",
  ENEMY_HURT = "ENEMY_HURT",
  ENEMY_IDLE = "ENEMY_IDLE",
  ENEMY_JUMP = "ENEMY_JUMP",
  ENEMY_PECK = "ENEMY_PECK",
  ENEMY_SING = "ENEMY_SING",
  ENEMY_SIT = "ENEMY_SIT",
  ENEMY_SLEEP = "ENEMY_SLEEP",
  ENEMY_SNORE = "ENEMY_SNORE",
  ENEMY_WALK = "ENEMY_WALK",
  ENEMY_APPEAR = "ENEMY_APPEAR",
}

const maxAnimationFrames = 10;
const animationConfigurations: {
  key: EnemyAnimation;
  frames: number;
  repeat: -1 | 0;
}[] = [
  { key: EnemyAnimation.ENEMY_ALERT, frames: 4, repeat: -1 },
  { key: EnemyAnimation.ENEMY_ATTACK, frames: 4, repeat: -1 },
  { key: EnemyAnimation.ENEMY_AWAKE, frames: 4, repeat: -1 },
  { key: EnemyAnimation.ENEMY_DEATH, frames: 5, repeat: -1 },
  { key: EnemyAnimation.ENEMY_DOUBLE_PECK, frames: 10, repeat: -1 },
  { key: EnemyAnimation.ENEMY_FLY, frames: 6, repeat: -1 },
  { key: EnemyAnimation.ENEMY_HURT, frames: 6, repeat: -1 },
  { key: EnemyAnimation.ENEMY_IDLE, frames: 4, repeat: -1 },
  { key: EnemyAnimation.ENEMY_JUMP, frames: 1, repeat: -1 },
  { key: EnemyAnimation.ENEMY_PECK, frames: 6, repeat: -1 },
  { key: EnemyAnimation.ENEMY_SING, frames: 6, repeat: -1 },
  { key: EnemyAnimation.ENEMY_SIT, frames: 4, repeat: -1 },
  { key: EnemyAnimation.ENEMY_SLEEP, frames: 3, repeat: -1 },
  { key: EnemyAnimation.ENEMY_SNORE, frames: 6, repeat: -1 },
  { key: EnemyAnimation.ENEMY_WALK, frames: 4, repeat: -1 },
  { key: EnemyAnimation.ENEMY_APPEAR, frames: 8, repeat: -1 },
];

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
  animation: EnemyAnimation = animationConfigurations[0].key;
  vy: number = 5; // Vertical velocity
  vx: number = 5; // Horizontal velocity
  bounce: number = bounceFactor;
  coinReward: number;
  timeReward: number = 0;
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

  update() {
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
    if (this) {
      this.scene.physics.add.collider(this.sprite, collider);
    }
  }
}
