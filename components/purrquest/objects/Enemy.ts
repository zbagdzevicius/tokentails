import Phaser from "phaser";

export enum EnemyAnimation {
  IDLE = "IDLE",
  JUMP = "JUMP",
  ATTACK = "ATTACK",
  DEATH = "DEATH",
}

const enemyAnimationConfigurations = [
  {
    key: EnemyAnimation.IDLE,
    startFrame: 24,
    endFrame: 29,
    frameRate: 6,
    repeat: -1,
  },
  {
    key: EnemyAnimation.JUMP,
    startFrame: 16,
    endFrame: 23,
    frameRate: 6,
    repeat: 0,
  },
];

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private speed: number;
  private direction: number;
  private isJumping: boolean = false;
  private collisionCount: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);

    this.speed = 200;
    this.direction = 1;
    this.setDepth(2);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body?.setSize(28, 28);

    this.createAnimations();
    this.play(EnemyAnimation.IDLE, true);

    scene.time.addEvent({
      delay: Phaser.Math.Between(1500, 3000),
      callback: this.tryIdleJump,
      callbackScope: this,
      loop: true,
    });
    scene.time.addEvent({
      delay: Phaser.Math.Between(15000, 30000),
      callback: this.ultimateJump,
      callbackScope: this,
      loop: true,
    });
  }

  private createAnimations() {
    enemyAnimationConfigurations.forEach(
      ({ key, startFrame, endFrame, frameRate, repeat }) => {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(this.texture.key, {
            start: startFrame,
            end: endFrame,
          }),
          frameRate,
          repeat,
        });
      }
    );
  }

  public update(time: number, delta: number): void {
    // Exit early if body no longer exists (e.g., enemy was destroyed)
    if (!this.body) return;

    this.setVelocityX(this.speed * this.direction);
    this.setFlipX(this.direction < 0);

    if (this.body.blocked.right || this.body.blocked.left) {
      this.collisionCount++;
      this.maybeChangeMovement();

      if (this.body.blocked.right) {
        this.direction = -1;
        this.maybeJump();
      } else if (this.body.blocked.left) {
        this.direction = 1;
        this.maybeJump();
      }
    }

    if (this.body.blocked.down) {
      this.isJumping = false;
      this.play(EnemyAnimation.IDLE, true);
    }

    if (this.isJumping) {
      this.play(EnemyAnimation.JUMP, true);
    } else {
      this.play(EnemyAnimation.IDLE, true);
    }
  }

  private maybeJump() {
    if (!this.isJumping && Math.random() < 0.6) {
      this.setVelocityY(-300);
      this.isJumping = true;
    }
  }

  private maybeChangeMovement() {
    if (this.collisionCount >= 5) {
      this.direction = Math.random() > 0.5 ? 1 : -1;
      this.speed = Phaser.Math.Between(100, 250);
      this.collisionCount = 0;
    }
  }

  private tryIdleJump() {
    // Exit early if body is not defined to prevent errors after enemy is removed
    if (!this.body || this.isJumping || !this.body.blocked.down) {
      return;
    }

    if (Math.random() < 0.4) {
      this.setVelocityY(-300);
      this.isJumping = true;
      this.play(EnemyAnimation.JUMP, true);
    }
  }
  private ultimateJump() {
    if (!this.body) return;

    this.setVelocityY(-1000);
    this.isJumping = true;
    this.play(EnemyAnimation.JUMP, true);
  }
}
