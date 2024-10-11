import { GameObjects, Physics, Scene } from "phaser";
import { IPlayer } from "@/components/Phaser/PlayerMovement/IPlayer";
import { PlayerMovement } from "@/components/Phaser/PlayerMovement/PlayerMovement";

/**
 * Physics objects that could be colliders
 */
type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  dash: Phaser.Input.Keyboard.Key;
};

export enum PlayerAnimation {
  SLEEP = "SLEEP",
  DIGGING = "DIGGING",
  GROOMING = "GROOMING",
  HIT = "HIT",
  IDLE = "IDLE",
  JUMPING = "JUMPING",
  JUMPING_UP = "JUMPING_UP",
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

export class Cat implements IPlayer {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  isJumping: boolean = false;
  isMobileJumping: boolean = false;
  isMobileLeft: boolean = false;
  isMobileDash: boolean = false;
  wallJumpCount: number = 0;
  isMobileRight: boolean = false;
  lastWallTouched: "left" | "right" | null = null;
  wallTouchTime: number = 0;
  disableLeftMovement: boolean = false;
  disableRightMovement: boolean = false;
  justJumped: boolean = false;
  isSliding: boolean = false;
  jumpTimer: number = 0;
  animation: PlayerAnimation = animationConfigurations[0].key;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: KeyMap;

  canDash: boolean = true;
  isDashing: boolean = false;
  readonly dashTime: number = 200; // Duration of dash in ms
  readonly dashCooldown: number = 300; // Cooldown time before dashing again
  readonly dashSpeed: number = 640; // Speed during dash
  readonly walkSpeed: number = 320;
  readonly jumpSpeed: number = -448;
  readonly wallSlideSpeed: number = 96;

  movement: PlayerMovement;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add
      .sprite(x, y, "cat")
      .setSize(28, 28)
      .setOffset(12, 8);

    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "W",
      left: "A",
      right: "D",
      dash: "SPACE",
    }) as KeyMap;

    this.initAnimations();

    this.movement = new PlayerMovement(this);
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
  }

  update() {
    this.movement.updateOngoingMovements();
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }
}
