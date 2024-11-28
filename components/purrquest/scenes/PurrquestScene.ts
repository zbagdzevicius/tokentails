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
import { ICat } from "@/models/cats";
import { GenerateLevel } from "../level/generateLevel";
import { Chest } from "../objects/Chest";
import { MovablePlatform } from "../objects/MovablePlatform";
import { Pathfinding } from "../utils/Pathfinding";
import { Spike } from "../objects/Spikes";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { Enemy } from "@/components/purrquest/objects/Enemy";
import { BossEnemy } from "../objects/Boss";
const COLLISION_TILES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 29, 30, 31, 32, 33, 34, 35, 36, 37, 62, 63, 64,
  65, 72, 88, 90, 91, 92, 93, 94, 120, 121, 122, 123, 149, 150, 151, 152,
];

const TRAMPOLINE_TILES = [50];
const SPIKE_TILES = [70, 71, 99, 100];
const JUMP_LAYER_TILES = [46, 47, 48, 49];

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
  private enemies: Enemy[] = [];
  bossEnemy?: BossEnemy;
  trampoline?: Trampoline;

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
    this.load.spritesheet("enemy-pinkie", "enemies/pink-fluffie.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("enemy-blue-fluffie", "enemies/blue-fluffie.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("enemy-white-owlet", "enemies/white-owlet.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("boss", "enemies/boss-new.png", {
      frameWidth: 96,
      frameHeight: 64,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.physics.world.setFPS(90);
    this.startGame();

    const catSpawnCallback = (data: ICatEvent<GameEvent.GAME_START>) =>
      this.spawnPlayer(data.detail.cat!);
    GameEvents.GAME_START.addEventListener(catSpawnCallback);

    this.scene.scene.events.once("destroy", () => {
      GameEvents.GAME_START.removeEventListener(catSpawnCallback);
    });
  }

  startGame() {
    this.initializeLevel();
    this.initializePathfinding();

    this.renderTilemap();
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
  private spawnPlayer(cat: ICat) {
    if (this.player || !cat) {
      return;
    }
    this.load.on("complete", () => this.createPlayer(cat), this);
    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createPlayer(cat: ICat) {
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

    this.player = new Cat(this, startX, startY, cat.name);
    this.player.hasKey = false;
    this.cameras.main.startFollow(this.player.sprite);
    this.player.sprite.setDepth(2);
    this.cameras.main.zoom = ZOOM;
    setMobileControls(this.player);
    this.renderEverythingAfterCat();
  }

  private addColliders() {
    this.physics.add.collider(
      this.player!.sprite as Phaser.Physics.Arcade.Sprite,
      this.groundLayer!
    );
    this.physics.add.collider(
      this.player!.sprite as Phaser.Physics.Arcade.Sprite,
      this.jumpLayer!
    );
  }
  private getRandomWalkableTile(): Phaser.Tilemaps.Tile | null {
    if (!this.groundLayer) {
      console.error("Ground layer is not defined.");
      return null;
    }

    // Filter out all non-colliding tiles where entities can be placed
    const walkableTiles = this.groundLayer.filterTiles(
      (tile: Phaser.Tilemaps.Tile) => {
        return !tile.collides && tile.index !== -1; // Ensure the tile is walkable
      }
    );

    // Check if there are any walkable tiles available
    if (walkableTiles.length === 0) {
      console.error("No walkable tiles found.");
      return null;
    }

    // Return a random tile from the filtered walkable tiles
    return Phaser.Utils.Array.GetRandom(walkableTiles);
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
          .handlePlayerEnemyCollisions as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );
    });
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
      this
        .handlePlayerEnemyCollisions as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
  }
  handlePlayerEnemyCollisions() {
    this.playerDeathMessage();
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
          this.platforms.push(platform);

          this.physics.add.existing(platform);

          // Collider between platform and groundLayer (with type assertions)
          this.physics.add.collider(
            platform as unknown as Phaser.GameObjects.GameObject, // Cast to ensure compatibility
            this.groundLayer as Phaser.GameObjects.GameObject, // Cast groundLayer to GameObject
            this
              .handlePlatformTileCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, // Type assertion
            undefined,
            this
          );

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

  private playerDeathMessage() {
    GameEvents.GAME_STOP.push({ score: 0, message: "Try again" });
    this.onDestroy();
  }

  private onDestroy() {
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
          this.playerDeathMessage();
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
      if (this.player.hasKey) {
        this.chest.open();
        this.player.hasKey = false;
        this.onDestroy();

        GameEvents.GAME_STOP.push({ score: 5000, message: " Congratz ! " });
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

    this.time.delayedCall(3000, () => {
      if (this.errorMessageText) {
        this.errorMessageText.setVisible(false);
      }
    });
  }
}
