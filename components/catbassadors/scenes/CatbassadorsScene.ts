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

import { cdnFile, currentDayCoin, ZOOM } from "@/constants/utils";
import { endScenePeriod } from "@/models/game";
import { CoreMap } from "@/components/Phaser/map";
import { getMultiplier } from "@/constants/cat-utils";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];
const TRAMPOLINE_TILES = [158, 159, 160];

const DEFAULT_ENEMY_SPAWN_THRESHOLD = 1000;

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

  private gravityReverseInterval: number = 60000;
  private nextGravityReverseTime: number = 0;
  private isGravityReversed: boolean = false;

  private decorationLayer!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: number[] = [74, 44];
  private waterAnimationTimer: number = 0;
  private waterAnimationInterval: number = 350;

  private continuousCollisionCheck = true;

  constructor() {
    super("CatbassadorsScene");

    this.lastUpdateTime = 0;
  }
  preload() {
    this.load.spritesheet("food", cdnFile("base/food.png"), {
      frameWidth: 32,
      frameHeight: 32,
      margin: 1,
      spacing: 2,
    });

    this.load.image("bosscoin", cdnFile("logo/boss-coin.png"));
    this.load.image("candy-cane", currentDayCoin);
    this.load.image("timecoin", cdnFile("icons/clock.png"));
    this.load.image("coin", cdnFile("logo/coin.png"));

    this.load.image("speedPowerUp", cdnFile("buff/SPEED.png"));

    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));
    this.load.audio("coin", cdnFile("purrquest/sounds/score.mp3"));
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.audio("jump-sound", cdnFile("audio/game/jump.mp3"));
    this.load.audio("dash-sound", cdnFile("audio/game/dash.wav"));
    this.load.audio("game-end-sound", cdnFile("audio/game/game-end.mp3"));
    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile("catbassadors/catbassadors.json")
    );
    this.load.image("new-blocks-winter", cdnFile(CoreMap));
    this.load.spritesheet("starAnimation", cdnFile("base/star-animation.png"), {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("jump-wall", cdnFile("game/effects/jump.png"), {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "enemy-pinkie",
      cdnFile("enemies/pink-fluffie-winter.png"),
      {
        frameWidth: 32,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      "enemy-blue-fluffie",
      cdnFile("enemies/blue-fluffie-winter.png"),
      {
        frameWidth: 32,
        frameHeight: 32,
      }
    );
    this.load.spritesheet(
      "enemy-white-owlet",
      cdnFile("enemies/white-owlet-winter.png"),
      {
        frameWidth: 32,
        frameHeight: 32,
      }
    );
    this.load.spritesheet("boss", cdnFile("enemies/boss/boss-winter.png"), {
      frameWidth: 96,
      frameHeight: 64,
    });

    this.load.spritesheet(
      "knockback-spell",
      cdnFile("abilities/knockback-spell/FIRE.png"),
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
    this.load.spritesheet("speed-effect", cdnFile("buff/SPEED-EFFECT.png"), {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("puff", cdnFile("catbassadors/images/puff.png"), {
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

    this.decorationLayer.setDepth(10);

    this.groundLayer?.setCollisionByExclusion([-1]);
    this.platformsLayer?.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: Phaser.GameObjects.GameObject) => {
        const playerSprite = player as Phaser.Physics.Arcade.Sprite;

        if (this.isGravityReversed) {
          return playerSprite.body!.velocity.y >= 0;
        } else {
          return playerSprite.body!.velocity.y <= 0;
        }
      },
      this
    );

    this.jumperLayer?.setCollision(TRAMPOLINE_TILES);
    this.trampoline = new Trampoline(this, this.jumperLayer, TRAMPOLINE_TILES);
    this.physics.world.setFPS(60);

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

    // Add game stop event listener
    const stopGameCallback = (event: ICatEvent<GameEvent.GAME_STOP>) => {
      if (event.detail.time === 0) {
        this.endGame();
      }
    };
    GameEvents.GAME_STOP.addEventListener(stopGameCallback);

    GameEvents.GAME_LOADED.push({ scene: this });
    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
      GameEvents.GAME_STOP.removeEventListener(stopGameCallback);
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
      cat: this.cat!,
      groundLayer: this.groundLayer,
      buffSpawnThresholdMs: 25000,
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
            .sprite(0, 0, `blessing-${cat.type}`)
            .setVisible(true);

          this.anims.create({
            key: `blessing_animation_${cat.type}`,
            frames: this.anims.generateFrameNumbers(`blessing-${cat.type}`, {
              start: 0,
              end: 59,
            }),
            frameRate: 16,
            repeat: -1,
          });

          this.blessing.play(`blessing_animation_${cat.type}`);
        }

        this.createCat(cat.name, this.blessing, cat.type);
      },
      this
    );

    if (cat.blessings?.length) {
      this.load.spritesheet(
        `blessing-${cat.type}`,
        cdnFile(`flare-effect/spritesheets/${cat.type}.png`),
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
    this.cat = new Cat(
      this,
      0,
      -400,
      catName,
      blessing!,
      type,
      true,
      getMultiplier(this.catDto)
    );
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
    this.buffManager && (this.buffManager["cat"] = this.cat);
    this.enemyManager && (this.enemyManager["cat"] = this.cat);

    setMobileControls(this.cat);
  }

  private monitorPerformance() {
    if (this.cat?.sprite?.body) {
      const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
      console.log({
        position: { x: this.cat.sprite.x, y: this.cat.sprite.y },
        velocity: { x: body.velocity.x, y: body.velocity.y },
        fps: this.game.loop.actualFps,
        deltaTime: this.game.loop.delta,
      });
    }
  }

  update(time: any, delta: any) {
    //this.monitorPerformance()
    this.checkForWorldFallthrough();

    const fps = this.game.loop.actualFps;
    if (fps && fps < 15) {
      if (this.cat && this.cat.movement) {
        this.cat.movement.dashDisabled = true;
      }
      if (this.trampoline) {
        this.trampoline.bounceVelocity = -500;
      }
    } else {
      if (this.cat && this.cat.movement) {
        this.cat.movement.dashDisabled = false;
      }
      if (this.trampoline) {
        this.trampoline.bounceVelocity = -1000;
      }
    }

    // Continuous collision checking for high-speed movement
    if (this.continuousCollisionCheck && this.cat?.sprite) {
      this.performContinuousCollisionCheck();
    }

    // this.clampCatVelocity();

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

  private performContinuousCollisionCheck() {
    if (!this.cat?.sprite?.body) return;

    const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
    const currentPos = { x: body.x, y: body.y };
    const velocity = { x: body.velocity.x, y: body.velocity.y };

    // Calculate where the cat will be next frame
    const nextPos = {
      x: currentPos.x + velocity.x * 0.016, // Assuming 60fps
      y: currentPos.y + velocity.y * 0.016,
    };

    // Check for collision along the movement path
    if (this.wouldCollideAtPosition(nextPos.x, nextPos.y)) {
      // If collision detected, perform raycast to find exact collision point
      this.performRaycastCollision(currentPos, nextPos);
    }
  }

  private wouldCollideAtPosition(x: number, y: number): boolean {
    // Convert world position to tile coordinates
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);

    // Check ground layer
    const groundTile = this.groundLayer?.getTileAt(tileX, tileY);
    if (groundTile && groundTile.collides) {
      return true;
    }

    // Check platforms layer
    const platformTile = this.platformsLayer?.getTileAt(tileX, tileY);
    if (platformTile && platformTile.collides) {
      return true;
    }

    return false;
  }

  private performRaycastCollision(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) {
    if (!this.cat?.sprite?.body) return;

    // Simple raycast - check multiple points along the path
    const steps = 5;
    const deltaX = (end.x - start.x) / steps;
    const deltaY = (end.y - start.y) / steps;

    for (let i = 1; i <= steps; i++) {
      const checkX = start.x + deltaX * i;
      const checkY = start.y + deltaY * i;

      if (this.wouldCollideAtPosition(checkX, checkY)) {
        const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
        const safeX = start.x + deltaX * (i - 1);
        const safeY = start.y + deltaY * (i - 1);

        this.cat.sprite.setPosition(safeX, safeY);
        body.velocity.x = 0;
        body.velocity.y = Math.min(body.velocity.y, 0);

        break;
      }
    }
  }

  // private clampCatVelocity() {
  //   if (!this.cat?.sprite?.body) return;

  //   const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;

  //   // Clamp horizontal velocity
  //   if (Math.abs(body.velocity.x) > this.maxSafeVelocity.x) {
  //     body.velocity.x = Math.sign(body.velocity.x) * this.maxSafeVelocity.x;
  //   }

  //   // Clamp vertical velocity
  //   if (Math.abs(body.velocity.y) > this.maxSafeVelocity.y) {
  //     body.velocity.y = Math.sign(body.velocity.y) * this.maxSafeVelocity.y;
  //   }
  // }

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

    const gameEndSound = this.sound.add("game-end-sound", {
      volume: 1,
      loop: false,
    });
    gameEndSound.play();

    clearInterval(this.coinSpawnInterval as NodeJS.Timeout);
    this.coinSpawnInterval = null;

    this.cat?.sprite.setVelocity(0, 0);

    this.coinManager?.stopSpawning();
    this.coinManager?.clearCoins();
    this.coinManager?.destroy();

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
    this.coinManager?.clearCoins();

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

  private safePositions: Array<{ x: number; y: number }> = [
    { x: 100, y: -630 },
  ];

  private checkForWorldFallthrough() {
    if (!this.cat?.sprite) return;

    let fellOut = false;
    if (this.isGravityReversed) {
      fellOut = this.cat.sprite.y < -1600;
    } else {
      fellOut = this.cat.sprite.y > 500;
    }

    if (fellOut) {
      const nearestSafe = this.safePositions.reduce((nearest, pos) => {
        const distToNearest = Math.abs(this.cat!.sprite.x - nearest.x);
        const distToPos = Math.abs(this.cat!.sprite.x - pos.x);
        return distToPos < distToNearest ? pos : nearest;
      });

      this.cat.sprite.setPosition(nearestSafe.x, nearestSafe.y);
      const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);

      this.createTeleportEffect(nearestSafe.x, nearestSafe.y);
    }
  }

  private createTeleportEffect(x: number, y: number) {
    const puff = this.add.sprite(x, y, "puff");
    puff.play("puff");
    puff.once("animationcomplete", () => puff.destroy());
  }
}
