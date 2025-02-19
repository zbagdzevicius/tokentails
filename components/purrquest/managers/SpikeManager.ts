import { Cat } from "@/components/catbassadors/objects/Catbassador";
import { Spike } from "../objects/Spikes";

export interface ISpikeManagerConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  spikeTiles: number[];
  cat: Cat;
  onPlayerHitSpike: () => void;
}

export class SpikeManager {
  private scene: Phaser.Scene;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private spikeTiles: number[];
  private cat: Cat;
  private spikes: Spike[] = [];
  private onPlayerHitSpike: () => void;

  constructor(config: ISpikeManagerConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;
    this.spikeTiles = config.spikeTiles;
    this.cat = config.cat;
    this.onPlayerHitSpike = config.onPlayerHitSpike;

    this.initializeSpikes();
  }

  private initializeSpikes() {
    const spikeTiles = this.groundLayer.filterTiles((tile: any) =>
      this.spikeTiles.includes(tile.index)
    );

    spikeTiles.forEach((tile) => {
      const spikeX = tile.getCenterX();
      const spikeY = tile.getBottom();
      const spike = new Spike(this.scene, spikeX, spikeY, 0);

      switch (tile.index) {
        case 70:
          spike.setRotation(Phaser.Math.DegToRad(180));
          spike.setSize(1, 32);
          spike.setOffset(0, 0);
          break;
        case 71:
          spike.setRotation(Phaser.Math.DegToRad(90));
          spike.setSize(32, 1);
          spike.setOffset(0, 0);
          break;
        case 100:
          spike.setRotation(Phaser.Math.DegToRad(270));
          spike.setSize(1, 32);
          spike.setOffset(31, 0);
          break;
        case 99:
          spike.setRotation(Phaser.Math.DegToRad(0));
          spike.setSize(32, 1);
          spike.setOffset(0, 31);
          break;
        default:
          break;
      }

      this.spikes.push(spike);
    });

    this.setupColliders();
  }

  private setupColliders() {
    this.spikes.forEach((spike) => {
      this.scene.physics.add.overlap(
        this.cat.sprite,
        spike,
        this.handleSpikeCollision,
        undefined,
        this
      );
    });
  }

  private handleSpikeCollision = () => {
    // Skip spike collision if player is invulnerable
    if (this.cat.sprite && !this.cat.isInvulnerable) {
      this.onPlayerHitSpike();
    }
  };

  public destroySpikes() {
    this.spikes.forEach((spike) => spike.destroy());
    this.spikes = [];
  }
}
