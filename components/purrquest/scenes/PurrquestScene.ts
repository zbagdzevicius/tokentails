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
import { Pathfinding } from "../utils/Pathfinding";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { catWalkSpeed, endScenePeriod } from "@/models/game";

import { BuffManager } from "@/components/catbassadors/managers/BuffManager";
import {
  EnemyManager,
  IEnemyManagerConfig,
} from "@/components/catbassadors/managers/EnemyManager";

import { PlatformManager } from "../managers/PlatformManager";
import { SpikeManager } from "../managers/SpikeManager";
import { ErrorTextManager } from "../managers/ErrorTextManager";
import { ChestManager } from "../managers/ChestManager";

const COLLISION_TILES = [
  0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 30, 31, 32,
  33, 34, 35, 36, 46, 47, 48, 49, 60, 61, 62, 63, 67, 68, 69, 70, 76, 77, 78,
  79, 90, 91, 92, 93, 106, 107, 108, 109, 133, 134, 135, 216, 217, 248, 249,
  250, 192, 163, 164, 165, 193, 194, 195,
];

const JUMP_LAYER_TILES = [
  216, 217, 138, 139, 168, 169, 199, 223, 224, 225, 226,
];
const TRAMPOLINE_TILES = [158, 157];

// const TRAMPOLINE_TILES = [50];
const SPIKE_TILES = [252, 253, 282, 283];
// const JUMP_LAYER_TILES = [46, 47, 48, 49];

const PLATFORM_CONFIGS: {
  [key: number]: {
    image: string;
    speed: number;
    distance: number;
    oneWay: boolean;
  };
} = {
  475: { image: "platform-movable", speed: 64, distance: 48, oneWay: true },
  476: { image: "platform", speed: 64, distance: 64, oneWay: false },
  474: { image: "platform", speed: 48, distance: 96, oneWay: false },
};

export class PurrquestScene extends Phaser.Scene {
  private generateLevel!: GenerateLevel;
  tilemap!: Phaser.Tilemaps.Tilemap;
  cat?: Cat;
  private pathfinding!: Pathfinding;
  public groundLayer!: Phaser.Tilemaps.TilemapLayer | null;
  private jumpLayer?: Phaser.Tilemaps.TilemapLayer | null;
  key!: Coin;

  trampoline?: Trampoline;
  blessing!: Phaser.GameObjects.Sprite;
  private gameStartTime: number = 0;

  buffManager!: BuffManager;
  enemyManager!: EnemyManager;

  platformManager!: PlatformManager;
  spikeManager!: SpikeManager;
  errorTextManager!: ErrorTextManager;
  chestManager!: ChestManager;

  constructor() {
    super("PurrquestScene");
  }

  preload() {
    this.groundLayer?.destroy();
    this.jumpLayer?.destroy();
    this.load.audio("jump-sound", "audio/game/jump.mp3");
    this.load.audio("dash-sound", "audio/game/dash.wav");
    this.load.image("new-blocks-winter", "base/winter.png");
    this.load.spritesheet("chest", "purrquest2/icons/chest-spritesheet.png", {
      frameWidth: 120,
      frameHeight: 64,
    });
    this.load.image("platform", "purrquest2/icons/platform.png");
    this.load.image(
      "platform-movable",
      "purrquest2/icons/platform-movable.png"
    );
    this.load.spritesheet("jump-wall", "game/effects/jump.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
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
    this.load.spritesheet(
      "knockback-spell",
      "abilities/knockback-spell/FIRE.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );

    this.load.image("speedPowerUp", "buff/SPEED.png");

    this.load.spritesheet("speed-effect", "buff/SPEED-EFFECT.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.startGame();
    const catSpawnCallback = (data: ICatEvent<GameEvent.GAME_START>) =>
      this.spawnPlayer(data.detail.cat!);
    GameEvents.GAME_START.addEventListener(catSpawnCallback);

    this.scene.scene.events.once("destroy", () => {});

    this.buffManager = new BuffManager({
      scene: this,
      catSprite: this.cat?.sprite || null,
      groundLayer: this.groundLayer!,
      buffSpawnThresholdMs: 11000,
      buffBounds: {
        xMin: 200,
        xMax: 1700,
        yMin: 200,
        yMax: 1700,
      },
      baseWalkSpeed: catWalkSpeed,
    });
    this.buffManager.startSpawning();

    this.scene.scene.events.once("destroy", () => {
      GameEvents.GAME_START.removeEventListener(catSpawnCallback);
      this.buffManager?.stopSpawning();
    });
    this.createAnimations();
  }

  createAnimations() {
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

  startGame() {
    this.gameStartTime = performance.now();
    this.initializeLevel();
    this.initializePathfinding();

    this.renderTilemap();
  }

  private renderEverythingAfterCat() {
    this.platformManager = new PlatformManager(this, this.groundLayer!);
    this.platformManager.spawnMovablePlatforms(
      Object.keys(PLATFORM_CONFIGS).map(Number),
      PLATFORM_CONFIGS,
      this.cat!.sprite
    );
    this.spawnKey();
    this.initializeColliders();
    this.buffManager.startGame();

    const enemyManagerConfig: IEnemyManagerConfig = {
      scene: this,
      cat: this.cat!,
      groundLayer: this.groundLayer!,
      platformsLayer: this.groundLayer!,
      jumperLayer: this.jumpLayer!,
      enemySpawnBounds: {
        xMin: 200,
        xMax: 1700,
        yMin: 200,
        yMax: 1700,
      },
      gameType: "purrquest",
    };

    this.spikeManager = new SpikeManager({
      scene: this,
      groundLayer: this.groundLayer!,
      spikeTiles: SPIKE_TILES,
      catSprite: this.cat!.sprite,
      onPlayerHitSpike: () => this.endGame(),
    });

    this.errorTextManager = new ErrorTextManager({
      scene: this,
      fontSize: 16,
      defaultDurationMs: 3000,
    });

    this.chestManager = new ChestManager({
      scene: this,
      groundLayer: this.groundLayer!,
      chestTileIndex: 473,
      cat: this.cat!,
      onChestOpened: (score) => {
        const totalTimePlayed = (performance.now() - this.gameStartTime) / 1000;
        GameEvents.GAME_STOP.push({
          score,
          time: Math.floor(totalTimePlayed),
        });
        this.onDestroy();
      },
      onChestRequiresKey: (x, y) => {
        this.errorTextManager.displayError(
          "You need a key to open this chest.",
          x,
          y
        );
      },
    });

    this.enemyManager = new EnemyManager(enemyManagerConfig);
    this.enemyManager.spawnEnemy();
    this.enemyManager.initialSpawnForPurrquest();
  }

  update(time: number, delta: number) {
    if (!this.cat?.sprite) {
      return;
    }
    this.cat.update();
    this.key.update();
    this.platformManager.updatePlatforms();

    this.enemyManager?.update(time, delta);
  }

  private initializeLevel() {
    this.generateLevel = new GenerateLevel(this);
    this.generateLevel.clearLevelData();
    this.generateLevel.generateNewRoom();
  }

  private initializePathfinding() {
    this.pathfinding = new Pathfinding(this, this.generateLevel);
    this.pathfinding.initializePathfinding();
    this.pathfinding.validatePathExistence(479, 480);
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
    if (this.cat || !cat) {
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
            .setVisible(true);

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

  private createPlayer(
    cat: ICat,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
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

    this.cat = new Cat(this, startX, startY, cat.name, blessing!, type);
    this.cat.hasKey = false;

    this.cat;

    this.cameras.main.startFollow(this.cat.sprite);
    this.cat.sprite.setDepth(2);
    this.cameras.main.zoom = ZOOM;

    setMobileControls(this.cat);
    this.renderEverythingAfterCat();

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

    if (this.buffManager) {
      this.buffManager["catSprite"] = this.cat?.sprite || null;
    }
  }

  private renderTilemap() {
    const { baseLayer, overlayLayer } = this.generateLevel.generateGridData();

    this.tilemap = this.make.tilemap({
      data: baseLayer,
      tileWidth: 32,
      tileHeight: 32,
    });

    const sugarTileset = this.tilemap.addTilesetImage(
      "new-blocks-winter",
      "new-blocks-winter",
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

  private initializeColliders() {
    this.physics.add.collider(
      this.cat?.sprite as Phaser.Physics.Arcade.Sprite,
      this.groundLayer!
    );

    this.physics.add.collider(
      this.cat?.sprite as Phaser.Physics.Arcade.Sprite,
      this.jumpLayer!
    );
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
      this.cat?.sprite as Phaser.Physics.Arcade.Sprite,
      this.key.sprite,
      (player, key) => this.collectKey(key as Phaser.GameObjects.Sprite),
      undefined,
      this
    );
  }

  private collectKey(key: Phaser.GameObjects.Sprite) {
    if (this.cat) {
      this.cat.hasKey = true;
    }
    key.destroy();
  }

  endGame() {
    const totalTimePlayed = (performance.now() - this.gameStartTime) / 1000;
    if (this.cat) {
      this.cat.isDeath = true;
      this.cat!.walkSpeed = 50;
      this.cat.sprite.setTint(0xff0000);
    }
    this.time.delayedCall(endScenePeriod, () => {
      if (this.cat) {
        this.cat!.walkSpeed = catWalkSpeed;
        this.cat.isDeath = false;
        this.cat.sprite.clearTint();
      }
      GameEvents.GAME_STOP.push({
        score: 0,
        time: Math.floor(totalTimePlayed),
      });

      this.onDestroy();
      this.buffManager?.endGame();
    });
  }

  private onDestroy() {
    this.cat = undefined;
    this.spikeManager?.destroySpikes();
    this.physics.world.colliders.destroy();
    this.platformManager.destroyPlatforms();
    this.key?.sprite?.destroy();
    this.errorTextManager?.destroy();
    this.chestManager?.destroy();
    this.children.removeAll();
    this.load.removeAllListeners();
    this.scene.restart({ isRestart: true });
  }
}
