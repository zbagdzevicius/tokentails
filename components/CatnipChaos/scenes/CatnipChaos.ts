import { Scene } from "phaser";
import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { CatAbilityType, CatType } from "@/models/cats";
import { setMobileJumpControl } from "@/components/Phaser/MobileButtons/MobileControls";
import { ICat } from "@/models/cats";
import { ZOOM } from "@/constants/utils";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";

import { CollectiveItem } from "@/components/storyMode/objects/CollectiveItem";

import { CoreMap } from "@/components/Phaser/map";

import { DogBot } from "@/components/storyMode/objects/dogBot";

import { FloatingPlatformManager } from "@/components/storyMode/Managers/FloatingPlatformManager";
import {
  HiddenSpikeManager,
  IHiddenSpikeConfig,
} from "@/components/storyMode/Managers/HiddenSpikeManager";

import {
  SpikeManager,
  ISpikeManagerConfig,
} from "@/components/purrquest/managers/SpikeManager";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];
const TRAMPOLINE_TILES = [158, 159, 160];

const FLOATING_PLATFORM_TILES = [9];

const SPIKE_TILES = [253, 254, 284, 283];

export class CatnipChaosScene extends Scene {
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
  trampoline?: Trampoline;

  spikeManager!: SpikeManager;
  collectiveItem?: CollectiveItem;

  autoRunSpeed: number = 275;
  autoJumpSpeed: number = 440;
  isAutoRunMode: boolean = true;

  private isGravityReversed: boolean = false;
  private dogs: DogBot[] = [];
  private floatingPlatformManagers: FloatingPlatformManager[] = [];
  private hiddenSpikeManagers: HiddenSpikeManager[] = [];

  constructor() {
    super("CatnipChaosScene");
  }

  preload() {
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.image("collective-item", "purrquest/sprites/key.png");
    this.load.tilemapTiledJSON(
      "tilemap",
      "catnip-chaos/levels/level-three.json"
    );
    this.load.image("blocks", CoreMap);
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.image("platform", "purrquest/icons/platform.png");
    this.load.spritesheet("hidden-spike", "story/hidden-spike.png", {
      frameWidth: 31,
      frameHeight: 19,
    });
    this.load.image("floating-platform", "story/floating-platform.png");
    this.load.spritesheet("jump", "jumper/jump.png", {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.spritesheet("dog", "runner/brown.png", {
      frameWidth: 48,
      frameHeight: 48,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.initAnimations();
    this.setupTilemap();
    this.setupCamera();
    this.setupSound();
    this.setupEventListeners(props);

    if (props?.cat) {
      this.spawnCat({ detail: { cat: props.cat } }, props.isRestart);
    }

    this.createGameObjects();
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
    this.tilemap.createLayer("decorations", [sugarTileset]);
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;
    this.physicsLayer = this.tilemap.createLayer("physics", [sugarTileset])!;

    this.jumperLayer?.setCollision(TRAMPOLINE_TILES);

    this.trampoline = new Trampoline(this, this.jumperLayer, TRAMPOLINE_TILES);

    this.groundLayer.setCollisionByExclusion([-1, ...SPIKE_TILES]);
    this.platformsLayer.setCollision(JUMP_LAYER_TILES);

    this.createDogsOnTiles(22);

    this.createFloatingPlatforms();

    this.createHiddenSpikes();

    this.physicsLayer.setCollision([162, 192]);
  }

  private setupCamera() {
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(1.3);
  }

  private setupSound() {
    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.backgroundSound.play();
  }

  private createGameObjects() {}

  private createCat(
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
    this.cat = new Cat(this, -950, -900, catName, blessing!, type);
    setMobileJumpControl(this.cat);
    this.setupCatCollisions();
    this.cameras.main.startFollow(this.cat.sprite);

    // Set custom gravity settings for runner mode
    this.cat.movement.setGravitySettings({
      baseGravity: 700,
      fallingGravity: 2000,
      reversedBaseGravity: -2000,
      reversedFallingGravity: -3000,
    });

    // Enable auto-run mode with specified speed
    this.cat.setAutoRunMode(this.autoRunSpeed, this.autoJumpSpeed);

    this.physics.add.collider(this.cat.sprite, this.jumperLayer);

    this.createHiddenSpikes();

    this.createSpikes();

    this.createGameObjects();
  }

  private setupCatCollisions() {
    if (!this.cat) return;

    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(this.cat.sprite, this.platformsLayer);
    this.physics.add.collider(this.cat.sprite, this.jumperLayer);

    this.floatingPlatformManagers.forEach((manager) => {
      manager.setupPlayerCollision(this.cat!.sprite);
    });

    this.dogs.forEach((dog) => {
      this.physics.add.collider(this.cat!.sprite, dog.sprite, () => {
        this.endGame();
      });
    });

    this.physics.add.collider(this.cat.sprite, this.physicsLayer, () => {
      const tile = this.physicsLayer.getTileAtWorldXY(
        this.cat!.sprite.x,
        this.cat!.sprite.y
      );
      if (tile && (tile.index === 162 || tile.index === 192)) {
        // end game when collides with flag
        GameEvents.GAME_STOP.push({ score: 0, time: 0 });
        this.endGame();
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

        const dog = new DogBot(this, worldX, worldY, "dog");
        this.dogs.push(dog);

        this.physics.add.collider(dog.sprite, this.groundLayer);
        this.physics.add.collider(dog.sprite, this.platformsLayer);
      }
    });
  }

  private createFloatingPlatforms() {
    this.physicsLayer.forEachTile((tile) => {
      if (FLOATING_PLATFORM_TILES.includes(tile.index)) {
        const worldX = this.physicsLayer.tileToWorldX(tile.x);
        const worldY = this.physicsLayer.tileToWorldY(tile.y);

        const platformManager = new FloatingPlatformManager({
          scene: this,
          groundLayer: this.groundLayer,
          platformsLayer: this.platformsLayer,
          x: worldX,
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
      onPlayerHitSpike: () => this.endGame(),
      gameType: "runner",
    });
  }

  private createHiddenSpikes() {
    if (!this.cat) return;

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === 23) {
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

  update(time: number, delta: number) {
    if (this.cat) {
      this.cat.update();
      this.processGravityTiles();

      this.dogs.forEach((dog) => {
        dog.update();
      });

      this.hiddenSpikeManagers.forEach((manager) => {
        manager.update();
      });
    }
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

  private startGame() {
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
    }
  }
}
