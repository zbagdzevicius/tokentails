import Phaser from "phaser";
import { GenerateLevel } from "../level/generateLevel";
import { Player } from "../objects/Player";
import { MoovablePlatform } from "../objects/MoovablePlatform";
import { setMobileControls, isMobileOrTablet } from "../utils/MobileControls";
import { Pathfinding } from "../utils/Pathfinding";

export class DevScene extends Phaser.Scene {
  private generateLevel!: GenerateLevel;
  private player!: Player;
  private moovablePlatform!: MoovablePlatform;
  private pathfinding!: Pathfinding;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private loadingText!: Phaser.GameObjects.Text;

  constructor() {
    super("DevScene");
  }

  preload() {
    this.loadingText = this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        "Loading...",
        {
          fontSize: "32px",
          color: "#ffffff",
        }
      )
      .setOrigin(0.5);
    this.load.spritesheet("cat", "cats/black/sprite/combined.png", {
      frameWidth: 64,
      frameHeight: 39,
    });
    this.load.spritesheet("blocks", "base/blocks-original.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.image("leftButton", "game/controls/left.png");
    this.load.image("rightButton", "game/controls/right.png");
    this.load.image("jumpButton", "game/controls/jump.png");
    this.load.image("dashButton", "game/controls/dash.png");
    this.load.image("platform", "game/platform.png");


    this.load.on("progress", (value: number) => {
      this.loadingText.setText(`Loading... ${Math.round(value * 100)}%`);
    });

   
    this.load.on("complete", () => {
      this.loadingText.destroy();
    });
  }

  create() {
    this.generateLevel = new GenerateLevel(this);

    const platformConfigs = [
      { speed: 15, distance: 32, tileIndex: 270 },
      { speed: 50, distance: 64, tileIndex: 269 },
    ];

    this.moovablePlatform = new MoovablePlatform(this, platformConfigs);

    this.generateLevel.generateNewRoom();

    this.pathfinding = new Pathfinding(this, this.generateLevel);
    this.pathfinding.initializePathfinding();
    this.pathfinding.validatePathExistence(289, 290);

    this.spawnPlayer();
    this.renderTilemap();

    this.moovablePlatform.createPlatformsForTiles(
      this.groundLayer!,
      this.player.sprite
    );

    this.physics.add.collider(
      this.moovablePlatform.getGroup(),
      this.groundLayer
    );

    if (isMobileOrTablet()) {
      setMobileControls(this, this.player);
    }
  }

  update() {
    this.player.update();
    this.moovablePlatform.update(this.player.sprite, this.groundLayer);
  }

  private spawnPlayer() {
    const startCoords = this.generateLevel.getStartCoordinates();
    const startX =
      startCoords.x *
        this.generateLevel.getTileSize() *
        this.generateLevel.getRoomCols() +
      32 * 6.5;
    const startY =
      startCoords.y *
        this.generateLevel.getTileSize() *
        this.generateLevel.getRoomRows() +
      64 -
      16;

    this.player = new Player(this, startX, startY);
  }

  private renderTilemap() {
    const gridData = this.generateLevel.generateGridData();
    const tilemap = this.make.tilemap({
      key: "tilemap",
      data: gridData,
      tileWidth: 32,
      tileHeight: 32,
    });

    const tileset = tilemap.addTilesetImage("blocks-original", "blocks");
    this.groundLayer = tilemap.createLayer("layer", tileset!, 0, 0)!;
    this.groundLayer?.setCollision([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 89, 90, 91, 33, 34, 35, 36, 37, 62, 63,
      64, 65, 66, 72, 92, 93, 94, 120, 121, 122, 123, 150, 151, 152,
    ]);

    this.physics.add.collider(
      this.player.sprite as Phaser.Physics.Arcade.Sprite,
      this.groundLayer!,
      undefined,
      undefined,
      this.moovablePlatform
    );
    this.physics.add.collider(
      this.moovablePlatform.getGroup(),
      this.groundLayer!
    );

    this.cameras.main.startFollow(this.player.sprite);
    this.player.sprite.setDepth(1);

    // Adding collision detection for spikes
    this.physics.add.overlap(
      this.player.sprite,
      this.groundLayer!,
      (player, tile) =>
        this.checkSpikeTileCollision(
          player as Phaser.GameObjects.Sprite,
          tile as Phaser.Tilemaps.Tile
        ),
      undefined,
      this
    );

    this.physics.add.collider(
      this.player.sprite as Phaser.Physics.Arcade.Sprite,
      this.moovablePlatform.getGroup(),
      (player, platform) =>
        this.moovablePlatform.collisionMovingPlatform(
          player as Phaser.Physics.Arcade.Sprite,
          platform as Phaser.Physics.Arcade.Image
        ),
      undefined,
      this
    );
  }

  private checkSpikeTileCollision(
    player: Phaser.GameObjects.Sprite,
    tile: Phaser.Tilemaps.Tile
  ) {
    const spikeTiles = [70, 71, 100, 99];
    if (spikeTiles.includes(tile.index)) {
      this.scene.pause();
      this.cameras.main.setAlpha(0.7);
      this.scene.launch("UIScene");
    }
  }
}
