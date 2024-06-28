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
  TOY_ALERT = "TOY_ALERT",
  TOY_ATTACK = "TOY_ATTACK",
  TOY_AWAKE = "TOY_AWAKE",
  TOY_DEATH = "TOY_DEATH",
  TOY_DOUBLE_PECK = "TOY_DOUBLE_PECK",
  TOY_FLY = "TOY_FLY",
  TOY_HURT = "TOY_HURT",
  TOY_IDLE = "TOY_IDLE",
  TOY_JUMP = "TOY_JUMP",
  TOY_PECK = "TOY_PECK",
  TOY_SING = "TOY_SING",
  TOY_SIT = "TOY_SIT",
  TOY_SLEEP = "TOY_SLEEP",
  TOY_SNORE = "TOY_SNORE",
  TOY_WALK = "TOY_WALK",
  TOY_APPEAR = "TOY_APPEAR",
}

const maxAnimationFrames = 10;
const animationConfigurations: {
  key: ToyAnimation;
  frames: number;
  repeat: -1 | 0;
}[] = [
  { key: ToyAnimation.TOY_ALERT, frames: 4, repeat: -1 },
  { key: ToyAnimation.TOY_ATTACK, frames: 4, repeat: -1 },
  { key: ToyAnimation.TOY_AWAKE, frames: 4, repeat: -1 },
  { key: ToyAnimation.TOY_DEATH, frames: 5, repeat: -1 },
  { key: ToyAnimation.TOY_DOUBLE_PECK, frames: 10, repeat: -1 },
  { key: ToyAnimation.TOY_FLY, frames: 6, repeat: -1 },
  { key: ToyAnimation.TOY_HURT, frames: 6, repeat: -1 },
  { key: ToyAnimation.TOY_IDLE, frames: 4, repeat: -1 },
  { key: ToyAnimation.TOY_JUMP, frames: 1, repeat: -1 },
  { key: ToyAnimation.TOY_PECK, frames: 6, repeat: -1 },
  { key: ToyAnimation.TOY_SING, frames: 6, repeat: -1 },
  { key: ToyAnimation.TOY_SIT, frames: 4, repeat: -1 },
  { key: ToyAnimation.TOY_SLEEP, frames: 3, repeat: -1 },
  { key: ToyAnimation.TOY_SNORE, frames: 6, repeat: -1 },
  { key: ToyAnimation.TOY_WALK, frames: 4, repeat: -1 },
  { key: ToyAnimation.TOY_APPEAR, frames: 8, repeat: -1 },
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
    this.sprite.anims.play(ToyAnimation.TOY_APPEAR);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.TOY_FLY);
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
    this.sprite.anims.play(ToyAnimation.TOY_HURT);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.TOY_ALERT);
      }
    }, 1000);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.TOY_DEATH);
      }
    }, 2000);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.TOY_SING);
      }
    }, 3000);

    this.sprite.setVelocityY(-100);
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(ToyAnimation.TOY_FLY);
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
