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
        const buffType = type || getRandomPowerUpType();
        super(scene, x, y, BuffSpriteMap[buffType]);

        scene.add.existing(this);

        scene.physics.add.existing(this);

        this.type = buffType;

        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setImmovable(true);
        body.allowGravity = false;
    }
}
