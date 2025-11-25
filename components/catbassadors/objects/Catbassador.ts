import { GameObjects, Physics, Scene } from "phaser";
import { IPlayer } from "@/components/Phaser/PlayerMovement/IPlayer";
import { PlayerMovement } from "@/components/Phaser/PlayerMovement/PlayerMovement";
import { catWalkSpeed } from "@/models/game";
import { Abilities } from "./Abilities";
import { CatAbilityType } from "@/models/cats";
import { NPCJob, NPCJobType } from "../../base/objects/Cat";
import { log } from "console";
/**
 * Physics objects that could be colliders
 */
type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  upW: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  dash: Phaser.Input.Keyboard.Key;
  knockback: Phaser.Input.Keyboard.Key;
};

export enum PlayerAnimation {
  SLEEP = "SLEEP",
  DIGGING = "DIGGING",
  GROOMING = "GROOMING",
  HIT = "HIT",
  IDLE = "IDLE",
  JUMPING = "JUMPING",
  JUMPING_UP = "JUMPING_UP",
  LOAF = "LOAF",
  RUNNING = "RUNNING",
  SITTING = "SITTING",
  WALKING = "WALKING",
}

const maxAnimationFrames = 15;
const animationConfigurations: {
  key: PlayerAnimation;
  frames: number;
  repeat: -1 | 0;
  frameRate: number;
}[] = [
  { key: PlayerAnimation.SLEEP, frames: 7, repeat: 0, frameRate: 8 },
  { key: PlayerAnimation.DIGGING, frames: 4, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.GROOMING, frames: 15, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.HIT, frames: 7, repeat: 0, frameRate: 12 },
  { key: PlayerAnimation.IDLE, frames: 12, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.JUMPING, frames: 7, repeat: 0, frameRate: 8 },
  { key: PlayerAnimation.LOAF, frames: 9, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.RUNNING, frames: 4, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.SITTING, frames: 5, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.WALKING, frames: 8, repeat: 0, frameRate: 8 },
];

type ICatAnimationKey = `${string}_${PlayerAnimation}`;
export type ICatAnimationKeysMap = Record<PlayerAnimation, ICatAnimationKey>;

function generateCatAnimationConfiguration(
  catName: string
): ICatAnimationKeysMap {
  const map = {} as ICatAnimationKeysMap;
  Object.keys(PlayerAnimation).map(
    (key) =>
      (map[key as PlayerAnimation] = `${catName}_${key as PlayerAnimation}`)
  );
  return map;
}

export class Cat implements IPlayer {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  blessings: Phaser.GameObjects.Sprite;
  isJumping: boolean = false;
  isMobileJumping: boolean = false;
  isMobileLeft: boolean = false;
  isMobileDash: boolean = false;
  isMobileknockbackSpell: boolean = false;
  wallJumpCount: number = 0;
  isMobileRight: boolean = false;
  lastWallTouched: "left" | "right" | null = null;
  wallTouchTime: number = 0;
  disableLeftMovement: boolean = false;
  disableRightMovement: boolean = false;
  justJumped: boolean = false;
  isSliding: boolean = false;
  jumpTimer: number = 0;
  animation: PlayerAnimation = animationConfigurations[0].key;
  animationKeys: ICatAnimationKeysMap;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: KeyMap;
  isHit!: boolean;
  isDeath!: boolean;
  hasKey: boolean = false;
  isInvulnerable: boolean;
  private catName: string;
  abilities: Abilities;
  type!: CatAbilityType;
  isOnSlidingTile: boolean = false;
  isOnIcyTile: boolean = false;
  currentRotation: boolean = false;

  private collectiveItem: Phaser.Physics.Arcade.Sprite | null = null;
  collectedItem: Phaser.Physics.Arcade.Sprite | null = null;

  isDashing: boolean = false;
  readonly dashTime: number = 200; // Duration of dash in ms
  readonly dashCooldown: number = 300; // Cooldown time before dashing again
  readonly dashSpeed: number = 640; // Speed during dash
  walkSpeed: number = catWalkSpeed;
  jumpSpeed: number = 468;
  readonly wallSlideSpeed: number = 96;
  readonly maxJumpSpeed: number = 618;
  readonly coyoteTime: number = 200;
  movement: PlayerMovement;

  //sliding
  readonly slideSpeed: number = this.walkSpeed * 1.5;
  readonly slideDuration: number = 1000;
  readonly slideDeceleration: number = 30;

  // Add new properties for NPC behavior
  private lastTouchedWall: "left" | "right" = "left";
  job: null | NPCJob = null;
  private timeoutFunction: any;
  enableControls: boolean;

  isAutoRunMode: boolean = false;

  // Add new properties for double jump
  canDoubleJump: boolean = false;
  hasDoubleJumped: boolean = false;
  inDoubleJumpZone: boolean = false;

  isSitting: boolean = false;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    catName: string,
    blessings: Phaser.GameObjects.Sprite,
    type: CatAbilityType,
    enableControls: boolean = true,
    multiplier: number = 1
  ) {
    this.scene = scene;
    this.type = type;
    this.catName = catName;
    this.blessings = blessings;
    this.animationKeys = generateCatAnimationConfiguration(catName);
    this.sprite = this.scene.physics.add
      .sprite(x, y, this.catName)
      .setSize(28, 28)
      .setOffset(12, 8)
      .setDepth(4);
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "SPACE",
      upW: "W",
      left: "A",
      right: "D",
      dash: "Z",
      knockback: "Q",
    }) as KeyMap;

    // Disable controls if not enabled
    if (!enableControls) {
      this.cursors.up.enabled = false;
      this.cursors.down.enabled = false;
      this.cursors.left.enabled = false;
      this.cursors.right.enabled = false;
      Object.values(this.keys).forEach((key) => (key.enabled = false));
    }

    this.isHit = false;
    this.isDeath = false;
    this.isInvulnerable = false;
    this.hasKey = false;
    this.initAnimations();

    this.movement = new PlayerMovement(this);
    this.abilities = new Abilities(this, scene as Scene, type);

    this.collectiveItem = this.scene.physics.add
      .sprite(x, y, "collective-item")
      .setScale(0.5) // Adjust scale as needed
      .setDepth(-1); // Ensure it's behind the player
    this.collectiveItem.setVisible(false);

    this.enableControls = enableControls;

    if (multiplier >= 15) {
      this.enableDoubleJump();
    }
  }

  initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      const animKey = this.animationKeys[animationConfiguration.key];

      // Remove existing animation if it exists
      if (this.scene.anims.exists(animKey)) {
        this.scene.anims.remove(animKey);
      }

      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(this.catName, {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: animationConfiguration.frameRate,
        repeat: animationConfiguration.repeat,
      });
    }

    // Handle JUMPING_UP animation separately
    const jumpingUpKey = this.animationKeys[PlayerAnimation.JUMPING_UP];
    if (this.scene.anims.exists(jumpingUpKey)) {
      this.scene.anims.remove(jumpingUpKey);
    }

    this.scene.anims.create({
      key: jumpingUpKey,
      frames: this.scene.anims.generateFrameNumbers(this.catName, {
        start: 5 * maxAnimationFrames,
        end: 5 * maxAnimationFrames + 5,
      }),
      frameRate: 8,
      repeat: 0,
    });
  }
  collectItem(item: Phaser.Physics.Arcade.Sprite) {
    this.collectedItem = item;
    this.collectedItem.setVisible(true);
    this.collectedItem.setCollideWorldBounds(false);
  }

  updateCollectiveItem() {
    if (this.collectedItem) {
      const offsetX = this.sprite.flipX ? 20 : -20;
      this.collectedItem.setPosition(
        this.sprite.x + offsetX,
        this.sprite.y - 20
      );
      this.collectedItem.setDepth(11);
      this.collectedItem.setVisible(true);
    }
  }

  update() {
    if (this.enableControls) {
      // Existing player-controlled behavior
      this.movement.updateOngoingMovements();
    } else {
      // NPC behavior when controls are disabled
      if (!this.job) {
        this.updateNPCMovements();
      } else {
        this.updateNPCJob();
      }
    }

    // Continue with existing update logic
    if (this.collectedItem) {
      this.updateCollectiveItem();
    }

    if (this.blessings) {
      const velocityX = this.sprite.body!.velocity.x;
      const targetX = this.sprite.x + velocityX * 0.01;
      this.blessings.setVisible(true);
      this.blessings.setPosition(targetX, this.sprite.y - 5);
    }
  }

  private updateNPCMovements() {
    if (!this?.sprite?.anims?.play) return;

    const onGround =
      this.sprite.body instanceof Phaser.Physics.Arcade.Body &&
      this.sprite.body.onFloor();
    if (this.isJumping && onGround) {
      this.sprite.setVelocityY(-400);
      this.isJumping = true;
      return;
    }

    // Default walking behavior
    this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
    if (this.lastTouchedWall === "left") {
      this.sprite.setVelocityX(200);
    } else {
      this.sprite.setVelocityX(-200);
    }

    if (this.sprite.body!.blocked.left) {
      this.lastTouchedWall = "left";
      this.sprite.setFlipX(this.currentRotation);
    }
    if (this.sprite.body!.blocked.right) {
      this.sprite.setFlipX(!this.currentRotation);
      this.lastTouchedWall = "right";
    }
  }

  private updateNPCJob() {
    if (!this?.sprite?.anims?.play) return;

    if (this.job?.type === NPCJobType.RUN) {
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
      const xPositionDifference = (this.sprite.body?.x || 0) - this.job!.x!;
      this.sprite.setVelocityX(-xPositionDifference);

      if (this.sprite.body?.blocked.right || this.sprite.body?.blocked.left) {
        this.sprite.setVelocityY(-200);
      }

      this.sprite.setFlipX(xPositionDifference > 0);

      if (Math.abs(xPositionDifference) < 10) {
        this.job.callback?.();
        this.job = { type: NPCJobType.EAT }; // Change to EAT after reaching destination
      }
    } else if (this.job?.type === NPCJobType.EAT) {
      if (!this.timeoutFunction) {
        this.sprite.setVelocityX(0);
        this.timeoutFunction = setTimeout(() => {
          this.job = { type: NPCJobType.SLEEP };
          this.timeoutFunction = null;
        }, 3000); // Add a delay before sleeping (3 seconds of eating)
      }
      this.sprite.anims.play(
        this.animationKeys[PlayerAnimation.GROOMING],
        true
      );
    } else if (this.job?.type === NPCJobType.SLEEP) {
      this.sprite.setVelocityX(0);
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.SLEEP], true);
    }
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }

  // Add these helper methods
  setSleep() {
    if (this.job?.type === NPCJobType.SLEEP) {
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.SLEEP], true);
    }
  }

  setJob(job: NPCJob) {
    this.job = job;
    if (this.timeoutFunction) {
      clearTimeout(this.timeoutFunction);
      this.timeoutFunction = null;
    }
  }

  setAutoRunMode(speed: number, jumpSpeed: number) {
    this.isAutoRunMode = true;
    this.walkSpeed = speed;
    this.jumpSpeed = jumpSpeed;

    // Disable all controls except jumping
    if (this.keys) {
      this.keys.left.enabled = false;
      this.keys.right.enabled = false;
      this.keys.dash.enabled = false;
      this.keys.knockback.enabled = false;
    }

    if (this.cursors) {
      this.cursors.left.enabled = false;
      this.cursors.right.enabled = false;
    }

    // Update movement system
    if (this.movement) {
      this.movement.setAutoRunMode(true, speed, jumpSpeed);
    }
  }

  // Add method to enable Geometry Dash mode
  setGeometryDashMode(enabled: boolean) {
    if (this.movement) {
      this.movement.setGeometryDashMode(enabled);
    }
  }

  setSitting(sitting: boolean) {
    this.isSitting = sitting;
    if (sitting) {
      this.sprite.setVelocityX(0);
      this.sprite.setAccelerationX(0);
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.SITTING], true);
    }
  }

  enableDoubleJump() {
    this.canDoubleJump = true;
    this.hasDoubleJumped = false;
  }

  setCurrentRotation(reversed: boolean) {
    this.currentRotation = reversed;
    console.log("Current Rotation set to:", this.currentRotation);
}
}