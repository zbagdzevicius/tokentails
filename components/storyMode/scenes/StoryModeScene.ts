import { Scene } from "phaser";
import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { CatAbilityType, CatType } from "@/models/cats";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { ICat } from "@/models/cats";
import { ZOOM } from "@/constants/utils";
import { IKey } from "../Managers/PlumbDoorManager";
import { MovableBlockManager } from "../Managers/MovableBlockManager";
import { FloatingPlatformManager } from "../Managers/FloatingPlatformManager";
import { RotatingMorgensternTrapManager } from "../Managers/RotatingMorgensternManager";
import { SawHalf } from "../Managers/SawHalfManager";
import { DroppingSpike } from "../Managers/DroppingSpike";
import { HiddenTrap } from "../Managers/HiddenTrap";
import { PlumbDoorManager } from "../Managers/PlumbDoorManager";
import { DestroyableBlockManager } from "../Managers/DestroyableBlockManager";
import { IcyGroundManager } from "../Managers/IcyGroundManager";
import { LeverAndDoorManager } from "../Managers/LeverAndDoorManager";
import { HiddenSpikeManager } from "../Managers/HiddenSpikeManager";
import { FanManager } from "../Managers/FanManager";
import { Saw } from "../Managers/SawManager";
import { RisingWaterManager } from "../Managers/RisingWaterManager";

import { CollectiveItem } from "../objects/CollectiveItem";

import { DogBot } from "../objects/dogBot";
import { StoryModeManagers } from "../Managers/StoryModeManager";
import { FallingColumnManager } from "../Managers/FallingColumnManager";
import { ReverseGravityManager } from "../Managers/ReverseGravityManager";

const JUMP_LAYER_TILES = [47, 48, 49, 50];
const TRAMPOLINE_TILES = [51];
//TODO CHANGE TO ACTUAL VALUES

const ICY_TILES = [3];

export class StoryModeScene extends Scene {
  private managers!: StoryModeManagers;
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  physicsLayer!: Phaser.Tilemaps.TilemapLayer;
  backgroundSound?: Phaser.Sound.BaseSound;
  blessing!: Phaser.GameObjects.Sprite;

  // Game objects and managers
  traps: RotatingMorgensternTrapManager[] = [];
  saws: Array<Saw | SawHalf> = [];
  dropingSpikes: DroppingSpike[] = [];
  hiddenTraps: HiddenTrap[] = [];
  risingWaterManager?: RisingWaterManager;
  hiddenSpikeManager?: HiddenSpikeManager;
  movableBlockManager: MovableBlockManager[] = [];
  floatingPlatformManagers: FloatingPlatformManager[] = [];
  keys: IKey[] = [];
  plumbDoorManagers: PlumbDoorManager[] = [];
  destroyableBlockManagers: DestroyableBlockManager[] = [];
  icyGroundManager?: IcyGroundManager;
  leverAndDoorManagers: LeverAndDoorManager[] = [];
  fans: FanManager[] = [];
  collectiveItem?: CollectiveItem;
  dogBot?: DogBot;
  fallingColumnManagers: FallingColumnManager[] = [];
  reverseGravityManager?: ReverseGravityManager;

  constructor() {
    super("StoryModeScene");
  }

  preload() {
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.image("collective-item", "purrquest/sprites/key.png");
    this.load.tilemapTiledJSON("tilemap", "catbassadors/story.json");
    this.load.image("blocks", "base/blocks-winter.png");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.image("platform", "purrquest2/icons/platform.png");
    this.load.image("movable-block", "purrquest2/icons/platform.png");
    this.load.image("floating-platform", "story/floating-platform.png");
    this.load.image("spiked-ball", "story/spiked-ball.png");
    this.load.image("chain", "story/chain.png");
    this.load.image("spike", "story/spike.png");
    this.load.image("spiked-wall", "story/spiked-wall.png");
    this.load.image("key", "purrquest/sprites/key.png");
    this.load.image("plumb-door", "story/plumb-door.png");
    this.load.image("destroyable-block", "story/destroyable-block.png");
    this.load.image("water", "story/water.png");
    this.load.image("column", "story/column.png");
    this.load.spritesheet("hidden-spike", "story/hidden-spike.png", {
      frameWidth: 31,
      frameHeight: 19,
    });

    this.load.spritesheet("fan", "story/fan.png", {
      frameWidth: 51,
      frameHeight: 23,
    });

    this.load.spritesheet("lever", "story/lever.png", {
      frameWidth: 18,
      frameHeight: 18,
    });

    this.load.spritesheet("portal", "story/portal.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("sawHalf", "story/half-saw.png", {
      frameWidth: 38,
      frameHeight: 21,
    });
    this.load.spritesheet("saw", "story/saw.png", {
      frameWidth: 38,
      frameHeight: 38,
    });

    this.load.spritesheet(
      "knockback-spell",
      "abilities/knockback-spell/FIRE.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
    this.load.spritesheet("dogbot", "story/brown.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.setupTilemap();
    this.setupCamera();
    this.setupSound();
    this.initAnimations();
    this.setupEventListeners(props);

    // Initialize managers
    this.managers = new StoryModeManagers(
      this,
      this.groundLayer,
      this.platformsLayer,
      this.jumperLayer,
      this.physicsLayer
    );

    if (props?.cat) {
      this.spawnCat({ detail: { cat: props.cat } }, props.isRestart);
    }

    // Example of using managers to create game objects
    this.createGameObjects();
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
    this.tilemap.createLayer("decorations", [sugarTileset]);
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;
    this.physicsLayer = this.tilemap.createLayer("physics", [sugarTileset])!;

    this.groundLayer.setCollisionByExclusion([-1]);
    this.platformsLayer.setCollision(JUMP_LAYER_TILES);
    this.jumperLayer.setCollision(TRAMPOLINE_TILES);
  }

  private setupCamera() {
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(1.3);
  }

  private setupSound() {
    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.backgroundSound.play();
  }

  private createGameObjects() {
    this.managers.createHiddenTrapsOnTiles(1, this.hiddenTraps);
    if (this.cat) {
      this.managers.createFallingColumnsOnTiles(
        28,
        this.cat,
        this.fallingColumnManagers
      );
    }

    if (this.cat) {
      this.icyGroundManager = this.managers.createIcyGroundManager(
        ICY_TILES,
        this.cat
      );
      this.managers.setupPlayerAndManagerCollision(
        this.cat,
        this.movableBlockManager,
        this.floatingPlatformManagers,
        this.traps,
        this.saws,
        this.dropingSpikes,
        this.hiddenTraps,
        this.risingWaterManager,
        this.hiddenSpikeManager,
        this.fallingColumnManagers
      );

      this.reverseGravityManager = new ReverseGravityManager({
        scene: this,
        tilemapLayer: this.physicsLayer,
        gravityTiles: [29, 30],
        player: this.cat,
      });
    }
  }

  private createCat(
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
    this.cat = new Cat(this, -950, -1000, catName, blessing!, type);
    this.setupCatCollisions();
    this.cameras.main.startFollow(this.cat.sprite);
    setMobileControls(this.cat);

    // Create game objects that depend on cat
    this.createGameObjects();
  }

  private setupCatCollisions() {
    if (!this.cat) return;

    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(this.cat.sprite, this.platformsLayer);
    this.physics.add.collider(this.cat.sprite, this.jumperLayer);
  }

  update(time: number, delta: number) {
    if (this.cat) {
      this.cat.update();
      this.icyGroundManager?.checkIcyGround();

      this.dropingSpikes.forEach((spike) => {
        spike.checkPlayerUnder(
          this.cat!.sprite as Phaser.Physics.Arcade.Sprite
        );
      });
    }

    this.dogBot?.update();
    this.traps.forEach((trap) => trap.update());
    this.saws.forEach((saw) => saw.update(delta));
    this.hiddenTraps.forEach((hiddenTrap) => hiddenTrap.update());
    this.hiddenSpikeManager?.update();
    this.collectiveItem?.update();
  }

  endGame() {
    this.cleanupSound();
    this.destroyGameObjects();
    this.cleanupScene();
  }

  private cleanupSound() {
    if (this.backgroundSound) {
      this.backgroundSound.stop();
      this.backgroundSound.destroy();
      this.backgroundSound = undefined;
    }
  }

  private destroyGameObjects() {
    this.cat?.sprite.destroy();
    this.dogBot?.sprite.destroy();
    this.movableBlockManager.forEach((m) => m.destroy());
    this.floatingPlatformManagers.forEach((m) => m.destroy());
    this.traps.forEach((t) => t.destroy());
    this.saws.forEach((s) => s.destroy());
    this.dropingSpikes.forEach((s) => s.destroy());
    this.hiddenTraps.forEach((t) => t.destroy());
    this.plumbDoorManagers.forEach((m) => m.destroy());
    this.destroyableBlockManagers.forEach((m) => m.destroy());
    this.leverAndDoorManagers.forEach((m) => m.destroy());
    this.fans.forEach((m) => m.destroy());
    this.hiddenSpikeManager?.destroy();
    this.icyGroundManager?.destroy();
    this.risingWaterManager?.destroy();
    this.collectiveItem?.destroy();
    this.fallingColumnManagers.forEach((m) => m.destroy());
    this.reverseGravityManager?.destroy();

    // Reset all arrays and references
    this.resetGameObjects();
  }

  private resetGameObjects() {
    this.cat = undefined;
    this.dogBot = undefined;
    this.movableBlockManager = [];
    this.floatingPlatformManagers = [];
    this.traps = [];
    this.saws = [];
    this.dropingSpikes = [];
    this.hiddenTraps = [];
    this.plumbDoorManagers = [];
    this.destroyableBlockManagers = [];
    this.leverAndDoorManagers = [];
    this.fans = [];
    this.keys = [];
    this.hiddenSpikeManager = undefined;
    this.icyGroundManager = undefined;
    this.risingWaterManager = undefined;
    this.collectiveItem = undefined;
    this.fallingColumnManagers = [];
    this.reverseGravityManager = undefined;
  }

  private cleanupScene() {
    this.physics.world.shutdown();
    this.scene.stop();
    this.scene.remove();
  }

  setupEventListeners(props: IPhaserGameSceneProps) {
    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const startGameCallback = () => this.startGame();
    GameEvents.GAME_START.addEventListener(startGameCallback);

    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
    });

    GameEvents.GAME_LOADED.push({ scene: this });
  }

  getKeys() {
    return this.keys;
  }

  initAnimations() {
    this.anims.create({
      key: "sawHalf-anim",
      frames: this.anims.generateFrameNumbers("sawHalf", { start: 0, end: 7 }),
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
      key: "lever-anim",
      frames: this.anims.generateFrameNumbers("lever", { start: 0, end: 2 }),
      frameRate: 8,
      repeat: 0,
    });
    this.anims.create({
      key: "fan-anim",
      frames: this.anims.generateFrameNumbers("fan", { start: 0, end: 55 }),
      frameRate: 12,
      repeat: -1,
    });
  }
  async spawnCat(
    { detail: { cat } }: ICatEvent<GameEvent.CAT_SPAWN>,
    isRestart?: boolean
  ) {
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

    this.load.once("complete", () => {
      if (cat.blessings?.length) {
        this.blessing = this.add
          .sprite(0, 0, `blessing-${cat.blessings[0].ability}`)
          .setVisible(true);

        this.anims.create({
          key: `blessing_animation_${cat.blessings[0].ability}`,
          frames: this.anims.generateFrameNumbers(
            `blessing-${cat.blessings[0].ability}`,
            { start: 0, end: 59 }
          ),
          frameRate: 16,
          repeat: -1,
        });

        this.blessing.play(`blessing_animation_${cat.blessings[0].ability}`);
      }

      this.createCat(cat.name, this.blessing, cat.type);
    });

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
  private createDogBot() {
    this.dogBot = new DogBot(this, -800, -1000, "dogbot");

    this.physics.add.collider(this.dogBot.sprite, this.groundLayer);
    this.physics.add.collider(this.dogBot.sprite, this.platformsLayer);
    this.physics.add.collider(this.dogBot.sprite, this.jumperLayer);

    if (this.cat?.sprite) {
      this.physics.add.collider(this.cat.sprite, this.dogBot.sprite);
      this.dogBot.setTarget(this.cat.sprite);
    }
  }

  private startGame() {
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
      setMobileControls(this.cat);
    }
  }
}
