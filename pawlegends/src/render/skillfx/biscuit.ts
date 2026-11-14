/**
 * Biscuit's skill FX (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.3 "Moves and VFX"): tennis balls and a red
 * leash.
 *
 * - Q Fetch!: a line telegraph at the sim range and width over the 0.3 s windup; the ball (`fluff` kind, drawn
 *   yellow-green by projectileView) trails a red leash from his paw, redrawn each frame from where he stands to the
 *   ball (render only); the catch (`clip` event 'fetch') yanks a leash line from the cat to him, "FETCH!".
 * - Passive Good Boy: a gold tag glint and a small shield ring on him on the stunning swat.
 * - W Tail Wag: a fan of wag lines and a ring at the sim radius.
 * - E Stubborn: a dust ring at his paws and a bark ring.
 * - R WALKIES! (signature): a red ring telegraph over the windup; on the cast red leash beams snap from him to every
 *   cat in the ring, a shield dome on him and "WALKIES!".
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/biscuit.ts): each skill also draws its nature accent and his
 * motif. Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { type SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';
import { drawIdentity } from './identityFx';

const BALL = 0xd8f24a;
const LEASH = 0xe0323a;
const GOLD = 0xf7bc3c;
/** Per caster: the Fetch! ball's projectile index (-1 none) and the R cast tick being collected. */
const BALL_I = new Int16Array(16).fill(-1);
const R_TICK = new Int32Array(16).fill(-1);
const ok = (id: number): boolean => id >= 0 && id < 16;
const V = { x: 0, y: 0, z: 0 };

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'biscuit', src, skill, x, y, z, n, dx, dz, nature);

/** A leash beam from (ax, az) to (bx, bz) (m). */
function leash(fx: FxCtx, id: number, ax: number, az: number, bx: number, bz: number, life: number, delay = 0): void {
  const dx = bx - ax;
  const dz = bz - az;
  const l = Math.hypot(dx, dz);
  if (l < 0.1) return;
  mesh(fx, 'beam', ax, az, l, life, LEASH, fx.rim(id), fx.relation(id), { yaw: yawOf(dx / l, dz / l), sz: 0.35, y: 0.9, p3: 1.2, delay });
}

export const SKILL_FX: SkillFxSet = {
  hero: 'biscuit',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.slot === 0) {
      if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
      const a = fx.abil(e.src, 'q');
      const len = (a.range ?? 9000) / 1000;
      mesh(fx, 'beam', P.x, P.z, len, e.ticks * TICK_S + 0.05, LEASH, rim, rel, { yaw: yawOf(F.x, F.z), sz: (a.width ?? 900) / 1000, y: 0.08, p3: 0.5 });
    } else if (e.slot === 3) {
      const rad = (fx.abil(e.src, 'r').radius ?? 5000) / 1000;
      mesh(fx, 'ring', P.x, P.z, rad, e.ticks * TICK_S + 0.05, LEASH, rim, rel, { p1: 0.9 });
    }
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        identity(fx, e.src, 'q', P.x + F.x * 0.6, 0.3, P.z + F.z * 0.6, 4, F.x, F.z);
        return;
      case 1: {
        const rad = (fx.abil(e.src, 'w').radius ?? 2600) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.35, BALL, rim, rel, { p1: 0.8 });
        shower(fx, P.x, 0.6, P.z, 6, SHAPE.SOFT, BALL, 0.22, 0.5, 2.4, 1.6, 6, vary());
        identity(fx, e.src, 'w', P.x, 0.3, P.z, 6);
        return;
      }
      case 2:
        mesh(fx, 'ring', P.x, P.z, 1.4, 0.4, GOLD, rim, rel, { p1: 0.7 });
        shower(fx, P.x, 0.2, P.z, 8, SHAPE.PUFF, 0xd8c09a, 0.3, 0.5, 1.6, 0.6, 2, vary());
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 5);
        return;
      default: {
        const rad = (fx.abil(e.src, 'r').radius ?? 5000) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.5, LEASH, rim, rel, { p1: 0.8 });
        mesh(fx, 'dome', P.x, P.z, 1.1, 1.2, GOLD, rim, rel, { p1: 0.4 });
        if (ok(e.src)) R_TICK[e.src] = e.tick;
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 6);
        funPop(fx, e.src, 'WALKIES!', P.x, funOverY(fx, e.src, 0.5), P.z);
      }
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.fluff || slot !== 0 || !ok(owner) || funHeroOf(fx, owner) !== 'biscuit') return;
    BALL_I[owner] = index ?? -1;
  },

  onHit(e, fx) {
    if (!ok(e.src) || funHeroOf(fx, e.src) !== 'biscuit' || !fx.heroPos(e.dst, Q) || !fx.heroPos(e.src, P)) return;
    if (e.kind === 'basic') return;
    if (R_TICK[e.src] === e.tick) {
      leash(fx, e.src, P.x, P.z, Q.x, Q.z, 0.6);
      sticker(fx, Q.x, 1.3, Q.z, 'EXCLAIM', LEASH, 0.4, 0.6);
    }
  },

  onClip(id, what, fx) {
    if (what !== 'fetch' || !fx.heroPos(id, P)) return;
    shower(fx, P.x, 1.0, P.z, 6, SHAPE.SOFT, BALL, 0.24, 0.5, 2.0, 1.4, 6, vary());
    funPop(fx, id, 'FETCH!', P.x, funOverY(fx, id, 0.4), P.z);
  },

  update(_dt, fx) {
    for (let id = 0; id < 16; id++) {
      const i = BALL_I[id];
      if (i < 0) continue;
      if (!fx.projPos?.(i, V) || !fx.heroPos(id, P)) {
        BALL_I[id] = -1;
        continue;
      }
      // the leash from his paw to the flying ball, redrawn each frame
      const dx = V.x - P.x;
      const dz = V.z - P.z;
      const l = Math.hypot(dx, dz);
      const n = Math.min(12, Math.max(2, Math.round(l / 0.6)));
      for (let k = 1; k < n; k++) sticker(fx, P.x + (dx * k) / n, 0.9, P.z + (dz * k) / n, 'DOT', LEASH, 0.16, 0.05);
    }
  },
};
