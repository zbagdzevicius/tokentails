import { Enemy, EnemyType } from "@/components/catbassadors/objects/Enemy";
import { setIsGameLoaded } from "@/components/game/events";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { ZOOM } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { GenerateLevel } from "../level/generateLevel";
import { Chest } from "../objects/Chest";
import { MovablePlatform } from "../objects/MovablePlatform";
import { Player } from "../objects/Player";
import { Pathfinding } from "../utils/Pathfinding";

const COLLISION_TILES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 29, 31, 33, 34, 35, 36, 37, 62, 63, 64, 65, 72,
  88, 90, 91, 92, 93, 94, 120, 121, 122, 123, 150, 151, 152,
];
const SPIKE_TILES = [70, 71, 99, 100];
const JUMP_LAYER_TILES = [47, 48, 49];

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
  private player?: Player;
  private pathfinding!: Pathfinding;
  public groundLayer?: Phaser.Tilemaps.TilemapLayer;
  private jumpLayer?: Phaser.Tilemaps.TilemapLayer;
  private chest!: Chest;
  private hasKey: boolean = false;
  private errorMessageText!: Phaser.GameObjects.Text;
  key: Enemy[] = [];
  private platforms: MovablePlatform[] = [];
  constructor() {
    super("PurrquestScene");
  }

  preload() {
    this.groundLayer?.destroy();
    this.jumpLayer?.destroy();
    this.load.image("blocks", "base/blocks-original.png");
    this.load.spritesheet("chest", "purrquest2/icons/chest-spritesheet.png", {
      frameWidth: 120,
      frameHeight: 64,
    });
    this.load.image("platform", "purrquest2/icons/platform.png");
    this.load.image(
      "platform-movable",
      "purrquest2/icons/platform-movable.png"
    );
    this.load.image("key", "purrquest/sprites/key.png");
  }

  create() {
    this.physics.world.setFPS(90);

    const startGameCallback = (props?: { detail: { cat: ICat } } & any) => {
      if (this) {
        this.startGame(props?.detail?.cat);
      } else {
        removeEventListener("game-start", startGameCallback);
      }
    };
    window.addEventListener("game-start", startGameCallback);
    setIsGameLoaded();
  }

  startGame(cat: ICat) {
    this.initializeLevel();
    this.initializePathfinding();

    this.renderTilemap();

    this.spawnPlayer(cat);
  }

  private renderEverythingAfterCat() {
    this.spawnMovablePlatformsOnTiles(
      Object.keys(PLATFORM_CONFIGS).map(Number)
    );
    this.spawnChest(284);
    this.spawnKey();
    this.initializeColliders();
  }

  update() {
    if (!this.player?.sprite || !this.platforms?.length) {
      return;
    }
    this.player.update();
    this.platforms.forEach((platform) => {
      platform.update();
    });
    this.key.forEach((enemy) => enemy.update());
    this.checkPlayerProximityToChest();
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

    this.load.on("complete", () => this.createPlayer(), this);
    this.load.spritesheet("cat", cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createPlayer() {
    const startCoords = this.generateLevel.getStartCoordinates();
    const startX =
      startCoords.x *
        this.generateLevel.getTileSize() *
        this.generateLevel.getRoomCols() +
      32 * 7.5;
    const startY =
      startCoords.y *
        this.generateLevel.getTileSize() *
        this.generateLevel.getRoomRows() +
      64 -
      16;

    this.player = new Player(this, startX, startY);
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
    this.physics.add.overlap(
      this.player!.sprite,
      this.groundLayer!,
      (player, tile) =>
        this.checkSpikeTileCollision(
          player as Phaser.GameObjects.Sprite,
          tile as Phaser.Tilemaps.Tile
        ),
      undefined,
      this
    );
  }

  private renderTilemap() {
    const { baseLayer, overlayLayer } = this.generateLevel.generateGridData();
    const tilemap = this.make.tilemap({
      data: baseLayer,
      tileWidth: 32,
      tileHeight: 32,
    });
    const tileset = tilemap.addTilesetImage("blocks", "blocks");

    if (!tileset) {
      console.error(
        "Tileset could not be loaded. Please check the asset path and name."
      );
      return;
    }

    const baseLayerName = tilemap.layers[0]?.name || "layer";
    this.groundLayer = tilemap.createLayer(baseLayerName, tileset, 0, 0)!;
    if (!this.groundLayer) {
      console.error("Ground layer could not be created.");
      return;
    }
    this.groundLayer.setCollision(COLLISION_TILES);

    if (overlayLayer) {
      this.renderOverlayLayer(overlayLayer, tileset, tilemap);
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

  private checkSpikeTileCollision(
    player: Phaser.GameObjects.Sprite,
    tile: Phaser.Tilemaps.Tile
  ) {
    const spikeTiles = SPIKE_TILES;
    if (spikeTiles.includes(tile.index)) {
      this.onDestroy();

      const event = new CustomEvent("game-over", {
        detail: { score: 0, message: "Try again" },
      });

      window.dispatchEvent(event);
    }
  }

  private onDestroy() {
    this.physics.world.colliders.destroy();
    this.platforms.forEach((platform) => platform.destroy());
    this.key.forEach((enemy) => enemy.sprite.destroy());
    this.chest.destroy();
    this.children.removeAll();
    this.player?.sprite.destroy();
    this.load.removeAllListeners();
    this.player = undefined;
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
    this.addColliders();
  }

  private spawnKey() {
    const solutionPath = this.generateLevel.solutionCells;

    if (solutionPath.length > 0) {
      const middleIndex = Math.floor(solutionPath.length / 2) + 1;
      const { x, y } = solutionPath[middleIndex];

      const keyX =
        x *
          this.generateLevel.getTileSize() *
          this.generateLevel.getRoomCols() +
        32 * 6.5;
      const keyY =
        y *
          this.generateLevel.getTileSize() *
          this.generateLevel.getRoomRows() +
        64 -
        16;

      // Spawn key enemy specifically with type 'KEY'
      const keyEnemy = new Enemy(this as any, keyX, keyY, EnemyType.KEY);
      this.key.push(keyEnemy);
      this.physics.add.collider(keyEnemy.sprite, this.groundLayer!);

      this.physics.add.overlap(
        this.player?.sprite as Phaser.Physics.Arcade.Sprite,
        keyEnemy.sprite,
        (player, key) => this.collectKey(key as Phaser.GameObjects.Sprite),
        undefined,
        this
      );
    }
  }

  private collectKey(key: Phaser.GameObjects.Sprite) {
    this.hasKey = true;
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
      if (this.hasKey) {
        this.chest.open();
        this.hasKey = false;
        this.onDestroy();

        const event = new CustomEvent("game-over", {
          detail: { score: 5000, message: " Congratz !" },
        });

        window.dispatchEvent(event);
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
