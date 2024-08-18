import { Scene, Physics, GameObjects } from "phaser";

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

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  dash: Phaser.Input.Keyboard.Key;
};

const wallSlidingThresholdMs = 200;

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

const velocityY = 420;

export class Cat {
  private scene: Scene;
  sprite: Physics.Arcade.Sprite;
  private isJumping: boolean = false;
  isMobileJumping: boolean = false;
  isMobileLeft: boolean = false;
  wallJumpCount: number = 0;
  isMobileRight: boolean = false;
  lastWallTouched: "left" | "right" | null = null;
  wallTouchTime: number = 0;
  disableLeftMovement: boolean = false;
  disableRightMovement: boolean = false;
  justJumped: boolean = false;
  isSliding: boolean = false;
  jumpTimer: number = 0;
  private animation: PlayerAnimation = animationConfigurations[0].key;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: KeyMap;
  isMobileDash: boolean = false;

  canDash: boolean = true;
  isDashing: boolean = false;
  dashTime: number = 200; // Duration of dash in ms
  dashCooldown: number = 600; // Cooldown time before dashing again
  dashSpeed: number = 600; // Speed during dash

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add
      .sprite(x, y, "cat")
      .setSize(28, 28)
      .setOffset(12, 8);

    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "W",
      left: "A",
      right: "D",
      dash: "SPACE",
    }) as KeyMap;

    this.initAnimations();
  }

  initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.create({
        key: animationConfiguration.key,
        frames: this.scene.anims.generateFrameNumbers("cat", {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: 8,
        repeat: animationConfiguration.repeat,
      });
    }
    this.scene.anims.create({
      key: PlayerAnimation.JUMPING_UP,
      frames: this.scene.anims.generateFrameNumbers("cat", {
        start: 5 * maxAnimationFrames,
        end: 5 * maxAnimationFrames + 5,
      }),
      frameRate: 8,
      repeat: 0,
    });
    this.scene.anims.create({
      key: PlayerAnimation.JUMPING_DOWN,
      frames: this.scene.anims.generateFrameNumbers("cat", {
        start: 5 * maxAnimationFrames + 5,
        end: 5 * maxAnimationFrames + 7,
      }),
      frameRate: 8,
      repeat: 0,
    });

    setInterval(() => {
      const animationIndex = animationConfigurations.findIndex(
        (configuration) => configuration.key === this.animation
      );
      const newIndex = animationIndex + 1;
      this.animation =
        animationConfigurations[newIndex % animationConfigurations.length].key;
    }, 2000);
  }

  update() {
    this.updateOngoingMovements();
  }

  private updateOngoingMovements() {
    if (this.isDashing) return;
  
    const leftKeyDown =
      this.cursors.left.isDown || this.keys.left.isDown || this.isMobileLeft;
    const rightKeyDown =
      this.cursors.right.isDown || this.keys.right.isDown || this.isMobileRight;
    const upKeyDown =
      this.cursors.up.isDown ||
      this.keys.up.isDown ||
      this.isMobileJumping;

    const touchingLeftWall =
      this.sprite.body!.blocked.left && !this.sprite.body!.blocked.down;
    const touchingRightWall =
      this.sprite.body!.blocked.right && !this.sprite.body!.blocked.down;

    const canWallJump =
      upKeyDown &&
      !this.sprite.body!.blocked.down &&
      ((touchingLeftWall && this.lastWallTouched !== "left") ||
        (touchingRightWall && this.lastWallTouched !== "right"));

    const blockedAbove = this.sprite.body!.blocked.up;
    const onGround = this.sprite.body!.blocked.down;

    if (!this.disableLeftMovement && leftKeyDown) {
      this.sprite.setVelocityX(-300);
      this.sprite.setFlipX(true);
    } else if (!this.disableRightMovement && rightKeyDown) {
      this.sprite.setVelocityX(300);
      this.sprite.setFlipX(false);
    } else {
      this.sprite.setVelocityX(0);
    }

    if (this.isJumping) {
      this.sprite.anims.play(PlayerAnimation.JUMPING_UP, true);
    } else if (leftKeyDown || rightKeyDown) {
      this.sprite.anims.play(PlayerAnimation.RUNNING, true);
    } else {
      this.sprite.anims.play(PlayerAnimation.IDLE, true);
    }

    if (touchingLeftWall || touchingRightWall) {
      this.wallTouchTime += this.scene.game.loop.delta;
    } else {
      this.wallTouchTime = 0;
    }


    this.handleDash();

    if (
      // SHOULD JUMP
      !blockedAbove &&
      (onGround || canWallJump) &&
      upKeyDown &&
      !this.justJumped
    ) {
      this.jump({
        canWallJump,
        touchingLeftWall,
        touchingRightWall,
        blockedAbove,
        onGround,
      });
    } else if (
      // IS SLIDING
      !onGround &&
      (touchingLeftWall || touchingRightWall) &&
      this.wallTouchTime > wallSlidingThresholdMs
    ) {
      this.isSliding = true;
      this.sprite.setVelocityY(100);
    } else if (!onGround) {
      this.isJumping = true;
      this.isSliding = false;
    } else {
      this.isJumping = false;
      this.isSliding = false;
      this.wallJumpCount = 0;
      this.lastWallTouched = null;
      this.wallTouchTime = 0;
    }

    if (
      this.cursors.up.isUp &&
      this.keys.up.isUp &&
      !this.isMobileJumping
    ) {
      this.justJumped = false;
    }
    this.applyAdvancedGravity();
  }

  private handleDash() {
    const dashKeyDown =
      Phaser.Input.Keyboard.JustDown(this.keys.dash) || this.isMobileDash;

    if (dashKeyDown && this.canDash) {
      this.dash();
      this.isMobileDash = false;
    }
  }

  private dash() {
    this.canDash = false;
    this.isDashing = true;
    const direction = this.sprite.flipX ? -1 : 1;
    this.sprite.setVelocityX(this.dashSpeed * direction);
    this.sprite.setVelocityY(0);

    this.scene.time.delayedCall(this.dashTime, this.stopDash, [], this);
  }

  private stopDash() {
    this.isDashing = false;
    this.sprite.setVelocityX(0);

    this.scene.time.delayedCall(this.dashCooldown, () => {
      this.canDash = true;
    });
  }

  jump({
    canWallJump,
    touchingLeftWall,
    touchingRightWall,
    blockedAbove,
    onGround,
  }: {
    canWallJump: boolean;
    touchingLeftWall: boolean;
    touchingRightWall: boolean;
    blockedAbove: boolean;
    onGround: boolean;
  }) {
    if (!blockedAbove && (onGround || canWallJump)) {
      this.justJumped = true;
      this.jumpTimer = this.scene.time.now;
      if (canWallJump) {
        this.wallJumpCount++;
        const jumpDirection = touchingLeftWall ? 1 : -1;
        this.sprite.setVelocityY(-velocityY);
        this.sprite.setVelocityX(velocityY * jumpDirection); // wall jump push

        if (touchingLeftWall) {
          this.disableLeftMovement = true;
          this.lastWallTouched = "left";
          this.scene.time.addEvent({
            delay: 300,
            callback: () => {
              this.disableLeftMovement = false;
            },
            callbackScope: this,
          });
        } else if (touchingRightWall) {
          this.disableRightMovement = true;
          this.lastWallTouched = "right";
          this.scene.time.addEvent({
            delay: 300,
            callback: () => {
              this.disableRightMovement = false;
            },
            callbackScope: this,
          });
        }

        this.scene.time.addEvent({
          delay: 10,
          callback: () => {
            const currentVelocity = this.sprite.body!.velocity.x;
            const targetVelocity = 2000 * jumpDirection; // jump top velocity
            const newVelocity = Phaser.Math.Linear(
              currentVelocity,
              targetVelocity,
              0.1
            );
            this.sprite.setVelocityX(newVelocity);
          },
          callbackScope: this,
          repeat: 15,
        });
      } else {
        this.sprite.setVelocityY(-velocityY);
      }
      this.isJumping = true;
      this.isSliding = false;
    }
  }

  applyAdvancedGravity() {
    if (this.sprite.body!.velocity.y > 0) {
      this.sprite.setGravityY(500); // Increase fall gravity
    } else {
      this.sprite.setGravityY(450); // Normal gravity
    }
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }
}
