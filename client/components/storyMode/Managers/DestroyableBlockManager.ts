import { Cat } from "@/components/catbassadors/objects/Catbassador";
import { Scene } from "phaser";

export interface IDestroyableBlockConfig {
  scene: Scene;
  x: number;
  y: number;
  texture: string;
  cat: Cat;
  playerAbility: Phaser.Physics.Arcade.Group;
}
export class DestroyableBlockManager {
  private scene: Scene;
  private blockGroup: Phaser.Physics.Arcade.Group;
  private cat: Cat;
  private playerAbility: Phaser.Physics.Arcade.Group;

  constructor(config: IDestroyableBlockConfig) {
    this.scene = config.scene;
    this.playerAbility = config.playerAbility;
    this.cat = config.cat;

    this.blockGroup = this.scene.physics.add.group();

    this.addBlock(config.x, config.y, config.texture);

    this.scene.physics.add.collider(this.cat.sprite, this.blockGroup);
  }

  private addBlock(x: number, y: number, texture: string): void {
    const block = this.blockGroup.create(
      x,
      y,
      texture
    ) as Phaser.Physics.Arcade.Sprite;
    block.setImmovable(true);
    block.setOrigin(0.5, 0.5);
    (block.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.scene.physics.add.overlap(
      this.playerAbility,
      this.blockGroup,
      (_ability, block) =>
        this.handleBlockHit(block as Phaser.Physics.Arcade.Sprite)
    );
  }

  private handleBlockHit(block: Phaser.Physics.Arcade.Sprite): void {
    if (this.blockGroup.contains(block)) {
      this.blockGroup.remove(block, true, true);
    }
  }

  public getBlocks(): Phaser.Physics.Arcade.Group {
    return this.blockGroup;
  }

  destroy() {
    if (this.blockGroup) {
      this.blockGroup.destroy(true);
    }
  }
}
