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
  private speed = 275;
  private jumpForce = -200;
  private maxJumps = 2;
  private jumpsRemaining = 2;
  private isJumping = false;
  private lastJumpTime = 0;
  private jumpCooldown = 500;

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

    this.sprite.anims.play(this.animationKeys[DogAnimation.RUNNING]);
  }

  public update() {
    this.handleMovement();
    this.handleJumps();
    this.updateAnimations();
  }

  private handleMovement() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    this.sprite.setVelocityX(this.direction * this.speed);

    // Check for wall collision
    if (body.blocked.right || body.blocked.left) {
      // Only initiate wall jump sequence if not already jumping
      if (!this.isJumping) {
        this.direction *= -1;
        this.sprite.setFlipX(this.direction < 0);

        // Reset jumps when hitting a wall to allow chained jumps
        this.jumpsRemaining = this.maxJumps;

        // Perform the first jump off the wall
        if (this.jumpsRemaining > 0) {
          // Should always be true here now
          this.performJump();
        }
      }
    }
  }

  private handleJumps() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    const onGround = body.blocked.down;
    const timeNow = this.scene.time.now;

    // Reset jumps and jumping state when landing
    if (onGround) {
      this.jumpsRemaining = this.maxJumps; // Reset to max (e.g., 2) when landing
      this.isJumping = false;
    } else {
      // Automatically perform the second jump if airborne after the first wall jump
      // Check if isJumping is true, exactly one jump remains, and cooldown passed
      const readyToJump = timeNow > this.lastJumpTime + this.jumpCooldown;
      if (
        this.isJumping &&
        this.jumpsRemaining === this.maxJumps - 1 &&
        readyToJump
      ) {
        this.performJump(); // Perform the second jump
      }
    }

    // Random jumps only when on ground and cooldown passed
    if (onGround && timeNow > this.lastJumpTime + this.jumpCooldown) {
      // Ensure we have jumps available for a random ground jump
      if (this.jumpsRemaining > 0 && Math.random() < 0.1) {
        this.performJump();
      }
    }
  }

  private performJump() {
    if (this.jumpsRemaining > 0) {
      this.isJumping = true;
      this.jumpsRemaining--;
      this.lastJumpTime = this.scene.time.now;
      this.sprite.setVelocityY(this.jumpForce);
      this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);
    }
  }

  private updateAnimations() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    if (!body.blocked.down) {
      this.sprite.anims.play(this.animationKeys[DogAnimation.JUMPING], true);
    } else {
      this.sprite.anims.play(this.animationKeys[DogAnimation.RUNNING], true);
    }
  }
}
