/**
 * Bravo's skill FX (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.3 "Moves and VFX"): stage light, velvet and
 * tears. Silver and warm white only (never gold: gold means "you").
 *
 * - Q Crocodile Tears: the sob (a falling whimper, tear drops off his face), the big blue tear's ribbon riding the
 *   `fluff` projectile (drawn blue by projectileView), a splash where it lands.
 * - W Center Stage: a spotlight cone from above (a tall warm pillar) over the sim radius for the 90 t state, a ring of
 *   stage boards, "TA-DA!".
 * - E Stage Dive: the landing's crowd "wooo" puff (confetti and a ring at the sim radius).
 * - R ENCORE!: spotlights sweeping in round the sim ring, a fanfare and "ENCORE!" on the bow.
 * - The flop (signature, the `clip` event 'flop'): a gasp, dizzy stars over him while he plays dead, and "…bravo?"
 *   as he pops back up (every viewer sees it: the event goes to both teams).
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_S } from '../anim/timing';
import type { SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, funSound, orbit, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { P, Q, mesh, vary } from './dogFx';

const LIGHT = 0xfff4dc;
const VELVET = 0xb07cff;
const TEAR = 0x8fd8ff;
const BOARDS = 0xb08a55;
const CONFETTI = 0xd8b8ff;

const TRAIL = new Int16Array(16).fill(-1);
const PROJ = new Int16Array(16).fill(-1);
/** Seconds left of dizzy stars over a flopped Bravo, and the next orbit. */
const DIZZY = new Float32Array(16);
const DIZZY_N = new Float32Array(16);

export const SKILL_FX: SkillFxSet = {
  hero: 'bravo',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: true },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, P)) return;
    // the house lights dim to a ring of footlights round him
    const rad = (fx.abil(e.src, 'r').radius ?? 4500) / 1000;
    mesh(fx, 'ring', P.x, P.z, rad, e.ticks * TICK_S + 0.2, LIGHT, fx.rim(e.src), fx.relation(e.src), { p1: 0.92 });
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        return;
      case 1: {
        const a = fx.abil(e.src, 'w');
        const rad = (a.radius ?? 3000) / 1000;
        const life = (a.duration ?? 90) * TICK_S;
        // the spotlight: a tall warm cone of light from above, the boards of the stage round it
        mesh(fx, 'pillar', P.x, P.z, rad * 0.45, life, LIGHT, rim, rel, { y: 0, sy: 6, p3: 0.3 });
        mesh(fx, 'glow', P.x, P.z, rad, life, LIGHT, rim, rel, { p3: 0.5 });
        mesh(fx, 'ring', P.x, P.z, rad, life, BOARDS, rim, rel, { p1: 0.82 });
        funSound('bravoBow', P, 1.3, 0.35);
        return;
      }
      case 2:
        return;
      default: {
        const a = fx.abil(e.src, 'r');
        const rad = (a.radius ?? 4500) / 1000;
        // spotlights sweeping in from round the ring to him
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + 0.4;
          mesh(fx, 'pillar', P.x + Math.cos(ang) * rad * 0.8, P.z + Math.sin(ang) * rad * 0.8, 0.9, 0.4, LIGHT, rim, rel, { y: 0, sy: 5, p3: 0.6, delay: i * 0.05 });
        }
        mesh(fx, 'pillar', P.x, P.z, 1.3, 0.9, LIGHT, rim, rel, { y: 0, sy: 6, p3: 0.8, delay: 0.25 });
        mesh(fx, 'ring', P.x, P.z, rad, 0.6, VELVET, rim, rel, { p1: 0.8 });
        shower(fx, P.x, 2.0, P.z, 14, SHAPE.CONFETTI, CONFETTI, 0.24, 1.0, 3.2, 3.0, 6, vary());
        funSound('bravoBow', P, 1, 0.6);
        funPop(fx, e.src, 'ENCORE!', P.x, funOverY(fx, e.src, 0.5), P.z);
        fx.cam.tier(2);
      }
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.fluff || slot !== 0 || index === undefined || owner < 0 || owner >= 16) return;
    if (funHeroOf(fx, owner) !== 'bravo') return;
    if (TRAIL[owner] >= 0) fx.ribbons.end(TRAIL[owner]);
    TRAIL[owner] = -1;
    if (!fx.projPos?.(index, P)) return;
    P.y = 1.15;
    PROJ[owner] = index;
    TRAIL[owner] = fx.ribbons.point(P, TEAR, 0.22, 0.2);
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !fx.heroPos(e.dst, Q)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    // a tear splash (Q) or the crowd's "wooo" (E, R): blue droplets or velvet confetti
    if (TRAIL[e.src & 15] >= 0 || vary() < 0.5) {
      mesh(fx, 'ring', Q.x, Q.z, 1.0, 0.3, TEAR, rim, rel, { p1: 0.7 });
      shower(fx, Q.x, 1.1, Q.z, 8, SHAPE.DROPLET, TEAR, 0.2, 0.6, 2.2, 1.8, 6, vary());
    } else shower(fx, Q.x, 1.0, Q.z, 4, SHAPE.CONFETTI, CONFETTI, 0.2, 0.6, 1.8, 1.6, 6, vary());
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('bv:') || !fx.heroPos(id, P)) return;
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    const head = funOverY(fx, id, -0.35);
    switch (marker) {
      case 'bv:sob':
        funSound('bravoSob', P, 1, 0.5);
        shower(fx, P.x, head, P.z, 6, SHAPE.DROPLET, TEAR, 0.16, 0.7, 1.4, 1.2, 6, vary());
        return;
      case 'bv:tada':
        shower(fx, P.x, head + 0.4, P.z, 10, SHAPE.STAR4, LIGHT, 0.26, 0.7, 2.2, 2.0, 1, vary(), true);
        funPop(fx, id, 'TA-DA!', P.x, funOverY(fx, id, 0.5), P.z);
        return;
      case 'bv:dive': {
        const rad = (fx.abil(id, 'e').radius ?? 2200) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.4, VELVET, rim, rel, { p1: 0.75 });
        shower(fx, P.x, 1.4, P.z, 12, SHAPE.CONFETTI, CONFETTI, 0.22, 0.9, 3.0, 2.6, 6, vary());
        funPop(fx, id, 'WOOO!', P.x, funOverY(fx, id, 0.5), P.z);
        fx.sfx.cue('pop', P, 0.6);
        return;
      }
      case 'bv:bow':
        shower(fx, P.x, head + 0.3, P.z, 8, SHAPE.CONFETTI, CONFETTI, 0.2, 0.9, 2.0, 2.2, 6, vary());
        funSound('bravoBow', P, 1.15, 0.4);
        return;
      case 'bv:gasp':
        funSound('bravoGasp', P, 1, 0.55);
        sticker(fx, P.x + 0.35, head + 0.4, P.z, 'EXCLAIM', 0xffffff, 0.5, 0.6, 0.4, 0, 0.15);
        if (id >= 0 && id < 16) {
          DIZZY[id] = 0.85;
          DIZZY_N[id] = 0.25;
        }
        return;
      case 'bv:thud':
        shower(fx, P.x, 0.2, P.z, 8, SHAPE.PUFF, 0xf2e6d8, 0.4, 0.5, 2.4, 0.6, 2, vary());
        return;
      case 'bv:bravo':
        // the curtain call nobody asked for
        funPop(fx, id, '…bravo?', P.x, funOverY(fx, id, 0.45), P.z);
        funSound('bravoBow', P, 1.4, 0.3);
        return;
      case 'bv:sigh':
        sticker(fx, P.x - 0.3, head + 0.3, P.z, 'SWEAT', TEAR, 0.3, 0.8, -0.4);
        return;
      default:
        return;
    }
  },

  onClip(id, what, fx) {
    if (what !== 'flop' || funHeroOf(fx, id) !== 'bravo' || !fx.heroPos(id, P)) return;
    // the flop itself: a soft stage light flashes on the body (the clip's markers carry the gasp, thud and "…bravo?")
    mesh(fx, 'glow', P.x, P.z, 1.6, 0.4, LIGHT, fx.rim(id), fx.relation(id), { p3: 0.7 });
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      if (TRAIL[id] >= 0) {
        if (fx.projPos?.(PROJ[id], P)) fx.ribbons.feed(TRAIL[id], P.x, 1.15, P.z);
        else {
          fx.ribbons.end(TRAIL[id]);
          TRAIL[id] = -1;
        }
      }
      if (DIZZY[id] > 0) {
        DIZZY[id] -= dt;
        DIZZY_N[id] -= dt;
        if (DIZZY_N[id] <= 0 && fx.heroPos(id, P)) {
          DIZZY_N[id] = 0.3;
          orbit(fx, P.x, 1.0, P.z, 'STAR', 0xfff1c8, 3, 0.45, 0.24, 0.32, DIZZY[id] * 9);
        }
      }
    }
  },
};
