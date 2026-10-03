import Phaser from "phaser";
import { scaleTo, ttWorldText } from "@/components/Phaser/typography";
import type { PixelRescueScene } from "../scenes/PixelRescueScene";

export enum PixelEnemyAnimation {
  IDLE = "IDLE",
  RUN = "RUN",
  HIT = "HIT",
  DIE = "DIE",
  ATTACK = "ATTACK",
  ATTACK1 = "ATTACK1",
}

export interface IPixelEnemyConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  texture: string;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
}

export class BasePixelEnemy extends Phaser.Physics.Arcade.Sprite {
  // protected hp: number = 1;
  protected isDead: boolean = false;
  protected isTakingDamage: boolean = false;
  protected isAttacking: boolean = false;
  protected moveSpeed: number = 0;
  protected groundLayer: Phaser.Tilemaps.TilemapLayer;
  protected attackCooldownTimer: number = 0;
  protected hasDealtDamage: boolean = false;

  // Stun mechanic properties
  // Subclasses may override the default melee range used below.
  declare protected readonly attackRange?: number;

  protected hitCount: number = 0;
  // Also set by PixelRescueScene when the player stuns an enemy.
  public isStunned: boolean = false;
  protected stunTimer: number = 0;
  protected readonly HITS_TO_STUN: number = 10;
  protected readonly STUN_DURATION_MS: number = 3000;

  constructor({ scene, x, y, texture, groundLayer }: IPixelEnemyConfig) {
    super(scene, x, y, texture);
    this.groundLayer = groundLayer;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    this.setCollideWorldBounds(true);
    this.body?.setSize(40, 50);
    this.setOffset(20, 44);
  }

  protected getDetectionMultiplier(): number {
    const pixelRescueScene = this.scene as PixelRescueScene;

    if (!pixelRescueScene.isPlayerCarryingCat) {
      return 1.0;
    }

    const catsCarried = pixelRescueScene.catsRescued;

    if (catsCarried === 1) {
      return 1.3;
    } else if (catsCarried >= 2) {
      return 1.6;
    }

    return 1.0;
  }

  public takeDamage() {
    if (this.isDead || this.isStunned) return;

    this.hitCount++;
    this.isTakingDamage = true;

    this.showHitText();

    this.setTint(0xff6666);
    this.scene.time.delayedCall(200, () => {
      if (!this.isStunned) {
        this.clearTint();
      }
      this.isTakingDamage = false;
    });

    if (this.hitCount >= this.HITS_TO_STUN) {
      this.stunEnemy();
    } else {
      if (this.anims.exists(`${this.texture.key}_${PixelEnemyAnimation.HIT}`)) {
        this.playAnimation(PixelEnemyAnimation.HIT, true);
      }
    }
  }

  private stunEnemy() {
    this.isStunned = true;
    this.hitCount = 0; // Reset hit counter
    this.setVelocity(0, 0);
    this.setTint(0x4444ff); // Blue tint for stunned state

    // The burst role (plan G12). The ⚡ glyphs were dropped: no brand face has them, so they fell
    // back to an emoji font. 27 CSS px is the old 18 world px at the platformer zoom.
    const stunnedText = ttWorldText(this.scene, this.x, this.y - 60, "STUNNED!", "burst", 27, {
      color: "#FFD700",
      stroke: "#FF4500",
      shadow: { offsetX: 2, offsetY: 2, color: "#000000", blur: 8, fill: true },
      origin: 0.5,
      depth: 1000,
    });
    stunnedText.setScale(scaleTo(stunnedText, 0.5));

    this.scene.tweens.add({
      targets: stunnedText,
      y: stunnedText.y - 50,
      scale: scaleTo(stunnedText, 2),
      duration: 300,
      ease: "Back.easeOut",
      yoyo: false,
    });

    this.scene.tweens.add({
      targets: stunnedText,
      angle: { from: -15, to: 15 },
      duration: 200,
      yoyo: true,
      repeat: 6,
      ease: "Sine.easeInOut",
    });

    this.scene.tweens.add({
      targets: stunnedText,
      scaleX: { from: scaleTo(stunnedText, 2), to: scaleTo(stunnedText, 2.2) },
      scaleY: { from: scaleTo(stunnedText, 2), to: scaleTo(stunnedText, 2.2) },
      duration: 400,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });

    this.scene.tweens.add({
      targets: stunnedText,
      alpha: 0,
      delay: 1500,
      duration: 800,
      ease: "Power2",
      onComplete: () => {
        stunnedText.destroy();
      },
    });

    // Play HIT animation during stun
    if (this.anims.exists(`${this.texture.key}_${PixelEnemyAnimation.HIT}`)) {
      this.playAnimation(PixelEnemyAnimation.HIT, true);
    }

    // End stun after duration
    this.scene.time.delayedCall(this.STUN_DURATION_MS, () => {
      this.isStunned = false;
      this.clearTint();
    });
  }

  private showHitText() {
    const hitText = ttWorldText(this.scene, this.x, this.y - 40, `${this.hitCount}/${this.HITS_TO_STUN}`, "burst", 18, {
      color: "#ffffff",
      stroke: "#ff0000",
      origin: 0.5,
    });

    this.scene.tweens.add({
      targets: hitText,
      y: hitText.y - 30,
      alpha: 0,
      duration: 800,
      ease: "Power2",
      onComplete: () => {
        hitText.destroy();
      },
    });
  }

  protected playAnimation(key: PixelEnemyAnimation, ignoreIfPlaying = true) {
    this.play(`${this.texture.key}_${key}`, ignoreIfPlaying);
  }

  protected dealDamageToPlayer(target: Phaser.Physics.Arcade.Sprite | null) {
    if (!target) return;

    if (this.hasDealtDamage) return;

    // Calculate distance from body centers for accurate hit detection
    const enemyBodyCenterX = this.body
      ? this.body.x + this.body.width / 2
      : this.x;
    const enemyBodyCenterY = this.body
      ? this.body.y + this.body.height / 2
      : this.y;
    const targetBodyCenterX = target.body
      ? (target.body as Phaser.Physics.Arcade.Body).x +
        (target.body as Phaser.Physics.Arcade.Body).width / 2
      : target.x;
    const targetBodyCenterY = target.body
      ? (target.body as Phaser.Physics.Arcade.Body).y +
        (target.body as Phaser.Physics.Arcade.Body).height / 2
      : target.y;

    const distance = Phaser.Math.Distance.Between(
      enemyBodyCenterX,
      enemyBodyCenterY,
      targetBodyCenterX,
      targetBodyCenterY,
    );

    // Use attack range from subclass (default 60 if not set)
    const attackRange = this.attackRange || 60;

    if (distance < attackRange) {
      this.hasDealtDamage = true;

      const pixelRescueScene = this.scene as PixelRescueScene;

      // Check if player has active shield
      const shieldAbsorbed = pixelRescueScene.consumeShield(this);

      if (shieldAbsorbed) {
        return;
      }

      pixelRescueScene.handlePlayerHit();
    }
  }

  private showDamageText(target: Phaser.Physics.Arcade.Sprite) {
    const hitMessages = ["HIT!", "OUCH!", "BITE!", "AGHW!", "POW!", "SMACK!"];
    const randomMessage = Phaser.Utils.Array.GetRandom(hitMessages);

    const damageText = ttWorldText(this.scene, target.x, target.y - 40, randomMessage, "burst", 18, {
      color: "#ff3b3b",
      stroke: "#ffffff",
      origin: 0.5,
    });

    const randomOffsetX = Phaser.Math.Between(-20, 20);

    this.scene.tweens.add({
      targets: damageText,
      y: damageText.y - 80,
      x: damageText.x + randomOffsetX,
      alpha: 0,
      scale: scaleTo(damageText, 1.5),
      duration: 1000,
      ease: "Power2",
      onComplete: () => {
        damageText.destroy();
      },
    });

    this.scene.tweens.add({
      targets: damageText,
      angle: Phaser.Math.Between(-15, 15),
      duration: 1000,
      ease: "Sine.easeInOut",
    });
  }
}
