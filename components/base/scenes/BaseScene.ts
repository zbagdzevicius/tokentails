import { setIsGameLoaded } from "@/components/game/events";
import { ZOOM } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { Scene } from "phaser";
import BaseBus from "../BaseBus";
import { BaseBusEvent } from "../BaseBus.events";
import { Cat, NPCJobType } from "../objects/Cat";
import { Food } from "../objects/Food";

export class BaseScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  food?: Food | null;
  catSpritesheet?: Phaser.Loader.LoaderPlugin;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  isPlaying: boolean = false;
  blipSound?:
    | Phaser.Sound.WebAudioSound
    | Phaser.Sound.NoAudioSound
    | Phaser.Sound.HTML5AudioSound;

  constructor() {
    super("BaseScene");
  }

  preload() {
    this.load.spritesheet("bird", "base/bird.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("food", "base/food.png", {
      frameWidth: 32,
      frameHeight: 32,
      margin: 1,
      spacing: 2,
    });
    this.load.image("coin", "logo/coin.webp");
    this.load.audio("blip", "purrquest/sounds/blip.mp3");
    this.load.audio("meow", "purrquest/sounds/meow.mp3");
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.audio("eat", "purrquest/sounds/eat.mp3");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.tilemapTiledJSON("tilemap", "base/base.json");
    this.load.image("blocks", "base/blocks.png");
  }

  create() {
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

    this.tilemap.createLayer("decorations", [sugarTileset]);

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByExclusion([-1]);
    BaseBus.emit("current-scene-ready", this);
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM);
    this.addSounds();

    BaseBus.addListener(BaseBusEvent.SPAWN_CAT, (args: any) =>
      this.spawnCat(args)
    );
    BaseBus.addListener(BaseBusEvent.MEOW, () => {
      setTimeout(() => {
        try {
          this.sound?.play?.("meow", { volume: 0.5 });
        } catch {}
      }, 2000);
    });

    window.addEventListener(BaseBusEvent.SPAWN_EAT, () => this.spawnFood());
    setIsGameLoaded();
  }

  private addSounds() {
    this.blipSound = this.sound.add("blip", { volume: 0.1 });
  }

  async spawnCat(cat: ICat) {
    if (!cat || cat?.name === this.catDto?.name) {
      return;
    }
    this.catDto = cat;
    this.load.once(
      "complete",
      () => {
        this.createCat(cat.name);
      },
      this
    );
    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createCat(catName: string) {
    // Create the player
    this.cat = new Cat(this, 0, -400, catName);
    // Enable collision between player and tilemap layer
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    // Adjust camera to follow the player
    this.cameras.main.startFollow(this.cat.sprite);
    this.cameras.main.zoom = ZOOM;
  }

  spawnFood() {
    if (this.food || !this.cat || !this.physics.add) {
      return;
    }

    this.food = new Food(this, 200, -400);
    this.cat.job = {
      x: this.food.sprite.x,
      type: NPCJobType.RUN,
      callback: () => this.onFoodEat(),
    };
    this.physics.add.collider(this.food.sprite, this.groundLayer);
  }

  update() {
    this.cat?.update();
  }

  private onFoodEat() {
    this.sound.play("eat", { volume: 0.5, duration: 2 });
    this.food?.eaten(() => {
      this.food?.sprite.destroy();
      this.food = null;
      this.sound.play("purr", { volume: 0.5 });

      BaseBus.emit(BaseBusEvent.EATEN);
    });
  }
}
