import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { ICat, catbassadorsGameDuration } from "@/models/cats";
import { Scene } from "phaser";
import { Cat } from "../objects/Catbassador";
import { Coin } from "../objects/Coin";
import { Enemy } from "../../purrquest/objects/Enemy";
import { BossEnemy } from "@/components/purrquest/objects/Boss";
import { currentDayCoin, ZOOM } from "@/constants/utils";
import { ObjectPool } from "../objects/ObjectPool";

const coinDurationMs = 15000;
const BOSS_REWARD_POINTS = 1000;
const JUMP_LAYER_TILES = [47, 48, 49, 50];
const TRAMPOLINE_TILES = [51];
const TIME_TO_REMOVE_PER_HIT = 5;
const DEFAULT_ENEMY_SPAWN_THRESHOLD = 1500;
const DEFAULT_BOSS_SPAWN = 50000;
const MAX_ENEMIES =5;

export class CatbassadorsScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  coin?: Coin | null;
  coinPool!: ObjectPool<Coin>;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  coins: Coin[] = [];
  coinSpawnInterval: NodeJS.Timeout | null = null;
  timer: number = catbassadorsGameDuration;
  score: number = 0;
  backgroundSound?: Phaser.Sound.BaseSound;
  lastUpdateTime: number;
  trampoline?: Trampoline;
  enemySpawnThreshold = DEFAULT_ENEMY_SPAWN_THRESHOLD;
  enemies: Enemy[] = [];
  bossEnemy?: BossEnemy;
  canCollectReward: boolean = false;
  IsBossSpawned = false;
  blessing!: Phaser.GameObjects.Sprite;

  constructor() {
    super("CatbassadorsScene");

    this.lastUpdateTime = 0;
  }
  preload() {
    this.load.spritesheet("bird", "base/bird.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("food", "base/food.png", {
      frameWidth: 32,
      frameHeight: 32,
      margin: 1,
      spacing: 2,
    });

    this.load.image("bosscoin", "logo/boss-coin.png");
    this.load.image("candy-cane", currentDayCoin);
    this.load.image("timecoin", "icons/clock.png");
    this.load.image("coin", "logo/coin.png");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.audio("coin", "purrquest/sounds/score.mp3");
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.tilemapTiledJSON("tilemap", "catbassadors/catbassadors.json");
    this.load.image("blocks", "base/blocks-winter.png");
    this.load.spritesheet("starAnimation", "base/star-animation.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("enemy-pinkie", "enemies/pink-fluffie-winter.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "enemy-blue-fluffie",
      "enemies/blue-fluffie-winter.png",
      {
        frameWidth: 32,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      "enemy-white-owlet",
      "enemies/white-owlet-winter.png",
      {
        frameWidth: 32,
        frameHeight: 32,
      }
    );
    this.load.spritesheet("boss", "enemies/boss/boss-winter.png", {
      frameWidth: 96,
      frameHeight: 64,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.physics.world.setFPS(60);

     this.coinPool = new ObjectPool<Coin>(
      () => new Coin(this, 400, 400), 
      30, 
    );

    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const sugarTileset = this.tilemap.addTilesetImage(
      "blocks",
      "blocks",
      32,
      32,
      1,
      2
    )!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;
    this.platformsLayer = this.tilemap.createLayer("platforms", [
      sugarTileset,
    ])!;
    this.tilemap.createLayer("decorations", [sugarTileset]);
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;

    this.anims.create({
      key: "star",
      frames: this.anims.generateFrameNumbers("starAnimation", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: 1,
    });

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByExclusion([-1]);
    this.platformsLayer?.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: Phaser.GameObjects.GameObject) => {
        const playerSprite = player as Phaser.Physics.Arcade.Sprite;
        if (playerSprite.body!.velocity.y <= 0) {
          return true;
        }
        return false;
      },
      this
    );

    this.jumperLayer?.setCollision(TRAMPOLINE_TILES);
    this.trampoline = new Trampoline(this, this.jumperLayer, TRAMPOLINE_TILES);

    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM);

    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.setDefaultSound();

    this.lastUpdateTime = performance.now();
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );

    if (props?.cat) {
      this.spawnCat({ detail: { cat: props.cat } }, props.isRestart);
    }
    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const startGameCallback = () => {
      if (this) {
        this.startGame();
      } else {
        GameEvents.GAME_START.removeEventListener(startGameCallback);
      }
    };
    GameEvents.GAME_START.addEventListener(startGameCallback);
    GameEvents.GAME_LOADED.push({ scene: this });
    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
    });
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.lastUpdateTime = performance.now();
    } else {
      const currentTime = performance.now();
      const timeElapsed = (currentTime - this.lastUpdateTime) / 1000; // Time in seconds

      this.timer -= timeElapsed;

      this.lastUpdateTime = currentTime;
    }
  }

  async spawnCat(
    { detail: { cat } }: ICatEvent<GameEvent.CAT_SPAWN>,
    isRestart?: boolean
  ) {
    const isCatExist = !cat || cat?.name === this.catDto?.name;
    if (isCatExist && !isRestart) {
      return;
    }

  if (this.blessing) {
    this.blessing.setVisible(false);
  }

    const isCatChanged = this.catDto && this.catDto?.name !== cat?.name;
    if (isCatChanged) {
      this.cat = undefined;
      this.catDto = cat;
      this.scene.restart({ cat, isRestart: true });
      return;
    }

    this.catDto = cat;

  const blessingPath = `flare-effect/spritesheets/${cat.blessings[0].ability}.png`;

  this.load.once(
    "complete",
    () => {
      if (cat.blessings && cat.blessings.length > 0) {
        this.blessing = this.add.sprite(0, 0, `blessing-${cat.blessings[0].ability}`).setVisible(true);

        this.anims.create({
          key: `blessing_animation_${cat.blessings[0].ability}`,
          frames: this.anims.generateFrameNumbers(`blessing-${cat.blessings[0].ability}`, { start: 0, end: 59 }),
          frameRate: 16,
          repeat: -1,
        });

        this.blessing.play(`blessing_animation_${cat.blessings[0].ability}`);
      }

      this.createCat(cat.name, this.blessing);
    },
    this
  );

  this.load.spritesheet(`blessing-${cat.blessings[0].ability}`, blessingPath, {
    frameWidth: 64,
    frameHeight: 64,
  });

  this.catDto = cat;
    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createCat(catName: string, blessing: Phaser.GameObjects.Sprite | null) {
     this.cat = new Cat(this, 0, -400, catName, blessing!);
    this.physics.add.collider(this.cat.sprite, this.groundLayer);

    this.physics.add.collider(
      this.cat.sprite as Phaser.Physics.Arcade.Sprite,
      this.platformsLayer
    );
    this.physics.add.collider(this.cat.sprite, this.jumperLayer);
    this.cameras.main.startFollow(this.cat.sprite);

     if (blessing) {
    this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (this.cat?.sprite.active) {
          blessing.setPosition(this.cat.sprite.x, this.cat.sprite.y - 50);
        } else {
          blessing.destroy();
        }
      },
    });
  }
    
    setMobileControls(this.cat);
  }

 spawnCoin() {
    if (!this.cat) return;

    // Acquire a coin from the pool
    const coin = this.coinPool.acquire();
    coin.sprite.setPosition(this.getCoinSpawnPositionX(), this.getCoinSpawnPositionY());
    coin.sprite.setActive(true).setVisible(true);

    this.physics.add.collider(coin.sprite, this.groundLayer);
    this.physics.add.overlap(
      this.cat.sprite,
      coin.sprite,
      () => this.onCatCatchTheCoin(coin),
      undefined,
      this
    );

    this.coins.push(coin);
    this.time.delayedCall(coinDurationMs, () => {
      if (this.coins.includes(coin)) {
        this.releaseCoin(coin);
      }
    });
  }

   private releaseCoin(coin: Coin) {
    // Remove the coin from active coins list
    coin.sprite.setActive(false).setVisible(false);
    this.coins = this.coins.filter((e) => e !== coin);

    // Release the coin back to the pool
    this.coinPool.release(coin);
  }

  update(time: any, delta: any) {
    this.cat?.update();
    this.coins.forEach((coin) => coin.update());

    this.checkEnemyMilestone();

    this.enemies?.forEach((enemy) => {
      if (enemy) enemy.update(time, delta);
    });
    if (this.bossEnemy) {
      this.bossEnemy.update(time, delta);
    }
    this.timer -= delta / 1000;

    if (this.timer <= 0 && this.coinSpawnInterval) {
      this.endGame();
    }

    this.lastUpdateTime = performance.now();
  }

  private onCatCatchTheCoin(coin: Coin) {
    this.processCoinReward(coin);
    this.sound.play("coin");

    if (this.cat) {
      GameEvents[GameEvent.GAME_COIN_CAUGHT].push({
        score: coin.coinReward,
      });

      const starAnimationSprite = this.add.sprite(
        this.cat.sprite.x,
        this.cat.sprite.y,
        "starAnimation"
      );

      starAnimationSprite.play("star");

      starAnimationSprite.on("animationcomplete", () => {
        starAnimationSprite.destroy();
      });
    }

    // Remove the caught coin
    coin.sprite.destroy();
    this.coins = this.coins.filter((e) => e !== coin);
  }
  private checkEnemyMilestone() {
    if (this.score >= this.enemySpawnThreshold) {
        this.spawnEnemy();
        this.enemySpawnThreshold += DEFAULT_ENEMY_SPAWN_THRESHOLD;

        this.enemies.forEach((enemy) => {
            enemy.increaseSpeed();
        });

        this.enemies.forEach((enemy) => {
            enemy.reduceUltimateJumpDelay();
        });
    }
    if (this.score >= DEFAULT_BOSS_SPAWN && !this.IsBossSpawned) {
        this.spawnBossEnemy();
        this.IsBossSpawned = true;
    }
}

private spawnEnemy() {
  if (this.enemies.length >= MAX_ENEMIES) {
    return; // Prevent spawning if max limit reached
  }
    const enemySprites = [
      "enemy-pinkie",
      "enemy-blue-fluffie",
      "enemy-white-owlet",
    ];
    const randomSprite = Phaser.Utils.Array.GetRandom(enemySprites);
    const enemy = new Enemy(
      this,
      this.getCoinSpawnPositionX(),
      this.getCoinSpawnPositionY(),
      randomSprite
    );

    if (enemy) {
      this.enemies.push(enemy);
      this.physics.add.collider(this.enemies, this.groundLayer);
      this.physics.add.collider(this.enemies, this.jumperLayer);
      this.physics.add.collider(this.enemies, this.platformsLayer);
      this.physics.add.overlap(
        this.cat?.sprite as Phaser.Physics.Arcade.Sprite,
        enemy,
        this
          .handlePlayerEnemyCollisions as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );
    }
}
  private spawnBossEnemy() {
    this.bossEnemy = new BossEnemy(
      this,
      this.getCoinSpawnPositionX() + 32,
      this.getCoinSpawnPositionY(),
      "boss",
      this.cat!.sprite
    );
    this.physics.add.collider(this.bossEnemy, this.groundLayer);
    this.physics.add.collider(this.bossEnemy, this.jumperLayer);
    this.physics.add.collider(this.bossEnemy, this.platformsLayer);
    this.physics.add.overlap(
      this.cat!.sprite,
      this.bossEnemy,
      this
        .handlePlayerBossEnemyCollisions as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }
  private handlePlayerEnemyCollisions() {
    if (this.cat?.isInvulnerable) return;

    this.timer = this.timer - TIME_TO_REMOVE_PER_HIT;

    GameEvents.GAME_UPDATE.push({ additionalTime: -TIME_TO_REMOVE_PER_HIT });
    this.cat!.isInvulnerable = true;

    if (this.cat) {
      this.cat.isHit = true;
    }

    this.time.delayedCall(1000, () => {
      this.cat!.isInvulnerable = false;
    });
  }
  private handlePlayerBossEnemyCollisions(
    player: Phaser.GameObjects.GameObject,
    enemy: Phaser.GameObjects.GameObject
  ) {
    const playerSprite = player as Phaser.Physics.Arcade.Sprite;
    const enemySprite = enemy as Phaser.Physics.Arcade.Sprite;

    const playerBottom = playerSprite.y + playerSprite.height / 2;
    const playerLeft = playerSprite.x - playerSprite.width / 2;
    const playerRight = playerSprite.x + playerSprite.width / 2;
    const enemyTop = enemySprite.y - enemySprite.height / 2;
    const enemyLeft = enemySprite.x - enemySprite.width / 2;
    const enemyRight = enemySprite.x + enemySprite.width / 2;

    const isTopCollision =
      playerBottom < enemyTop + 32 &&
      playerBottom > enemyTop - 32 &&
      playerRight > enemyLeft &&
      playerLeft < enemyRight;

    if (isTopCollision) {
      playerSprite.setVelocityY(-1000);
      if (!this.canCollectReward) {
        this.canCollectReward = true;

        GameEvents[GameEvent.GAME_COIN_CAUGHT].push({
          score: BOSS_REWARD_POINTS,
        });
        this.score += BOSS_REWARD_POINTS;

        this.time.delayedCall(3000, () => {
          this.canCollectReward = false;
        });
      }
    } else {
      this.bossEnemy!.destroy();
      this.endGame();
    }
  }

  private processCoinReward(coin: Coin) {
    this.score += coin.coinReward;
    if (coin.timeReward) {
      const newTime = this.timer + coin.timeReward;

      const formattedTime = Number(newTime.toFixed());

      this.timer = formattedTime;

      GameEvents.GAME_UPDATE.push({ additionalTime: coin.timeReward });
    }
  }

  private getCoinSpawnPositionX(): number {
    const leftWall = -440;
    const rightWall = 300;

    return Math.floor(Math.random() * (rightWall - leftWall + 1)) + leftWall;
  }

  private getCoinSpawnPositionY(): number {
    const leftWall = -1450;
    const rightWall = -400;

    return Math.floor(Math.random() * (rightWall - leftWall + 1)) + leftWall;
  }

  private setDefaultSound() {
    this.backgroundSound?.play();
  }

  private endGame() {
    clearInterval(this.coinSpawnInterval as NodeJS.Timeout);
    this.coinSpawnInterval = null;

    this.cat?.sprite.setVelocity(0, 0);

    // Clear all enemies
    this.coins.forEach((coin) => {
      coin.sprite.destroy();
    });

    this.coins = [];

    if (this.enemies) {
      this.enemies.forEach((enemy) => {
        enemy.destroy();
      });
      this.enemies = [];
    }
    if (this.bossEnemy) {
      this.bossEnemy.destroy();
      this.IsBossSpawned = false;
    }

    GameEvents.GAME_STOP.push({ score: this.score });
    this.score = 0;
    this.enemySpawnThreshold = DEFAULT_ENEMY_SPAWN_THRESHOLD;
  }

  private startGame() {
    this.timer = catbassadorsGameDuration;

    this.coinSpawnInterval = setInterval(() => {
      this.spawnCoin();
    }, 400);
  }
}
