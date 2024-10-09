import { PlayerAnimation } from "@/components/purrquest/objects/Player";
import { IPlayer } from "../PlayerMovement/IPlayer";
import Phaser from "phaser";

const wallSlidingThresholdMs = 200;

export class PlayerMovement {
  private player: IPlayer;

  constructor(player: IPlayer) {
    this.player = player;
  }

  updateOngoingMovements() {
    const {
      sprite,
      cursors,
      keys,
      isMobileLeft,
      isMobileRight,
      isMobileJumping,
    } = this.player;

    if (this.player.isDashing) return;

    const leftKeyDown = cursors.left.isDown || keys.left.isDown || isMobileLeft;
    const rightKeyDown =
      cursors.right.isDown || keys.right.isDown || isMobileRight;
    const upKeyDown = cursors.up.isDown || keys.up.isDown || isMobileJumping;

    const touchingLeftWall =
      sprite.body!.blocked.left && !sprite.body!.blocked.down;
    const touchingRightWall =
      sprite.body!.blocked.right && !sprite.body!.blocked.down;

    const canWallJump =
      upKeyDown &&
      !sprite.body!.blocked.down &&
      // ((touchingLeftWall && this.player.lastWallTouched !== "left") ||
      //   (touchingRightWall && this.player.lastWallTouched !== "right"));
      ((touchingLeftWall) ||
        (touchingRightWall));

    const blockedAbove = sprite.body!.blocked.up;
    const onGround = sprite.body!.blocked.down;

    if (!this.player.disableLeftMovement && leftKeyDown) {
      sprite.setVelocityX(-this.player.walkSpeed);
      sprite.setFlipX(true);
    } else if (!this.player.disableRightMovement && rightKeyDown) {
      sprite.setVelocityX(this.player.walkSpeed);
      sprite.setFlipX(false);
    } else {
      sprite.setVelocityX(0);
    }

    if (this.player.isSliding) {
      sprite.anims.play(PlayerAnimation.SITTING, true);
    } else if (this.player.isJumping) {
      sprite.anims.play(PlayerAnimation.JUMPING_UP, true);
    } else if (leftKeyDown || rightKeyDown) {
      sprite.anims.play(PlayerAnimation.RUNNING, true);
    } else {
      sprite.anims.play(PlayerAnimation.IDLE, true);
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
    this.applyAdvancedGravity();
  }

  private handleDash() {
    const dashKeyDown =
      Phaser.Input.Keyboard.JustDown(this.player.keys.dash) ||
      this.player.isMobileDash;

    if (dashKeyDown && this.player.canDash) {
      this.dash();
      this.player.isMobileDash = false;
    }
  }

  private dash() {
    this.player.canDash = false;
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
    this.player.sprite.setVelocityX(0);

    this.player.scene.time.delayedCall(this.player.dashCooldown, () => {
      this.player.canDash = true;
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
      this.player.justJumped = true;
      this.player.jumpTimer = this.player.scene.time.now;
      if (canWallJump) {
        this.player.wallJumpCount++;
        const jumpDirection = touchingLeftWall ? 1 : -1;
        this.player.sprite.setVelocityY(this.player.jumpSpeed);
        this.player.sprite.setVelocityX(this.player.walkSpeed * jumpDirection); // wall jump push

        if (touchingLeftWall) {
          this.player.disableLeftMovement = true;
          this.player.lastWallTouched = "left";
          this.player.scene.time.addEvent({
            delay: 300,
            callback: () => {
              this.player.disableLeftMovement = false;
            },
            callbackScope: this,
          });
        } else if (touchingRightWall) {
          this.player.disableRightMovement = true;
          this.player.lastWallTouched = "right";
          this.player.scene.time.addEvent({
            delay: 300,
            callback: () => {
              this.player.disableRightMovement = false;
            },
            callbackScope: this,
          });
        }

        this.player.scene.time.addEvent({
          delay: 10,
          callback: () => {
            const currentFps = this.player.scene.game.loop.actualFps;

            const jumpValue = currentFps <= 30 ? 700 : 1500;

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
        this.player.sprite.setVelocityY(this.player.jumpSpeed);
      }
      this.player.isJumping = true;
      this.player.isSliding = false;
    }
  }

  private applyAdvancedGravity() {
    if (this.player.sprite.body!.velocity.y > 0) {
      this.player.sprite.setGravityY(500);
    } else {
      this.player.sprite.setGravityY(450);
    }
  }
}
