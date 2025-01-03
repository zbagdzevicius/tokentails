import { BaseCoinPhysicsEntity } from "./BaseCoinPhysicsEntity";
import { ExtendedScene } from "./BaseCoinPhysicsEntity";

export enum PowerUpType {
  SPEED = "SPEED",
}

const PowerUpSpriteMap: Record<PowerUpType, string> = {
  [PowerUpType.SPEED]: "speedPowerUp",
};

const ALL_POWERUPS = Object.values(PowerUpType);

function getRandomPowerUpType(): PowerUpType {
  const randomIndex = Math.floor(Math.random() * ALL_POWERUPS.length);
  return ALL_POWERUPS[randomIndex];
}

export class PowerUp extends BaseCoinPhysicsEntity {
  type: PowerUpType;

  constructor(scene: ExtendedScene, x: number, y: number, type?: PowerUpType) {
    const powerUpType = type || getRandomPowerUpType();
    super(scene, x, y, PowerUpSpriteMap[powerUpType]);

    this.type = powerUpType;
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
