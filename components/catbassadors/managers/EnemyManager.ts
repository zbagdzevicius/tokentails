import Phaser from "phaser";
import { Enemy } from "../../purrquest/objects/Enemy";
import { BossEnemy } from "@/components/purrquest/objects/Boss";
import { GameEvent, GameEvents } from "@/components/Phaser/events";
import { CatbassadorsScene } from "../scenes/CatbassadorsScene";
import { Cat } from "../objects/Catbassador";
import { PurrquestScene } from "@/components/purrquest/scenes/PurrquestScene";
import { catWalkSpeed } from "@/models/game";

const DEFAULT_ENEMY_SPAWN_THRESHOLD = 1500;
const DEFAULT_BOSS_SPAWN = 50000;
const TIME_TO_REMOVE_PER_HIT = 5;
const MAX_ENEMIES = 5;
const BOSS_REWARD_POINTS = 1000;
const BOSS_HIT_DEBOUNCE_MS = 1000;

export interface IEnemyManagerConfig {
  scene: Phaser.Scene;
  cat: Cat;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  platformsLayer: Phaser.Tilemaps.TilemapLayer;
  jumperLayer: Phaser.Tilemaps.TilemapLayer;
  enemySpawnBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  onTimerDecrease?: (timeToRemove: number) => void;
  onScoreIncrease?: (amount: number) => void;
  gameType: "catbassadors" | "purrquest";
}

export class EnemyManager {
  private scene: CatbassadorsScene | PurrquestScene;
  cat: Cat;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private platformsLayer: Phaser.Tilemaps.TilemapLayer;
  private jumperLayer: Phaser.Tilemaps.TilemapLayer;

  enemies: Enemy[] = [];
  bossEnemy?: BossEnemy;
  private isBossSpawned: boolean = false;
  private enemySpawnThreshold = DEFAULT_ENEMY_SPAWN_THRESHOLD;

  private gameType: "catbassadors" | "purrquest";
  private onTimerDecrease?: (timeToRemove: number) => void;
  private onScoreIncrease?: (amount: number) => void;
  private canCollectBossReward: boolean = false;
  private spawnBounds: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } = {
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
  };

  constructor(config: IEnemyManagerConfig) {
    this.scene = config.scene as CatbassadorsScene;
    this.cat = config.cat;
    this.groundLayer = config.groundLayer;
    this.platformsLayer = config.platformsLayer;
    this.jumperLayer = config.jumperLayer;
    this.spawnBounds = config.enemySpawnBounds;
    this.onTimerDecrease = config.onTimerDecrease;
    this.onScoreIncrease = config.onScoreIncrease;
    this.gameType = config.gameType;
  }

  update(time: number, delta: number) {
    this.enemies.forEach((enemy) => enemy.update(time, delta));
    this.bossEnemy?.update(time, delta);
  }

  checkEnemyMilestone(score: number) {
    if (
      this.gameType === "catbassadors" &&
      score >= this.enemySpawnThreshold &&
      !this.isBossSpawned
    ) {
      this.spawnEnemy();
      GameEvents[GameEvent.ENEMY_SPAWN].push({ amount: 1 });
      this.enemySpawnThreshold += DEFAULT_ENEMY_SPAWN_THRESHOLD;
    }

    if (score >= DEFAULT_BOSS_SPAWN && !this.isBossSpawned) {
      this.spawnBossEnemy();
      GameEvents[GameEvent.BOSS_SPAWN].push({ amount: 1 });
      this.isBossSpawned = true;
    }
  }

  initialSpawnForPurrquest() {
    for (let i = 0; i < 4; i++) {
      this.spawnEnemy();
    }

    this.spawnBossEnemy();
    this.isBossSpawned = true;
  }

  private pushPlayerBack(
    player: Phaser.Physics.Arcade.Sprite,
    enemy: Enemy | BossEnemy
  ) {
    if (enemy.isKnockedDown) {
      return;
    }

    if (!this.cat!.isInvulnerable) {
      const pushBackForce = enemy instanceof BossEnemy ? 800 : 500;

      const directions = ["left", "right", "up"];
      const chosenDirection = Phaser.Utils.Array.GetRandom(directions);

      let velocityX = 0;
      let velocityY = 0;

      switch (chosenDirection) {
        case "left":
          velocityX = -pushBackForce;
          break;
        case "right":
          velocityX = pushBackForce;
          break;
        case "up":
          velocityY = -pushBackForce;
          break;
      }

      // Adjust player's state and apply push-back logic
      this.cat.walkSpeed = 100;
      this.cat.isHit = true;
      this.cat.isInvulnerable = true;

      player.setVelocityX(velocityX);
      player.setVelocityY(velocityY);

      this.scene.time.delayedCall(
        2000,
        () => {
          this.cat.walkSpeed = catWalkSpeed;
        },
        undefined,
        this
      );

      this.scene.time.delayedCall(
        1000,
        () => {
          this.cat.isInvulnerable = false;
          this.cat.isHit = false;
        },
        undefined,
        this
      );
    }
  }

  spawnEnemy() {
    if (this.enemies.length >= MAX_ENEMIES) return;

    const enemySprites = [
      "enemy-pinkie",
      "enemy-blue-fluffie",
      "enemy-white-owlet",
    ];
    const randomSprite = Phaser.Utils.Array.GetRandom(enemySprites);

    const x = Phaser.Math.Between(this.spawnBounds.xMin, this.spawnBounds.xMax);
    const y = Phaser.Math.Between(this.spawnBounds.yMin, this.spawnBounds.yMax);

    const enemy = new Enemy(this.scene, x, y, randomSprite);
    this.enemies.push(enemy);

    this.scene.physics.add.collider(this.enemies, this.groundLayer);
    this.scene.physics.add.collider(this.enemies, this.jumperLayer);
    this.scene.physics.add.collider(this.enemies, this.platformsLayer);

    this.scene.physics.add.overlap(
      this.cat.sprite,
      enemy,
      (object1, object2) => {
        const targetEnemy = object2 as Enemy;
        if (targetEnemy.isKnockedDown) {
          return;
        }

        if (this.gameType === "catbassadors") {
          this.handlePlayerEnemyCollision(
            object2 as Phaser.GameObjects.GameObject
          );
        } else {
          this.handlePushBackCollision(
            object2 as Phaser.GameObjects.GameObject
          );
        }
      },
      undefined,
      this
    );
  }

  private spawnBossEnemy() {
    const x = Phaser.Math.Between(this.spawnBounds.xMin, this.spawnBounds.xMax);
    const y = Phaser.Math.Between(this.spawnBounds.yMin, this.spawnBounds.yMax);

    this.bossEnemy = new BossEnemy(this.scene, x, y, "boss", this.cat.sprite);
    this.scene.physics.add.collider(this.bossEnemy, this.groundLayer);
    this.scene.physics.add.collider(this.bossEnemy, this.jumperLayer);
    this.scene.physics.add.collider(this.bossEnemy, this.platformsLayer);

    this.scene.physics.add.overlap(
      this.cat.sprite,
      this.bossEnemy,
      this
        .handleCollisionBasedOnBossState as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }
  private handleCollisionBasedOnBossState(
    player: Phaser.GameObjects.GameObject,
    boss: Phaser.GameObjects.GameObject
  ) {
    if (this.bossEnemy!.isKnockedDown) {
      // If the boss is knocked down, do not allow collision
      return;
    }

    // Handle the appropriate collision logic based on the game type
    if (this.gameType === "catbassadors") {
      this
        .handlePlayerBossCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback;
    } else {
      this.handlePushBackCollision(boss as Phaser.GameObjects.GameObject);
    }
  }

  private handlePlayerEnemyCollision = (
    enemyObj: Phaser.GameObjects.GameObject
  ) => {
    const player = this.scene.cat as Cat;
    const enemy = enemyObj as Enemy;

    if (!player || !enemy) {
      return;
    }

    if (player.isHit) {
      return;
    }

    player.isHit = true;

    if (this.onTimerDecrease) {
      this.onTimerDecrease(TIME_TO_REMOVE_PER_HIT);
    }

    this.scene.time.delayedCall(1000, () => {
      player.isHit = false;
    });
  };

  private handlePlayerBossCollision: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (playerObj, bossObj) => {
      const player = playerObj as Phaser.Physics.Arcade.Sprite;
      const boss = bossObj as BossEnemy;

      if (!player || !boss || !(boss instanceof BossEnemy)) {
        return; // Safety check
      }

      const catBottom = player.y + player.height / 2;
      const bossTop = boss.y - boss.height / 2;
      const isTopCollision = catBottom < bossTop + 32;

      if (isTopCollision) {
        player.setVelocityY(-1000);

        if (!this.canCollectBossReward) {
          this.canCollectBossReward = true;

          if (this.onScoreIncrease) {
            this.onScoreIncrease(BOSS_REWARD_POINTS);
          }

          GameEvents[GameEvent.GAME_COIN_CAUGHT].push({
            score: BOSS_REWARD_POINTS,
          });

          this.scene.time.delayedCall(BOSS_HIT_DEBOUNCE_MS, () => {
            this.canCollectBossReward = false;
          });
        }
      } else if (!boss.isKnockedDown) {
        boss.destroy();
        this.scene.endGame();
        GameEvents[GameEvent.GAME_STOP].push({
          score: 0,
          time: 0,
        });
      }
    };

  private handlePushBackCollision = (
    enemyObj: Phaser.GameObjects.GameObject
  ) => {
    const player = this.cat.sprite;
    const enemy = enemyObj as Enemy | BossEnemy;
    this.pushPlayerBack(player, enemy);
  };

  clearAllEnemies() {
    this.enemies.forEach((enemy) => enemy.destroy());
    this.enemies = [];

    if (this.bossEnemy) {
      this.bossEnemy.destroy();
      this.bossEnemy = undefined;
      this.isBossSpawned = false;
    }
  }
}
