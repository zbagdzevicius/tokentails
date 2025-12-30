import { GameObjects, Physics, Scene } from "phaser";

/**
 * Physics objects that could be colliders
 */
type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

interface ExtendedBody extends Physics.Arcade.Body {
  onFloor(): boolean;
}

export enum NPCJobType {
  EAT,
  RUN,
  SLEEP,
}

export interface NPCJob {
  x?: number;
  y?: number;
  type: NPCJobType;
  callback?: () => void;
}

export enum PlayerAnimation {
  SLEEP = "SLEEP",
  DIGGING = "DIGGING",
  GROOMING = "GROOMING",
  HIT = "HIT",
  IDLE = "IDLE",
  JUMPING = "JUMPING",
  JUMPING_UP = "JUMPING_UP",
  JUMPING_DOWN = "JUMPING_DOWN",
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
}[] = [
  { key: PlayerAnimation.SLEEP, frames: 7, repeat: 0 },
  { key: PlayerAnimation.DIGGING, frames: 4, repeat: -1 },
  { key: PlayerAnimation.GROOMING, frames: 15, repeat: -1 },
  { key: PlayerAnimation.HIT, frames: 7, repeat: 0 },
  { key: PlayerAnimation.IDLE, frames: 12, repeat: -1 },
  { key: PlayerAnimation.JUMPING, frames: 7, repeat: 0 },
  { key: PlayerAnimation.LOAF, frames: 9, repeat: -1 },
  { key: PlayerAnimation.RUNNING, frames: 4, repeat: -1 },
  { key: PlayerAnimation.SITTING, frames: 5, repeat: -1 },
  { key: PlayerAnimation.WALKING, frames: 8, repeat: 0 },
];

export class CatNpc {
  private scene: Scene;
  sprite: Physics.Arcade.Sprite;
  private isJumping: boolean = false;
  private lastTouchedWall: "left" | "right" = "left";
  private animation: PlayerAnimation = animationConfigurations[0].key;
  job: null | NPCJob = null;
  private timeoutFunction: any;
  private catName: string;
  blessing?: Phaser.GameObjects.Sprite;

  constructor(scene: Scene, x: number, y: number, catName: string) {
    this.scene = scene;
    this.catName = catName;
    this.sprite = this.scene.physics.add
      .sprite(x, y, catName)
      .setSize(32, 32)
      .setOffset(8, 4);

    this.initAnimations();
  }

  initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.get(animationConfiguration.key)?.destroy();
      this.scene.anims.create({
        key: animationConfiguration.key,
        frames: this.scene.anims.generateFrameNumbers(this.catName, {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: 8,
        repeat: animationConfiguration.repeat,
      });
    }
    this.scene.anims.get(PlayerAnimation.JUMPING_UP)?.destroy();
    this.scene.anims.create({
      key: PlayerAnimation.JUMPING_UP,
      frames: this.scene.anims.generateFrameNumbers(this.catName, {
        start: 5 * maxAnimationFrames,
        end: 5 * maxAnimationFrames + 5,
      }),
      frameRate: 8,
      repeat: 0,
    });
    this.scene.anims.get(PlayerAnimation.JUMPING_DOWN)?.destroy();
    this.scene.anims.create({
      key: PlayerAnimation.JUMPING_DOWN,
      frames: this.scene.anims.generateFrameNumbers(this.catName, {
        start: 5 * maxAnimationFrames + 5,
        end: 5 * maxAnimationFrames + 7,
      }),
      frameRate: 8,
      repeat: 0,
    });

    const interval = setInterval(() => {
      const animationIndex = animationConfigurations.findIndex(
        (configuration) => configuration.key === this.animation
      );
      const newIndex = animationIndex + 1;
      this.animation =
        animationConfigurations[newIndex % animationConfigurations.length].key;
    }, 2000);
    this.sprite.on("destroy", () => {
      clearInterval(interval);
      if (this.timeoutFunction) {
        clearTimeout(this.timeoutFunction);
      }
    });
  }

  update() {
    if (!this.job) {
      this.updateOngoingMovements();
    } else {
      this.updateOngoingJob();
    }
    if (this.blessing) {
      const velocityX = this.sprite.body!.velocity.x;
      const targetX = this.sprite.x + velocityX * 0.01;
      this.blessing.setVisible(true);
      this.blessing.setPosition(targetX, this.sprite.y - 5);
    }
  }

  private updateOngoingJob() {
    if (!this?.sprite?.anims?.play) {
      return;
    }
    if (this.job?.type === NPCJobType.RUN) {
      this.sprite.anims.play(PlayerAnimation.RUNNING, true);
      const xPositionDifference = (this.sprite.body?.x || 0) - this.job!.x!;
      this.sprite.setVelocityX(-xPositionDifference);
      if (this.sprite.body?.blocked.right || this.sprite.body?.blocked.left) {
        this.sprite.setVelocityY(-200);
      }
      if (xPositionDifference > 0) {
        this.sprite.setFlipX(true);
      } else {
        this.sprite.setFlipX(false);
      }

      if (Math.abs(xPositionDifference) < 10) {
        this.job.callback?.();
        this.job = { type: NPCJobType.EAT };
      }
    } else if (this.job?.type === NPCJobType.EAT) {
      if (!this.timeoutFunction) {
        this.sprite.setVelocityX(0);
        this.timeoutFunction = setTimeout(() => {
          this.job = { type: NPCJobType.SLEEP };
          this.timeoutFunction = null;
        }, 0);
      }
      this.sprite.anims.play(PlayerAnimation.GROOMING, true);
    }
  }
  setSleep() {
    if (this.job?.type === NPCJobType.SLEEP) {
      this.sprite.anims.play(PlayerAnimation.SLEEP, true);
    }
  }
  setJump(isJumping: boolean) {
    this.isJumping = isJumping;
    if (isJumping) {
      this.sprite.anims.play(PlayerAnimation.JUMPING_DOWN);
    }
  }

  private updateOngoingMovements() {
    if (!this?.sprite?.anims?.play) {
      return;
    }
    const onGround = (this.sprite.body as ExtendedBody).onFloor();
    if (this.isJumping && onGround) {
      this.sprite.setVelocityY(-400);
      this.isJumping = true;
      return;
    }

    if (
      [
        PlayerAnimation.RUNNING,
        PlayerAnimation.WALKING,
        PlayerAnimation.JUMPING,
        PlayerAnimation.HIT,
      ].includes(this.animation)
    ) {
      if (this.animation !== this.sprite.anims.currentAnim?.key) {
        this.sprite.anims.play(PlayerAnimation.RUNNING, true);
      }
      if (this.lastTouchedWall === "left") {
        this.sprite.setVelocityX(200);
      } else {
        this.sprite.setVelocityX(-200);
      }
      if (this.sprite.body!.blocked.left) {
        this.lastTouchedWall = "left";
        this.sprite.setFlipX(false);
      }
      if (this.sprite.body!.blocked.right) {
        this.sprite.setFlipX(true);
        this.lastTouchedWall = "right";
      }
      return;
    }
    this.sprite.setVelocityX(0);

    if (this.animation !== this.sprite.anims.currentAnim?.key) {
      this.sprite.anims.play(this.animation, true);
    }
    if (this.animation === PlayerAnimation.DIGGING) {
    }
    if (this.animation === PlayerAnimation.GROOMING) {
    }
    if (this.animation === PlayerAnimation.HIT) {
    }
    if (this.animation === PlayerAnimation.IDLE) {
    }
    if (this.animation === PlayerAnimation.LOAF) {
    }
    if (this.animation === PlayerAnimation.SITTING) {
    }
    if (this.animation === PlayerAnimation.SLEEP) {
    }
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider as any);
  }
}
