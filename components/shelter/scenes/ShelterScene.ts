import { Scene } from "phaser";
import { GameEvent, GameEvents, ICatEvent, IPhaserGameSceneProps } from "@/components/Phaser/events";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { NpcCat } from "../objects/NpcCat";
import { CatAbilityType, CatType } from "@/models/cats";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { ICat } from "@/models/cats";
import { ZOOM } from "@/constants/utils";
import { SpeechBubble } from "../objects/SpeechBubble";

const JUMP_LAYER_TILES = [47, 48, 49, 50];
const TRAMPOLINE_TILES = [51];

const FLOOR_Y_POSITIONS: Record<CatType | string, number> = {
  [CatType.REGULAR]: -700,
  [CatType.BLESSED]: -1150,
  [CatType.EXCLUSIVE]: -1300,
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
  npcCats: NpcCat[] = []
  blessing!: Phaser.GameObjects.Sprite;
  currentlyCollidingNpc: NpcCat | null = null;
  speechBubble: any;

  constructor() {
    super("ShelterScene");
  }

  preload() {
    this.load.audio("purr", "purrquest/sounds/purr.mp3");
    this.load.tilemapTiledJSON("tilemap", "catbassadors/shelter.json");
    this.load.image("blocks", "base/blocks-winter.png");
    this.load.audio("powerup", "purrquest/sounds/powerup.mp3");

    this.load.spritesheet("knockback-spell", "abilities/knockback-spell/FIRE.png", {
    frameWidth: 64,
    frameHeight: 64,
    });
  }

  create(props: IPhaserGameSceneProps) {
    this.physics.world.setFPS(120);
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    const sugarTileset = this.tilemap.addTilesetImage("blocks", "blocks", 32, 32, 1, 2)!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;
    this.platformsLayer = this.tilemap.createLayer("platforms", [sugarTileset])!;
    this.tilemap.createLayer("decorations", [sugarTileset]);
    this.jumperLayer = this.tilemap.createLayer("jumper", [sugarTileset])!;
   this.events.on(GameEvent.CAT_CARD_DISPLAY, (data:any) => {
      GameEvents.CAT_CARD_DISPLAY.push(data);
    });


    this.groundLayer.setCollisionByExclusion([-1]);
    this.platformsLayer.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
    JUMP_LAYER_TILES,
    (player:any) => {
        if (player.body.velocity.y <= 0) {
            return true; 
        }
        return false;
    },
    this
);

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

    const catSpawnCallback = (data: ICatEvent<GameEvent.CAT_SPAWN>) => this.spawnCat(data!);
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
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      GameEvents.GAME_START.removeEventListener(startGameCallback);
    });

    const npcSpawnRegularCallback = (data: ICatEvent<GameEvent.NPC_SPAWN_REGULAR>) => {
      this.spawnNpc(data.detail.npc, CatType.REGULAR);
    };
    const npcSpawnBlessedCallback = (data: ICatEvent<GameEvent.NPC_SPAWN_BLESSED>) => {
      this.spawnNpc(data.detail.npc, CatType.BLESSED);
    };
    const npcSpawnExclusiveCallback = (data: ICatEvent<GameEvent.NPC_SPAWN_EXCLUSIVE>) => {
      this.spawnNpc(data.detail.npc, CatType.EXCLUSIVE);
    };

    GameEvents.NPC_SPAWN_REGULAR.addEventListener(npcSpawnRegularCallback);
    GameEvents.NPC_SPAWN_BLESSED.addEventListener(npcSpawnBlessedCallback);
    GameEvents.NPC_SPAWN_EXCLUSIVE.addEventListener(npcSpawnExclusiveCallback);

    GameEvents.GAME_LOADED.push({ scene: this });

    this.scene.scene.events.once("destroy", () => {
      GameEvents.NPC_SPAWN_REGULAR.removeEventListener(npcSpawnRegularCallback);
      GameEvents.NPC_SPAWN_BLESSED.removeEventListener(npcSpawnBlessedCallback);
      GameEvents.NPC_SPAWN_EXCLUSIVE.removeEventListener(npcSpawnExclusiveCallback);
    });
  }

async spawnCat({ detail: { cat } }: ICatEvent<GameEvent.CAT_SPAWN>, isRestart?: boolean) {
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
    this.scene.restart({ cat, isRestart: true });
    return;
  }

  this.catDto = cat;

  this.load.once(
    "complete",
    () => {
      if (cat.blessings && cat.blessings.length > 0) {
        this.blessing = this.add.sprite(0, 0, `blessing-${cat.blessings[0].ability}`).setVisible(true);

        this.anims.create({
          key: `blessing_animation_${cat.blessings[0].ability}`,
          frames: this.anims.generateFrameNumbers(`blessing-${cat.blessings[0].ability}`, { start: 0, end: 59 }),
          frameRate: 16,
          repeat: -1,
        });

        this.blessing.play(`blessing_animation_${cat.blessings[0].ability}`);
      }

      this.createCat(cat.name, this.blessing,cat.type);
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



private spawnNpc(npcData: ICat, catType: CatType) {
  this.load.once("complete", () => {
    const spawnY = FLOOR_Y_POSITIONS[catType] ?? -700;
    const spawnX = Phaser.Math.Between(-900, -100);

    const npcCat = new NpcCat(this, spawnX, spawnY, npcData.name);
    (npcCat as any).originalData = npcData;

    this.physics.add.collider(npcCat.sprite, this.groundLayer);
    this.physics.add.collider(npcCat.sprite, this.platformsLayer);

    if (npcData.blessings && npcData.blessings.length > 0) {
      const blessingAbility = npcData.blessings[0].ability;
      const blessing = this.add.sprite(spawnX, spawnY, `blessing-${blessingAbility}`).setVisible(true);

      this.anims.create({
        key: `npc_blessing_animation_${blessingAbility}`,
        frames: this.anims.generateFrameNumbers(`blessing-${blessingAbility}`, { start: 0, end: 59 }),
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

    this.npcCats.push(npcCat);
    this.npcGroup.add(npcCat.sprite);
  });

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
  this.speechBubble = new SpeechBubble(this, bubbleX, bubbleY, message, npcCat as any);
  this.add.existing(this.speechBubble);
}

private destroySpeechBubble() {
    this.speechBubble.destroy();

}




private createCat(catName: string, blessing: Phaser.GameObjects.Sprite | null,type:CatAbilityType) {
  this.cat = new Cat(this, -200, -400, catName, blessing!,type);
  this.physics.add.collider(this.cat.sprite, this.groundLayer);
  this.physics.add.collider(this.cat.sprite as Phaser.Physics.Arcade.Sprite, this.platformsLayer);
  this.physics.add.collider(this.cat.sprite, this.jumperLayer);
  this.cameras.main.startFollow(this.cat.sprite);


  setMobileControls(this.cat);

  this.physics.add.overlap(this.cat.sprite, this.npcGroup, (_player, npcSprite) => {
    const npcName = (npcSprite as Phaser.Physics.Arcade.Sprite).texture.key;
    const npcData = { name: npcName, spriteImg: "", type: CatType.REGULAR };
    this.handleNpcCollision(npcData as any);
  });
}



  private handleNpcCollision(npc: ICat) {
    GameEvents.NPC_COLLISION.push({ npc });
  }

  private handleNpcCollisionWithPlayer() {
  this.npcCats.forEach((npcCat) => {
    npcCat.update();

    const isOverlapping = this.physics.overlap(this.cat!.sprite, npcCat.sprite);

    if (isOverlapping) {
      if (this.currentlyCollidingNpc === null) {
        this.currentlyCollidingNpc = npcCat;

        npcCat.handleLoaf();
        this.showNpcSpeechBubble(
          npcCat,
          `Hi, I am ${npcCat.sprite.texture.key}! Want to adopt me?`
        );
      }
    } else {
      if (!isOverlapping && this.currentlyCollidingNpc === npcCat) {
        npcCat.handleLoafReset();
        this.destroySpeechBubble()
        this.currentlyCollidingNpc = null;
      }
    }
  });
  }

  private startGame() {
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
      setMobileControls(this.cat);
    }
  }

update(time: number, delta: number) {
  this.cat?.update();
  this.handleNpcCollisionWithPlayer()
}



  private setDefaultSound() {
    this.backgroundSound?.play();
  }
}
