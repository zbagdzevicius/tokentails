import { Scene } from "phaser";
import { StoryModeScene } from "../scenes/StoryModeScene";

export interface IKey {
  id: string;
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
}

export interface IPlumbDoorConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  doorHeight: number;
  player: Phaser.Physics.Arcade.Sprite;
}

export class PlumbDoorManager {
  private scene: Scene;
  private door: Phaser.Physics.Arcade.Sprite;
  private player: Phaser.Physics.Arcade.Sprite;

  private doorHeight: number;
  private isOpening: boolean = false;

  constructor(config: IPlumbDoorConfig) {
    this.scene = config.scene;
    this.doorHeight = config.doorHeight;
    this.player = config.player;

    this.door = this.scene.physics.add.sprite(
      config.x,
      config.y,
      "plumb-door"
    ) as Phaser.Physics.Arcade.Sprite;
    this.door.setOrigin(0.5, 0.8);
    const body = this.door.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.allowGravity = false;

    this.scene.physics.add.collider(
      this.player,
      this.door,
      this.tryOpenDoor,
      undefined,
      this
    );
  }

  private tryOpenDoor() {
    if (this.isOpening) return;

    const keys = (this.scene as StoryModeScene).getKeys();
    if (keys.length > 0) {
      keys.pop();
      this.openDoor();
    }
  }

  private openDoor() {
    this.isOpening = true;

    this.scene.tweens.add({
      targets: this.door,
      y: this.door.y - this.doorHeight,
      duration: 1500,
      onComplete: () => {
        this.door.destroy();
        this.isOpening = false;
      },
    });
  }

  public getSprite() {
    return this.door;
  }

  destroy() {
    if (this.door) {
      this.door.destroy();
    }
  }
}
