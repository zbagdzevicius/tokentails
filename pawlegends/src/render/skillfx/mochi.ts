/**
 * Mochi's skill FX (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.1 "Moves and VFX"): pillows, feathers, a soft
 * bubble and a lullaby.
 *
 * - Q Pillow Toss: the pillow is a `fluff` shot drawn cream by projectileView; feathers puff off the throw and off the
 *   hit, and a feather flies to the friend her Warm Lap shield lands on (the guard ring is drawn on them).
 * - W Cuddle Bubble: a glowing bubble ring on the friend (at the friend nearest her aim) and feathers floating up.
 * - E Purr Wave: soft purr rings out to exactly the sim radius and speed feathers.
 * - R LULLABY (signature): lilac notes drift up through the 0.5 s windup; on the cast a heal ring at the ally radius,
 *   a lilac ring at the drowsy radius, notes and Zzz over every dog in it, "LULLABY"; when the drowsy dogs fall asleep
 *   (the `clip` event 'lullaby' marks the song; sleepers show the stun status) a Zzz pops over each stunned dog.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/mochi.ts): each skill also draws its nature accent and her
 * motif (white feathers, lilac Zzz). Pooled, no allocation per event or per frame. Render only.
 */
import { BuffFlag } from '../../sim/api';
import { type SkillKey } from '../identity';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funOverY, funPop, sticker } from '../fx/fun/funKit';
import { shower, zed } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary } from './dogFx';
import { drawIdentity } from './identityFx';

const FEATHER = 0xfff4ea;
const LILAC = 0xc9a8ff;
const HEAL = 0x9be3a8;
/** Per caster: seconds of the drowsy window still watched for sleepers (render only). */
const SONG = new Float32Array(16);
const ok = (id: number): boolean => id >= 0 && id < 16;

const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'mochi', src, skill, x, y, z, n, dx, dz, nature);

export const SKILL_FX: SkillFxSet = {
  hero: 'mochi',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, P)) return;
    const t = e.ticks * TICK_S;
    for (let k = 0; k < 4; k++) sticker(fx, P.x + (vary() - 0.5) * 0.8, 1.6 + k * 0.2, P.z + (vary() - 0.5) * 0.8, 'NOTE', LILAC, 0.34, t + 0.2, 0.6);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        shower(fx, P.x + F.x * 0.5, 1.0, P.z + F.z * 0.5, 5, SHAPE.FEATHER, FEATHER, 0.22, 0.6, 1.4, 1.0, -2, vary());
        identity(fx, e.src, 'q', P.x + F.x * 0.6, 0.3, P.z + F.z * 0.6, 5, F.x, F.z);
        return;
      case 1: {
        // the bubble goes on the friend nearest the aim point; the render shows it at the aim (the sim picks the friend)
        const x = e.x / 1000;
        const z = -e.y / 1000;
        mesh(fx, 'dome', x, z, 1.1, 1.2, LILAC, rim, rel, { p1: 0.5 });
        shower(fx, x, 0.8, z, 6, SHAPE.FEATHER, FEATHER, 0.22, 1.0, 0.6, 1.4, -1, vary());
        identity(fx, e.src, 'w', x, 0.3, z, 5);
        return;
      }
      case 2: {
        const rad = (fx.abil(e.src, 'e').radius ?? 4000) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.5, FEATHER, rim, rel, { p1: 0.6 });
        mesh(fx, 'ring', P.x, P.z, rad * 0.6, 0.4, LILAC, rim, rel, { p1: 0.6, delay: 0.1 });
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 6);
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        const ally = (a.allyRadius ?? 6500) / 1000;
        const rad = (a.radius ?? 4500) / 1000;
        mesh(fx, 'ring', P.x, P.z, ally, 0.8, HEAL, rim, rel, { p1: 0.7 });
        mesh(fx, 'glow', P.x, P.z, rad, 1.2, LILAC, rim, rel, { p3: 0.5 });
        mesh(fx, 'ring', P.x, P.z, rad, 1.2, LILAC, rim, rel, { p1: 0.9 });
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          sticker(fx, P.x + Math.cos(ang) * rad * 0.8, 1.2, P.z + Math.sin(ang) * rad * 0.8, 'NOTE', LILAC, 0.3, 1.1, 0.5);
        }
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 8);
        funPop(fx, e.src, 'LULLABY', P.x, funOverY(fx, e.src, 0.5), P.z);
        if (ok(e.src)) SONG[e.src] = (fx.abil(e.src, 'r').drowsy ?? 36) * TICK_S + 0.4;
      }
    }
  },

  onHit(e, fx) {
    // Pillow Toss's hit (her only damaging skill): feathers on the dog
    if (e.kind !== 'ability' || !fx.heroPos(e.dst, Q)) return;
    shower(fx, Q.x, 1.1, Q.z, 6, SHAPE.FEATHER, FEATHER, 0.22, 0.7, 1.6, 1.2, -2, vary());
    identity(fx, e.src, 'passive', Q.x, 0.6, Q.z, 3, 0, 0, false);
  },

  onStatus(id, gained, _lost, fx) {
    // the drowsy dogs fall asleep: a Zzz over every hero that gains a stun while one of her songs is on
    if ((gained & BuffFlag.Stunned) === 0) return;
    let singing = false;
    const foe = fx.relation(id) === 'enemy';
    for (let s = 0; s < 16; s++) if (SONG[s] > 0 && (fx.relation(s) === 'enemy') !== foe) singing = true;
    if (!singing || !fx.heroPos(id, Q)) return;
    zed(fx, Q.x, funOverY(fx, id, 0.2), Q.z, 0.4, LILAC, 0.9);
  },

  update(dt) {
    for (let id = 0; id < 16; id++) if (SONG[id] > 0) SONG[id] = Math.max(0, SONG[id] - dt);
  },
};
