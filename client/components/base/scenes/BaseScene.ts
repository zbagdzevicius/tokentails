import { Cat } from "@/components/catbassadors/objects/Catbassador";
import { preloadTTFonts } from "@/components/Phaser/typography";
import {
  GameEvent,
  GameEvents,
  ICatEvent,
  ICatEventsDetails,
} from "@/components/Phaser/events";
import { HubMap } from "@/components/Phaser/map";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { setCssScroll } from "@/components/Phaser/look/camera";
import { beginWorldLook, preloadBaseSheet, preloadWorldLook, type WorldLook } from "@/components/Phaser/look/worldLook";
import { loadSpritesheets, removeTexture } from "@/components/Phaser/look/loadTextures";
import {
  blessingTextureKey,
  CAT_FRAME_SIZE,
  BLESSING_FRAME_SIZE,
  loadPlayerCatTextures,
} from "@/components/catbassadors/objects/playerCatTexture";
import { NPC_ANIMATION_NAMES, NpcCat } from "@/components/shelter/objects/NpcCat";
import {
  blessingTypes,
  NpcSpawnCoalescer,
  planNpcBatch,
} from "@/components/shelter/objects/npcBatch";
import { SpeechBubble } from "@/components/shelter/objects/SpeechBubble";
import { reportAppError } from "@/analytics";
import { cdnFile } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { Scene } from "phaser";
import { NPCJobType } from "../objects/Cat";
import { Food } from "../objects/Food";

const JUMP_LAYER_TILES = [
  169, 170, 139, 140, 200, 224, 225, 226, 227, 31, 32, 33, 35,
];

export class BaseScene extends Scene {
  platform!: Phaser.GameObjects.Rectangle;
  cat?: Cat;
  catDto?: ICat;
  npcGroup!: Phaser.Physics.Arcade.Group;
  npcCats: NpcCat[] = [];
  food?: Food | null;
  catSpritesheet?: Phaser.Loader.LoaderPlugin;
  tilemap!: Phaser.Tilemaps.Tilemap;
  groundLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  isPlaying: boolean = false;
  blipSound?: Phaser.Sound.BaseSound;
  blessing?: Phaser.GameObjects.Sprite;
  /** Keeps the player blessing on the cat; removed with the cat (no leaked 16 ms loop). */
  private blessingFollow?: Phaser.Time.TimerEvent;

  currentlyCollidingNpc: NpcCat | null = null;
  speechBubble?: SpeechBubble;
  isCatSelected: boolean = false;
  /** G7 look runtime: integer-zoom camera, and the night look in v1. */
  look?: WorldLook;
  private decorationLayer!:
    | Phaser.Tilemaps.TilemapLayer
    | Phaser.Tilemaps.TilemapGPULayer;
  private waterTiles: number[] = [74, 44];
  private waterAnimationInterval: number = 350;
  /** Bumped on every player spawn, so a slow load for an older pick is dropped. */
  private playerSpawnToken = 0;
  private npcCoalescer?: NpcSpawnCoalescer<ICat>;
  /** Latest NPC batch per cat id still loading; an older batch skips a cat a newer one owns. */
  private npcSpawnPending = new Map<string, number>();
  /** NPC texture keys an unsettled batch is loading or about to draw; never retired. */
  private npcKeysInFlight = new Map<string, number>();
  private npcSpawnGeneration = 0;

  constructor() {
    super("BaseScene");
  }

  preload() {
    // Plan F4: the brand faces load before create(), so no Text is drawn with a fallback face.
    preloadTTFonts(this);
    this.load.spritesheet("food", cdnFile("base/food.png"), {
      frameWidth: 32,
      frameHeight: 32,
      margin: 1,
      spacing: 2,
    });
    this.load.image("coin", cdnFile("logo/coin.webp"));
    this.load.audio("blip", cdnFile("purrquest/sounds/blip.mp3"));
    this.load.audio("meow", cdnFile("purrquest/sounds/meow.mp3"));
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.audio("eat", cdnFile("purrquest/sounds/eat.mp3"));
    this.load.audio("powerup", cdnFile("purrquest/sounds/powerup.mp3"));
    this.load.tilemapTiledJSON("tilemap", "catbassadors/base.json");
    this.load.audio("jump", cdnFile("catnip-chaos/sounds/jump.mp3"));
    // v0 hub sheet; skipped in v1 when the night skin (HubMap.v1) is known (task 6e).
    preloadBaseSheet(this, "new-blocks-winter", cdnFile(HubMap.v0), { kind: "home", sheet: HubMap.v0 });
    // G7: the look manifest and, in v1, the hub night skin and the Home plates (by name).
    preloadWorldLook(this, { kind: "home", sheet: HubMap.v0 });
    this.load.spritesheet(
      "knockback-spell",
      cdnFile("abilities/knockback-spell/FIRE.png"),
      {
        frameWidth: 64,
        frameHeight: 64,
      }
    );
  }

  create() {
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    this.look = beginWorldLook(this, { kind: "home", sheet: HubMap.v0 });

    // Same indices in v0 and v1: only the texture behind the tileset changes.
    const sugarTileset = this.tilemap.addTilesetImage(
      "new-blocks-winter",
      this.look.tilesetKey("new-blocks-winter"),
      32,
      32,
      1,
      2
    )!;
    this.groundLayer = this.tilemap.createLayer("blocks", [sugarTileset])!;

    this.decorationLayer = this.tilemap.createLayer("decorations", [
      sugarTileset,
    ])!;
    this.decorationLayer.setDepth(10);

    // Collisions
    this.groundLayer?.setCollisionByExclusion([-1]);

    // Camera (G7): integer zoom, map bounds, and the night look in v1. The first view stays
    // where it always was until the cat lands and the camera follows it.
    this.look.dress({
      layers: [this.groundLayer, this.decorationLayer],
      tilemapKey: "tilemap",
      groundLayers: ["blocks"],
    });
    setCssScroll(this.cameras.main, this, -650, -1000);

    this.addSounds();
    this.npcGroup = this.physics.add.group();
    this.events.on(
      GameEvent.CAT_CARD_DISPLAY,
      (data: ICatEventsDetails[GameEvent.CAT_CARD_DISPLAY]) => {
        GameEvents.CAT_CARD_DISPLAY.push(data);
      }
    );
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

    // One PLAYER_CATS event per owned cat: coalesced into one load pass (G13 step 6).
    this.npcCoalescer = new NpcSpawnCoalescer<ICat>((cats) => this.spawnNpcs(cats));
    const npcSpawnPlayerCats = (data: ICatEvent<GameEvent.PLAYER_CATS>) => {
      if (data?.detail?.npc) this.npcCoalescer?.push(data.detail.npc);
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
      this.npcCoalescer?.dispose();
    });

    // Water animation
    this.setupWaterAnimation();
  }

  private meow() {
    setTimeout(() => {
      try {
        this.sound?.play("meow", { volume: 0.3 });
      } catch {}
    }, 2000);
  }

  private addSounds() {
    this.blipSound = this.sound.add("blip", { volume: 0.1 });
  }

  spawnCat({ detail: { cat } }: ICatEvent<GameEvent.CAT_SPAWN>) {
    if (!cat) return;

    this.currentlyCollidingNpc = null;
    this.destroySpeechBubble();

    const token = ++this.playerSpawnToken;
    const report = (code: string, error: unknown) =>
      reportAppError(code, error, { source: "manual", level: "scene", scene: "BaseScene" });

    // Id-keyed sheet (F10): one race-free pass. The current cat stays on screen until the new
    // sheet is in, so a failed load never leaves the hub empty.
    loadPlayerCatTextures(this, cat, {
      blessing: !!cat.blessing,
      blessingUrl: cdnFile(`flare-effect/spritesheets/${cat.type}.png`),
    })
      .then(({ key, loaded, blessingKey, retirePrevious }) => {
        if (token !== this.playerSpawnToken || !this.sys.isActive()) return;
        if (!loaded) {
          report("player_texture_missing", new Error("Player cat sheet failed"));
          return;
        }
        try {
          this.removePlayerCat();
          const retiredNpcKeys = this.removeNpcById(cat._id);
          this.catDto = cat;

          let blessing: Phaser.GameObjects.Sprite | null = null;
          if (blessingKey) {
            blessing = this.add.sprite(0, 0, blessingKey).setVisible(true);
            const animKey = `blessing_animation_${cat.type}`;
            if (!this.anims.exists(animKey)) {
              this.anims.create({
                key: animKey,
                frames: this.anims.generateFrameNumbers(blessingKey, { start: 0, end: 59 }),
                frameRate: 16,
                repeat: -1,
              });
            }
            blessing.play(animKey);
            this.blessing = blessing;
          }
          this.createCat(key, blessing);
          retirePrevious();
          this.retireNpcTextures(retiredNpcKeys);
        } catch (error) {
          report("player_spawn_error", error);
        }
      })
      .catch((error) => report("player_spawn_error", error));
  }

  /** Destroys the player sprite, its blessing and the blessing's follow timer. */
  private removePlayerCat() {
    this.blessingFollow?.remove(false);
    this.blessingFollow = undefined;
    if (this.cat) {
      this.cat.sprite.destroy();
      this.cat = undefined;
    }
    if (this.blessing) {
      this.blessing.destroy();
      this.blessing = undefined;
    }
  }

  /** Destroys the NPC(s) for `id` and returns the texture keys they drew from. */
  private removeNpcById(id: string | undefined): string[] {
    if (!id) return [];
    const keys: string[] = [];
    this.npcCats = this.npcCats.filter((npc) => {
      if (npc.originalData?._id !== id) return true;
      keys.push(npc.textureKey);
      this.npcGroup.remove(npc.sprite);
      npc.destroy();
      return false;
    });
    return keys;
  }

  /** True while an NPC or the player cat draws from `key`. */
  private isTextureDrawn(key: string): boolean {
    if (this.cat?.sprite?.active && this.cat.sprite.texture?.key === key) return true;
    return this.npcCats.some((npc) => npc.textureKey === key);
  }

  /** Drawn, or an unsettled batch is loading it (so it must not be retired yet). */
  private isTextureInUse(key: string): boolean {
    return this.npcKeysInFlight.has(key) || this.isTextureDrawn(key);
  }

  /**
   * Removes NPC textures (and their animations) that no sprite uses any more, after the
   * sprites were swapped. `keep` is the key that just replaced them.
   */
  private retireNpcTextures(keys: readonly string[], keep?: string) {
    keys.forEach((key) => {
      if (!key || key === keep || this.isTextureInUse(key)) return;
      removeTexture(this, key, NPC_ANIMATION_NAMES);
    });
  }

  private createCat(
    textureKey: string,
    blessing: Phaser.GameObjects.Sprite | null
  ) {
    this.cat = new Cat(
      this,
      64,
      -400,
      textureKey,
      blessing!,
      this.catDto!.type
    );

    // Collide cat with ground
    this.physics.add.collider(this.cat!.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);

    // Camera follows cat (lerp, deadzone, look-ahead; G7) with a halo and shadow in v1.
    this.look?.follow(this.cat.sprite);
    this.look?.attachCat(this.cat.sprite, { player: true });

    this.cat.enableControls = false;

    setMobileControls(this.cat);
    // Enable controls if EAT status is 4
    if (this.cat && this.catDto?.status?.EAT === 4) {
      this.cat.enableControls = true;
    }

    // If cat has a blessing, keep it trailing the cat
    if (blessing) {
      this.blessingFollow?.remove(false);
      const follow = this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (this.cat?.sprite.active) {
            blessing.setPosition(this.cat.sprite.x, this.cat.sprite.y - 5);
          } else {
            blessing.destroy();
            follow.remove(false);
            if (this.blessingFollow === follow) this.blessingFollow = undefined;
          }
        },
      });
      this.blessingFollow = follow;
    }
    this.physics.add.overlap(
      this.cat!.sprite,
      this.npcGroup,
      (_player, npcSprite) => {
        // The texture key is an id now; the cat itself comes from the NPC list.
        const npc = this.npcCats.find((entry) => entry.sprite === npcSprite);
        if (npc) this.handleNpcCollision(npc.originalData);
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

    this.physics.add.collider(this.food.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);
  }

  update() {
    // Update player cat if it exists
    this.cat?.update();

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
  }

  /**
   * The player's cats as NPCs, in one load pass keyed `npc-${_id}` (F10, G13): a missing or
   * failing sheet skips that cat instead of spawning it on `__MISSING`.
   */
  private spawnNpcs(cats: ICat[]) {
    // A re-sent cat replaces its NPC, as before, but only once its new sheet is in, and only
    // the latest send per id wins: Base.tsx can re-send PLAYER_CATS while an earlier batch is
    // still loading (cached then network userCats), which used to create every NPC twice.
    const plan = planNpcBatch(cats.map((npc) => ({ npc, type: null })));
    const generation = ++this.npcSpawnGeneration;
    plan.spawn.forEach(({ id }) => this.npcSpawnPending.set(id, generation));
    plan.spawn.forEach(({ textureKey }) =>
      this.npcKeysInFlight.set(textureKey, (this.npcKeysInFlight.get(textureKey) ?? 0) + 1)
    );
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      plan.spawn.forEach(({ textureKey }) => {
        const left = (this.npcKeysInFlight.get(textureKey) ?? 1) - 1;
        if (left > 0) this.npcKeysInFlight.set(textureKey, left);
        else this.npcKeysInFlight.delete(textureKey);
      });
    };
    const report = (code: string, error: unknown, extra: Record<string, unknown> = {}) =>
      reportAppError(code, error, { source: "manual", level: "scene", scene: "BaseScene", ...extra });
    const blessings = blessingTypes(plan.spawn);
    loadSpritesheets(
      this,
      [
        ...plan.spawn.map(({ npc, textureKey }) => ({
          key: textureKey,
          url: npc.spriteImg,
          frameWidth: CAT_FRAME_SIZE,
          frameHeight: CAT_FRAME_SIZE,
        })),
        ...blessings.map((type) => ({
          key: blessingTextureKey(type),
          url: cdnFile(`flare-effect/spritesheets/${type}.png`),
          frameWidth: BLESSING_FRAME_SIZE,
          frameHeight: BLESSING_FRAME_SIZE,
        })),
      ],
      // Keys carry the sprite hash, so a re-skin is a new key; the guard keeps a texture that a
      // live sprite still uses even if a key ever comes back with another URL (2e review).
      { animations: NPC_ANIMATION_NAMES, isInUse: (key) => this.isTextureDrawn(key) }
    )
      .then(() => {
        release();
        if (!this.sys.isActive()) return;
        let count = 0;
        const skippedIds = [...plan.skippedIds];
        plan.spawn.forEach((item) => {
          // A newer send for this cat is loading (or already won); leave it to that one, and
          // drop this send's sheet if it was a different skin nobody draws from.
          if (this.npcSpawnPending.get(item.id) !== generation) {
            this.retireNpcTextures([item.textureKey]);
            return;
          }
          this.npcSpawnPending.delete(item.id);
          if (!this.textures.exists(item.textureKey)) {
            skippedIds.push(item.id);
            return;
          }
          try {
            const retired = this.removeNpcById(item.id);
            this.createNpc(item.npc, item.textureKey);
            this.retireNpcTextures(retired, item.textureKey);
            count += 1;
          } catch (error) {
            skippedIds.push(item.id);
            report("npc_spawn_error", error);
          }
        });
        if (skippedIds.length) {
          report("npc_texture_missing", new Error(`${skippedIds.length} NPC sheets missing`), {
            skipped: skippedIds.length,
          });
        }
        GameEvents.NPC_SPAWNED.push({
          count,
          skipped: skippedIds.length,
          skippedIds,
          source: "player-cats",
          scene: "BaseScene",
        });
      })
      .catch((error) => {
        release();
        plan.spawn.forEach(({ id }) => {
          if (this.npcSpawnPending.get(id) === generation) this.npcSpawnPending.delete(id);
        });
        report("npc_spawn_error", error);
      });
  }

  private createNpc(npcData: ICat, textureKey: string) {
    const spawnX = Phaser.Math.Between(32, 300);
    const spawnY = -400;

    const npcCat = new NpcCat(this, spawnX, spawnY, textureKey);
    npcCat.originalData = { ...npcData };
    this.physics.add.collider(npcCat.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);

    // Blessing only when its sheet is really there.
    const blessingKey = blessingTextureKey(npcData.type);
    if (npcData.blessing && this.textures.exists(blessingKey)) {
      const animKey = `npc_blessing_animation_${npcData.type}`;
      const blessing = this.add.sprite(spawnX, spawnY, blessingKey).setVisible(true);
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(blessingKey, { start: 0, end: 59 }),
          frameRate: 16,
          repeat: -1,
        });
      }
      blessing.play(animKey);

      const follow = this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (npcCat.sprite.active) {
            blessing.setPosition(npcCat.sprite.x, npcCat.sprite.y - 5);
          } else {
            blessing.destroy();
            follow.remove(false);
          }
        },
      });
    }

    this.npcCats.push(npcCat);
    this.npcGroup.add(npcCat.sprite);
    this.look?.attachCat(npcCat.sprite);
  }

  private handleNpcCollision(npc: ICat) {
    GameEvents.NPC_COLLISION.push({ npc });
  }

  private handleNpcInteraction(npc: NpcCat) {
    if (!this.cat) return;

    const isOverlapping = this.physics.overlap(this.cat.sprite, npc.sprite);
    const isPlayerCat = npc.originalData?.isPlayerCat;
    const isSelected = this.catDto?._id === npc.originalData?._id;
    this.isCatSelected = isSelected;

    if (isOverlapping && !isPlayerCat) {
      if (this.currentlyCollidingNpc === null) {
        this.currentlyCollidingNpc = npc;
        npc.handleLoaf();
        this.showNpcSpeechBubble(
          npc,
          `Hey, it's me ${npc.displayName}. Wanna play with me?`,
          isSelected ? "SELECTED" : "SELECT"
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

  private showNpcSpeechBubble(
    npcCat: NpcCat,
    message: string,
    state: "SELECT" | "SELECTED"
  ) {
    // Remove existing bubbles
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
      npcCat,
      state,
      this.isCatSelected
    );
    this.add.existing(this.speechBubble);
  }

  private destroySpeechBubble() {
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = undefined;
    }
  }

  private onFoodEat() {
    this.sound.play("eat", { volume: 0.3, duration: 2 });
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
