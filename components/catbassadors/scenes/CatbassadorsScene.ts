import { IProfileCat, catbassadorsGameDuration } from "@/models/cats";
import { Scene } from "phaser";
import BaseBus from "../CatbassadorsBus";
import { CatbassadorsBusEvent } from "../CatbassadorsBus.events";
import { Cat } from "../objects/Catbassador";
import { Enemy, EnemyType } from "../objects/Enemy";

const enemyDurationMs = 15000;

const setIsGameLoaded = () => {
  const event = new CustomEvent("game-loaded", {
    detail: { start: true },
  });

  window.dispatchEvent(event);
};

export class CatbassadorsScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  enemy?: Enemy | null;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  enemies: Enemy[] = [];
  enemySpawnInterval: NodeJS.Timeout | null = null;
  timer: number = catbassadorsGameDuration;
  score: number = 0;
  gameSound?: Phaser.Sound.BaseSound;
  backgroundSound?: Phaser.Sound.BaseSound;

  constructor() {
    super("CatbassadorsScene");

    BaseBus.addListener(CatbassadorsBusEvent.SPAWN_CAT, (args: any) =>
      this.spawnCat(args)
    );

    BaseBus.addListener(CatbassadorsBusEvent.SPAWN_PLAY, () =>
      this.spawnEnemy()
    );
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
    this.load.image("bg", "base/bg.svg");
    this.load.image("platforms", "base/pirate/platforms.png");
    this.load.image("walls", "base/pirate/walls.png");
    this.load.image("decorations", "base/pigs/decorations.png");
    this.load.image("grass", "base/outer-bg/grass.png");
    this.load.image("clouds", "base/outer-bg/clouds.png");
    this.load.image("rock", "base/outer-bg/rock.png");
    this.load.image("sky", "base/outer-bg/sky.png");
  }

  create() {
    this.add.image(0, -600, "bg").setDisplaySize(2200, 1600);

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

    this.tilemap.createLayer("decorations", [sugarTileset]);

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByExclusion([-1]);
    BaseBus.emit("current-scene-ready");
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(1.25);

    this.setMobileControls();
    window.addEventListener("game-start", () => this.startGame());
    setIsGameLoaded();

    this.gameSound = this.sound.add("coingame", { loop: true });
    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.setDefaultSound();
  }

  private setMobileControls() {
    const leftButton = document.getElementById("left");
    leftButton?.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileLeft = true;
        this.cat.isMobileRight = false;
      }
    });
    leftButton?.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileLeft = false;
      }
    });
    leftButton?.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileLeft = false;
      }
    });

    const rightButton = document.getElementById("right");
    rightButton?.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileRight = true;
        this.cat.isMobileLeft = false;
      }
    });
    rightButton?.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileRight = false;
      }
    });
    rightButton?.addEventListener("mouseleave", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileRight = false;
      }
    });

    const jumpButton = document.getElementById("jump");
    jumpButton?.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileJumping = true;
      }
    });
    jumpButton?.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileJumping = false;
      }
    });
    jumpButton?.addEventListener("mouseleave", (e) => {
      e.preventDefault();
      if (this.cat) {
        this.cat.isMobileJumping = false;
      }
    });
  }

  async spawnCat(cat: IProfileCat) {
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
    this.cameras.main.startFollow(this.cat.sprite);
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

  update(time: number, delta: number) {
    this.cat?.update();
    this.enemies.forEach((enemy) => enemy.update());

    this.timer -= delta / 1000;

    if (this.timer <= 0 && this.enemySpawnInterval) {
      this.endGame();
    }
  }

  private onCatCatchTheEnemy(enemy: Enemy) {
    // Add reward
    this.processEnemyReward(enemy);
    this.sound.play("coin");

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

    this.gameSound?.play();

    this.enemySpawnInterval = setInterval(() => {
      this.spawnEnemy();
    }, 400);
  }
}
