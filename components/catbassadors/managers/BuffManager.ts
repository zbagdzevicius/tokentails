import Phaser from "phaser";
import { Buff, BuffType } from "../objects/Buff";
import { GameEvent, GameEvents } from "@/components/Phaser/events";
import { SpeedEffect } from "../objects/SpeedEffect";
import { CatbassadorsScene } from "../scenes/CatbassadorsScene";
import { PurrquestScene } from "@/components/purrquest/scenes/PurrquestScene";
import { Cat } from "../objects/Catbassador";

const POWERUP_DURATION_MS = 15000;

export interface IBuffManagerConfig {
  scene: Phaser.Scene;
  cat: Cat;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  buffSpawnThresholdMs?: number;
  buffBounds?: { xMin: number; xMax: number; yMin: number; yMax: number };
  baseWalkSpeed?: number;
}

export class BuffManager {
  private scene: PurrquestScene | CatbassadorsScene;
  private cat: Cat;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private buffSpawnTimer: NodeJS.Timeout | null = null;
  private currentBuff: Buff | null = null;
  private buffLifetimeTimer: NodeJS.Timeout | null = null;
  private speedBuffTimer: Phaser.Time.TimerEvent | null = null;
  private speedEffect: SpeedEffect | null = null;

  private spawnThresholdMs: number = 1;
  private spawnBounds: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } = {
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
  };
  private baseWalkSpeed = 200;
  private isGameStarted = false;

  constructor(config: IBuffManagerConfig) {
    this.scene = config.scene as CatbassadorsScene | PurrquestScene;
    this.cat = config.cat;
    this.groundLayer = config.groundLayer;

    if (config.buffSpawnThresholdMs) {
      this.spawnThresholdMs = config.buffSpawnThresholdMs;
    }
    if (config.buffBounds) {
      this.spawnBounds = config.buffBounds;
    }
    if (config.baseWalkSpeed) {
      this.baseWalkSpeed = config.baseWalkSpeed;
    }

    this.speedEffect = new SpeedEffect(this.scene);
  }

  public startGame(): void {
    this.isGameStarted = true;
    this.startSpawning();
  }

  public endGame(): void {
    this.isGameStarted = false;
    this.stopSpawning();
  }

  public startSpawning(): void {
    this.buffSpawnTimer = setInterval(() => {
      if (this.isGameStarted) {
        this.spawnBuff();
      }
    }, this.spawnThresholdMs);
  }

  public stopSpawning(): void {
    if (this.buffSpawnTimer) {
      clearInterval(this.buffSpawnTimer);
      this.buffSpawnTimer = null;
    }
    if (this.buffLifetimeTimer) {
      clearTimeout(this.buffLifetimeTimer);
      this.buffLifetimeTimer = null;
    }
    if (this.currentBuff) {
      this.currentBuff.destroy();
      this.currentBuff = null;
    }
  }

  private spawnBuff(): void {
    if (this.currentBuff || !this.isGameStarted) return; // Ensure game has started

    const x = Phaser.Math.Between(this.spawnBounds.xMin, this.spawnBounds.xMax);
    const y = Phaser.Math.Between(this.spawnBounds.yMin, this.spawnBounds.yMax);

    this.currentBuff = new Buff(this.scene, x, y);
    this.scene.add.existing(this.currentBuff);

    this.scene.physics.add.collider(this.currentBuff, this.groundLayer);
    this.scene.physics.add.overlap(
      this.cat.sprite!,
      this.currentBuff,
      this.handleBuffCollected,
      undefined,
      this
    );

    GameEvents[GameEvent.BUFF_SPAWN].push({ buff: this.currentBuff.type });

    this.buffLifetimeTimer = setTimeout(() => {
      if (this.currentBuff) {
        this.currentBuff.destroy();
        this.currentBuff = null;
      }
    }, POWERUP_DURATION_MS);
  }

  private handleBuffCollected = () => {
    if (!this.currentBuff) return;
    this.scene.sound.play("powerup");
    this.cat.isInvulnerable = true;

    if (this.currentBuff.type === BuffType.SPEED) {
      this.applyOrRefreshSpeedBuff();
      this.speedEffect?.play(this.cat.sprite!, POWERUP_DURATION_MS);
    }

    this.currentBuff.destroy();
    this.currentBuff = null;

    if (this.buffLifetimeTimer) {
      clearTimeout(this.buffLifetimeTimer);
      this.buffLifetimeTimer = null;
    }
  };

  private applyOrRefreshSpeedBuff() {
    if (!this.cat.sprite) return;
    this.cat.isInvulnerable = true; // Set invulnerability when buff starts

    if (this.speedBuffTimer) {
      this.speedBuffTimer.remove(false);
    } else {
      const currentSpeed =
        this.cat.sprite.getData("walkSpeed") || this.baseWalkSpeed;
      if (currentSpeed + 200 <= 630) {
        this.cat.sprite.setData("walkSpeed", currentSpeed + 200);
      }
    }

    GameEvents[GameEvent.CAT_BUFF].push({
      buff: BuffType.SPEED,
      duration: POWERUP_DURATION_MS,
    });

    this.speedBuffTimer = this.scene.time.delayedCall(
      POWERUP_DURATION_MS,
      () => {
        const currentSpeed =
          this.cat.sprite!.getData("walkSpeed") || this.baseWalkSpeed;
        this.cat.sprite!.setData("walkSpeed", currentSpeed - 200);

        // Reset invulnerability when the buff expires
        this.cat.isInvulnerable = false;

        GameEvents[GameEvent.CAT_BUFF].push({ buff: null, duration: 0 });
        this.speedBuffTimer = null;
      }
    );
  }
}
