/**
 * Chili's skill FX (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.4 "Moves and VFX"): hot-sauce red, white
 * sound waves and anger marks.
 *
 * - Basics: a small white "yap" wave in front of him (each yap's pitch from a render-side hash, never the sim RNG);
 *   the Rage pips: red anger marks over his head, one per Rage (MoveCtx.resource, his own team only); in BIG DOG
 *   ENERGY a bark shockwave and a ring at exactly the sim splash radius round the target.
 * - Q Yap Yap Yap: big white sound-wave crescents riding each yap projectile, sized to read on a phone.
 * - W Tiny Zoomies: speed lines and a dust trail.
 * - E Purse Mode (signature): a pink handbag (a rounded shell) zipped round him for the 30 t state; "!" when it
 *   unzips, and a slow ring at the sim radius.
 * - R BIG DOG ENERGY (signature): "BIG DOG ENERGY!", a burst of anger marks, a growl.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/chili.ts): every skill also draws its nature accent (Q sonic
 * ripples, W mobility dust, E guard shards, R empower pillar) and his chili-pepper motif in pepper orange and stem green:
 * peppers off each yap, pepper afterimages on Zoomies, peppers puffing out of the purse, a pepper burst as he grows and
 * a pepper crown at 5 Rage. Sounds: the framework plays the nature layer and his yip motif (audio/skillSfx.ts); the
 * purse clasp is his E cast override, so this script no longer cues a generic pop, and basics leave the yap to the
 * thinned basic voice.
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { type SkillKey } from '../identity';
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funOverY, funPop, funSound, speedLines, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, faceOf, mesh, vary, yawOf } from './dogFx';
import { drawIdentity } from './identityFx';

const HOT = 0xff5a3c;
const WAVE = 0xfff6e8;
const BAG = 0xff8fc8;
const ANGER = 0xff3b30;
/** Rage cap (data: passive.max); the snapshot's resource is 0..255 of it. */
const RAGE_MAX = 5;

/** Live yaps: projectile index and its last position (for the wave direction), per slot. */
const YAP_N = 12;
const YIDX = new Int16Array(YAP_N).fill(-1);
const YX = new Float32Array(YAP_N);
const YZ = new Float32Array(YAP_N);
const YNEXT = new Float32Array(YAP_N);
const YREL = new Uint8Array(YAP_N);
const YRIM = new Float64Array(YAP_N);
const REL3 = ['own', 'ally', 'enemy'] as const;
/** Purse clocks by caster. */
const BAG_T = new Float32Array(16);
/** Yap crescents laid per slot (every other one carries a pepper). */
const YODD = new Uint8Array(YAP_N);

// ------------------------------------------------------------------------------------------------ champion identity

/** Champion identity (render/skillfx/identityFx.ts drawIdentity): the skill's nature accent and Chili's motif. */
const identity = (fx: FxCtx, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'chili', null, skill, x, y, z, n, dx, dz, nature);

export const SKILL_FX: SkillFxSet = {
  hero: 'chili',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: false },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        // Yap Yap Yap: the sonic ripple and a first pepper off his mouth (each yap adds its own in update)
        faceOf(fx, e.src);
        identity(fx, 'q', P.x + F.x * 0.5, 0.4, P.z + F.z * 0.5, 3, F.x, F.z);
        return;
      case 1:
        faceOf(fx, e.src);
        speedLines(fx, P.x, 0.5, P.z, F.x, F.z, 8, WAVE, 0.8, 8);
        shower(fx, P.x, 0.2, P.z, 6, SHAPE.PUFF, 0xf2dcc0, 0.3, 0.45, 2.2, 0.6, 2, vary());
        // Tiny Zoomies: pepper afterimages left behind along the run
        identity(fx, 'w', P.x, 0.1, P.z, 6, F.x, F.z);
        return;
      case 2: {
        const life = (fx.abil(e.src, 'e').duration ?? 30) * TICK_S;
        // the handbag zipped shut round him: a rounded pink shell, a darker flap band, a glint
        mesh(fx, 'dome', P.x, P.z, 0.75, life, BAG, rim, rel, { sy: 1.05, p3: 1.6 });
        mesh(fx, 'ring', P.x, P.z, 0.78, life, 0xd9559a, rim, rel, { y: 0.45, p1: 0.8 });
        sticker(fx, P.x + 0.3, 1.0, P.z, 'STAR4', 0xffffff, 0.3, 0.4);
        if (e.src >= 0 && e.src < 16) BAG_T[e.src] = life;
        // Purse Mode: guard shards and a pepper peeking out of the bag (the clasp snap is the champion E cast sound)
        identity(fx, 'e', P.x, 0.5, P.z, 3);
        return;
      }
      default:
        // BIG DOG ENERGY: the empower pillar and a first pepper burst (the big one comes with the grow, ch:grow)
        identity(fx, 'r', P.x, 0.3, P.z, 5);
        return;
    }
  },

  onProjectile(owner, kind, _slot, fx, index) {
    if (kind !== PROJECTILE_KIND.yap || index === undefined || !fx.projPos?.(index, P)) return;
    let k = 0;
    for (let i = 0; i < YAP_N; i++) if (YIDX[i] < 0) {
      k = i;
      break;
    }
    YIDX[k] = index;
    YX[k] = P.x;
    YZ[k] = P.z;
    YNEXT[k] = 0;
    YREL[k] = REL3.indexOf(fx.relation(owner));
    YRIM[k] = fx.rim(owner);
    YODD[k] = 0;
    // each yap's own pitch: a render-side hash (never the sim RNG)
    funSound('chiliYap', P, 0.9 + vary() * 0.35, 0.45);
  },

  onHit(e, fx, ctx) {
    if (!fx.heroPos(e.dst, Q)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.kind === 'basic') {
      if (ctx.form === true) {
        // BIG DOG: a bark shockwave and the splash ring at the sim radius
        const splash = (fx.abil(e.src, 'r').splash ?? 1600) / 1000;
        mesh(fx, 'ring', Q.x, Q.z, splash, 0.3, HOT, rim, rel, { p1: 0.6 });
        mesh(fx, 'crescent', Q.x, Q.z, splash * 0.8, 0.25, WAVE, rim, rel, { p1: 0.7 });
      } else mesh(fx, 'glow', Q.x, Q.z, 0.5, 0.14, WAVE, rim, rel, { y: 0.8 });
      // the Rage pips over his head (his own team sees the resource)
      const rage = Math.round((ctx.resource * RAGE_MAX) / 255);
      if (rage > 0 && fx.heroPos(e.src, P)) {
        const y = funOverY(fx, e.src, 0.15);
        for (let i = 0; i < rage; i++) sticker(fx, P.x + (i - (rage - 1) / 2) * 0.28, y, P.z, 'ANGER', ANGER, 0.26, 0.7, 0.3);
        if (rage >= RAGE_MAX) {
          funSound('chiliGrowl', P, 1, 0.3);
          // Small Dog Syndrome full: the pepper crown over his head
          identity(fx, 'passive', P.x, y - 0.55, P.z, 9, 0, 0, false);
        }
      }
      return;
    }
    mesh(fx, 'glow', Q.x, Q.z, 0.6, 0.16, WAVE, rim, rel, { y: 0.9 });
  },

  onMarker(id, clip, marker, fx) {
    if (!marker.startsWith('ch:') || !fx.heroPos(id, P)) return;
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    faceOf(fx, id);
    switch (marker) {
      case 'ch:yap':
        mesh(fx, 'crescent', P.x + F.x * 0.6, P.z + F.z * 0.6, 0.55, 0.18, WAVE, rim, rel, { yaw: yawOf(F.x, F.z), p0: 1.4, p1: 0.75, y: 0.9 });
        // basics: the yap is the (thinned) basic voice on the hit (audio/skillSfx.ts); the emote keeps its own
        if (!clip.startsWith('chili.basic')) funSound('chiliYap', P, 0.95 + vary() * 0.3, 0.4);
        return;
      case 'ch:yip':
        funSound('chiliYap', P, 1.5, 0.4);
        sticker(fx, P.x + 0.2, funOverY(fx, id, 0.1), P.z, 'NOTE', WAVE, 0.3, 0.6, 0.6);
        return;
      case 'ch:bark':
        mesh(fx, 'crescent', P.x + F.x * 0.9, P.z + F.z * 0.9, 1.1, 0.24, WAVE, rim, rel, { yaw: yawOf(F.x, F.z), p0: 1.6, p1: 0.65, y: 1.2 });
        funSound('chiliBigBark', P, 0.9 + vary() * 0.15, 0.6);
        return;
      case 'ch:zoom':
        return;
      case 'ch:pop': {
        // the bag unzips: "!" and the slow ring at the sim radius
        const rad = (fx.abil(id, 'e').radius ?? 2200) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.5, BAG, rim, rel, { p1: 0.75 });
        sticker(fx, P.x + 0.25, funOverY(fx, id, 0.2), P.z, 'EXCLAIM', 0xffe066, 0.55, 0.8, 0.5, 0, 0.15);
        shower(fx, P.x, 0.9, P.z, 6, SHAPE.HEART, BAG, 0.2, 0.6, 1.8, 1.6, 2, vary());
        // peppers puff out of the bag as it opens
        identity(fx, 'e', P.x, 0.4, P.z, 6, 0, 0, false);
        if (id >= 0 && id < 16) BAG_T[id] = 0;
        return;
      }
      case 'ch:grow':
        // over his GROWN head and clear of the overhead plate (QA: at +0.8 m it read "BIG DOG YOU NERGY" over "You")
        funPop(fx, id, 'BIG DOG ENERGY!', P.x, funOverY(fx, id, 0) * 1.35 + 1.3, P.z);
        shower(fx, P.x, funOverY(fx, id, 0), P.z, 8, SHAPE.PLUS, ANGER, 0.28, 0.8, 2.4, 2.0, 2, vary());
        mesh(fx, 'ring', P.x, P.z, 2.0, 0.4, HOT, rim, rel, { p1: 0.7 });
        // he grows in a burst of peppers and an anger "!"
        identity(fx, 'r', P.x, funOverY(fx, id, 0) * 0.6, P.z, 11, 0, 0, false);
        funSound('chiliGrowl', P, 0.8, 0.6);
        return;
      case 'ch:shrink':
        shower(fx, P.x, 0.8, P.z, 6, SHAPE.PUFF, 0xf2dcc0, 0.3, 0.45, 1.6, 1.0, 2, vary());
        funSound('chiliYap', P, 1.6, 0.3);
        return;
      default:
        return;
    }
  },

  update(dt, fx) {
    for (let k = 0; k < YAP_N; k++) {
      if (YIDX[k] < 0) continue;
      if (!fx.projPos?.(YIDX[k], P)) {
        YIDX[k] = -1;
        continue;
      }
      YNEXT[k] -= dt;
      const dx = P.x - YX[k];
      const dz = P.z - YZ[k];
      const l = Math.hypot(dx, dz);
      if (YNEXT[k] <= 0 && l > 0.05) {
        YNEXT[k] = 0.07;
        // a big white sound-wave crescent facing the way the yap flies
        mesh(fx, 'crescent', P.x, P.z, 0.9, 0.16, WAVE, YRIM[k], REL3[YREL[k]], { yaw: yawOf(dx / l, dz / l), p0: 1.5, p1: 0.72, y: 1.0 });
        // every other crescent carries a little pepper: the pepper-shaped sound bubble
        if ((YODD[k] ^= 1) === 1) identity(fx, 'q', P.x, 0.4, P.z, 2, dx / l, dz / l, false);
      }
      YX[k] = P.x;
      YZ[k] = P.z;
    }
    for (let id = 0; id < 16; id++) if (BAG_T[id] > 0) BAG_T[id] -= dt;
  },
};
