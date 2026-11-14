/**
 * Champ's skill FX (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.4 "Moves and VFX"): boxing gloves, punch
 * stars and a ring bell.
 *
 * - Passive One-Two: the Cross (the third basic, or the one Bob and Weave primed) lands a big comic punch star.
 * - Q Haymaker: a cone telegraph at the sim range and arc over the short windup, then a red glove crescent.
 * - W Rope-a-Dope: three rope rings round him for the guard's length; the heal back ticks as hearts.
 * - E Bob and Weave: glove afterimages along the dash.
 * - R KNOCKOUT! (signature): a red ring on the target over the windup; on the hit a huge punch star, a shockwave and
 *   "KNOCKOUT!"; the wall hit (`clip` event 'ko') spins stars round the dazed cat.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/champ.ts): each skill also draws its nature accent and his
 * motif (punch stars in red and white). Pooled, no allocation per event or per frame. Render only.
 */
import { type SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, orbit, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, arcRad, faceOf, mesh, vary, yawOf } from './dogFx';
import { drawIdentity } from './identityFx';

const GLOVE = 0xe8322a;
const WHITE = 0xffffff;
const STAR = 0xffe14a;
/** Per caster: the KNOCKOUT! cast tick (its hit on the same tick gets the big star) and the One-Two basics seen. */
const R_TICK = new Int32Array(16).fill(-1);
const ok = (id: number): boolean => id >= 0 && id < 16;

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'champ', src, skill, x, y, z, n, dx, dz, nature);

export const SKILL_FX: SkillFxSet = {
  hero: 'champ',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.slot === 0) {
      if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
      const a = fx.abil(e.src, 'q');
      mesh(fx, 'arc', P.x, P.z, (a.range ?? 3000) / 1000, e.ticks * TICK_S + 0.05, GLOVE, rim, rel, { yaw: yawOf(F.x, F.z), p0: arcRad(a.arc) });
    } else if (e.slot === 3) {
      const x = e.x / 1000;
      const z = -e.y / 1000;
      mesh(fx, 'ring', x, z, 1.0, e.ticks * TICK_S + 0.05, GLOVE, rim, rel, { p1: 0.9 });
    }
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0: {
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        const a = fx.abil(e.src, 'q');
        mesh(fx, 'crescent', P.x, P.z, (a.range ?? 3000) / 1000, 0.3, GLOVE, rim, rel, { yaw: yawOf(F.x, F.z), p0: arcRad(a.arc) });
        identity(fx, e.src, 'q', P.x + F.x, 0.4, P.z + F.z, 5, F.x, F.z);
        return;
      }
      case 1: {
        const dur = (fx.abil(e.src, 'w').duration ?? 45) * TICK_S;
        for (let k = 0; k < 3; k++) mesh(fx, 'ring', P.x, P.z, 0.9 + k * 0.08, dur, k === 1 ? WHITE : GLOVE, rim, rel, { y: 0.5 + k * 0.3, p1: 0.3 });
        identity(fx, e.src, 'w', P.x, 0.3, P.z, 5);
        return;
      }
      case 2:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        for (let k = 0; k < 3; k++) sticker(fx, P.x + F.x * k * 0.9, 1.4, P.z + F.z * k * 0.9, 'SOFT', GLOVE, 0.4, 0.25 + k * 0.05);
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 4, F.x, F.z);
        return;
      default:
        if (ok(e.src)) R_TICK[e.src] = e.tick;
    }
  },

  onHit(e, fx) {
    if (!ok(e.src) || funHeroOf(fx, e.src) !== 'champ' || !fx.heroPos(e.dst, Q)) return;
    if (R_TICK[e.src] === e.tick && e.kind === 'ability') {
      R_TICK[e.src] = -1;
      mesh(fx, 'ring', Q.x, Q.z, 2.2, 0.4, WHITE, fx.rim(e.src), fx.relation(e.src), { p1: 0.8 });
      shower(fx, Q.x, 1.2, Q.z, 12, SHAPE.STAR5, STAR, 0.34, 0.5, 3.2, 1.6, 0, vary(), true);
      sticker(fx, Q.x, 1.4, Q.z, 'STAR', GLOVE, 1.1, 0.35);
      identity(fx, e.src, 'r', Q.x, 0.6, Q.z, 6);
      funPop(fx, e.src, 'KNOCKOUT!', Q.x, funOverY(fx, e.dst, 0.5), Q.z);
      return;
    }
    if (e.kind === 'ability' && e.amount > 0) {
      // the Cross (and the Haymaker's hits): a punch star
      sticker(fx, Q.x, 1.3, Q.z, 'STAR', STAR, 0.55, 0.25);
      identity(fx, e.src, 'passive', Q.x, 0.6, Q.z, 2, 0, 0, false);
    }
  },

  onClip(id, what, fx) {
    // the dazed cat (the event names the victim, like 'frozen')
    if (what !== 'ko' || !fx.heroPos(id, P)) return;
    orbit(fx, P.x, funOverY(fx, id, 0.1), P.z, 'STAR', STAR, 5, 0.5, 0.26, 1.2, vary() * Math.PI * 2);
  },
};
