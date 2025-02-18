import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { CatAbilityType, ICat, catbassadorsGameDuration } from "@/models/cats";
import { Scene } from "phaser";
import { Cat } from "../objects/Catbassador";
import { EnemyManager } from "../managers/EnemyManager";
import { CoinManager } from "../managers/CoinManager";
import { BuffManager } from "../managers/BuffManager";

import { currentDayCoin, ZOOM } from "@/constants/utils";
import { endScenePeriod } from "@/models/game";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];
const TRAMPOLINE_TILES = [158, 159, 160];

const DEFAULT_ENEMY_SPAWN_THRESHOLD = 100;

export class CatbassadorsScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  coinSpawnInterval: NodeJS.Timeout | null = null;
  timer: number = catbassadorsGameDuration;
  score: number = 0;
  backgroundSound?: Phaser.Sound.BaseSound;
  lastUpdateTime: number;
  trampoline?: Trampoline;
  enemySpawnThreshold = DEFAULT_ENEMY_SPAWN_THRESHOLD;

  canCollectReward: boolean = false;
  IsBossSpawned = false;
  blessing!: Phaser.GameObjects.Sprite;
  gameStartTime: number = 0;
  private gameOver: boolean = false;

  private coinManager?: CoinManager;
  private buffManager?: BuffManager;
  enemyManager?: EnemyManager;

  private gravityReverseInterval: number = 120000;
  private nextGravityReverseTime: number = 0;
  private isGravityReversed: boolean = false;

  private decorationLayer!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: number[] = [74, 44];
  private waterAnimationTimer: number = 0;
  private waterAnimationInterval: number = 350;

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

    this.load.image("speedPowerUp", "buff/SPEED.png");

    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.audio("coin", "purrquest/sounds/score.mp3");
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.audio("jump-sound", "audio/game/jump.mp3");
    this.load.audio("dash-sound", "audio/game/dash.wav");
    this.load.tilemapTiledJSON("tilemap", "catbassadors/catbassadors.json");
    this.load.image("new-blocks-winter", "base/winter.png");
    this.load.spritesheet("starAnimation", "base/star-animation.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("jump-wall", "game/effects/jump.png", {
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

    this.load.spritesheet(
      "knockback-spell",
      "abilities/knockback-spell/FIRE.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
    this.load.spritesheet("speed-effect", "buff/SPEED-EFFECT.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("puff", "catbassadors/images/puff.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const sugarTileset = this.tilemap.addTilesetImage(
      "new-blocks-winter",
      "new-blocks-winter",
      32,
      32,
      1,
      2
    )!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;
    this.platformsLayer = this.tilemap.createLayer("platforms", [
      sugarTileset,
    ])!;
    this.decorationLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
    ])!;
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByExclusion([-1]);
    this.platformsLayer?.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: Phaser.GameObjects.GameObject) => {
        const playerSprite = player as Phaser.Physics.Arcade.Sprite;

        if (this.isGravityReversed) {
          // Allow collision when moving downward (falling)
          return playerSprite.body!.velocity.y >= 0;
        } else {
          // Allow collision when moving upward (jumping)
          return playerSprite.body!.velocity.y <= 0;
        }
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

    this.coinManager = new CoinManager({
      scene: this,
      groundLayer: this.groundLayer,
      catSprite: this.cat?.sprite || null,
      coinSpawnBounds: { xMin: -440, xMax: 300, yMin: -1450, yMax: -400 },
      coinSpawnIntervalMs: 400,
    });

    this.buffManager = new BuffManager({
      scene: this,
      catSprite: this.cat?.sprite || null,
      groundLayer: this.groundLayer,
      buffSpawnThresholdMs: 15000,
      buffBounds: { xMin: -440, xMax: 300, yMin: -1450, yMax: -400 },
      baseWalkSpeed: 200,
    });

    this.enemyManager = new EnemyManager({
      scene: this,
      cat: this.cat!,
      groundLayer: this.groundLayer,
      platformsLayer: this.platformsLayer,
      jumperLayer: this.jumperLayer,
      enemySpawnBounds: { xMin: -440, xMax: 300, yMin: -1450, yMax: -400 },
      onTimerDecrease: (timeToRemove) => {
        this.timer -= timeToRemove;
        GameEvents.GAME_UPDATE.push({ additionalTime: -timeToRemove });
      },
      onScoreIncrease: (amount) => {
        this.score += amount;
      },
      gameType: "catbassadors",
    });

    this.createAnimations();

    this.nextGravityReverseTime = this.time.now + this.gravityReverseInterval;

    this.setupWaterAnimation();
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

  createAnimations() {
    this.anims.create({
      key: "puff",
      frames: this.anims.generateFrameNumbers("puff", { start: 0, end: 4 }),
      frameRate: 16,
      repeat: 0,
    });

    this.anims.create({
      key: "star",
      frames: this.anims.generateFrameNumbers("starAnimation", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: 1,
    });

    this.anims.create({
      key: "jump_wall_anim",
      frames: this.anims.generateFrameNumbers("jump-wall", {
        start: 0,
        end: 4,
      }),
      frameRate: 10,
      repeat: 0,
    });
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

    this.load.once(
      "complete",
      () => {
        if (cat.blessings && cat.blessings.length > 0) {
          this.blessing = this.add
            .sprite(0, 0, `blessing-${cat.blessings[0].ability}`)
            .setVisible(true);

          this.anims.create({
            key: `blessing_animation_${cat.blessings[0].ability}`,
            frames: this.anims.generateFrameNumbers(
              `blessing-${cat.blessings[0].ability}`,
              { start: 0, end: 59 }
            ),
            frameRate: 16,
            repeat: -1,
          });

          this.blessing.play(`blessing_animation_${cat.blessings[0].ability}`);
        }

        this.createCat(cat.name, this.blessing, cat.type);
      },
      this
    );

    if (cat.blessings?.length) {
      this.load.spritesheet(
        `blessing-${cat.blessings[0].ability}`,
        `flare-effect/spritesheets/${cat.blessings[0].ability}.png`,
        {
          frameWidth: 64,
          frameHeight: 64,
        }
      );
    }

    this.catDto = cat;
    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createCat(
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
    this.cat = new Cat(this, 0, -400, catName, blessing!, type);
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

    this.coinManager && (this.coinManager["catSprite"] = this.cat.sprite);
    this.buffManager && (this.buffManager["catSprite"] = this.cat.sprite);
    this.enemyManager && (this.enemyManager["cat"] = this.cat);

    setMobileControls(this.cat);
  }

  update(time: any, delta: any) {
    if (time > this.nextGravityReverseTime && !this.gameOver) {
      this.reverseGravityForAll();
      this.nextGravityReverseTime = time + this.gravityReverseInterval;
    }

    this.cat?.update();
    this.enemyManager?.update(time, delta);
    this.coinManager?.update();
    this.enemyManager?.checkEnemyMilestone(this.score);

    this.timer -= delta / 1000;

    if (this.timer <= 0 && !this.gameOver) {
      this.timer = 0;
      this.gameOver = true;
      this.endGame();
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

  endGame() {
    if (this.cat) {
      this.cat.isDeath = true;
    }
    clearInterval(this.coinSpawnInterval as NodeJS.Timeout);
    this.coinSpawnInterval = null;

    this.cat?.sprite.setVelocity(0, 0);

    this.coinManager?.stopSpawning();
    this.coinManager?.clearCoins();

    this.buffManager?.stopSpawning();
    this.buffManager?.endGame();
    this.enemyManager?.clearAllEnemies();

    const totalPlayTime = (performance.now() - this.gameStartTime) / 1000;
    this.time.delayedCall(endScenePeriod, () => {
      GameEvents.GAME_STOP.push({
        score: this.score,
        time: Math.floor(totalPlayTime),
      });
      this.score = 0;
      this.enemySpawnThreshold = DEFAULT_ENEMY_SPAWN_THRESHOLD;
      if (this.cat) {
        this.cat.isDeath = false;
      }
    });

    this.isGravityReversed = false;
    if (this.cat?.movement) {
      this.cat.movement.setGravityReversed(false);
    }
  }

  private startGame() {
    if (this.cat) {
      this.cat.isDeath = false;
    }
    this.gameOver = false;
    this.gameStartTime = performance.now();
    this.timer = catbassadorsGameDuration;

    this.coinManager?.startSpawning();
    this.buffManager?.startSpawning();
    this.buffManager?.startGame();

    this.isGravityReversed = false;
    this.nextGravityReverseTime = this.time.now + this.gravityReverseInterval;
    if (this.cat?.movement) {
      this.cat.movement.setGravityReversed(false);
    }
  }

  private reverseGravityForAll() {
    this.isGravityReversed = !this.isGravityReversed;

    if (this.cat?.movement) {
      this.cat.movement.setGravityReversed(this.isGravityReversed);
    }

    this.enemyManager?.setGravityReversed(this.isGravityReversed);
  }

  private setupWaterAnimation() {
    const waterTilePositions: { x: number; y: number }[] = [];
    this.decorationLayer.forEachTile((tile) => {
      if (tile.index === 74) {
        waterTilePositions.push({ x: tile.x, y: tile.y });
      }
    });

    this.time.addEvent({
      delay: this.waterAnimationInterval,
      callback: () => {
        waterTilePositions.forEach((pos) => {
          const currentTile = this.decorationLayer.getTileAt(pos.x, pos.y);
          if (currentTile) {
            const currentIndex = this.waterTiles.indexOf(currentTile.index);
            const nextIndex = (currentIndex + 1) % this.waterTiles.length;
            this.decorationLayer.putTileAt(
              this.waterTiles[nextIndex],
              pos.x,
              pos.y
            );
          }
        });
      },
      loop: true,
    });
  }
}
