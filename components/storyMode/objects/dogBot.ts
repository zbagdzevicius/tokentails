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

  private direction = -1;
  private speed = 200;
  private jumpForce = -200;
  private jumpCooldown = 5000;
  private lastJumpTime = 0;
  private isJumping = false;
  private isSpinning = false;
  private spinDuration = 1000; // Duration of spin animation in ms
  private lastSpinTime = 0;
  private spinCooldown = 5000; // Cooldown between spins in ms
  private spinRotation = 0;

  constructor(scene: Scene, x: number, y: number, dogName: string) {
    this.scene = scene;
    this.animationKeys = generateDogAnimationConfiguration(dogName);

    this.sprite = scene.physics.add.sprite(x, y, dogName).setSize(32, 38);
    this.sprite.setOffset(0, 0).setBounce(0.2);

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

  public update() {
    this.handleMovement();
    this.handleJumps();
    this.updateAnimations();
  }

  private handleMovement() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    this.direction = 1;

    this.sprite.setVelocityX(this.direction * this.speed);

    if (body.blocked.right || body.blocked.left) {
      this.direction *= -1;
      this.sprite.setFlipX(this.direction < 0);
      this.startSpin();
    }
  }

  private handleJumps() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const onGround = body.blocked.down;
    const timeNow = this.scene.time.now;

    if (this.isJumping) {
      if (onGround) {
        this.isJumping = false;
      }
      return;
    }

    if (onGround && timeNow > this.lastJumpTime + this.jumpCooldown) {
      if (Math.random() < 0.1) {
        this.isJumping = true;
        this.lastJumpTime = timeNow;
        this.sprite.setVelocityY(this.jumpForce);
        this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);
      }
    }
  }

  private startSpin() {
    const timeNow = this.scene.time.now;

    // Only start spin if cooldown has passed
    if (timeNow < this.lastSpinTime + this.spinCooldown) return;

    this.isSpinning = true;
    this.lastSpinTime = timeNow;
    this.spinRotation = 0;
    this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);

    // Update rotation during spin
    this.scene.time.addEvent({
      delay: 16, // ~60fps
      callback: () => {
        if (this.isSpinning) {
          this.spinRotation += 0.2; // Adjust this value to control spin speed
          this.sprite.setRotation(this.spinRotation);
        }
      },
      loop: true,
    });

    // End spin after duration
    this.scene.time.delayedCall(this.spinDuration, () => {
      this.isSpinning = false;
      this.sprite.setRotation(0);
    });
  }

  private updateAnimations() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    if (this.isSpinning) {
      this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);
      return;
    }
    if (this.isJumping) {
      this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);
      return;
    }
    this.sprite.anims.play(this.animationKeys[DogAnimation.RUNNING], true);
  }
}
