import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
  NPC_TYPE,
} from "@/components/Phaser/events";
import { CoreMap } from "@/components/Phaser/map";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { cdnFile, ZOOM } from "@/constants/utils";
import { CatAbilityType, ICat } from "@/models/cats";
import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { Elevator } from "../objects/Elevator";
import { NpcCat } from "../objects/NpcCat";
import { SpeechBubble } from "../objects/SpeechBubble";
import { getMultiplier } from "@/constants/cat-utils";

const JUMP_LAYER_TILES = [
  169, 170, 139, 140, 200, 224, 225, 226, 227, 51, 52, 82, 83, 84,
];
const TRAMPOLINE_TILES = [158, 159];

const SPAWN_POSITIONS: Record<
  NPC_TYPE,
  { x: { min: number; max: number }; y: number }
> = {
  [NPC_TYPE.ROZINE_PEDUTE]: {
    x: { min: 1500, max: 2800 },
    y: -650,
  },
  [NPC_TYPE.TOKENTAILS]: {
    x: { min: 1700, max: 2800 },
    y: -200,
  },
  [NPC_TYPE.TOKENTAILS_2]: {
    x: { min: 600, max: 1200 },
    y: -250,
  },
  [NPC_TYPE.PLAYER_CATS]: {
    x: { min: 600, max: 1200 },
    y: -250,
  },
};

export class ShelterScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer;
  platformsLayer!: Phaser.Tilemaps.TilemapLayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer;
  backgroundSound?: Phaser.Sound.BaseSound;
  trampoline?: Trampoline;
  npcGroup!: Phaser.Physics.Arcade.Group;
  npcCats: NpcCat[] = [];
  blessing!: Phaser.GameObjects.Sprite;
  currentlyCollidingNpc: NpcCat | null = null;
  speechBubble: any;
  speechBubblePool: SpeechBubble[] = [];
  private elevator!: Elevator;
  private elevatorTimer: number = 0;
  private readonly ELEVATOR_DELAY: number = 1000;
  private decorationLayer!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: number[] = [74, 44];
  private waterAnimationInterval: number = 350;

  constructor() {
    super("ShelterScene");
  }

  preload() {
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile("catbassadors/new-shelter.json")
    );
    this.load.image("new-blocks-winter", cdnFile(CoreMap));
    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.audio("jump-sound", cdnFile("audio/game/jump.mp3"));
    this.load.audio("dash-sound", cdnFile("audio/game/dash.wav"));
    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));
    this.load.spritesheet("jump-wall", cdnFile("game/effects/jump.png"), {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "knockback-spell",
      cdnFile("abilities/knockback-spell/FIRE.png"),
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );

    this.load.spritesheet("star-effect", cdnFile("shelter/stars.png"), {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.image("shelter-logo", cdnFile("shelter/logo.png"));
    this.load.image("shelter-signs", cdnFile("shelter/signs.png"));
    this.load.image(
      "elevator",
      cdnFile("purrquest/icons/platform-movable.png")
    );
  }

  create(props: IPhaserGameSceneProps) {
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const sugarTileset = this.tilemap.addTilesetImage(
      "new-blocks-winter",
      "new-blocks-winter",
      32,
      32,
      1,
      2
    )!;
    const logoTileset = this.tilemap.addTilesetImage("logo", "shelter-logo")!;
    const signsTileset = this.tilemap.addTilesetImage(
      "signs",
      "shelter-signs"
    )!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;
    this.platformsLayer = this.tilemap.createLayer("platforms", [
      sugarTileset,
      logoTileset,
      signsTileset,
    ])!;
    this.decorationLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
      logoTileset,
      signsTileset,
    ])!;

    this.decorationLayer.setDepth(10);

    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;
    this.events.on(GameEvent.CAT_CARD_DISPLAY, (data: any) => {
      GameEvents.CAT_CARD_DISPLAY.push(data);
    });

    this.groundLayer.setCollisionByExclusion([-1]);
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

    this.jumperLayer.setCollision(TRAMPOLINE_TILES);
    this.trampoline = new Trampoline(this, this.jumperLayer, TRAMPOLINE_TILES);

    this.cameras.main.setScroll(-650, -1000);
    this.cameras.main.setZoom(ZOOM);

    this.backgroundSound = this.sound.add("purr", { loop: true });
    this.setDefaultSound();

    if (props?.cat) {
      this.spawnCat({ detail: { cat: props.cat } }, props.isRestart);
    }
    this.npcGroup = this.physics.add.group();

    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) =>
      this.spawnCat(data!);
    GameEvents.CAT_SPAWN.addEventListener(catSpawnCallback);

    const startGameCallback = () => {
      if (this) {
        this.startGame();
      } else {
        GameEvents.GAME_START.removeEventListener(startGameCallback);
      }
    };
    GameEvents.GAME_START.addEventListener(startGameCallback);
    GameEvents.GAME_LOADED.push({ scene: this });

    this.scene.scene.events.once("destroy", () => {
      GameEvents.GAME_START.removeEventListener(startGameCallback);
    });

    const npcSpawnRegularCallback = (data: ICatEvent<GameEvent.NPC_SPAWN>) => {
      this.spawnNpc(data.detail.npc, data.detail.type);
    };

    GameEvents.NPC_SPAWN.addEventListener(npcSpawnRegularCallback);

    GameEvents.GAME_LOADED.push({ scene: this });

    this.scene.scene.events.once("destroy", () => {
      GameEvents.NPC_SPAWN.removeEventListener(npcSpawnRegularCallback);
    });

    this.createAnimations();

    // Set platform layer depth to ensure it's above other elements
    this.platformsLayer.setDepth(1);

    const starEffect = this.add.sprite(1360, -220, "star-effect");
    starEffect.play("star_effect_anim");

    const starEffectExtar = this.add.sprite(1420, -220, "star-effect");
    starEffectExtar.play("star_effect_anim");
    starEffectExtar.setDepth(0);
    starEffect.setDepth(0);

    this.elevator = new Elevator(this, 650, -50, this.groundLayer);

    if (this.cat) {
      this.physics.add.collider(
        this.cat.sprite,
        this.elevator.sprite,
        this.handleElevatorCollision,
        undefined,
        this
      );
    }

    this.setupWaterAnimation();
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
      key: "star_effect_anim",
      frames: this.anims.generateFrameNumbers("star-effect", {
        start: 0,
        end: 6,
      }),
      frameRate: 10,
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
    if (isCatExist && !isRestart) {
      return;
    }

    const isCatChanged = this.catDto && this.catDto?.name !== cat?.name;
    if (isCatChanged) {
      this.cat = undefined;
      this.catDto = cat;
      // this.scene.restart({ cat, isRestart: true });
      return;
    }

    this.catDto = cat;

    this.load.once(
      "complete",
      () => {
        if (cat.blessing) {
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
        }

        this.createCat(cat.name, this.blessing, cat.type);
      },
      this
    );

    if (cat.blessing) {
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

  private spawnNpc(npcData: ICat, type: NPC_TYPE) {
    this.load.once("complete", () => {
      let spawnPosition;

      if (type === NPC_TYPE.ROZINE_PEDUTE) {
        spawnPosition = SPAWN_POSITIONS[NPC_TYPE.ROZINE_PEDUTE];
      } else if (type === NPC_TYPE.TOKENTAILS) {
        spawnPosition = SPAWN_POSITIONS[NPC_TYPE.TOKENTAILS];
      } else {
        spawnPosition = SPAWN_POSITIONS[NPC_TYPE.TOKENTAILS_2];
      }

      // Randomized X position within the chosen range
      const spawnX = Phaser.Math.Between(
        spawnPosition!.x.min,
        spawnPosition!.x.max
      );
      const spawnY = spawnPosition!.y;

      const npcCat = new NpcCat(this, spawnX, spawnY, npcData.name);
      (npcCat as any).originalData = {
        ...npcData,
      };

      this.physics.add.collider(npcCat.sprite, this.groundLayer);
      this.physics.add.collider(npcCat.sprite, this.platformsLayer);
      this.physics.add.collider(npcCat.sprite, this.jumperLayer);

      if (npcData.blessing) {
        const blessingAbility = npcData.type;
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
    if (npcData.blessing) {
      this.load.spritesheet(
        `blessing-${npcData.type}`,
        cdnFile(`flare-effect/spritesheets/${npcData.type}.png`),
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
    this.children.list.forEach((child) => {
      if (child instanceof SpeechBubble) {
        child.destroy();
      }
    });

    const bubbleX = npcCat.sprite.x + 16;
    const bubbleY = npcCat.sprite.y - 42;
    this.speechBubble = new SpeechBubble(
      this,
      bubbleX,
      bubbleY,
      message,
      npcCat as any,
      "ADOPT",
      false
    );
    this.add.existing(this.speechBubble);
  }

  private destroySpeechBubble() {
    this.speechBubble.destroy();
  }

  private handleNpcCollision(npc: ICat) {
    GameEvents.NPC_COLLISION.push({ npc });
  }

  private handleNpcInteraction(npc: NpcCat) {
    if (!this.cat) return;

    const isOverlapping = this.physics.overlap(this.cat.sprite, npc.sprite);
    const isPlayerCat = (npc as any).originalData?.isPlayerCat;
    if (isOverlapping && !isPlayerCat) {
      if (this.currentlyCollidingNpc === null) {
        this.currentlyCollidingNpc = npc;
        npc.handleLoaf();
        this.showNpcSpeechBubble(
          npc,
          `Hi, I am ${npc.sprite.texture.key}! Want to adopt me?`
        );
      }
    } else if (!isOverlapping && this.currentlyCollidingNpc === npc) {
      npc.handleLoafReset();
      if (this.speechBubble) {
        this.destroySpeechBubble();
      }
      this.currentlyCollidingNpc = null;
    }
  }

  private createCat(
    catName: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
    this.cat = new Cat(
      this,
      350,
      -100,
      catName,
      blessing!,
      type,
      true,
      getMultiplier(this.catDto)
    );
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(
      this.cat.sprite as Phaser.Physics.Arcade.Sprite,
      this.platformsLayer
    );
    this.physics.add.collider(this.cat.sprite, this.jumperLayer);
    this.cameras.main.startFollow(this.cat.sprite);

    setMobileControls(this.cat);

    this.physics.add.overlap(
      this.cat.sprite,
      this.npcGroup,
      (_player, npcSprite) => {
        const npcName = (npcSprite as Phaser.Physics.Arcade.Sprite).texture.key;
        const npcData = { name: npcName, spriteImg: "" };
        this.handleNpcCollision(npcData as any);
      }
    );
  }

  private startGame() {
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
      setMobileControls(this.cat);
    }
  }

  private handleElevatorCollision(playerSprite: any, elevatorSprite: any) {
    if (
      playerSprite.body.touching.down &&
      elevatorSprite.body.touching.up &&
      playerSprite.y < elevatorSprite.y
    ) {
      this.elevator.setPlayerOn(true);
    }
  }

  update(time: number, delta: number) {
    // Only update if cat exists and is within bounds
    if (this.cat?.sprite.active) {
      this.cat.update();
    }
    const activeNpcs = this.npcCats.filter((npc) => npc.sprite.active);

    activeNpcs.forEach((npc) => {
      npc.update();

      // Check interaction only if NPC is near the player
      if (
        this.cat &&
        Phaser.Math.Distance.Between(
          this.cat.sprite.x,
          this.cat.sprite.y,
          npc.sprite.x,
          npc.sprite.y
        ) < 100
      ) {
        // Adjust distance threshold as needed
        this.handleNpcInteraction(npc);
      }
    });

    this.elevator.update(delta);

    // Check if player is no longer colliding with elevator
    if (
      this.cat &&
      !this.physics.overlap(this.cat.sprite, this.elevator.sprite)
    ) {
      this.elevatorTimer += delta;
      if (this.elevatorTimer >= this.ELEVATOR_DELAY) {
        this.elevator.setPlayerOn(false);
      }
    } else {
      this.elevatorTimer = 0;
    }

    if (
      this.cat &&
      !this.physics.world.colliders
        .getActive()
        .some((collider) => collider.object2 === this.elevator.sprite)
    ) {
      this.physics.add.collider(
        this.cat.sprite,
        this.elevator.sprite,
        this.handleElevatorCollision,
        undefined,
        this
      );
    }
  }

  private setDefaultSound() {
    this.backgroundSound?.play();
  }

  private setupWaterAnimation() {
    const waterTilePositions: { x: number; y: number }[] = [];
    this.decorationLayer.forEachTile((tile) => {
      if (this.waterTiles.includes(tile.index)) {
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

  removeNpc(npc: NpcCat) {
    const index = this.npcCats.indexOf(npc);
    if (index > -1) {
      npc.destroy();
      this.npcCats.splice(index, 1);
    }
  }
}
