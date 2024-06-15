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

const toySpeed = 300;

export enum ToyAnimation {
  ALERT = "ALERT",
  ATTACK = "ATTACK",
  AWAKE = "AWAKE",
  DEATH = "DEATH",
  DOUBLE_PECK = "DOUBLE_PECK",
  FLY = "FLY",
  HURT = "HURT",
  IDLE = "IDLE",
  JUMP = "JUMP",
  PECK = "PECK",
  SING = "SING",
  SIT = "SIT",
  SLEEP = "SLEEP",
  SNORE = "SNORE",
  WALK = "WALK",
  APPEAR = "APPEAR",
}

const maxAnimationFrames = 10;
const animationConfigurations: {
  key: ToyAnimation;
  frames: number;
  repeat: -1 | 0;
}[] = [
  { key: ToyAnimation.ALERT, frames: 4, repeat: -1 },
  { key: ToyAnimation.ATTACK, frames: 4, repeat: -1 },
  { key: ToyAnimation.AWAKE, frames: 4, repeat: -1 },
  { key: ToyAnimation.DEATH, frames: 5, repeat: -1 },
  { key: ToyAnimation.DOUBLE_PECK, frames: 10, repeat: -1 },
  { key: ToyAnimation.FLY, frames: 6, repeat: -1 },
  { key: ToyAnimation.HURT, frames: 6, repeat: -1 },
  { key: ToyAnimation.IDLE, frames: 4, repeat: -1 },
  { key: ToyAnimation.JUMP, frames: 1, repeat: -1 },
  { key: ToyAnimation.PECK, frames: 6, repeat: -1 },
  { key: ToyAnimation.SING, frames: 6, repeat: -1 },
  { key: ToyAnimation.SIT, frames: 4, repeat: -1 },
  { key: ToyAnimation.SLEEP, frames: 3, repeat: -1 },
  { key: ToyAnimation.SNORE, frames: 6, repeat: -1 },
  { key: ToyAnimation.WALK, frames: 4, repeat: -1 },
  { key: ToyAnimation.APPEAR, frames: 8, repeat: -1 },
];

export class Toy {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  isJumping: boolean = false;
  lastTouchedWall: "left" | "right" = "left";
  animation: ToyAnimation = animationConfigurations[0].key;
  initialYPosition = 0;
  atOriginalPosition = true;
  debouncePassed = true;

  constructor(scene: Scene, x: number, y: number) {
    this.initialYPosition = y;
    this.scene = scene;
    this.sprite = this.scene.physics.add.sprite(x, y, "bird").setSize(32, 32);
    this.sprite.setGravityY(-800);

    this.initAnimations();
  }

  initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.create({
        key: animationConfiguration.key,
        frames: this.scene.anims.generateFrameNumbers("bird", {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: 8,
        repeat: animationConfiguration.repeat,
      });
    }
    this.sprite.anims.play(ToyAnimation.APPEAR);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.FLY);
      }
    }, 1000)

    setInterval(() => {
      const animationIndex = animationConfigurations.findIndex(
        (configuration) => configuration.key === this.animation
      );
      const newIndex = animationIndex + 1;
      this.animation =
        animationConfigurations[newIndex % animationConfigurations.length].key;
    }, 2000);
  }

  private goToInitialPosition() {
    const yPositionDifference =
      (this.sprite.body?.y || 0) - this.initialYPosition;
    this.sprite.setVelocityY(-yPositionDifference);
  }

  update() {
    this.updateOngoingMovements();
    if (this.debouncePassed) {
      this.goToInitialPosition();
    }
  }

  bounce() {
    this.debouncePassed = false;
    this.sprite.anims.play(ToyAnimation.HURT);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.ALERT);
      }
    }, 1000);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.DEATH);
      }
    }, 2000);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.SING);
      }
    }, 3000);

    this.sprite.setVelocityY(-100);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.FLY);
        this.debouncePassed = true;
      }
    }, 4000);
  }

  private updateOngoingMovements() {
    if (this.lastTouchedWall === "left") {
      this.sprite.setVelocityX(toySpeed);
    } else {
      this.sprite.setVelocityX(-toySpeed);
    }
    if (this.sprite.body!.blocked.left) {
      this.lastTouchedWall = "left";
      this.sprite.setFlipX(false);
    }
    if (this.sprite.body!.blocked.right) {
      this.sprite.setFlipX(true);
      this.lastTouchedWall = "right";
    }
  }

  addCollider(collider: ColliderType) {
    if (this) {
      this.scene.physics.add.collider(this.sprite, collider);
    }
  }
}
