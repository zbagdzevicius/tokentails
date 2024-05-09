import { Scene, Physics, GameObjects } from "phaser";

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
};

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

export class Player {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys: KeyMap;
  isJumping: boolean = false;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add.sprite(x, y, "cat").setScale(2);
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
    // movement animations
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
      frameRate: 8,
      repeat: -1,
    });
  }

  update() {
    // controls
    if (this.cursors.left.isDown || this.keys.left.isDown) {
      this.sprite.setVelocityX(-400);
      this.sprite.setFlipX(true);
      if (!this.isJumping) {
        this.sprite.anims.play("run", true);
      }
    } else if (this.cursors.right.isDown || this.keys.right.isDown) {
      this.sprite.setVelocityX(400);
      this.sprite.setFlipX(false);
      if (!this.isJumping) {
        this.sprite.anims.play("run", true);
      }
    } else {
      this.sprite.setVelocityX(0);
      if (!this.isJumping) {
        this.sprite.anims.play("idle", true);
      }
    }

    if (
      (this.cursors.up.isDown || this.keys.up.isDown) &&
      this.sprite.body!.touching.down
    ) {
      this.sprite.setVelocityY(-330);
      this.isJumping = true;
    }

    // Jump only if player is on the ground
    const onGround = (this.sprite.body as ExtendedBody).onFloor();
    if ((this.cursors.up.isDown || this.keys.up.isDown) && onGround) {
      this.sprite.setVelocityY(-330);
      this.isJumping = true;
    }

    if (!this.sprite.body!.touching.down && this.sprite.body!.velocity.y < 0) {
      // jumping
      this.sprite.setFrame(3);
      this.isJumping = true;
    } else if (
      !this.sprite.body!.touching.down &&
      this.sprite.body!.velocity.y > 0
    ) {
      // falling
      this.sprite.setFrame(5);
    } else {
      this.isJumping = false;
    }
  }

  // prevent player from falling off the screen
  setCollideWorldBounds(value: boolean): void {
    this.sprite.setCollideWorldBounds(value);
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }

  getBody() {
    return this.sprite.body;
  }
}
