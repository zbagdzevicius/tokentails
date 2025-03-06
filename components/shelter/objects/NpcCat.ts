import { ICat } from "@/models/cats";
import { Scene, Physics } from "phaser";

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

export const maxAnimationFrames = 15;
export const animationConfigurations = [
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

export function generateCatAnimationConfiguration(
  catName: string
): ICatAnimationKeysMap {
  const map = {} as ICatAnimationKeysMap;
  for (const key of Object.values(PlayerAnimation)) {
    map[key] = `${catName}_${key}`;
  }
  return map;
}

export class NpcCat {
  scene: Scene;
  sprite: Physics.Arcade.Sprite;
  blessings?: Phaser.GameObjects.Sprite;
  animationKeys: ICatAnimationKeysMap;
  direction: number;
  speed: number = 45;
  isLoafing: boolean = false;
  originalData: ICat = {} as ICat;
  randomActionTimer!: Phaser.Time.TimerEvent;

  constructor(scene: Scene, x: number, y: number, catName: string) {
    this.scene = scene;
    this.animationKeys = generateCatAnimationConfiguration(catName);
    this.direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;

    this.sprite = this.scene.physics.add
      .sprite(x, y, catName)
      .setSize(28, 28)
      .setOffset(12, 8);
    this.sprite.body!.setSize(40, 50); // Set larger width and height for the hitbox
    this.sprite.body!.setOffset(0, -14);
    this.sprite.setCollideWorldBounds(true);
    this.initAnimations(catName);
    this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
    this.sprite.setVelocityX(this.speed * this.direction);
    this.sprite?.setDepth(2);
    this.startRandomActions();
    this.sprite.setFlipX(this.direction === -1);
    this.sprite.setVelocityX(this.speed * this.direction);
  }

  private initAnimations(catName: string) {
    for (const animationConfiguration of animationConfigurations) {
      const animKey = this.animationKeys[animationConfiguration.key];

      // Skip if animation already exists
      if (this.scene.anims.exists(animKey)) continue;

      const index = animationConfigurations.indexOf(animationConfiguration);
      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(catName, {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + animationConfiguration.frames - 1,
        }),
        frameRate: animationConfiguration.frameRate,
        repeat: animationConfiguration.repeat,
      });
    }
  }

  private updateBlessingPosition() {
    if (this.blessings) {
      this.blessings.setPosition(this.sprite.x, this.sprite.y - 5);
    }
  }
  startRandomActions() {
    this.randomActionTimer = this.scene.time.addEvent({
      delay: Phaser.Math.Between(2000, 5000),
      callback: this.performRandomAction,
      callbackScope: this,
      loop: true,
    });
  }

  performRandomAction() {
    if (this.isLoafing) return;

    const actions = ["jump", "sit", "emote"];
    const randomAction = Phaser.Math.RND.pick(actions);

    switch (randomAction) {
      case "jump":
        this.handleJump();
        break;
      case "sit":
        this.handleSit();
        break;
      case "emote":
        this.handleEmote();
        break;
    }
  }

  handleJump() {
    if (!this.sprite.body!.blocked.down) return;

    this.sprite.setVelocityY(-350);
    this.sprite.anims.play(this.animationKeys[PlayerAnimation.JUMPING], true);

    this.scene.time.delayedCall(500, () => {
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
    });
  }

  handleSit() {
    this.isLoafing = true;
    this.sprite.setVelocityX(0);
    this.sprite.anims.play(this.animationKeys[PlayerAnimation.SITTING], true);

    this.scene.time.delayedCall(2000, () => {
      this.isLoafing = false;
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
      this.sprite.setVelocityX(this.speed * this.direction);
    });
  }

  handleEmote() {
    const emotes = [PlayerAnimation.GROOMING, PlayerAnimation.IDLE];
    const randomEmote = Phaser.Math.RND.pick(emotes);

    this.isLoafing = true;
    this.sprite.setVelocityX(0);
    this.sprite.anims.play(this.animationKeys[randomEmote], true);

    this.scene.time.delayedCall(1500, () => {
      this.isLoafing = false;
      this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
      this.sprite.setVelocityX(this.speed * this.direction);
    });
  }

  handleLoaf() {
    this.isLoafing = true;
    this.sprite.setVelocityX(0);
    this.sprite.anims.play(this.animationKeys[PlayerAnimation.LOAF], true);
  }

  handleLoafReset() {
    this.isLoafing = false;
    this.sprite.setVelocityX(this.speed * this.direction);
    this.sprite.anims.play(this.animationKeys[PlayerAnimation.RUNNING], true);
  }

  update() {
    if (!this.sprite.body) return;

    if (this.sprite.body.blocked.left) {
      this.direction = 1;
      this.sprite.setFlipX(false);
    } else if (this.sprite.body.blocked.right) {
      this.direction = -1;
      this.sprite.setFlipX(true);
    }
    if (!this.isLoafing) {
      this.sprite.setVelocityX(this.speed * this.direction);
    }

    this.updateBlessingPosition();
  }

  destroy() {
    if (this.randomActionTimer) {
      this.randomActionTimer.remove(false);
    }

    if (this.blessings) {
      this.blessings.destroy();
    }

    if (this.sprite) {
      this.sprite.destroy();
    }
  }
}
