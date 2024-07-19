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
};

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

export class Cat {
  private scene: Scene;
  sprite: Physics.Arcade.Sprite;
  private isJumping: boolean = false;
  isMobileJumping: boolean = false;
  isMobileLeft: boolean = false;
  isMobileRight: boolean = false;
  private animation: PlayerAnimation = animationConfigurations[0].key;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: KeyMap;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add
      .sprite(x, y, "cat")
      .setSize(32, 32)
      .setOffset(8, 4);

    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "W",
      left: "A",
      right: "D",
      space: "SPACE",
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
    // controls
    if (this.cursors.left.isDown || this.keys.left.isDown || this.isMobileLeft) {
      this.sprite.setVelocityX(-400);
      this.sprite.setFlipX(true);
      if (!this.isJumping) {
        this.sprite.anims.play(PlayerAnimation.RUNNING, true);
      }
    } else if (this.cursors.right.isDown || this.keys.right.isDown || this.isMobileRight) {
      this.sprite.setVelocityX(400);
      this.sprite.setFlipX(false);
      if (!this.isJumping) {
        this.sprite.anims.play(PlayerAnimation.RUNNING, true);
      }
    } else {
      this.sprite.setVelocityX(0);
      if (!this.isJumping) {
        this.sprite.anims.play(PlayerAnimation.IDLE, true);
      }
    }

    if (
      (this.cursors.up.isDown ||
        this.keys.up.isDown ||
        this.keys.space.isDown || this.isMobileJumping) &&
      this.sprite.body!.touching.down
    ) {
      this.sprite.setVelocityY(-330);
      this.isJumping = true;
    }

    // Jump only if player is on the ground
    const onGround = (this.sprite.body as ExtendedBody).onFloor();
    if (
      (this.cursors.up.isDown ||
        this.keys.up.isDown ||
        this.keys.space.isDown || this.isMobileJumping) &&
      onGround
    ) {
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

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }
}
