import { reportAppError } from "@/analytics";
import { preloadTTFonts } from "@/components/Phaser/typography";
import {
  GameEvent,
  GameEvents,
  ICatEvent,
  ICatEventsDetails,
  INpcSpawnedEvent,
  INpcSpawnEvent,
  IPhaserGameSceneProps,
  NPC_TYPE,
} from "@/components/Phaser/events";
import { setCssScroll } from "@/components/Phaser/look/camera";
import { beginWorldLook, preloadBaseSheet, preloadWorldLook, type WorldLook } from "@/components/Phaser/look/worldLook";
import { loadSpritesheets } from "@/components/Phaser/look/loadTextures";
import {
  BLESSING_FRAME_SIZE,
  blessingTextureKey,
  CAT_FRAME_SIZE,
  isSamePlayerCat,
  loadPlayerCatTextures,
} from "@/components/catbassadors/objects/playerCatTexture";
import { HubMap } from "@/components/Phaser/map";
import { setMobileControls } from "@/components/Phaser/MobileButtons/MobileControls";
import { Trampoline } from "@/components/Phaser/Trampoline/Trampoline";
import { cdnFile } from "@/constants/utils";
import { CatAbilityType, ICat } from "@/models/cats";
import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { Elevator } from "../objects/Elevator";
import {
  blessingTypes,
  NpcSpawnCoalescer,
  planNpcBatch,
  type PlannedNpc,
} from "../objects/npcBatch";
import { NPC_ANIMATION_NAMES, NpcCat } from "../objects/NpcCat";
import { SpeechBubble } from "../objects/SpeechBubble";

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
  groundLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  platformsLayer!:
    | Phaser.Tilemaps.TilemapLayer
    | Phaser.Tilemaps.TilemapGPULayer;
  jumperLayer!: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  backgroundSound?: Phaser.Sound.BaseSound;
  trampoline?: Trampoline;
  npcGroup!: Phaser.Physics.Arcade.Group;
  npcCats: NpcCat[] = [];
  blessing?: Phaser.GameObjects.Sprite;
  /** The cat whose sheet is loading; the on-screen cat stays `catDto` until the swap. */
  private pendingCatDto?: ICat;
  currentlyCollidingNpc: NpcCat | null = null;
  speechBubble?: SpeechBubble;
  speechBubblePool: SpeechBubble[] = [];
  private elevator!: Elevator;
  private elevatorTimer: number = 0;
  private readonly ELEVATOR_DELAY: number = 1000;
  private decorationLayer!:
    | Phaser.Tilemaps.TilemapLayer
    | Phaser.Tilemaps.TilemapGPULayer;
  private waterTiles: number[] = [74, 44];
  private waterAnimationInterval: number = 350;
  /** Bumped on every player spawn, so a slow load for an older pick is dropped. */
  private playerSpawnToken = 0;
  private elevatorCollider?: Phaser.Physics.Arcade.Collider;
  /** NPC ids spawned or loading, so a repeated batch does not double them. */
  private npcIds = new Set<string>();
  private npcCoalescer?: NpcSpawnCoalescer<INpcSpawnEvent>;
  /** Set on `destroy`; a late CAT_SPAWN (or an await resuming) must not touch a dead scene. */
  private sceneDestroyed = false;
  /** G7 look runtime: integer-zoom camera, and the dusk look in v1. */
  look?: WorldLook;

  constructor() {
    super("ShelterScene");
  }

  preload() {
    // Plan F4: the brand faces load before create(), so no Text is drawn with a fallback face.
    preloadTTFonts(this);
    this.load.audio("purr", cdnFile("purrquest/sounds/purr.mp3"));
    this.load.tilemapTiledJSON(
      "tilemap",
      cdnFile("catbassadors/new-shelter.json")
    );
    // v0 hub sheet; skipped in v1 when the night skin (HubMap.v1) is known (task 6e).
    preloadBaseSheet(this, "new-blocks-winter", cdnFile(HubMap.v0), { kind: "shelter", sheet: HubMap.v0 });
    // G7: the look manifest and, in v1, the hub night skin, night signs and the dusk plates.
    preloadWorldLook(this, { kind: "shelter", sheet: HubMap.v0 });
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
    this.sceneDestroyed = false;
    this.tilemap = this.make.tilemap({ key: "tilemap" });
    this.look = beginWorldLook(this, { kind: "shelter", sheet: HubMap.v0 });
    // Same indices in v0 and v1: only the textures behind the tilesets change.
    const sugarTileset = this.tilemap.addTilesetImage(
      "new-blocks-winter",
      this.look.tilesetKey("new-blocks-winter"),
      32,
      32,
      1,
      2
    )!;
    const logoTileset = this.tilemap.addTilesetImage("logo", "shelter-logo")!;
    const signsTileset = this.tilemap.addTilesetImage(
      "signs",
      this.look.extraTilesetKey("shelter-signs", "shelter-signs")
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
    this.events.on(
      GameEvent.CAT_CARD_DISPLAY,
      (data: ICatEventsDetails[GameEvent.CAT_CARD_DISPLAY]) => {
        GameEvents.CAT_CARD_DISPLAY.push(data);
      }
    );

    this.groundLayer.setCollisionByExclusion([-1]);
    this.platformsLayer.setCollision(JUMP_LAYER_TILES);
    this.platformsLayer.setTileIndexCallback(
      JUMP_LAYER_TILES,
      (player: Phaser.Types.Physics.Arcade.GameObjectWithBody) => {
        if (player.body.velocity.y <= 0) {
          return true;
        }
        return false;
      },
      this
    );
    (this.groundLayer as Phaser.Tilemaps.TilemapLayer).skipCull = false;
    (this.platformsLayer as Phaser.Tilemaps.TilemapLayer).skipCull = false;

    this.jumperLayer.setCollision(TRAMPOLINE_TILES);
    this.trampoline = new Trampoline(
      this,
      this.jumperLayer as Phaser.Tilemaps.TilemapLayer,
      TRAMPOLINE_TILES
    );

    // Camera (G7): integer zoom and map bounds; the dusk look in v1.
    this.look.dress({
      layers: [this.groundLayer, this.platformsLayer, this.decorationLayer, this.jumperLayer],
      tilemapKey: "tilemap",
      groundLayers: ["blocks"],
    });
    setCssScroll(this.cameras.main, this, -650, -1000);

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
      // Leaked before 2e: a cat pick after leaving the Shelter ran spawnCat on the dead scene.
      GameEvents.CAT_SPAWN.removeEventListener(catSpawnCallback);
      this.sceneDestroyed = true;
    });

    // G13 step 6: NPC_SPAWN_BATCH is one load pass. The legacy one-cat NPC_SPAWN events are
    // coalesced into a batch for one release, so the old producer gets the same guarantees.
    this.npcCoalescer = new NpcSpawnCoalescer<INpcSpawnEvent>((entries) =>
      this.spawnNpcBatch(entries, "legacy")
    );
    const npcSpawnRegularCallback = (data: ICatEvent<GameEvent.NPC_SPAWN>) => {
      if (data?.detail) this.npcCoalescer?.push(data.detail);
    };
    const npcSpawnBatchCallback = (data: ICatEvent<GameEvent.NPC_SPAWN_BATCH>) => {
      this.spawnNpcBatch(data?.detail?.npcs ?? [], "batch");
    };

    GameEvents.NPC_SPAWN.addEventListener(npcSpawnRegularCallback);
    GameEvents.NPC_SPAWN_BATCH.addEventListener(npcSpawnBatchCallback);

    GameEvents.GAME_LOADED.push({ scene: this });

    this.scene.scene.events.once("destroy", () => {
      GameEvents.NPC_SPAWN.removeEventListener(npcSpawnRegularCallback);
      GameEvents.NPC_SPAWN_BATCH.removeEventListener(npcSpawnBatchCallback);
      this.npcCoalescer?.dispose();
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

    this.elevator = new Elevator(
      this,
      650,
      -50,
      this.groundLayer as Phaser.Tilemaps.TilemapLayer
    );

    if (this.cat) {
      this.elevatorCollider = this.physics.add.collider(
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
    // Not `sys.isActive()`: it is false during create(), which spawns the first cat.
    if (!cat || this.sceneDestroyed) return;
    // Same cat, same skin (id key, not name: F10): nothing to do, whether it is on screen or
    // still loading.
    const current = this.pendingCatDto ?? this.catDto;
    if (isSamePlayerCat(cat, current) && !isRestart) {
      return;
    }

    this.pendingCatDto = cat;
    const token = ++this.playerSpawnToken;
    const report = (code: string, error: unknown) =>
      reportAppError(code, error, { source: "manual", level: "scene", scene: "ShelterScene" });

    try {
      // The current cat stays on screen until the new sheet is in, so a failed load never
      // leaves the shelter without a cat. Its texture goes after the swap (retirePrevious).
      const { key, loaded, blessingKey, retirePrevious } = await loadPlayerCatTextures(this, cat, {
        blessing: !!cat.blessing,
        blessingUrl: cdnFile(`flare-effect/spritesheets/${cat.type}.png`),
      });
      if (token !== this.playerSpawnToken || !this.sys.isActive()) return;
      this.pendingCatDto = undefined;
      if (!loaded) {
        report("player_texture_missing", new Error("Player cat sheet failed"));
        return;
      }

      if (this.cat) {
        this.elevatorCollider?.destroy();
        this.elevatorCollider = undefined;
        this.cat.sprite.destroy();
        this.cat = undefined;
      }
      if (this.blessing) {
        this.blessing.destroy();
        this.blessing = undefined;
      }
      this.catDto = cat;

      let blessing: Phaser.GameObjects.Sprite | null = null;
      if (blessingKey) {
        blessing = this.add.sprite(0, 0, blessingKey).setVisible(true);
        const animKey = `blessing_animation_${cat.type}`;
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(blessingKey, {
              start: 0,
              end: 59,
            }),
            frameRate: 16,
            repeat: -1,
          });
        }
        blessing.play(animKey);
        this.blessing = blessing;
      }

      this.createCat(key, blessing, cat.type);
      retirePrevious();
    } catch (error) {
      if (token === this.playerSpawnToken) this.pendingCatDto = undefined;
      report("player_spawn_error", error);
    }
  }

  /**
   * Storefront NPCs, one load pass per batch (G13 step 6): id keys (`npc-${_id}`), cats without
   * a usable sheet or whose sheet fails are skipped and reported, never spawned on `__MISSING`,
   * and a failing spawn cannot take the scene down. Answers with NPC_SPAWNED {count, skipped}.
   */
  private spawnNpcBatch(
    entries: readonly INpcSpawnEvent[],
    source: INpcSpawnedEvent["source"]
  ) {
    const plan = planNpcBatch<ICat, NPC_TYPE>(entries, this.npcIds);
    plan.spawn.forEach(({ id }) => this.npcIds.add(id));
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
      {
        animations: NPC_ANIMATION_NAMES,
        // Never pull a texture out from under a live sprite (2e review).
        isInUse: (key) => this.npcCats.some((npc) => npc.textureKey === key),
      }
    ).then(() => {
      if (!this.sys.isActive()) return;
      let count = 0;
      let missing = 0;
      const skippedIds = [...plan.skippedIds];
      plan.spawn.forEach((item) => {
        if (!this.textures.exists(item.textureKey)) {
          missing += 1;
          skippedIds.push(item.id);
          this.npcIds.delete(item.id);
          return;
        }
        try {
          this.createNpc(item);
          count += 1;
        } catch (error) {
          skippedIds.push(item.id);
          this.npcIds.delete(item.id);
          reportAppError("npc_spawn_error", error, {
            source: "manual",
            level: "scene",
            scene: "ShelterScene",
          });
        }
      });
      if (missing > 0 || plan.skippedIds.length > 0) {
        reportAppError(
          "npc_texture_missing",
          new Error(`${missing + plan.skippedIds.length} NPC sheets missing`),
          {
            source: "manual",
            level: "scene",
            scene: "ShelterScene",
            skipped: missing + plan.skippedIds.length,
          }
        );
      }
      GameEvents.NPC_SPAWNED.push({
        count,
        skipped: skippedIds.length,
        skippedIds,
        source,
        scene: "ShelterScene",
      });
    }).catch((error) => {
      // Async throws skip the GameEvents crash guard; report them and free the ids for a retry.
      plan.spawn.forEach(({ id }) => {
        if (!this.npcCats.some((npc) => npc.originalData?._id === id)) this.npcIds.delete(id);
      });
      reportAppError("npc_spawn_error", error, {
        source: "manual",
        level: "scene",
        scene: "ShelterScene",
      });
    });
  }

  private createNpc({ npc: npcData, type, textureKey }: PlannedNpc<ICat, NPC_TYPE>) {
    let spawnPosition;

    if (type === NPC_TYPE.ROZINE_PEDUTE) {
      spawnPosition = SPAWN_POSITIONS[NPC_TYPE.ROZINE_PEDUTE];
    } else if (type === NPC_TYPE.TOKENTAILS) {
      spawnPosition = SPAWN_POSITIONS[NPC_TYPE.TOKENTAILS];
    } else {
      spawnPosition = SPAWN_POSITIONS[NPC_TYPE.TOKENTAILS_2];
    }

    // Randomized X position within the chosen range
    const spawnX = Phaser.Math.Between(spawnPosition.x.min, spawnPosition.x.max);
    const spawnY = spawnPosition.y;

    const npcCat = new NpcCat(this, spawnX, spawnY, textureKey);
    npcCat.originalData = {
      ...npcData,
    };

    this.physics.add.collider(npcCat.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);
    this.physics.add.collider(npcCat.sprite, this.platformsLayer as Phaser.Tilemaps.TilemapLayer);
    this.physics.add.collider(npcCat.sprite, this.jumperLayer as Phaser.Tilemaps.TilemapLayer);

    const blessingKey = blessingTextureKey(npcData.type);
    if (npcData.blessing && this.textures.exists(blessingKey)) {
      const animKey = `npc_blessing_animation_${npcData.type}`;
      const blessing = this.add
        .sprite(spawnX, spawnY, blessingKey)
        .setVisible(true);

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

    // Add this NPC cat to our local array and group
    this.npcCats.push(npcCat);
    this.npcGroup.add(npcCat.sprite);
    this.look?.attachCat(npcCat.sprite);
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
      npcCat,
      "ADOPT",
      false
    );
    this.add.existing(this.speechBubble);
  }

  private destroySpeechBubble() {
    this.speechBubble!.destroy();
  }

  private handleNpcCollision(npc: ICat) {
    GameEvents.NPC_COLLISION.push({ npc });
  }

  private handleNpcInteraction(npc: NpcCat) {
    if (!this.cat) return;

    const isOverlapping = this.physics.overlap(this.cat.sprite, npc.sprite);
    const isPlayerCat = npc.originalData?.isPlayerCat;
    if (isOverlapping && !isPlayerCat) {
      if (this.currentlyCollidingNpc === null) {
        this.currentlyCollidingNpc = npc;
        npc.handleLoaf();
        this.showNpcSpeechBubble(
          npc,
          `Hi, I am ${npc.displayName}! Want to adopt me?`
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
    textureKey: string,
    blessing: Phaser.GameObjects.Sprite | null,
    type: CatAbilityType
  ) {
    this.cat = new Cat(this, 350, -100, textureKey, blessing!, type, true);
    this.physics.add.collider(this.cat.sprite, this.groundLayer as Phaser.Tilemaps.TilemapLayer);
    this.physics.add.collider(
      this.cat.sprite as Phaser.Physics.Arcade.Sprite,
      this.platformsLayer as Phaser.Tilemaps.TilemapLayer
    );
    this.physics.add.collider(this.cat.sprite, this.jumperLayer as Phaser.Tilemaps.TilemapLayer);
    this.look?.follow(this.cat.sprite);
    this.look?.attachCat(this.cat.sprite, { player: true });

    setMobileControls(this.cat);

    this.physics.add.overlap(
      this.cat.sprite,
      this.npcGroup,
      (_player, npcSprite) => {
        // The texture key is an id now; the cat itself comes from the NPC list.
        const npc = this.npcCats.find((entry) => entry.sprite === npcSprite);
        if (npc) this.handleNpcCollision(npc.originalData);
      }
    );
  }

  private startGame() {
    if (this.cat) {
      this.cat.sprite.setPosition(0, -400);
      setMobileControls(this.cat);
    }
  }

  private handleElevatorCollision(
    playerObject: Parameters<Phaser.Types.Physics.Arcade.ArcadePhysicsCallback>[0],
    elevatorObject: Parameters<Phaser.Types.Physics.Arcade.ArcadePhysicsCallback>[1]
  ) {
    // Both colliders are arcade sprites (the cat and the elevator platform).
    const playerSprite = playerObject as Phaser.Physics.Arcade.Sprite;
    const elevatorSprite = elevatorObject as Phaser.Physics.Arcade.Sprite;
    if (
      playerSprite.body!.touching.down &&
      elevatorSprite.body!.touching.up &&
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

    const cat = this.cat;
    if (
      cat &&
      !this.physics.world.colliders
        .getActive()
        .some(
          (collider) =>
            collider.object1 === cat.sprite &&
            collider.object2 === this.elevator.sprite
        )
    ) {
      this.elevatorCollider = this.physics.add.collider(
        cat.sprite,
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
      if (npc.originalData?._id) this.npcIds.delete(npc.originalData._id);
    }
  }
}
