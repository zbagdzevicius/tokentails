import Phaser from "phaser";
import {
  BasePixelEnemy,
  IPixelEnemyConfig,
  PixelEnemyAnimation,
} from "./BasePixelEnemy";
import { catWalkSpeed } from "@/models/game";
import { ENEMY_ANIMATIONS } from "../config/EnemyConfig";
import { ENEMY_DEBUG_MODE } from "../config";

enum BlockerState {
  PATROL,
  ALERT,
  CHASE,
  ATTACK,
  RETURN,
}

export class Blocker extends BasePixelEnemy {
  private enemyState: BlockerState = BlockerState.PATROL;
  private target: Phaser.Physics.Arcade.Sprite | null = null;
  private patrolPoints: number[];
  private currentPatrolIndex: number = 0;
  private lastIntendedDirection: number = 1;
  private isAlerted: boolean = false;
  private waitTimer: number = 0;

  // Player on top detection
  private playerOnTopTimer: number = 0;
  private readonly playerOnTopThreshold: number = 1000; // 1 second

  static initAnimations(scene: Phaser.Scene, texture: string) {
    for (const animationConfiguration of ENEMY_ANIMATIONS) {
      const animKey = `${texture}_${animationConfiguration.key}`;

      if (scene.anims.exists(animKey)) continue;

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

  private readonly chaseSpeed = catWalkSpeed * 1.2;
  private readonly patrolSpeed = 100;
  private readonly baseDetectionRadius: number = 260;
  private readonly reactionDelay = 300;
  private readonly lostSightDuration = 2000;
  private lostSightTimer: number = 0;
  private readonly attackCooldown = 700;
  private readonly attackRange = 62;
  private useAttack1: boolean = false;
  private currentAttackAnim: PixelEnemyAnimation | null = null;
  private preAttackIdleShown: boolean = false;

  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(
    config: IPixelEnemyConfig,
    target: Phaser.Physics.Arcade.Sprite,
    patrolRange: number = 200,
  ) {
    super(config);
    this.target = target;
    this.moveSpeed = this.chaseSpeed;

    this.patrolPoints = [
      config.x - patrolRange / 2,
      config.x + patrolRange / 2,
    ];

    this.debugGraphics = this.scene.add.graphics();
    this.debugGraphics.setDepth(1000);
  }

  update(time: number, delta: number) {
    if (this.isDead || this.isTakingDamage) return;

    if ((this as any).isStunned) return;

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= delta;
    }

    if (ENEMY_DEBUG_MODE && this.debugGraphics) {
      this.debugGraphics.clear();

      const bodyCenterX = this.getBodyCenterX();
      const bodyCenterY = this.getBodyCenterY();

      this.debugGraphics.lineStyle(2, 0xff0000, 0.5);
      this.debugGraphics.strokeCircle(
        bodyCenterX,
        bodyCenterY,
        this.attackRange,
      );

      const currentDetectionRadius =
        this.baseDetectionRadius * this.getDetectionMultiplier();
      this.debugGraphics.lineStyle(2, 0x00ff00, 0.3);
      this.debugGraphics.strokeCircle(this.x, this.y, currentDetectionRadius);

      if (this.target && this.enemyState === BlockerState.CHASE) {
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
      }

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
      case BlockerState.PATROL:
        currentIntendedDirection = this.updatePatrol();
        break;
      case BlockerState.ALERT:
        currentIntendedDirection = this.updateAlert();
        break;
      case BlockerState.CHASE:
        currentIntendedDirection = this.updateChase(delta);
        break;
      case BlockerState.ATTACK:
        currentIntendedDirection = this.updateAttack();
        break;
      case BlockerState.RETURN:
        currentIntendedDirection = this.updateReturn();
        break;
    }

    if (currentIntendedDirection !== 0) {
      this.lastIntendedDirection = currentIntendedDirection;
    }

    this.setFlipX(this.lastIntendedDirection > 0);

    if (this.enemyState === BlockerState.ATTACK) {
      return;
    }

    const isMoving = Math.abs(this.body!.velocity.x) > 0.1;

    if (this.enemyState === BlockerState.ALERT) {
      this.playAnimation(PixelEnemyAnimation.IDLE, true);
    } else if (isMoving) {
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
    const targetX = this.patrolPoints[this.currentPatrolIndex];
    const dist = Math.abs(this.x - targetX);

    if (dist < 10) {
      this.currentPatrolIndex =
        (this.currentPatrolIndex + 1) % this.patrolPoints.length;
    }

    const direction = Math.sign(targetX - this.x);
    this.setVelocityX(direction * this.patrolSpeed);

    if (this.canSeePlayerInCone() && !this.isAlerted) {
      this.enterAlert();
    }

    return direction;
  }

  private updateAlert(): number {
    this.setVelocityX(0);
    this.setVelocityY(0);
    return 0;
  }

  private enterAlert() {
    this.enemyState = BlockerState.ALERT;
    this.isAlerted = true;
    this.setVelocityX(0);

    this.scene.time.delayedCall(this.reactionDelay, () => {
      if (this.enemyState === BlockerState.ALERT) {
        this.enemyState = BlockerState.CHASE;
        this.waitTimer = 0;
        this.isAlerted = false;
      }
    });
  }

  private updateChase(delta: number): number {
    if (!this.target || !this.target.active) {
      this.enemyState = BlockerState.RETURN;
      this.lostSightTimer = 0;
      this.playerOnTopTimer = 0;
      return 0;
    }

    const bodyCenterX = this.getBodyCenterX();
    const bodyCenterY = this.getBodyCenterY();
    const targetCenterX = this.getTargetBodyCenterX();
    const targetCenterY = this.getTargetBodyCenterY();

    const verticalDist = targetCenterY - bodyCenterY;
    const horizontalDist = Math.abs(targetCenterX - bodyCenterX);
    const isPlayerOnTop = verticalDist < -30 && horizontalDist < 50;
    if (isPlayerOnTop) {
      this.playerOnTopTimer += delta;
      if (this.playerOnTopTimer >= this.playerOnTopThreshold) {
        this.enemyState = BlockerState.RETURN;
        this.playerOnTopTimer = 0;
        this.lostSightTimer = 0;
        return 0;
      }
    } else {
      this.playerOnTopTimer = 0;
    }

    const dist = Phaser.Math.Distance.Between(
      bodyCenterX,
      bodyCenterY,
      targetCenterX,
      targetCenterY,
    );

    const minHorizontalDistance = 10;

    let direction = 0;
    if (horizontalDist > minHorizontalDistance) {
      direction = Math.sign(this.target.x - this.x);
      this.lastIntendedDirection = direction;
      this.waitTimer = 0;
    } else {
      this.waitTimer += delta;

      if (this.waitTimer > 2500) {
        this.enemyState = BlockerState.RETURN;
        this.waitTimer = 0;
        return 0;
      }
    }

    if (dist < this.attackRange && this.attackCooldownTimer <= 0) {
      this.enemyState = BlockerState.ATTACK;
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

    if (!this.hasLineOfSight()) {
      this.lostSightTimer += delta;
      if (this.lostSightTimer > this.lostSightDuration) {
        this.enemyState = BlockerState.RETURN;
        this.lostSightTimer = 0;
        return 0;
      }
    } else {
      this.lostSightTimer = 0;
    }

    // Only stop if very close or already in attack range
    if (dist < this.attackRange - 5) {
      this.setVelocityX(0);
      return direction;
    }

    this.setVelocityX(direction * this.chaseSpeed);

    return direction;
  }

  private updateAttack(): number {
    this.setVelocityX(0);

    if (!this.preAttackIdleShown) {
      this.playAnimation(PixelEnemyAnimation.IDLE, false);
      this.preAttackIdleShown = true;
      this.scene.time.delayedCall(16, () => {
        if (this.enemyState === BlockerState.ATTACK && this.currentAttackAnim) {
          this.playAnimation(this.currentAttackAnim, false);

          this.setupAttackDamage(this.currentAttackAnim);

          this.once("animationcomplete", () => {
            if (this.enemyState === BlockerState.ATTACK) {
              this.isAttacking = false;
              this.attackCooldownTimer = this.attackCooldown;
              this.enemyState = BlockerState.CHASE;
            }
          });
        }
      });
    }

    return 0;
  }

  private setupAttackDamage(attackAnim: PixelEnemyAnimation) {
    const damageFrames =
      attackAnim === PixelEnemyAnimation.ATTACK ? [3, 4] : [10, 11];

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
    const nearestPatrolPoint = this.findNearestPatrolPoint();
    const dist = Math.abs(this.x - nearestPatrolPoint);

    if (dist < 10) {
      this.setVelocityX(0);
      this.setVelocityY(0);
      this.enemyState = BlockerState.PATROL;
      this.currentPatrolIndex = this.patrolPoints.indexOf(nearestPatrolPoint);
      return 0;
    }

    const direction = Math.sign(nearestPatrolPoint - this.x);
    this.setVelocityX(direction * (this.patrolSpeed * 0.8));

    return direction;
  }

  private findNearestPatrolPoint(): number {
    let nearest = this.patrolPoints[0];
    let minDist = Math.abs(this.x - nearest);

    for (const point of this.patrolPoints) {
      const dist = Math.abs(this.x - point);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    return nearest;
  }

  private canSeePlayerInCone(): boolean {
    if (!this.target) return false;

    const facingLeft = this.flipX;
    const toPlayerX = this.target.x - this.x;

    const inFront =
      (facingLeft && toPlayerX < 0) || (!facingLeft && toPlayerX > 0);

    const currentDetectionRadius =
      this.baseDetectionRadius * this.getDetectionMultiplier();
    const dist = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.target.x,
      this.target.y,
    );

    return dist < currentDetectionRadius && inFront && this.hasLineOfSight();
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
