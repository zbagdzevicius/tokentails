import { Scene } from "phaser";
import { Cat } from "@/components/catbassadors/objects/Catbassador";

export interface IPortalConfig {
  scene: Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  cat: Cat;
  portals: {
    entranceX: number;
    entranceY: number;
    exitX: number;
    exitY: number;
    isGlitch: boolean;
  }[];
  onTeleport?: () => void;
}

export class PortalManager {
  private scene: Scene;
  private portalPairs: IPortalConfig["portals"];
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private cat: Cat;
  private onTeleport?: () => void;

  constructor(config: IPortalConfig) {
    this.scene = config.scene;
    this.portalPairs = config.portals;
    this.groundLayer = config.groundLayer;
    this.cat! = config.cat;
    this.onTeleport = config.onTeleport;
  }

  create() {
    this.portalPairs.forEach(
      ({ entranceX, entranceY, exitX, exitY, isGlitch }) => {
        const entranceHitbox = this.createPortalHitbox(
          entranceX,
          entranceY,
          isGlitch
        );

        this.scene.physics.add.overlap(
          this.cat.sprite,
          entranceHitbox as any,
          () => this.teleportPlayer(exitX, exitY),
          undefined,
          this
        );
      }
    );
  }

  private createPortalHitbox(
    x: number,
    y: number,
    isGlitch: boolean
  ): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(x, y, 64, 64).setOrigin(0.5, 0.75);
    this.scene.physics.add.existing(zone);
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 64);
    body.allowGravity = false;
    body.setImmovable(true);
    body.debugShowBody = false;
    return zone;
  }

  private teleportPlayer(x: number, y: number) {
    this.cat.sprite.disableBody(true, true);
    this.cat.sprite.setPosition(x, y);

    this.scene.time.delayedCall(100, () => {
      this.cat.sprite.enableBody(false, x, y, true, true);
    });

    if (this.onTeleport) this.onTeleport();
  }
}
