/**
 * Howler's skill FX (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.5 "Moves and VFX"): mint wind and sound.
 *
 * - Q AWOO: visible sound-wave arcs rolling out over the sim cone (its arc and range), music notes, the howl.
 * - W Derp Dash: speed lines and a snow spray.
 * - E Talk Back: a speech bubble of cartoon symbols ("!", anger marks, a note) over him for the 30 t state and the
 *   "woo-woo-wooo" grumble.
 * - R THE SCREAM (signature): the inhale (puffs sucked in toward him, a gasp) on the windup; on the cast a cone
 *   shockwave over the sim arc and range (crescents rolling out one behind the other), distortion rings, a ground
 *   shockwave, the scream, and "AAAAA!".
 *
 * Champion identity (audio/champ/howler.ts): his trait is echo rings and "AWOO" letters in slate blue. The cast
 * voices (the AWOO howl, the grumble, the scream) are played by the identity layer on the cast, not here; this script
 * adds slate echo rings to every skill (sucked in on the inhale, trailing the dash, popping on whoever he hits) and the
 * "AWOO!" word on Q.
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { TICK_S } from '../anim/timing';
import type { SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funOverY, funPop, funSound, speedLines, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, arcRad, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';

const MINT = 0xb6f0c8;
const WAVE = 0xe8fff4;
const SNOW = 0xf6fbff;
/** Champion motif colour (IDENTITY.howler.colors.primary): the slate echo rings. */
const ECHO = 0x6e7fa8;

/** Talk Back bubbles: seconds left and the next bubble, per caster. */
const ARGUE_T = new Float32Array(16);
const ARGUE_N = new Float32Array(16);
const SHOCK = { x: 0, y: 0, z: 0 };
const SHOCK_O = { r1: 6, dur: 0.45, color: '#E8FFF4', height: 0.5 };

/** A cone of `n` sound-wave arcs rolling out from P along F to `range` m, `arc` rad wide. */
function cone(fx: Parameters<NonNullable<SkillFxSet['onCast']>>[1], range: number, arc: number, n: number, color: number, rim: number, rel: 'own' | 'ally' | 'enemy', life: number): void {
  const yaw = yawOf(F.x, F.z);
  for (let i = 0; i < n; i++) {
    const r = (range * (i + 1)) / n;
    mesh(fx, 'crescent', P.x, P.z, r, life, color, rim, rel, { yaw, p0: arc, p1: 0.86, delay: i * 0.05, y: 0.1 });
  }
}

export const SKILL_FX: SkillFxSet = {
  hero: 'howler',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, P)) return;
    // THE INHALE: puffs sucked in toward him, a gasp, the cone faintly marked on the ground
    funSound('gasp', P, 0.7, 0.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // puffs and slate echo rings alternate: the echoes of his last howl, drawn back in
      if (i & 1) sticker(fx, P.x + Math.cos(a) * 1.6, 1.2, P.z + Math.sin(a) * 1.6, 'RING', ECHO, 0.45, e.ticks * TICK_S * 0.8, 0.2);
      else sticker(fx, P.x + Math.cos(a) * 1.6, 1.2, P.z + Math.sin(a) * 1.6, 'PUFF', WAVE, 0.3, e.ticks * TICK_S * 0.8, 0.2);
    }
    if (aimDir(e.x, e.y)) {
      const a = fx.abil(e.src, 'r');
      mesh(fx, 'crescent', P.x, P.z, (a.range ?? 6000) / 1000, e.ticks * TICK_S, MINT, fx.rim(e.src), fx.relation(e.src), { yaw: yawOf(F.x, F.z), p0: arcRad(a.arc), p1: 0.0, p3: 0.35 });
    }
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
    switch (e.slot) {
      case 0: {
        const a = fx.abil(e.src, 'q');
        cone(fx, (a.range ?? 4000) / 1000, arcRad(a.arc), 4, WAVE, rim, rel, 0.35);
        // the howl itself (howlerAwoo over the sonic blast) is the identity cast sound; the word floats over him
        sticker(fx, P.x + 0.3, funOverY(fx, e.src, 0.2), P.z, 'NOTE', MINT, 0.45, 0.9, 0.8, 0, 0.2);
        funPop(fx, e.src, 'AWOO!', P.x, funOverY(fx, e.src, 0.5), P.z);
        return;
      }
      case 1:
        speedLines(fx, P.x, 0.6, P.z, F.x, F.z, 8, WAVE, 0.9, 8);
        shower(fx, P.x, 0.2, P.z, 8, SHAPE.PUFF, SNOW, 0.35, 0.5, 2.6, 0.9, 2, vary());
        // his derp face echoes behind him: three slate echo rings left on the start of the path, fading in turn
        for (let i = 0; i < 3; i++) sticker(fx, P.x - F.x * i * 0.6, 1.1, P.z - F.z * i * 0.6, 'RING', ECHO, 0.7 - i * 0.12, 0.45 + i * 0.1);
        return;
      case 2:
        if (e.src >= 0 && e.src < 16) {
          ARGUE_T[e.src] = (fx.abil(e.src, 'e').duration ?? 30) * TICK_S;
          ARGUE_N[e.src] = 0;
        }
        mesh(fx, 'ring', P.x, P.z, 1.4, 0.3, MINT, rim, rel, { p1: 0.7 });
        // the grumble (howlerArgue over the guard shimmer) is the identity cast sound
        return;
      default: {
        const a = fx.abil(e.src, 'r');
        const range = (a.range ?? 6000) / 1000;
        cone(fx, range, arcRad(a.arc), 6, WAVE, rim, rel, 0.45);
        // distortion rings round his mouth and a ground shockwave along the cone
        for (let i = 0; i < 3; i++) mesh(fx, 'ring', P.x + F.x * 0.8, P.z + F.z * 0.8, 0.8 + i * 0.7, 0.3, MINT, rim, rel, { p1: 0.85, delay: i * 0.06, y: 1.0 });
        SHOCK.x = P.x + F.x * range * 0.35;
        SHOCK.z = P.z + F.z * range * 0.35;
        SHOCK_O.r1 = range * 0.7;
        fx.shock.start(SHOCK, SHOCK_O);
        speedLines(fx, P.x + F.x * 0.8, 1.0, P.z + F.z * 0.8, -F.x, -F.z, 10, WAVE, 1.6, 12);
        // the scream is the ult voice (IDENTITY.howler.voice.ult reuses howlerScream), played on the cast by the
        // identity layer: playing it here too doubled it
        funPop(fx, e.src, 'AAAAAA!', P.x, funOverY(fx, e.src, 0.5), P.z);
      }
    }
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !fx.heroPos(e.dst, P)) return;
    // the wind of it: a few streaks blowing past whoever he hits
    shower(fx, P.x, 1.0, P.z, 4, SHAPE.SOFT, WAVE, 0.2, 0.3, 2.4, 0.4, 0, vary(), true);
    // and an echo ring pops on them (his motif: you were hit by the husky)
    sticker(fx, P.x, 1.2, P.z, 'RING', ECHO, 0.8, 0.35);
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('hw:') || !fx.heroPos(id, P)) return;
    switch (marker) {
      case 'hw:argue':
        funSound('howlerArgue', P, 1.1, 0.4);
        return;
      case 'hw:woo':
        funSound('howlerAwoo', P, 1.4, 0.4);
        funPop(fx, id, 'WOO!', P.x, funOverY(fx, id, 0.4), P.z);
        return;
      case 'hw:derp':
        funPop(fx, id, 'DERP!', P.x, funOverY(fx, id, 0.4), P.z);
        return;
      default:
        return;
    }
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      if (ARGUE_T[id] <= 0) continue;
      ARGUE_T[id] -= dt;
      ARGUE_N[id] -= dt;
      if (ARGUE_N[id] > 0 || !fx.heroPos(id, P)) continue;
      ARGUE_N[id] = 0.25;
      // the speech bubble of cartoon symbols ("!?#!"), cycling
      const y = funOverY(fx, id, 0.25);
      const k = ((ARGUE_T[id] * 4) | 0) % 3;
      sticker(fx, P.x - 0.3, y, P.z, 'SOFT', 0xffffff, 0.9, 0.27);
      if (k === 0) sticker(fx, P.x - 0.3, y, P.z, 'EXCLAIM', 0x2a2a3a, 0.4, 0.27);
      else if (k === 1) sticker(fx, P.x - 0.3, y, P.z, 'ANGER', 0xff3b30, 0.4, 0.27);
      else sticker(fx, P.x - 0.3, y, P.z, 'NOTE', 0x2a2a3a, 0.36, 0.27);
    }
  },
};
