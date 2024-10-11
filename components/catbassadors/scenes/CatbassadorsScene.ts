import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { ICat, catbassadorsGameDuration } from "@/models/cats";
import { Scene } from "phaser";
import BaseBus from "../CatbassadorsBus";
import { CatbassadorsBusEvent } from "../CatbassadorsBus.events";
import { Cat } from "../objects/Catbassador";
import { Enemy } from "../objects/Enemy";
import { setIsGameLoaded } from "@/components/game/events";
const enemyDurationMs = 15000;

const JUMP_LAYER_TILES = [47, 48, 49, 50];
const TRAMPOLINE_TILES = [51];

export class CatbassadorsScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  enemy?: Enemy | null;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  enemies: Enemy[] = [];
  enemySpawnInterval: NodeJS.Timeout | null = null;
  timer: number = catbassadorsGameDuration;
  score: number = 0;
  gameSound?: Phaser.Sound.BaseSound;
  backgroundSound?: Phaser.Sound.BaseSound;
  lastUpdateTime: number;

  constructor() {
    super("CatbassadorsScene");
    BaseBus.addListener(CatbassadorsBusEvent.SPAWN_CAT, (args: any) =>
      this.spawnCat(args)
    );

    BaseBus.addListener(CatbassadorsBusEvent.SPAWN_PLAY, () =>
      this.spawnEnemy()
    );

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
    this.load.image("timecoin", "icons/clock.png");
    this.load.image("coin", "logo/coin.png");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.audio("coin", "purrquest/sounds/score.mp3");
    this.load.audio("coingame", "catbassadors/sounds/game.mp3");
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.tilemapTiledJSON("tilemap", "catbassadors/catbassadors.json");
    this.load.image("blocks", "base/blocks.png");
    this.load.spritesheet("starAnimation", "base/star-animation.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create() {
    this.physics.world.setFPS(90);
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
    this.jumperLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: Phaser.GameObjects.GameObject) => {
        const playerSprite = player as Phaser.Physics.Arcade.Sprite;
        if (playerSprite.body!.velocity.y <= 0) {
          playerSprite.setVelocityY(200);
          return true;
        }
        return false;
      },
      this
    );

    BaseBus.emit("current-scene-ready");
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(1.25);

    this.gameSound = this.sound.add("coingame", { loop: true });
    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.setDefaultSound();
    const startGameCallback = () => {
      if (this) {
        this.startGame();
      } else {
        removeEventListener("game-start", startGameCallback);
      }
    };
    window.addEventListener("game-start", startGameCallback);
    this.lastUpdateTime = performance.now();
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );

    setIsGameLoaded();
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

  async spawnCat(cat: ICat) {
    if (this.cat || !cat) {
      return;
    }

    this.load.on("complete", () => this.createCat(), this);
    this.load.spritesheet("cat", cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createCat() {
    this.cat = new Cat(this, 0, -400);
    this.physics.add.collider(this.cat.sprite, this.groundLayer);

    this.physics.add.collider(
      this.cat.sprite as Phaser.Physics.Arcade.Sprite,
      this.platformsLayer
    );
    this.physics.add.collider(
      this.cat.sprite as Phaser.Physics.Arcade.Sprite,
      this.jumperLayer,
      () => this.cat?.sprite.setVelocityY(-1000)
    );
    this.cameras.main.startFollow(this.cat.sprite);

    setMobileControls(this.cat);
  }

  spawnEnemy() {
    if (!this.cat) {
      return;
    }

    const enemy = new Enemy(
      this,
      this.getEnemySpawnPositionX(),
      this.getEnemySpawnPositionY()
    );

    this.enemies.push(enemy);

    this.physics.add.collider(enemy.sprite, this.groundLayer);

    this.physics.add.overlap(
      this.cat.sprite,
      enemy.sprite,
      () => this.onCatCatchTheEnemy(enemy),
      undefined,
      this
    );

    // Timer to remove the enemy after 5 seconds
    this.time.delayedCall(enemyDurationMs, () => {
      if (this.enemies.includes(enemy)) {
        enemy.sprite.destroy();
        this.enemies = this.enemies.filter((e) => e !== enemy);
      }
    });
  }

  update(time: any, delta: any) {
    this.cat?.update();
    this.enemies.forEach((enemy) => enemy.update());

    this.timer -= delta / 1000;

    if (this.timer <= 0 && this.enemySpawnInterval) {
      this.endGame();
    }

    this.lastUpdateTime = performance.now();
  }

  private onCatCatchTheEnemy(enemy: Enemy) {
    // Add reward
    this.processEnemyReward(enemy);
    this.sound.play("coin");

    if (this.cat) {
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

    // Remove the caught enemy
    enemy.sprite.destroy();
    this.enemies = this.enemies.filter((e) => e !== enemy);
  }

  private processEnemyReward(enemy: Enemy) {
    this.score += enemy.coinReward;
    if (enemy.timeReward) {
      const newTime = this.timer + enemy.timeReward;

      const formattedTime = Number(newTime.toFixed());

      this.timer = formattedTime;
      const event = new CustomEvent("game-update", {
        detail: { time: enemy.timeReward },
      });

      window.dispatchEvent(event);
    }
  }

  private getEnemySpawnPositionX(): number {
    const leftWall = -440;
    const rightWall = 300;

    return Math.floor(Math.random() * (rightWall - leftWall + 1)) + leftWall;
  }

  private getEnemySpawnPositionY(): number {
    const leftWall = -1450;
    const rightWall = -400;

    return Math.floor(Math.random() * (rightWall - leftWall + 1)) + leftWall;
  }

  private setDefaultSound() {
    this.backgroundSound?.play();
  }

  private endGame() {
    clearInterval(this.enemySpawnInterval as NodeJS.Timeout);
    this.enemySpawnInterval = null;

    this.cat?.sprite.setVelocity(0, 0);

    // Clear all enemies
    this.enemies.forEach((enemy) => {
      enemy.sprite.destroy();
    });
    this.enemies = [];

    if (this.gameSound) {
      this.gameSound.stop();
      this.setDefaultSound();
    }

    const event = new CustomEvent("game-over", {
      detail: { score: this.score },
    });

    window.dispatchEvent(event);
    this.score = 0;
  }

  private startGame() {
    this.timer = catbassadorsGameDuration;

    try {
      this.gameSound?.play();
    } catch {}

    this.enemySpawnInterval = setInterval(() => {
      this.spawnEnemy();
    }, 400);
  }
}
