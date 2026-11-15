/**
 * Ranger's skill FX (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.4 "Moves and VFX"): leaves, tennis balls and
 * a scope.
 *
 * - Camouflage (passive): leaves swirl as he fades (the snapshot hides him from the enemy); the Camouflage shot
 *   (`clip` 'camoshot' on him) pops a leaf burst at the muzzle.
 * - Q Tracer Ball: the `fluff` shot is drawn as a tennis ball by projectileView; a green puff at the muzzle.
 * - W Warning Bark: a bark cone to exactly the sim range and arc, leaves blown back.
 * - E Bush Dive: a leaf burst where he lands.
 * - R LONG SHOT (signature): a scope ring locks on the target through the windup and the shots, "LONG SHOT".
 * Pooled, no allocation per event or frame. Render only.
 */
import type { SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, arcRad, faceOf, mesh, vary, yawOf } from './dogFx';
import { drawIdentity } from './identityFx';

const LEAF = 0x6ad04a;
const BALL = 0xd8f24a;
const SCOPE = 0xff4a3a;
/** Per caster: the LONG SHOT target and seconds the scope is still drawn. */
const AIM = new Int16Array(16).fill(-1);
const AIM_T = new Float32Array(16);
const ok = (id: number): boolean => id >= 0 && id < 16;

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'ranger', src, skill, x, y, z, n, dx, dz, nature);

export const SKILL_FX: SkillFxSet = {
  hero: 'ranger',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onWindup(e, fx) {
    if (e.slot !== 3 || !ok(e.src) || e.dst === undefined || e.dst < 0) return;
    AIM[e.src] = e.dst;
    const r = fx.abil(e.src, 'r');
    AIM_T[e.src] = e.ticks * TICK_S + (r.shots ?? 3) * (r.gap ?? 12) * TICK_S + 0.3;
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        shower(fx, P.x + F.x * 0.7, 1.2, P.z + F.z * 0.7, 5, SHAPE.PUFF, BALL, 0.25, 0.4, 1.2, 0.6, 0, vary());
        identity(fx, e.src, 'q', P.x + F.x * 0.7, 0.3, P.z + F.z * 0.7, 4, F.x, F.z);
        return;
      case 1: {
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        const a = fx.abil(e.src, 'w');
        mesh(fx, 'crescent', P.x, P.z, (a.range ?? 3000) / 1000, 0.35, LEAF, rim, rel, { yaw: yawOf(F.x, F.z), p0: arcRad(a.arc, 1024) });
        shower(fx, P.x + F.x * 1.2, 0.8, P.z + F.z * 1.2, 8, SHAPE.FEATHER, LEAF, 0.25, 0.5, 2.4, 0.8, -2, vary());
        identity(fx, e.src, 'w', P.x + F.x, 0.3, P.z + F.z, 5, F.x, F.z);
        return;
      }
      case 2:
        shower(fx, P.x, 0.6, P.z, 12, SHAPE.FEATHER, LEAF, 0.28, 0.7, 1.8, 1.2, -2, vary());
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 4);
        return;
      default:
        if (ok(e.src) && e.target >= 0) AIM[e.src] = e.target;
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 7);
        funPop(fx, e.src, 'LONG SHOT', P.x, funOverY(fx, e.src, 0.5), P.z);
    }
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || funHeroOf(fx, e.src) !== 'ranger' || !fx.heroPos(e.dst, Q)) return;
    sticker(fx, Q.x, 1.2, Q.z, 'STAR4', BALL, 0.4, 0.25);
  },

  onClip(id, what, fx) {
    if (what !== 'camoshot' || funHeroOf(fx, id) !== 'ranger' || !fx.heroPos(id, P)) return;
    faceOf(fx, id);
    shower(fx, P.x + F.x * 0.6, 1.1, P.z + F.z * 0.6, 8, SHAPE.FEATHER, LEAF, 0.26, 0.6, 2.0, 1.0, -2, vary());
    identity(fx, id, 'passive', P.x, 0.6, P.z, 3, 0, 0, false);
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      if (AIM_T[id] <= 0) continue;
      AIM_T[id] -= dt;
      const t = AIM[id];
      if (t < 0 || !fx.heroPos(t, Q)) continue;
      // the scope: a red crosshair ring on the target, redrawn a few times a second
      if (Math.floor((AIM_T[id] + dt) * 6) !== Math.floor(AIM_T[id] * 6)) mesh(fx, 'ring', Q.x, Q.z, 1.0, 0.2, SCOPE, fx.rim(id), fx.relation(id), { p1: 0.9 });
    }
  },
};
