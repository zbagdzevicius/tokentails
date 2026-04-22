import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { SpikeManager } from "@/components/purrquest/managers/SpikeManager";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { cdnFile, ZOOM_PIXEL } from "@/constants/utils";
import { CatAbilityType, ICat, Tier } from "@/models/cats";
import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { catWalkSpeed } from "@/models/game";
import { BasePixelEnemy } from "../objects/BasePixelEnemy";
import { Runner } from "../objects/Runner";
import { Blocker } from "../objects/Blocker";
import { BLOCKER_TEXTURE_KEY, RUNNER_TEXTURE_KEY } from "../config/EnemyConfig";
import { CatCrate } from "../objects/CatCrate";
import { RescuedCat } from "../objects/RescuedCat";
import { Saw } from "@/components/storyMode/Managers/SawManager";
import { RotatingMorgensternTrapManager } from "@/components/storyMode/Managers/RotatingMorgensternManager";
import { ForestAtmosphere } from "../effects/ForestAtmosphere";
import { TutorialManager } from "../managers/TutorialManager";
import { PixelRescueLevelMap } from "../../Phaser/map";

const JUMP_LAYER_TILES = [
  169, 170, 139, 140, 200, 224, 225, 226, 227, 51, 52, 82, 83, 84,
];
const TRAMPOLINE_TILES = [158, 159];

const SPIKE_TILES = [253, 254, 284, 283];

export interface IPixelRescueProps {
  level: string;
}

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
  private heartLayer!: Phaser.Tilemaps.TilemapLayer;
  private heartCoins: Phaser.Physics.Arcade.Sprite[] = [];
  private totalheartCoins: number = 0;
  private collectedheartCoins: number = 0;
  private shields: Phaser.Physics.Arcade.Sprite[] = [];
  private hasActiveShield: boolean = false;
  private shieldSprite?: Phaser.GameObjects.Sprite;
  private useTileSpikeChecks: boolean = false;

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
  private timer: number = 90;
  private timerEvent?: Phaser.Time.TimerEvent;
  private gameUpdateCallback?: (data: ICatEvent<GameEvent.GAME_UPDATE>) => void;
  private isNotificationPaused: boolean = false;
  constructor() {
    super("PixelRescueScene");
  }

  preload() {
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile(`pixel-rescue/levels/level-${this.currentLevel}.json`)
    );
    this.load.image(
      "valentine",
      cdnFile(PixelRescueLevelMap[this.currentLevel])
    );
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

    this.load.font("pixel-font", cdnFile("pixel-rescue/fonts/pixel-text2.ttf"));

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

  init(props: IPixelRescueProps) {
    this.props = props;
    this.currentLevel = this.props.level;

    // TutorialManager.resetTutorial();
  }

  create(props: { detail?: IPhaserGameSceneProps }) {
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const sugarTileset = this.tilemap.addTilesetImage(
      "valentine",
      "valentine",
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
    this.events.on(GameEvent.CAT_CARD_DISPLAY, (data: any) => {
      GameEvents.CAT_CARD_DISPLAY.push(data);
    });

    this.groundLayer.setCollisionByExclusion([-1, ...SPIKE_TILES]);

    this.enemiesGroup = this.physics.add.group();
    this.physics.add.collider(this.enemiesGroup, this.groundLayer);
    this.physics.add.collider(this.enemiesGroup, this.platformsLayer);

    this.cratesGroup = this.physics.add.group();

    this.physics.add.collider(this.cratesGroup, this.groundLayer);

    this.platformsLayer.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: any) => {
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

    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM_PIXEL);

    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.setDefaultSound();

    if (props.detail?.cat) {
      this.spawnCat({ detail: { cat: props.detail.cat } });
    }

    if (!props.detail?.isRestart) {
      this.setupEventListeners();
    }

    this.createAnimations();

    Runner.initAnimations(this, RUNNER_TEXTURE_KEY);
    Blocker.initAnimations(this, BLOCKER_TEXTURE_KEY);

    this.createForestAtmosphere();

    this.tutorialManager = new TutorialManager(this, this.currentLevel);

    this.startCountdown();
  }

  setupEventListeners() {
    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const startGameCallback = (data: ICatEvent<GameEvent.GAME_START>) =>
      this.startGame(data!);
    GameEvents.GAME_START.addEventListener(startGameCallback);

    this.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
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

    this.load.once(
      "complete",
      () => {
        if (cat.blessing && cat.tier !== Tier.COMMON) {
          this.blessing = this.add
            .sprite(0, 0, `blessing-${cat.type}`)
            .setVisible(true);

          this.anims.create({
            key: `blessing_animation_${cat.type}`,
            frames: this.anims.generateFrameNumbers(`blessing-${cat.type}`, {
              start: 0,
              end: 59,
            }),
            frameRate: 16,
            repeat: -1,
          });

          this.blessing.play(`blessing_animation_${cat.type}`);
        } else {
          this.blessing = undefined;
        }
        this.createCat(cat.name, this.blessing, cat.type, cat.tier);
        this.createSpikes();
      },
      this
    );
    if (cat.blessing && cat.tier !== Tier.COMMON) {
      this.load.spritesheet(
        `blessing-${cat.type}`,
        cdnFile(`flare-effect/spritesheets/${cat.type}.png`),
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
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null | undefined,
    type: CatAbilityType,
    tier: Tier
  ) {
    this.cat = new Cat(this, -850, -100, catName, blessing!, type, true, tier);

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

    if (!this.tutorialManager?.active) {
      this.time.delayedCall(1000, () => {
        this.tutorialManager?.start(
          this.cat,
          this.catCrate!,
          this.heartCoins,
          this.exitPortalSprite!,
          this.exitPortalX,
          this.exitPortalY
        );
      });
    }

    if (this.tutorialManager?.active) {
      this.cameras.main.startFollow(this.cat.sprite);
    }
  }

  private handleCrateCollision(catSprite: any, crateObject: any) {
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

    if (!this.useTileSpikeChecks) {
      this.spikeManager = new SpikeManager({
        scene: this,
        groundLayer: this.groundLayer!,
        spikeTiles: SPIKE_TILES,
        catSprite: this.cat.sprite!,
        onPlayerHitSpike: () => {
          if (this.hasActiveShield) {
            this.consumeShield();
          } else {
            this.handlePlayerHit();
          }
        },
      });
    }
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

  private openExitPortal() {
    if (this.isExitPortalOpen || !this.exitPortalSprite) return;

    this.isExitPortalOpen = true;
    this.exitPortalSprite.clearTint();
  }

  private startGame(data: ICatEvent<GameEvent.GAME_START>) {
    if (data.detail.isRestart) {
      this.gameEnded = false;

      if (this.timerEvent) {
        this.timerEvent.destroy();
        this.timerEvent = undefined;
      }

      TutorialManager.resetTutorial(this.currentLevel);
      this.scene.restart(data);
      return;
    }
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
    }
    this.startCountdown();
  }

  private startCountdown() {
    if (this.timerEvent) {
      this.timerEvent.destroy();
    }
    if (this.gameUpdateCallback) {
      GameEvents.GAME_UPDATE.removeEventListener(this.gameUpdateCallback);
    }

    this.timer = 90;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.onTimerTick,
      callbackScope: this,
      loop: true,
    });
    GameEvents.GAME_UPDATE.push({ time: this.timer });

    this.gameUpdateCallback = (data: ICatEvent<GameEvent.GAME_UPDATE>) => {
      if (data.detail.additionalTime) {
        this.timer += data.detail.additionalTime;
        GameEvents.GAME_UPDATE.push({ time: this.timer });
      }
    };
    GameEvents.GAME_UPDATE.addEventListener(this.gameUpdateCallback);

    // Clean up on both shutdown and destroy events
    this.events.once("shutdown", () => {
      if (this.gameUpdateCallback) {
        GameEvents.GAME_UPDATE.removeEventListener(this.gameUpdateCallback);
      }
      this.timerEvent?.destroy();
    });

    this.events.once("destroy", () => {
      if (this.gameUpdateCallback) {
        GameEvents.GAME_UPDATE.removeEventListener(this.gameUpdateCallback);
      }
      this.timerEvent?.destroy();
    });
  }

  private onTimerTick() {
    if (this.gameEnded || (this.tutorialManager && this.tutorialManager.active))
      return;

    this.timer--;
    if (this.timer < 0) this.timer = 0;

    GameEvents.GAME_UPDATE.push({ time: this.timer });

    if (this.timer <= 0) {
      this.timer = 0;
      if (this.timerEvent) {
        this.timerEvent.destroy();
      }
      this.endGame();
    }
  }
  update(time: number, delta: number) {
    if (this.gameEnded || this.cat?.isDeath) return;

    if (this.tutorialManager?.active) return;

    if (this.isNotificationPaused) return;

    if (this.cat?.sprite.active) {
      this.cat.update();
    }

    if (this.useTileSpikeChecks && !this.gameEnded) {
      this.checkSpikeTilesOverlap();
    }

    this.spawnCatnipCoins();
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
          if (this.hasActiveShield) {
            this.consumeShield();
          } else {
            this.handlePlayerHit();
          }
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
          if (this.hasActiveShield) {
            this.consumeShield();
          } else {
            this.handlePlayerHit();
          }
        }
      }
    });

    if (this.catCrate && this.catCrate.active) {
      const isColliding = this.physics.overlap(this.cat!.sprite, this.catCrate);

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
              this.physics.pause();

              this.showNotification(
                this.exitPortalX,
                this.exitPortalY - 70,
                "Bring cat here!"
              );

              this.time.delayedCall(2500, () => {
                this.isNotificationPaused = false;
                this.physics.resume();

                if (this.cat) {
                  this.cameras.main.startFollow(
                    this.cat.sprite,
                    true,
                    0.1,
                    0.1
                  );
                }
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

    for (let i = this.heartCoins.length - 1; i >= 0; i--) {
      const coin = this.heartCoins[i];
      if (this.physics.overlap(this.cat!.sprite, coin)) {
        coin.destroy();
        this.heartCoins.splice(i, 1);
        this.collectedheartCoins++;

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

    for (let i = this.shields.length - 1; i >= 0; i--) {
      const shield = this.shields[i];
      if (this.physics.overlap(this.cat!.sprite, shield)) {
        if (this.hasActiveShield) {
          continue;
        }

        shield.destroy();
        this.shields.splice(i, 1);

        this.activateShield();

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

    if (this.hasActiveShield && this.shieldSprite && this.cat) {
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
    this.backgroundSound?.stop();
    this.timerEvent?.destroy();

    GameEvents.GAME_STOP.push({
      score: this.collectedheartCoins,
      time: 0,
      completedLevel: this.currentLevel,
    });

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

  private activateShield() {
    if (this.hasActiveShield) return;

    this.hasActiveShield = true;

    if (this.cat) {
      this.shieldSprite = this.add.sprite(
        this.cat.sprite.x,
        this.cat.sprite.y,
        "shield"
      );
      this.shieldSprite.setSize(32, 32);
      this.shieldSprite.setDepth(100);
      this.shieldSprite.setAlpha(0.5);
      this.shieldSprite.play("shield-active-anim");

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

  public consumeShield(enemy?: BasePixelEnemy): boolean {
    if (!this.hasActiveShield) return false;

    this.hasActiveShield = false;
    if (this.shieldSprite) {
      this.tweens.add({
        targets: this.shieldSprite,
        alpha: 0,
        scale: 1.5,
        duration: 300,
        ease: "Power2",
        onComplete: () => {
          this.shieldSprite?.destroy();
          this.shieldSprite = undefined;
        },
      });

      // Play break sound
      if (this.sound.get("jump")) {
        this.sound.play("jump", { volume: 0.4, rate: 0.5 });
      }

      const puffSprite = this.add.sprite(
        this.shieldSprite.x,
        this.shieldSprite.y,
        "puff"
      );
      puffSprite.setScale(2);
      puffSprite.play("puff");
      puffSprite.on("animationcomplete", () => {
        puffSprite.destroy();
      });
    }

    if (enemy) {
      this.stunAndKnockbackEnemy(enemy);
    }
    //cat invulnerable
    if (this.cat) {
      this.cat.isInvulnerable = true;
      this.time.delayedCall(100, () => {
        if (this.cat) {
          this.cat.isInvulnerable = false;
        }
      });
    }

    return true;
  }

  private stunAndKnockbackEnemy(enemy: BasePixelEnemy) {
    if (!this.cat) return;

    const directionX = enemy.x > this.cat.sprite.x ? 1 : -1;

    enemy.setVelocityX(directionX * 200);
    enemy.setVelocityY(-150);

    (enemy as any).isStunned = true;
    enemy.setTint(0x8888ff);

    const stunText = this.add.text(enemy.x, enemy.y - 50, "STUNNED!", {
      fontSize: "8px",
      fontFamily: "Arial Black, sans-serif",
      color: "#ffff00",
      stroke: "#000000",
      strokeThickness: 3,
      fontStyle: "bold",
    });
    stunText.setOrigin(0.5, 0.5);

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
      (enemy as any).isStunned = false;
      enemy.clearTint();
    });
  }
  private spawnCatnipCoins() {
    if (!this.cat) return;

    const playerX = this.cat.sprite.x;
    const playerY = this.cat.sprite.y;

    this.heartCoins.forEach((coin) => {
      if (!coin.visible) return;
      const distance = Phaser.Math.Distance.Between(
        playerX,
        playerY,
        coin.x,
        coin.y
      );
      if (distance < 32) {
        this.collectedheartCoins++;

        GameEvents.GAME_COIN_CAUGHT.push({
          score: this.collectedheartCoins,
        });
      }
    });
  }

  private showDamageText(x: number, y: number) {
    const hitMessages = ["HIT!", "OUCH!", "BITE!", "AGHW!", "POW!", "SMACK!"];
    const randomMessage = Phaser.Utils.Array.GetRandom(hitMessages);

    const damageText = this.add.text(x, y - 40, randomMessage, {
      fontSize: "7px",
      fontFamily: "Arial Black, sans-serif",
      color: "#ff0000",
      stroke: "#ffffff",
      strokeThickness: 4,
      fontStyle: "bold",
    });

    damageText.setOrigin(0.5, 0.5);

    const randomOffsetX = Phaser.Math.Between(-20, 20);

    this.tweens.add({
      targets: damageText,
      y: damageText.y - 80,
      x: damageText.x + randomOffsetX,
      alpha: 0,
      scale: 1.5,
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
      this.endGame();
    }
  }

  private endGame() {
    if (this.gameEnded) return;
    this.gameEnded = true;
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
      GameEvents.GAME_STOP.push({
        score: this.collectedheartCoins,
        time: 0,
        completedLevel: null,
      });
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
      } catch (e) {}
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
    this.hasActiveShield = false;

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
    const notificationText = this.add.text(x, y, message, {
      fontSize: "14px",
      fontFamily: "Arial Black, sans-serif",
      color: "#ff0000",
      stroke: "#ffffff",
      strokeThickness: 4,
      align: "center",
      fontStyle: "bold",
    });
    notificationText.setOrigin(0.5);
    notificationText.setDepth(20);

    this.tweens.add({
      targets: notificationText,
      y: notificationText.y - 40,
      alpha: 0,
      scale: 1.3,
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
