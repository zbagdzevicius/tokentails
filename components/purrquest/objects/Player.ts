import { Scene, Physics, GameObjects } from "phaser";

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  dash: Phaser.Input.Keyboard.Key;
};

type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

export class Player {
  private scene: Scene;
  public sprite: Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys: KeyMap;

  private isJumping: boolean = false;
  private wallJumpCount: number = 0;
  private maxWallJumps: number = 1;
  private isSliding: boolean = false;
  private justJumped: boolean = false;
  private disableLeftMovement: boolean = false;
  private disableRightMovement: boolean = false;
  private lastWallTouched: "left" | "right" | null = null;
  private wallTouchTime: number = 0;
  private jumpTimer: number = 0;

  public isMobileLeft: boolean = false;
  public isMobileRight: boolean = false;
  public isMobileJumping: boolean = false;
  public isMobileDash: boolean = false;

  private canDash: boolean = true;
  private isDashing: boolean = false;
  private dashTime: number = 200; // Duration of dash in ms
  private dashCooldown: number = 600; // Cooldown time before dashing again
  private dashSpeed: number = 600; // Speed during dash

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add.sprite(x, y, "cat");
    this.sprite.body?.setSize(30, 30);
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "W",
      left: "A",
      right: "D",
      dash: "SPACE",
    }) as KeyMap;

    this.initAnimations();
  }

  private initAnimations() {
    this.scene.anims.create({
      key: "idle",
      frames: this.scene.anims.generateFrameNumbers("cat", {
        start: 7,
        end: 21,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.scene.anims.create({
      key: "run",
      frames: this.scene.anims.generateFrameNumbers("cat", {
        start: 0,
        end: 6,
      }),
      frameRate: 12,
      repeat: -1,
    });
    this.scene.anims.create({
      key: "slide",
      frames: this.scene.anims.generateFrameNumbers("cat", {
        start: 22,
        end: 25,
      }),
      frameRate: 8,
      repeat: -1,
    });
  }

  public update() {
    this.handleMovement();
    this.handleJump();
    this.handleDash();
    this.updateAnimations();
    this.applyAdvancedGravity();
  }

  private handleMovement() {
    const leftKeyDown = this.isKeyDown(
      this.keys.left,
      this.cursors.left,
      this.isMobileLeft
    );
    const rightKeyDown = this.isKeyDown(
      this.keys.right,
      this.cursors.right,
      this.isMobileRight
    );

    if (this.isDashing) return;

    if (leftKeyDown && !this.disableLeftMovement) {
      this.sprite.setVelocityX(-300);
      this.sprite.setFlipX(true);
      if (!this.isJumping) this.sprite.anims.play("run", true);
    } else if (rightKeyDown && !this.disableRightMovement) {
      this.sprite.setVelocityX(300);
      this.sprite.setFlipX(false);
      if (!this.isJumping) this.sprite.anims.play("run", true);
    } else {
      this.sprite.setVelocityX(0);
      if (!this.isJumping) this.sprite.anims.play("idle", true);
    }
  }

  private handleJump() {
    const upKeyDown = this.isKeyDown(
      this.keys.up,
      this.cursors.up,
      this.isMobileJumping
    );
    const onGround = this.sprite.body!.blocked.down;
    const touchingLeftWall =
      this.sprite.body!.blocked.left && !this.sprite.body!.blocked.down;
    const touchingRightWall =
      this.sprite.body!.blocked.right && !this.sprite.body!.blocked.down;
    const canWallJump =
      upKeyDown &&
      (touchingLeftWall || touchingRightWall) &&
      this.lastWallTouched !== (touchingLeftWall ? "left" : "right");

    if (upKeyDown && !this.justJumped && (onGround || canWallJump)) {
      this.jump(canWallJump, touchingLeftWall, touchingRightWall);
    } else if (
      !onGround &&
      (touchingLeftWall || touchingRightWall) &&
      this.wallTouchTime > 200
    ) {
      this.isSliding = true;
      this.sprite.setVelocityY(100);
      this.sprite.anims.play("slide", true);
      this.sprite.setFrame(22);
    } else if (!onGround) {
      this.isJumping = true;
      this.isSliding = false;
    } else {
      this.resetJumpingState();
    }

    if (this.cursors.up.isUp && this.keys.up.isUp) {
      this.justJumped = false;
    }

    this.updateWallTouchTime(touchingLeftWall || touchingRightWall);
  }

  private jump(
    canWallJump: boolean,
    touchingLeftWall: boolean,
    touchingRightWall: boolean
  ) {
    const jumpVelocity = -400;
    this.justJumped = true;
    this.jumpTimer = this.scene.time.now;

    if (canWallJump) {
      this.wallJump(touchingLeftWall, touchingRightWall, jumpVelocity);
    } else {
      this.sprite.setVelocityY(jumpVelocity);
    }
    this.isJumping = true;
    this.isSliding = false;
  }

  private wallJump(
    touchingLeftWall: boolean,
    touchingRightWall: boolean,
    jumpVelocity: number
  ) {
    const jumpDirection = touchingLeftWall ? 1 : -1;
    this.sprite.setVelocityY(jumpVelocity);
    this.sprite.setVelocityX(400 * jumpDirection);

    this.disableMovementAndSetWallTouched(touchingLeftWall, touchingRightWall);
    this.applyWallJumpVelocity(jumpDirection);
  }

  private disableMovementAndSetWallTouched(
    touchingLeftWall: boolean,
    touchingRightWall: boolean
  ) {
    if (touchingLeftWall) {
      this.disableLeftMovement = true;
      this.lastWallTouched = "left";
    } else if (touchingRightWall) {
      this.disableRightMovement = true;
      this.lastWallTouched = "right";
    }
    this.resetMovementAfterDelay(this.lastWallTouched!);
  }

  private applyWallJumpVelocity(jumpDirection: number) {
    this.scene.time.addEvent({
      delay: 10,
      callback: () => {
        const currentVelocity = this.sprite.body!.velocity.x;
        const targetVelocity = 2000 * jumpDirection;
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
  }

  private resetMovementAfterDelay(side: "left" | "right") {
    this.scene.time.addEvent({
      delay: 300,
      callback: () => {
        if (side === "left") this.disableLeftMovement = false;
        if (side === "right") this.disableRightMovement = false;
      },
      callbackScope: this,
    });
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

  private updateAnimations() {
    const onGround = this.sprite.body!.blocked.down;
    const isFalling = this.sprite.body!.velocity.y > 0;

    if (!onGround && !this.isSliding && this.sprite.body!.velocity.y < 0) {
      this.sprite.setFrame(3);
    } else if (this.isSliding) {
      this.sprite.setFrame(22);
    } else if (!onGround && !this.isSliding && isFalling) {
      this.sprite.setFrame(5);
    } else if (this.isJumping) {
      this.sprite.anims.stop();
      this.sprite.setFrame(2);
    }
  }

  private applyAdvancedGravity() {
    const gravity = this.sprite.body!.velocity.y > 0 ? 500 : 450;
    this.sprite.setGravityY(gravity);
  }

  private resetJumpingState() {
    this.isJumping = false;
    this.isSliding = false;
    this.wallJumpCount = 0;
    this.lastWallTouched = null;
    this.wallTouchTime = 0;
  }

  private updateWallTouchTime(touchingWall: boolean) {
    if (touchingWall) {
      this.wallTouchTime += this.scene.game.loop.delta;
    } else {
      this.wallTouchTime = 0;
    }
  }

  private isKeyDown(
    key: Phaser.Input.Keyboard.Key,
    cursorKey: Phaser.Input.Keyboard.Key,
    isMobile: boolean
  ): boolean {
    return key.isDown || cursorKey.isDown || isMobile;
  }

  public setCollideWorldBounds(value: boolean): void {
    this.sprite.setCollideWorldBounds(value);
  }

  public addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }

  public getBody() {
    return this.sprite.body;
  }
}
