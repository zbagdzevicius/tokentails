import { PlayerAnimation } from "@/components/catbassadors/objects/Catbassador";
import Phaser from "phaser";
import { IPlayer } from "../PlayerMovement/IPlayer";

const wallSlidingThresholdMs = 200;

export class PlayerMovement {
  private player: IPlayer;

  private jumpStartTime: number = 0;
  private isJumpHeld: boolean = false;
  isGravityReversed: boolean = false;

  constructor(player: IPlayer) {
    this.player = player;
    this.player.sprite.setMaxVelocity(this.player.walkSpeed * 2, 1000000);
  }

  setGravityReversed(reversed: boolean) {
    if (this.isGravityReversed === reversed) return;

    this.isGravityReversed = reversed;
    this.player.sprite.setFlipY(reversed);
    this.player.sprite.setGravityY(reversed ? -450 : 450);
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
      isOnIcyTile,
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

    const onGround = this.isGravityReversed
      ? sprite.body!.blocked.up
      : sprite.body!.blocked.down;

    const touchingLeftWall = sprite.body!.blocked.left && !onGround;
    const touchingRightWall = sprite.body!.blocked.right && !onGround;

    const canWallJump =
      upKeyDown && !onGround && (touchingLeftWall || touchingRightWall);

    const blockedAbove = sprite.body!.blocked.up;

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
      const decelerationRate = isOnIcyTile
        ? this.player.walkSpeed / 35
        : this.player.walkSpeed / 10;

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
    if ((onGround || canWallJump) && upKeyDown && !this.player.justJumped) {
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
      sprite.setVelocityY(
        this.isGravityReversed
          ? -this.player.wallSlideSpeed
          : this.player.wallSlideSpeed
      );
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

  private jump({
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
    if (onGround || canWallJump) {
      this.player.justJumped = true;
      this.player.jumpTimer = this.player.scene.time.now;

      const jumpSpeed = this.isGravityReversed
        ? this.player.jumpSpeed
        : -this.player.jumpSpeed;

      if (canWallJump) {
        this.player.wallJumpCount++;
        const jumpDirection = touchingLeftWall ? 1 : -1;
        this.player.sprite.setVelocityY(jumpSpeed);

        this.player.sprite.setVelocityX(this.player.jumpSpeed);

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

        this.player.scene.time.addEvent({
          delay: 10,
          callback: () => {
            const jumpValue = 350;
            const currentVelocity = this.player.sprite.body!.velocity.x;
            const targetVelocity = jumpValue * jumpDirection;
            const newVelocity = Phaser.Math.Linear(
              currentVelocity,
              targetVelocity,
              0.1
            );
            this.player.sprite.setVelocityX(newVelocity);
          },
          callbackScope: this,
          repeat: 8,
        });
      } else {
        this.player.sprite.setVelocityY(jumpSpeed);
      }

      this.player.isJumping = true;
      this.player.isSliding = false;
    }
  }

  private applyAdvancedGravity() {
    const baseGravity = this.isGravityReversed ? -1150 : 400;
    const fallingGravity = this.isGravityReversed ? -1200 : 450;

    if (this.isGravityReversed) {
      if (this.player.sprite.body!.velocity.y < 0) {
        this.player.sprite.setGravityY(fallingGravity);
      } else {
        this.player.sprite.setGravityY(baseGravity);
      }
    } else {
      if (this.player.sprite.body!.velocity.y > 0) {
        this.player.sprite.setGravityY(fallingGravity);
      } else {
        this.player.sprite.setGravityY(baseGravity);
      }
    }
  }

  public toggleGravity() {
    this.setGravityReversed(!this.isGravityReversed);
  }
}
