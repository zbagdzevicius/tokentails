/**
 * Nova's skill FX (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.1 "Moves and VFX"): stars that fall out of the
 * sky onto circles, a shooting star and a moonbeam.
 *
 * - Q Starfall: the burst disc is drawn by projectileView in her periwinkle while it arms; a star falls from high up
 *   and lands exactly when the zone goes off (arm ticks), with a ring and a gold sparkle.
 * - W Shooting Star: the `fluff` shot is drawn white by projectileView; a sparkle at the throw.
 * - E Moon Hop: a crescent glow where she stood (the slow-only moonbeam) that brightens when it goes off.
 * - R METEOR SHOWER (signature): stars gather over her paws through the windup; on the cast a big ring at the point and
 *   one meteor per pulse, each landing on its pulse tick, "METEOR SHOWER".
 * - Starlight (passive): a far hit on a dog sparkles with a gold star.
 *
 * Falling stars are queued with their landing time and drawn from `update`: pooled, no allocation per event or frame.
 */
import { HEROES } from '../../data/heroes';
import type { SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary } from './dogFx';
import { drawIdentity } from './identityFx';

const STAR = 0xfff2a8;
const SKY = 0x8fa8ff;
const WHITE = 0xf4f8ff;
const FALL_S = 0.45;
const FALL_H = 7;
/** Starlight's range (m): HEROES.nova.passive.range. */
const STARLIGHT_M = HEROES.nova.passive.range / 1000;

/** The falling-star queue: start time (s, render clock), x, z, size, caster. Fixed size, reused. */
const N = 32;
const QT = new Float32Array(N).fill(-1);
const QX = new Float32Array(N);
const QZ = new Float32Array(N);
const QS = new Float32Array(N);
const QC = new Int16Array(N);
let clock = 0;

function queue(src: number, x: number, z: number, landIn: number, size: number): void {
  for (let i = 0; i < N; i++) {
    if (QT[i] >= 0) continue;
    QT[i] = clock + Math.max(0, landIn - FALL_S);
    QX[i] = x;
    QZ[i] = z;
    QS[i] = size;
    QC[i] = src;
    return;
  }
}

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'nova', src, skill, x, y, z, n, dx, dz, nature);

export const SKILL_FX: SkillFxSet = {
  hero: 'nova',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, P)) return;
    const t = e.ticks * TICK_S;
    for (let k = 0; k < 5; k++) sticker(fx, P.x + (vary() - 0.5) * 0.9, 2.4 + k * 0.15, P.z + (vary() - 0.5) * 0.9, 'STAR4', STAR, 0.3, t + 0.2, 0.4);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0: {
        const a = fx.abil(e.src, 'q');
        const x = e.x / 1000;
        const z = -e.y / 1000;
        const arm = (a.arm ?? 21) * TICK_S;
        queue(e.src, x, z, arm, 0.9);
        mesh(fx, 'ring', x, z, (a.radius ?? 1700) / 1000, arm + 0.3, SKY, rim, rel, { p1: 0.4 });
        identity(fx, e.src, 'q', P.x, 0.3, P.z, 4);
        return;
      }
      case 1:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        shower(fx, P.x + F.x * 0.6, 1.2, P.z + F.z * 0.6, 6, SHAPE.STAR4, WHITE, 0.2, 0.5, 1.6, 0.8, 0, vary(), true);
        identity(fx, e.src, 'w', P.x + F.x * 0.6, 0.3, P.z + F.z * 0.6, 5, F.x, F.z);
        return;
      case 2: {
        const a = fx.abil(e.src, 'e');
        const arm = (a.arm ?? 12) * TICK_S;
        // the moonbeam stays where she stood (the cast fires before the hop moves her)
        mesh(fx, 'glow', P.x, P.z, (a.radius ?? 1800) / 1000, arm + 0.8, WHITE, rim, rel, { p3: 0.5 });
        mesh(fx, 'ring', P.x, P.z, (a.radius ?? 1800) / 1000, 0.5, SKY, rim, rel, { p1: 0.8, delay: arm });
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 4);
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        const x = e.x / 1000;
        const z = -e.y / 1000;
        const rad = (a.radius ?? 3800) / 1000;
        const arm = (a.arm ?? 24) * TICK_S;
        const every = (a.every ?? 12) * TICK_S;
        const pulses = a.pulses ?? 4;
        mesh(fx, 'glow', x, z, rad, arm + every * pulses, SKY, rim, rel, { p3: 0.45 });
        for (let k = 0; k < pulses; k++) {
          const ang = vary() * Math.PI * 2;
          const d = vary() * rad * 0.6;
          queue(e.src, x + Math.cos(ang) * d, z + Math.sin(ang) * d, arm + every * k, 1.5);
        }
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 8);
        funPop(fx, e.src, 'METEOR SHOWER', P.x, funOverY(fx, e.src, 0.5), P.z);
      }
    }
  },

  onHit(e, fx) {
    // Starlight: a far hit on a dog sparkles (7 m+: the passive's range)
    if (e.kind !== 'ability' || funHeroOf(fx, e.src) !== 'nova' || !fx.heroPos(e.dst, Q) || !fx.heroPos(e.src, P)) return;
    if (Math.hypot(Q.x - P.x, Q.z - P.z) < STARLIGHT_M) return;
    sticker(fx, Q.x, funOverY(fx, e.dst, 0.1), Q.z, 'STAR', STAR, 0.5, 0.4, 0.8);
    identity(fx, e.src, 'passive', Q.x, 0.6, Q.z, 3, 0, 0, false);
  },

  update(dt, fx) {
    clock += dt;
    for (let i = 0; i < N; i++) {
      if (QT[i] < 0 || clock < QT[i]) continue;
      const x = QX[i];
      const z = QZ[i];
      const s = QS[i];
      QT[i] = -1;
      // the star falls FALL_H m in FALL_S s, then a ring and a sparkle where it lands
      sticker(fx, x, FALL_H, z, 'STAR4', STAR, 0.5 * s, FALL_S, -FALL_H / FALL_S);
      mesh(fx, 'ring', x, z, 1.2 * s, 0.4, STAR, fx.rim(QC[i]), fx.relation(QC[i]), { p1: 0.9, delay: FALL_S });
    }
  },
};
