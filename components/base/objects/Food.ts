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

export enum FoodAnimation {
  FOOD_IDLE = "FOOD_IDLE",
  FOOD_APPEAR = "FOOD_APPEAR",
  FOOD_DISAPPEAR = "FOOD_DISAPPEAR",
}

const maxAnimationFrames = 9;
const animationConfigurations: {
  key: FoodAnimation;
  frames: number;
  repeat: -1 | 0;
}[] = [
  { key: FoodAnimation.FOOD_IDLE, frames: 1, repeat: 0 },
  { key: FoodAnimation.FOOD_APPEAR, frames: maxAnimationFrames, repeat: 0 },
  { key: FoodAnimation.FOOD_DISAPPEAR, frames: maxAnimationFrames, repeat: 0 },
];

export class Food {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add.sprite(x, y, "food").setSize(32, 32);
    this.initAnimations();
    this.spawn();
  }

  initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.create({
        key: animationConfiguration.key,
        frames: this.scene.anims.generateFrameNumbers("food", {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: 9,
        repeat: animationConfiguration.repeat,
      });
    }
  }

  spawn() {
    this.sprite.anims.play(FoodAnimation.FOOD_APPEAR, true);
  }

  eaten(fn: () => void) {
    setTimeout(() => {
      if (this?.sprite?.anims?.play) {
        this.sprite.anims.play(FoodAnimation.FOOD_DISAPPEAR, true);
      }
    }, 2000);
    setTimeout(() => {
      if (fn) {
        fn();
      }
    }, 4000);
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider as any);
  }
}
