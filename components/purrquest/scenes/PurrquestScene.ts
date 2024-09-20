import { GenerateLevel } from "../level/generateLevel";
import { Player } from "../objects/Player";
import { MovablePlatform } from "../objects/MovablePlatform";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Pathfinding } from "../utils/Pathfinding";
import { Chest } from "../objects/Chest";
import { Enemy, EnemyType } from "@/components/catbassadors/objects/Enemy";
import { ZOOM } from "@/constants/utils";
import { EventBus } from "../EventBus";
import { PurrquestBusEvent } from "../PurrquestBus.events";

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
  private player!: Player;
  private pathfinding!: Pathfinding;
  public groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private jumpLayer!: Phaser.Tilemaps.TilemapLayer;
  private chest!: Chest;
  private hasKey: boolean = false;
  private errorMessageText!: Phaser.GameObjects.Text;
  key: Enemy[] = [];
  private platforms: MovablePlatform[] = [];
  constructor() {
    super("PurrquestScene");
  }

  preload() {
    this.load.spritesheet("cat", "cats/black/sprites/hat-cylinder-black.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet("blocks", "base/blocks-original.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("chest", "purrquest2/icons/chest-spritesheet.png", {
      frameWidth: 120,
      frameHeight: 64,
    });
    this.load.image("leftButton", "game/controls/left.png");
    this.load.image("rightButton", "game/controls/right.png");
    this.load.image("jumpButton", "game/controls/jump.png");
    this.load.image("dashButton", "game/controls/dash.png");
    this.load.image("platform", "purrquest2/icons/platform.png");
    this.load.image(
      "platform-movable",
      "purrquest2/icons/platform-movable.png"
    );
    this.load.image("key", "purrquest/sprites/key.png");
  }
  create() {
    this.physics.world.setFPS(90);
    this.initializeLevel();
    this.initializePathfinding();
    this.spawnPlayer();
    this.renderTilemap();
    this.spawnChest(284);
    this.spawnMovablePlatformsOnTiles(
      Object.keys(PLATFORM_CONFIGS).map(Number)
    );
    this.spawnKey();
    this.initializeColliders();
  }

  update() {
    this.player.update();
    this.platforms.forEach((platform) => {
      platform.update();
    });
    this.key.forEach((enemy) => enemy.update());
    this.checkPlayerProximityToChest();
    this.checkPlayerBlockedState();
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
  private spawnPlayer() {
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
  }

  private renderTilemap() {
    const { baseLayer, overlayLayer } = this.generateLevel.generateGridData();
    const tilemap = this.make.tilemap({
      data: baseLayer,
      tileWidth: 32,
      tileHeight: 32,
    });
    const tileset = tilemap.addTilesetImage("blocks-original", "blocks");

    if (!tileset) {
      console.error(
        "Tileset could not be loaded. Please check the asset path and name."
      );
      return;
    }

    const baseLayerName = tilemap.layers[0]?.name || "layer";
    const createdLayer = tilemap.createLayer(baseLayerName, tileset, 0, 0);
    if (!createdLayer) {
      console.error("Ground layer could not be created.");
      return;
    }
    this.groundLayer = createdLayer;
    this.groundLayer.setCollision(COLLISION_TILES);

    if (overlayLayer) {
      this.renderOverlayLayer(overlayLayer, tileset, tilemap);
    }

    this.physics.add.collider(
      this.player.sprite as Phaser.Physics.Arcade.Sprite,
      this.groundLayer
    );
    this.physics.add.collider(
      this.player.sprite as Phaser.Physics.Arcade.Sprite,
      this.jumpLayer
    );
    this.physics.add.overlap(
      this.player.sprite,
      this.groundLayer,
      (player, tile) =>
        this.checkSpikeTileCollision(
          player as Phaser.GameObjects.Sprite,
          tile as Phaser.Tilemaps.Tile
        ),
      undefined,
      this
    );
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
    const jumpLayerInstance = overlayTilemap.createLayer(
      tilemap.layers[1]?.name || "layer",
      tileset,
      0,
      0
    );
    if (jumpLayerInstance) {
      this.jumpLayer = jumpLayerInstance;
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
    this.groundLayer.forEachTile((tile: Phaser.Tilemaps.Tile) => {
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
            this.player.sprite as Phaser.GameObjects.Sprite, // Cast player.sprite to Sprite
            platform as Phaser.GameObjects.GameObject, // Cast platform to GameObject
            this
              .playerOnPlatform as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, // Type assertion
            undefined,
            this
          );
        }
      }
    });
  }
  private handleTilemapCollision(
    player: Phaser.Physics.Arcade.Sprite,
    tile: Phaser.Tilemaps.Tile
  ) {
    this.checkPlayerBlockedState();
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
      this.scene.pause();
      this.cameras.main.setAlpha(0.7);
      EventBus.emit(PurrquestBusEvent.CAT_DIED);
    }
  }

  private checkPlayerBlockedState() {
    const isBlockedLeft = this.player.sprite.body!.blocked.left;
    const isBlockedRight = this.player.sprite.body!.blocked.right;
  }

  private playerOnPlatform(
    player: Phaser.Physics.Arcade.Sprite,
    platform: MovablePlatform
  ) {
    if (MovablePlatform.isPlayerOnPlatform(player, platform)) {
      const playerVelocityX = player.body!.velocity.x;
      const isPlayerMoving = playerVelocityX !== 0;
      this.checkPlayerBlockedState();

      if (!isPlayerMoving) {
      }
    }
  }
  private initializeColliders() {
    this.physics.add.collider(
      this.player.sprite as Phaser.Physics.Arcade.Sprite,
      this.groundLayer,
      (player, tile) =>
        this.handleTilemapCollision(
          player as Phaser.Physics.Arcade.Sprite,
          tile as Phaser.Tilemaps.Tile
        ),
      undefined,
      this
    );

    this.physics.add.collider(
      this.player.sprite as Phaser.Physics.Arcade.Sprite,
      this.jumpLayer
    );
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
      const keyEnemy = new Enemy(this, keyX, keyY, EnemyType.KEY);
      this.key.push(keyEnemy);
      this.physics.add.collider(keyEnemy.sprite, this.groundLayer);

      this.physics.add.overlap(
        this.player.sprite as Phaser.Physics.Arcade.Sprite,
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
    const tile = this.groundLayer.findByIndex(tileIndex);
    if (tile) {
      const x = tile.getCenterX();
      const y = tile.getCenterY();
      this.chest = new Chest(this, x, y);
      this.physics.add.collider(this.chest, this.groundLayer);
    }
  }
  private checkPlayerProximityToChest() {
    if (this.physics.overlap(this.player.sprite, this.chest)) {
      if (this.hasKey) {
        this.chest.open();
        this.hasKey = false;
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
