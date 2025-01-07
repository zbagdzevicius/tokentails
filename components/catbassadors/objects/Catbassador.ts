import { GameObjects, Physics, Scene } from "phaser";
import { IPlayer } from "@/components/Phaser/PlayerMovement/IPlayer";
import { PlayerMovement } from "@/components/Phaser/PlayerMovement/PlayerMovement";
import { catWalkSpeed } from "@/models/game";
import { Abilities } from "./Abilities";
import { PurrquestScene } from "@/components/purrquest/scenes/PurrquestScene";
import { CatbassadorsScene } from "../scenes/CatbassadorsScene";
import { CatAbilityType } from "@/models/cats";

type GameScene = PurrquestScene  | CatbassadorsScene
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
  knockback: Phaser.Input.Keyboard.Key;
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
  frameRate: number;
}[] = [
  { key: PlayerAnimation.SLEEP, frames: 7, repeat: 0, frameRate: 8 },
  { key: PlayerAnimation.DIGGING, frames: 4, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.GROOMING, frames: 15, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.HIT, frames: 7, repeat: 0, frameRate: 12 },
  { key: PlayerAnimation.IDLE, frames: 12, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.JUMPING, frames: 7, repeat: 0, frameRate: 8 },
  { key: PlayerAnimation.LOAF, frames: 9, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.RUNNING, frames: 4, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.SITTING, frames: 5, repeat: -1, frameRate: 8 },
  { key: PlayerAnimation.WALKING, frames: 8, repeat: 0, frameRate: 8 },
];

type ICatAnimationKey = `${string}_${PlayerAnimation}`;
export type ICatAnimationKeysMap = Record<PlayerAnimation, ICatAnimationKey>;

function generateCatAnimationConfiguration(
  catName: string
): ICatAnimationKeysMap {
  const map = {} as ICatAnimationKeysMap;
  Object.keys(PlayerAnimation).map(
    (key) =>
      (map[key as PlayerAnimation] = `${catName}_${key as PlayerAnimation}`)
  );
  return map;
}

export class Cat implements IPlayer {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  blessings: Phaser.GameObjects.Sprite;
  isJumping: boolean = false;
  isMobileJumping: boolean = false;
  isMobileLeft: boolean = false;
  isMobileDash: boolean = false;
  isMobileknockbackSpell:boolean = false;
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
  animationKeys: ICatAnimationKeysMap;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: KeyMap;
  isHit!: boolean;
  isDeath!: boolean;
  hasKey!: boolean;
  isInvulnerable: boolean;
  private catName: string;
  abilities: Abilities;
  type!:CatAbilityType
  
  isDashing: boolean = false;
  readonly dashTime: number = 200; // Duration of dash in ms
  readonly dashCooldown: number = 300; // Cooldown time before dashing again
  readonly dashSpeed: number = 640; // Speed during dash
  walkSpeed: number = catWalkSpeed;
  readonly jumpSpeed: number = -418;
  readonly wallSlideSpeed: number = 96;
  readonly maxJumpSpeed:number = -618;  
  readonly coyoteTime:number = 200;   
  movement: PlayerMovement;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    catName: string,
    blessings: Phaser.GameObjects.Sprite,
    type:CatAbilityType
  ) {
    this.scene = scene;
    this.type = type;
    this.catName = catName;
    this.blessings = blessings;
    this.animationKeys = generateCatAnimationConfiguration(catName);
    this.sprite = this.scene.physics.add
      .sprite(x, y, this.catName)
      .setSize(28, 28)
      .setOffset(12, 8);
    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.keys = this.scene.input.keyboard!.addKeys({
      up: "W",
      left: "A",
      right: "D",
      dash: "SPACE",
      knockback: "Q",
    }) as KeyMap;

    this.initAnimations();

    this.movement = new PlayerMovement(this);
    this.isInvulnerable = false;
    this.abilities = new Abilities(this, scene as GameScene, type);
  }

  initAnimations() {
    for (const animationConfiguration of animationConfigurations) {
      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.create({
        key: this.animationKeys[animationConfiguration.key],
        frames: this.scene.anims.generateFrameNumbers(this.catName, {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: animationConfiguration.frameRate,
        repeat: animationConfiguration.repeat,
      });
    }
    this.scene.anims.create({
      key: this.animationKeys[PlayerAnimation.JUMPING_UP],
      frames: this.scene.anims.generateFrameNumbers(this.catName, {
        start: 5 * maxAnimationFrames,
        end: 5 * maxAnimationFrames + 5,
      }),
      frameRate: 8,
      repeat: 0,
    });
  }

  update() {
    this.movement.updateOngoingMovements();
    
    if (this.blessings) {
      const velocityX = this.sprite.body!.velocity.x;
      const targetX = this.sprite.x + velocityX * 0.01;
      this.blessings.setVisible(true);
      this.blessings.setPosition(targetX, this.sprite.y - 5);
    }
  }

  addCollider(collider: ColliderType) {
    this.scene.physics.add.collider(this.sprite, collider);
  }

}
