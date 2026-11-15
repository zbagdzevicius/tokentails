/**
 * Barkula's skill FX (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.3 "Moves and VFX"): bats, a red-grey mist
 * and a red moon.
 *
 * - Night Thirst (passive): red drops float back to him off an ability hit.
 * - Q Bat Bite: the `fluff` shot is drawn as a little dark bat by projectileView; a flutter at the throw.
 * - W Bat Swarm: a ring of bats circles him for the swarm's duration (re-drawn each pulse), at the sim radius.
 * - E Mist Form: he dissolves into a mist (puffs round him for the duration; the snapshot's Channel bit fades him).
 * - R RED MOON (signature): a red moon over him and a red ring at the mark radius, "RED MOON"; the marked cats show
 *   a red drop; the pop (`clip` 'bitten', on each victim) bursts red drops toward him.
 * Pooled, no allocation per event or frame. Render only.
 */
import type { SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, orbit, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary } from './dogFx';
import { drawIdentity } from './identityFx';

const WINE = 0xd8204a;
const BAT = 0x2a1830;
const MIST = 0xb8a8b8;
/** Per caster: seconds of the swarm left (render clock), and the time to its next ring of bats. */
const SWARM = new Float32Array(16);
const NEXT = new Float32Array(16);
const ok = (id: number): boolean => id >= 0 && id < 16;

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'barkula', src, skill, x, y, z, n, dx, dz, nature);

export const SKILL_FX: SkillFxSet = {
  hero: 'barkula',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, P)) return;
    sticker(fx, P.x, funOverY(fx, e.src, 1.0), P.z, 'MOON', WINE, 1.2, e.ticks * TICK_S + 1.6);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        shower(fx, P.x + F.x * 0.5, 1.2, P.z + F.z * 0.5, 4, SHAPE.SOFT, BAT, 0.25, 0.4, 1.2, 0.6, 0, vary());
        identity(fx, e.src, 'q', P.x + F.x * 0.6, 0.3, P.z + F.z * 0.6, 4, F.x, F.z);
        return;
      case 1:
        if (ok(e.src)) {
          SWARM[e.src] = (fx.abil(e.src, 'w').duration ?? 75) * TICK_S;
          NEXT[e.src] = 0;
        }
        identity(fx, e.src, 'w', P.x, 0.3, P.z, 5);
        return;
      case 2: {
        const dur = (fx.abil(e.src, 'e').untargetable ?? 18) * TICK_S;
        shower(fx, P.x, 0.8, P.z, 12, SHAPE.PUFF, MIST, 0.6, dur + 0.3, 0.8, 0.5, 0, vary());
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 4);
        return;
      }
      default: {
        const rad = (fx.abil(e.src, 'r').radius ?? 5000) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 1.6, WINE, rim, rel, { p1: 0.9 });
        mesh(fx, 'glow', P.x, P.z, rad, 1.6, WINE, rim, rel, { p3: 0.4 });
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 8);
        funPop(fx, e.src, 'RED MOON', P.x, funOverY(fx, e.src, 0.5), P.z);
      }
    }
  },

  onHit(e, fx) {
    // Night Thirst: red drops off his ability hits on a cat
    if (e.kind !== 'ability' || e.amount <= 0 || funHeroOf(fx, e.src) !== 'barkula' || !fx.heroPos(e.dst, Q)) return;
    shower(fx, Q.x, 1.1, Q.z, 3, SHAPE.DROPLET, WINE, 0.2, 0.5, 1.0, 1.4, -4, vary());
    identity(fx, e.src, 'passive', Q.x, 0.6, Q.z, 2, 0, 0, false);
  },

  onClip(id, what, fx) {
    if (what !== 'bitten' || !fx.heroPos(id, Q)) return;
    shower(fx, Q.x, 1.2, Q.z, 10, SHAPE.DROPLET, WINE, 0.26, 0.6, 2.2, 2.0, -5, vary(), true);
    sticker(fx, Q.x, funOverY(fx, id, 0.2), Q.z, 'DROPLET', WINE, 0.6, 0.5, 0.5);
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      if (SWARM[id] <= 0) continue;
      SWARM[id] -= dt;
      NEXT[id] -= dt;
      if (NEXT[id] > 0 || !fx.heroPos(id, P)) continue;
      NEXT[id] = 0.5;
      const rad = (fx.abil(id, 'w').radius ?? 2800) / 1000;
      orbit(fx, P.x, 1.2, P.z, 'SOFT', BAT, 6, rad * 0.85, 0.32, 0.55, vary() * Math.PI * 2);
    }
  },
};
