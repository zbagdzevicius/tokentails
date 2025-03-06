import { GameEvent, GameEvents, ICatEvent } from "@/components/Phaser/events";
import { ZOOM } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { Scene } from "phaser";
import { CatNpc, NPCJobType } from "../objects/Cat";
import { Food } from "../objects/Food";
import { Cat } from "@/components/catbassadors/objects/Catbassador";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { NpcCat } from "@/components/shelter/objects/NpcCat";
import { SpeechBubble } from "@/components/shelter/objects/SpeechBubble";
import { CatType } from "@/models/cats";

const JUMP_LAYER_TILES = [169, 170, 139, 140, 200, 224, 225, 226, 227];

export class BaseScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  npcGroup!: Phaser.Physics.Arcade.Group;
  npcCats: NpcCat[] = [];
  food?: Food | null;
  catSpritesheet?: Phaser.Loader.LoaderPlugin;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  isPlaying: boolean = false;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  blipSound?: Phaser.Sound.BaseSound;
  blessing!: Phaser.GameObjects.Sprite;

  currentlyCollidingNpc: NpcCat | null = null;
  speechBubble?: SpeechBubble;

  private decorationLayer!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: number[] = [74, 44];
  private waterAnimationInterval: number = 350;

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
    this.load.tilemapTiledJSON("tilemap", "catbassadors/base.json");
    this.load.image("new-blocks-winter", "base/winter.png");
    this.load.spritesheet(
      "knockback-spell",
      "abilities/knockback-spell/FIRE.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
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

    this.platformsLayer = this.tilemap.createLayer("platforms", [
      sugarTileset,
    ])!;
    this.platformsLayer.setCollision(JUMP_LAYER_TILES);

    this.decorationLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
    ])!;
    this.decorationLayer.setDepth(10);

    // Collisions
    this.groundLayer?.setCollisionByExclusion([-1]);

    // Adjust camera
    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM);

    this.addSounds();
    this.npcGroup = this.physics.add.group();
    this.events.on(GameEvent.CAT_CARD_DISPLAY, (data: any) => {
      GameEvents.CAT_CARD_DISPLAY.push(data);
    });
    // Listen to relevant events
    const catMeowCallback = () => this.meow();
    GameEvents.CAT_MEOW.addEventListener(catMeowCallback);

    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) => {
      this.spawnCat(data);
    };
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const catSpawnFoodCallback = () => {
      this.spawnFood();
    };
    GameEvents.CAT_EAT.addEventListener(catSpawnFoodCallback);

    const npcSpawnPlayerCats = (data: ICatEvent<GameEvent.PLAYER_CATS>) => {
      this.spawnNpc(data.detail.npc);
    };
    GameEvents.PLAYER_CATS.addEventListener(npcSpawnPlayerCats);

    // Mark scene as ready
    GameEvents.GAME_LOADED.push({ scene: this });

    // Clean up when scene is destroyed
    this.scene.scene.events.once("destroy", () => {
      GameEvents.CAT_MEOW.removeEventListener(catMeowCallback);
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.CAT_EAT.removeEventListener(catSpawnFoodCallback);
      GameEvents.PLAYER_CATS.removeEventListener(npcSpawnPlayerCats);
    });

    // Water animation
    this.setupWaterAnimation();
  }

  private meow() {
    setTimeout(() => {
      try {
        this.sound?.play("meow", { volume: 0.5 });
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

    if (!cat || cat?.name === this.catDto?.name) {
      // Same cat or no cat
      return;
    }

    // If a new cat arrives while an old one is active, reset the scene
    if (this.catDto && this.catDto?.name !== cat?.name) {
      this.scene.restart();
      this.catDto = cat;
      setTimeout(() => {
        if (this.scene) {
          this.spawnCat({ detail: { cat } });
        }
      }, 1000);
      return;
    }

    // Preload cat sprite + blessings
    this.load.once("complete", () => {
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
    if (this.catDto) {
      this.cat = new Cat(
        this,
        0,
        -400,
        this.catDto.name,
        blessing!,
        this.catDto.type
      );
    }

    // Collide cat with ground
    this.physics.add.collider(this.cat!.sprite, this.groundLayer);

    // Camera follows cat
    this.cameras.main.startFollow(this.cat!.sprite);
    this.cameras.main.zoom = ZOOM;

    // By default, disable controls
    if (this.cat) {
      this.cat.enableControls = false;
    }

    // Enable controls if EAT status is 4
    if (this.cat && this.catDto?.status?.EAT === 4) {
      this.cat.enableControls = true;
    }

    // If cat has a blessing, keep it trailing the cat
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
    this.physics.add.overlap(
      this.cat!.sprite,
      this.npcGroup,
      (_player, npcSprite) => {
        const npcName = (npcSprite as Phaser.Physics.Arcade.Sprite).texture.key;
        const npcData = {
          name: npcName,
          spriteImg: "",
          type: "",
        };
        this.handleNpcCollision(npcData as any);
      }
    );
  }

  private setupWaterAnimation() {
    const waterTilePositions: { x: number; y: number }[] = [];
    this.decorationLayer.forEachTile((tile) => {
      if (tile.index === 74) {
        waterTilePositions.push({ x: tile.x, y: tile.y });
      }
    });

    this.time.addEvent({
      delay: this.waterAnimationInterval,
      callback: () => {
        waterTilePositions.forEach((pos) => {
          const currentTile = this.decorationLayer.getTileAt(pos.x, pos.y);
          if (currentTile) {
            const currentIndex = this.waterTiles.indexOf(currentTile.index);
            const nextIndex = (currentIndex + 1) % this.waterTiles.length;
            this.decorationLayer.putTileAt(
              this.waterTiles[nextIndex],
              pos.x,
              pos.y
            );
          }
        });
      },
      loop: true,
    });
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
    // Update player cat
    if (this.cat) {
      this.cat.update();
    }
    this.npcCats.forEach((npc) => {
      if (!npc.sprite.active) return;

      npc.update();
      this.handleNpcInteraction(npc);
    });
  }
  private spawnNpc(npcData: ICat) {
    this.load.once("complete", () => {
      // Randomized X position within the chosen range
      const spawnX = Phaser.Math.Between(-1000, -500);
      const spawnY = -400;

      const npcCat = new NpcCat(this, spawnX, spawnY, npcData.name);
      (npcCat as any).originalData = {
        ...npcData,
      };

      this.physics.add.collider(npcCat.sprite, this.groundLayer);
      this.physics.add.collider(npcCat.sprite, this.platformsLayer);
      //this.physics.add.collider(npcCat.sprite, this.jumperLayer);

      if (npcData.blessings && npcData.blessings.length > 0) {
        const blessingAbility = npcData.blessings[0].ability;
        const blessing = this.add
          .sprite(spawnX, spawnY, `blessing-${blessingAbility}`)
          .setVisible(true);

        this.anims.create({
          key: `npc_blessing_animation_${blessingAbility}`,
          frames: this.anims.generateFrameNumbers(
            `blessing-${blessingAbility}`,
            { start: 0, end: 59 }
          ),
          frameRate: 16,
          repeat: -1,
        });
        blessing.play(`npc_blessing_animation_${blessingAbility}`);

        this.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            if (npcCat.sprite.active) {
              blessing.setPosition(npcCat.sprite.x, npcCat.sprite.y - 5);
            } else {
              blessing.destroy();
            }
          },
        });
      }

      // Add this NPC cat to our local array and group
      this.npcCats.push(npcCat);
      this.npcGroup.add(npcCat.sprite);
    });

    // If the NPC has blessings, load the sprite for that effect
    if (npcData.blessings?.length) {
      this.load.spritesheet(
        `blessing-${npcData.blessings[0].ability}`,
        `flare-effect/spritesheets/${npcData.blessings[0].ability}.png`,
        {
          frameWidth: 64,
          frameHeight: 64,
        }
      );
    }

    // Load the sprite sheet for the cat itself
    this.load.spritesheet(npcData.name, npcData.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.start();
  }

  private showNpcSpeechBubble(npcCat: NpcCat, message: string) {
    console.log(
      `Showing speech bubble for NPC ${npcCat.sprite.texture.key} at (${npcCat.sprite.x}, ${npcCat.sprite.y})`
    );

    // Remove existing bubbles
    this.children.list.forEach((child) => {
      if (child instanceof SpeechBubble) {
        child.destroy();
      }
    });

    const bubbleX = npcCat.sprite.x;
    const bubbleY = npcCat.sprite.y - npcCat.sprite.displayHeight / 2 - 10;

    this.speechBubble = new SpeechBubble(
      this,
      bubbleX,
      bubbleY,
      message,
      npcCat as any
    );
    this.add.existing(this.speechBubble);
  }

  private handleNpcCollision(npc: ICat) {
    GameEvents.NPC_COLLISION.push({ npc });
  }

  private handleNpcInteraction(npc: NpcCat) {
    if (!this.cat) return;
    console.log("Checking NPC interaction");

    const distance = Phaser.Math.Distance.Between(
      this.cat.sprite.x,
      this.cat.sprite.y,
      npc.sprite.x,
      npc.sprite.y
    );

    const isPlayerCat = (npc as any).originalData?.isPlayerCat;

    if (distance < 50 && this.currentlyCollidingNpc === null && !isPlayerCat) {
      this.currentlyCollidingNpc = npc;
      npc.handleLoaf();
      this.showNpcSpeechBubble(
        npc,
        `Hi, I am ${npc.sprite.texture.key}! Want to adopt me?`
      );
    } else if (distance >= 50 && this.currentlyCollidingNpc === npc) {
      npc.handleLoafReset();
      if (this.speechBubble) this.destroySpeechBubble();
      this.currentlyCollidingNpc = null;
    }
  }

  private destroySpeechBubble() {
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = undefined;
    }
  }

  private onFoodEat() {
    this.sound.play("eat", { volume: 0.5, duration: 2 });
    this.food?.eaten(() => {
      this.food?.sprite.destroy();
      this.food = null;
      this.sound.play("purr", { volume: 0.5 });
      GameEvents.CAT_EATEN.push();

      if (this.cat) {
        // Enable cat controls a bit after eating
        this.time.delayedCall(1000, () => {
          this.cat!.enableControls = true;
        });
      }
    });
  }
}
