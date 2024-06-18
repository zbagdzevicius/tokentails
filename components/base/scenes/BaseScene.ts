import { Scene } from "phaser";
import { Food } from "../objects/Food";
import { Cat, NPCJobType } from "../objects/Cat";
import { Toy } from "../objects/Toy";
import BaseBus from "../BaseBus";
import { BaseBusEvent } from "../BaseBus.events";

export class BaseScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat!: Cat;
  toy?: Toy | null;
  food?: Food | null;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  isPlaying: boolean = false;

  constructor() {
    super("DevScene");

    BaseBus.addListener(BaseBusEvent.SPAWN_CAT, () => {});
    BaseBus.addListener(BaseBusEvent.SPAWN_EAT, () => this.spawnFood());
    BaseBus.addListener(BaseBusEvent.SPAWN_PLAY, () => this.spawnPlay());
  }

  preload() {
    this.load.spritesheet("cat", "cats/black/sprites/hat-musketeer-red.png", {
      frameWidth: 48,
      frameHeight: 48,
    });

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
    console.log();
    BaseBus.emit("current-scene-ready");
    this.spawnCat();
  }

  spawnCat() {
    if (this.cat) {
      return;
    }
    // Create the player
    this.cat = new Cat(this, 0, -400);
    // Enable collision between player and tilemap layer
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    // Adjust camera to follow the player
    this.cameras.main.startFollow(this.cat.sprite);
    this.cameras.main.zoom = 1.25;
  }

  spawnFood() {
    if (this.food) {
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
    this.food?.eaten(() => {
      this.food?.sprite.destroy();
      this.food = null;

      BaseBus.emit(BaseBusEvent.EATEN);
    });
  }

  private catchTheToy() {
    if (this.toy) {
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
    }
  }
}
