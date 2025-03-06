import { BaseCoinPhysicsEntity } from "./BaseCoinPhysicsEntity";
import { ExtendedScene } from "./BaseCoinPhysicsEntity";

export enum CoinType {
  COIN = "COIN",
  BOSS_COIN = "BOSS_COIN",
  CANDY_CANE = "CANDY_CANE",
  TIME_COIN = "TIME_COIN",
  KEY = "KEY",
}

const EnemyTypeSriteMap: Record<CoinType, string> = {
  [CoinType.COIN]: "coin",
  [CoinType.BOSS_COIN]: "bosscoin",
  [CoinType.CANDY_CANE]: "candy-cane",
  [CoinType.TIME_COIN]: "timecoin",
  [CoinType.KEY]: "key",
};

const getCoinType = (): CoinType => {
  const type = Math.random() * 100;
  switch (true) {
    case type < 3:
      return CoinType.TIME_COIN;
    case type < 8:
      return CoinType.BOSS_COIN;
    case type < 25:
      return CoinType.CANDY_CANE;
    default:
      return CoinType.COIN;
  }
};

const CoinVelocity: Record<CoinType, number> = {
  [CoinType.COIN]: 5,
  [CoinType.CANDY_CANE]: 5,
  [CoinType.BOSS_COIN]: 8,
  [CoinType.TIME_COIN]: 12,
  [CoinType.KEY]: 12,
};

const CoinRewards: Record<CoinType, { coin: number; time: number }> = {
  [CoinType.COIN]: { coin: 1, time: 0 },
  [CoinType.CANDY_CANE]: { coin: 10, time: 1 },
  [CoinType.BOSS_COIN]: { coin: 100, time: 3 },
  [CoinType.TIME_COIN]: { coin: 1000, time: 10 },
  [CoinType.KEY]: { coin: 0, time: 0 },
};

export class Coin extends BaseCoinPhysicsEntity {
  coinReward: number;
  timeReward: number;
  type: CoinType;

  constructor(scene: ExtendedScene, x: number, y: number, type?: CoinType) {
    const coinType = type || getCoinType();
    super(scene, x, y, EnemyTypeSriteMap[coinType]);

    this.type = coinType;
    this.vx = CoinVelocity[coinType];
    this.vy = CoinVelocity[coinType];
    this.coinReward = CoinRewards[coinType].coin;
    this.timeReward = CoinRewards[coinType].time;
  }

  update() {
    super.update();
  }
}
