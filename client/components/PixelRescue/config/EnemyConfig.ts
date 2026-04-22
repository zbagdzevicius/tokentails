import { PixelEnemyAnimation } from "../objects/BasePixelEnemy";

export const BLOCKER_TEXTURE_KEY = "enemy-blocker";
export const RUNNER_TEXTURE_KEY = "enemy-runner";

export interface IEnemyAnimConfig {
  key: PixelEnemyAnimation;
  frames: number;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  repeat: number;
}

export const ENEMY_ANIMATIONS: IEnemyAnimConfig[] = [
  {
    key: PixelEnemyAnimation.ATTACK,
    frames: 6,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: 0,
  },
  {
    key: PixelEnemyAnimation.ATTACK1,
    frames: 6,
    startFrame: 6,
    endFrame: 11,
    frameRate: 14,
    repeat: 0,
  },
  {
    key: PixelEnemyAnimation.DIE,
    frames: 6,
    startFrame: 12,
    endFrame: 17,
    frameRate: 10,
    repeat: 0,
  },
  {
    key: PixelEnemyAnimation.HIT,
    frames: 4,
    startFrame: 18,
    endFrame: 21,
    frameRate: 12,
    repeat: 0,
  },
  {
    key: PixelEnemyAnimation.IDLE,
    frames: 6,
    startFrame: 24,
    endFrame: 27,
    frameRate: 10,
    repeat: -1,
  },
  {
    key: PixelEnemyAnimation.RUN,
    frames: 6,
    startFrame: 30,
    endFrame: 35,
    frameRate: 10,
    repeat: -1,
  },
];
