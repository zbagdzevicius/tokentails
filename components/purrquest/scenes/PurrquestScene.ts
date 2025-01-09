import { Cat } from "@/components/catbassadors/objects/Catbassador";
import {
  Coin as Key,
  CoinType,
  Coin,
} from "@/components/catbassadors/objects/Coin";
import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { ZOOM } from "@/constants/utils";
import { CatAbilityType, ICat } from "@/models/cats";
import { GenerateLevel } from "../level/generateLevel";
import { Chest } from "../objects/Chest";
import { MovablePlatform } from "../objects/MovablePlatform";
import { Pathfinding } from "../utils/Pathfinding";
import { Spike } from "../objects/Spikes";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { Enemy } from "@/components/purrquest/objects/Enemy";
import { BossEnemy } from "../objects/Boss";
import { catWalkSpeed, endScenePeriod } from "@/models/game";
import { BuffType,Buff } from "@/components/catbassadors/objects/Buff";
import { SpeedEffect } from "@/components/catbassadors/objects/SpeedEffect";

const COLLISION_TILES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 29, 30, 31, 32, 33, 34, 35, 36, 37, 62, 63, 64,
  65, 72, 88, 90, 91, 92, 93, 94, 120, 121, 122, 123, 149, 150, 151, 152,
];

const TRAMPOLINE_TILES = [50];
const SPIKE_TILES = [70, 71, 99, 100];
const JUMP_LAYER_TILES = [46, 47, 48, 49];

const POWERUP_DURATION_MS = 10000;
const POWERUP_SPAWN_THRESHOLD = 11000;

const PLATFORM_CONFIGS: {
  [key: number]: {
    image: string;
    speed: number;
    distance: number;
    oneWay: boolean;
  };
} = {
  270: { image: "platform-movable", speed: 64, distance: 48, oneWay: true },
  269: { image: "platform", speed: 64, distance: 64, oneWay: false },
  268: { image: "platform", speed: 48, distance: 96, oneWay: false },
};

export class PurrquestScene extends Phaser.Scene {
  private generateLevel!: GenerateLevel;
  tilemap!: Phaser.Tilemaps.Tilemap;
  private player?: Cat;
  private pathfinding!: Pathfinding;
  public groundLayer?: Phaser.Tilemaps.TilemapLayer | null;
  private jumpLayer?: Phaser.Tilemaps.TilemapLayer | null;
  private chest!: Chest;
  private errorMessageText!: Phaser.GameObjects.Text;
  key!: Coin;
  private platforms: MovablePlatform[] = [];
  private spikes: Spike[] = [];
  public enemies: Enemy[] = []
  bossEnemy?: BossEnemy;
  trampoline?: Trampoline;
  blessing!: Phaser.GameObjects.Sprite;
  private gameStartTime: number = 0;

 buffSpawnTimer: NodeJS.Timeout | null = null;
  currentBuff: Buff | null = null;
  buffLifetimeTimer: NodeJS.Timeout | null = null;

  private speedBuffTimer: Phaser.Time.TimerEvent | null = null;

  private speedEffect: SpeedEffect | null = null;

  constructor() {
    super("PurrquestScene");
  }

  preload() {
    this.groundLayer?.destroy();
    this.jumpLayer?.destroy();
    this.load.image("blocks", "base/blocks-winter.png");
    this.load.spritesheet("chest", "purrquest2/icons/chest-spritesheet.png", {
      frameWidth: 120,
      frameHeight: 64,
    });
    this.load.image("platform", "purrquest2/icons/platform.png");
    this.load.image(
      "platform-movable",
      "purrquest2/icons/platform-movable.png"
    );
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.image("key", "purrquest/sprites/key.png");
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
    this.load.spritesheet("knockback-spell", "abilities/knockback-spell/FIRE.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.image("speedPowerUp", "buff/SPEED.png");

    this.load.spritesheet("speed-effect", "buff/SPEED-EFFECT.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

  }

  create(props: IPhaserGameSceneProps) {
    this.physics.world.setFPS(120);
    this.startGame();
    this.speedEffect = new SpeedEffect(this);

    const catSpawnCallback = (data: ICatEvent<GameEvent.GAME_START>) =>
      this.spawnPlayer(data.detail.cat!);
    GameEvents.GAME_START.addEventListener(catSpawnCallback);

    this.scene.scene.events.once("destroy", () => {
  GameEvents[GameEvent.BUFF_SPAWN].removeEventListener(this.handleBuffCollected);
});

    this.scene.scene.events.once("destroy", () => {
      GameEvents.GAME_START.removeEventListener(catSpawnCallback);
    });
  }

  startGame() {
    this.gameStartTime = performance.now();
    this.initializeLevel();
    this.initializePathfinding();

    this.renderTilemap();
     if (this.buffSpawnTimer) {
    clearInterval(this.buffSpawnTimer);
  }

  this.buffSpawnTimer = setInterval(() => {
    this.spawnBuff();
  }, POWERUP_SPAWN_THRESHOLD);
  }

  private renderEverythingAfterCat() {
    this.spawnMovablePlatformsOnTiles(
      Object.keys(PLATFORM_CONFIGS).map(Number)
    );
    this.spawnSpikes();
    this.spawnChest(284);
    this.spawnKey();
    this.initializeColliders();
    this.spawnEnemiesRandomly(4);
    this.spawnBossEnemy();
  }

  update(time: number, delta: number) {
    if (!this.player?.sprite || !this.platforms?.length) {
      return;
    }
    this.player.update();
    this.platforms.forEach((platform) => {
      platform.update();
    });
    this.key.update();
    this.checkPlayerProximityToChest();
    this.enemies.forEach((enemy) => {
      enemy?.update(time, delta);
    });
    this.bossEnemy?.update(time, delta);

     if (this.currentBuff) {
    this.currentBuff.update();
  }
  }

  private initializeLevel() {
    this.generateLevel = new GenerateLevel(this);
    this.generateLevel.clearLevelData();
    this.generateLevel.generateNewRoom();
  }

  private initializePathfinding() {
    this.pathfinding = new Pathfinding(this, this.generateLevel);
    this.pathfinding.initializePathfinding();
    this.pathfinding.validatePathExistence(289, 290);
  }

    private getSpawnPositionX(): number {
    const leftWall = 200;
    const rightWall = 1700;

    return Math.floor(Math.random() * (rightWall - leftWall + 1)) + leftWall;
  }

  private getSpawnPositionY(): number {
    const leftWall = 200;
    const rightWall = 1700;

    return Math.floor(Math.random() * (rightWall - leftWall + 1)) + leftWall;
  }

  private spawnPlayer(cat: ICat) {
    if (this.player || !cat) {
      return;
    }
    if (this.blessing) {
      this.blessing.setVisible(false);
    }
    const catType = cat.type;
    this.load.once(
      "complete",
      () => {
        if (cat.blessings && cat.blessings.length > 0) {
          this.blessing = this.add
            .sprite(0, 0, `blessing-${cat.blessings[0].ability}`)
            .setVisible(true)

          this.anims.create({
            key: `blessing_animation_${cat.blessings[0].ability}`,
            frames: this.anims.generateFrameNumbers(
              `blessing-${cat.blessings[0].ability}`,
              {
                start: 0,
                end: 59,
              }
            ),
            frameRate: 16,
            repeat: -1,
          });

          this.blessing.play(`blessing_animation_${cat.blessings[0].ability}`);
        }

        this.createPlayer(cat, this.blessing, catType);
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

    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.start();
  }

  private createPlayer(cat: ICat, blessing: Phaser.GameObjects.Sprite | null, type: CatAbilityType) {
    const startCoords = this.generateLevel.getStartCoordinates();
    const startX =
      startCoords.x *
        this.generateLevel.getTileSize() *
        this.generateLevel.getRoomCols() +
      32 * 5.5;
    const startY =
      startCoords.y *
        this.generateLevel.getTileSize() *
        this.generateLevel.getRoomRows() +
      32 * 7;
    
    this.player = new Cat(this, startX, startY, cat.name, blessing!,type);
    this.player.hasKey = false;

     this.player

    this.cameras.main.startFollow(this.player.sprite);
    this.player.sprite.setDepth(2);
    this.cameras.main.zoom = ZOOM

    setMobileControls(this.player);
    this.renderEverythingAfterCat();

    // Dynamically update the blessing position to follow the player
    if (blessing) {
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (this.player?.sprite.active) {
            blessing.setPosition(
              this.player.sprite.x,
              this.player.sprite.y - 50
            );
          } else {
            blessing.destroy();
          }
        },
      });
    }
  }

private getRandomWalkableTile(): Phaser.Tilemaps.Tile | null {
    if (!this.groundLayer) {
        console.error("Ground layer is not defined.");
        return null;
    }

    const walkableTiles = this.groundLayer.filterTiles(
        (tile: Phaser.Tilemaps.Tile) => {
            return !tile.collides && tile.index !== -1;
        }
    );

    if (!walkableTiles || walkableTiles.length === 0) {
        console.error("No walkable tiles found.");
        return null;
    }

    const randomTile = Phaser.Utils.Array.GetRandom(walkableTiles);
    if (!randomTile) {
        console.error("Failed to select a random walkable tile.");
        return null;
    }

    return randomTile;
}

  private spawnEnemiesRandomly(count: number) {
    const enemySprites = [
      "enemy-pinkie",
      "enemy-blue-fluffie",
      "enemy-white-owlet",
    ];

    // Filter out all non-colliding tiles where enemies can be placed
    const walkableTiles = this.groundLayer!.filterTiles((tile: any) => {
      return !tile.collides && tile.index !== -1; // Ensure the tile exists
    });

    // Shuffle the array and select the desired number of tiles
    const shuffledTiles = Phaser.Utils.Array.Shuffle(walkableTiles);
    const selectedTiles = shuffledTiles.slice(0, count);

    selectedTiles.forEach((tile) => {
      const x = tile.getCenterX();
      const y = tile.getCenterY();

      const randomSprite = Phaser.Utils.Array.GetRandom(enemySprites);
      const enemy = new Enemy(this, x, y, randomSprite);

      this.enemies.push(enemy);

      // Add enemy physics
      this.physics.add.collider(
        enemy as Phaser.Physics.Arcade.Sprite,
        this.groundLayer!
      );
      this.physics.add.collider(
        enemy as Phaser.Physics.Arcade.Sprite,
        this.jumpLayer!
      );

      this.platforms.forEach((platform) => {
        this.physics.add.collider(
          enemy as Phaser.Physics.Arcade.Sprite,
          platform as Phaser.GameObjects.GameObject
        );
      });

      this.physics.add.overlap(
        this.player?.sprite as Phaser.Physics.Arcade.Sprite,
        enemy,
        this
          .pushPlayerBack as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );
    });
  }

  private pushPlayerBack(
    player: Phaser.Physics.Arcade.Sprite,
    enemy: Enemy | BossEnemy
  ) {

    if (enemy.isKnockedDown) {
    return; 
  }
    if (!this.player!.isInvulnerable) {
      let pushBackForce = enemy instanceof BossEnemy ? 800 : 500;

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

      this.player!.walkSpeed = 100;

      this.player!.isHit = true;
      this.player!.isInvulnerable = true;

      player.setVelocityX(velocityX);
      player.setVelocityY(velocityY);

      this.time.delayedCall(
        2000,
        () => {
          this.player!.walkSpeed = catWalkSpeed;
        },
        undefined,
        this
      );

      this.time.delayedCall(
        1000,
        () => {
          this.player!.isInvulnerable = false;
          this.player!.isHit = false;
        },
        undefined,
        this
      );
    }
  }

  private spawnBossEnemy() {
    const tile = this.getRandomWalkableTile();
    if (!tile) {
      console.error("No walkable tile available for boss spawn.");
      return;
    }

    const bossX = tile.getCenterX();
    const bossY = tile.getTop() - 32;

    this.bossEnemy = new BossEnemy(
      this,
      bossX,
      bossY,
      "boss",
      this.player!.sprite
    );

    this.physics.add.existing(this.bossEnemy);

    if (this.bossEnemy) {
      this.physics.add.collider(this.bossEnemy, this.groundLayer!);
      this.physics.add.collider(this.bossEnemy, this.jumpLayer!);
    }

    this.platforms.forEach((platform) => {
      this.physics.add.collider(
        this.bossEnemy as Phaser.GameObjects.GameObject,
        platform
      );
    });
    this.physics.add.overlap(
      this.player?.sprite as Phaser.Physics.Arcade.Sprite,
      this.bossEnemy,
      this.pushPlayerBack as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }

  handlePlayerEnemyCollisions() {
    this.endGame();
  }

  private renderTilemap() {
    const { baseLayer, overlayLayer } = this.generateLevel.generateGridData();

    this.tilemap = this.make.tilemap({
      data: baseLayer,
      tileWidth: 32,
      tileHeight: 32,
    });

    const sugarTileset = this.tilemap.addTilesetImage(
      "blocks",
      "blocks",
      32,
      32,
      1,
      2
    );

    if (!sugarTileset) {
      console.error(
        "Tileset could not be loaded. Please check the asset path and name."
      );
      return;
    }

    // Use a valid layer name like "layer" instead of "blocks"
    const baseLayerName = "layer";
    this.groundLayer = this.tilemap.createLayer(
      baseLayerName,
      sugarTileset,
      0,
      0
    );
    if (!this.groundLayer) {
      console.error("Ground layer could not be created.");
      return;
    }
    this.groundLayer.setCollision(COLLISION_TILES);

    if (overlayLayer) {
      this.renderOverlayLayer(overlayLayer, sugarTileset, this.tilemap);
    }
  }

  private renderOverlayLayer(
    overlayLayer: number[][],
    tileset: Phaser.Tilemaps.Tileset,
    tilemap: Phaser.Tilemaps.Tilemap
  ) {
    const overlayTilemap = this.make.tilemap({
      data: overlayLayer,
      tileWidth: 32,
      tileHeight: 32,
    });
    this.jumpLayer = overlayTilemap.createLayer(
      tilemap.layers[1]?.name || "layer",
      tileset,
      0,
      0
    )!;
    if (this.jumpLayer) {
      this.jumpLayer.setDepth(1);
      this.jumpLayer.setCollision(JUMP_LAYER_TILES);
      this.jumpLayer.setTileIndexCallback(
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
    }
    this.jumpLayer?.setCollision(TRAMPOLINE_TILES);
    this.trampoline = new Trampoline(this, this.jumpLayer, TRAMPOLINE_TILES);
  }
  private spawnMovablePlatformsOnTiles(tileIndices: number[]) {
    if (!this.player?.sprite) {
      return;
    }
    
    this.groundLayer!.forEachTile((tile: Phaser.Tilemaps.Tile) => {
      if (tileIndices.includes(tile.index)) {
        const platformX = tile.getCenterX();
        const platformY = tile.getCenterY();
        const config = PLATFORM_CONFIGS[tile.index];

        if (config) {
          const platform = new MovablePlatform(
            this,
            platformX,
            platformY,
            config.image,
            config.speed,
            config.distance,
            config.oneWay
          );
          this.physics.add.existing(platform);
          this.platforms.push(platform);

          if (this.player?.sprite && this.groundLayer) {
          this.physics.add.collider(
            platform as unknown as Phaser.GameObjects.GameObject, // Cast to ensure compatibility
            this.groundLayer as Phaser.GameObjects.GameObject, // Cast groundLayer to GameObject
            this
              .handlePlatformTileCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, // Type assertion
            undefined,
            this
          );
        }
          // Collider between player and platform
          this.physics.add.collider(
            this.player!.sprite as Phaser.GameObjects.Sprite, // Cast player.sprite to Sprite
            platform as Phaser.GameObjects.GameObject // Cast platform to GameObject
          );
        }
      }
    });
  }

  private handlePlatformTileCollision(
    platform: MovablePlatform,
    tile: Phaser.Tilemaps.Tile
  ) {
    if (platform.body!.blocked.right) {
      platform.changeDirection("right");
    }
    if (platform.body!.blocked.left) {
      platform.changeDirection("left");
    }
  }

  private spawnSpikes() {
    if (!this.groundLayer) {
      console.error("Ground layer is not defined.");
      return;
    }
    const spikeTiles = this.groundLayer.filterTiles(
      (tile: Phaser.Tilemaps.Tile) => SPIKE_TILES.includes(tile.index)
    );

    spikeTiles.forEach((tile) => {
      const spikeX = tile.getCenterX();
      const spikeY = tile.getBottom();
      const spike = new Spike(this, spikeX, spikeY, 0);

      this.spikes.push(spike);

      switch (tile.index) {
        case 70:
          spike.setRotation(Phaser.Math.DegToRad(180));
          spike.setSize(1, 32);
          spike.setOffset(0, 0);
          break;
        case 71:
          spike.setRotation(Phaser.Math.DegToRad(90));
          spike.setSize(32, 1);
          spike.setOffset(0, 0);
          break;
        case 100:
          spike.setRotation(Phaser.Math.DegToRad(270));
          spike.setSize(1, 32);
          spike.setOffset(31, 0);
          break;
        case 99:
          spike.setRotation(Phaser.Math.DegToRad(0));
          spike.setSize(32, 1);
          spike.setOffset(0, 31);
          break;
        default:
          break;
      }
    });
  }

 private spawnBuff() {
    if (this.currentBuff) return;

    const x = this.getSpawnPositionX();
    const y = this.getSpawnPositionY();
    this.currentBuff = new Buff(this as any, x, y);

    this.physics.add.collider(this.currentBuff, this.groundLayer!);
    this.physics.add.overlap(
      this.player?.sprite!,
      this.currentBuff,
      this.handleBuffCollected,
      undefined,
      this
    );


    GameEvents[GameEvent.BUFF_SPAWN].push({ buff: this.currentBuff.type });

    this.buffLifetimeTimer = setTimeout(() => {
      if (this.currentBuff) {
        this.currentBuff.destroy();
        this.currentBuff = null;
      }
    }, POWERUP_DURATION_MS);
  }

  private handleBuffCollected = () => {
    if (!this.currentBuff) return;

    if (this.currentBuff.type === BuffType.SPEED) {
      this.applyOrRefreshSpeedBuff();
      this.speedEffect?.play(this.player!.sprite, POWERUP_DURATION_MS);
    }

    this.currentBuff.destroy();
    this.currentBuff = null;

    if (this.buffLifetimeTimer) {
      clearTimeout(this.buffLifetimeTimer);
      this.buffLifetimeTimer = null;
    }
  };

  private applyOrRefreshSpeedBuff(): void {
    if (!this.player) return;

    if (this.speedBuffTimer) {
      this.speedBuffTimer.remove(false); 
    } else {
      if (this.player.walkSpeed + 200 < 630) {
        this.player.walkSpeed += 200;
      }
    }

    GameEvents[GameEvent.CAT_BUFF].push({
      buff: BuffType.SPEED,
      duration: POWERUP_DURATION_MS,
    });

    this.speedBuffTimer = this.time.delayedCall(POWERUP_DURATION_MS, () => {
      if (this.player) {
        this.player.walkSpeed -= 200;
      }
      GameEvents[GameEvent.CAT_BUFF].push({ buff: null, duration: 0 });
      this.speedBuffTimer = null;
    });
  }

  private endGame() {
    const totalTimePlayed = (performance.now() - this.gameStartTime) / 1000;
    if (this.player) {
      this.player.isDeath = true;
      this.player!.walkSpeed = 50;
      this.player.sprite.setTint(0xff0000);
    }
    this.time.delayedCall(endScenePeriod, () => {
      if (this.player) {
        this.player!.walkSpeed = catWalkSpeed;
        this.player.isDeath = false;
        this.player.sprite.clearTint();
      }
      GameEvents.GAME_STOP.push({
        score: 0,
        time: Math.floor(totalTimePlayed),
      });

      this.onDestroy();
    });
  }

 private onDestroy() {
  if (this.buffSpawnTimer) {
    clearInterval(this.buffSpawnTimer);
    this.buffSpawnTimer = null;
  }

  if (this.buffLifetimeTimer) {
    clearTimeout(this.buffLifetimeTimer);
    this.buffLifetimeTimer = null;
  }

  this.player = undefined;
  this.physics.world.colliders.destroy();
  this.platforms.forEach((platform) => platform.destroy());
  this.key.sprite.destroy();
  this.chest.destroy();
  this.children.removeAll();
  this.load.removeAllListeners();
  this.scene.restart({ isRestart: true });
}


  private initializeColliders() {
    this.physics.add.collider(
      this.player?.sprite as Phaser.Physics.Arcade.Sprite,
      this.groundLayer!
    );

    this.physics.add.collider(
      this.player?.sprite as Phaser.Physics.Arcade.Sprite,
      this.jumpLayer!
    );

    this.spikes.forEach((spike) => {
      this.physics.add.overlap(
        this.player?.sprite as Phaser.Physics.Arcade.Sprite,
        spike,
        () => {
          this.endGame();
        },
        undefined,
        this
      );
    });
  }

  private spawnKey() {
    const tile = this.getRandomWalkableTile();
    if (!tile) {
      console.error("No walkable tile available for boss spawn.");
      return;
    }

    const keyX = tile.getCenterX();
    const keyY = tile.getTop() - 32;

    // Spawn key enemy specifically with type 'KEY'
    this.key = new Key(this as any, keyX, keyY, CoinType.KEY);
    this.physics.add.collider(this.key.sprite, this.groundLayer!);

    this.physics.add.overlap(
      this.player?.sprite as Phaser.Physics.Arcade.Sprite,
      this.key.sprite,
      (player, key) => this.collectKey(key as Phaser.GameObjects.Sprite),
      undefined,
      this
    );
  }

  private collectKey(key: Phaser.GameObjects.Sprite) {
    if (this.player) {
      this.player.hasKey = true;
    }
    key.destroy();
  }

  private spawnChest(tileIndex: number) {
    const tile = this.groundLayer!.findByIndex(tileIndex);
    if (tile) {
      const x = tile.getCenterX();
      const y = tile.getCenterY();
      this.chest = new Chest(this, x, y);
      this.physics.add.collider(this.chest, this.groundLayer!);
    }
  }

  private checkPlayerProximityToChest() {
    if (!this.player?.sprite) {
      return;
    }

    if (this.physics.overlap(this.player.sprite, this.chest)) {
      const totalTimePlayed = (performance.now() - this.gameStartTime) / 1000;

      if (this.player.hasKey) {
        this.chest.open();
        this.time.delayedCall(endScenePeriod, () => {
          this.player!.hasKey = false;
          this.onDestroy();
          GameEvents.GAME_STOP.push({
            score: 5000,
            time: Math.floor(totalTimePlayed),
          });
        });
      } else {
        const chestX = this.chest.x;
        const chestY = this.chest.y - 50;
        this.displayErrorMessage(
          "You need a key to open this chest.",
          chestX,
          chestY
        );
      }
    }
  }

  private displayErrorMessage(message: string, x?: number, y?: number) {
    const defaultX = this.cameras.main.width / 2;
    const defaultY = this.cameras.main.height / 4;
    const fontSize = Math.max(16, this.cameras.main.width * 0.01);

    if (!this.errorMessageText) {
      this.errorMessageText = this.add
        .text(x || defaultX, y || defaultY, message, {
          fontSize: `${fontSize}px`,
          color: "#ff0000",
        })
        .setOrigin(0.5);
      this.errorMessageText.setDepth(10);
    } else {
      this.errorMessageText.setPosition(x || defaultX, y || defaultY);
      this.errorMessageText.setText(message);
      this.errorMessageText.setStyle({ fontSize: `${fontSize}px` });
      this.errorMessageText.setVisible(true);
    }

    this.time.delayedCall(endScenePeriod, () => {
      if (this.errorMessageText) {
        this.errorMessageText.setVisible(false);
      }
    });
  }
}
