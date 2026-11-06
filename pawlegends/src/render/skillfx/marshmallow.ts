/**
 * Marshmallow's skill FX (sim v13; build spec docs/plans/moba/DOGS-V13.md §1.2 "Moves and VFX"): ice blue and snow.
 *
 * - Q Snowball: a snow puff at her paws, a white ribbon and flakes riding the snowball (`fluff` kind, drawn white by
 *   projectileView), a snow poof and a ring on the hero it hits.
 * - W Snow Patch: a pale blue disc with a frosted edge at exactly the sim radius for its 120 t life, slow flakes
 *   falling over it.
 * - E Belly Slide: a snow spray off her belly along the slide; a shield shimmer when she lands.
 * - R SNOW DAY!: flakes swirling at the target over the windup; on the cast a frosted ring at the sim radius for the
 *   120 t state with snow falling inside it (no dome), the puppy "awoo" and "SNOW DAY!".
 * - The ice cube (signature, the `clip` event 'frozen' on a cat): a translucent ice block round the frozen hero for
 *   the freeze (30 t), frost glints and "BRR!".
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_S, abilNumbers } from '../anim/timing';
import type { SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, funSound, sticker } from '../fx/fun/funKit';
import { shower, throwSticker } from '../fx/fun/skills2Fun';
import { P, Q, mesh, vary } from './dogFx';

const ICE = 0x9fe8ff;
const SNOW = 0xf6fbff;
const FROST = 0xc8f0ff;
/** The freeze (s): the sim's r.freeze ticks. */
const FREEZE_S = (abilNumbers('marshmallow', 'r').freeze ?? 30) * TICK_S;

/** Live snow areas (patches and the blizzard): centre, radius, seconds left, next flake. */
const AREA_N = 8;
const AX = new Float32Array(AREA_N);
const AZ = new Float32Array(AREA_N);
const AR = new Float32Array(AREA_N);
const AT = new Float32Array(AREA_N);
const AN = new Float32Array(AREA_N);
const ABIG = new Uint8Array(AREA_N);
/** Per-caster snowball trail and slide spray. */
const TRAIL = new Int16Array(16).fill(-1);
const PROJ = new Int16Array(16).fill(-1);
const SLIDE = new Float32Array(16);

function addArea(x: number, z: number, r: number, life: number, big: boolean): void {
  let k = 0;
  for (let i = 0; i < AREA_N; i++) if (AT[i] < AT[k]) k = i;
  AX[k] = x;
  AZ[k] = z;
  AR[k] = r;
  AT[k] = life;
  AN[k] = 0;
  ABIG[k] = big ? 1 : 0;
}

export const SKILL_FX: SkillFxSet = {
  hero: 'marshmallow',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (e.slot !== 3) return;
    const a = fx.abil(e.src, 'r');
    const rad = (a.radius ?? 4000) / 1000;
    const x = e.x / 1000;
    const z = -e.y / 1000;
    mesh(fx, 'ring', x, z, rad, e.ticks * TICK_S, FROST, fx.rim(e.src), fx.relation(e.src), { p1: 0.9 });
    shower(fx, x, 2.5, z, 10, SHAPE.STAR4, SNOW, 0.3, 0.8, 2.5, -0.5, 0.5, vary(), true);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        shower(fx, P.x, 1.2, P.z, 6, SHAPE.PUFF, SNOW, 0.3, 0.4, 1.6, 1.2, 1, vary());
        funSound('marshPoof', P, 1.3, 0.35);
        return;
      case 1: {
        const a = fx.abil(e.src, 'w');
        const rad = (a.radius ?? 2800) / 1000;
        const life = (a.ttl ?? 120) * TICK_S;
        const x = e.x / 1000;
        const z = -e.y / 1000;
        mesh(fx, 'glow', x, z, rad, life, ICE, rim, rel, { p3: 0.45 });
        mesh(fx, 'ring', x, z, rad, life, FROST, rim, rel, { p1: 0.88 });
        shower(fx, x, 0.3, z, 10, SHAPE.PUFF, SNOW, 0.45, 0.6, 2.4, 0.6, 1.5, vary());
        addArea(x, z, rad, life, false);
        funSound('marshPoof', { x, z }, 0.8, 0.5);
        return;
      }
      case 2:
        if (e.src >= 0 && e.src < 16) SLIDE[e.src] = 0.45;
        return;
      default: {
        const a = fx.abil(e.src, 'r');
        const rad = (a.radius ?? 4000) / 1000;
        const life = (a.duration ?? 120) * TICK_S;
        const x = e.x / 1000;
        const z = -e.y / 1000;
        mesh(fx, 'ring', x, z, rad, life, FROST, rim, rel, { p1: 0.85 });
        mesh(fx, 'glow', x, z, rad, life, ICE, rim, rel, { p3: 0.35 });
        // the snow dump: a big burst of glowing flakes over the whole area and a puff ring at its edge, so SNOW DAY!
        // reads as snow on the first frame, not as a blue disc (QA 2026-11-06)
        shower(fx, x, 3.6, z, 28, SHAPE.PUFF, 0xffffff, 0.4, 1.6, rad * 0.9, 0.6, 1.4, vary());
        shower(fx, x, 0.4, z, 16, SHAPE.PUFF, SNOW, 0.6, 0.9, rad * 1.1, 0.8, 1.5, vary());
        addArea(x, z, rad, life, true);
        funSound('marshAwoo', P, 1, 0.6);
        funPop(fx, e.src, 'SNOW DAY!', P.x, funOverY(fx, e.src, 0.5), P.z);
      }
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.fluff || slot !== 0 || index === undefined || owner < 0 || owner >= 16) return;
    if (funHeroOf(fx, owner) !== 'marshmallow') return;
    if (TRAIL[owner] >= 0) fx.ribbons.end(TRAIL[owner]);
    TRAIL[owner] = -1;
    if (!fx.projPos?.(index, P)) return;
    P.y = 1.0;
    PROJ[owner] = index;
    TRAIL[owner] = fx.ribbons.point(P, SNOW, 0.34, 0.25);
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !fx.heroPos(e.dst, Q)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    // a snow poof on whoever her snow hits (the Snowball's is the big one)
    if (e.amount >= 30) {
      mesh(fx, 'ring', Q.x, Q.z, 1.2, 0.3, FROST, rim, rel, { p1: 0.7 });
      shower(fx, Q.x, 1.0, Q.z, 10, SHAPE.PUFF, SNOW, 0.45, 0.55, 2.6, 1.2, 2, vary());
      funSound('marshPoof', Q, 1, 0.5);
    } else shower(fx, Q.x, 1.0, Q.z, 3, SHAPE.STAR4, SNOW, 0.2, 0.4, 1.2, 0.8, 1, vary(), true);
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('mm:') || !fx.heroPos(id, P)) return;
    switch (marker) {
      case 'mm:sneeze':
        // ACHOO: the snow on her hat shaken off
        shower(fx, P.x, funOverY(fx, id, -0.1), P.z, 10, SHAPE.PUFF, SNOW, 0.28, 0.6, 2.4, 1.6, 4, vary());
        funSound('marshPoof', P, 1.6, 0.45);
        return;
      case 'mm:flop':
        shower(fx, P.x, 0.3, P.z, 12, SHAPE.PUFF, SNOW, 0.4, 0.7, 2.8, 1.4, 3, vary());
        return;
      case 'mm:pat':
      case 'mm:slide':
        shower(fx, P.x, 0.2, P.z, 6, SHAPE.PUFF, SNOW, 0.35, 0.5, 2.2, 0.8, 2, vary());
        return;
      case 'mm:awoo':
        shower(fx, P.x, funOverY(fx, id, 0), P.z, 6, SHAPE.STAR4, SNOW, 0.25, 0.7, 1.6, 2.0, 1, vary(), true);
        return;
      default:
        return;
    }
  },

  onClip(id, what, fx) {
    if (what !== 'frozen' || !fx.heroPos(id, Q)) return;
    // the ice cube: a translucent block of ice round the frozen cat for the freeze, frost glints, "BRR!"
    const rel = fx.relation(id) === 'enemy' ? 'enemy' : 'ally';
    const rim = fx.rim(id);
    const top = funOverY(fx, id, -0.2);
    mesh(fx, 'pillar', Q.x, Q.z, 0.85, FREEZE_S, ICE, rim, rel, { y: 0, sy: top, p3: 1.4 });
    mesh(fx, 'dome', Q.x, Q.z, 0.85, FREEZE_S, FROST, rim, rel, { y: top, sy: 0.35, p3: 1.4 });
    mesh(fx, 'ring', Q.x, Q.z, 1.1, FREEZE_S, FROST, rim, rel, { p1: 0.6 });
    shower(fx, Q.x, top * 0.6, Q.z, 10, SHAPE.STAR4, 0xffffff, 0.26, 0.9, 1.4, 0.6, 0, vary(), true);
    throwSticker(fx, Q.x + 0.4, top, Q.z, 0.5, 1.2, 0, SHAPE.STAR4, ICE, 0.4, 0.8, 2, 3);
    funPop(fx, id, 'BRR!', Q.x, top + 0.5, Q.z);
    fx.sfx.cue('tingParry', Q, 0.8);
  },

  update(dt, fx) {
    for (let i = 0; i < AREA_N; i++) {
      if (AT[i] <= 0) continue;
      AT[i] -= dt;
      AN[i] -= dt;
      if (AN[i] > 0) continue;
      // slow falling flakes over the patch (more in the blizzard), fewer on Low
      AN[i] = (ABIG[i] ? 0.035 : 0.14) * (fx.tier === 'low' ? 2 : 1);
      const a = vary() * Math.PI * 2;
      const r = Math.sqrt(vary()) * AR[i];
      // the blizzard's flakes are soft opaque puffs: additive stars vanished on the bright grass (QA 2026-11-06)
      sticker(fx, AX[i] + Math.cos(a) * r, ABIG[i] ? 3.2 : 1.8, AZ[i] + Math.sin(a) * r, ABIG[i] ? 'PUFF' : 'STAR4', SNOW, ABIG[i] ? 0.34 : 0.22, ABIG[i] ? 1.6 : 1.1, -1.8, 1.5);
    }
    for (let id = 0; id < 16; id++) {
      if (TRAIL[id] >= 0) {
        if (fx.projPos?.(PROJ[id], P)) {
          fx.ribbons.feed(TRAIL[id], P.x, 1.0, P.z);
          if (vary() < 0.35) sticker(fx, P.x, 1.0, P.z, 'STAR4', SNOW, 0.2, 0.3, -0.5);
        } else {
          fx.ribbons.end(TRAIL[id]);
          TRAIL[id] = -1;
        }
      }
      if (SLIDE[id] > 0) {
        SLIDE[id] -= dt;
        if (fx.heroPos(id, P) && vary() < 0.6) shower(fx, P.x, 0.15, P.z, 2, SHAPE.PUFF, SNOW, 0.3, 0.4, 1.8, 0.9, 2, vary());
        if (SLIDE[id] <= 0 && fx.heroPos(id, P)) mesh(fx, 'dome', P.x, P.z, 1.0, 0.5, FROST, fx.rim(id), fx.relation(id), { sy: 1.4, p3: 1.2 });
      }
    }
  },
};
