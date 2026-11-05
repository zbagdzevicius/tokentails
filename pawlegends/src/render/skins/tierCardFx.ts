/**
 * Token Tails card art in the world (cards lane): the card "flipping up" on a carded hero, as a TierFx extension
 * (`setTierExt`), in its own chunk so the first-load JS does not grow. Same caps as tierFx.ts (who may show it, Low,
 * team fights, stealth, the pool guard and COSMETIC_MAX), pooled option objects, nothing allocated per frame.
 *
 * | Rung      | Adds                                                                                       |
 * |-----------|--------------------------------------------------------------------------------------------|
 * | Rare+     | respawn: one element STAR4 ring at the feet the frame the hero is back (the HUD card flips) |
 * | Epic+     | respawn: + a rising column of STAR8 sparkles; standing still: one body twinkle every 1.1 s  |
 * | Legendary | respawn: + a wide cream "card flash" ring                                                   |
 */
import * as THREE from 'three';
import { ELEMENT_COLOR } from '../cosmetics';
import { rungAtLeast } from './registry';
import { glintColor, setTierExt, type FxHero, type TierFx } from './tierFx';

/** Epic+ standing still: one body twinkle per this many seconds. */
export const TWINKLE_GAP = 1.1;
const STAR4 = 2;
const STAR8 = 10;
const CREAM = 0xfff3dc;

const at = new THREE.Vector3();
const ringOpts: Record<string, unknown> = { additive: true, n: 10, shape: STAR4, color: 0xffffff, alpha: 0.85, intensity: 1.6, size: [0.18, 0.28], life: [0.5, 0.7], speed: [1.6, 2.4], r0: 0.5, up: 1.4 };
const colOpts: Record<string, unknown> = { additive: true, n: 8, shape: STAR8, color: 0xffffff, alpha: 0.7, intensity: 1.4, size: [0.1, 0.18], life: [0.6, 0.9], speed: [0.2, 0.6], up: 3.2, jitter: 0.35, gravity: -0.5 };
const flashOpts: Record<string, unknown> = { additive: true, n: 12, shape: STAR8, color: CREAM, alpha: 0.75, size: [0.16, 0.24], life: [0.55, 0.75], speed: [2.6, 3.4], r0: 0.9, up: 0.5, sizeEnd: 1 };
const twinkleOpts: Record<string, unknown> = { additive: true, n: 1, exact: true, shape: STAR8, color: 0xffffff, alpha: 0.5, intensity: 1.2, size: [0.1, 0.16], life: [0.6, 0.6], speed: [0.05, 0.15], up: 0.3, jitter: 0.05 };
/** The last twinkle per hero id, per TierFx (each match has its own clock); ids are slots 0–5. */
const twinkles = new WeakMap<TierFx, Float64Array>();

/** One hero's card flourish this frame (called by TierFx.hero once the hero may show cosmetics). */
export function cardFlourish(fx: TierFx, h: FxHero, wasDead: boolean): void {
  const p = fx.particles;
  if (!p) return;
  const k = h.id & 15;
  let lastTwinkle = twinkles.get(fx);
  if (!lastTwinkle) {
    lastTwinkle = new Float64Array(16).fill(-1e9);
    twinkles.set(fx, lastTwinkle);
  }
  if (wasDead && rungAtLeast(h.rung, 'RARE') && fx.room()) {
    at.set(h.x, 0.15, h.z);
    ringOpts.color = h.self ? ELEMENT_COLOR[h.element] : glintColor(h.element, false);
    p.ring(at, ringOpts);
    let n = 10;
    if (rungAtLeast(h.rung, 'EPIC')) {
      at.set(h.x, 0.4, h.z);
      colOpts.color = glintColor(h.element, h.self);
      p.burst(at, colOpts);
      n += 8;
    }
    if (rungAtLeast(h.rung, 'LEGENDARY')) {
      at.set(h.x, 0.2, h.z);
      p.ring(at, flashOpts);
      n += 12;
    }
    fx.claim(n, 0.9);
    lastTwinkle[k] = fx.time;
    return;
  }
  if (rungAtLeast(h.rung, 'EPIC') && !h.moving && !h.napping && fx.time - lastTwinkle[k] >= TWINKLE_GAP && fx.room()) {
    lastTwinkle[k] = fx.time;
    const a = fx.time * 7.3 + h.id * 1.7;
    at.set(h.x + Math.cos(a) * 0.38, 0.75 + (Math.sin(a * 1.9) + 1) * 0.45, h.z + Math.sin(a) * 0.38);
    twinkleOpts.color = glintColor(h.element, h.self);
    p.burst(at, twinkleOpts);
    fx.claim(1, 0.6);
  }
}

/** Turn the card flourish on (idempotent). */
export function installCardFlourish(): void {
  setTierExt(cardFlourish);
}
