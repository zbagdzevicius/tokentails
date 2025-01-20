import { PlayerAnimation } from "@/components/catbassadors/objects/Catbassador";
import Phaser from "phaser";
import { IPlayer } from "../PlayerMovement/IPlayer";

const wallSlidingThresholdMs = 200;

const elementHueRotation = {
  ELECTRIC: 60, // Yellow
  STORM: 120, // Green
  FIRE: 30, // Orange
  WIND: 180, // Cyan
  DARK: 240, // Blue
  WATER: 200, // Aqua Blue
  AIR: 150, // Greenish Cyan
  EARTH: 25, // Yellowish Brown
  ICE: 210, // Light Blue
  NATURE: 90, // Lime Green
  SAND: 45, // Yellow Ochre
  TAILS: 270, // Purple
  LEGENDARY: 300, // Pinkish Purple
};

export class PlayerMovement {
  private player: IPlayer;

  private jumpSound: Phaser.Sound.BaseSound;
  private dashSound: Phaser.Sound.BaseSound;

  private jumpStartTime: number = 0;
  private isJumpHeld: boolean = false;

  constructor(player: IPlayer) {
    this.player = player;
    this.player.sprite.setMaxVelocity(this.player.walkSpeed * 2, 1000000);

    this.jumpSound = this.player.scene.sound.add("jump-sound");
    this.dashSound = this.player.scene.sound.add("dash-sound");
  }

  updateOngoingMovements() {
    const {
      sprite,
      cursors,
      keys,
      isMobileLeft,
      isMobileRight,
      isMobileJumping,
      isMobileknockbackSpell,
      abilities,
    } = this.player;

    if (this.player.isDashing) return;

    if (
      Phaser.Input.Keyboard.JustDown(keys.knockback) ||
      isMobileknockbackSpell
    ) {
      abilities.performKnocbackSpell();
    }

    const leftKeyDown = cursors.left.isDown || keys.left.isDown || isMobileLeft;
    const rightKeyDown =
      cursors.right.isDown || keys.right.isDown || isMobileRight;
    const upKeyDown =
      cursors.up.isDown || keys.up.isDown || keys.upW.isDown || isMobileJumping;

    const touchingLeftWall =
      sprite.body!.blocked.left && !sprite.body!.blocked.down;
    const touchingRightWall =
      sprite.body!.blocked.right && !sprite.body!.blocked.down;

    const canWallJump =
      upKeyDown &&
      !sprite.body!.blocked.down &&
      (touchingLeftWall || touchingRightWall);

    const blockedAbove = sprite.body!.blocked.up;
    const onGround = sprite.body!.blocked.down;

    const now = this.player.scene.time.now;
    if (
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(keys.up) ||
      (isMobileJumping && !this.player.justJumped)
    ) {
      this.jumpStartTime = now;
      this.isJumpHeld = true;
    }

    if (!this.player.disableLeftMovement && leftKeyDown) {
      const currentVelocity = sprite.body!.velocity.x;
      const targetVelocity = -this.player.walkSpeed;
      const newVelocity = Phaser.Math.Linear(
        currentVelocity,
        targetVelocity,
        0.1
      );
      sprite.setVelocityX(newVelocity);

      sprite.setAccelerationX(-this.player.walkSpeed);
      sprite.setFlipX(true);
    } else if (!this.player.disableRightMovement && rightKeyDown) {
      const currentVelocity = sprite.body!.velocity.x;
      const targetVelocity = this.player.walkSpeed;
      const newVelocity = Phaser.Math.Linear(
        currentVelocity,
        targetVelocity,
        0.1
      );
      sprite.setVelocityX(newVelocity);

      sprite.setAccelerationX(this.player.walkSpeed);
      sprite.setFlipX(false);
    } else {
      const currentVelocity = sprite.body!.velocity.x;
      const decelerationRate = this.player.walkSpeed / 10;

      if (Math.abs(currentVelocity) <= decelerationRate) {
        sprite.setVelocityX(0);
        sprite.setAccelerationX(0);
      } else {
        if (currentVelocity > 0) {
          sprite.setVelocityX(currentVelocity - decelerationRate);
        } else {
          sprite.setVelocityX(currentVelocity + decelerationRate);
        }
      }
      sprite.setAccelerationX(0);
    }

    if (this.player.isHit) {
      if (
        sprite.anims.currentAnim?.key !==
        this.player.animationKeys[PlayerAnimation.HIT]
      ) {
        sprite.anims.play(this.player.animationKeys[PlayerAnimation.HIT], true);
        sprite.once("animationcomplete", () => {
          this.player.isHit = false;
        });
      }
      return;
    } else if (this.player.isDeath) {
      if (
        sprite.anims.currentAnim?.key !==
        this.player.animationKeys[PlayerAnimation.HIT]
      ) {
        sprite.anims.play(this.player.animationKeys[PlayerAnimation.HIT], true);
        sprite.angle = 0;
      }
    } else if (this.player.isSliding) {
      sprite.anims.play(
        this.player.animationKeys[PlayerAnimation.SITTING],
        true
      );
      this.player.sprite.angle += leftKeyDown ? -4 : 4;
    } else if (this.player.isJumping) {
      sprite.anims.play(
        this.player.animationKeys[PlayerAnimation.JUMPING_UP],
        true
      );
      this.player.sprite.angle += leftKeyDown ? -16 : 16;
    } else if (leftKeyDown || rightKeyDown) {
      sprite.anims.play(
        this.player.animationKeys[PlayerAnimation.RUNNING],
        true
      );
      this.player.sprite.angle = 0;
    } else {
      sprite.anims.play(this.player.animationKeys[PlayerAnimation.IDLE], true);
      this.player.sprite.angle = 0;
    }

    if (touchingLeftWall || touchingRightWall) {
      this.player.wallTouchTime += this.player.scene.game.loop.delta;
    } else {
      this.player.wallTouchTime = 0;
    }

    this.handleDash();

    if (
      !blockedAbove &&
      (onGround || canWallJump) &&
      upKeyDown &&
      !this.player.justJumped
    ) {
      this.jump({
        canWallJump,
        touchingLeftWall,
        touchingRightWall,
        blockedAbove,
        onGround,
      });
    } else if (
      !onGround &&
      (touchingLeftWall || touchingRightWall) &&
      this.player.wallTouchTime > wallSlidingThresholdMs
    ) {
      this.player.isSliding = true;
      sprite.setVelocityY(this.player.wallSlideSpeed);
    } else if (!onGround) {
      this.player.isJumping = true;
      this.player.isSliding = false;
    } else {
      this.player.isJumping = false;
      this.player.isSliding = false;
      this.player.wallJumpCount = 0;
      this.player.lastWallTouched = null;
      this.player.wallTouchTime = 0;
    }

    if (cursors.up.isUp && keys.up.isUp && !isMobileJumping) {
      this.player.justJumped = false;
    }
    if (
      (cursors.up.isDown ||
        keys.up.isDown ||
        keys.upW.isDown ||
        isMobileJumping) &&
      this.isJumpHeld
    ) {
      const timeJumping = now - this.jumpStartTime;
      if (timeJumping < this.player.coyoteTime) {
        if (sprite.body!.velocity.y > this.player.maxJumpSpeed) {
          sprite.setVelocityY(sprite.body!.velocity.y - 10);
        }
      } else {
        this.isJumpHeld = false;
      }
    } else {
      this.isJumpHeld = false;
    }

    this.applyAdvancedGravity();
  }

  private handleDash() {
    const dashKeyDown =
      Phaser.Input.Keyboard.JustDown(this.player.keys.dash) ||
      this.player.isMobileDash;

    if (dashKeyDown) {
      this.dash();
      if (this.dashSound) {
        this.dashSound.play();
      }
      this.player.isMobileDash = false;
    }
  }

  private dash() {
    this.player.isDashing = true;
    const direction = this.player.sprite.flipX ? -1 : 1;
    this.player.sprite.setVelocityX(this.player.dashSpeed * direction);
    this.player.sprite.setVelocityY(0);

    this.player.scene.time.delayedCall(
      this.player.dashTime,
      this.stopDash,
      [],
      this
    );
  }

  private stopDash() {
    this.player.isDashing = false;
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
      this.player.justJumped = true;
      this.player.jumpTimer = this.player.scene.time.now;

      const increasedJumpSpeed = this.player.jumpSpeed * 1.4;

      if (this.jumpSound) {
        this.jumpSound.play();
      }

      if (canWallJump) {
        this.player.wallJumpCount++;
        const jumpDirection = touchingLeftWall ? 1 : -1;

        const offsetX = touchingLeftWall ? 4 : -0;
        const offsetY = -20;

        const wallJumpAnimation = this.player.scene.add.sprite(
          this.player.sprite.x + offsetX,
          this.player.sprite.y + offsetY,
          "jump-wall"
        );
        wallJumpAnimation.setOrigin(0.5);
        wallJumpAnimation.setAngle(touchingLeftWall ? 90 : -90);
        wallJumpAnimation.anims.play("jump_wall_anim", true);

        const elementType = this.player.type;
        const hueRotation = elementHueRotation[elementType] || 0;

        // Apply hue rotation to the wall jump animation
        this.applyHueRotation(wallJumpAnimation, hueRotation);

        wallJumpAnimation.once(
          Phaser.Animations.Events.ANIMATION_COMPLETE,
          () => {
            wallJumpAnimation.destroy();
          }
        );

        // Apply player velocity
        this.player.sprite.setVelocityY(increasedJumpSpeed);
        this.player.sprite.setVelocityX(this.player.jumpSpeed * jumpDirection);

        if (touchingLeftWall) {
          this.player.disableLeftMovement = true;
          this.player.lastWallTouched = "left";
          this.player.scene.time.addEvent({
            delay: 250,
            callback: () => {
              this.player.disableLeftMovement = false;
            },
            callbackScope: this,
          });
        } else if (touchingRightWall) {
          this.player.disableRightMovement = true;
          this.player.lastWallTouched = "right";
          this.player.scene.time.addEvent({
            delay: 250,
            callback: () => {
              this.player.disableRightMovement = false;
            },
            callbackScope: this,
          });
        }

        // Fine-tune jump direction over time
        this.player.scene.time.addEvent({
          delay: 10,
          callback: () => {
            const jumpValue = 250;
            const currentVelocity = this.player.sprite.body!.velocity.x;
            const targetVelocity = jumpValue * jumpDirection;
            const newVelocity = Phaser.Math.Linear(
              currentVelocity,
              targetVelocity,
              0.2
            );
            this.player.sprite.setVelocityX(newVelocity);
          },
          callbackScope: this,
          repeat: 8,
        });
      } else {
        this.player.sprite.setVelocityY(increasedJumpSpeed);
      }
    }
  }

  private applyHueRotation(
    sprite: Phaser.GameObjects.Sprite,
    hue: number
  ): void {
    const color = Phaser.Display.Color.HSVToRGB(hue / 360, 1, 1).color;
    sprite.setTint(color);
  }

  private applyAdvancedGravity() {
    if (this.player.sprite.body!.velocity.y > 0) {
      this.player.sprite.setGravityY(500);
    } else {
      this.player.sprite.setGravityY(450);
    }
  }
}
