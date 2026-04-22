import { Spike } from "../objects/Spikes";

export interface ISpikeManagerConfig {
  scene: Phaser.Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  spikeTiles: number[];
  catSprite: Phaser.Physics.Arcade.Sprite;
  onPlayerHitSpike: () => void;
}

export class SpikeManager {
  private scene: Phaser.Scene;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private spikeTiles: number[];
  private catSprite: Phaser.Physics.Arcade.Sprite;
  private spikes: Spike[] = [];
  private spikeGroup: Phaser.Physics.Arcade.StaticGroup;
  private onPlayerHitSpike: () => void;

  constructor(config: ISpikeManagerConfig) {
    this.scene = config.scene;
    this.groundLayer = config.groundLayer;
    this.spikeTiles = config.spikeTiles;
    this.catSprite = config.catSprite;
    this.onPlayerHitSpike = config.onPlayerHitSpike;

    // Single physics group for all spikes to minimize overlap registrations
    // Use a static physics group to avoid per-step integration cost for many bodies
    this.spikeGroup = this.scene.physics.add.staticGroup();

    this.initializeSpikes();
  }

  private initializeSpikes() {
    const spikeTiles = this.groundLayer.filterTiles((tile: any) =>
      this.spikeTiles.includes(tile.index)
    );

    spikeTiles.forEach((tile) => {
      const spikeX = tile.getCenterX();
      const spikeY = tile.getBottom();

      // Create a static physics sprite purely for collision
      const staticSpike = this.spikeGroup.create(
        spikeX,
        spikeY,
        "spike"
      ) as Phaser.Physics.Arcade.Sprite;

      // Hide visuals (collision only)
      staticSpike.setVisible(false);
      staticSpike.setAlpha(0);

      // Adjust rotation/size/offset per spike orientation
      const body = staticSpike.body as Phaser.Physics.Arcade.StaticBody | null;
      const tileWidth = (tile.width as number) || 32;
      const tileHeight = (tile.height as number) || 32;
      const spikeThickness = 4; // collider thickness along the edge
      
      switch (tile.index) {
        case 253: // up-facing

          body!.setSize(spikeThickness, tileWidth);
          body!.setOffset(0, -16);
          break;
        case 254: // left-facing

          body!.setSize(tileHeight, spikeThickness);
          body!.setOffset(0, -16);
          break;
        case 284: // right-facing
     
          body!.setSize(spikeThickness, tileHeight);
          body!.setOffset(27, -15);
          break;
        case 283: // down-facing
        
          body!.setSize(tileWidth, spikeThickness);
          body!.setOffset(0, 10);
          break;
      }
      

    });

    this.setupColliders();
  }

  private setupColliders() {
    this.scene.physics.add.overlap(
      this.catSprite,
      this.spikeGroup,
      () => {
        this.onPlayerHitSpike();
      },
      undefined,
      this
    );
  }

  public destroySpikes() {
    this.spikeGroup.clear(true, true);
  }
}

          // case 253:
          //   spike.setRotation(Phaser.Math.DegToRad(180));
          //   spike.setSize(1, 32);
          //   spike.setOffset(0, 0);
          //   break;
          // case 254:
          //   spike.setRotation(Phaser.Math.DegToRad(90));
          //   spike.setSize(32, 1);
          //   spike.setOffset(0, 0);
          //   break;
          // case 284:
          //   spike.setRotation(Phaser.Math.DegToRad(270));
          //   spike.setSize(1, 32);
          //   spike.setOffset(31, 0);
          //   break;
          // case 283:
          //   spike.setRotation(Phaser.Math.DegToRad(0));
          //   spike.setSize(32, 1);
          //   spike.setOffset(0, 31);
          //   break;
          // default:
          //   break;
 