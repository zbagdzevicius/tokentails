/**
 * Dusty's skill FX (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.2 "Moves and VFX"): corks, a bounce line, a
 * lasso and the noon sun.
 *
 * - Four Corks (passive): the Big Cork (`clip` event 'bigcork' on her) pops a sheriff star at the muzzle.
 * - Q Trick Shot: a cork streak to the target, then a bounce streak to the second target (`clip` 'ricochet' on it).
 * - W Lasso: a rope loop spins over her head through the 0.3 s windup; the roped dog (`clip` 'lasso') gets a loop round it.
 * - E Quick Draw: a dust cloud along the slide.
 * - R HIGH NOON (signature): the sun flares behind her as she plants, "HIGH NOON"; the corks fly as `fluff` shots.
 * Pooled, no allocation per event or frame. Render only.
 */
import type { SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, orbit, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';
import { drawIdentity } from './identityFx';

const CORK = 0xd8a868;
const SUN = 0xff8a3d;
const ROPE = 0xd8b07a;
const DUST = 0xe0c8a0;
/** Per caster: the Trick Shot's first target (for the bounce line), and its tick. */
const T1 = new Int16Array(16).fill(-1);
const T1_TICK = new Int32Array(16).fill(-1);
const ok = (id: number): boolean => id >= 0 && id < 16;

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'dusty', src, skill, x, y, z, n, dx, dz, nature);

/** A streak of cork sparks from a to b (m). */
function streak(fx: FxCtx, ax: number, az: number, bx: number, bz: number, color: number): void {
  const n = 5;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    sticker(fx, ax + (bx - ax) * t, 1.1, az + (bz - az) * t, 'SPARK', color, 0.22, 0.12 + t * 0.12);
  }
}

export const SKILL_FX: SkillFxSet = {
  hero: 'dusty',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    const t = e.ticks * TICK_S;
    if (e.slot === 1) orbit(fx, P.x, funOverY(fx, e.src, 0.3), P.z, 'RING', ROPE, 1, 0.4, 0.5, t + 0.1);
    else if (e.slot === 3) mesh(fx, 'glow', P.x, P.z, 1.6, t + 1.2, SUN, fx.rim(e.src), fx.relation(e.src), { p3: 0.6 });
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    switch (e.slot) {
      case 0:
        if (ok(e.src) && e.target >= 0 && fx.heroPos(e.target, Q)) {
          streak(fx, P.x, P.z, Q.x, Q.z, CORK);
          T1[e.src] = e.target;
          T1_TICK[e.src] = e.tick;
        }
        identity(fx, e.src, 'q', P.x, 0.3, P.z, 4);
        return;
      case 1:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        identity(fx, e.src, 'w', P.x + F.x, 0.3, P.z + F.z, 4, F.x, F.z);
        return;
      case 2:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        shower(fx, P.x, 0.3, P.z, 10, SHAPE.PUFF, DUST, 0.4, 0.6, 1.2, 0.6, -1, vary());
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 4, F.x, F.z);
        return;
      default:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        mesh(fx, 'arc', P.x + F.x * 0.5, P.z + F.z * 0.5, 2.5, 0.6, SUN, fx.rim(e.src), fx.relation(e.src), { yaw: yawOf(F.x, F.z), p0: 0.6 });
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 7, F.x, F.z);
        funPop(fx, e.src, 'HIGH NOON', P.x, funOverY(fx, e.src, 0.5), P.z);
    }
  },

  onClip(id, what, fx) {
    if (what === 'bigcork') {
      if (funHeroOf(fx, id) !== 'dusty' || !fx.heroPos(id, P)) return;
      faceOf(fx, id);
      sticker(fx, P.x + F.x * 0.7, 1.3, P.z + F.z * 0.7, 'STAR', SUN, 0.5, 0.25);
      identity(fx, id, 'passive', P.x + F.x * 0.7, 0.6, P.z + F.z * 0.7, 2, F.x, F.z, false);
      return;
    }
    if (what === 'ricochet') {
      // the bounce victim: a streak from the first target of the most recent Trick Shot
      if (!fx.heroPos(id, Q)) return;
      for (let s = 0; s < 16; s++) {
        if (T1[s] < 0 || T1_TICK[s] < 0 || !fx.heroPos(T1[s], P)) continue;
        streak(fx, P.x, P.z, Q.x, Q.z, CORK);
        T1[s] = -1;
        T1_TICK[s] = -1;
        break;
      }
      sticker(fx, Q.x, 1.2, Q.z, 'STAR4', CORK, 0.4, 0.3);
      return;
    }
    if (what === 'lasso') {
      if (!fx.heroPos(id, Q)) return;
      orbit(fx, Q.x, 0.8, Q.z, 'RING', ROPE, 1, 0.1, 0.9, 1.0);
      mesh(fx, 'ring', Q.x, Q.z, 0.7, 1.0, ROPE, 0xffffff, 'enemy', { y: 0.7, p1: 0.2 });
    }
  },
};
