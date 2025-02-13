import { Scene, Physics } from "phaser";

export enum DogAnimation {
  CROUCHED = "CROUCHED",
  DAMAGE = "DAMAGE",
  DEAD = "DEAD",
  JUMPING = "JUMPING",
  LYING = "LYING",
  RUNNING = "RUNNING",
  SITTING = "SITTING",
  SNIFFING = "SNIFFING",
  WALKING = "WALKING",
}

export const MAX_ANIMATION_FRAMES = 8;

export const JUMP_LAYER_TILES = [47, 48, 49, 50];

export const animationConfigurations = [
  { key: DogAnimation.CROUCHED, frames: 7, repeat: 0, frameRate: 8 },
  { key: DogAnimation.DAMAGE, frames: 5, repeat: -1, frameRate: 8 },
  { key: DogAnimation.DEAD, frames: 5, repeat: -1, frameRate: 8 },
  { key: DogAnimation.JUMPING, frames: 5, repeat: 0, frameRate: 8 },
  { key: DogAnimation.LYING, frames: 4, repeat: -1, frameRate: 8 },
  { key: DogAnimation.RUNNING, frames: 3, repeat: -1, frameRate: 8 },
  { key: DogAnimation.SITTING, frames: 5, repeat: -1, frameRate: 8 },
  { key: DogAnimation.SNIFFING, frames: 8, repeat: -1, frameRate: 8 },
  { key: DogAnimation.WALKING, frames: 7, repeat: 0, frameRate: 8 },
];

type IDogAnimationKey = `${string}_${DogAnimation}`;
export type IDogAnimationKeysMap = Record<DogAnimation, IDogAnimationKey>;

export function generateDogAnimationConfiguration(
  dogName: string
): IDogAnimationKeysMap {
  const map = {} as IDogAnimationKeysMap;
  for (const key of Object.values(DogAnimation)) {
    map[key] = `${dogName}_${key}`;
  }
  return map;
}

export class DogBot {
  private scene: Scene;
  public sprite: Physics.Arcade.Sprite;
  private animationKeys: IDogAnimationKeysMap;

  private direction = 1;
  private speed = 150;
  private detectionRange = 400;
  private jumpForce = -550;
  private jumpCooldown = 1000; // ms
  private lastJumpTime = 0;
  private isJumping = false;

  private player?: Physics.Arcade.Sprite;

  private lastRandomMoveTime = 0;
  private randomMoveInterval = 2000;

  constructor(scene: Scene, x: number, y: number, dogName: string) {
    this.scene = scene;
    this.animationKeys = generateDogAnimationConfiguration(dogName);

    this.sprite = scene.physics.add.sprite(x, y, dogName).setSize(32, 38);
    this.sprite.setOffset(0, 0).setBounce(0.1);

    animationConfigurations.forEach((config, i) => {
      scene.anims.create({
        key: this.animationKeys[config.key],
        frames: scene.anims.generateFrameNumbers(dogName, {
          start: i * MAX_ANIMATION_FRAMES,
          end: i * MAX_ANIMATION_FRAMES + config.frames - 1,
        }),
        frameRate: config.frameRate,
        repeat: config.repeat,
      });
    });

    this.sprite.anims.play(this.animationKeys[DogAnimation.SITTING]);
  }

  public setTarget(player: Physics.Arcade.Sprite) {
    this.player = player;
  }

  public update() {
    if (!this.player) return;

    this.handleFleeFromPlayer();
    this.handleCollisionsAndJumps();
    this.handleIdleMovement();
    this.updateAnimations();
  }

  private handleFleeFromPlayer() {
    const distanceToPlayer = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      this.player!.x,
      this.player!.y
    );

    if (distanceToPlayer < this.detectionRange) {
      // Run away
      this.direction = this.sprite.x < this.player!.x ? -1 : 1;
      this.sprite.setVelocityX(this.direction * this.speed);
      this.sprite.setFlipX(this.direction === -1);
    } else {
      // If no threat, dog's velocity is set in handleIdleMovement()
    }
  }

  private handleCollisionsAndJumps() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const onGround = body.blocked.down;
    const blockedLeft = body.blocked.left;
    const blockedRight = body.blocked.right;
    const blockedHorizontally = blockedLeft || blockedRight;
    const timeNow = this.scene.time.now;

    if (this.isJumping) {
      if (onGround) {
        this.isJumping = false;
      }
      return;
    }

    if (
      onGround &&
      blockedHorizontally &&
      timeNow > this.lastJumpTime + this.jumpCooldown
    ) {
      this.isJumping = true;
      this.lastJumpTime = timeNow;

      if (blockedLeft && blockedRight) {
        this.sprite.setVelocityY(this.jumpForce * 1.2);
      } else {
        this.sprite.setVelocityY(this.jumpForce);
      }

      if (blockedLeft) {
        this.direction = 1;
      } else if (blockedRight) {
        this.direction = -1;
      }
      this.sprite.setFlipX(this.direction === -1);
      this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);
    }
  }

  private handleIdleMovement() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    if (Math.abs(body.velocity.x) > 10) {
      return;
    }

    const timeNow = this.scene.time.now;
    if (timeNow > this.lastRandomMoveTime + this.randomMoveInterval) {
      const randomDir = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      this.sprite.setVelocityX(randomDir * (this.speed * 0.5));

      this.sprite.setFlipX(randomDir === -1);

      this.scene.time.delayedCall(500, () => {
        this.sprite.setVelocityX(0);
      });

      this.lastRandomMoveTime = timeNow;
    }
  }

  private updateAnimations() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    if (this.isJumping) {
      return;
    }

    if (Math.abs(body.velocity.x) > 20) {
      this.sprite.anims.play(this.animationKeys[DogAnimation.RUNNING], true);
    } else {
      if (Math.random() < 0.2) {
        this.sprite.anims.play(this.animationKeys[DogAnimation.SNIFFING], true);
      } else {
        this.sprite.anims.play(this.animationKeys[DogAnimation.SITTING], true);
      }
    }
  }
}
