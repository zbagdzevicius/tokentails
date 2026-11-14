/**
 * Ziggy's skill FX (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.2 "Moves and VFX"): lightning everywhere.
 *
 * - Passive Static Step: his claws crackle after a dash; the charged basic snaps a small bolt on the hit.
 * - Q Zig: a zig-zag spark trail along each dash (the start and the aim end) and speed sparks.
 * - W Spark Swipe: a crackling ring at exactly the sim radius over the short windup, then a spark burst ring.
 * - E Tail Flick: a crackling shield dome on him and a bolt off the tail.
 * - R ZIGZAG STORM (signature): sparks gather over the windup; each storm strike lands an electric star burst on its
 *   victim and a bolt beam from the last strike point to the new one; "ZIGZAG STORM" on the first.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/ziggy.ts): each skill also draws its nature accent and his
 * motif (yellow bolts with a cyan glow). Pooled, no allocation per event or per frame. Render only.
 */
import { type SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';
import { drawIdentity } from './identityFx';

const BOLT = 0xffe14a;
const CYAN = 0x7fe8ff;
/** Per caster: the last strike point of the storm (m) and seconds the storm is still drawn. */
const LX = new Float32Array(16);
const LZ = new Float32Array(16);
const STORM = new Float32Array(16);
const ok = (id: number): boolean => id >= 0 && id < 16;

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'ziggy', src, skill, x, y, z, n, dx, dz, nature);

/** A zig-zag of sparks from a to b (m). */
function zigzag(fx: FxCtx, ax: number, az: number, bx: number, bz: number, y: number, life: number): void {
  const dx = bx - ax;
  const dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l;
  const nz = dx / l;
  const n = Math.min(10, Math.max(3, Math.round(l / 0.45)));
  for (let k = 0; k <= n; k++) {
    const off = (k % 2 ? 0.28 : -0.28) * (k === 0 || k === n ? 0 : 1);
    sticker(fx, ax + (dx * k) / n + nx * off, y, az + (dz * k) / n + nz * off, 'SPARK', k % 3 === 0 ? CYAN : BOLT, 0.3, life);
  }
}

export const SKILL_FX: SkillFxSet = {
  hero: 'ziggy',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.slot === 1) {
      const rad = (fx.abil(e.src, 'w').radius ?? 2400) / 1000;
      mesh(fx, 'ring', P.x, P.z, rad, e.ticks * TICK_S + 0.05, CYAN, rim, rel, { p1: 0.9 });
    } else if (e.slot === 3) shower(fx, P.x, 1.0, P.z, 8, SHAPE.SPARK, BOLT, 0.22, e.ticks * TICK_S + 0.1, 1.2, 1.0, 0, vary(), true);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0: {
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        const len = (fx.abil(e.src, 'q').dash ?? 3000) / 1000;
        zigzag(fx, P.x, P.z, P.x + F.x * len, P.z + F.z * len, 0.7, 0.45);
        identity(fx, e.src, 'q', P.x, 0.3, P.z, 4, F.x, F.z);
        return;
      }
      case 1: {
        const rad = (fx.abil(e.src, 'w').radius ?? 2400) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.35, BOLT, rim, rel, { p1: 0.8 });
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          zigzag(fx, P.x, P.z, P.x + Math.cos(ang) * rad, P.z + Math.sin(ang) * rad, 0.5, 0.3);
        }
        identity(fx, e.src, 'w', P.x, 0.3, P.z, 6);
        return;
      }
      case 2:
        mesh(fx, 'dome', P.x, P.z, 1.0, (fx.abil(e.src, 'e').duration ?? 45) * TICK_S, CYAN, rim, rel, { p1: 0.4 });
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 5);
        return;
      default:
        if (ok(e.src)) {
          LX[e.src] = P.x;
          LZ[e.src] = P.z;
          STORM[e.src] = ((fx.abil(e.src, 'r').strikes ?? 4) * (fx.abil(e.src, 'r').gap ?? 6) + 6) * TICK_S;
        }
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 6);
        funPop(fx, e.src, 'ZIGZAG STORM', P.x, funOverY(fx, e.src, 0.5), P.z);
    }
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !ok(e.src) || funHeroOf(fx, e.src) !== 'ziggy' || !fx.heroPos(e.dst, Q)) return;
    if (STORM[e.src] > 0) {
      // a storm strike: a bolt from the last strike point and a star burst on the victim
      const dx = Q.x - LX[e.src];
      const dz = Q.z - LZ[e.src];
      const l = Math.hypot(dx, dz);
      if (l > 0.1) mesh(fx, 'beam', LX[e.src], LZ[e.src], l, 0.25, BOLT, fx.rim(e.src), fx.relation(e.src), { yaw: yawOf(dx / l, dz / l), sz: 0.6, y: 0.9, p3: 1.6 });
      shower(fx, Q.x, 1.0, Q.z, 8, SHAPE.STAR4, BOLT, 0.26, 0.4, 2.2, 1.0, 0, vary(), true);
      LX[e.src] = Q.x;
      LZ[e.src] = Q.z;
      return;
    }
    shower(fx, Q.x, 1.0, Q.z, 4, SHAPE.SPARK, CYAN, 0.2, 0.3, 1.6, 0.8, 0, vary(), true);
    identity(fx, e.src, 'passive', Q.x, 0.6, Q.z, 2, 0, 0, false);
  },

  onClip(id, what, fx) {
    if (what !== 'zigzag' || !fx.heroPos(id, P)) return;
    shower(fx, P.x, 1.2, P.z, 10, SHAPE.SPARK, CYAN, 0.24, 0.5, 2.6, 1.6, 0, vary(), true);
  },

  update(dt) {
    for (let id = 0; id < 16; id++) if (STORM[id] > 0) STORM[id] = Math.max(0, STORM[id] - dt);
  },
};
