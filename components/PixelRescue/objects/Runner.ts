import Phaser from "phaser";
import {
  BasePixelEnemy,
  IPixelEnemyConfig,
  PixelEnemyAnimation,
} from "./BasePixelEnemy";
import { catWalkSpeed } from "@/models/game";
import { ENEMY_ANIMATIONS } from "../config/EnemyConfig";
import { ENEMY_DEBUG_MODE } from "../config";

enum RunnerState {
  PATROL,
  CHASE,
  ATTACK,
  RETURN,
}

export class Runner extends BasePixelEnemy {
  private enemyState: RunnerState = RunnerState.PATROL;
  private target: Phaser.Physics.Arcade.Sprite | null = null;
  private readonly baseDetectionRadius: number = 300;
  private lastIntendedDirection: number = 1;
  private startX: number;
  private startY: number;
  private isReacting: boolean = false;
  private waitTimer: number = 0;

  private patrolDirection: number = 1;
  private patrolRange: number = 120;
  private patrolSpeed: number = 200;

  private playerOnTopTimer: number = 0;
  private readonly playerOnTopThreshold: number = 1000;

  static initAnimations(scene: Phaser.Scene, texture: string) {
    for (const animationConfiguration of ENEMY_ANIMATIONS) {
      const animKey = `${texture}_${animationConfiguration.key}`;

      if (scene.anims.exists(animKey)) continue;

      const index = ENEMY_ANIMATIONS.indexOf(animationConfiguration);
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(texture, {
          start: animationConfiguration.startFrame,
          end: animationConfiguration.endFrame,
        }),
        frameRate: animationConfiguration.frameRate,
        repeat: animationConfiguration.repeat,
      });
    }
  }

  private readonly runSpeed = catWalkSpeed * 1.3;
  private readonly reactionDelay = 50;
  private readonly attackCooldown = 100;
  private readonly attackRange = 52;
  private useAttack1: boolean = false;
  private currentAttackAnim: PixelEnemyAnimation | null = null;
  private preAttackIdleShown: boolean = false;

  private comboCount: number = 0;
  private readonly maxComboAttacks: number = 3;
  private readonly comboCooldown: number = 1200;
  private inCombo: boolean = false;

  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(config: IPixelEnemyConfig, target: Phaser.Physics.Arcade.Sprite) {
    super(config);
    this.target = target;
    this.startX = config.x;
    this.startY = config.y;
    this.moveSpeed = this.runSpeed;

    // Create debug graphics
    this.debugGraphics = this.scene.add.graphics();
    this.debugGraphics.setDepth(1000);
  }
  update(time: number, delta: number) {
    if (this.isDead || this.isTakingDamage) return;

    if ((this as any).isStunned) return;

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= delta;
    }

    // Debug visualization
    if (ENEMY_DEBUG_MODE && this.debugGraphics) {
      this.debugGraphics.clear();

      const bodyCenterX = this.getBodyCenterX();
      const bodyCenterY = this.getBodyCenterY();

      // Draw attack range circle centered on body
      this.debugGraphics.lineStyle(2, 0xff0000, 0.5);
      this.debugGraphics.strokeCircle(
        bodyCenterX,
        bodyCenterY,
        this.attackRange,
      );

      // Draw detection radius
      const currentDetectionRadius =
        this.baseDetectionRadius * this.getDetectionMultiplier();
      this.debugGraphics.lineStyle(2, 0x00ff00, 0.3);
      this.debugGraphics.strokeCircle(this.x, this.y, currentDetectionRadius);

      // Draw line to target if in chase
      if (this.target && this.enemyState === RunnerState.CHASE) {
        const targetCenterX = this.getTargetBodyCenterX();
        const targetCenterY = this.getTargetBodyCenterY();
        const dist = Phaser.Math.Distance.Between(
          bodyCenterX,
          bodyCenterY,
          targetCenterX,
          targetCenterY,
        );
        const color = dist < this.attackRange ? 0xff0000 : 0xffff00;
        this.debugGraphics.lineStyle(1, color, 0.5);
        this.debugGraphics.lineBetween(
          bodyCenterX,
          bodyCenterY,
          targetCenterX,
          targetCenterY,
        );

        // Draw distance text
        this.debugGraphics.fillStyle(0xffffff, 1);
      }

      // Draw body hitbox for reference
      if (this.body) {
        this.debugGraphics.lineStyle(1, 0x00ffff, 0.3);
        this.debugGraphics.strokeRect(
          this.body.x,
          this.body.y,
          this.body.width,
          this.body.height,
        );
      }
    }

    let currentIntendedDirection = 0;

    switch (this.enemyState) {
      case RunnerState.PATROL:
        currentIntendedDirection = this.updatePatrol();
        break;
      case RunnerState.CHASE:
        currentIntendedDirection = this.updateChase(delta);
        break;
      case RunnerState.ATTACK:
        currentIntendedDirection = this.updateAttack();
        break;
      case RunnerState.RETURN:
        currentIntendedDirection = this.updateReturn();
        break;
    }

    if (currentIntendedDirection !== 0) {
      this.lastIntendedDirection = currentIntendedDirection;
    }

    this.setFlipX(this.lastIntendedDirection > 0);

    if (this.enemyState === RunnerState.ATTACK) {
      return;
    }

    const isMoving = Math.abs(this.body!.velocity.x) > 0.1;

    if (isMoving) {
      this.playAnimation(PixelEnemyAnimation.RUN, true);
    } else {
      this.playAnimation(PixelEnemyAnimation.IDLE, true);
    }
  }

  destroy(fromScene?: boolean) {
    if (this.debugGraphics) {
      this.debugGraphics.destroy();
      this.debugGraphics = null;
    }
    super.destroy(fromScene);
  }

  private getBodyCenterX(): number {
    if (!this.body) return this.x;
    return this.body.x + this.body.width / 2;
  }

  private getBodyCenterY(): number {
    if (!this.body) return this.y;
    return this.body.y + this.body.height / 2;
  }

  private getTargetBodyCenterX(): number {
    if (!this.target || !this.target.body) return this.target?.x || 0;
    return this.target.body.x + this.target.body.width / 2;
  }

  private getTargetBodyCenterY(): number {
    if (!this.target || !this.target.body) return this.target?.y || 0;
    return this.target.body.y + this.target.body.height / 2;
  }

  private updatePatrol(): number {
    if (this.canSeePlayer() && !this.isReacting) {
      this.isReacting = true;
      this.scene.time.delayedCall(this.reactionDelay, () => {
        if (this.enemyState === RunnerState.PATROL) {
          this.enemyState = RunnerState.CHASE;
          this.waitTimer = 0;
          this.isReacting = false;
        }
      });
    } else if (!this.canSeePlayer()) {
      this.isReacting = false;
    }

    const distanceFromStart = this.x - this.startX;

    if (distanceFromStart >= this.patrolRange) {
      this.patrolDirection = -1;
    } else if (distanceFromStart <= -this.patrolRange) {
      this.patrolDirection = 1;
    }

    this.setVelocityX(this.patrolDirection * this.patrolSpeed);

    return this.patrolDirection;
  }

  private updateChase(delta: number): number {
    if (!this.target || !this.target.active) {
      this.enemyState = RunnerState.RETURN;
      this.isReacting = false;
      this.playerOnTopTimer = 0;
      return 0;
    }

    const bodyCenterX = this.getBodyCenterX();
    const bodyCenterY = this.getBodyCenterY();
    const targetCenterX = this.getTargetBodyCenterX();
    const targetCenterY = this.getTargetBodyCenterY();

    const verticalDist = targetCenterY - bodyCenterY;
    const horizontalDist = Math.abs(targetCenterX - bodyCenterX);

    const isPlayerAbove = verticalDist < -32 && horizontalDist < 200;
    const isPlayerGrounded =
      this.target.body &&
      (this.target.body as Phaser.Physics.Arcade.Body).blocked.down;
    const isPlayerOnTop = isPlayerAbove && isPlayerGrounded;

    // Immediately stop chasing if player is sitting on block above
    if (isPlayerOnTop) {
      this.enemyState = RunnerState.RETURN;
      this.playerOnTopTimer = 0;
      this.isReacting = false;
      return 0;
    }

    const dist = Phaser.Math.Distance.Between(
      bodyCenterX,
      bodyCenterY,
      targetCenterX,
      targetCenterY,
    );

    const minHorizontalDistance = 6;

    let direction = 0;
    if (horizontalDist > minHorizontalDistance) {
      direction = Math.sign(this.target.x - this.x);
      this.lastIntendedDirection = direction;
      this.waitTimer = 0;
    } else {
      this.waitTimer += delta;

      if (this.waitTimer > 2000) {
        this.enemyState = RunnerState.RETURN;
        this.waitTimer = 0;
        this.isReacting = false;
        return 0;
      }
    }

    if (dist < this.attackRange && this.attackCooldownTimer <= 0) {
      this.enemyState = RunnerState.ATTACK;
      this.isAttacking = true;
      this.preAttackIdleShown = false;
      this.hasDealtDamage = false;

      const dashDirection =
        direction === 0 ? this.lastIntendedDirection : direction;
      const dashDistance = 2;
      this.x += dashDirection * dashDistance;
      this.setVelocityX(0);

      this.currentAttackAnim = this.useAttack1
        ? PixelEnemyAnimation.ATTACK1
        : PixelEnemyAnimation.ATTACK;
      this.useAttack1 = !this.useAttack1;

      return dashDirection;
    }

    if (dist > 500 || !this.hasLineOfSight()) {
      this.enemyState = RunnerState.RETURN;
      this.isReacting = false;
      return 0;
    }

    // Only stop if very close or already in attack range
    if (dist < this.attackRange - 5) {
      this.setVelocityX(0);
      return direction;
    }

    this.setVelocityX(direction * this.moveSpeed);

    return direction;
  }

  private updateAttack(): number {
    this.setVelocityX(0);

    if (!this.preAttackIdleShown) {
      this.playAnimation(PixelEnemyAnimation.IDLE, false);
      this.preAttackIdleShown = true;
      this.scene.time.delayedCall(16, () => {
        if (this.enemyState === RunnerState.ATTACK && this.currentAttackAnim) {
          this.playAnimation(this.currentAttackAnim, false);

          this.setupAttackDamage(this.currentAttackAnim);
          this.once("animationcomplete", () => {
            if (this.enemyState === RunnerState.ATTACK) {
              this.isAttacking = false;
              this.comboCount++;

              if (
                this.comboCount < this.maxComboAttacks &&
                this.target &&
                this.target.active
              ) {
                const dist = Phaser.Math.Distance.Between(
                  this.x,
                  this.y,
                  this.target.x,
                  this.target.y,
                );

                if (dist < this.attackRange + 20) {
                  this.attackCooldownTimer = this.attackCooldown;
                  this.inCombo = true;
                } else {
                  this.endCombo();
                }
              } else {
                this.endCombo();
              }

              this.enemyState = RunnerState.CHASE;
            }
          });
        }
      });
    }

    return 0;
  }

  private endCombo() {
    this.comboCount = 0;
    this.inCombo = false;
    this.attackCooldownTimer = this.comboCooldown;
  }

  private setupAttackDamage(attackAnim: PixelEnemyAnimation) {
    const damageFrames =
      attackAnim === PixelEnemyAnimation.ATTACK ? [5] : [8, 9, 10];

    const updateHandler = (
      anim: Phaser.Animations.Animation,
      frame: Phaser.Animations.AnimationFrame,
    ) => {
      if (anim.key === `${this.texture.key}_${attackAnim}`) {
        const actualFrameIndex =
          typeof frame.textureFrame === "number"
            ? frame.textureFrame
            : parseInt(String(frame.textureFrame));

        if (damageFrames.includes(actualFrameIndex)) {
          this.dealDamageToPlayer(this.target);
        }
      }
    };

    this.on("animationupdate", updateHandler);

    this.once("animationcomplete", () => {
      this.off("animationupdate", updateHandler);
    });
  }

  private updateReturn(): number {
    const dist = Math.abs(this.x - this.startX);

    if (dist < 10) {
      this.setVelocityX(0);
      this.setVelocityY(0);

      this.isReacting = false;
      this.enemyState = RunnerState.PATROL;

      return 0;
    }

    const direction = Math.sign(this.startX - this.x);
    this.setVelocityX(direction * (this.moveSpeed * 0.5));

    return direction;
  }

  private canSeePlayer(): boolean {
    if (!this.target) return false;

    // Check if player is sitting on a block directly above the runner
    const targetCenterY = this.getTargetBodyCenterY();
    const bodyCenterY = this.getBodyCenterY();
    const targetCenterX = this.getTargetBodyCenterX();
    const bodyCenterX = this.getBodyCenterX();

    const verticalDist = targetCenterY - bodyCenterY;
    const horizontalDist = Math.abs(targetCenterX - bodyCenterX);

    const isPlayerAbove =
      verticalDist < -32 && horizontalDist < this.baseDetectionRadius;
    const isPlayerGrounded =
      this.target.body &&
      (this.target.body as Phaser.Physics.Arcade.Body).blocked.down;

    // Runner cannot see player if they're sitting on a block directly above
    if (isPlayerAbove && isPlayerGrounded) {
      return false;
    }

    const currentDetectionRadius =
      this.baseDetectionRadius * this.getDetectionMultiplier();

    const dist = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.target.x,
      this.target.y,
    );
    return dist < currentDetectionRadius && this.hasLineOfSight();
  }

  private hasLineOfSight(): boolean {
    if (!this.target || !this.groundLayer) return false;

    const x1 = this.x;
    const y1 = this.y;
    const x2 = this.target.x;
    const y2 = this.target.y;

    const line = new Phaser.Geom.Line(x1, y1, x2, y2);

    const lineLength = Phaser.Geom.Line.Length(line);
    const points = line.getPoints(0, Math.ceil(lineLength / 16));

    for (const point of points) {
      const tile = this.groundLayer.getTileAtWorldXY(point.x, point.y, true);

      if (tile && tile.index !== -1 && tile.collides) {
        return false;
      }
    }

    return true;
  }
}
