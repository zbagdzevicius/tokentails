import Phaser from "phaser";

const BOSS_SPEED = 125;
const CHARGE_SPEED = BOSS_SPEED * 1.75;
const ULTIMATE_SPEED = BOSS_SPEED * 2.5;
const ULTIMATE_JUMP_COLLDOWN = 10000;
const RADIUS_X = 225;
const RADIUS_Y = 350;

export enum BossAnimation {
  IDLE = "BOSS_IDLE",
  MOVE = "BOSS_MOVE",
  MELEE_ATTACK_PREPARE = "MELEE_ATTACK_PREPARE",
  MELEE_ATTACK = "BOSS_MELEE_ATTACK",
  MELEE_ATTACK2 = "BOSS_MELEE_ATTACK2",
  TAUNT = "BOSS_TAUNT",
  MELEE_ATTACK_ULTIMATE = "BOSS_MELEE_ATTACK_ULTIMATE",
  DAMAGED = "BOSS_DAMAGED",
  DAMAGED2 = "BOSS_DAMAGED2",
  DEATH = "BOSS_DEATH",
}

const maxAnimationFrames = 8;
const animationConfigurations: {
  key: BossAnimation;
  frames: number;
  repeat: -1 | 0;
  frameRate: number;
}[] = [
  { key: BossAnimation.IDLE, frames: 5, repeat: 0, frameRate: 4 },
  { key: BossAnimation.MOVE, frames: 8, repeat: -1, frameRate: 8 },
  {
    key: BossAnimation.MELEE_ATTACK_PREPARE,
    frames: 5,
    repeat: 0,
    frameRate: 12,
  },
  { key: BossAnimation.MELEE_ATTACK, frames: 9, repeat: 0, frameRate: 10 },
  { key: BossAnimation.MELEE_ATTACK2, frames: 5, repeat: -1, frameRate: 10 },
  {
    key: BossAnimation.TAUNT,
    frames: 6,
    repeat: 0,
    frameRate: 10,
  },
  {
    key: BossAnimation.MELEE_ATTACK_ULTIMATE,
    frames: 9,
    repeat: -1,
    frameRate: 10,
  },
  { key: BossAnimation.DAMAGED, frames: 3, repeat: -1, frameRate: 8 },
  { key: BossAnimation.DAMAGED2, frames: 3, repeat: -1, frameRate: 8 },
  { key: BossAnimation.DEATH, frames: 6, repeat: 0, frameRate: 6 },
];

type IBossAnimationKey = `${string}_${BossAnimation}`;
export type ICatAnimationKeysMap = Record<BossAnimation, IBossAnimationKey>;

export class BossEnemy extends Phaser.Physics.Arcade.Sprite {
  private health: number;
  private attackCooldown: number;
  private ultimateCooldown: number;
  private isCharging: boolean = false;
  private isAttacking: boolean = false;
  private isUltimateAttacking: boolean = false;
  private direction: number = 1;
  private player: Phaser.Physics.Arcade.Sprite;
  private targetX: number | null = null;
  private targetY: number | null = null;
  private fightMode: boolean = false;
  private ultimateJumpCooldown: number;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    player: Phaser.Physics.Arcade.Sprite
  ) {
    super(scene, x, y, texture);
    this.player = player;
    this.health = 200;
    this.attackCooldown = 0;
    this.ultimateCooldown = 0;
    this.ultimateJumpCooldown = 0;
    this.setDepth(2);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body!.setSize(20, 40);
    this.body!.setOffset(40, 16);
    this.setScale(1.5);
    this.initAnimations();
    this.playIdle();

    this.setVelocityX(BOSS_SPEED * this.direction);
  }

  initAnimations() {
    animationConfigurations.forEach((config, index) => {
      this.scene.anims.create({
        key: config.key,
        frames: this.scene.anims.generateFrameNumbers(this.texture.key, {
          start: index * maxAnimationFrames,
          end: index * maxAnimationFrames + config.frames - 1,
        }),
        frameRate: config.frameRate,
        repeat: config.repeat,
      });
    });
  }

  public update(time: number, delta: number): void {
    if (!this.body) return;
    if (this.ultimateCooldown > 0) {
      this.ultimateCooldown -= delta;
    }

    if (this.ultimateJumpCooldown > 0) {
      this.ultimateJumpCooldown -= delta;
    }
    this.moveToPlayer(this.player.x, this.player.y);

    if (this.isAttacking) {
    } else if (this.isCharging) {
      this.setVelocityX(CHARGE_SPEED * this.direction);
      this.setFlipX(this.direction < 0);
    } else if (this.isUltimateAttacking) {
      this.setVelocityX(ULTIMATE_SPEED * this.direction);
      this.setFlipX(this.direction < 0);
    } else if (this.fightMode) {
      this.engagePlayer();
    } else {
      if (this.body!.blocked.right) {
        this.direction = -1;
        this.tryJump();
      } else if (this.body!.blocked.left) {
        this.direction = 1;
        this.tryJump();
      }

      this.setVelocityX(BOSS_SPEED * this.direction);
      this.setFlipX(this.direction < 0);

      if (!this.isAttacking && !this.isCharging) {
        this.playMove();
      }
    }
  }

  public moveToPlayer(playerX: number, playerY: number) {
    const deltaX = Math.abs(this.x - playerX);
    const deltaY = Math.abs(this.y - playerY);

    if (deltaX <= RADIUS_X && deltaY <= RADIUS_Y) {
      this.targetX = playerX;
      this.targetY = playerY;
      this.fightMode = true;

      if (deltaY <= 100 && playerY < this.y) {
        this.tryJump();
      }
    } else {
      this.fightMode = false;
      this.targetX = null;
      this.targetY = null;
    }
  }

  private engagePlayer() {
    if (!this.body) return;
    // Calculate direction to player and set velocity towards them
    const dx = this.player.x - this.x;
    const dy = this.player.y - this.y;

    const angle = Math.atan2(dy, dx);
    const speed = BOSS_SPEED;

    this.direction = dx > 0 ? 1 : -1;

    this.setVelocityX(Math.cos(angle) * speed);
    this.setFlipX(this.direction < 0);

    if (this.body!.blocked.right || this.body!.blocked.left) {
      this.tryJump();
    }

    if (!this.isAttacking && !this.isCharging && !this.isUltimateAttacking) {
      this.playMove();

      if (this.attackCooldown <= 0) {
        this.chooseAction();
        this.attackCooldown = 2000;
      }
    }
  }

  private chooseAction() {
    if (!this.isAttacking && !this.isUltimateAttacking) {
      if (this.ultimateCooldown <= 0 && Math.random() < 0.2) {
        this.performUltimateAttack();
        this.ultimateCooldown = 30000;
        return;
      }

      const randomAction = Math.random();

      if (randomAction < 0.4) {
        this.performMeleeAttack();
      } else if (randomAction < 0.7) {
        this.startCharge();
      } else {
        this.performSpecialAttack();
      }
    }
  }

  private performMeleeAttack() {
    this.isAttacking = true;

    this.play(BossAnimation.MELEE_ATTACK_PREPARE, true);

    this.once("animationcomplete", () => {
      this.play(BossAnimation.MELEE_ATTACK, true);

      this.once("animationcomplete", () => {
        this.isAttacking = false;
        this.playIdle();
      });
    });
  }

  private performUltimateAttack() {
    this.isUltimateAttacking = true;

    this.play(BossAnimation.MELEE_ATTACK_PREPARE, true);

    const dx = this.player.x - this.x;
    this.direction = dx > 0 ? 1 : -1;
    this.setFlipX(this.direction < 0);

    this.once("animationcomplete", () => {
      this.play(BossAnimation.MELEE_ATTACK_ULTIMATE, true);
      this.setVelocityX(ULTIMATE_SPEED * this.direction);

      this.scene.time.delayedCall(1500, () => {
        this.isUltimateAttacking = false;
        this.playIdle();
      });
    });
  }

  private startCharge() {
    this.isCharging = true;
    this.play(BossAnimation.MELEE_ATTACK2, true);

    const dx = this.player.x - this.x;
    this.direction = dx > 0 ? 1 : -1;

    this.setVelocityX(CHARGE_SPEED * this.direction);
    this.setFlipX(this.direction < 0);

    this.scene.time.delayedCall(1000, () => {
      this.isCharging = false;
      this.playIdle();
    });
  }

  private performSpecialAttack() {
    this.isAttacking = true;
    this.play(BossAnimation.MELEE_ATTACK_PREPARE, true);

    this.once("animationcomplete", () => {
      this.isAttacking = false;
      this.playIdle();
    });
  }

  private tryJump() {
    if (
      this.body &&
      this.body.blocked.down &&
      !this.isAttacking &&
      !this.isCharging &&
      !this.isUltimateAttacking
    ) {
      if (this.ultimateJumpCooldown <= 0 && Math.random() < 0.4) {
        this.performUltimateJump();
        this.ultimateJumpCooldown = ULTIMATE_JUMP_COLLDOWN;
      } else {
        this.performRegularJump();
      }
    }
  }
  private performRegularJump() {
    this.setVelocityY(-300);
    this.play(BossAnimation.MELEE_ATTACK_PREPARE, true);
  }

  private performUltimateJump() {
    this.isUltimateAttacking = true;
    this.setVelocityY(-1000);

    this.play(BossAnimation.MELEE_ATTACK_ULTIMATE, true);
    this.scene.time.delayedCall(1000, () => {
      this.isUltimateAttacking = false;
      this.playIdle();
    });
  }
  private playIdle() {
    if (
      !this.isAttacking &&
      !this.isCharging &&
      !this.isUltimateAttacking &&
      this.active
    ) {
      this.play(BossAnimation.IDLE, true);
    }
  }

  private playMove() {
    if (!this.isAttacking && !this.isCharging && !this.isUltimateAttacking) {
      this.play(BossAnimation.MOVE, true);
    }
  }

  public takeDamage(amount: number) {
    this.health -= amount;
    this.play(BossAnimation.DAMAGED, true);
    if (this.health <= 0) {
      this.die();
    }
  }

  private die() {
    this.play(BossAnimation.DEATH);
    this.once("animationcomplete", () => {
      this.destroy();
    });
  }
}
