import {
  GameEvent,
  GameEvents,
  ICatEvent,
  ICatEventsDetails,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { SpikeManager } from "@/components/Phaser/hazards/SpikeManager";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { cdnFile } from "@/constants/utils";
import { setCssScroll } from "@/components/Phaser/look/camera";
import { beginWorldLook, preloadWorldLook, type WorldLook } from "@/components/Phaser/look/worldLook";
import { cssViewSize } from "@/components/Phaser/look/registry";
import { LOOK_RESIZE } from "@/components/Phaser/look/makeGameConfig";
import {
  cameraCssZoom,
  preloadTTFonts,
  scaleTo,
  ttWorldText,
} from "@/components/Phaser/typography";
import { reportAppError } from "@/analytics";
import { NIGHT } from "@/design/tokens";
import {
  isSamePlayerCat,
  loadPlayerCatTextures,
} from "@/components/catbassadors/objects/playerCatTexture";
import { CatAbilityType, ICat, Tier } from "@/models/cats";
import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { catWalkSpeed, GameType } from "@/models/game";
import { BasePixelEnemy } from "../objects/BasePixelEnemy";
import { Runner } from "../objects/Runner";
import { Blocker } from "../objects/Blocker";
import { BLOCKER_TEXTURE_KEY, RUNNER_TEXTURE_KEY } from "../config/EnemyConfig";
import { CatCrate } from "../objects/CatCrate";
import { RescuedCat } from "../objects/RescuedCat";
import { Saw } from "@/components/Phaser/hazards/SawManager";
import { RotatingMorgensternTrapManager } from "@/components/Phaser/hazards/RotatingMorgensternManager";
import { ForestAtmosphere } from "../effects/ForestAtmosphere";
import { TutorialManager } from "../managers/TutorialManager";
import { PixelRescueLevelMap } from "../../Phaser/map";
import {
  CUPID_FTUE_EVENT,
  CupidHintId,
  CupidStopReason,
  ICupidFtueSnapshot,
  RunClock,
  ShieldState,
  outcomeFor,
  prefersReducedMotion,
  tutorialDecision,
} from "../ftue";
import { cupidFtue } from "../ftueStorage";
import {
  createRunGate,
  isBeginKey,
  isControlTarget,
  isExitKey,
  type RunGateMachine,
} from "@/components/Phaser/onboarding/run-gate";
import { cupidHintCopy } from "../hints";

const JUMP_LAYER_TILES = [
  169, 170, 139, 140, 200, 224, 225, 226, 227, 51, 52, 82, 83, 84,
];
const TRAMPOLINE_TILES = [158, 159];

const SPIKE_TILES = [253, 254, 284, 283];

export interface IPixelRescueProps {
  level: string;
  /** Arm the starter shield at spawn (uncleared levels 1-2, plan G10). */
  starterShield?: boolean;
  /** Play the tutorial even though this player has seen it ("Replay tutorial"). */
  replayTutorial?: boolean;
  /**
   * Keep a win as a device-local clear. Only when the save cannot reach the server (no profile, or
   * a transient guest): a signed-in clear waits for the server's `seasonEventCleared`, so a failed
   * save never unlocks the next day or drops the shield on this device.
   */
  recordLocalClears?: boolean;
}

/** What a scene restart (`GAME_START {isRestart}`) hands to `init` and `create`. */
interface IRestartData {
  detail?: IPhaserGameSceneProps;
}




/** World px between the cat's centre and the bottom of a hint plate that follows it. */
const CAT_HINT_LIFT = 34;

/** How long a first-seen hint plate stays up. */
const HINT_VISIBLE_MS = 3200;

/** Cupid is not an auto-runner: walking off also begins the run. */
const CUPID_MOVE_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"];

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return false;
  return !!element.closest("input, textarea, select, [contenteditable='true']");
};

export class PixelRescueScene extends Scene {
  public isPlayerCarryingCat: boolean = false;
  private props!: IPixelRescueProps;
  private currentLevel: string = "";
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  physicsLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  backgroundSound?: Phaser.Sound.BaseSound;
  trampoline?: Trampoline;
  blessing?: Phaser.GameObjects.Sprite;
  private decorationLayer!: Phaser.Tilemaps.TilemapLayer;
  /** G7 look runtime (camera and the night look); never read by gameplay. */
  look?: WorldLook;
  private heartLayer!: Phaser.Tilemaps.TilemapLayer;
  private heartCoins: Phaser.Physics.Arcade.Sprite[] = [];
  private totalheartCoins: number = 0;
  private collectedheartCoins: number = 0;
  private shields: Phaser.Physics.Arcade.Sprite[] = [];
  private shield = new ShieldState();
  private shieldSprite?: Phaser.GameObjects.Sprite;

  private listEnemies: BasePixelEnemy[] = [];
  private enemiesGroup!: Phaser.Physics.Arcade.Group;

  private saws: Saw[] = [];
  private morgensterns: RotatingMorgensternTrapManager[] = [];

  spikeManager!: SpikeManager;

  private catCrate?: CatCrate;
  private rescuedCat?: RescuedCat;
  public catsRescued: number = 0;
  private readonly MAX_CATS_TO_RESCUE = 1;
  private speedSlowdownMultiplier: number = 1;

  private catsToRescue: string[] = [
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/WALLACE/base.png",
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/santa.png",
  ];
  private spawnedCatIndices: number[] = [];
  private cratesGroup!: Phaser.Physics.Arcade.Group;

  private exitPortalSprite?: Phaser.GameObjects.Sprite;
  private exitPortalX: number = 0;
  private exitPortalY: number = 0;
  private isExitPortalOpen: boolean = false;
  private gameEnded: boolean = false;
  private isBeingSuckedIntoPortal: boolean = false;
  private lastThrowBackTime: number = 0;

  private forestAtmosphere?: ForestAtmosphere;
  private tutorialManager?: TutorialManager;
  private lastCrateNotificationTime: number = 0;
  private lastPortalNotificationTime: number = 0;
  private readonly NOTIFICATION_COOLDOWN = 2000;
  /** One clock per run (made in `create`); it counts only after RUN_BEGIN. */
  private clock = new RunClock();
  private timerEvent?: Phaser.Time.TimerEvent;
  /** Levels whose tutorial played in this page session: a retry never replays it. */
  private static tutorialPlayedThisSession = new Set<string>();
  /** Levels won in this page session: PLAY AGAIN after a win runs without the starter shield. */
  private static clearedThisSession = new Set<string>();
  private hintsShown: CupidHintId[] = [];
  private runReady = false;
  private firstInputArmed = false;
  private runGate: RunGateMachine = createRunGate();
  private isRestartRun = false;
  private restartPending = false;
  /** The last player cat, kept across `resetGameObjects` so a restart can respawn it. */
  private lastCat?: ICat;
  private hintText?: Phaser.GameObjects.Text;
  private gameUpdateCallback?: (data: ICatEvent<GameEvent.GAME_UPDATE>) => void;
  private isNotificationPaused: boolean = false;
  constructor() {
    super("PixelRescueScene");
  }

  preload() {
    // Plan F4: no scene text before the brand faces load. (The unlicensed CDN pixel face that
    // used to load further down is gone: decision #80, the tutorial uses the `hint` role.)
    preloadTTFonts(this);
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile(`pixel-rescue/levels/level-${this.currentLevel}.json`)
    );
    this.load.image(
      "valentine",
      cdnFile(PixelRescueLevelMap[this.currentLevel])
    );
    // G7: the look manifest and, in v1, the valentine night skin and plates (by name).
    preloadWorldLook(this, { kind: "cupid", sheet: PixelRescueLevelMap[this.currentLevel] });
    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.audio("jump-sound", cdnFile("audio/game/jump.mp3"));
    this.load.audio("catnip", cdnFile("catnip-chaos/sounds/catnip.mp3"));
    this.load.audio("dash-sound", cdnFile("audio/game/dash.wav"));
    this.load.audio("charge-sound", cdnFile("pixel-rescue/sounds/charge.wav"));

    this.load.audio("pickup", cdnFile("pixel-rescue/sounds/pickup.wav"));
    this.load.audio("open", cdnFile("pixel-rescue/sounds/open.wav"));
    this.load.audio(
      "protection",
      cdnFile("pixel-rescue/sounds/protection.wav")
    );

    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));

    this.load.spritesheet(
      "exit-portal",
      cdnFile("pixel-rescue/items/exit-portal.webp"),
      {
        frameWidth: 90,
        frameHeight: 91,
      }
    );
    this.load.spritesheet("jump-wall", cdnFile("game/effects/jump.png"), {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("hearts", cdnFile("pixel-rescue/items/hearts.webp"), {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.image("crate", cdnFile("pixel-rescue/items/rusty-crate.webp"));
    this.load.spritesheet(
      "knockback-spell",
      cdnFile("abilities/knockback-spell/FIRE.png"),
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );

    this.load.spritesheet("cloud", cdnFile("catnip-chaos/items/cloud.png"), {
      frameWidth: 72,
      frameHeight: 51,
    });

    this.load.spritesheet("puff", cdnFile("catbassadors/images/puff.png"), {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.catsToRescue.forEach((catImageUrl, index) => {
      this.load.spritesheet(`rescued-cat-${index}`, catImageUrl, {
        frameWidth: 48,
        frameHeight: 48,
      });
    });

    this.load.spritesheet(
      "enemy-blocker",
      cdnFile("pixel-rescue/enemies/blocker.webp"),
      {
        frameWidth: 96,
        frameHeight: 96,
      }
    );
    this.load.spritesheet(
      "enemy-runner",
      cdnFile("pixel-rescue/enemies/runner.webp"),
      {
        frameWidth: 96,
        frameHeight: 96,
      }
    );
    this.load.image(
      "heart-coin",
      cdnFile("pixel-rescue/items/hearth-coin.webp")
    );
    this.load.image(
      "heart-shield",
      cdnFile("pixel-rescue/items/hearth-shield.webp")
    );
    this.load.spritesheet(
      "jumping-effect",
      cdnFile("catnip-chaos/jumping.png"),
      {
        frameWidth: 50,
        frameHeight: 50,
      }
    );

    this.load.spritesheet("saw", cdnFile("story/saw.png"), {
      frameWidth: 38,
      frameHeight: 38,
    });

    this.load.spritesheet("morgenstern", cdnFile("story/spiked-ball.png"), {
      frameWidth: 28,
      frameHeight: 28,
    });

    this.load.spritesheet("chain", cdnFile("story/chain.png"), {
      frameWidth: 47,
      frameHeight: 9,
    });

    this.load.spritesheet("shield", cdnFile("pixel-rescue/items/shield.webp"), {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.image("particle", cdnFile("pixel-rescue/items/particle2.webp"));
  }

  init(props: IPixelRescueProps & IRestartData) {
    // A restart (`scene.restart({detail})`) passes only the GAME_START payload; the level and the
    // first-session flags must survive it, or a retry would load "level-undefined".
    const previous = this.props;
    const level = props?.level ?? previous?.level ?? "1";
    // PLAY AGAIN after a win: the level is cleared now, so no more starter shield.
    const clearedHere =
      PixelRescueScene.clearedThisSession.has(level) || cupidFtue.localClears().includes(level);
    this.props = {
      level,
      starterShield: !clearedHere && (props?.starterShield ?? previous?.starterShield ?? false),
      // An explicit replay is used once: a later retry does not replay again.
      replayTutorial: props?.level !== undefined ? !!props.replayTutorial : false,
      recordLocalClears: props?.recordLocalClears ?? previous?.recordLocalClears ?? false,
    };
    this.currentLevel = this.props.level;
  }

  create(props: { detail?: IPhaserGameSceneProps }) {
    // A new clock and shield per run, so a restart never runs a second countdown.
    this.clock = new RunClock();
    this.clock.pause("gate");
    this.shield.reset();
    this.hintsShown = [];
    this.hintText = undefined;
    this.gameEnded = false;
    this.runReady = false;
    this.isRestartRun = !!props.detail?.isRestart;
    this.runGate = createRunGate({ isRestart: this.isRestartRun });
    this.restartPending = false;

    this.tilemap = this.make.tilemap({ key: "tilemap" });
    this.look = beginWorldLook(this, { kind: "cupid", sheet: PixelRescueLevelMap[this.currentLevel] });
    // Same indices in v0 and v1: only the texture behind the tileset changes.
    const sugarTileset = this.tilemap.addTilesetImage(
      "valentine",
      this.look.tilesetKey("valentine"),
      32,
      32,
      1,
      2
    )!;

    this.groundLayer = this.tilemap.createLayer("blocks", [
      sugarTileset,
    ]) as Phaser.Tilemaps.TilemapLayer;
    this.platformsLayer = this.tilemap.createLayer("platforms", [
      sugarTileset,
    ]) as Phaser.Tilemaps.TilemapLayer;
    this.decorationLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
    ]) as Phaser.Tilemaps.TilemapLayer;

    this.physicsLayer = this.tilemap.createLayer("physics", [
      sugarTileset,
    ]) as Phaser.Tilemaps.TilemapLayer;
    this.heartLayer = this.tilemap.createLayer("hearth", [
      sugarTileset,
    ]) as Phaser.Tilemaps.TilemapLayer;

    this.decorationLayer.setDepth(10);

    this.jumperLayer = this.tilemap.createLayer("jumper", [
      sugarTileset,
    ]) as Phaser.Tilemaps.TilemapLayer;
    this.events.on(
      GameEvent.CAT_CARD_DISPLAY,
      (data: ICatEventsDetails[GameEvent.CAT_CARD_DISPLAY]) => {
        GameEvents.CAT_CARD_DISPLAY.push(data);
      }
    );

    this.groundLayer.setCollisionByExclusion([-1, ...SPIKE_TILES]);

    this.enemiesGroup = this.physics.add.group();
    this.physics.add.collider(this.enemiesGroup, this.groundLayer);
    this.physics.add.collider(this.enemiesGroup, this.platformsLayer);

    this.cratesGroup = this.physics.add.group();

    this.physics.add.collider(this.cratesGroup, this.groundLayer);

    this.platformsLayer.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: Phaser.Types.Physics.Arcade.GameObjectWithBody) => {
        if (player.body.velocity.y <= 0) {
          return true;
        }
        return false;
      },
      this
    );
    this.groundLayer.skipCull = false;
    this.platformsLayer.skipCull = false;
    //TODO CONSIDER IS THIS NEEDED
    // if (!props.detail?.isRestart) this.setupEventListeners(this.props);

    this.jumperLayer.setCollision(TRAMPOLINE_TILES);
    this.trampoline = new Trampoline(this, this.jumperLayer, TRAMPOLINE_TILES);

    // Camera (G7): integer zoom (platformer 14 x 9 tiles), map bounds; the night look in v1.
    this.look.dress({
      layers: [
        this.groundLayer,
        this.platformsLayer,
        this.decorationLayer,
        this.physicsLayer,
        this.heartLayer,
        this.jumperLayer,
      ],
      tilemapKey: "tilemap",
      groundLayers: ["blocks"],
    });
    setCssScroll(this.cameras.main, this, -650, -1000);

    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.setDefaultSound();

    if (props.detail?.cat) {
      // catDto survives a restart; pass isRestart so spawnCat does not bail out.
      this.spawnCat({
        detail: { cat: props.detail.cat, isRestart: !!props.detail.isRestart },
      });
    }

    if (!props.detail?.isRestart) {
      this.setupEventListeners();
    }

    this.createAnimations();

    Runner.initAnimations(this, RUNNER_TEXTURE_KEY);
    Blocker.initAnimations(this, BLOCKER_TEXTURE_KEY);

    this.createForestAtmosphere();

    this.tutorialManager = new TutorialManager(this, this.currentLevel);

    // The ticker runs from create, but the clock counts only after RUN_BEGIN (plan G10).
    this.startCountdown();
  }

  setupEventListeners() {
    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const startGameCallback = (data: ICatEvent<GameEvent.GAME_START>) =>
      this.startGame(data!);
    GameEvents.GAME_START.addEventListener(startGameCallback);
    // PLAY AGAIN (plan F6). GAME_START {isRestart} stays accepted for older callers.
    const restartCallback = (data: ICatEvent<GameEvent.GAME_RESTART>) =>
      this.restartRun(data?.detail?.cat);
    GameEvents.GAME_RESTART.addEventListener(restartCallback);

    this.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
      GameEvents.GAME_RESTART.removeEventListener(restartCallback);
    });

    GameEvents.GAME_LOADED.push({ scene: this });
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
    this.anims.create({
      key: "saw-anim",
      frames: this.anims.generateFrameNumbers("saw", { start: 0, end: 7 }),
      frameRate: 20,
      repeat: -1,
    });

    this.catsToRescue.forEach((catImageUrl, index) => {
      this.anims.create({
        key: `rescued-cat-${index}-anim`,
        frames: this.anims.generateFrameNumbers(`rescued-cat-${index}`, {
          start: 120,
          end: 123,
        }),
        frameRate: 8,
        repeat: -1,
      });
    });

    this.anims.create({
      key: "exit-portal-anim",
      frames: this.anims.generateFrameNumbers("exit-portal", {
        start: 0,
        end: 24,
      }),
      frameRate: 16,
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
      frames: this.anims.generateFrameNumbers("puff", {
        start: 0,
        end: 4,
      }),
      frameRate: 10,
      repeat: 0,
    });

    this.anims.create({
      key: "cloud-anim",
      frames: this.anims.generateFrameNumbers("cloud", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "hearts-anim",
      frames: this.anims.generateFrameNumbers("hearts", {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "shield-active-anim",
      frames: this.anims.generateFrameNumbers("shield", {
        start: 0,
        end: 2,
      }),
      frameRate: 2,
      repeat: -1,
    });
  }

  async spawnCat({
    detail: { cat, isRestart },
  }: ICatEvent<GameEvent.CAT_SPAWN>) {
    if (this.blessing) {
      this.blessing.setVisible(false);
    }

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
    this.lastCat = cat;

    // spawnCat runs un-awaited from event listeners, so a throw here would skip the
    // GameEvents crash guard as an unhandled rejection; report it instead.
    try {
      const wantsBlessing = !!cat.blessing && cat.tier !== Tier.COMMON;
      const { key, loaded, blessingKey, retirePrevious } = await loadPlayerCatTextures(this, cat, {
        blessing: wantsBlessing,
        blessingUrl: cdnFile(`flare-effect/spritesheets/${cat.type}.png`),
      });
      if (this.catDto !== cat || !this.sys.isActive()) return;
      if (!loaded) {
        reportAppError("player_texture_missing", new Error("Player cat sheet failed"), {
          source: "manual",
          level: "scene",
          scene: "PixelRescueScene",
        });
        return;
      }

      if (blessingKey) {
        this.blessing = this.add.sprite(0, 0, blessingKey).setVisible(true);
        const animKey = `blessing_animation_${cat.type}`;
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(blessingKey, {
              start: 0,
              end: 59,
            }),
            frameRate: 16,
            repeat: -1,
          });
        }
        this.blessing.play(animKey);
      } else {
        this.blessing = undefined;
      }
      this.createCat(key, this.blessing, cat.type, cat.tier);
      // The old skin's sprite went with the restart; its texture can go now.
      retirePrevious();
      this.createSpikes();
    } catch (error) {
      reportAppError("player_spawn_error", error, {
        source: "manual",
        level: "scene",
        scene: "PixelRescueScene",
      });
    }
  }

  private getTierHealth(tier: Tier): number {
    switch (tier) {
      case Tier.COMMON:
        return 1;
      case Tier.RARE:
        return 2;
      case Tier.EPIC:
        return 3;
      case Tier.LEGENDARY:
        return 10;
      default:
        return 1;
    }
  }
  private createCat(
    textureKey: string,
    blessing: Phaser.GameObjects.Sprite | null | undefined,
    type: CatAbilityType,
    tier: Tier
  ) {
    this.cat = new Cat(this, -850, -100, textureKey, blessing!, type, true, tier);

    const health = this.getTierHealth(tier);
    this.cat.maxHealth = health;
    this.cat.currentHealth = health;

    GameEvents.CAT_HEALTH_UPDATE.push({
      health: this.cat.currentHealth,
      maxHealth: this.cat.maxHealth,
    });

    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(
      this.cat.sprite as Phaser.Physics.Arcade.Sprite,
      this.platformsLayer
    );
    this.physics.add.collider(this.cat.sprite, this.jumperLayer);

    setMobileControls(this.cat);

    this.physics.add.overlap(
      this.cat.sprite,
      this.cratesGroup,
      this.handleCrateCollision,
      undefined,
      this
    );

    this.spawnEnemies();
    this.spawnCatCrates();
    this.spawnHazards();
    this.initializeheartCoins();
    this.initializeShields();
    this.spawnExitPortal();

    // Starter shield (plan G10): uncleared levels 1-2 start with one, visible on the cat.
    if (this.props.starterShield) {
      this.activateShield("starter");
    }

    // The spawn is frozen until RUN_BEGIN (the first input): no teleport, no countdown yet. While
    // the gate is open the cat sits in the upper part of the screen, so the gate card (bottom) and
    // the mobile controls never cover it; RUN_BEGIN centres it again.
    this.look?.follow(this.cat.sprite);
    this.look?.attachCat(this.cat.sprite, { player: true });
    this.setGateFollowOffset(true);
    this.markRunReady();
  }

  private gateOffsetOpen = false;

  /** LOOK_RESIZE while the gate is open; runs after the rig's own resize handler. */
  private readonly onGateResize = () => {
    this.time.delayedCall(0, () => {
      if (this.gateOffsetOpen && this.sys.isActive() && this.cameras?.main) this.setGateFollowOffset(true);
    });
  };

  /**
   * Camera offset while the gate is open, so the gate card never covers the cat: the cat sits a
   * quarter of the screen above the centre (card at the bottom), or below it on short landscape
   * screens, where the card sits at the top (PixelRescue.tsx).
   */
  private setGateFollowOffset(open: boolean) {
    const camera = this.cameras.main;
    this.gateOffsetOpen = open;
    if (!open) {
      this.game.events.off(LOOK_RESIZE, this.onGateResize);
      camera.setFollowOffset(0, 0);
      return;
    }
    // The shift is a share of the view in world units: recompute it after the rig re-picks the
    // zoom on a resize (rotation, on-screen keyboard) while the gate is still open.
    this.game.events.off(LOOK_RESIZE, this.onGateResize);
    this.game.events.on(LOOK_RESIZE, this.onGateResize);
    const worldHeight = camera.height / Math.max(0.0001, camera.zoom);
    const shortScreen = typeof window !== "undefined" && window.innerHeight <= 500;
    const shift = worldHeight * (shortScreen ? 0.22 : 0.25) * (shortScreen ? 1 : -1);
    camera.setFollowOffset(0, shift);
    // Jump there instead of gliding from the centre on the first frame.
    if (this.cat) camera.centerOn(this.cat.sprite.x, this.cat.sprite.y - shift);
  }

  /** The cat is on the map and the level is built: the gate may take the first input. */
  private markRunReady() {
    this.runReady = true;
    // While the gate is open, Space and the arrows must reach its Back button (plan G10).
    this.input.keyboard?.disableGlobalCapture();
    this.emitFtue();
    GameEvents.RUN_READY.push({
      isRestart: this.isRestartRun,
      mode: GameType.PIXEL_RESCUE,
      level: this.currentLevel,
    });
    this.armFirstInput();
  }

  /**
   * The first key, tap or click begins the run (onboarding/run-gate). It is consumed: the cat
   * reads controls only once that key or pointer is released, so the first tap is not a jump.
   * Taps on controls (the close button, the gate's Back, a modal) never begin it; the mobile
   * jump, dash and spell buttons do.
   */
  private armFirstInput() {
    if (this.firstInputArmed) return;
    this.firstInputArmed = true;
    this.runGate.ready();
    const begin = (kind: "pointer" | "key") => {
      if (this.runGate.input(kind) === "begin") this.beginRun();
    };
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (isExitKey(event)) return;
      if (isBeginKey(event) || CUPID_MOVE_KEYS.includes(event.code)) begin("key");
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const isMobileControl = !!target?.closest?.("#jump, #dash, #knockback");
      if (!isMobileControl && isControlTarget(event.target)) return;
      begin("pointer");
    };
    const release = () => {
      this.runGate.release();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keyup", release);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    // A key held while the window loses focus never sends keyup: release then, or the cat would
    // ignore every control for the rest of the run.
    window.addEventListener("blur", release);
    const cleanup = () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keyup", release);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      this.firstInputArmed = false;
      this.gateOffsetOpen = false;
      this.game?.events.off(LOOK_RESIZE, this.onGateResize);
    };
    this.events.once("shutdown", cleanup);
    this.events.once("destroy", cleanup);
  }

  /** RUN_BEGIN: the clock starts, then the tutorial plays if this player has not seen it. */
  public beginRun() {
    if (!this.runReady || this.gameEnded || this.clock.hasBegun) return;
    // Called directly (tests, "Replay tutorial" before the first input): drive the gate too.
    if (this.runGate.phase === "ready") this.runGate.input("key");
    this.clock.resume("gate");
    this.clock.begin();
    this.setGateFollowOffset(false);
    this.input.keyboard?.enableGlobalCapture();
    GameEvents.RUN_BEGIN.push({
      isRestart: this.isRestartRun,
      mode: GameType.PIXEL_RESCUE,
      level: this.currentLevel,
    });

    const decision = tutorialDecision({
      seen: cupidFtue.tutorialSeen(this.currentLevel),
      replayRequested: this.props.replayTutorial,
      isRestart: this.isRestartRun,
      playedThisSession: PixelRescueScene.tutorialPlayedThisSession.has(this.currentLevel),
    });
    this.props.replayTutorial = false;
    // The starter-shield line shows once the player can act: after the tour, or now without one.
    if (decision !== "play" || !this.startTutorial()) this.showStarterShieldHint();
    this.emitFtue();
  }

  /** "Starter shield: it blocks the first hit." once per player, while the shield is still up. */
  private showStarterShieldHint() {
    if (this.shield.isActive && this.shield.source === "starter") this.showFirstSeenHint("shield");
  }

  /** Plays the camera tour of the level. The clock holds for every step. */
  public startTutorial(): boolean {
    if (!this.cat || !this.catCrate || !this.exitPortalSprite || this.gameEnded) return false;
    if (this.tutorialManager?.active) return false;
    if (!this.tutorialManager) this.tutorialManager = new TutorialManager(this, this.currentLevel);
    this.clock.pause("tutorial");
    PixelRescueScene.tutorialPlayedThisSession.add(this.currentLevel);
    this.tutorialManager.start(
      this.cat,
      this.catCrate,
      this.heartCoins,
      this.exitPortalSprite,
      this.exitPortalX,
      this.exitPortalY,
      () => {
        cupidFtue.markTutorialSeen(this.currentLevel);
        this.clock.resume("tutorial");
        this.showStarterShieldHint();
        this.emitFtue();
      }
    );
    this.emitFtue();
    return true;
  }

  /** "Replay tutorial" from the HUD, mid-run. */
  public replayTutorial(): boolean {
    if (!this.clock.hasBegun) {
      this.props.replayTutorial = true;
      return true;
    }
    return this.startTutorial();
  }

  /** Test and QA read-out (see ICupidFtueSnapshot). */
  public ftueSnapshot(): ICupidFtueSnapshot {
    return {
      level: this.currentLevel,
      time: this.clock.time,
      clockBegun: this.clock.hasBegun,
      clockRunning: this.clock.isRunning,
      pauseReasons: this.clock.pauseReasons,
      tutorialActive: !!this.tutorialManager?.active,
      shieldActive: this.shield.isActive,
      shieldSource: this.shield.source,
      health: this.cat ? this.cat.currentHealth : null,
      gameEnded: this.gameEnded,
      hintsShown: [...this.hintsShown],
    };
  }

  /** Tells the React HUD (shield chip, replay button) about the first-session state. */
  private emitFtue() {
    this.game?.events?.emit(CUPID_FTUE_EVENT, this.ftueSnapshot());
  }

  private handleCrateCollision(catSprite: unknown, crateObject: unknown) {
    const crate = crateObject as CatCrate;

    if (!crate.hasCat || !crate.hasCat()) {
      return;
    }

    crate.startCollision(this.time.now);
  }

  private spawnCatCrates() {
    if (!this.cat) return;

    const CRATE_TILE_INDEX = 423;

    let crateSpawned = false;

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === CRATE_TILE_INDEX && !crateSpawned) {
        const catKey = `rescued-cat-0`;

        this.catCrate = new CatCrate(
          this,
          tile.getCenterX(),
          tile.getCenterY(),
          "crate",
          catKey
        );
        this.cratesGroup.add(this.catCrate);

        crateSpawned = true;

        this.physicsLayer.removeTileAt(tile.x, tile.y);
      }
    });
  }

  private spawnHazards() {
    if (!this.cat) return;

    const SAW_TILE_INDEX = 424;
    const MORGENSTERN_TILE_INDEX = 425;

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === SAW_TILE_INDEX) {
        const saw = new Saw({
          scene: this,
          groundLayer: this.groundLayer,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          route: "horizontal",
          speed: 100,
          distance: 128,
        });
        this.saws.push(saw);
        this.physicsLayer.removeTileAt(tile.x, tile.y);
      } else if (tile.index === MORGENSTERN_TILE_INDEX) {
        const morgenstern = new RotatingMorgensternTrapManager({
          scene: this,
          groundLayer: this.groundLayer,
          platformsLayer: this.platformsLayer,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          radius: 96,
          speed: 0.05,
          texture: "morgenstern",
          chainTexture: "chain",
        });
        this.morgensterns.push(morgenstern);
        this.physicsLayer.removeTileAt(tile.x, tile.y);
      }
    });
  }

  private spawnEnemies() {
    if (!this.cat) return;

    const RUNNER_TILE_INDEX = 421;
    const BLOCKER_TILE_INDEX = 422;

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === RUNNER_TILE_INDEX) {
        const runner = new Runner(
          {
            scene: this,
            x: tile.getCenterX(),
            y: tile.getCenterY(),
            texture: RUNNER_TEXTURE_KEY,
            groundLayer: this.groundLayer,
          },
          this.cat!.sprite
        );
        this.listEnemies.push(runner);
        this.enemiesGroup.add(runner);

        this.physicsLayer.removeTileAt(tile.x, tile.y);
      } else if (tile.index === BLOCKER_TILE_INDEX) {
        const blocker = new Blocker(
          {
            scene: this,
            x: tile.getCenterX(),
            y: tile.getCenterY(),
            texture: BLOCKER_TEXTURE_KEY,
            groundLayer: this.groundLayer,
          },
          this.cat!.sprite
        );
        this.listEnemies.push(blocker);
        this.enemiesGroup.add(blocker);

        this.physicsLayer.removeTileAt(tile.x, tile.y);
      }
    });
  }

  private spawnExitPortal() {
    const EXIT_PORTAL_TILES = 427;

    this.physicsLayer.forEachTile((tile) => {
      if (EXIT_PORTAL_TILES === tile.index) {
        this.exitPortalX = tile.getCenterX();
        this.exitPortalY = tile.getCenterY();

        this.exitPortalSprite = this.add.sprite(
          this.exitPortalX,
          this.exitPortalY,
          "exit-portal"
        );
        this.exitPortalSprite.setDisplaySize(64, 64);
        this.exitPortalSprite.setDepth(6);
        this.exitPortalSprite.setTint(0xff0000);
        this.exitPortalSprite.play("exit-portal-anim");

        this.physicsLayer.removeTileAt(tile.x, tile.y);
      }
    });
  }

  private createSpikes() {
    if (!this.cat) return;

    // Every spike goes through the shield (takeHazardHit). The old tile-overlap check, which
    // ended the run outright and skipped the shield, was never enabled and is gone.
    this.spikeManager = new SpikeManager({
      scene: this,
      groundLayer: this.groundLayer!,
      spikeTiles: SPIKE_TILES,
      catSprite: this.cat.sprite!,
      onPlayerHitSpike: () => this.takeHazardHit({ bounce: true }),
    });
  }

  private openExitPortal() {
    if (this.isExitPortalOpen || !this.exitPortalSprite) return;

    this.isExitPortalOpen = true;
    this.exitPortalSprite.clearTint();
  }

  /**
   * GAME_START. A restart (`tryAgain`) rebuilds the scene; the tutorial is NOT reset, so a retry
   * never replays it. A plain GAME_START used to teleport the cat to (0, -400) and start a second
   * countdown on top of the one from `create` (known bug, plan section 7): it is ignored now, since
   * the run begins on the first input (RUN_BEGIN).
   */
  private startGame(data: ICatEvent<GameEvent.GAME_START>) {
    if (!data?.detail?.isRestart) return;
    this.restartRun(data.detail.cat);
  }

  /**
   * Rebuilds the scene for another attempt on the same level. One restart per attempt: PLAY AGAIN
   * sends GAME_RESTART (plan F6) and older callers GAME_START {isRestart}; if both arrive, the
   * second is ignored, so there is one RUN_READY and one gate, never two.
   */
  private restartRun(cat?: ICat) {
    if (this.restartPending) return;
    this.restartPending = true;
    this.gameEnded = false;
    this.clock.end();
    if (this.timerEvent) {
      this.timerEvent.destroy();
      this.timerEvent = undefined;
    }
    const nextCat = cat ?? this.catDto ?? this.lastCat;
    this.scene.restart({ detail: { cat: nextCat, isRestart: true } });
  }

  /** The one-second ticker for this run's clock (counts only once the clock has begun). */
  private startCountdown() {
    if (this.timerEvent) {
      this.timerEvent.destroy();
    }
    if (this.gameUpdateCallback) {
      GameEvents.GAME_UPDATE.removeEventListener(this.gameUpdateCallback);
    }

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.onTimerTick,
      callbackScope: this,
      loop: true,
    });
    GameEvents.GAME_UPDATE.push({ time: this.clock.time });

    this.gameUpdateCallback = (data: ICatEvent<GameEvent.GAME_UPDATE>) => {
      if (data.detail.additionalTime) {
        GameEvents.GAME_UPDATE.push({ time: this.clock.addTime(data.detail.additionalTime) });
      }
    };
    GameEvents.GAME_UPDATE.addEventListener(this.gameUpdateCallback);

    const cleanup = () => {
      if (this.gameUpdateCallback) {
        GameEvents.GAME_UPDATE.removeEventListener(this.gameUpdateCallback);
      }
      this.timerEvent?.destroy();
    };
    this.events.once("shutdown", cleanup);
    this.events.once("destroy", cleanup);
  }

  private onTimerTick() {
    if (this.gameEnded) return;
    // Belt and braces: the tutorial and a paused notice hold the clock even if a reason was missed.
    if (this.tutorialManager?.active) this.clock.pause("tutorial");
    const result = this.clock.tick();
    if (result === "idle") return;

    GameEvents.GAME_UPDATE.push({ time: this.clock.time });

    if (result === "expired") {
      this.timerEvent?.destroy();
      this.endGame("timer");
    }
  }

  update(time: number, delta: number) {
    if (this.gameEnded || this.cat?.isDeath) return;

    // Frozen spawn until RUN_BEGIN: nothing moves and nothing can hurt the cat behind the gate.
    if (!this.clock.hasBegun) return;

    if (this.tutorialManager?.active) return;

    if (this.isNotificationPaused) return;

    // The input that began the run is not also a jump or a dash.
    if (this.cat?.sprite.active && !this.runGate.awaitingRelease) {
      this.cat.update();
    }

    this.checkFirstSeenHints();

    this.listEnemies.forEach((enemy) => enemy.update(time, delta));

    if (
      this.cat &&
      this.cat.abilities &&
      this.cat.abilities.knockbackSpellGroup
    ) {
      const spells =
        this.cat.abilities.knockbackSpellGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];

      spells.forEach((spell) => {
        if (!spell.active) return;

        this.listEnemies.forEach((enemy) => {
          if (this.physics.overlap(spell, enemy)) {
            spell.destroy();

            if (enemy.takeDamage) {
              enemy.takeDamage();
            }
          }
        });
      });
    }

    this.saws.forEach((saw) => saw.update(time, delta));
    this.morgensterns.forEach((morgenstern) => morgenstern.update(time, delta));
    this.saws.forEach((saw) => {
      if (this.cat) {
        const sawSprite = saw.getSprite();
        const distance = Phaser.Math.Distance.Between(
          this.cat.sprite.x,
          this.cat.sprite.y,
          sawSprite.x,
          sawSprite.y
        );

        if (distance < 30) {
          this.takeHazardHit();
        }
      }
    });

    this.morgensterns.forEach((morgenstern) => {
      if (this.cat) {
        const morgensternSprite = morgenstern.getMorgenstern();
        const distance = Phaser.Math.Distance.Between(
          this.cat.sprite.x,
          this.cat.sprite.y,
          morgensternSprite.x,
          morgensternSprite.y
        );

        if (distance < 30) {
          this.takeHazardHit();
        }
      }
    });

    // The cat is unset for a frame while a re-skin restarts the scene (and before the first
    // spawn); the overlaps below need it (console TypeError found by the 2e render e2e).
    if (this.cat && this.catCrate && this.catCrate.active) {
      const isColliding = this.physics.overlap(this.cat.sprite, this.catCrate);

      if (
        isColliding &&
        this.catCrate.hasCat() &&
        this.heartCoins.length === 0
      ) {
        const rescued = this.catCrate.updateCollision(time);

        if (rescued) {
          if (this.catsRescued >= this.MAX_CATS_TO_RESCUE) {
            this.time.delayedCall(500, () => {
              this.catCrate?.destroy();
              this.catCrate = undefined;
            });
            return;
          }

          this.catsRescued++;
          this.isPlayerCarryingCat = true;

          const cratePosition = { x: this.catCrate.x, y: this.catCrate.y };
          this.spawnRescuedCat(cratePosition);
          this.applyCatRescueSlowdown();

          // Objective handler: if coins are done, next is exit
          if (this.heartCoins.length === 0) {
            GameEvents.OBJECTIVE_UPDATE.push({
              objective: "Reach the portal.",
              completed: false,
            });
          }

          if (this.sound.get("open")) {
            this.sound.play("open", { volume: 0.5 });
          }

          this.time.delayedCall(1000, () => {
            this.cameras.main.pan(
              this.exitPortalX,
              this.exitPortalY,
              2000,
              "Power2"
            );

            this.time.delayedCall(1000, () => {
              this.isNotificationPaused = true;
              this.clock.pause("notice");
              this.physics.pause();

              this.showNotification(
                this.exitPortalX,
                this.exitPortalY - 70,
                "Bring cat here!"
              );

              this.time.delayedCall(2500, () => {
                this.isNotificationPaused = false;
                this.clock.resume("notice");
                this.physics.resume();

                if (this.cat) this.look?.follow(this.cat.sprite);
              });
            });
          });

          this.time.delayedCall(500, () => {
            this.catCrate?.destroy();
            this.catCrate = undefined;
          });
        }
      } else if (
        isColliding &&
        this.catCrate.hasCat() &&
        this.heartCoins.length > 0
      ) {
        const currentTime = this.time.now;
        if (
          currentTime - this.lastCrateNotificationTime >
          this.NOTIFICATION_COOLDOWN
        ) {
          this.showCrateNotification();
          this.lastCrateNotificationTime = currentTime;
        }
        this.catCrate.stopCollision();
      } else {
        this.catCrate.stopCollision();
      }
    }

    for (let i = this.cat ? this.heartCoins.length - 1 : -1; i >= 0; i--) {
      const coin = this.heartCoins[i];
      if (this.physics.overlap(this.cat!.sprite, coin)) {
        coin.destroy();
        this.heartCoins.splice(i, 1);
        // Counted once per heart. The old per-frame proximity pass counted most hearts twice.
        this.collectedheartCoins++;
        GameEvents.GAME_COIN_CAUGHT.push({ score: this.collectedheartCoins });

        const heartSound = this.sound.add("catnip", { volume: 0.5 });
        heartSound.play();

        const puffSprite = this.add.sprite(coin.x, coin.y, "puff");
        puffSprite.play("puff");
        puffSprite.on("animationcomplete", () => {
          puffSprite.destroy();
        });

        //Objective handler
        if (this.heartCoins.length === 1) {
          GameEvents.OBJECTIVE_UPDATE.push({
            objective: `Collect ${this.heartCoins.length} heart`,
            completed: false,
          });
        } else if (this.heartCoins.length > 1) {
          GameEvents.OBJECTIVE_UPDATE.push({
            objective: `Collect ${this.heartCoins.length} hearts`,
            completed: false,
          });
        } else {
          if (this.catsRescued >= this.MAX_CATS_TO_RESCUE) {
            GameEvents.OBJECTIVE_UPDATE.push({
              objective: "Reach the portal.",
              completed: false,
            });
          } else {
            GameEvents.OBJECTIVE_UPDATE.push({
              objective: "Save the cat!",
              completed: false,
            });
          }
        }

        this.checkWinCondition();
      }
    }

    for (let i = this.cat ? this.shields.length - 1 : -1; i >= 0; i--) {
      const shield = this.shields[i];
      if (this.physics.overlap(this.cat!.sprite, shield)) {
        if (this.shield.isActive) {
          continue;
        }

        shield.destroy();
        this.shields.splice(i, 1);

        this.activateShield("pickup");

        if (this.sound.get("protection")) {
          this.sound.play("protection", { volume: 0.5 });
        }

        if (this.sound.get("charge-sound")) {
          this.sound.play("charge-sound", { volume: 0.4 });
        }

        const puffSprite = this.add.sprite(shield.x, shield.y, "puff");
        puffSprite.play("puff");
        puffSprite.on("animationcomplete", () => {
          puffSprite.destroy();
        });
      }
    }

    if (this.shield.isActive && this.shieldSprite && this.cat) {
      this.shieldSprite.setPosition(this.cat.sprite.x, this.cat.sprite.y);
    }

    if (this.rescuedCat) {
      this.rescuedCat.update();
    }

    if (this.cat && this.exitPortalSprite) {
      const distanceToPortal = Phaser.Math.Distance.Between(
        this.cat.sprite.x,
        this.cat.sprite.y,
        this.exitPortalX,
        this.exitPortalY
      );

      if (distanceToPortal < 64) {
        if (this.isExitPortalOpen && !this.isBeingSuckedIntoPortal) {
          this.suckCatsIntoPortal();
        } else if (!this.isExitPortalOpen) {
          const currentTime = this.time.now;
          if (
            currentTime - this.lastPortalNotificationTime >
            this.NOTIFICATION_COOLDOWN
          ) {
            this.showNotification(
              this.exitPortalX,
              this.exitPortalY - 70,
              "Save cat first!"
            );
            this.lastPortalNotificationTime = currentTime;
          }
          this.throwCatBack();
        }
      }
    }
  }

  private spawnRescuedCat(cratePosition?: { x: number; y: number }) {
    if (!this.cat) return;

    const catIndex = 0;
    const catImageUrl = this.catsToRescue[catIndex];
    const catKey = `rescued-cat-${catIndex}`;

    this.rescuedCat = new RescuedCat(
      this,
      this.cat.sprite,
      catImageUrl,
      catKey,
      cratePosition
    );

    const followDistance = 40;
    this.rescuedCat.setFollowDistance(followDistance);

    this.isPlayerCarryingCat = this.rescuedCat !== undefined;
  }

  private applyCatRescueSlowdown() {
    if (!this.cat) return;

    if (this.catsRescued === 1) {
      this.speedSlowdownMultiplier = 0.85;
    } else if (this.catsRescued === 2) {
      this.speedSlowdownMultiplier = 0.7;
    }

    const originalSpeed = catWalkSpeed;
    const newSpeed = originalSpeed * this.speedSlowdownMultiplier;
    this.cat.walkSpeed = newSpeed;

    this.checkWinCondition();
  }

  private checkWinCondition() {
    if (
      this.catsRescued >= this.MAX_CATS_TO_RESCUE &&
      this.heartCoins.length === 0
    ) {
      this.openExitPortal();
    }
  }

  private suckCatsIntoPortal() {
    if (!this.cat || this.isBeingSuckedIntoPortal) return;

    this.isBeingSuckedIntoPortal = true;

    this.tweens.add({
      targets: this.cat.sprite,
      x: this.exitPortalX,
      y: this.exitPortalY,
      scaleX: 0,
      scaleY: 0,
      duration: 800,
      ease: "Power2",
      onComplete: () => {
        this.cat?.sprite.setVisible(false);
      },
    });

    if (this.rescuedCat && this.rescuedCat.catSprite) {
      this.tweens.add({
        targets: this.rescuedCat.catSprite,
        x: this.exitPortalX,
        y: this.exitPortalY,
        scaleX: 0,
        scaleY: 0,
        duration: 800,
        ease: "Power2",
        onComplete: () => {
          this.rescuedCat?.catSprite.setVisible(false);
        },
      });

      if (this.rescuedCat.cloudSprite) {
        this.tweens.add({
          targets: this.rescuedCat.cloudSprite,
          x: this.exitPortalX,
          y: this.exitPortalY,
          scaleX: 0,
          scaleY: 0,
          duration: 800,
          ease: "Power2",
          onComplete: () => {
            this.rescuedCat?.cloudSprite.setVisible(false);
          },
        });
      }

      if (this.rescuedCat.heartsSprite) {
        this.tweens.add({
          targets: this.rescuedCat.heartsSprite,
          x: this.exitPortalX,
          y: this.exitPortalY,
          scaleX: 0,
          scaleY: 0,
          duration: 800,
          ease: "Power2",
          onComplete: () => {
            this.rescuedCat?.heartsSprite.setVisible(false);
          },
        });
      }
    }

    if (this.sound.get("powerup")) {
      this.sound.play("powerup", { volume: 0.5 });
    }

    this.time.delayedCall(1000, () => {
      this.winGame();
    });
  }

  private winGame() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.clock.end();
    this.backgroundSound?.stop();
    this.timerEvent?.destroy();
    PixelRescueScene.clearedThisSession.add(this.currentLevel);
    if (this.props.recordLocalClears) cupidFtue.recordLocalClear(this.currentLevel);

    this.pushStop("portal");

    this.time.delayedCall(500, () => {
      this.destroyGameObjects();
    });
  }

  private throwCatBack() {
    if (!this.cat) return;

    const currentTime = this.time.now;
    if (currentTime - this.lastThrowBackTime < 400) {
      return;
    }
    this.lastThrowBackTime = currentTime;

    const directionX = this.cat.sprite.x < this.exitPortalX ? -1 : 1;

    this.cat.sprite.setVelocityX(directionX * 600);
    this.cat.sprite.setVelocityY(-400);

    if (this.sound.get("jump")) {
      this.sound.play("jump", { volume: 0.3, rate: 1.2 });
    }

    this.exitPortalSprite?.setTint(0xff0000);
    this.time.delayedCall(200, () => {
      this.exitPortalSprite?.setTint(0xff0000);
    });
  }

  private setDefaultSound() {
    this.backgroundSound?.play();
  }

  private initializeheartCoins() {
    this.heartLayer.forEachTile((tile) => {
      if (tile.index === 428) {
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();
        this.totalheartCoins++;

        this.heartLayer.removeTileAt(tile.x, tile.y);
        const rotatingSprite = this.physics.add.sprite(
          worldX,
          worldY,
          "heart-coin"
        );
        rotatingSprite.width = 32;
        rotatingSprite.height = 32;
        rotatingSprite.setDisplaySize(48, 48);

        rotatingSprite.setVisible(true);

        this.tweens.add({
          targets: rotatingSprite,
          angle: 360,
          duration: 1000,
          repeat: -1,
        });

        rotatingSprite.body.setAllowGravity(false);
        this.heartCoins.push(rotatingSprite);
      }
    });

    //Objective handler
    if (this.totalheartCoins === 1) {
      GameEvents.OBJECTIVE_UPDATE.push({
        objective: `Collect ${this.totalheartCoins} heart`,
        completed: false,
      });
    } else if (this.totalheartCoins > 1) {
      GameEvents.OBJECTIVE_UPDATE.push({
        objective: `Collect ${this.totalheartCoins} hearts`,
        completed: false,
      });
    }
  }

  private initializeShields() {
    const SHIELD_TILE_INDEX = 426;

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === SHIELD_TILE_INDEX) {
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();

        this.physicsLayer.removeTileAt(tile.x, tile.y);

        const shieldSprite = this.physics.add.sprite(
          worldX,
          worldY,
          "heart-shield"
        );
        shieldSprite.setDisplaySize(32, 32);
        shieldSprite.setVisible(true);
        shieldSprite.setDepth(5);
        shieldSprite.body.setAllowGravity(false);

        this.tweens.add({
          targets: shieldSprite,
          y: worldY - 8,
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });

        this.shields.push(shieldSprite);
      }
    });
  }

  private activateShield(source: "starter" | "pickup") {
    if (!this.shield.arm(source)) return;

    if (this.cat) {
      this.shieldSprite = this.add.sprite(
        this.cat.sprite.x,
        this.cat.sprite.y,
        "shield"
      );
      this.shieldSprite.setSize(32, 32);
      this.shieldSprite.setDepth(100);
      // The starter shield reads clearly on a first run; a picked-up one keeps the old look.
      this.shieldSprite.setAlpha(source === "starter" ? 0.8 : 0.5);
      this.shieldSprite.play("shield-active-anim");

      // No endless pulse under reduced motion: the sprite and the HUD chip already show it.
      if (!prefersReducedMotion()) {
        this.tweens.add({
          targets: this.shieldSprite,
          scale: { from: 1, to: 1.1 },
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }
    // The starter shield's hint waits for the run to begin (showStarterShieldHint), so it is not
    // spent behind the gate.
    this.emitFtue();
  }

  /**
   * A saw, a spiked ball or a spike touched the cat. The shield takes the first hit; for a while
   * after it breaks nothing lands (the same hazard is usually still overlapping). `bounce` lifts
   * the cat off a spike strip so the grace window is enough to get clear.
   */
  private takeHazardHit(options: { bounce?: boolean } = {}) {
    if (this.consumeShield()) {
      if (options.bounce && this.cat?.sprite.body) this.cat.sprite.setVelocityY(-380);
      return;
    }
    this.handlePlayerHit();
  }

  /**
   * Called by enemies and hazards before a hit lands. Returns true when the hit is swallowed: the
   * shield broke now, or it broke a moment ago (grace window).
   */
  public consumeShield(enemy?: BasePixelEnemy): boolean {
    const result = this.shield.hit(this.time.now);
    if (result === "hit") return false;
    if (result === "ignored") return true;

    if (this.shieldSprite) {
      const brokenShield = this.shieldSprite;
      this.shieldSprite = undefined;
      this.tweens.killTweensOf(brokenShield);
      this.tweens.add({
        targets: brokenShield,
        alpha: 0,
        scale: 1.5,
        duration: 300,
        ease: "Power2",
        onComplete: () => {
          brokenShield.destroy();
        },
      });

      // Play break sound
      if (this.sound.get("jump")) {
        this.sound.play("jump", { volume: 0.4, rate: 0.5 });
      }

      const puffSprite = this.add.sprite(brokenShield.x, brokenShield.y, "puff");
      puffSprite.setScale(2);
      puffSprite.play("puff");
      puffSprite.on("animationcomplete", () => {
        puffSprite.destroy();
      });

      const saved = ttWorldText(this, brokenShield.x, brokenShield.y - 44, "SHIELD SAVED YOU!", "burst", 18, {
        color: "#fbcc93",
        stroke: NIGHT[900],
        origin: 0.5,
        depth: 120,
      });
      this.tweens.add({
        targets: saved,
        y: saved.y - 36,
        alpha: 0,
        duration: 1200,
        ease: "Power2",
        onComplete: () => saved.destroy(),
      });
    }

    if (enemy) {
      this.stunAndKnockbackEnemy(enemy);
    }
    // The grace window (SHIELD_BREAK_GRACE_MS) is in ShieldState; blink the cat while it lasts.
    if (this.cat) {
      this.cat.isInvulnerable = true;
      this.tweens.add({
        targets: this.cat.sprite,
        alpha: 0.4,
        duration: 125,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          if (this.cat && !this.cat.isDeath) {
            this.cat.sprite.setAlpha(1);
            this.cat.isInvulnerable = false;
          }
        },
      });
    }

    this.emitFtue();
    return true;
  }

  private stunAndKnockbackEnemy(enemy: BasePixelEnemy) {
    if (!this.cat) return;

    const directionX = enemy.x > this.cat.sprite.x ? 1 : -1;

    enemy.setVelocityX(directionX * 200);
    enemy.setVelocityY(-150);

    enemy.isStunned = true;
    enemy.setTint(0x8888ff);

    const stunText = ttWorldText(this, enemy.x, enemy.y - 50, "STUNNED!", "burst", 18, {
      color: "#ffff00",
      stroke: "#000000",
      origin: 0.5,
    });

    this.tweens.add({
      targets: stunText,
      y: stunText.y - 40,
      alpha: 0,
      duration: 1000,
      ease: "Power2",
      onComplete: () => {
        stunText.destroy();
      },
    });

    this.time.delayedCall(1000, () => {
      enemy.isStunned = false;
      enemy.clearTint();
    });
  }
  /**
   * First-seen hints (plan G10): the first time an enemy, the crate or the portal comes near, a
   * hint plate names it. Once per player (ftue-store), never during the tutorial tour, which
   * already shows the crate and the portal.
   */
  private checkFirstSeenHints() {
    if (!this.cat || this.hintText) return;
    const { x, y } = this.cat.sprite;
    const near = (tx: number, ty: number, radius: number) =>
      Phaser.Math.Distance.Between(x, y, tx, ty) < radius;

    if (!this.isHintDone("enemy")) {
      const enemy = this.listEnemies.find((e) => e.active && near(e.x, e.y, 260));
      if (enemy) {
        this.showFirstSeenHint("enemy", enemy.x, enemy.y);
        return;
      }
    }
    if (this.catCrate?.active && !this.isHintDone("crate") && near(this.catCrate.x, this.catCrate.y, 220)) {
      this.showFirstSeenHint("crate", this.catCrate.x, this.catCrate.y);
      return;
    }
    if (this.exitPortalSprite && !this.isHintDone("portal") && near(this.exitPortalX, this.exitPortalY, 240)) {
      this.showFirstSeenHint("portal", this.exitPortalX, this.exitPortalY);
    }
  }

  private isHintDone(id: CupidHintId): boolean {
    return this.hintsShown.includes(id) || cupidFtue.hintSeen(id);
  }

  /** Shows one hint plate above a target (the cat by default) for a few seconds. */
  private showFirstSeenHint(id: CupidHintId, targetX?: number, targetY?: number) {
    if (this.isHintDone(id)) return;
    this.hintsShown.push(id);
    cupidFtue.markHintSeen(id);

    const followCat = targetX === undefined || targetY === undefined;
    const anchorX = followCat ? this.cat?.sprite.x ?? 0 : targetX!;
    const anchorY = followCat ? this.cat?.sprite.y ?? 0 : targetY!;
    const copy = cupidHintCopy(id);
    // CSS width over CSS zoom, as before F10; `scale.width` is now backing-store pixels.
    const isPhone = cssViewSize(this).width / Math.max(1, cameraCssZoom(this)) < 768;

    this.hintText?.destroy();
    // Just above the cat's head when it follows the cat (the old 76 world px floated a whole
    // platform above it at phone zoom); above a target otherwise.
    const lift = followCat ? CAT_HINT_LIFT : 70;
    const text = ttWorldText(this, anchorX, anchorY - lift, copy, "hint", isPhone ? 15 : 18, {
      color: "#fbcc93",
      stroke: NIGHT[900],
      strokeThickness: 5,
      align: "center",
      wordWrapWidth: (isPhone ? 170 : 260) * cameraCssZoom(this),
      origin: [0.5, 1],
      depth: 1000,
    });
    this.hintText = text;
    const reduced = prefersReducedMotion();
    if (!reduced) {
      text.setAlpha(0);
      this.tweens.add({ targets: text, alpha: 1, y: text.y - 6, duration: 220, ease: "Power2" });
    }

    const follow = () => {
      if (followCat && this.cat && text.active) text.setPosition(this.cat.sprite.x, this.cat.sprite.y - CAT_HINT_LIFT);
    };
    if (followCat) this.events.on("postupdate", follow);

    const remove = () => {
      this.events.off("postupdate", follow);
      text.destroy();
      if (this.hintText === text) this.hintText = undefined;
    };
    this.time.delayedCall(HINT_VISIBLE_MS, () => {
      if (reduced) {
        remove();
        return;
      }
      this.tweens.add({ targets: text, alpha: 0, duration: 260, onComplete: remove });
    });
    this.emitFtue();
  }

  private showDamageText(x: number, y: number) {
    const hitMessages = ["HIT!", "OUCH!", "BITE!", "AGHW!", "POW!", "SMACK!"];
    const randomMessage = Phaser.Utils.Array.GetRandom(hitMessages);

    const damageText = ttWorldText(this, x, y - 40, randomMessage, "burst", 18, {
      color: "#ff3b3b",
      stroke: "#ffffff",
      origin: 0.5,
    });

    const randomOffsetX = Phaser.Math.Between(-20, 20);

    this.tweens.add({
      targets: damageText,
      y: damageText.y - 80,
      x: damageText.x + randomOffsetX,
      alpha: 0,
      scale: scaleTo(damageText, 1.5),
      duration: 1000,
      ease: "Power2",
      onComplete: () => {
        damageText.destroy();
      },
    });

    this.tweens.add({
      targets: damageText,
      angle: Phaser.Math.Between(-15, 15),
      duration: 1000,
      ease: "Sine.easeInOut",
    });
  }

  public handlePlayerHit() {
    if (this.cat?.isDeath || !this.cat || this.cat.isInvulnerable) return;

    const shouldDie = this.cat.hit();

    this.cat.isInvulnerable = true;

    GameEvents.CAT_HEALTH_UPDATE.push({
      health: this.cat.currentHealth,
      maxHealth: this.cat.maxHealth,
    });

    this.showDamageText(this.cat.sprite.x, this.cat.sprite.y);

    this.cameras.main.shake(100, 0.001);

    this.cat.sprite.setTint(0xff0000);
    this.tweens.add({
      targets: this.cat.sprite,
      alpha: 0.5,
      duration: 100,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (this.cat && !this.cat.isDeath) {
          this.cat.sprite.clearTint();
          this.cat.sprite.setAlpha(1);
          this.cat.isInvulnerable = false;
        }
      },
    });

    if (shouldDie) {
      this.endGame("health");
    }
  }

  /**
   * The one GAME_STOP of a run, with its outcome (plan F6): `won` through the portal, `died` from
   * health or a spike, `timeout` when the clock ran out. GameContext saves it through `/live`.
   */
  private pushStop(reason: CupidStopReason) {
    this.runGate.end();
    const outcome = outcomeFor(reason);
    GameEvents.GAME_STOP.push({
      score: this.collectedheartCoins,
      time: this.clock.elapsed,
      completedLevel: outcome === "won" ? this.currentLevel : null,
      outcome,
    });
    this.emitFtue();
  }

  private endGame(reason: Exclude<CupidStopReason, "portal"> = "health") {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.clock.end();
    this.backgroundSound?.stop();
    this.timerEvent?.destroy();

    if (this.cat) {
      this.cat.isHit = true;
      this.cat.sprite.setTint(0xff0000);
      this.cat.sprite.setVelocity(0, 0);
      this.cat.sprite.setAcceleration(0, 0);
      if (this.cat.sprite.body) {
        this.cat.sprite.body.enable = false;
      }
      this.cat.sprite.setRotation(0);
    }

    if (this.cat?.sprite.anims && this.cat.animationKeys) {
      this.cat.sprite.anims.play(this.cat.animationKeys.HIT, true);
    }

    this.time.delayedCall(250, () => {
      this.pushStop(reason);
      this.destroyGameObjects();
    });
  }

  private destroyGameObjects() {
    this.resetGameObjects();
  }

  private resetGameObjects() {
    this.cat = undefined;
    this.catDto = undefined;

    this.collectedheartCoins = 0;
    this.totalheartCoins = 0;
    this.catsRescued = 0;
    this.isPlayerCarryingCat = false;
    this.speedSlowdownMultiplier = 1;
    this.spawnedCatIndices = [];
    this.isExitPortalOpen = false;
    this.isBeingSuckedIntoPortal = false;
    this.lastThrowBackTime = 0;
    this.gameEnded = false;

    this.listEnemies.forEach((enemy) => {
      if (enemy && !enemy.scene) return;
      try {
        enemy.destroy();
      } catch {
        // already destroyed with the scene
      }
    });
    this.listEnemies = [];

    this.saws.forEach((saw) => saw.destroy());
    this.saws = [];

    this.morgensterns.forEach((morgenstern) => morgenstern.destroy());
    this.morgensterns = [];

    if (this.catCrate) {
      this.catCrate.destroy();
      this.catCrate = undefined;
    }

    if (this.rescuedCat) {
      this.rescuedCat.destroy();
      this.rescuedCat = undefined;
    }

    this.heartCoins.forEach((coin) => coin.destroy());
    this.heartCoins = [];

    this.shields.forEach((shield) => shield.destroy());
    this.shields = [];

    if (this.shieldSprite) {
      this.shieldSprite.destroy();
      this.shieldSprite = undefined;
    }
    this.shield.reset();

    this.destroyForestAtmosphere();

    // Reset tutorial state
    if (this.tutorialManager) {
      this.tutorialManager = undefined;
    }
  }

  private createForestAtmosphere() {
    this.forestAtmosphere = new ForestAtmosphere(
      this,
      this.tilemap,
      this.groundLayer,
      this.physicsLayer,
      this.heartLayer
    );
    this.forestAtmosphere.create();
  }

  private destroyForestAtmosphere() {
    if (this.forestAtmosphere) {
      this.forestAtmosphere.destroy();
      this.forestAtmosphere = undefined;
    }
  }

  private showCrateNotification() {
    if (!this.catCrate) return;

    const coinsNeeded = this.heartCoins.length;
    const message = `Need ${coinsNeeded} more heart${
      coinsNeeded === 1 ? "" : "s"
    }!`;

    this.showNotification(this.catCrate.x, this.catCrate.y - 70, message);
  }

  private showNotification(x: number, y: number, message: string) {
    const notificationText = ttWorldText(this, x, y, message, "burst", 22, {
      color: "#ff3b3b",
      stroke: "#ffffff",
      align: "center",
      origin: 0.5,
      depth: 20,
    });

    this.tweens.add({
      targets: notificationText,
      y: notificationText.y - 40,
      alpha: 0,
      scale: scaleTo(notificationText, 1.3),
      duration: 2000,
      ease: "Power2",
      onComplete: () => {
        notificationText.destroy();
      },
    });

    this.tweens.add({
      targets: notificationText,
      angle: { from: -5, to: 5 },
      duration: 200,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
  }
}
