import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { cdnFile, isMobile } from "@/constants/utils";
import { CatAbilityType, ICat } from "@/models/cats";
import { getMultiplier } from "@/constants/cat-utils";
import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";

import { Food } from "@/components/base/objects/Food";
import { CollectiveItem } from "@/components/storyMode/objects/CollectiveItem";

import { CatnipChaosLevelMap } from "@/components/Phaser/map";

import { DogBot } from "@/components/storyMode/objects/dogBot";

import { FloatingPlatformManager } from "@/components/storyMode/Managers/FloatingPlatformManager";
import {
  HiddenSpikeManager,
  IHiddenSpikeConfig,
} from "@/components/storyMode/Managers/HiddenSpikeManager";

import { SpikeManager } from "@/components/purrquest/managers/SpikeManager";

import { SawHalf } from "@/components/storyMode/Managers/SawHalfManager";
import { Saw } from "@/components/storyMode/Managers/SawManager";
import { PortalManager } from "@/components/storyMode/Managers/PortalManager";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];
const TRAMPOLINE_TILES = [158, 159, 160];

const FLOATING_PLATFORM_TILES = [9];

const SPIKE_TILES = [253, 254, 284, 283];

export interface ICatnipChaosProps {
  level: string;
}

export class CatnipChaosScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  physicsLayer!: Phaser.Tilemaps.TilemapLayer;
  catnipLayer!: Phaser.Tilemaps.TilemapLayer;
  backgroundSound?: Phaser.Sound.BaseSound;
  blessing!: Phaser.GameObjects.Sprite;
  trampoline?: Trampoline;
  private gameEnded: boolean = false;
  private portalManager?: PortalManager;

  spikeManager!: SpikeManager;
  collectiveItem?: CollectiveItem;

  autoRunSpeed: number = 265;
  autoJumpSpeed: number = 440;
  isAutoRunMode: boolean = true;

  saws: Array<Saw | SawHalf> = [];

  food?: Food | null;

  private isGravityReversed: boolean = false;
  private props!: ICatnipChaosProps;
  private dogs: DogBot[] = [];
  private floatingPlatformManagers: FloatingPlatformManager[] = [];
  private hiddenSpikeManagers: HiddenSpikeManager[] = [];
  private collectedCatnipCoins: number = 0;
  private currentLevel: string = "";
  private flightOnBlocks: Phaser.GameObjects.Sprite[] = [];
  private flightOffBlocks: Phaser.GameObjects.Sprite[] = [];
  private flightEffectSprite?: Phaser.GameObjects.Sprite;
  private flightCloudSprite?: Phaser.GameObjects.Sprite;
  private geometryDashCloudSprite?: Phaser.GameObjects.Sprite;
  private isInFlightMode: boolean = false;
  private wasOnFlightOnBlock: boolean = false;
  private wasOnFlightOffBlock: boolean = false;
  private wasOnTile309: boolean = false;
  private flightXEffectBlocks: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super("CatnipChaosScene");
  }

  preload() {
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.audio("meow", cdnFile("purrquest/sounds/meow.mp3"));
    this.load.image("collective-item", cdnFile("purrquest/sprites/key.png"));

    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile(`catnip-chaos/levels/level-${this.currentLevel}.json`)
    );
    this.load.image("blocks", cdnFile(CatnipChaosLevelMap[this.currentLevel]));
    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.audio("catnip", cdnFile("catnip-chaos/sounds/catnip.mp3"));
    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));
    this.load.image("platform", cdnFile("purrquest/icons/platform.png"));
    this.load.image(
      "catnip-coin",
      cdnFile("catnip-chaos/items/catnip-coin.png")
    );
    this.load.spritesheet("cloud", cdnFile("catnip-chaos/items/cloud.png"), {
      frameWidth: 72,
      frameHeight: 51,
    });
    this.load.spritesheet(
      "flight-on",
      cdnFile("catnip-chaos/items/flighttrue.png"),
      {
        frameWidth: 16,
        frameHeight: 16,
      }
    );
    this.load.spritesheet(
      "flight-off",
      cdnFile("catnip-chaos/items/flightfalse.png"),
      {
        frameWidth: 16,
        frameHeight: 16,
      }
    );
    this.load.spritesheet("hidden-spike", cdnFile("story/hidden-spike.png"), {
      frameWidth: 31,
      frameHeight: 19,
    });
    this.load.image(
      "floating-platform",
      cdnFile("story/floating-platform.png")
    );
    this.load.spritesheet("jump", cdnFile("jumper/jump.png"), {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.spritesheet("dog", cdnFile("runner/brown.png"), {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.audio("game-end-sound", cdnFile("audio/game/game-end.mp3"));
    this.load.spritesheet("puff", cdnFile("catbassadors/images/puff.png"), {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("food", cdnFile("base/food.png"), {
      frameWidth: 32,
      frameHeight: 32,
      margin: 1,
      spacing: 2,
    });
    this.load.spritesheet("sawHalf", cdnFile("story/half-saw.png"), {
      frameWidth: 38,
      frameHeight: 21,
    });
    this.load.spritesheet("saw", cdnFile("story/saw.png"), {
      frameWidth: 38,
      frameHeight: 38,
    });
    this.load.spritesheet("portal", cdnFile("story/portal.png"), {
      frameWidth: 64,
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
    this.load.image("speedPowerUp", cdnFile("buff/SPEED.png"));
  }

  init(props: ICatnipChaosProps) {
    this.props = props;
    this.currentLevel = this.props.level;
  }

  create(props: { detail?: IPhaserGameSceneProps }) {
    // Ensure cloud is reset at scene start
    if (this.flightCloudSprite) {
      this.flightCloudSprite.destroy();
      this.flightCloudSprite = undefined;
    }
    if (this.geometryDashCloudSprite) {
      this.geometryDashCloudSprite.destroy();
      this.geometryDashCloudSprite = undefined;
    }
    this.initAnimations();
    this.setupTilemap();
    this.setupCamera();
    this.setupSound();
    if (!props.detail?.isRestart) this.setupEventListeners(this.props);

    // Add click event listener for jumping
    this.input.on("pointerdown", () => {
      if (this.cat && !this.cat.isHit) {
        this.cat.isMobileJumping = true;
      }
    });

    this.input.on("pointerup", () => {
      if (this.cat && !this.cat.isHit) {
        this.cat.isMobileJumping = false;
      }
    });

    this.createGameObjects();
    if (props.detail?.cat) {
      this.spawnCat({ detail: { cat: props.detail.cat } });
    }
  }

  createAnimatedSpikes() {}

  private setupTilemap() {
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
    const decorationsLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
    ])!;
    decorationsLayer.setAlpha(0.8);
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;
    this.physicsLayer = this.tilemap.createLayer("physics", [sugarTileset])!;
    this.catnipLayer = this.tilemap.createLayer("catnip", [sugarTileset])!;

    this.jumperLayer?.setCollision(TRAMPOLINE_TILES);

    this.trampoline = new Trampoline(this, this.jumperLayer, TRAMPOLINE_TILES);

    this.groundLayer.setCollisionByExclusion([-1, ...SPIKE_TILES]);
    this.platformsLayer.setCollision(JUMP_LAYER_TILES);
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

    this.createDogsOnTiles(22);

    this.createFloatingPlatforms();

    this.createHiddenSpikes();

    this.physicsLayer.setCollision([162, 192]);
    // Remove tiles 308 and 309 and spawn animated flight blocks
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 308 || tile.index === 309) {
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);
        this.physicsLayer.removeTileAt(tile.x, tile.y);
        const key = tile.index === 308 ? "flight-on" : "flight-off";
        const animKey =
          tile.index === 308 ? "flight-on-anim" : "flight-off-anim";
        const sprite = this.add.sprite(worldX, worldY, key);
        sprite.setDisplaySize(132, 64);
        sprite.play(animKey);
        if (tile.index === 308) {
          this.flightOnBlocks.push(sprite);
        } else {
          this.flightOffBlocks.push(sprite);
        }
      }
    });
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 58) {
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);
        this.physicsLayer.removeTileAt(tile.x, tile.y);

        const effectSprite = this.add.sprite(worldX, worldY, "speedPowerUp");
        effectSprite.setDisplaySize(32, 32);

        this.tweens.add({
          targets: effectSprite,
          angle: 360,
          duration: 1000,
          repeat: -1,
        });

        this.flightXEffectBlocks.push(effectSprite);
      }
    });
  }

  private setupCamera() {
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(isMobile() ? 1.1 : 1.5);
  }

  private setupSound() {
    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.backgroundSound.play();
  }

  private createGameObjects() {
    this.initializeCatnipCoins();
    this.createPortals();

    // Debug: Log all physics layer tiles
    // console.log("Physics Layer Tiles:");
    // this.physicsLayer.forEachTile((tile) => {
    //   console.log(`Tile at (${tile.x}, ${tile.y}): index=${tile.index}`);
    // });

    // Create saws on tiles 26 and 25
    this.catnipLayer.forEachTile((tile) => {
      this.catnipLayer.removeTileAt(tile.x, tile.y);
      if (tile.index === 26) {
        const sawConfig = {
          scene: this,
          groundLayer: this.groundLayer,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          route: "horizontal" as "horizontal" | "vertical",
          speed: 100,
          distance: 300,
        };
        const saw = new Saw(sawConfig);
        this.saws.push(saw);
      } else if (tile.index === 25) {
        const sawConfig = {
          scene: this,
          groundLayer: this.groundLayer,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        };
        const saw = new SawHalf(sawConfig);
        this.saws.push(saw);
      }
    });
  }

  private initializeCatnipCoins() {
    // Find all catnip coin tiles (index 248)
    this.catnipLayer.forEachTile((tile) => {
      if (tile.index === 248) {
        // Get world coordinates of the tile
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();

        // Remove the original tile
        this.catnipLayer.removeTileAt(tile.x, tile.y);

        // Create a rotating sprite at the tile's position
        const rotatingSprite = this.add.sprite(worldX, worldY, "catnip-coin");

        // Add continuous rotation animation
        this.tweens.add({
          targets: rotatingSprite,
          angle: 360,
          duration: 1000,
          repeat: -1,
        });
      }
    });
  }

  private spawnCatnipCoins() {
    if (!this.cat) return;

    const playerX = this.cat.sprite.x;
    const playerY = this.cat.sprite.y;

    this.children.list.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Sprite &&
        child.texture.key === "catnip-coin"
      ) {
        const distance = Phaser.Math.Distance.Between(
          playerX,
          playerY,
          child.x,
          child.y
        );
        if (distance < 32) {
          const coinX = child.x;
          const coinY = child.y;
          child.destroy();

          // Play catnip sound
          const catnipSound = this.sound.add("catnip", { volume: 0.5 });
          catnipSound.play();

          // Create and play puff animation
          const puffSprite = this.add.sprite(coinX, coinY, "puff");
          puffSprite.play("puff");
          puffSprite.on("animationcomplete", () => {
            puffSprite.destroy();
          });

          this.collectedCatnipCoins++;
          GameEvents.GAME_COIN_CAUGHT.push({
            score: this.collectedCatnipCoins,
          });
        }
      }
    });
  }

  private createCat(
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
    this.cat = new Cat(
      this,
      -950,
      -900,
      catName,
      blessing!,
      type,
      true,
      getMultiplier(this.catDto)
    );

    this.cat.sprite.setRotation(0); // Ensure upright on spawn
    this.setupCatCollisions();
    this.cameras.main.startFollow(this.cat.sprite);
    // Also enable auto-run mode for horizontal movement
    this.cat.setAutoRunMode(this.autoRunSpeed, this.autoJumpSpeed);

    this.physics.add.collider(this.cat.sprite, this.jumperLayer);

    this.createHiddenSpikes();

    this.createSpikes();

    this.createGameObjects();

    setMobileControls(this.cat, true);
  }

  private setupCatCollisions() {
    if (!this.cat) return;

    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(this.cat.sprite, this.platformsLayer);
    this.physics.add.collider(this.cat.sprite, this.jumperLayer);

    this.floatingPlatformManagers.forEach((manager) => {
      manager.setupPlayerCollision(this.cat!.sprite);
    });

    // Add collision with dogs
    this.dogs.forEach((dog) => {
      this.physics.add.collider(this.cat!.sprite, dog.sprite, () => {
        this.endGame(false);
      });
    });

    // Add collision with saws
    this.saws.forEach((saw) => {
      this.physics.add.collider(this.cat!.sprite, saw.getSprite(), () => {
        this.endGame(false);
      });
    });

    this.physics.add.overlap(this.cat.sprite, this.physicsLayer, () => {
      if (this.gameEnded) return;

      const tile = this.physicsLayer.getTileAtWorldXY(
        this.cat!.sprite.x,
        this.cat!.sprite.y
      );
      if (tile && (tile.index === 162 || tile.index === 192)) {
        this.cat!.setSitting(true);
        this.spawnFood();

        this.time.delayedCall(2000, () => {
          this.endGame();
        });
      }
      // Handle collision with tile 121
      if (tile && tile.index === 121) {
        this.cat!.setGeometryDashMode(true);
        this.cat!.movement.setGravitySettings({
          baseGravity: 700,
          fallingGravity: 1500,
          reversedBaseGravity: -2000,
          reversedFallingGravity: -3000,
        });
      }
    });
  }

  private processGravityTiles() {
    if (!this.cat) return;

    const playerX = this.cat.sprite.x;
    const playerY = this.cat.sprite.y;

    const tile = this.physicsLayer.getTileAtWorldXY(playerX, playerY);

    if (tile) {
      if (tile.index === 306) {
        this.isGravityReversed = true;
        this.cat.movement.setGravityReversed(true);
      } else if (tile.index === 307) {
        this.isGravityReversed = false;
        this.cat.movement.setGravityReversed(false);
      }
    }
  }

  private createDogsOnTiles(tileIndex: number) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);
        this.physicsLayer.removeTileAt(tile.x, tile.y);

        this.time.delayedCall(1000, () => {
          const dog = new DogBot(this, worldX, worldY, "dog");
          this.dogs.push(dog);

          this.physics.add.collider(dog.sprite, this.groundLayer);
          this.physics.add.collider(dog.sprite, this.platformsLayer);
        });
      }
    });
  }

  private createFloatingPlatforms() {
    this.physicsLayer.forEachTile((tile) => {
      if (FLOATING_PLATFORM_TILES.includes(tile.index)) {
        this.physicsLayer.removeTileAt(tile.x, tile.y);
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);
        const platformManager = new FloatingPlatformManager({
          scene: this,
          groundLayer: this.groundLayer,
          platformsLayer: this.platformsLayer,
          x: worldX - 4,
          y: worldY,
        });
        this.floatingPlatformManagers.push(platformManager);
      }
    });
  }

  private createSpikes() {
    if (!this.cat) return;

    this.spikeManager = new SpikeManager({
      scene: this,
      groundLayer: this.groundLayer!,
      spikeTiles: SPIKE_TILES,
      cat: this.cat!,
      onPlayerHitSpike: () => this.endGame(false),
      gameType: "runner",
    });
  }

  private createHiddenSpikes() {
    if (!this.cat) return;

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 23) {
        this.physicsLayer.removeTileAt(tile.x, tile.y);
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);

        const adjustedY = worldY + 16;

        const spikeConfig: IHiddenSpikeConfig = {
          scene: this,
          texture: "hidden-spike",
          x: worldX,
          y: adjustedY,
          animationKey: "spike-anim",
          cat: this.cat!,
        };

        const spikeManager = new HiddenSpikeManager(this, spikeConfig);
        spikeManager.createSpike(worldX, adjustedY);
        this.hiddenSpikeManagers.push(spikeManager);
      }
    });
  }

  createProgressBar() {
    if (!this.cat) return;

    let endX = 0;
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 162 || tile.index === 192) {
        endX = this.physicsLayer.tileToWorldX(tile.x);
      }
    });

    const startX = -950;
    const playerX = this.cat.sprite.x;
    const totalDistance = endX - startX;
    const currentDistance = playerX - startX;
    const progress = Math.min(
      100,
      Math.max(0, (currentDistance / totalDistance) * 100)
    );

    GameEvents.GAME_PROGRESS_UPDATE.push({ progress });
  }

  update(time: number, delta: number) {
    if (this.cat) {
      this.cat.update();
      this.processGravityTiles();
      this.spawnCatnipCoins();
      this.saws.forEach((saw) => saw.update(delta));
      this.dogs.forEach((dog) => {
        dog.update();
      });
      this.hiddenSpikeManagers.forEach((manager) => {
        manager.update();
      });
      this.createProgressBar();

      // Check for collision with flightXEffectBlocks
      this.flightXEffectBlocks.forEach((effectSprite) => {
        if (
          Phaser.Geom.Intersects.RectangleToRectangle(
            this.cat!.sprite.getBounds(),
            effectSprite.getBounds()
          )
        ) {
          this.collectFlightXEffect(effectSprite);
        }
      });

      const player = this.cat.sprite;
      let onFlightOnBlock = this.flightOnBlocks.some((block) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          player.getBounds(),
          block.getBounds()
        )
      );
      let onFlightOffBlock = this.flightOffBlocks.some((block) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          player.getBounds(),
          block.getBounds()
        )
      );
      let onTile309 = false;
      let onTile121 = false;
      if (this.physicsLayer) {
        const tile = this.physicsLayer.getTileAtWorldXY(
          this.cat.sprite.x,
          this.cat.sprite.y
        );
        onTile309 = !!(tile && tile.index === 309);
        onTile121 = !!(tile && tile.index === 121);
      }

      // Entering flight-on block
      if (onFlightOnBlock && !this.wasOnFlightOnBlock) {
        this.cat.movement.setFlightMode(true);
        this.isInFlightMode = true;

        if (this.cat.animationKeys && this.cat.sprite.anims) {
          this.cat.sprite.anims.play(this.cat.animationKeys["SITTING"], true);
        }

        if (!this.flightCloudSprite) {
          this.flightCloudSprite = this.add.sprite(
            this.cat.sprite.x,
            this.cat.sprite.y,
            "cloud"
          );
          this.flightCloudSprite.setDisplaySize(72, 51);
          this.flightCloudSprite.setDepth(this.cat.sprite.depth - 1);
          this.flightCloudSprite.play("cloud-anim");
        }
      }
      // Entering flight-off block
      if (onFlightOffBlock && !this.wasOnFlightOffBlock) {
        this.cat.movement.setFlightMode(false);
        this.isInFlightMode = false;
        // Remove cloud sprite
        if (this.flightCloudSprite) {
          this.flightCloudSprite.destroy();
          this.flightCloudSprite = undefined;
        }
      }
      // Entering tile 309
      if (onTile309 && !this.wasOnTile309) {
        this.cat.movement.setFlightMode(false);
        this.cat.sprite.setRotation(0); // Reset rotation to normal
        this.isInFlightMode = false;
        // Remove cloud sprite
        if (this.flightCloudSprite) {
          this.flightCloudSprite.destroy();
          this.flightCloudSprite = undefined;
        }
      }

      // Handle cloud for tile 121 (Geometry Dash mode)
      if (onTile121) {
        if (this.cat.animationKeys && this.cat.sprite.anims) {
          this.cat.sprite.anims.play(this.cat.animationKeys["SITTING"], true);
        }
        if (!this.geometryDashCloudSprite) {
          this.geometryDashCloudSprite = this.add.sprite(
            this.cat.sprite.x,
            this.cat.sprite.y,
            "cloud"
          );
          this.geometryDashCloudSprite.setDisplaySize(72, 51);
          this.geometryDashCloudSprite.setDepth(this.cat.sprite.depth - 1);
          this.geometryDashCloudSprite.play("cloud-anim");
        }
      }
      if (!onTile121 && this.geometryDashCloudSprite) {
        if (this.cat.animationKeys && this.cat.sprite.anims) {
          this.cat.sprite.anims.play(this.cat.animationKeys["SITTING"], true);
        }
      }

      // Update previous state trackers
      this.wasOnFlightOnBlock = onFlightOnBlock;
      this.wasOnFlightOffBlock = onFlightOffBlock;
      this.wasOnTile309 = onTile309;

      if (this.flightCloudSprite && this.cat) {
        this.flightCloudSprite.setPosition(
          this.cat.sprite.x + 3,
          this.cat.sprite.y + 10
        );
        if (this.isGravityReversed) {
          this.flightCloudSprite.setPosition(
            this.cat.sprite.x + 3,
            this.cat.sprite.y - 10
          );
        }
        // Set cloud rotation to match player rotation
        this.flightCloudSprite.setRotation(this.cat.sprite.rotation);
        this.flightCloudSprite.setFlipY(this.isGravityReversed);
      }

      if (this.geometryDashCloudSprite && this.cat) {
        this.geometryDashCloudSprite.setPosition(
          this.cat.sprite.x + 3,
          this.cat.sprite.y + 10
        );
        if (this.isGravityReversed) {
          this.geometryDashCloudSprite.setPosition(
            this.cat.sprite.x + 3,
            this.cat.sprite.y - 10
          );
        }
        this.geometryDashCloudSprite.setRotation(this.cat.sprite.rotation);
        this.geometryDashCloudSprite.setFlipY(this.isGravityReversed);
      }

      if (this.flightEffectSprite && this.cat) {
        this.flightEffectSprite.setPosition(
          this.cat.sprite.x,
          this.cat.sprite.y
        );
      }
    }
    this.collectiveItem?.update();
  }

  endGame(finished: boolean = true) {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.backgroundSound?.stop();
    if (this.cat) {
      this.cat.isHit = true;
      // Set player color to red
      this.cat.sprite.setTint(0xff0000);
      // Stop player movement
      this.cat.sprite.setVelocity(0, 0);
      this.cat.sprite.setAcceleration(0, 0);
      // Disable physics
      if (this.cat.sprite.body) {
        this.cat.sprite.body.enable = false;
      }
      this.cat.sprite.setRotation(0); // Reset rotation on end
    }
    // Play hit animation if available
    if (this.cat?.sprite.anims) {
      this.cat.sprite.anims.play("hit", true);
    }
    // Play game end sound
    const gameEndSound = this.sound.add("game-end-sound", {
      volume: 1,
      loop: false,
    });
    gameEndSound.play();
    this.time.delayedCall(250, () => {
      GameEvents.GAME_STOP.push({
        score: this.collectedCatnipCoins,
        time: 0,
        finished,
      });
      this.destroyGameObjects();
    });
  }

  private destroyGameObjects() {
    this.cat?.sprite.destroy();
    this.dogs.forEach((dog) => dog.sprite.destroy());
    this.dogs = [];
    this.floatingPlatformManagers.forEach((manager) => {
      manager.destroy();
    });
    this.floatingPlatformManagers = [];
    this.hiddenSpikeManagers.forEach((manager) => {
      manager.destroy();
    });
    this.hiddenSpikeManagers = [];

    this.spikeManager?.destroySpikes();

    this.resetGameObjects();
  }

  private resetGameObjects() {
    this.cat = undefined;
    this.catDto = undefined;
    this.collectedCatnipCoins = 0;
    this.wasOnFlightOnBlock = false;
    this.wasOnFlightOffBlock = false;
    this.wasOnTile309 = false;
    this.flightOnBlocks = [];
    this.flightOffBlocks = [];
    // Always destroy and reset the cloud sprite
    if (this.flightCloudSprite) {
      this.flightCloudSprite.destroy();
      this.flightCloudSprite = undefined;
    }
    if (this.geometryDashCloudSprite) {
      this.geometryDashCloudSprite.destroy();
      this.geometryDashCloudSprite = undefined;
    }
  }

  setupEventListeners(props: ICatnipChaosProps) {
    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const startGameCallback = (data: ICatEvent<GameEvent.GAME_START>) =>
      this.startGame(data!);
    GameEvents.GAME_START.addEventListener(startGameCallback);

    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
    });

    GameEvents.GAME_LOADED.push({ scene: this });
  }

  initAnimations() {
    this.anims.create({
      key: "jump-anim",
      frames: this.anims.generateFrameNumbers("jump", { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    });

    this.anims.create({
      key: "spike-anim",
      frames: this.anims.generateFrameNumbers("hidden-spike", {
        start: 0,
        end: 12,
      }),
      frameRate: 12,
      repeat: 1,
    });

    this.anims.create({
      key: "puff",
      frames: this.anims.generateFrameNumbers("puff", { start: 0, end: 4 }),
      frameRate: 16,
      repeat: 0,
    });

    this.anims.create({
      key: "sawHalf-anim",
      frames: this.anims.generateFrameNumbers("sawHalf", {
        start: 0,
        end: 7,
      }),
      frameRate: 16,
      repeat: -1,
    });

    this.anims.create({
      key: "saw-anim",
      frames: this.anims.generateFrameNumbers("saw", { start: 0, end: 7 }),
      frameRate: 20,
      repeat: -1,
    });

    this.anims.create({
      key: "portal-anim",
      frames: this.anims.generateFrameNumbers("portal", { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "flight-on-anim",
      frames: this.anims.generateFrameNumbers("flight-on", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "cloud-anim",
      frames: this.anims.generateFrameNumbers("cloud", { start: 0, end: 6 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "flight-off-anim",
      frames: this.anims.generateFrameNumbers("flight-off", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "speed-effect",
      frames: this.anims.generateFrameNumbers("speed-effect", {
        start: 0,
        end: 7,
      }),
      frameRate: 16,
      repeat: -1,
    });
  }

  async spawnCat({
    detail: { cat, isRestart },
  }: ICatEvent<GameEvent.CAT_SPAWN>) {
    const isCatExist = !cat || cat?.name === this.catDto?.name;
    if (isCatExist && !isRestart) return;

    const isCatChanged = this.catDto && this.catDto?.name !== cat?.name;
    if (isCatChanged) {
      this.cat = undefined;
      this.catDto = cat;
      this.scene.restart({ cat, isRestart: true });
      return;
    }

    this.catDto = cat;

    this.load.once("complete", () => {
      this.createCat(cat.name, null, cat.type);
    });

    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.start();
  }

  spawnFood() {
    if (this.food || !this.cat || !this.physics.add) {
      return;
    }

    // Find tile 162 position
    let foodX = 0;
    let foodY = 0;
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 162) {
        foodX = this.physicsLayer.tileToWorldX(tile.x + 1);
        foodY = this.physicsLayer.tileToWorldY(tile.y);
      }
    });

    this.food = new Food(this, foodX, foodY);
    this.physics.add.collider(this.food.sprite, this.groundLayer);

    // Play meow sound
    const meowSound = this.sound.add("meow", { volume: 0.5 });
    meowSound.play();
  }

  private startGame(data: ICatEvent<GameEvent.GAME_START>) {
    if (data.detail.isRestart) {
      this.gameEnded = false;
      this.scene.restart(data);
    }
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
    }
  }

  private createPortals() {
    if (!this.cat) return;

    const portalPairs: {
      entranceX: number;
      entranceY: number;
      exitX: number;
      exitY: number;
    }[] = [];

    // Define all portal pairs
    const portalPairsConfig = [
      { entrance: 59, exit: 60 },
      { entrance: 89, exit: 90 },
      { entrance: 119, exit: 120 },
      { entrance: 149, exit: 150 },
    ];

    // Process each portal pair
    portalPairsConfig.forEach(({ entrance, exit }) => {
      this.physicsLayer.forEachTile((tile) => {
        if (tile.index === entrance) {
          // Enter portal
          const entranceX = this.physicsLayer.tileToWorldX(tile.x);
          const entranceY = this.physicsLayer.tileToWorldY(tile.y);
          this.physicsLayer.removeTileAt(tile.x, tile.y);

          // Find corresponding exit portal
          this.physicsLayer.forEachTile((exitTile) => {
            if (exitTile.index === exit) {
              // Exit portal
              const exitX = this.physicsLayer.tileToWorldX(exitTile.x);
              const exitY = this.physicsLayer.tileToWorldY(exitTile.y);
              this.physicsLayer.removeTileAt(exitTile.x, exitTile.y);

              portalPairs.push({
                entranceX,
                entranceY,
                exitX,
                exitY,
              });
            }
          });
        }
      });
    });

    if (portalPairs.length > 0) {
      this.portalManager = new PortalManager({
        scene: this,
        groundLayer: this.groundLayer,
        cat: this.cat,
        portals: portalPairs,
      });
      this.portalManager.create();
    }
  }

  private collectFlightXEffect(effectSprite: Phaser.GameObjects.Sprite) {
    // Increase the PlayerMovement's flightXSpeed
    if (this.cat && this.cat.movement) {
      this.cat.movement.flightXSpeed += 40;
    }

    // Remove the effect sprite from the scene and the array
    effectSprite.destroy();
    this.flightXEffectBlocks = this.flightXEffectBlocks.filter(
      (sprite) => sprite !== effectSprite
    );

    // (Optional) Play a sound or animation here if you want
  }
}
