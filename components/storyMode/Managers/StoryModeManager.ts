import { Scene } from "phaser";
import { Cat } from "../../catbassadors/objects/Catbassador";
import { MovableBlockManager } from "./MovableBlockManager";
import { FloatingPlatformManager } from "./FloatingPlatformManager";
import { RotatingMorgensternTrapManager } from "./RotatingMorgensternManager";
import { SawHalf } from "./SawHalfManager";
import { Saw } from "./SawManager";
import { DroppingSpike } from "./DroppingSpike";
import { HiddenTrap } from "./HiddenTrap";
import { RisingWaterManager } from "./RisingWaterManager";
import { HiddenSpikeManager } from "./HiddenSpikeManager";
import { PlumbDoorManager } from "./PlumbDoorManager";
import { PortalManager } from "./PortalManager";
import { DestroyableBlockManager } from "./DestroyableBlockManager";
import { IcyGroundManager } from "./IcyGroundManager";
import { LeverAndDoorManager } from "./LeverAndDoorManager";
import { FanManager } from "./FanManager";
import { CollectiveItem } from "../objects/CollectiveItem";
import { IKey } from "./PlumbDoorManager";
import { FallingColumnManager } from "./FallingColumnManager";

export class StoryModeManagers {
  constructor(
    private scene: Scene,
    private groundLayer: Phaser.Tilemaps.TilemapLayer,
    private platformsLayer: Phaser.Tilemaps.TilemapLayer,
    private jumperLayer: Phaser.Tilemaps.TilemapLayer,
    private physicsLayer: Phaser.Tilemaps.TilemapLayer
  ) {}

  createMovableBlocksOnTiles(
    tileNumber: number,
    managers: MovableBlockManager[]
  ) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileNumber) {
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();

        const movableBlockConfig = {
          scene: this.scene,
          groundLayer: this.groundLayer,
          platformsLayer: this.platformsLayer,
          jumperLayer: this.jumperLayer,
          x: worldX,
          y: worldY,
        };

        const manager = new MovableBlockManager(movableBlockConfig);
        manager.create();
        managers.push(manager);
      }
    });
  }

  createFloatingPlatformsOnTiles(
    tileNumber: number,
    managers: FloatingPlatformManager[]
  ) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileNumber) {
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();

        const floatingPlatformConfig = {
          scene: this.scene,
          groundLayer: this.groundLayer,
          platformsLayer: this.platformsLayer,
          x: worldX,
          y: worldY,
        };

        const manager = new FloatingPlatformManager(floatingPlatformConfig);
        managers.push(manager);
      }
    });
  }

  createMorgensternOnTile(
    tileNumber: number,
    traps: RotatingMorgensternTrapManager[]
  ) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileNumber) {
        const worldX = tile.getCenterX();
        const worldY = tile.getCenterY();

        const trapConfig = {
          scene: this.scene,
          groundLayer: this.groundLayer,
          platformsLayer: this.platformsLayer,
          x: worldX,
          y: worldY,
          radius: 60,
          speed: 0.05,
          texture: "spiked-ball",
          chainTexture: "chain",
        };

        const trap = new RotatingMorgensternTrapManager(trapConfig);
        traps.push(trap);
      }
    });
  }

  createDroppingSpikesOnTiles(tileIndex: number, spikes: DroppingSpike[]) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const spikeConfig = {
          scene: this.scene,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          groundLayer: this.groundLayer,
        };

        const spike = new DroppingSpike(spikeConfig);
        spikes.push(spike);
      }
    });
  }

  createHiddenTrapsOnTiles(tileIndex: number, traps: HiddenTrap[]) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const trapConfig = {
          scene: this.scene,
          texture: "spiked-wall",
          speed: 1,
          moveDuration: 3000,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        };

        const hiddenTrap = new HiddenTrap(trapConfig);
        traps.push(hiddenTrap);
      }
    });
  }

  createPortalPairs(
    entranceTileIndex: number,
    exitTileIndex: number,
    cat: Cat
  ) {
    const portalPairs: {
      entranceX: number;
      entranceY: number;
      exitX: number;
      exitY: number;
    }[] = [];
    const exitTiles: Phaser.Tilemaps.Tile[] = [];

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === exitTileIndex) {
        exitTiles.push(tile);
      }
    });

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === entranceTileIndex) {
        const closestExit = exitTiles.reduce((closest, exitTile) => {
          const distance = Phaser.Math.Distance.Between(
            tile.getCenterX(),
            tile.getCenterY(),
            exitTile.getCenterX(),
            exitTile.getCenterY()
          );

          return !closest || distance < closest.distance
            ? { tile: exitTile, distance }
            : closest;
        }, null as { tile: Phaser.Tilemaps.Tile; distance: number } | null);

        if (closestExit) {
          portalPairs.push({
            entranceX: tile.getCenterX(),
            entranceY: tile.getCenterY(),
            exitX: closestExit.tile.getCenterX(),
            exitY: closestExit.tile.getCenterY(),
          });
          exitTiles.splice(exitTiles.indexOf(closestExit.tile), 1);
        }
      }
    });

    const portalConfig = {
      scene: this.scene,
      groundLayer: this.groundLayer,
      portals: portalPairs,
      cat: cat,
    };

    new PortalManager(portalConfig).create();
  }

  createPlumbDoorsOnTiles(
    tileIndex: number,
    cat: Cat,
    managers: PlumbDoorManager[]
  ) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const doorConfig = {
          scene: this.scene,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          doorHeight: 96,
          player: cat.sprite as Phaser.Physics.Arcade.Sprite,
        };

        const doorManager = new PlumbDoorManager(doorConfig);
        managers.push(doorManager);
      }
    });
  }

  spawnKeysOnTiles(tileIndex: number, cat: Cat, keys: IKey[]) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const key = this.scene.physics.add.sprite(
          tile.getCenterX(),
          tile.getCenterY(),
          "key"
        );
        key.setOrigin(0.5, 0.5).setScale(0.5);
        (key.body as Phaser.Physics.Arcade.Body).allowGravity = false;

        this.scene.physics.add.overlap(cat.sprite, key, () => {
          if (key.active) {
            const keyData: IKey = {
              id: `key-${Phaser.Math.RND.uuid()}`,
              sprite: key,
            };
            keys.push(keyData);
            key.destroy();
          }
        });
      }
    });
  }

  createDestroyableBlocksOnTiles(
    tileIndex: number,
    cat: Cat,
    managers: DestroyableBlockManager[]
  ) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const config = {
          scene: this.scene,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          texture: "destroyable-block",
          cat: cat,
          playerAbility: cat.abilities.knockbackSpellGroup,
        };

        const manager = new DestroyableBlockManager(config);
        managers.push(manager);
      }
    });
  }

  createIcyGroundManager(tileIndexes: number[], cat: Cat) {
    return new IcyGroundManager({
      scene: this.scene,
      groundLayer: this.groundLayer,
      icyTiles: tileIndexes,
      player: cat,
    });
  }

  createLeversAndDoorsFromTiles(
    leverTileIndex: number,
    doorTileIndex: number,
    cat: Cat,
    managers: LeverAndDoorManager[]
  ) {
    const leverPositions: { x: number; y: number }[] = [];
    const doorPositions: { x: number; y: number }[] = [];

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === leverTileIndex) {
        leverPositions.push({ x: tile.getCenterX(), y: tile.getCenterY() });
      }
    });

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === doorTileIndex) {
        doorPositions.push({ x: tile.getCenterX(), y: tile.getCenterY() });
      }
    });

    leverPositions.forEach((leverPos, index) => {
      const doorPos = doorPositions[index];
      if (doorPos) {
        const config = {
          scene: this.scene,
          leverX: leverPos.x,
          leverY: leverPos.y,
          doorX: doorPos.x,
          doorY: doorPos.y,
          doorOpenDuration: 5000,
          player: cat.sprite as Phaser.Physics.Arcade.Sprite,
        };

        const manager = new LeverAndDoorManager(config);
        managers.push(manager);
      }
    });
  }

  createHiddenSpikesOnTiles(tileIndex: number, cat: Cat) {
    const spikeConfig = {
      scene: this.scene,
      texture: "hidden-spike",
      x: 0,
      y: 0,
      animationKey: "hidden-spike-anim",
      cat: cat,
    };

    const manager = new HiddenSpikeManager(this.scene, spikeConfig);

    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        manager.createSpike(tile.getCenterX(), tile.getCenterY());
      }
    });

    return manager;
  }

  createFansOnTiles(tileIndex: number, cat: Cat, fans: FanManager[]) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const fanConfig = {
          scene: this.scene,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          windStrength: 70,
          windDirection: new Phaser.Math.Vector2(0, -1),
          texture: "fan",
        };

        const fanManager = new FanManager(fanConfig);
        fans.push(fanManager);

        fanManager.setupPlayerInteraction(
          cat.sprite as Phaser.Physics.Arcade.Sprite
        );
      }
    });
  }

  createSawsOnTiles(tileIndex: number, saws: Array<Saw | SawHalf>) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const sawConfig = {
          scene: this.scene,
          groundLayer: this.groundLayer,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          route: "horizontal" as "horizontal" | "vertical",
          speed: 120,
          distance: 300,
        };

        const saw = new Saw(sawConfig);
        saws.push(saw);
      }
    });
  }

  createHalfSawsOnTiles(tileIndex: number, saws: Array<Saw | SawHalf>) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const sawConfig = {
          scene: this.scene,
          groundLayer: this.groundLayer,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
        };

        const saw = new SawHalf(sawConfig);
        saws.push(saw);
      }
    });
  }

  createRisingWater(cat: Cat) {
    const manager = new RisingWaterManager({
      scene: this.scene,
      startX: -550,
      startY: -550,
      width: 1800,
      height: 512,
      speed: 30,
      texture: "plumb-door",
    });

    this.scene.physics.add.overlap(cat.sprite, manager.getPlatform(), () => {
      (this.scene as any).endGame();
    });

    return manager;
  }

  createCollectiveItemsOnTiles(tileIndex: number, cat: Cat) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        const collectiveItem = this.scene.physics.add.sprite(
          tile.getCenterX(),
          tile.getCenterY(),
          "collective-item"
        );
        collectiveItem.setScale(0.5);
        collectiveItem.setOrigin(0.5, 0.5);
        (collectiveItem.body as Phaser.Physics.Arcade.Body).allowGravity =
          false;

        this.scene.physics.add.overlap(cat.sprite, collectiveItem, () => {
          if (collectiveItem.active) {
            cat.collectItem(collectiveItem);
            collectiveItem.setVisible(false);
          }
        });
      }
    });
  }

  createFallingColumnsOnTiles(
    tileIndex: number,
    cat: Cat,
    managers: FallingColumnManager[]
  ) {
    this.physicsLayer.forEachTile((tile) => {
      if (tile.index === tileIndex) {
        // Calculate the width by checking consecutive tiles to the right
        let width = 32; // Start with base width
        let currentX = tile.x + 1;
        const maxX = this.physicsLayer.width;

        while (currentX < maxX) {
          const tileRight = this.physicsLayer.getTileAt(currentX, tile.y);
          if (tileRight && tileRight.index === tileIndex) {
            width += 32;
            currentX++;
          } else {
            break;
          }
        }

        const columnConfig = {
          scene: this.scene,
          x: tile.getCenterX(),
          y: tile.getCenterY(),
          texture: "column",
          height: 32,
          width: 158,
        };

        const manager = new FallingColumnManager(columnConfig);
        managers.push(manager);

        // Set up player collision to trigger rotation and movement
        this.scene.physics.add.overlap(cat.sprite, manager.getSprite(), () => {
          manager.triggerFall(cat.sprite);
        });
      }
    });
  }

  setupPlayerAndManagerCollision(
    cat: Cat,
    movableBlockManager: MovableBlockManager[],
    floatingPlatformManagers: FloatingPlatformManager[],
    traps: RotatingMorgensternTrapManager[],
    saws: Array<Saw | SawHalf>,
    dropingSpikes: DroppingSpike[],
    hiddenTraps: HiddenTrap[],
    risingWaterManager?: RisingWaterManager,
    hiddenSpikeManager?: HiddenSpikeManager,
    fallingColumnManagers?: FallingColumnManager[]
  ) {
    movableBlockManager.forEach((manager) => {
      const blocks = manager.getMovableBlocks();
      this.scene.physics.add.collider(cat.sprite, blocks, (player, block) => {
        manager.handlePlayerPush(
          player as Phaser.Physics.Arcade.Sprite,
          block as Phaser.Physics.Arcade.Sprite
        );
      });
    });

    floatingPlatformManagers.forEach((manager) =>
      manager.setupPlayerCollision(cat.sprite as Phaser.Physics.Arcade.Sprite)
    );

    traps.forEach((trap) => {
      this.scene.physics.add.overlap(cat.sprite, trap.getMorgenstern(), () => {
        (this.scene as any).endGame();
      });
    });

    saws.forEach((saw) => {
      this.scene.physics.add.overlap(cat.sprite, saw.getSprite(), () => {
        (this.scene as any).endGame();
      });
    });

    dropingSpikes.forEach((spike) => {
      this.scene.physics.add.overlap(cat.sprite, spike.getSprite(), () => {
        (this.scene as any).endGame();
      });
    });

    hiddenTraps.forEach((trap) => {
      this.scene.physics.add.overlap(cat.sprite, trap.getSprite(), () => {
        (this.scene as any).endGame();
      });
    });

    if (risingWaterManager) {
      this.scene.physics.add.overlap(
        cat.sprite,
        risingWaterManager.getPlatform(),
        () => {
          (this.scene as any).endGame();
        }
      );
    }

    if (hiddenSpikeManager) {
      this.scene.physics.add.overlap(
        cat.sprite,
        hiddenSpikeManager.getSpikes(),
        () => {
          (this.scene as any).endGame();
        }
      );
    }

    // Add collision for falling columns
    if (fallingColumnManagers) {
      fallingColumnManagers.forEach((columnManager) => {
        this.scene.physics.add.collider(
          cat.sprite,
          columnManager.getSprite(),
          () => {
            columnManager.triggerFall(cat.sprite);
          }
        );
      });
    }
  }
}
