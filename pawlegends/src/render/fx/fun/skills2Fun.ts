/**
 * Skill-feel lane 2 (Bengas, Gabė, Meatball, Pixel) extras on top of the shared fun kit (./funKit.ts): a few more
 * composite stickers (a sleepy "Z", peeking eyes, a slice of toast, a bottle cap), a thrown sticker with its own
 * velocity and gravity (roses onto the stage, toast crumbs, cardboard confetti), and the overhead anchor of a hero's
 * Overhead anchors come from funKit (funOverY: chars/visualSize.ts), so the stickers sit over Pixel's small box and
 * Lambo's big head alike.
 *
 * Render only, decoration only: nothing here reads or changes a sim number. Every sprite goes into the existing
 * Particles pools (no new draw calls); nothing allocates per call. Low tier and reduced effects: no spin, and the
 * callers halve their counts with funKit's `funCount`. Every helper does nothing when the pools are not reachable (tests).
 */
import { viewSign } from '../../coords';
import { FADE, GROW, SHAPE } from '../Particles.js';
import { setColor } from '../../ppk/fx/util.js';
import type { FxCtx } from '../../anim/types';
import { funCount, funPool, type ParticlesLike } from './funKit';
import * as THREE from 'three';

const SH = SHAPE as unknown as Record<string, number | undefined>;
const C = new THREE.Color();

/** Spin allowed (Med / High without reduced effects). */
const spins = (fx: FxCtx): boolean => fx.tier !== 'low' && !fx.reduced;

/** The raw sprite: everything set, no defaults. Returns false when the pool is full. */
function spr(p: ParticlesLike, add: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number, shape: number, size: number, endMul: number, life: number, rot: number, spin: number, grav: number, drag: number, fade: number, grow: number, alpha = 1, floor = -Infinity): boolean {
  const s = p.begin();
  s.floor = floor;
  s.bounce = 0.25;
  s.x = x; s.y = y; s.z = z;
  s.vx = vx; s.vy = vy; s.vz = vz;
  s.life = life;
  s.size0 = size; s.size1 = size * endMul;
  s.grow = grow; s.fade = fade;
  s.rot = rot; s.spin = spin;
  s.gravity = grav; s.drag = drag;
  s.r = C.r; s.g = C.g; s.b = C.b; s.a = alpha; s.intensity = add ? 1.5 : 1;
  s.shape = shape; s.stretch = 1;
  return p.emit(add) >= 0;
}

/**
 * One sticker thrown with its own velocity (vx, vy, vz m/s) and gravity (m/s², down): a rose tossed onto the stage, a
 * toast crumb, a cardboard flake. `shape` is a Particles SHAPE id. Cut-out look (alpha pool) unless `glow`.
 */
export function throwSticker(fx: FxCtx, x: number, y: number, z: number, vx: number, vy: number, vz: number, shape: number, color: number, size: number, life: number, grav = 9, spin = 0, rot = 0, glow = false, floor = -Infinity): void {
  const p = funPool(fx);
  if (!p) return;
  setColor(C, color);
  spr(p, glow, x, y, z, vx, vy, vz, shape, size, 1, life, rot, spins(fx) ? spin : 0, grav, 0, FADE.HOLD, GROW.BACK, 1, floor);
}

/**
 * A sleepy "Z" (three strokes of cotton puffs: top bar, diagonal, bottom bar) drifting up and sideways. Uses a ZED SDF when the
 * shared shape set has one. `size` is the letter height (m).
 */
export function zed(fx: FxCtx, x: number, y: number, z: number, size: number, color: number, life: number, vy = 0.55, vx = 0.18): void {
  const p = funPool(fx);
  if (!p) return;
  setColor(C, color);
  const own = SH.ZED;
  if (own !== undefined) {
    spr(p, false, x, y, z, vx, vy, 0, own, size, 1.15, life, -0.2, 0, 0, 0, FADE.HOLD, GROW.BACK);
    return;
  }
  // a chunky sticker "Z": three strokes of lit cotton puffs (a capsule each), top bar, "/" diagonal, bottom bar
  const h = size * 0.5;
  const d = size * 0.15;
  for (let i = 0; i < 4; i++) {
    const u = i / 3 - 0.5;
    spr(p, false, x + u * size * 0.8, y + h, z, vx, vy, 0, SHAPE.PUFF, d * 1.9, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
    spr(p, false, x + u * size * 0.8, y - h, z, vx, vy, 0, SHAPE.PUFF, d * 1.9, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
  }
  for (let i = 1; i < 4; i++) {
    const u = i / 4 - 0.5;
    spr(p, false, x + u * size * 0.8, y + u * size, z, vx, vy, 0, SHAPE.PUFF, d * 1.9, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
  }
}

/**
 * Two eyes peeking (Pixel over her box flaps, a shy blink): white puffs with dark pupils, `blink` closes them at the
 * end of their life (they fade on FADE.HOLD). Screen-right is world +x, or −x for a team-1 seat (MAP-GAPS A24).
 */
export function eyes(fx: FxCtx, x: number, y: number, z: number, size: number, life: number, look = 0): void {
  const p = funPool(fx);
  if (!p) return;
  const sg = viewSign();
  const gap = size * 0.62 * sg;
  look *= sg;
  C.setRGB(1, 1, 1);
  spr(p, false, x - gap, y, z, 0, 0, 0, SHAPE.PUFF, size, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
  spr(p, false, x + gap, y, z, 0, 0, 0, SHAPE.PUFF, size, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
  setColor(C, 0x2a1a14);
  // pupils sit a hair toward the camera so they draw over the whites
  spr(p, false, x - gap + look * size * 0.18, y - size * 0.05, z + 0.02 * sg, 0, 0, 0, SHAPE.SOFT, size * 0.62, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
  spr(p, false, x + gap + look * size * 0.18, y - size * 0.05, z + 0.02 * sg, 0, 0, 0, SHAPE.SOFT, size * 0.62, 1, life, 0, 0, 0, 0, FADE.HOLD, GROW.BACK);
}

/** A slice of toast: a crust puff and a lighter crumb face, flying with (vx, vy, vz) (Bengas's Burnt Toast). */
export function toast(fx: FxCtx, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, burnt: boolean, spin = 0, rot = 0.4): void {
  const p = funPool(fx);
  if (!p) return;
  const sp = spins(fx) ? spin : 0;
  // PUFF (round, lit) rather than CONFETTI: confetti flips edge-on every few frames, which strobes on a re-dropped sticker
  setColor(C, burnt ? 0x3a2010 : 0x8a4a1a);
  spr(p, false, x, y, z, vx, vy, vz, SHAPE.PUFF, size, 1, life, rot, sp, 0, 0, FADE.HOLD, GROW.LINEAR);
  setColor(C, burnt ? 0x7a4a22 : 0xf2c272);
  spr(p, false, x, y + size * 0.04, z + 0.01, vx, vy, vz, SHAPE.PUFF, size * 0.74, 1, life, rot, sp, 0, 0, FADE.HOLD, GROW.LINEAR);
}

/** A bottle cap: a crimped silver rim (STAR8) round a coloured disc (Pixel's Cap Cannon). `rot` its roll, `grav` m/s². */
export function cap(fx: FxCtx, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: number, life: number, spin = 0, rot = 0, grav = 0): void {
  const p = funPool(fx);
  if (!p) return;
  const sp = spins(fx) ? spin : 0;
  C.setRGB(0.86, 0.9, 0.95);
  spr(p, false, x, y, z, vx, vy, vz, SHAPE.STAR8, size, 1, life, rot, sp, grav, 0, FADE.HOLD, GROW.LINEAR);
  setColor(C, color);
  spr(p, false, x, y, z + 0.01, vx, vy, vz, SHAPE.PUFF, size * 0.62, 1, life, 0, 0, grav, 0, FADE.HOLD, GROW.LINEAR);
}

/**
 * A burst of `n` thrown stickers of one SHAPE in a ring (confetti, crumbs, roses): speed `sp` outward, `up` m/s up,
 * gravity `grav`; `seed` (a funRand value) rotates the ring so replays match. Count follows `funCount`.
 */
export function shower(fx: FxCtx, x: number, y: number, z: number, n: number, shape: number, color: number, size: number, life: number, sp: number, up: number, grav: number, seed: number, glow = false): void {
  const p = funPool(fx);
  if (!p) return;
  const k = funCount(fx, n);
  setColor(C, color);
  const s = spins(fx);
  for (let i = 0; i < k; i++) {
    const a = seed * 6.283 + (i / k) * 6.283;
    const j = 0.7 + 0.6 * (((i * 0.618 + seed * 7.3) % 1 + 1) % 1);
    spr(p, glow, x, y, z, Math.cos(a) * sp * j, up * (0.8 + 0.4 * j), Math.sin(a) * sp * j, shape, size * (0.8 + 0.3 * j), 0.9, life, a, s ? 5 * (i & 1 ? 1 : -1) : 0, grav, 0.6, FADE.HOLD, GROW.BACK);
  }
}

/** True when the sticker pools are reachable (the real runtime; false in unit-test stubs). */
export const funReady = (fx: FxCtx): boolean => funPool(fx) !== null;
