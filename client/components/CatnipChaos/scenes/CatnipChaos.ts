import { preloadTTFonts } from "@/components/Phaser/typography";
import {
  GameEvent,
  GameEvents,
  GameStopOutcome,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { cdnFile } from "@/constants/utils";
import { setCssScroll } from "@/components/Phaser/look/camera";
import { beginWorldLook, preloadWorldLook, type WorldLook } from "@/components/Phaser/look/worldLook";
import { reportAppError } from "@/analytics";
import {
  isSamePlayerCat,
  loadPlayerCatTextures,
} from "@/components/catbassadors/objects/playerCatTexture";
import { CatAbilityType, ICat, Tier } from "@/models/cats";
import { GameType } from "@/models/game";
import { isGameSuspended } from "@/lib/game/gameRegistry";
import {
  createCheckpointTracker,
  isCheckpointSpot,
  spendGuard,
  type PawGuards,
  type SceneSnapshot,
} from "@/components/Phaser/onboarding/checkpoint";
import {
  clockScales,
  clusterTiles,
  createSlowMo,
  firstAhead,
  nextTeach,
  promptFreezeX,
  GUIDED_JUMP_MAX_MS,
  guidedJumpOver,
  shouldFreeze,
  TEACH_SPEED,
  type Mechanic,
  type MechanicKind,
} from "@/components/Phaser/onboarding/first-hazard";
import { ftueStore } from "@/components/Phaser/onboarding/ftue-store";
import {
  firstSpikePrompt,
  JUMP_CONTROL,
  lastInputKind,
  teachLine,
  trackInputKind,
} from "@/components/Phaser/onboarding/hints";
import {
  createRunGate,
  isBeginKey,
  isControlTarget,
  type BeginInput,
  type RunGateMachine,
} from "@/components/Phaser/onboarding/run-gate";
import { Scene } from "phaser";
import { Cat, PlayerAnimation } from "../../catbassadors/objects/Catbassador";
import { Food } from "@/components/base/objects/Food";

import { CatnipChaosLevelMap } from "@/components/Phaser/map";

import { FloatingPlatformManager } from "@/components/Phaser/hazards/FloatingPlatformManager";

import { SpikeManager } from "@/components/Phaser/hazards/SpikeManager";

import { PortalManager } from "@/components/Phaser/hazards/PortalManager";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];
const TRAMPOLINE_TILES = [158, 159, 160, 255, 256];

const FLOATING_PLATFORM_TILES = [9];

const SPIKE_TILES = [253, 254, 284, 283];

/** Per-attempt options the React side decides (cleared state, assists); read at every (re)start. */
export interface PurrsuitRunOptions {
  /** Paw Guards for this attempt; `null` for unlimited (uncleared 1-1). */
  guards: PawGuards;
  /** "Slow-mo on every hazard" assist: every spike run gets the slow-motion teach. */
  teachEveryHazard: boolean;
}

export interface ICatnipChaosProps {
  level: string;
  coinImage: string;
  ghostImage: string;
  getRunOptions?: () => PurrsuitRunOptions;
}

const MODE = GameType.CATNIP_CHAOS;
/** ftue-store hint ids. */
const FIRST_SPIKE_HINT = "first-spike";
const RESPAWN_HINT = "respawn";
const teachHintId = (kind: MechanicKind) => `teach-${kind}`;
/** How far ahead (px) a new mechanic starts its slow-motion teach. */
const TEACH_LEAD = 230;
/** Spike immunity after a Paw Guard respawn, real time. */
const RESPAWN_GRACE_MS = 900;
/** Spike runs within this distance (px) are considered for a checkpoint. */
const CHECKPOINT_SCAN = 260;

/**
 * Why the run is held still:
 * - `gate`: before the first input (frozen spawn: the cat drops to the floor but does not run);
 * - `prompt`: the first-spike "JUMP!" freeze;
 * - `respawn`: after a Paw Guard, until the next input;
 * - `teach`: a freeze-and-prompt teach under reduced motion.
 */
type Hold = "gate" | "prompt" | "respawn" | "teach" | null;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const CATNIP_SPARKLE_KEY = "catnip-pickup-sparkle";

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

export class CatnipChaosScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  catSpirit?: Phaser.GameObjects.Sprite;
  tilemap!: Phaser.Tilemaps.Tilemap;
  /** G7 look runtime (camera and the night look); never read by gameplay. */
  look?: WorldLook;
  private decorationsLayer?: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  groundLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  platformsLayer!:
    | Phaser.Tilemaps.TilemapLayer
    | Phaser.Tilemaps.TilemapGPULayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  physicsLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  catnipLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
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

  // Run lifecycle and first run (plan F6, G10).
  private gate: RunGateMachine = createRunGate();
  private hold: Hold = null;
  private isRestartRun = false;
  private guards: PawGuards = 0;
  private teachEveryHazard = false;
  private checkpoints = createCheckpointTracker<SceneSnapshot>();
  /** Spike runs, sorted by left edge. */
  private spikeRuns: Mechanic[] = [];
  /** Other mechanics on the path (for the slow-motion teach), sorted by left edge. */
  private mechanics: Mechanic[] = [];
  private floatingPlatformXs: number[] = [];
  private portalEntrances: { x: number; y: number }[] = [];
  private firstSpike: Mechanic | null = null;
  private firstSpikeFreezeX = 0;
  private promptArmed = false;
  /** While set, the prompted jump cannot be hurt by spikes until the cat lands past this x. */
  private guidedUntilX: number | null = null;
  /** Scene-clock time at which the prompted jump's protection ends anyway (GUIDED_JUMP_MAX_MS). */
  private guidedUntilMs = 0;
  private promptPointerHeld = false;
  private graceUntil = 0;
  private slowMo = createSlowMo(now);
  private teaching: Mechanic | null = null;
  private teachDone = new Set<Mechanic>();
  private taught = new Set<MechanicKind>();
  private reachedGoal = false;
  private activeHint: string | null = null;

  constructor() {
    super("CatnipChaosScene");
  }

  preload() {
    // Plan F4: the brand faces load before create(), so no Text is drawn with a fallback face.
    preloadTTFonts(this);
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.audio("meow", cdnFile("purrquest/sounds/meow.mp3"));
    this.load.image("collective-item", cdnFile("purrquest/sprites/key.png"));
    this.load.spritesheet(
      "jumping-effect",
      cdnFile("catnip-chaos/jumping.png"),
      {
        frameWidth: 50,
        frameHeight: 50,
      },
    );

    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile(`catnip-chaos/levels/level-${this.currentLevel}.json`),
    );
    this.load.image("blocks", cdnFile(CatnipChaosLevelMap[this.currentLevel]));
    // G7: the look manifest and, in v1, this family's night skin and plates (by name).
    preloadWorldLook(this, { kind: "purrsuit", sheet: CatnipChaosLevelMap[this.currentLevel] });
    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.audio("catnip", cdnFile("catnip-chaos/sounds/catnip.mp3"));
    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));
    this.load.image("platform", cdnFile("purrquest/icons/platform.png"));
    // Level 8 loads the SEI coin from the CDN, every other level the catnip sprig from the app
    // origin; config.tsx passes the full URL.
    this.load.image("catnip-coin", this.coinImage);

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
      },
    );
    this.load.spritesheet(
      "flight-off",
      cdnFile("catnip-chaos/items/flightfalse.png"),
      {
        frameWidth: 16,
        frameHeight: 16,
      },
    );
    this.load.image(
      "floating-platform",
      cdnFile("story/floating-platform.png"),
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
    this.load.spritesheet(
      "glitch-portal",
      cdnFile("catnip-chaos/glitch-portal.png"),
      {
        frameWidth: 32,
        frameHeight: 32,
      },
    );
    this.load.spritesheet(
      "knockback-spell",
      cdnFile("abilities/knockback-spell/FIRE.png"),
      {
        frameWidth: 64,
        frameHeight: 64,
      },
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
    this.resetRunState(!!props.detail?.isRestart);
    this.initAnimations();
    this.setupTilemap();
    this.setupCamera();
    this.setupSound();
    if (!props.detail?.isRestart) this.setupEventListeners(this.props);
    this.armRunInput();

    // Tap or click on the canvas jumps, once the run is going (the first input only begins it).
    this.input.on("pointerdown", () => {
      if (this.cat && !this.cat.isHit && !this.hold) {
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
      // catDto survives a restart; pass isRestart so spawnCat does not bail out.
      this.spawnCat({
        detail: { cat: props.detail.cat, isRestart: !!props.detail.isRestart },
      });
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
    this.look = beginWorldLook(this, { kind: "purrsuit", sheet: CatnipChaosLevelMap[this.currentLevel] });
    // Same indices in v0 and v1: only the texture behind the tileset changes.
    const sugarTileset = this.tilemap.addTilesetImage(
      "blocks",
      this.look.tilesetKey("blocks"),
      32,
      32,
      1,
      2,
    )!;

    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;
    this.platformsLayer = this.tilemap.createLayer("platforms", [
      sugarTileset,
    ])!;
    const decorationsLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
    ])!;
    decorationsLayer.setAlpha(0.8);
    this.decorationsLayer = decorationsLayer;
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;
    this.physicsLayer = this.tilemap.createLayer("physics", [sugarTileset])!;
    this.catnipLayer = this.tilemap.createLayer("catnip", [sugarTileset])!;

    this.jumperLayer?.setCollision(TRAMPOLINE_TILES);

    this.trampoline = new Trampoline(
      this,
      this.jumperLayer as Phaser.Tilemaps.TilemapLayer,
      TRAMPOLINE_TILES,
    );

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
      this,
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

        const effectSprite = this.add.sprite(
          worldX + 16,
          worldY - 4,
          "jumping-effect",
        );
        effectSprite.setDisplaySize(64, 64);
        effectSprite.play("jumping-effect-anim");

        this.jumpingEffectBlocks.push(effectSprite);
      }
    });
  }

  private setupCamera() {
    // G7: integer zoom (platformer 14 x 9 tiles), map bounds, and the night look in v1. Camera
    // only: nothing here feeds the run or its save.
    this.look?.dress({
      layers: [this.groundLayer, this.platformsLayer, this.decorationsLayer, this.jumperLayer, this.physicsLayer],
      tilemapKey: "tilemap",
      groundLayers: ["blocks"],
    });
    setCssScroll(this.cameras.main, this, -650, -1000);
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
        const pickup = this.add.sprite(worldX, worldY, "catnip-coin");
        pickup.setDisplaySize(32, 32);
        pickup.setVisible(true);
        pickup.setData("baseY", worldY);
        this.animateCatnipPickup(pickup, this.catnipCoins.length, worldY);

        // Track coin
        this.catnipCoins.push(pickup);
      }
    });
  }

  /**
   * The pickup's idle motion (plan G8, decision #60): a gentle bob of 2 px and a sway of 8 degrees,
   * on different periods and phases per pickup so a row of sprigs never moves in lockstep. It
   * replaces the constant 360 degree spin. Reduced motion keeps the sprig still.
   */
  private animateCatnipPickup(pickup: Phaser.GameObjects.Sprite, index: number, baseY: number) {
    if (prefersReducedMotion()) return;
    const bobMs = 1100 + ((index * 173) % 500);
    const swayMs = 1600 + ((index * 241) % 700);
    pickup.setAngle(-8 + ((index * 37) % 17));
    this.tweens.add({
      targets: pickup,
      y: { from: baseY - 2, to: baseY + 2 },
      duration: bobMs,
      delay: (index * 97) % bobMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.tweens.add({
      targets: pickup,
      angle: { from: -8, to: 8 },
      duration: swayMs,
      delay: (index * 131) % swayMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  /** A small lavender and mint sparkle where a sprig was picked up (decision #60). */
  private sparkleCatnipPickup(x: number, y: number) {
    if (!this.textures.exists(CATNIP_SPARKLE_KEY)) {
      const g = this.add.graphics().setVisible(false);
      g.fillStyle(0xffffff, 1);
      g.fillPoints(
        [
          new Phaser.Math.Vector2(4, 0),
          new Phaser.Math.Vector2(5, 3),
          new Phaser.Math.Vector2(8, 4),
          new Phaser.Math.Vector2(5, 5),
          new Phaser.Math.Vector2(4, 8),
          new Phaser.Math.Vector2(3, 5),
          new Phaser.Math.Vector2(0, 4),
          new Phaser.Math.Vector2(3, 3),
        ],
        true,
      );
      g.generateTexture(CATNIP_SPARKLE_KEY, 8, 8);
      g.destroy();
    }
    const count = prefersReducedMotion() ? 0 : 7;
    const tints = [0xb896ea, 0xefe2ff, 0x9fdfba];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 14 + Math.random() * 10;
      const spark = this.add
        .image(x, y, CATNIP_SPARKLE_KEY)
        .setTint(tints[i % tints.length])
        .setScale(0.8 + Math.random() * 0.6)
        .setDepth(50);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance - 6,
        alpha: 0,
        scale: 0.2,
        angle: 90,
        duration: 420 + Math.random() * 160,
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private setAllCatnipVisible(visible: boolean) {
    this.catnipCoins.forEach((coin) => coin.setVisible(visible));
  }

  private spawnCatnipCoins() {
    if (!this.cat) return;

    const playerX = this.cat.sprite.x;
    const playerY = this.cat.sprite.y;

    this.catnipCoins.forEach((coin, index) => {
      if (!coin.visible) return;
      const distance = Phaser.Math.Distance.Between(
        playerX,
        playerY,
        coin.x,
        coin.y,
      );
      if (distance < 32) {
        const coinX = coin.x;
        const coinY = coin.y;

        // Hide coin instead of destroying
        coin.setVisible(false);
        // Stop the bob and sway tweens of the hidden pickup; create() re-animates on restart.
        this.tweens.killTweensOf(coin);

        // Play catnip sound
        const catnipSound = this.sound.add("catnip", { volume: 0.5 });
        catnipSound.play();

        this.sparkleCatnipPickup(coinX, coinY);

        // Create and play puff animation
        const puffSprite = this.add.sprite(coinX, coinY, "puff");
        puffSprite.play("puff");
        puffSprite.on("animationcomplete", () => {
          puffSprite.destroy();
        });

        this.collectedCatnipCoins++;
        // Taken after the last checkpoint: a Paw Guard respawn puts it back.
        this.checkpoints.pickup(index);
        GameEvents.GAME_COIN_CAUGHT.push({
          score: this.collectedCatnipCoins,
        });
      }
    });
  }

  private createCat(
    textureKey: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType,
    tier: Tier,
  ) {
    this.cat = new Cat(this, -950, -900, textureKey, blessing!, type, true, tier);

    this.cat.sprite.setRotation(0);
    this.setupCatCollisions();
    this.look?.follow(this.cat.sprite);
    this.look?.attachCat(this.cat.sprite, { player: true });
    this.cat.setAutoRunMode(this.autoRunSpeed, this.autoJumpSpeed);

    if (this.ghostImage) {
      if (this.textures.exists("cat-spirit")) {
        this.catSpirit = this.add.sprite(
          this.cat.sprite.x - 96,
          this.cat.sprite.y,
          "cat-spirit",
        );
        this.catSpirit.setAlpha(0.8);
        this.catSpirit.setDepth(this.cat.sprite.depth - 2);
        this.catSpirit.play("cat-spirit-anim");

        this.ghostCloudSprite = this.add.sprite(
          this.catSpirit.x,
          this.catSpirit.y,
          "cloud",
        );
        this.ghostCloudSprite.setDisplaySize(72, 51);
        this.ghostCloudSprite.setDepth(this.catSpirit.depth - 1);
        this.ghostCloudSprite.play("cloud-anim");
        this.ghostCloudSprite.setTint(0xff69b4);
      }
    }

    this.physics.add.collider(this.cat.sprite, this.jumperLayer as Phaser.Tilemaps.TilemapLayer);

    this.createGameObjects();

    setMobileControls(this.cat, true);
  }

  private setupCatCollisions() {
    if (!this.cat) return;

    this.physics.add.collider(this.cat.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);
    this.physics.add.collider(this.cat.sprite, this.platformsLayer as Phaser.Tilemaps.TilemapLayer);
    this.physics.add.collider(this.cat.sprite, this.jumperLayer as Phaser.Tilemaps.TilemapLayer);

    this.floatingPlatformManagers.forEach((manager) => {
      manager.setupPlayerCollision(this.cat!.sprite);
    });

    this.physics.add.overlap(this.cat.sprite, this.physicsLayer as Phaser.Tilemaps.TilemapLayer, () => {
      if (this.gameEnded) return;

      const tile = this.physicsLayer.getTileAtWorldXY(
        this.cat!.sprite.x,
        this.cat!.sprite.y,
      );
      if (tile && (tile.index === 162 || tile.index === 192) && !this.reachedGoal) {
        // The overlap fires every step on the flag: end the run once.
        this.reachedGoal = true;
        this.endTeach(false);
        this.cat!.setSitting(true);
        // this.spawnFood();

        this.time.delayedCall(2000, () => {
          this.endGame("won");
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

        if (this.cat.movement) {
          this.cat.movement.flightXSpeed = -Math.abs(
            this.cat.movement.flightXSpeed,
          );
        }

        this.cat.sprite.setFlipX(true);
      } else if (tile.index === 312) {
        this.cat.setAutoRunMode(this.autoRunSpeed, this.autoJumpSpeed);
        this.cat.setCurrentRotation(false);

        if (this.cat.movement) {
          this.cat.movement.flightXSpeed = Math.abs(
            this.cat.movement.flightXSpeed,
          );
        }

        this.cat.sprite.setFlipX(false);
      }
    }
  }

  private createFloatingPlatforms() {
    this.physicsLayer.forEachTile((tile) => {
      if (FLOATING_PLATFORM_TILES.includes(tile.index)) {
        this.physicsLayer.removeTileAt(tile.x, tile.y);
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);
        this.floatingPlatformXs.push(worldX - 4);
        const platformManager = new FloatingPlatformManager({
          scene: this,
          groundLayer: this.groundLayer as Phaser.Tilemaps.TilemapLayer,
          platformsLayer: this.platformsLayer as Phaser.Tilemaps.TilemapLayer,
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
        groundLayer: this.groundLayer as Phaser.Tilemaps.TilemapLayer,
        spikeTiles: SPIKE_TILES,
        catSprite: this.cat.sprite!,
        // Both spike paths go through the Paw Guard check (plan G10).
        onPlayerHitSpike: () => this.onHazardHit("spike"),
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
      Math.max(0, (currentDistance / totalDistance) * 100),
    );

    GameEvents.GAME_PROGRESS_UPDATE.push({ progress });
  }

  update(time: number, delta: number) {
    // Frozen for a prompt, a respawn or a reduced-motion teach: nothing moves until the input.
    if (this.hold === "prompt" || this.hold === "respawn" || this.hold === "teach") return;
    if (this.slowMo.expired()) this.endTeach(false);
    if (this.cat) {
      if (this.hold === "gate") {
        // Frozen spawn: the cat lands and waits; it starts running on the first input.
        this.holdCatStill();
      } else {
        this.cat.update();
      }
      this.processGravityTiles();
      this.spawnCatnipCoins();
      this.processDirectionTiles();

      // Lightweight spike collision for very large spike maps
      if (this.useTileSpikeChecks && !this.gameEnded) {
        this.checkSpikeTilesOverlap();
      }

      this.flightXEffectBlocks.forEach((effectSprite, index) => {
        if (
          effectSprite.visible &&
          Phaser.Geom.Intersects.RectangleToRectangle(
            this.cat!.sprite.getBounds(),
            effectSprite.getBounds(),
          )
        ) {
          this.collectFlightXEffect(effectSprite, index);
        }
      });

      const player = this.cat.sprite;
      const onFlightOnBlock = this.flightOnBlocks.some((block) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          player.getBounds(),
          block.getBounds(),
        ),
      );
      const onFlightOffBlock = this.flightOffBlocks.some((block) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          player.getBounds(),
          block.getBounds(),
        ),
      );
      let onTile309 = false;
      let onTile121 = false;
      if (this.physicsLayer) {
        const tile = this.physicsLayer.getTileAtWorldXY(
          this.cat.sprite.x,
          this.cat.sprite.y,
        );
        onTile309 = !!(tile && tile.index === 309);
        onTile121 = !!(tile && tile.index === 121);
      }

      const inJumpingEffectBlock = this.jumpingEffectBlocks.some((block) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          player.getBounds(),
          block.getBounds(),
        ),
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
            "cloud",
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
            "cloud",
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
          this.cat.sprite.y + 10,
        );
        if (this.isGravityReversed) {
          this.flightCloudSprite.setPosition(
            this.cat.sprite.x + 3,
            this.cat.sprite.y - 10,
          );
        }
        // Set cloud rotation to match player rotation
        this.flightCloudSprite.setRotation(this.cat.sprite.rotation);
        this.flightCloudSprite.setFlipY(this.isGravityReversed);
      }

      if (this.geometryDashCloudSprite && this.cat) {
        this.geometryDashCloudSprite.setPosition(
          this.cat.sprite.x + 3,
          this.cat.sprite.y + 10,
        );
        if (this.isGravityReversed) {
          this.geometryDashCloudSprite.setPosition(
            this.cat.sprite.x + 3,
            this.cat.sprite.y - 10,
          );
        }
        this.geometryDashCloudSprite.setRotation(this.cat.sprite.rotation);
        this.geometryDashCloudSprite.setFlipY(this.isGravityReversed);
      }

      if (this.flightEffectSprite && this.cat) {
        this.flightEffectSprite.setPosition(
          this.cat.sprite.x,
          this.cat.sprite.y,
        );
      }

      // Update spirit cat position if it exists
      if (this.catSpirit && this.cat?.sprite.body) {
        const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
        const direction = body.velocity.x >= 0 ? 1 : -1;
        this.catSpirit.setPosition(
          this.cat.sprite.x - direction * 64,
          this.cat.sprite.y,
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
          this.catSpirit.y + 10,
        );
        this.ghostCloudSprite.setRotation(this.catSpirit.rotation);
        this.ghostCloudSprite.setFlipY(this.isGravityReversed);
      }

      if (!this.hold && !this.gameEnded) {
        this.watchGuidedJump();
        this.watchFirstSpike();
        this.watchTeach();
        this.watchCheckpoint();
      }
    }
  }

  endGame(outcome: GameStopOutcome, cause?: string) {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.gate.end();
    this.endTeach(false);
    this.clearHint("skipped");
    this.hold = null;
    this.setClocks(1);
    if (this.physics.world.isPaused) this.physics.world.resume();
    this.restoreKeyCapture();
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
        completedLevel: outcome === "won" ? this.currentLevel : null,
        outcome,
        ...(cause ? { cause } : {}),
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
    // catDto stays (plan G10): PLAY AGAIN restarts with the same cat, and a CAT_SPAWN for the
    // same cat after the run is not mistaken for a new one.
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

    // PLAY AGAIN (plan F6). GAME_START is not listened to any more: it used to restart and
    // teleport the cat on a plain start (known bug, CatnipChaos.ts:1076-1084).
    const restartCallback = (data: ICatEvent<GameEvent.GAME_RESTART>) =>
      this.restartRun(data);
    GameEvents.GAME_RESTART.addEventListener(restartCallback);

    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_RESTART.removeEventListener(restartCallback);
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
      frames: this.anims.generateFrameNumbers("glitch-portal", {
        start: 0,
        end: 9,
      }),
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
    // Compared by id key (F10), not name: two cats called the same are different cats.
    if (!cat) return;
    const isCatExist = isSamePlayerCat(cat, this.catDto);
    if (isCatExist && !isRestart) return;

    const isCatChanged = !!this.catDto && !isCatExist;
    if (isCatChanged) {
      this.cat = undefined;
      this.catDto = cat;
      // create() reads props.detail, so the restart payload must carry that shape.
      this.scene.restart({ detail: { cat, isRestart: true } });
      return;
    }

    this.catDto = cat;

    // spawnCat runs un-awaited from event listeners, so a throw here would skip the
    // GameEvents crash guard as an unhandled rejection; report it instead.
    try {
      const { key, loaded, retirePrevious } = await loadPlayerCatTextures(this, cat);
      if (this.catDto !== cat || !this.sys.isActive()) return;
      if (!loaded) {
        reportAppError("player_texture_missing", new Error("Player cat sheet failed"), {
          source: "manual",
          level: "scene",
          scene: "CatnipChaosScene",
        });
        return;
      }
      this.createCat(key, null, cat.type, cat.tier);
      // The old skin's sprite went with the restart; its texture can go now.
      retirePrevious();
      this.createSpikes();
      this.onCatReady();
    } catch (error) {
      reportAppError("player_spawn_error", error, {
        source: "manual",
        level: "scene",
        scene: "CatnipChaosScene",
      });
    }
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
    this.physics.add.collider(this.food.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);

    // Play meow sound
    const meowSound = this.sound.add("meow", { volume: 0.5 });
    meowSound.play();
  }

  /** GAME_RESTART: the same level again, from a fresh scene (no reload, no teleport). */
  private restartRun(data: ICatEvent<GameEvent.GAME_RESTART>) {
    const cat = data?.detail?.cat ?? this.catDto;
    this.gameEnded = false;
    this.catSpirit = undefined; // Reset ghost so it gets recreated
    this.endTeach(false);
    this.clearHint("skipped");
    this.setClocks(1);
    // create() reads props.detail, so the restart payload carries that shape.
    this.scene.restart({ detail: { cat, isRestart: true } });
  }

  // ---------------------------------------------------------------------------------------------
  // Run lifecycle (plan F6) and first run (plan G10)
  // ---------------------------------------------------------------------------------------------

  /** Fresh per-attempt state; runs at the top of every create(), first start and restarts. */
  private resetRunState(isRestart: boolean) {
    // The previous attempt's sprite went with the scene restart; a new cat is made in createCat.
    this.cat = undefined;
    this.isRestartRun = isRestart;
    this.gate = createRunGate({ isRestart });
    this.hold = "gate";
    const options = this.props?.getRunOptions?.() ?? { guards: 0, teachEveryHazard: false };
    this.guards = options.guards;
    this.teachEveryHazard = options.teachEveryHazard;
    this.checkpoints.reset();
    this.spikeRuns = [];
    this.mechanics = [];
    this.floatingPlatformXs = [];
    this.portalEntrances = [];
    this.firstSpike = null;
    this.promptArmed = !ftueStore.hintDone(MODE, FIRST_SPIKE_HINT);
    this.guidedUntilX = null;
    this.promptPointerHeld = false;
    this.graceUntil = 0;
    this.slowMo.cancel();
    this.teaching = null;
    this.teachDone = new Set();
    this.taught = new Set<MechanicKind>();
    (["trampoline", "gravity", "flight", "geometry", "direction", "midair", "portal", "speed", "platform"] as MechanicKind[]).forEach(
      (kind) => {
        if (ftueStore.hintDone(MODE, teachHintId(kind))) this.taught.add(kind);
      },
    );
    // Spikes are taught by the first-spike prompt; the assist re-teaches every run.
    this.taught.add("spike");
    this.reachedGoal = false;
    this.activeHint = null;
    this.gameEnded = false;
    this.flightXEffectBlocks = [];
    this.catnipCoins = [];
    this.flightOnBlocks = [];
    this.flightOffBlocks = [];
    this.jumpingEffectBlocks = [];
    this.floatingPlatformManagers = [];
    this.setClocks(1);
    trackInputKind();
  }

  /**
   * Window listeners for the run's own inputs: the start, the prompted jump and the respawn. They
   * ignore controls (the gate's Back, the close button, dialogs) and anything while a GameModal
   * suspends the game. Removed on shutdown (restart) and destroy.
   */
  private armRunInput() {
    const onPointer = (event: PointerEvent) => {
      if (isControlTarget(event.target)) return;
      this.onRunInput("pointer");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !isBeginKey(event)) return;
      if (isControlTarget(event.target) && (event.key === " " || event.code === "Space")) return;
      this.onRunInput("key");
    };
    const onRelease = () => {
      this.gate.release();
      if (this.promptPointerHeld && this.cat) {
        this.promptPointerHeld = false;
        this.cat.isMobileJumping = false;
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    window.addEventListener("keyup", onRelease);
    const cleanup = () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("keyup", onRelease);
    };
    this.events.once("shutdown", cleanup);
    this.events.once("destroy", cleanup);
  }

  private onRunInput(kind: BeginInput) {
    if (!this.cat || this.gameEnded || isGameSuspended()) return;
    switch (this.hold) {
      case "gate":
        if (this.gate.phase === "ready" && this.gate.input(kind) === "begin") this.beginRun();
        return;
      case "prompt":
        this.answerPrompt(kind);
        return;
      case "respawn":
        this.resumeAfterRespawn();
        return;
      case "teach":
        this.endTeach(true);
        return;
      default:
        return;
    }
  }

  /** The cat and the level are built: the gate may take the first input (RUN_READY). */
  private onCatReady() {
    this.collectMechanics();
    this.checkpoints.take(this.takeSnapshot());
    if (!this.gate.ready()) return;
    // While the gate is open, Tab and Enter must reach its Back button (plan G10).
    try {
      this.input.keyboard?.disableGlobalCapture();
    } catch {
      // No keyboard plugin.
    }
    GameEvents.RUN_READY.push({
      isRestart: this.isRestartRun,
      mode: MODE,
      level: this.currentLevel,
      guards: this.guards,
    });
  }

  /** The first input: the run starts, and that input is consumed (the cat does not jump on it). */
  private beginRun() {
    if (!this.cat) return;
    this.hold = null;
    this.cat.justJumped = true;
    this.cat.isMobileJumping = false;
    this.restoreKeyCapture();
    GameEvents.RUN_BEGIN.push({ isRestart: this.isRestartRun, mode: MODE, level: this.currentLevel });
  }

  private restoreKeyCapture() {
    if (isGameSuspended()) return;
    try {
      this.input.keyboard?.enableGlobalCapture();
    } catch {
      // No keyboard plugin.
    }
  }

  /** Frozen spawn: the cat can drop to the floor but neither runs nor jumps. */
  private holdCatStill() {
    if (!this.cat?.sprite.body) return;
    this.cat.sprite.setVelocityX(0);
    this.cat.sprite.setAccelerationX(0);
    const idle = this.cat.animationKeys?.[PlayerAnimation.IDLE];
    if (idle && this.anims.exists(idle)) this.cat.sprite.anims.play(idle, true);
  }

  private isGrounded(): boolean {
    const body = this.cat?.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return false;
    return this.isGravityReversed ? body.blocked.up : body.blocked.down;
  }

  /** Spike runs and teachable mechanics on this level, in world pixels. */
  private collectMechanics() {
    const tileSize = 32;
    const toTiles = (worldX: number, worldY: number) => ({ x: Math.round(worldX / tileSize), y: Math.round(worldY / tileSize) });
    const spikeTiles = this.groundLayer
      .filterTiles((tile: Phaser.Tilemaps.Tile) => SPIKE_TILES.includes(tile.index))
      .map((tile) => toTiles(this.groundLayer.tileToWorldX(tile.x), this.groundLayer.tileToWorldY(tile.y)));
    this.spikeRuns = clusterTiles(spikeTiles, tileSize, "spike");

    const items: Mechanic[] = [];
    const at = (kind: MechanicKind, x: number, y: number, width = tileSize) => items.push({ kind, x0: x, x1: x + width, y });
    this.physicsLayer.forEachTile((tile) => {
      const x = this.physicsLayer.tileToWorldX(tile.x);
      const y = this.physicsLayer.tileToWorldY(tile.y);
      if (tile.index === 306) at("gravity", x, y);
      else if (tile.index === 121) at("geometry", x, y);
      else if (tile.index === 311) at("direction", x, y);
    });
    this.jumperLayer?.forEachTile((tile) => {
      if (TRAMPOLINE_TILES.includes(tile.index)) {
        at("trampoline", this.jumperLayer.tileToWorldX(tile.x), this.jumperLayer.tileToWorldY(tile.y));
      }
    });
    this.flightOnBlocks.forEach((sprite) => at("flight", sprite.x - 16, sprite.y));
    this.jumpingEffectBlocks.forEach((sprite) => at("midair", sprite.x - 16, sprite.y));
    this.flightXEffectBlocks.forEach((sprite) => at("speed", sprite.x - 16, sprite.y));
    this.portalEntrances.forEach((portal) => at("portal", portal.x, portal.y));
    this.floatingPlatformXs.forEach((x) => at("platform", x, 0));
    // One teach per kind: keep the first of each, in path order.
    this.mechanics = items.sort((a, b) => a.x0 - b.x0);

    const spawnX = this.cat?.sprite.x ?? -Infinity;
    this.firstSpike = firstAhead(this.spikeRuns, spawnX, "spike");
    this.firstSpikeFreezeX = this.firstSpike ? promptFreezeX(this.firstSpike) : 0;
    if (!this.firstSpike) this.promptArmed = false;
  }

  /** Spike runs overlapping [from, to], from the sorted list. */
  private spikesNear(from: number, to: number): Mechanic[] {
    const runs = this.spikeRuns;
    let lo = 0;
    let hi = runs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (runs[mid].x1 < from) lo = mid + 1;
      else hi = mid;
    }
    const out: Mechanic[] = [];
    for (let i = Math.max(0, lo - 8); i < runs.length && runs[i].x0 <= to; i++) {
      if (runs[i].x1 >= from) out.push(runs[i]);
    }
    return out;
  }

  /** First visit: freeze at a fixed spot before the first spike run with "JUMP!" (G10). */
  private watchFirstSpike() {
    if (!this.promptArmed || !this.firstSpike || !this.cat || this.guidedUntilX !== null) return;
    if (this.cat.currentRotation) return;
    const x = this.cat.sprite.x;
    if (x >= this.firstSpike.x0 - 4) {
      // Already past the freeze point in the air (an early jump): no prompt this time.
      this.promptArmed = false;
      return;
    }
    if (!shouldFreeze({ armed: true, catX: x, freezeX: this.firstSpikeFreezeX, grounded: this.isGrounded(), hazardX0: this.firstSpike.x0 })) {
      return;
    }
    const body = this.cat.sprite.body as Phaser.Physics.Arcade.Body;
    // Only for a run on the cat's own floor (ceiling spikes are not a "jump" lesson).
    if (Math.abs(this.firstSpike.y + 32 - body.bottom) > 40) {
      this.promptArmed = false;
      return;
    }
    // Snap to the exact freeze x, so the answer jump takes off from the same spot at any frame rate.
    body.reset(this.firstSpikeFreezeX, this.cat.sprite.y);
    body.blocked.none = false;
    if (this.isGravityReversed) body.blocked.up = true;
    else body.blocked.down = true;
    this.physics.world.pause();
    this.cat.sprite.anims.pause();
    this.hold = "prompt";
    this.promptArmed = false;
    const prompt = firstSpikePrompt(lastInputKind());
    this.showHint(FIRST_SPIKE_HINT, `${prompt.title}\n${prompt.line}`, "prompt");
  }

  /** The prompted jump: the world resumes and the cat jumps from the freeze spot. */
  private answerPrompt(kind: BeginInput) {
    if (!this.cat || !this.firstSpike) return;
    this.hold = null;
    this.physics.world.resume();
    this.cat.sprite.anims.resume();
    this.cat.justJumped = false;
    if (kind === "pointer") {
      this.cat.isMobileJumping = true;
      this.promptPointerHeld = true;
    }
    this.guidedUntilX = this.firstSpike.x1 + 24;
    this.guidedUntilMs = this.time.now + GUIDED_JUMP_MAX_MS;
    ftueStore.markHintDone(MODE, FIRST_SPIKE_HINT);
    this.clearHint("done");
  }

  /**
   * The prompted jump is safe until the cat is past the spike run, grounded or not, or until
   * GUIDED_JUMP_MAX_MS on the scene clock. The jump itself clears the 1-1 run without this
   * (`jumpClears` from `promptFreezeX`, tested); the guard only covers longer first runs.
   */
  private watchGuidedJump() {
    if (this.guidedUntilX === null || !this.cat) return;
    if (
      guidedJumpOver({ catX: this.cat.sprite.x, untilX: this.guidedUntilX, nowMs: this.time.now, untilMs: this.guidedUntilMs })
    ) {
      this.guidedUntilX = null;
    }
  }

  /** A slow-motion teach for the first of each new mechanic (or every spike run with the assist). */
  private watchTeach() {
    if (!this.cat || this.teaching || this.guidedUntilX !== null || this.cat.currentRotation) return;
    const list = this.teachEveryHazard ? [...this.mechanics, ...this.spikeRuns] : this.mechanics;
    const next = nextTeach({
      mechanics: list,
      catX: this.cat.sprite.x,
      lead: TEACH_LEAD,
      taught: this.taught,
      done: this.teachDone,
      everyHazard: this.teachEveryHazard,
    });
    if (next) this.startTeach(next);
  }

  private startTeach(mechanic: Mechanic) {
    this.teaching = mechanic;
    this.teachDone.add(mechanic);
    const input = lastInputKind();
    const line = teachLine(mechanic.kind, input);
    if (prefersReducedMotion()) {
      // Reduced motion: freeze and prompt instead of slow motion.
      this.physics.world.pause();
      this.cat?.sprite.anims.pause();
      this.hold = "teach";
      this.showHint(teachHintId(mechanic.kind), `${line} ${JUMP_CONTROL[input]} to go on.`, "teach");
      return;
    }
    this.setClocks(TEACH_SPEED);
    this.slowMo.start();
    this.showHint(teachHintId(mechanic.kind), line, "teach");
  }

  /** Ends a teach: real time again, the kind marked as taught. */
  private endTeach(answered: boolean) {
    const mechanic = this.teaching;
    if (!mechanic) return;
    this.teaching = null;
    this.slowMo.cancel();
    this.setClocks(1);
    if (this.hold === "teach") {
      this.hold = null;
      this.physics.world.resume();
      this.cat?.sprite.anims.resume();
      if (answered && this.cat) this.cat.justJumped = true;
    }
    if (mechanic.kind !== "spike") {
      this.taught.add(mechanic.kind);
      ftueStore.markHintDone(MODE, teachHintId(mechanic.kind));
    }
    this.clearHint("done");
  }

  /** All four clocks at `speed` (1 is real time): timers, tweens, animations and physics. */
  private setClocks(speed: number) {
    const scales = clockScales(speed);
    if (this.time) this.time.timeScale = scales.time;
    if (this.tweens) this.tweens.timeScale = scales.tweens;
    if (this.anims) this.anims.globalTimeScale = scales.anims;
    const world = this.physics?.world;
    if (world) world.timeScale = scales.physics;
  }

  private showHint(hint: string, text: string, kind: "prompt" | "teach") {
    this.activeHint = hint;
    GameEvents.RUN_HINT.push({ hint, text, kind, mode: MODE, level: this.currentLevel });
  }

  private clearHint(result: "done" | "skipped") {
    if (!this.activeHint) return;
    const hint = this.activeHint;
    this.activeHint = null;
    GameEvents.RUN_HINT_DONE.push({ hint, result });
  }

  /** Takes a checkpoint at a safe, grounded spot (G10). */
  private watchCheckpoint() {
    if (!this.cat || this.guidedUntilX !== null || this.reachedGoal) return;
    if (now() < this.graceUntil) return;
    const movement = this.cat.movement.snapshot();
    const facingLeft = this.cat.currentRotation;
    const x = this.cat.sprite.x;
    const near = this.spikesNear(x - CHECKPOINT_SCAN, x + CHECKPOINT_SCAN);
    // Running left after a direction tile: mirror, so "ahead" is still positive.
    const mirror = facingLeft ? -1 : 1;
    const hazards = near.map((run) => (facingLeft ? { x0: -run.x1, x1: -run.x0 } : { x0: run.x0, x1: run.x1 }));
    const lastX = this.checkpoints.x;
    const spot = isCheckpointSpot(
      { x: x * mirror, grounded: this.isGrounded(), stable: !movement.flight, hazards },
      lastX === null ? null : lastX * mirror,
    );
    if (spot) this.checkpoints.take(this.takeSnapshot());
  }

  private takeSnapshot(): SceneSnapshot {
    const cat = this.cat!;
    const pickupsTaken: number[] = [];
    this.catnipCoins.forEach((coin, index) => {
      if (!coin.visible) pickupsTaken.push(index);
    });
    const powerUpsTaken: number[] = [];
    this.flightXEffectBlocks.forEach((sprite, index) => {
      if (!sprite.visible) powerUpsTaken.push(index);
    });
    return {
      player: {
        x: cat.sprite.x,
        y: cat.sprite.y,
        flipX: cat.sprite.flipX,
        flipY: cat.sprite.flipY,
        rotation: cat.sprite.rotation,
        facingLeft: cat.currentRotation,
        walkSpeed: cat.walkSpeed,
        jumpSpeed: cat.jumpSpeed,
        movement: cat.movement.snapshot(),
      },
      collected: this.collectedCatnipCoins,
      pickupsTaken,
      powerUpsTaken,
      flags: {
        gravityReversed: this.isGravityReversed,
        wasOnFlightOnBlock: this.wasOnFlightOnBlock,
        wasOnFlightOffBlock: this.wasOnFlightOffBlock,
        wasOnTile309: this.wasOnTile309,
        flightCloud: !!this.flightCloudSprite,
        geometryCloud: !!this.geometryDashCloudSprite,
      },
    };
  }

  /** Every spike path lands here: a Paw Guard respawn, or the end of the run. */
  private onHazardHit(cause: string) {
    if (this.gameEnded || this.hold || this.reachedGoal || !this.cat) return;
    if (this.guidedUntilX !== null || now() < this.graceUntil) return;
    const left = spendGuard(this.guards);
    if (left === false) {
      this.endGame("died", cause);
      return;
    }
    this.guards = left;
    this.softDeath(cause);
  }

  /** Paw Guard (decision #66): back to the checkpoint, frozen until the next input. */
  private softDeath(cause: string) {
    const cat = this.cat!;
    this.endTeach(false);
    const hitX = cat.sprite.x;
    const hitY = cat.sprite.y;
    const respawn = this.checkpoints.respawn();
    GameEvents.LIFE_LOST.push({ guardsLeft: this.guards, cause, mode: MODE, level: this.currentLevel });
    if (this.anims.exists("puff")) {
      const puff = this.add.sprite(hitX, hitY, "puff");
      puff.play("puff");
      puff.on("animationcomplete", () => puff.destroy());
    }
    if (respawn) this.restoreSnapshot(respawn.snapshot, respawn.respawnPickups, respawn.respawnPowerUps);
    // The checkpoint stays valid for the next slip.
    this.checkpoints.take(this.takeSnapshot());
    this.physics.world.pause();
    const idle = cat.animationKeys?.[PlayerAnimation.IDLE];
    if (idle && this.anims.exists(idle)) cat.sprite.anims.play(idle, true);
    this.hold = "respawn";
    const left = this.guards === null ? "" : this.guards === 1 ? " (1 left)" : ` (${this.guards} left)`;
    this.showHint(RESPAWN_HINT, `PAW GUARD!\n${JUMP_CONTROL[lastInputKind()]} to keep running${left}`, "prompt");
  }

  private resumeAfterRespawn() {
    if (!this.cat) return;
    this.hold = null;
    this.physics.world.resume();
    this.cat.justJumped = true;
    this.graceUntil = now() + RESPAWN_GRACE_MS;
    this.clearHint("done");
    if (!prefersReducedMotion()) {
      this.tweens.add({ targets: this.cat.sprite, alpha: { from: 0.35, to: 1 }, duration: 150, repeat: 2, yoyo: false });
    }
  }

  private restoreSnapshot(snapshot: SceneSnapshot, respawnPickups: number[], respawnPowerUps: number[]) {
    const cat = this.cat!;
    const player = snapshot.player;
    const body = cat.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.reset(player.x, player.y);
    else cat.sprite.setPosition(player.x, player.y);
    cat.sprite.clearTint();
    cat.sprite.setAlpha(1);
    cat.sprite.setFlipX(player.flipX);
    cat.sprite.setRotation(player.rotation);
    cat.currentRotation = player.facingLeft;
    cat.walkSpeed = player.walkSpeed;
    cat.jumpSpeed = player.jumpSpeed;
    cat.isSitting = false;
    cat.isHit = false;
    cat.isMobileJumping = false;
    cat.movement.restore(player.movement);
    cat.sprite.setFlipY(player.flipY);

    this.isGravityReversed = !!snapshot.flags.gravityReversed;
    this.wasOnFlightOnBlock = !!snapshot.flags.wasOnFlightOnBlock;
    this.wasOnFlightOffBlock = !!snapshot.flags.wasOnFlightOffBlock;
    this.wasOnTile309 = !!snapshot.flags.wasOnTile309;
    if (!snapshot.flags.flightCloud && this.flightCloudSprite) {
      this.flightCloudSprite.destroy();
      this.flightCloudSprite = undefined;
    } else if (snapshot.flags.flightCloud && !this.flightCloudSprite) {
      this.flightCloudSprite = this.add.sprite(player.x, player.y, "cloud");
      this.flightCloudSprite.setDisplaySize(72, 51);
      this.flightCloudSprite.setDepth(cat.sprite.depth - 1);
      this.flightCloudSprite.play("cloud-anim");
    }
    if (!snapshot.flags.geometryCloud && this.geometryDashCloudSprite) {
      this.geometryDashCloudSprite.destroy();
      this.geometryDashCloudSprite = undefined;
    }

    // Catnip after the checkpoint respawns, and the score goes back to the checkpoint's.
    respawnPickups.forEach((index) => {
      const coin = this.catnipCoins[index];
      if (!coin) return;
      const baseY = (coin.getData("baseY") as number | undefined) ?? coin.y;
      this.tweens.killTweensOf(coin);
      coin.setY(baseY);
      coin.setVisible(true);
      this.animateCatnipPickup(coin, index, baseY);
    });
    respawnPowerUps.forEach((index) => this.flightXEffectBlocks[index]?.setVisible(true));
    this.collectedCatnipCoins = snapshot.collected;
    GameEvents.GAME_COIN_CAUGHT.push({ score: this.collectedCatnipCoins });
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

              this.portalEntrances.push({ x: entranceX, y: entranceY });
              portalPairs.push({
                entranceX,
                entranceY,
                exitX,
                exitY,
                isGlitch: entrance === 149 && exit === 150,
              });

              if (entrance === 149 && exit === 150) {
                const glitchEntrance = this.add.sprite(
                  entranceX,
                  entranceY,
                  "glitch-portal",
                );
                glitchEntrance.setDisplaySize(64, 64);
                glitchEntrance.play("glitch-portal-anim");

                const glitchExit = this.add.sprite(
                  exitX,
                  exitY,
                  "glitch-portal",
                );
                glitchExit.setDisplaySize(64, 64);
                glitchExit.play("glitch-portal-anim");
              } else {
                const entrancePortal = this.add.sprite(
                  entranceX,
                  entranceY,
                  "portal",
                );
                entrancePortal.setDisplaySize(64, 64);
                entrancePortal.play("portal-anim");

                const exitPortal = this.add.sprite(exitX, exitY, "portal");
                exitPortal.setDisplaySize(64, 64);
                exitPortal.play("portal-anim");
              }
            }
          });
        }
      });
    });

    if (portalPairs.length > 0) {
      this.portalManager = new PortalManager({
        scene: this,
        groundLayer: this.groundLayer as Phaser.Tilemaps.TilemapLayer,
        cat: this.cat,
        portals: portalPairs,
        onTeleport: () => this.setAllCatnipVisible(true),
      });
      this.portalManager.create();
    }
  }

  private collectFlightXEffect(effectSprite: Phaser.GameObjects.Sprite, index: number) {
    // Increase the PlayerMovement's flightXSpeed
    if (this.cat && this.cat.movement) {
      this.cat.movement.flightXSpeed += 40;
    }

    // Hidden, not destroyed: a Paw Guard respawn from before it puts it back (the checkpoint
    // also restores flightXSpeed).
    effectSprite.setVisible(false);
    this.checkpoints.powerUp(index);
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
      { isNotEmpty: true },
    );

    for (let i = 0; i < tiles.length; i++) {
      if (SPIKE_TILES.includes(tiles[i].index)) {
        this.onHazardHit("spike");
        return;
      }
    }
  }
}
