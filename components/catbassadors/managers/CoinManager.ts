// CoinManager.ts
import Phaser from "phaser";
import { Coin } from "../objects/Coin";
import { ObjectPool } from "../objects/ObjectPool";
import { GameEvent, GameEvents } from "@/components/Phaser/events";
import { CatbassadorsScene } from "../scenes/CatbassadorsScene";

const COIN_DURATION_MS = 15000;

export interface ICoinManagerConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  catSprite: Phaser.Physics.Arcade.Sprite | null;
  onCoinCollected?: (coin: Coin) => void;
  coinSpawnBounds?: { xMin: number; xMax: number; yMin: number; yMax: number };
  coinSpawnIntervalMs?: number;
}

export class CoinManager {
  private scene: CatbassadorsScene;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private catSprite: Phaser.Physics.Arcade.Sprite | null;
  private coinPool: ObjectPool<Coin>;
  private coins: Coin[] = [];
  private coinSpawnInterval: NodeJS.Timeout | null = null;
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
  private spawnIntervalMs = 400;
  private lastSpawnTime = Date.now();

  constructor(config: ICoinManagerConfig) {
    this.scene = config.scene as CatbassadorsScene;
    this.groundLayer = config.groundLayer;
    this.catSprite = config.catSprite;

    if (config.coinSpawnBounds) {
      this.spawnBounds = config.coinSpawnBounds;
    }
    if (config.coinSpawnIntervalMs) {
      this.spawnIntervalMs = config.coinSpawnIntervalMs;
    }

    // Create a Coin Pool
    this.coinPool = new ObjectPool<Coin>(() => {
      return new Coin(this.scene, 400, 400);
    }, 30);
  }

  public startSpawning(): void {
    this.coinSpawnInterval = setInterval(
      () => this.spawnCoin(),
      this.spawnIntervalMs
    );
  }

  public stopSpawning(): void {
    if (this.coinSpawnInterval) {
      clearInterval(this.coinSpawnInterval);
      this.coinSpawnInterval = null;
    }
    this.clearCoins();
  }

  public spawnCoin(): void {
    if (!this.catSprite) return;

    const coin = this.coinPool.acquire();
    coin.sprite.setPosition(
      Phaser.Math.Between(this.spawnBounds.xMin, this.spawnBounds.xMax),
      Phaser.Math.Between(this.spawnBounds.yMin, this.spawnBounds.yMax)
    );
    coin.sprite.setActive(true).setVisible(true);

    this.scene.physics.add.collider(coin.sprite, this.groundLayer);
    this.scene.physics.add.overlap(
      this.catSprite,
      coin.sprite,
      () => this.onCatCatchTheCoin(coin),
      undefined,
      this
    );

    this.coins.push(coin);

    this.scene.time.delayedCall(COIN_DURATION_MS, () => {
      if (this.coins.includes(coin)) {
        this.releaseCoin(coin);
      }
    });
  }

  private onCatCatchTheCoin(coin: Coin): void {
    this.scene.sound.play("coin");

    if (this.catSprite) {
      const starAnimationSprite = this.scene.add.sprite(
        this.catSprite.x,
        this.catSprite.y,
        "starAnimation"
      );
      starAnimationSprite.setScale(1.3);
      starAnimationSprite.play("star");
      starAnimationSprite.on("animationcomplete", () => {
        starAnimationSprite.destroy();
      });
    }

    this.processCoinReward(coin); // Process rewards when coin is collected
    coin.sprite.destroy();
    this.coins = this.coins.filter((e) => e !== coin);
  }

  private processCoinReward(coin: Coin): void {
    GameEvents[GameEvent.GAME_COIN_CAUGHT].push({
      score: coin.coinReward,
    });

    this.scene.score += coin.coinReward;

    // Update the timer if the coin has a time reward
    if (coin.timeReward) {
      const newTime = this.scene.timer + coin.timeReward;
      const formattedTime = Number(newTime.toFixed(2)); // Avoid floating-point precision issues
      this.scene.timer = formattedTime;

      // Dispatch a game update event
      GameEvents[GameEvent.GAME_UPDATE].push({
        additionalTime: coin.timeReward,
      });
    }
  }

  private releaseCoin(coin: Coin): void {
    const puff = this.scene.add.sprite(coin.sprite.x, coin.sprite.y, "puff");
    puff.setScale(1.5);

    if (this.scene.anims.exists("puff")) {
      puff.play("puff");
    }
    puff.on("animationcomplete", () => {
      puff.destroy();
    });

    coin.sprite.setActive(false).setVisible(false);
    this.coins = this.coins.filter((e) => e !== coin);
    this.coinPool.release(coin);
  }

  public clearCoins(): void {
    this.coins.forEach((coin) => {
      coin.sprite.destroy();
    });
    this.coins = [];
  }

  public update(): void {
    this.coins.forEach((coin) => {
      coin.update();
    });
  }

  destroy() {
    this.stopSpawning();
    this.clearCoins();
  }

  private spawnCoinsIfNeeded() {
    const now = Date.now();
    const elapsed = now - this.lastSpawnTime;
    const interval = this.spawnIntervalMs;

    // Calculate how many intervals have passed
    const missedSpawns = Math.floor(elapsed / interval);
    for (let i = 0; i < missedSpawns; i++) {
      this.spawnCoin();
    }
    this.lastSpawnTime = now;
  }

  private addVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.spawnCoinsIfNeeded();
      }
    });
  }
}
