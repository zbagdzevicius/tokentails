import { Scene, Physics, GameObjects } from "phaser";
import { PlayerMovement } from "@/components/Phaser/PlayerMovement/PlayerMovement";
import { IPlayer } from "@/components/Phaser/PlayerMovement/IPlayer";
export type KeyMap = {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  dash: Phaser.Input.Keyboard.Key;
};

export type ColliderType =
  | Physics.Arcade.Image
  | Physics.Arcade.Sprite
  | Physics.Arcade.StaticGroup
  | GameObjects.Rectangle;

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

export class Player implements IPlayer {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  isJumping: boolean = false;
  isMobileJumping: boolean = false;
  isMobileLeft: boolean = false;
  wallJumpCount: number = 0;
  isMobileRight: boolean = false;
  lastWallTouched: "left" | "right" | null = null;
  wallTouchTime: number = 0;
  disableLeftMovement: boolean = false;
  disableRightMovement: boolean = false;
  justJumped: boolean = false;
  isSliding: boolean = false;
  jumpTimer: number = 0;
  private animation: PlayerAnimation = animationConfigurations[0].key;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: KeyMap;
  isMobileDash: boolean = false;

  canDash: boolean = true;
  isDashing: boolean = false;
  dashTime: number = 200;
  dashCooldown: number = 600;
  dashSpeed: number = 600;

  readonly walkSpeed: number = 320;
  readonly jumpSpeed: number = -420;
  readonly wallSlideSpeed: number = 100;

  movement: PlayerMovement;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = this.scene.physics.add.sprite(x, y, "cat");
    this.sprite.body?.setSize(26, 26);
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
      if (!this.scene.anims.exists(animationConfiguration.key)) {
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
    }

    if (!this.scene.anims.exists(PlayerAnimation.JUMPING_UP)) {
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
  }

  update() {
    this.movement.updateOngoingMovements();
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }
}
