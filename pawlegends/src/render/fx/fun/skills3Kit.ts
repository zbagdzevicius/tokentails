/**
 * Skill-feel lane 3 helpers (render only; Duchess, Stilts, Brutus, Cacklejaw): small composite stickers built on the
 * shared fun kit (funKit.ts: pooled billboard sprites in the existing Particles pools, no new draw calls), head
 * anchors read off the drawn rig (so they follow each hero's visual size) and a once-per-cast latch for comic pops.
 * Sticker counts (funCount) and direct sounds (funSound) are funKit's.
 *
 * Nothing here allocates per call. Nothing feeds the sim.
 */
import type { FxCtx, V3Out } from '../../anim/types';
import { funHeroOf, funOverY, sticker } from './funKit';

const H: V3Out = { x: 0, y: 0, z: 0 };

/**
 * World y just over a unit's drawn head: the higher of the head bone plus `lift` (follows every clip's hop and rise) and
 * the visual-size table's top (funOverY: helmets, ears, plumes) less 0.35 m plus `lift`; 1.6 m plus `lift` for a unit
 * with neither.
 */
export function s3HeadY(fx: FxCtx, id: number, lift = 0.55): number {
  // the drawn top (visual size: helmets, ears, plumes) when the hero is known, the head bone when it is higher (a hop)
  const top = funHeroOf(fx, id) ? funOverY(fx, id, lift - 0.35) : -Infinity;
  if (fx.bonePos(id, 'head', H)) return Math.max(H.y + lift, top);
  return top > -Infinity ? top : 1.6 + lift;
}

/**
 * A little crown: three upright gold points (droplets), a band of three gold dots and a jewel. `size` is the crown's
 * width (m). Billboarded, rises at `vy`.
 */
export function s3Crown(fx: FxCtx, x: number, y: number, z: number, size: number, life: number, vy: number, gold: number, jewel: number): void {
  const s = size;
  // three leaf-shaped spikes (alpha stickers: overlapping refreshes never blow out), the middle one tallest, pearl
  // tips, a band of gold beads and a heart jewel
  sticker(fx, x - s * 0.34, y + s * 0.22, z, 'FEATHER', gold, s * 0.5, life, vy, 0, 0.25);
  sticker(fx, x, y + s * 0.3, z, 'FEATHER', gold, s * 0.64, life, vy);
  sticker(fx, x + s * 0.34, y + s * 0.22, z, 'FEATHER', gold, s * 0.5, life, vy, 0, -0.25);
  if (fx.tier !== 'low') {
    sticker(fx, x - s * 0.42, y + s * 0.46, z, 'PUFF', 0xfff6e0, s * 0.14, life, vy);
    sticker(fx, x + s * 0.42, y + s * 0.46, z, 'PUFF', 0xfff6e0, s * 0.14, life, vy);
    sticker(fx, x, y + s * 0.62, z, 'PUFF', 0xfff6e0, s * 0.16, life, vy);
  }
  for (let i = -2; i <= 2; i++) sticker(fx, x + i * s * 0.17, y - s * 0.02, z, 'PUFF', gold, s * 0.24, life, vy);
  sticker(fx, x, y + s * 0.02, z, 'HEART', jewel, s * 0.22, life, vy);
}

/** A ribbon medal: a gold star on two hanging ribbon tails (never red: the tails take `tail`). */
export function s3Medal(fx: FxCtx, x: number, y: number, z: number, size: number, life: number, tail: number): void {
  sticker(fx, x - size * 0.16, y + size * 0.42, z, 'FEATHER', tail, size * 0.55, life, 0, 0, 0.35);
  sticker(fx, x + size * 0.16, y + size * 0.42, z, 'FEATHER', tail, size * 0.55, life, 0, 0, -0.35);
  sticker(fx, x, y, z, 'STAR', 0xffd34d, size, life);
}

/** Two eyes (yellow-green glints) at (x, y, z): a cat peeking from the dark. */
export function s3Eyes(fx: FxCtx, x: number, y: number, z: number, color: number, life: number): void {
  sticker(fx, x - 0.13, y, z, 'BULB', color, 0.2, life);
  sticker(fx, x + 0.13, y, z, 'BULB', color, 0.2, life);
}

/** "Once per cast" latch for comic pops and flourishes: arm on the cast, take() is true once until the next arm. */
export class S3Once {
  private readonly armed: Uint8Array;
  private readonly at: Float64Array;
  constructor(n = 16) {
    this.armed = new Uint8Array(n);
    this.at = new Float64Array(n).fill(-99);
  }
  arm(id: number, now: number): void {
    if (id < 0 || id >= this.armed.length) return;
    this.armed[id] = 1;
    this.at[id] = now;
  }
  /** True once per arm, within `window` s of it. */
  take(id: number, now: number, window: number): boolean {
    if (id < 0 || id >= this.armed.length || !this.armed[id] || now - this.at[id] > window) return false;
    this.armed[id] = 0;
    return true;
  }
  reset(): void {
    this.armed.fill(0);
    this.at.fill(-99);
  }
}
