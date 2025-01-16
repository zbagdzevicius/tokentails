import { ExtendedScene } from "./BaseCoinPhysicsEntity";

export enum BuffType {
  SPEED = "SPEED",
}

const BuffSpriteMap: Record<BuffType, string> = {
  [BuffType.SPEED]: "speedPowerUp",
};

const ALL_POWERUPS = Object.values(BuffType);

function getRandomPowerUpType(): BuffType {
  const randomIndex = Math.floor(Math.random() * ALL_POWERUPS.length);
  return ALL_POWERUPS[randomIndex];
}

export class Buff extends Phaser.Physics.Arcade.Sprite {
    type: BuffType;

    constructor(scene: ExtendedScene, x: number, y: number, type?: BuffType) {
       if (!scene.physics || !scene.add) {
      throw new Error("Scene is missing necessary systems for physics or display.");
    }
        const buffType = type || getRandomPowerUpType();
        super(scene, x, y, BuffSpriteMap[buffType]);

        scene.add.existing(this);

        scene.physics.add.existing(this);

        this.type = buffType;

         if (!this.body) {
      throw new Error("Buff failed to initialize physics body.");
    }

        const body = this.body as Phaser.Physics.Arcade.Body;
        body?.setSize(95, 95);
        body.setImmovable(true);
        body.allowGravity = false;
    }
}
