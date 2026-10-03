/**
 * Player animation names, without a Phaser import so pure helpers (and Jest) can use them.
 * `Catbassador.ts` re-exports both, so existing imports keep working.
 */
export enum PlayerAnimation {
  SLEEP = "SLEEP",
  DIGGING = "DIGGING",
  GROOMING = "GROOMING",
  HIT = "HIT",
  IDLE = "IDLE",
  JUMPING = "JUMPING",
  JUMPING_UP = "JUMPING_UP",
  LOAF = "LOAF",
  RUNNING = "RUNNING",
  SITTING = "SITTING",
  WALKING = "WALKING",
}

/** Every animation a player texture owns (`${textureKey}_${name}`), for removal on re-skin. */
export const PLAYER_ANIMATION_NAMES: readonly PlayerAnimation[] =
  Object.values(PlayerAnimation);
