import { GameEvent, GameEvents, ICatEvent } from "@/components/Phaser/events";
import { ZOOM } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { Scene } from "phaser";
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
  blessing!: Phaser.GameObjects.Sprite;
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
    this.load.tilemapTiledJSON("tilemap", "catbassadors/catbassadors.json");
    this.load.image("new-blocks-winter", "base/winter.png");
  }

  create() {
    this.tilemap = this.make.tilemap({ key: "tilemap" });

    const sugarTileset = this.tilemap.addTilesetImage(
      "new-blocks-winter",
      "new-blocks-winter",
      32,
      32,
      1,
      2
    )!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;

    this.tilemap.createLayer("decorations", [sugarTileset]);

    // Set collision for specific tiles based on property
    this.groundLayer?.setCollisionByExclusion([-1]);
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM);
    this.addSounds();

    const catMeowCallback = () => this.meow();
    GameEvents.CAT_MEOW.addEventListener(catMeowCallback);
    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);
    const catSpawnFoodCallback = () => this.spawnFood();
    GameEvents.CAT_EAT.addEventListener(catSpawnFoodCallback);
    GameEvents.GAME_LOADED.push({ scene: this });
    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_MEOW.removeEventListener(catMeowCallback);
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.CAT_EAT.removeEventListener(catSpawnFoodCallback);
    });
  }

  private meow() {
    setTimeout(() => {
      try {
        this.sound?.play?.("meow", { volume: 0.5 });
      } catch {}
    }, 2000);
  }

  private addSounds() {
    this.blipSound = this.sound.add("blip", { volume: 0.1 });
  }

  spawnCat({ detail: { cat } }: ICatEvent<GameEvent.CAT_SPAWN>) {
    if (this.blessing) {
      this.blessing.setVisible(false);
    }

    const isCatExist = !cat || cat?.name === this.catDto?.name;
    if (isCatExist) {
      return;
    }

    const isCatChanged = this.catDto && this.catDto?.name !== cat?.name;
    if (isCatChanged) {
      this.scene.restart();
      this.catDto = cat;
      setTimeout(() => {
        if (this.scene) {
          this.spawnCat({ detail: { cat: cat } });
        }
      }, 1000);
      return;
    }

    this.load.once(
      "complete",
      () => {
        if (cat.blessings && cat.blessings.length > 0) {
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

        this.createCat(cat.name, this.blessing);
      },
      this
    );

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

    this.catDto = cat;

    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.start();
  }

  private createCat(
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null
  ) {
    this.cat = new Cat(this, 0, -400, catName, blessing!);
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.cameras.main.startFollow(this.cat.sprite);
    this.cameras.main.zoom = ZOOM;

    if (blessing) {
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (this.cat?.sprite.active) {
            blessing.setPosition(this.cat.sprite.x, this.cat.sprite.y - 5);
          } else {
            blessing.destroy();
          }
        },
      });
    }
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
      this.cat?.sprite.setVelocity(0);
      if (this.cat) {
        this.cat.sprite.setVelocity(0, 0);
        this.cat.job = { type: NPCJobType.SLEEP };
        this.cat.setSleep();
      }
      GameEvents.CAT_EATEN.push();
    });
  }
}
