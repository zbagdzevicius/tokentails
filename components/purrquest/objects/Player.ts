import { Scene, Physics, GameObjects } from "phaser";

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
};

type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

export class Player {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys: KeyMap;
  isJumping: boolean = false;
  wallJumpCount: number = 0;
  maxWallJumps: number = 1;
  isSliding: boolean = false;
  justJumped: boolean = false;
  disableLeftMovement: boolean = false;
  disableRightMovement: boolean = false;
  lastWallTouched: "left" | "right" | null = null;
  wallTouchTime: number = 0;
  jumpTimer: number = 0;

  moveLeftPressed: boolean = false;
  moveRightPressed: boolean = false;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add.sprite(x, y, "cat").setScale(0.5);
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.isJumping = false;
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "W",
      left: "A",
      right: "D",
    }) as KeyMap;

    this.initAnimations();
  }

  initAnimations() {
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

  update() {
    const leftKeyDown =
      this.keys.left.isDown || this.cursors.left.isDown || this.moveLeftPressed;
    const rightKeyDown =
      this.keys.right.isDown ||
      this.cursors.right.isDown ||
      this.moveRightPressed;
    const upKeyDown = this.keys.up.isDown || this.cursors.up.isDown;

    const touchingLeftWall =
      this.sprite.body!.blocked.left && !this.sprite.body!.blocked.down;
    const touchingRightWall =
      this.sprite.body!.blocked.right && !this.sprite.body!.blocked.down;
    const canWallJump =
      (upKeyDown &&
        (touchingLeftWall || touchingRightWall) &&
        touchingLeftWall &&
        this.lastWallTouched !== "left") ||
      (touchingRightWall && this.lastWallTouched !== "right");
    const blockedAbove = this.sprite.body!.blocked.up;
    const onGround = this.sprite.body!.blocked.down;

    if (!onGround && !blockedAbove && leftKeyDown) {
      this.sprite.setVelocityX(-150);
      this.sprite.setFlipX(true);
    } else if (!onGround && !blockedAbove && rightKeyDown) {
      this.sprite.setVelocityX(150);
      this.sprite.setFlipX(false);
    }

    if (touchingLeftWall || touchingRightWall) {
      this.wallTouchTime += this.scene.game.loop.delta;
    } else {
      this.wallTouchTime = 0;
    }

    if (!this.disableLeftMovement && leftKeyDown) {
      this.sprite.setVelocityX(-300);
      this.sprite.setFlipX(true);
      if (!this.isJumping) this.sprite.anims.play("run", true);
    } else if (!this.disableRightMovement && rightKeyDown) {
      this.sprite.setVelocityX(300);
      this.sprite.setFlipX(false);
      if (!this.isJumping) this.sprite.anims.play("run", true);
    } else {
      this.sprite.setVelocityX(0);
      if (!this.isJumping) this.sprite.anims.play("idle", true);
    }

    if (
      !blockedAbove &&
      (onGround || canWallJump) &&
      upKeyDown &&
      !this.justJumped
    ) {
      this.jump();
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
      this.isJumping = false;
      this.isSliding = false;
      this.wallJumpCount = 0;
      this.lastWallTouched = null;
      this.wallTouchTime = 0;
    }

    if (!onGround && !this.isSliding && this.sprite.body!.velocity.y < 0) {
      this.sprite.setFrame(3);
    } else if (this.isSliding) {
      this.sprite.setFrame(22);
    } else if (
      !onGround &&
      !this.isSliding &&
      this.sprite.body!.velocity.y > 0
    ) {
      this.sprite.setFrame(5);
    } else if (this.isJumping) {
      this.sprite.anims.stop();
      this.sprite.setFrame(2);
    }

    if (this.cursors.up.isUp && this.keys.up.isUp) {
      this.justJumped = false;
    }
    this.applyAdvancedGravity();
  }

  jump() {
    const touchingLeftWall =
      this.sprite.body!.blocked.left && !this.sprite.body!.blocked.down;
    const touchingRightWall =
      this.sprite.body!.blocked.right && !this.sprite.body!.blocked.down;
    const canWallJump = touchingLeftWall || touchingRightWall;
    const blockedAbove = this.sprite.body!.blocked.up;
    const onGround = this.sprite.body!.blocked.down;

    if (!blockedAbove && (onGround || canWallJump)) {
      this.justJumped = true;
      this.jumpTimer = this.scene.time.now;
      if (canWallJump) {
        this.wallJumpCount++;
        const jumpDirection = touchingLeftWall ? 1 : -1;
        this.sprite.setVelocityY(-400);
        this.sprite.setVelocityX(400 * jumpDirection); // wall jump push

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
        this.sprite.setVelocityY(-400);
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

  setCollideWorldBounds(value: boolean): void {
    this.sprite.setCollideWorldBounds(value);
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }

  getBody() {
    return this.sprite.body;
  }

  // for mobile devices
  moveLeft(press: boolean) {
    this.moveLeftPressed = press;
  }

  moveRight(press: boolean) {
    this.moveRightPressed = press;
  }
}
