import { IPlayer } from "@/components/Phaser/PlayerMovement/IPlayer";
import { BossEnemy } from "@/components/purrquest/objects/Boss";
import { Enemy } from "@/components/purrquest/objects/Enemy";
import { CatAbilityType } from "@/models/cats";
import { CatbassadorsScene } from "../scenes/CatbassadorsScene";

export type GameScene = CatbassadorsScene;

const KNOCKBACK_ABILITY_DELAY_MS = 200;

export class Abilities {
  private player: IPlayer;
  private scene: GameScene;
  private catAbilityType!: CatAbilityType;
  private isOnCooldown: boolean = false;
  private knockbackSpellLifetimeMs: number;
  knockbackSpellGroup: Phaser.Physics.Arcade.Group;

  private static hueRotationMap: Record<string, number> = {
    ELECTRIC: 60, // Yellow
    STORM: 120, // Green
    FIRE: 30, // Orange
    WIND: 180, // Cyan
    DARK: 240, // Blue
    WATER: 200, // Aqua Blue
    AIR: 150, // Greenish Cyan
    EARTH: 25, // Yellowish Brown
    ICE: 210, // Light Blue
    NATURE: 90, // Lime Green
    SAND: 45, // Yellow Ochre
    TAILS: 270, // Purple
    LEGENDARY: 300, // Pinkish Purple
  };

  constructor(player: IPlayer, scene: GameScene, type: CatAbilityType) {
    this.player = player;
    this.scene = scene;
    this.catAbilityType = type;
    this.knockbackSpellLifetimeMs = (15 / 15) * 1000;

    this.knockbackSpellGroup = scene.physics.add.group();
    this.createAnimations();
  }

  // Ensure magic spell animations are created once
  private createAnimations(): void {
    if (!this.scene.anims.exists("knockback-spell_animation")) {
      this.scene.anims.create({
        key: "knockback-spell_animation",
        frames: this.scene.anims.generateFrameNumbers("knockback-spell", {
          start: 0,
          end: 18,
        }),
        frameRate: 18,
        repeat: 0,
      });
      this.scene.anims.create({
        key: "knockback-spell_animation-wall",
        frames: this.scene.anims.generateFrameNumbers("knockback-spell", {
          start: 18,
          end: 21,
        }),
        frameRate: 15,
        repeat: 0,
      });
    }
  }

  performKnocbackSpell(): void {
    if (this.isOnCooldown) {
      return;
    }

    this.isOnCooldown = true;

    this.scene.time.delayedCall(KNOCKBACK_ABILITY_DELAY_MS, () => {
      this.isOnCooldown = false;
    });

    const hueRotation = Abilities.hueRotationMap[this.catAbilityType] ?? 0;
    this.player.sprite.anims.play(this.player.animationKeys["HIT"], true);
    const direction = this.player.sprite.flipX ? -1 : 1;

    const knockbackSpell = this.scene.physics.add.sprite(
      this.player.sprite.x + direction,
      this.player.sprite.y,
      "knockback-spell"
    );
    this.knockbackSpellGroup.add(knockbackSpell);
    knockbackSpell
      .setScale(0.5)
      .setDepth(3)
      .setFlipX(direction === -1)
      .setVelocityX(500 * direction);

    knockbackSpell.anims.play("knockback-spell_animation", true);
    knockbackSpell.body.setAllowGravity(false);

    this.applyHueRotation(knockbackSpell, hueRotation);

    this.scene.physics.add.collider(
      knockbackSpell,
      (this.scene as GameScene).groundLayer!,
      () => {
        this.handleSpellAnimationAndDestroy(knockbackSpell);
      }
    );

    const enemyManager = (this.scene as CatbassadorsScene).enemyManager;
    if (enemyManager) {
      this.scene.physics.add.collider(
        knockbackSpell,
        enemyManager.enemies,
        (_spell, enemy) => {
          if (enemy instanceof Enemy) {
            (enemy as Enemy).knockDown();
            this.handleSpellAnimationAndDestroy(knockbackSpell);
          }
        }
      );
    }

    const boss = enemyManager?.bossEnemy; // Access the bossEnemy from the EnemyManager
    if (boss) {
      this.scene.physics.add.collider(
        knockbackSpell,
        boss,
        (_spell, bossEntity) => {
          if (bossEntity instanceof BossEnemy) {
            this.handleSpellHit(knockbackSpell, bossEntity as BossEnemy);
            this.handleSpellAnimationAndDestroy(knockbackSpell);
          }
        }
      );
    }

    // Lifetime expiration
    this.scene.time.delayedCall(this.knockbackSpellLifetimeMs, () => {
      if (knockbackSpell.active) knockbackSpell.destroy();
    });
  }

  private handleSpellAnimationAndDestroy(
    knockbackSpell: Phaser.Physics.Arcade.Sprite
  ): void {
    knockbackSpell.anims.play("knockback-spell_animation-wall", true);
    knockbackSpell.on("animationcomplete", () => {
      knockbackSpell.destroy();
    });
  }

  private applyHueRotation(
    sprite: Phaser.GameObjects.Sprite,
    hue: number
  ): void {
    const color = Phaser.Display.Color.HSVToRGB(hue / 360, 1, 1).color;
    sprite.setTint(color);
  }

  private handleSpellHit(
    knockbackSpell: Phaser.Physics.Arcade.Sprite,
    boss: BossEnemy
  ): void {
    if (!knockbackSpell.active) return;
    knockbackSpell.active = false;

    boss.takeDamage();
    this.scene.time.delayedCall(50, () => {
      if (knockbackSpell.active) {
        knockbackSpell.destroy();
      }
    });
  }
}
