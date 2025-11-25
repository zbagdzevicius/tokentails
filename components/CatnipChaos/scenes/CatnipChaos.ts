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

import { CatnipChaosLevelMap } from "@/components/Phaser/map";

import { FloatingPlatformManager } from "@/components/storyMode/Managers/FloatingPlatformManager";

import { SpikeManager } from "@/components/purrquest/managers/SpikeManager";

import { PortalManager } from "@/components/storyMode/Managers/PortalManager";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];
const TRAMPOLINE_TILES = [158, 159, 160, 255, 256];

const FLOATING_PLATFORM_TILES = [9];

const SPIKE_TILES = [253, 254, 284, 283];

export interface ICatnipChaosProps {
  level: string;
  coinImage: string;
  ghostImage: string;
}

export class CatnipChaosScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  catSpirit?: Phaser.GameObjects.Sprite;
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
  private endXCoordinate: number = 0;

  private portalManager?: PortalManager;

  spikeManager!: SpikeManager;

  autoRunSpeed: number = 265;
  autoJumpSpeed: number = 440;
  isAutoRunMode: boolean = true;

  food?: Food | null;

  private isGravityReversed: boolean = false;
  private props!: ICatnipChaosProps;
  private floatingPlatformManagers: FloatingPlatformManager[] = [];
  private collectedCatnipCoins: number = 0;
  private currentLevel: string = "";
  private coinImage: string = "";
  private ghostImage?: string = "";
  private flightOnBlocks: Phaser.GameObjects.Sprite[] = [];
  private flightOffBlocks: Phaser.GameObjects.Sprite[] = [];
  private flightEffectSprite?: Phaser.GameObjects.Sprite;
  private flightCloudSprite?: Phaser.GameObjects.Sprite;
 private ghostCloudSprite?: Phaser.GameObjects.Sprite;
  private geometryDashCloudSprite?: Phaser.GameObjects.Sprite;
  private wasOnFlightOnBlock: boolean = false;
  private wasOnFlightOffBlock: boolean = false;
  private wasOnTile309: boolean = false;
  private flightXEffectBlocks: Phaser.GameObjects.Sprite[] = [];
  private useTileSpikeChecks: boolean = false;
  private catnipCoins: Phaser.GameObjects.Sprite[] = [];
  private jumpingEffectBlocks: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super("CatnipChaosScene");
  }

  preload() {
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.audio("meow", cdnFile("purrquest/sounds/meow.mp3"));
    this.load.image("collective-item", cdnFile("purrquest/sprites/key.png"));
    this.load.spritesheet(
      "jumping-effect",
      cdnFile("catnip-chaos/jumping.png"),
      {
        frameWidth: 50,
        frameHeight: 50,
      }
    );
    

    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile(`catnip-chaos/levels/level-${this.currentLevel}.json`)
    );
    this.load.image("blocks", cdnFile(CatnipChaosLevelMap[this.currentLevel]));
    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.audio("catnip", cdnFile("catnip-chaos/sounds/catnip.mp3"));
    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));
    this.load.image("platform", cdnFile("purrquest/icons/platform.png"));
    //on level 8 load sei coin image on other loads catnip coin
    this.load.image("catnip-coin", cdnFile(this.coinImage));
    // this.load.image(
    //   "catnip-coin",
    //   cdnFile("catnip-chaos/items/catnip-coin.png")
    // );

    this.load.spritesheet("cloud", cdnFile("catnip-chaos/items/cloud.png"), {
      frameWidth: 72,
      frameHeight: 51,
    });
        this.load.spritesheet("splash", cdnFile("catnip-chaos/splash.png"), {
      frameWidth: 72,
      frameHeight: 72,
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
    this.load.image(
      "floating-platform",
      cdnFile("story/floating-platform.png")
    );
    this.load.spritesheet("jump", cdnFile("jumper/jump.png"), {
      frameWidth: 96,
      frameHeight: 96,
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
      this.load.spritesheet("glitch-portal", cdnFile("catnip-chaos/glitch-portal.png"), {
      frameWidth: 32,
      frameHeight: 32,
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
    if (this.props?.ghostImage) {
      this.load.spritesheet("cat-spirit", this.props.ghostImage, {
        frameWidth: 48,
        frameHeight: 48,
      });
    }
  }

  init(props: ICatnipChaosProps) {
    if (props.coinImage) {
      this.props = props;
      this.currentLevel = this.props.level;
      this.coinImage = this.props.coinImage;
      this.ghostImage = this.props.ghostImage;
    }
  }

  create(props: { detail?: IPhaserGameSceneProps }) {
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
    this.time.addEvent({
      delay: 100, // run every second
      callback: () => this.createProgressBar(),
      callbackScope: this,
      loop: true,
    });
  }

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

    this.createFloatingPlatforms();
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 162 || tile.index === 192) {
        this.endXCoordinate = this.physicsLayer.tileToWorldX(tile.x);
      }
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
      if (tile.index === 310) {
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);
        this.physicsLayer.removeTileAt(tile.x, tile.y);

        const effectSprite = this.add.sprite(worldX+16, worldY-4, "jumping-effect");
        effectSprite.setDisplaySize(64, 64);
        effectSprite.play("jumping-effect-anim");

        this.jumpingEffectBlocks.push(effectSprite);
      }
    });
  }

  private setupCamera() {
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(isMobile() ? 1.1 : 1.5);
  }

  private setupSound() {
    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.backgroundSound.play({ volume: 0.5 });
  }

  private createGameObjects() {
    this.initializeCatnipCoins();
    this.createPortals();
    // Create saws on tiles 26 and 25
  }

  private initializeCatnipCoins() {
    // Find all catnip coin tiles (index 248)
    this.catnipLayer.forEachTile((tile) => {
      if (tile.index === 248) {
        // Get world coordinates of the tile
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();

        this.catnipLayer.removeTileAt(tile.x, tile.y);
        const rotatingSprite = this.add.sprite(worldX, worldY, "catnip-coin");
        rotatingSprite.width = 32;
        rotatingSprite.height = 32;
        rotatingSprite.setDisplaySize(32, 32);

        rotatingSprite.setVisible(true);

        // Add continuous rotation animation
        this.tweens.add({
          targets: rotatingSprite,
          angle: 360,
          duration: 1000,
          repeat: -1,
        });

        // Track coin
        this.catnipCoins.push(rotatingSprite);
      }
    });
  }

  private setAllCatnipVisible(visible: boolean) {
    this.catnipCoins.forEach((coin) => coin.setVisible(visible));
  }

  private spawnCatnipCoins() {
    if (!this.cat) return;

    const playerX = this.cat.sprite.x;
    const playerY = this.cat.sprite.y;

    this.catnipCoins.forEach((coin) => {
      if (!coin.visible) return;
      const distance = Phaser.Math.Distance.Between(
        playerX,
        playerY,
        coin.x,
        coin.y
      );
      if (distance < 32) {
        const coinX = coin.x;
        const coinY = coin.y;

        // Hide coin instead of destroying
        coin.setVisible(false);

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

    this.cat.sprite.setRotation(0);
    this.setupCatCollisions();
    this.cameras.main.startFollow(this.cat.sprite);
    this.cat.setAutoRunMode(this.autoRunSpeed, this.autoJumpSpeed);
    
    if (this.ghostImage) {
      if (this.textures.exists("cat-spirit")) {
        this.catSpirit = this.add.sprite(
          this.cat.sprite.x - 96,
          this.cat.sprite.y,
          "cat-spirit"
        );
        this.catSpirit.setAlpha(0.8);
        this.catSpirit.setDepth(this.cat.sprite.depth - 2);
        this.catSpirit.play("cat-spirit-anim");

      
          this.ghostCloudSprite = this.add.sprite(
            this.catSpirit.x,
            this.catSpirit.y,
            "cloud"
          );
          this.ghostCloudSprite.setDisplaySize(72, 51);
          this.ghostCloudSprite.setDepth(this.catSpirit.depth - 1);
          this.ghostCloudSprite.play("cloud-anim");
          this.ghostCloudSprite.setTint(0xff69b4)
        
      }
    }

    this.physics.add.collider(this.cat.sprite, this.jumperLayer);

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

    this.physics.add.overlap(this.cat.sprite, this.physicsLayer, () => {
      if (this.gameEnded) return;

      const tile = this.physicsLayer.getTileAtWorldXY(
        this.cat!.sprite.x,
        this.cat!.sprite.y
      );
      if (tile && (tile.index === 162 || tile.index === 192)) {
        this.cat!.setSitting(true);
        // this.spawnFood();

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

  private processDirectionTiles() {
    if (!this.cat) return;

    const playerX = this.cat.sprite.x;
    const playerY = this.cat.sprite.y;

    const tile = this.physicsLayer.getTileAtWorldXY(playerX, playerY);

    if (tile) {
      if (tile.index === 311) {
        this.cat.setAutoRunMode(-this.autoRunSpeed, this.autoJumpSpeed);
        this.cat.setCurrentRotation(true);
      } else if (tile.index === 312) {
        this.cat.setAutoRunMode(this.autoRunSpeed, this.autoJumpSpeed);
        this.cat.setCurrentRotation(false);
        
      }
    }
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

    if (!this.useTileSpikeChecks) {
      this.spikeManager = new SpikeManager({
        scene: this,
        groundLayer: this.groundLayer!,
        spikeTiles: SPIKE_TILES,
        catSprite: this.cat.sprite!,
        onPlayerHitSpike: () => this.endGame(),
      });
    }
  }

  createProgressBar() {
    if (!this.cat) return;
    const startX = -950;
    const playerX = this.cat.sprite.x;
    const totalDistance = this.endXCoordinate - startX;
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
      this.processDirectionTiles();

      // Lightweight spike collision for very large spike maps
      if (this.useTileSpikeChecks && !this.gameEnded) {
        this.checkSpikeTilesOverlap();
      }

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

      const inJumpingEffectBlock = this.jumpingEffectBlocks.some((block) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          player.getBounds(),
          block.getBounds()
        )
      );

      if (inJumpingEffectBlock) {
        this.cat.movement.setMidAirJump(true);
      } else {
        this.cat.movement.setMidAirJump(false);
      }

      if (onFlightOnBlock && !this.wasOnFlightOnBlock) {
        this.cat.movement.setFlightMode(true);

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

      if (onFlightOffBlock && !this.wasOnFlightOffBlock) {
        this.cat.movement.setFlightMode(false);
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

      // Update spirit cat position if it exists
      if (this.catSpirit && this.cat?.sprite.body) {
        const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
        const direction = body.velocity.x >= 0 ? 1 : -1;
        this.catSpirit.setPosition(
          this.cat.sprite.x - direction * 64,
          this.cat.sprite.y
        );
        // Mirror flip if cat is flipped
        this.catSpirit.setFlipX(this.cat.sprite.flipX);
        // Match rotation for modes like geometry dash / gravity reverse
        this.catSpirit.setRotation(this.cat.sprite.rotation);
        this.catSpirit.setFlipY(this.isGravityReversed);
      }

         if (this.catSpirit && this.ghostCloudSprite) {
      this.ghostCloudSprite.setPosition(
        this.catSpirit.x + 3,
        this.catSpirit.y + 10
      );
      this.ghostCloudSprite.setRotation(this.catSpirit.rotation);
      this.ghostCloudSprite.setFlipY(this.isGravityReversed);
    }
    }
  }

  endGame() {
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
      volume: 0.5,
      loop: false,
    });
    gameEndSound.play();
    this.time.delayedCall(250, () => {
      GameEvents.GAME_STOP.push({
        score: this.collectedCatnipCoins,
        time: 0,
      });
      this.destroyGameObjects();
    });
  }

  private destroyGameObjects() {
    this.cat?.sprite.destroy();
    if (this.catSpirit) {
      this.catSpirit.destroy();
      this.catSpirit = undefined;
    }
    this.floatingPlatformManagers.forEach((manager) => {
      manager.destroy();
    });
    this.floatingPlatformManagers = [];

    this.spikeManager?.destroySpikes();
    this.spikeManager = undefined!;

    this.catnipCoins = [];

    this.resetGameObjects();
  }

  private resetGameObjects() {
    this.cat = undefined;
    this.catDto = undefined;
    this.catSpirit = undefined;
    this.collectedCatnipCoins = 0;
    this.wasOnFlightOnBlock = false;
    this.wasOnFlightOffBlock = false;
    this.wasOnTile309 = false;
    this.flightOnBlocks = [];
    this.flightOffBlocks = [];
    if (this.flightCloudSprite) {
    this.flightCloudSprite.destroy();
    this.flightCloudSprite = undefined;
  }
  if (this.geometryDashCloudSprite) {
    this.geometryDashCloudSprite.destroy();
    this.geometryDashCloudSprite = undefined;
  }
   if (this.ghostCloudSprite) {
    this.ghostCloudSprite.destroy();
    this.ghostCloudSprite = undefined;
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
      key: "jumping-effect-anim",
      frames: this.anims.generateFrameNumbers("jumping-effect", {
        start: 0,
        end: 7,
      }),
      frameRate: 16,
      repeat: -1,
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
      key: "glitch-portal-anim",
      frames: this.anims.generateFrameNumbers("glitch-portal", { start: 0, end: 9 }),
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

    if (this.props?.ghostImage) {
      this.anims.create({
        key: "cat-spirit-anim",
        frames: this.anims.generateFrameNumbers("cat-spirit", {
          start: 120, 
          end: 123,  
        }),
        frameRate: 8,
        repeat: -1,
      });
    }

      this.anims.create({
      key: "splash-anim",
      frames: this.anims.generateFrameNumbers("splash", {
        start: 0,
        end: 3,
      }),
      frameRate: 14,
      repeat: 0,
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
      this.createSpikes();
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
      this.catSpirit = undefined; // Reset ghost so it gets recreated
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
      isGlitch: boolean;
    }[] = [];

    // Define all portal pairs
    const portalPairsConfig = [
      { entrance: 59, exit: 60 },
      { entrance: 89, exit: 90 },
      { entrance: 119, exit: 120 },
      { entrance: 149, exit: 150 },
    ];

portalPairsConfig.forEach(({ entrance, exit }) => {
  this.physicsLayer.forEachTile((tile) => {
    if (tile.index === entrance) {
      const entranceX = this.physicsLayer.tileToWorldX(tile.x);
      const entranceY = this.physicsLayer.tileToWorldY(tile.y);
      this.physicsLayer.removeTileAt(tile.x, tile.y);

      this.physicsLayer.forEachTile((exitTile) => {
        if (exitTile.index === exit) {
          const exitX = this.physicsLayer.tileToWorldX(exitTile.x);
          const exitY = this.physicsLayer.tileToWorldY(exitTile.y);
          this.physicsLayer.removeTileAt(exitTile.x, exitTile.y);

          portalPairs.push({
            entranceX,
            entranceY,
            exitX,
            exitY,
            isGlitch: entrance === 149 && exit === 150,
          });

          if (entrance === 149 && exit === 150) {
            const glitchEntrance = this.add.sprite(entranceX, entranceY, "glitch-portal");
            glitchEntrance.setDisplaySize(64, 64);
            glitchEntrance.play("glitch-portal-anim");

            const glitchExit = this.add.sprite(exitX, exitY, "glitch-portal");
            glitchExit.setDisplaySize(64, 64);
            glitchExit.play("glitch-portal-anim");
          }else{
            const entrancePortal = this.add.sprite(entranceX, entranceY, "portal");
            entrancePortal.setDisplaySize(64, 64);
            entrancePortal.play("portal-anim"); 

            const exitPortal = this.add.sprite(exitX, exitY, "portal");
            exitPortal.setDisplaySize(64, 64);
            exitPortal.play("portal-anim");
        }}
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
        onTeleport: () => this.setAllCatnipVisible(true),
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

  private checkSpikeTilesOverlap() {
    if (!this.cat || !this.groundLayer) return;

    const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    const bounds = body
      ? new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
      : this.cat.sprite.getBounds();

    const tiles = this.groundLayer.getTilesWithinWorldXY(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      { isNotEmpty: true }
    );

    for (let i = 0; i < tiles.length; i++) {
      if (SPIKE_TILES.includes(tiles[i].index)) {
        this.endGame();
        return;
      }
    }
  }
}
