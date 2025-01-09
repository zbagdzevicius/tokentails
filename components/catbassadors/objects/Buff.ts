import { BaseCoinPhysicsEntity } from "./BaseCoinPhysicsEntity";
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

export class Buff extends BaseCoinPhysicsEntity {
  type: BuffType;

  constructor(scene: ExtendedScene, x: number, y: number, type?: BuffType) {
    const buffUpType = type || getRandomPowerUpType();
    super(scene, x, y, BuffSpriteMap[buffUpType]);

    this.type = buffUpType;
    this.vx = 12;
    this.vy = 12;
  }

  update() {
    super.update();
  }
   destroy() {
    this.sprite.destroy();
  }
}
