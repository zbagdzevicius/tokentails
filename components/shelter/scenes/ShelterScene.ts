import { Scene } from "phaser";
import {
  GameEvent,
  GameEvents,
  ICatEvent,
  IPhaserGameSceneProps,
} from "@/components/Phaser/events";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { NpcCat } from "../objects/NpcCat";
import { CatAbilityType, CatType } from "@/models/cats";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { ICat } from "@/models/cats";
import { ZOOM } from "@/constants/utils";
import { SpeechBubble } from "../objects/SpeechBubble";
import { Elevator } from "../objects/Elevator";
import { IS_MOBILE } from "@/constants/utils";

const JUMP_LAYER_TILES = [
  169, 170, 139, 140, 200, 224, 225, 226, 227, 51, 52, 82, 83, 84,
];
const TRAMPOLINE_TILES = [158, 159];

const PLAYER_NPC_CATS_POSITIONS = {
  PLAYER_CATS: {
    x: { min: -900, max: -300 },
    y: -230,
  },
};

enum Shelters {
  ROZINE_PEDUTE = "rozine-pedute",
  TOKENTAILS = "tokentails",
}

enum Tileset {
  NEW_BLOCKS_WINTER = "new-blocks-winter",
}

const SHELTER_SPAWN_POSITIONS = {
  [Shelters.ROZINE_PEDUTE]: {
    x: { min: 1500, max: 2800 },
    y: -650,
  },
  [Shelters.TOKENTAILS]: {
    x: { min: 1700, max: 2800 },
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
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.tilemapTiledJSON("tilemap", "catbassadors/new-shelter.json");
    this.load.image("new-blocks-winter", "base/winter.png");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");
    this.load.audio("jump-sound", "audio/game/jump.mp3");
    this.load.audio("dash-sound", "audio/game/dash.wav");
    this.load.spritesheet("jump-wall", "game/effects/jump.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "knockback-spell",
      "abilities/knockback-spell/FIRE.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );

    this.load.spritesheet("star-effect", "shelter/stars.png", {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.image("shelter-logo", "shelter/logo.png");
    this.load.image("shelter-signs", "shelter/signs.png");
    this.load.image("elevator", "purrquest2/icons/platform-movable.png");
  }

  create(props: IPhaserGameSceneProps) {
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const sugarTileset = this.tilemap.addTilesetImage(
      Tileset.NEW_BLOCKS_WINTER,
      Tileset.NEW_BLOCKS_WINTER,
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

    const npcSpawnRegularCallback = (
      data: ICatEvent<GameEvent.NPC_SPAWN_TOKENTAILS>
    ) => {
      this.spawnNpc(data.detail.npc, false);
    };

    const npcSpawnBlessedCallback = (
      data: ICatEvent<GameEvent.NPC_SPAWN_ROZINE_PEDUTE>
    ) => {
      this.spawnNpc(data.detail.npc, false);
    };

    const npcSpawnExclusiveCallback = (
      data: ICatEvent<GameEvent.NPC_SPAWN_EXCLUSIVE>
    ) => {
      this.spawnNpc(data.detail.npc, false);
    };

    const npcSpawnPlayerCats = (data: ICatEvent<GameEvent.PLAYER_CATS>) => {
      this.spawnNpc(data.detail.npc, true);
    };

    GameEvents.PLAYER_CATS.addEventListener(npcSpawnPlayerCats);

    GameEvents.NPC_SPAWN_TOKENTAILS.addEventListener(npcSpawnRegularCallback);
    GameEvents.NPC_SPAWN_ROZINE_PEDUTE.addEventListener(
      npcSpawnBlessedCallback
    );
    GameEvents.NPC_SPAWN_EXCLUSIVE.addEventListener(npcSpawnExclusiveCallback);
    GameEvents.PLAYER_CATS.addEventListener(npcSpawnPlayerCats);

    GameEvents.GAME_LOADED.push({ scene: this });

    this.scene.scene.events.once("destroy", () => {
      GameEvents.NPC_SPAWN_TOKENTAILS.removeEventListener(
        npcSpawnRegularCallback
      );
      GameEvents.NPC_SPAWN_ROZINE_PEDUTE.removeEventListener(
        npcSpawnBlessedCallback
      );
      GameEvents.NPC_SPAWN_EXCLUSIVE.removeEventListener(
        npcSpawnExclusiveCallback
      );
      GameEvents.PLAYER_CATS.removeEventListener(npcSpawnPlayerCats);
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

        this.createCat(cat.name, this.blessing, cat.type);
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

    this.load.spritesheet(cat.name, cat.spriteImg, {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.start();
  }

  private spawnNpc(npcData: ICat, isPlayerCat: boolean = false) {
    this.load.once("complete", () => {
      let spawnPosition;
      if (isPlayerCat) {
        spawnPosition = PLAYER_NPC_CATS_POSITIONS.PLAYER_CATS;
      } else {
        switch (npcData.shelter?.slug) {
          case Shelters.ROZINE_PEDUTE:
            spawnPosition = SHELTER_SPAWN_POSITIONS[Shelters.ROZINE_PEDUTE];
            break;
          default:
            // For everything else, default to TOKENTAILS
            spawnPosition = SHELTER_SPAWN_POSITIONS[Shelters.TOKENTAILS];
            break;
        }
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
        isPlayerCat,
      };

      this.physics.add.collider(npcCat.sprite, this.groundLayer);
      this.physics.add.collider(npcCat.sprite, this.platformsLayer);
      this.physics.add.collider(npcCat.sprite, this.jumperLayer);

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
      npcCat as any
    );
    this.add.existing(this.speechBubble);
  }

  private destroySpeechBubble() {
    this.speechBubble.destroy();
  }

  private handleNpcCollision(npc: ICat) {
    GameEvents.NPC_COLLISION.push({ npc });
  }

  private handleNpcVisibility(npc: NpcCat) {
    const isInView = this.cameras.main.worldView.contains(
      npc.sprite.x,
      npc.sprite.y
    );
    const wasActive = npc.sprite.active;

    npc.sprite.setActive(isInView);
    npc.sprite.setVisible(isInView);

    if (wasActive && !isInView) {
      npc.sprite.setVelocity(0, 0);
    }

    return isInView;
  }

  private handleNpcInteraction(npc: NpcCat) {
    if (!this.cat) return;

    const isOverlapping = this.physics.overlap(this.cat.sprite, npc.sprite);
    const isPlayerCat = (npc as any).originalData?.isPlayerCat;

    if (isOverlapping && this.currentlyCollidingNpc === null && !isPlayerCat) {
      this.currentlyCollidingNpc = npc;
      npc.handleLoaf();
      this.showNpcSpeechBubble(
        npc,
        `Hi, I am ${npc.sprite.texture.key}! Want to adopt me?`
      );
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
    this.cat = new Cat(this, 350, -100, catName, blessing!, type);
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
        const npcData = { name: npcName, spriteImg: "", type: CatType.REGULAR };
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

    // Optimize NPC updates by checking distance from player
    const playerX = this.cat?.sprite.x ?? 0;
    const playerY = this.cat?.sprite.y ?? 0;
    const updateDistance = IS_MOBILE ? 320 : 800;

    this.npcCats.forEach((npc) => {
      if (!npc.sprite.active) return;

      const distance = Phaser.Math.Distance.Between(
        playerX,
        playerY,
        npc.sprite.x,
        npc.sprite.y
      );

      if (distance < updateDistance) {
        npc.update();
        this.handleNpcInteraction(npc);
      } else {
        // Stop all movement and animations for distant NPCs
        npc.sprite.setVelocity(0, 0);
        npc.sprite.anims.stop();
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
}
