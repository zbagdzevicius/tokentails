import { Scene } from "phaser";
import { Cat } from "@/components/catbassadors/objects/Catbassador";

export interface IPortalConfig {
  scene: Scene;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  cat:Cat;
  portals: { entranceX: number; entranceY: number; exitX: number; exitY: number }[];
  onTeleport?: () => void;
}

export class PortalManager {
  private scene: Scene;
  private portalPairs: IPortalConfig["portals"];
  private groundLayer: Phaser.Tilemaps.TilemapLayer;
  private cat:Cat;
  private onTeleport?: () => void;

  constructor(config: IPortalConfig) {
    this.scene = config.scene;
    this.portalPairs = config.portals;
    this.groundLayer = config.groundLayer;
    this.cat! = config.cat;
    this.onTeleport = config.onTeleport;
  }

  create() {
    
    this.portalPairs.forEach(({ entranceX, entranceY, exitX, exitY }) => {
      // Create entrance portal
      const entrancePortal = this.createPortalSprite(entranceX, entranceY);

      // Create exit portal (optional if you want it visible)
      const exitPortal = this.createPortalSprite(exitX, exitY);
      this.scene.physics.add.overlap(
        this.cat.sprite,
        entrancePortal,
        () => this.teleportPlayer(exitX, exitY),
        undefined,
        this
      );
    });
  }

  private createPortalSprite(x: number, y: number) {
    const portal = this.scene.add
      .sprite(x, y, "portal")
      .setOrigin(0.5, 0.75)
      .setDepth(1)

    portal.play("portal-anim");

    this.scene.physics.add.existing(portal);
    const body = portal.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 64).setOffset(0, 0)
    body.allowGravity = false; 
body.setImmovable(true);

 
    body.allowGravity = false; 
    this.scene.physics.add.collider(portal, this.groundLayer!);
    return portal;
  }

  private teleportPlayer(x: number, y: number) {
    
    this.cat.sprite.setPosition(x, y);

    // this.scene.sound.play("powerup");
    if (this.onTeleport) this.onTeleport();
  }
}
