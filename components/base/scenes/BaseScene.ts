import { Scene } from "phaser";
import { Food } from "../objects/Food";
import { Cat, NPCJobType } from "../objects/Cat";
import { Toy } from "../objects/Toy";
import BaseBus from "../BaseBus";
import { BaseBusEvent } from "../BaseBus.events";
import { IProfileCat } from "@/models/cats";
import { ZOOM } from "@/constants/utils";

export class BaseScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  toy?: Toy | null;
  food?: Food | null;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  isPlaying: boolean = false;
  blipSound?:
    | Phaser.Sound.WebAudioSound
    | Phaser.Sound.NoAudioSound
    | Phaser.Sound.HTML5AudioSound;

  constructor() {
    super("DevScene");

    BaseBus.addListener(BaseBusEvent.SPAWN_CAT, (args: any) =>
      this.spawnCat(args)
    );
    BaseBus.addListener(BaseBusEvent.SPAWN_EAT, () => this.spawnFood());
    BaseBus.addListener(BaseBusEvent.SPAWN_PLAY, () => this.spawnPlay());
    BaseBus.addListener(BaseBusEvent.MEOW, () =>
      this.sound.play("meow", { volume: 0.5 })
    );
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
    this.load.image("coin", "purrquest/sprites/coin.webp");
    this.load.audio("blip", "purrquest/sounds/blip.mp3");
    this.load.audio("meow", "purrquest/sounds/meow.mp3");
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.audio("eat", "purrquest/sounds/eat.mp3");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.tilemapTiledJSON("tilemap", "base/base.json");
    this.load.image("blocks", "base/blocks.png");
    this.load.image("bg", "base/bg.svg");
    this.load.image("platforms", "base/pirate/platforms.png");
    this.load.image("walls", "base/pirate/walls.png");
    this.load.image("decorations", "base/pigs/decorations.png");
    this.load.image("grass", "base/outer-bg/grass.png");
    this.load.image("clouds", "base/outer-bg/clouds.png");
    this.load.image("rock", "base/outer-bg/rock.png");
    this.load.image("sky", "base/outer-bg/sky.png");
  }

  create() {
    this.add.image(0, -600, "bg").setDisplaySize(2200, 1600);

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
    BaseBus.emit("current-scene-ready");
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM);
    this.addSounds();
  }

  private addSounds() {
    this.blipSound = this.sound.add("blip", { volume: 0.1 });
  }

  async spawnCat(cat: IProfileCat) {
    if (this.cat || !cat) {
      return;
    }
    this.load.on("complete", () => this.createCat(), this);
    this.load.spritesheet("cat", cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.start();
  }

  private createCat() {
    // Create the player
    this.cat = new Cat(this, 0, -400);
    // Enable collision between player and tilemap layer
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    // Adjust camera to follow the player
    this.cameras.main.startFollow(this.cat.sprite);
    this.cameras.main.zoom = ZOOM;
  }

  spawnFood() {
    if (this.food || !this.cat) {
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

  spawnPlay() {
    if (!this.cat) {
      return;
    }
    if (this.toy) {
      this.toy.sprite.destroy();
      this.toy = null;
    }
    this.toy = new Toy(this, 0, -450);
    this.physics.add.collider(this.toy.sprite, this.groundLayer);
    this.physics.add.collider(this.cat.sprite, this.toy.sprite, () =>
      this.onCatCatchTheToy()
    );
    this.isPlaying = true;
  }

  update() {
    this.cat?.update();
    this.toy?.update();
    if (this.isPlaying) {
      this.catchTheToy();
    }
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

  private catchTheToy() {
    if (this.toy && this.cat) {
      const distance = this.getDistance(this.cat.sprite, this.toy.sprite);
      this.cat.setJump(distance < 80);
    }
  }

  private getDistance(
    obj1: Phaser.Physics.Arcade.Sprite,
    obj2: Phaser.Physics.Arcade.Sprite
  ) {
    return Math.abs(obj1.x - obj2.x);
  }

  private onCatCatchTheToy() {
    if (this.toy) {
      this.toy.bounce();
      BaseBus.emit(BaseBusEvent.PLAYED);

      if (!this.blipSound?.isPlaying) {
        this.blipSound?.play();
      }
    }
  }
}
