import { PlayerAnimation } from "@/components/catbassadors/objects/Catbassador";
import Phaser from "phaser";
import { IPlayer } from "../PlayerMovement/IPlayer";
import { Tier } from "@/models/cats";

const wallSlidingThresholdMs = 200;

export class PlayerMovement {
  private player: IPlayer;
  public dashDisabled: boolean = false;

  private jumpStartTime: number = 0;
  private isJumpHeld: boolean = false;
  isGravityReversed: boolean = false;

  // Add new property for auto-run mode
  private isAutoRunMode: boolean = false;
  private autoRunSpeed: number = 0;
  private autoJumpSpeed: number = 0;

  // Add new property for Geometry Dash-style gravity flip
  private isGeometryDashMode: boolean = false;

  // Add new properties for gravity settings
  private baseGravity: number = 700;
  private fallingGravity: number = 1450;
  private reversedBaseGravity: number = -1150;
  private reversedFallingGravity: number = -1200;

  private midAirJumpUsed: boolean = false;
  private canMidAirJump: boolean = false;

  // Add flight mode properties
  private isFlightMode: boolean = false;
  private flightAscendSpeed: number = 390;
  private flightDescendSpeed: number = 390;
  private flightSmoothing: number = 0.13;
  private targetFlightVelocityY: number = 0;
  flightXSpeed: number = 270;

  private readonly midAirJumpVelocity: number;

  constructor(player: IPlayer) {
    this.player = player;
    this.player.sprite.setMaxVelocity(this.player.walkSpeed * 2, 1000000);
    this.midAirJumpVelocity = -this.player.jumpSpeed * 1.13;
  }

  setGravityReversed(reversed: boolean) {
    if (this.isGravityReversed === reversed) return;

    this.isGravityReversed = reversed;
    this.player.sprite.setFlipY(reversed);
    this.player.sprite.setGravityY(reversed ? -1450 : 1450);
  }

  // Add method to enable Geometry Dash mode
  setGeometryDashMode(enabled: boolean) {
    this.isGeometryDashMode = enabled;
    if (enabled) {
      // Set initial gravity to normal (down)
      this.setGravityReversed(false);
    }
  }

  public setMidAirJump(enabled: boolean) {
    this.canMidAirJump = enabled;
    if (!enabled) {
      this.midAirJumpUsed = false;
    }
  }

  public get geometryDashMode(): boolean {
    return this.isGeometryDashMode;
  }

  public setFlightMode(enabled: boolean) {
    this.isFlightMode = enabled;
    if (this.player.sprite.body) {
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
      if (enabled) {
        body.setAllowGravity(false);
        this.player.sprite.setVelocityY(0);
      } else {
        body.setAllowGravity(true);
        this.player.sprite.setAngle(0); // Reset rotation when flight mode is disabled
        // Reset velocities to prevent carrying over flight momentum
        this.player.sprite.setVelocityY(0);
        // Reset horizontal velocity if in auto-run mode, otherwise let normal movement take over
        if (this.isAutoRunMode) {
          this.player.sprite.setVelocityX(this.autoRunSpeed);
        }
      }
    }
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
      isSitting,
    } = this.player;

    if (!sprite || !sprite.body) {
      return;
    }
    if (this.isFlightMode) {
      // Flight mode: smooth ascend/descend with lerp
      const ascendKey =
        cursors.up.isDown ||
        keys.up.isDown ||
        keys.upW.isDown ||
        isMobileJumping;

      if (ascendKey) {
        this.targetFlightVelocityY = -this.flightAscendSpeed;
      } else {
        this.targetFlightVelocityY = this.flightDescendSpeed;
      }

      const currentVelY = sprite.body.velocity.y;
      const newVelY = Phaser.Math.Linear(
        currentVelY,
        this.targetFlightVelocityY,
        this.flightSmoothing,
      );
      sprite.setVelocityY(newVelY);

      // Set constant X velocity for flight mode
      sprite.setVelocityX(this.flightXSpeed);

      sprite.setAngle(Phaser.Math.Clamp(newVelY, -180, 180) * 0.1);

      // Optionally play a flying animation here
      // sprite.anims.play('flying', true);

      return;
    }

    if (this.player.isDashing) return;

    // If player is sitting, don't process movement
    if (isSitting) {
      sprite.setVelocityX(0);
      sprite.setAccelerationX(0);
      return;
    }

    if (
      (Phaser.Input.Keyboard.JustDown(keys.knockback) ||
        isMobileknockbackSpell) &&
      (this.player.tier === Tier.EPIC || this.player.tier === Tier.LEGENDARY)
    ) {
      abilities.performKnocbackSpell();
    }

    const leftKeyDown = cursors.left.isDown || keys.left.isDown || isMobileLeft;
    const rightKeyDown =
      cursors.right.isDown || keys.right.isDown || isMobileRight;
    const upKeyDown =
      cursors.up.isDown || keys.up.isDown || keys.upW.isDown || isMobileJumping;

    // Handle Geometry Dash-style gravity flip
    if (this.isGeometryDashMode) {
      this.handleGeometryDashGravity(upKeyDown);
    }

    let onGround = this.isGravityReversed
      ? sprite.body.blocked.up
      : sprite.body.blocked.down;

    if (this.canMidAirJump && !this.midAirJumpUsed) {
      onGround = true;
    }

    const touchingLeftWall = sprite.body.blocked.left && !onGround;
    const touchingRightWall = sprite.body.blocked.right && !onGround;

    const canWallJump =
      upKeyDown && !onGround && (touchingLeftWall || touchingRightWall);

    const blockedAbove = sprite.body.blocked.up;

    const now = this.player.scene.time.now;
    if (
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(keys.up) ||
      (isMobileJumping && !this.player.justJumped)
    ) {
      this.jumpStartTime = now;
      this.isJumpHeld = true;
    }

    // If in auto-run mode, handle simplified movement
    if (this.isAutoRunMode) {
      // Always run right at constant speed
      sprite.setVelocityX(this.autoRunSpeed);
      sprite.setFlipX(this.player.currentRotation);

      // Reset double jump when landing on ground
      if (onGround) {
        this.player.hasDoubleJumped = false;
      }

      // In Geometry Dash mode, don't handle jumping at all - let the gravity system handle it
      if (!this.isGeometryDashMode && upKeyDown && !this.player.justJumped) {
        if (
          onGround ||
          (this.player.canDoubleJump && !this.player.hasDoubleJumped)
        ) {
          // Regular jump from ground or double jump in air
          this.jump({
            canWallJump: false,
            touchingLeftWall: false,
            touchingRightWall: false,
            blockedAbove: false,
            onGround,
          });
        }
      }

      // Update animations
      if (!onGround) {
        sprite.anims.play(
          this.player.animationKeys[PlayerAnimation.JUMPING_UP],
          true,
        );
      } else {
        sprite.anims.play(
          this.player.animationKeys[PlayerAnimation.RUNNING],
          true,
        );
      }

      // Reset jump flag when key is released
      if (cursors.up.isUp && keys.up.isUp && !isMobileJumping) {
        this.player.justJumped = false;
      }

      this.applyAdvancedGravity();
      return;
    }

    if (!this.player.disableLeftMovement && leftKeyDown) {
      const currentVelocity = sprite.body.velocity.x;
      const targetVelocity = -this.player.walkSpeed;
      const newVelocity = Phaser.Math.Linear(
        currentVelocity,
        targetVelocity,
        0.1,
      );
      sprite.setVelocityX(newVelocity);

      sprite.setAccelerationX(-this.player.walkSpeed);
      sprite.setFlipX(!this.player.currentRotation);
    } else if (!this.player.disableRightMovement && rightKeyDown) {
      const currentVelocity = sprite.body.velocity.x;
      const targetVelocity = this.player.walkSpeed;
      const newVelocity = Phaser.Math.Linear(
        currentVelocity,
        targetVelocity,
        0.1,
      );
      sprite.setVelocityX(newVelocity);

      sprite.setAccelerationX(this.player.walkSpeed);
      sprite.setFlipX(this.player.currentRotation);
    } else {
      const currentVelocity = sprite.body.velocity.x;
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
        true,
      );
      this.player.sprite.angle += leftKeyDown ? -4 : 4;
    } else if (this.player.isJumping) {
      sprite.anims.play(
        this.player.animationKeys[PlayerAnimation.JUMPING_UP],
        true,
      );
      if (this.player.hasDoubleJumped) {
        this.player.sprite.angle += leftKeyDown ? -16 : 16;
      } else {
        this.player.sprite.angle = 0;
      }
    } else if (leftKeyDown || rightKeyDown) {
      sprite.anims.play(
        this.player.animationKeys[PlayerAnimation.RUNNING],
        true,
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

    // Disable regular jumping when in Geometry Dash mode
    if (
      !this.isGeometryDashMode &&
      (onGround ||
        canWallJump ||
        (this.player.canDoubleJump && !this.player.hasDoubleJumped) ||
        (this.canMidAirJump && !this.midAirJumpUsed)) &&
      upKeyDown
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
      sprite.setVelocityY(
        this.isGravityReversed
          ? -this.player.wallSlideSpeed
          : this.player.wallSlideSpeed,
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
      this.player.hasDoubleJumped = false;
      this.midAirJumpUsed = false;
    }

    if (cursors.up.isUp && keys.up.isUp && !isMobileJumping) {
      this.player.justJumped = false;
    }

    // Disable jump hold logic when in Geometry Dash mode
    if (
      !this.isGeometryDashMode &&
      (cursors.up.isDown ||
        keys.up.isDown ||
        keys.upW.isDown ||
        isMobileJumping) &&
      this.isJumpHeld
    ) {
      const timeJumping = now - this.jumpStartTime;
      if (timeJumping < this.player.coyoteTime) {
        if (sprite.body.velocity.y > this.player.maxJumpSpeed) {
          sprite.setVelocityY(sprite.body.velocity.y - 10);
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
    if (this.dashDisabled || this.player.tier !== Tier.LEGENDARY) return;
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
      this,
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
    if (
      onGround ||
      canWallJump ||
      (this.player.canDoubleJump && !this.player.hasDoubleJumped) ||
      (this.canMidAirJump && !this.midAirJumpUsed)
    ) {
      this.player.justJumped = true;
      this.player.jumpTimer = this.player.scene.time.now;

      // Play jump sound
      const jumpSound = this.player.scene.sound.add("jump", { volume: 0.2 });
      jumpSound.play();

      if (onGround && this.player.scene.anims.exists("splash-anim")) {
        let offsetX = this.player.currentRotation ? -20 : 20;
        let offsetY = -20;

        const splash = this.player.scene.add.sprite(
          this.player.sprite.x + offsetX,
          this.player.sprite.y + offsetY,
          "splash",
        );

        splash.setDepth(this.player.sprite.depth - 1); // Ensure it's behind the player
        splash.play("splash-anim");

        // Destroy the splash sprite after the animation completes
        splash.on("animationcomplete", () => {
          splash.destroy();
        });
      }

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
              0.1,
            );
            this.player.sprite.setVelocityX(newVelocity);
          },
          callbackScope: this,
          repeat: 8,
        });
      } else {
        const actuallyOnGround = this.isGravityReversed
          ? this.player.sprite.body!.blocked.up
          : this.player.sprite.body!.blocked.down;

        if (!actuallyOnGround && this.canMidAirJump && !this.midAirJumpUsed) {
          this.player.sprite.setVelocityY(this.midAirJumpVelocity);
          this.midAirJumpUsed = true;
        } else {
          this.player.sprite.setVelocityY(jumpSpeed);
        }

        // Handle double jump
        if (
          !onGround &&
          this.player.canDoubleJump &&
          !this.player.hasDoubleJumped
        ) {
          this.player.hasDoubleJumped = true;
        }
      }

      this.player.isJumping = true;
      this.player.isSliding = false;
    }
  }

  private applyAdvancedGravity() {
    const baseGravity = this.isGravityReversed
      ? this.reversedBaseGravity
      : this.baseGravity;
    const fallingGravity = this.isGravityReversed
      ? this.reversedFallingGravity
      : this.fallingGravity;

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

  toggleGravity() {
    this.setGravityReversed(!this.isGravityReversed);
  }

  setAutoRunMode(enabled: boolean, speed: number, jumpSpeed: number) {
    this.isAutoRunMode = enabled;
    this.autoRunSpeed = speed;
    this.autoJumpSpeed = jumpSpeed;
  }

  // Add method to handle Geometry Dash-style gravity
  private handleGeometryDashGravity(upKeyDown: boolean) {
    if (upKeyDown) {
      if (this.isGravityReversed) {
        this.player.sprite.setVelocityY(250);
      } else {
        // Normal gravity: go up
        this.player.sprite.setVelocityY(-250);
      }
    }
  }

  setGravitySettings(settings: {
    baseGravity?: number;
    fallingGravity?: number;
    reversedBaseGravity?: number;
    reversedFallingGravity?: number;
  }) {
    if (settings.baseGravity !== undefined)
      this.baseGravity = settings.baseGravity;
    if (settings.fallingGravity !== undefined)
      this.fallingGravity = settings.fallingGravity;
    if (settings.reversedBaseGravity !== undefined)
      this.reversedBaseGravity = settings.reversedBaseGravity;
    if (settings.reversedFallingGravity !== undefined)
      this.reversedFallingGravity = settings.reversedFallingGravity;

    // Apply the new gravity settings immediately
    this.applyAdvancedGravity();
  }
}
