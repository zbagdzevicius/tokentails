/**
 * Nugget's skill FX (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.1 "Moves and VFX"): fairy pink and a happy
 * corgi's dust and hearts.
 *
 * - Q Frisbee: a bork, the disc's ribbon riding the frisbee projectile, a spinning paw-print sticker on it, a bonk ring
 *   and stars on each hero it passes through.
 * - W Best Friend: dust on the take-off, a heart pop over him on the landing (clip marker).
 * - E Sploot: a green heal ring at exactly the sim radius for the 45 t sploot with sparkles rising, "SPLOOT!" and a
 *   squeak; the player's own sploot nudges the camera (a punch; reduced motion skips it).
 * - R Herding Time: a whistle on the windup; on the cast a dust ring sweeping round the sim ring (crescents chasing
 *   each other), paw prints pointing in, a ring at the radius and a bork; no ghost corgis.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/nugget.ts): the nature and squeak layers play from
 * render/effects.ts on every cast; this script adds what only it knows: the frisbee's travel whirr, a pink frisbee
 * ring riding the disc, the frisbee-ring shield round Best Friend's landing, orange bone treats bouncing up round the
 * sploot and bone glyphs on Herding Time's bark ring. Q and R no longer bork here (the Frisbee whirr and the ult voice
 * are the champion layer now).
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { playSkillSfx } from '../../audio/skillSfx';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funOverY, funPop, funSound, orbit, sticker, stickerBurst } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, mesh, vary } from './dogFx';
import { MIX_REL } from './identityFx';

const PINK = 0xff9fd6;
const HEAL = 0x7dff8a;
const DUST = 0xf2dcc0;
const DISC = 0xffb3e0;
/** His identity colour pair's primary (data/identity.ts): the bone treats. */
const TREAT = 0xe0782e;

/** A skill phase's nature + champion sound (audio/skillSfx.ts) for a moment only this script sees. */
function skillSound(fx: FxCtx, id: number, skill: 'q' | 'w' | 'e' | 'r', phase: 'impact' | 'travel', at: { x: number; z: number }): void {
  try {
    playSkillSfx('nugget', skill, phase, { at, relation: MIX_REL[fx.relation(id)] ?? 'enemy', src: id });
  } catch {
    /* audio not unlocked yet (tests, before the first gesture) */
  }
}

/** Per-caster frisbee trail: the ribbon slot and the projectile index it follows. */
const TRAIL = new Int16Array(16).fill(-1);
const PROJ = new Int16Array(16).fill(-1);
/** Sploot sparkle clocks by caster (s left, next spark). */
const SPLOOT_T = new Float32Array(16);
const SPLOOT_N = new Float32Array(16);
let now = 0;

export const SKILL_FX: SkillFxSet = {
  hero: 'nugget',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (e.slot !== 3 || !fx.heroPos(e.src, P)) return;
    // the shepherd's whistle and a pink glint round his ring
    funSound('nuggetBork', P, 1.4, 0.35);
    sticker(fx, P.x + 0.3, funOverY(fx, e.src, 0.15), P.z, 'NOTE', PINK, 0.4, 0.6, 0.6);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        // the bork is his ult voice now: the Frisbee's own sound is the disc whirr (audio/champ/nugget.ts)
        mesh(fx, 'glow', P.x, P.z, 0.7, 0.16, DISC, rim, rel, { y: 0.9 });
        sticker(fx, P.x, 1.0, P.z, 'RING', DISC, 0.55, 0.25, 0.5, 9);
        return;
      case 1:
        shower(fx, P.x, 0.2, P.z, 6, SHAPE.PUFF, DUST, 0.35, 0.4, 2.0, 0.6, 2, vary());
        return;
      case 2: {
        // a fountain of bone treats tossed up out of the sploot
        stickerBurst(fx, P.x, 0.5, P.z, 'BONE', TREAT, 0.3, 0.7, 5, 1.6, 3, -8, vary());
        const a = fx.abil(e.src, 'e');
        const rad = (a.radius ?? 3500) / 1000;
        const life = (a.duration ?? 45) * TICK_S;
        mesh(fx, 'ring', P.x, P.z, rad, life, HEAL, rim, rel, { p1: 0.85 });
        mesh(fx, 'glow', P.x, P.z, rad * 0.8, life, HEAL, rim, rel, { p3: 0.5 });
        if (e.src >= 0 && e.src < 16) {
          SPLOOT_T[e.src] = life;
          SPLOOT_N[e.src] = 0;
        }
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        const rad = (a.radius ?? 4500) / 1000;
        // the herd point: the aim clamped onto his ring (the sim clamps the same way)
        let hx = P.x;
        let hz = P.z;
        if (aimDir(e.x, e.y)) {
          const d = Math.min(rad, Math.hypot(e.x / 1000 - P.x, -e.y / 1000 - P.z));
          hx = P.x + F.x * d;
          hz = P.z + F.z * d;
        }
        mesh(fx, 'ring', hx, hz, rad, 0.7, PINK, rim, rel, { p1: 0.8 });
        // a dust ring sweeping round: four crescents chasing each other round the circle
        for (let i = 0; i < 4; i++) mesh(fx, 'crescent', hx, hz, rad * 0.95, 0.45, DUST, rim, rel, { yaw: (i * Math.PI) / 2, p0: Math.PI * 0.6, p1: 0.75, p2: 1, delay: i * 0.06 });
        // paw prints round the ring, all pointing in at the herd point
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          sticker(fx, hx + Math.cos(ang) * rad * 0.75, 0.25, hz + Math.sin(ang) * rad * 0.75, 'PAW', PINK, 0.45, 0.8, 0, 0, ang + Math.PI / 2);
        }
        // bone glyphs riding the bark ring, between the paw prints
        for (let i = 0; i < 4; i++) {
          const ang = ((i + 0.5) / 4) * Math.PI * 2;
          sticker(fx, hx + Math.cos(ang) * rad * 0.9, 0.5, hz + Math.sin(ang) * rad * 0.9, 'BONE', TREAT, 0.45, 0.7, 0.6, 0, ang);
        }
        shower(fx, hx, 0.3, hz, 10, SHAPE.PUFF, DUST, 0.5, 0.6, 3.5, 0.8, 1.5, vary());
        // the bork is the ult voice (render/effects.ts plays it with the sonic cast layer)
        funPop(fx, e.src, 'HERDING TIME!', P.x, funOverY(fx, e.src, 0.5), P.z);
        fx.cam.tier(2);
      }
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.frisbee || slot !== 0 || index === undefined || owner < 0 || owner >= 16) return;
    if (TRAIL[owner] >= 0) fx.ribbons.end(TRAIL[owner]);
    TRAIL[owner] = -1;
    PROJ[owner] = -1;
    if (!fx.projPos?.(index, P)) return;
    P.y = 0.95;
    PROJ[owner] = index;
    TRAIL[owner] = fx.ribbons.point(P, DISC, 0.3, 0.22);
    // the projectile nature's travel whirr under the disc
    skillSound(fx, owner, 'q', 'travel', P);
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !fx.heroPos(e.dst, Q)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    // a Frisbee bonk: a small ring and stars (the only hit his kit deals that is not Herding Time's)
    mesh(fx, 'ring', Q.x, Q.z, 0.9, 0.25, DISC, rim, rel, { p1: 0.7 });
    orbit(fx, Q.x, funOverY(fx, e.dst, 0.05), Q.z, 'STAR', 0xffe9a8, 3, 0.35, 0.22, 0.6, vary() * 6.28);
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('ng:') || !fx.heroPos(id, P)) return;
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    switch (marker) {
      case 'ng:hearts':
        sticker(fx, P.x, funOverY(fx, id, 0.25), P.z, 'HEART', 0xff6f91, 0.6, 0.8, 0.8);
        shower(fx, P.x, 1.2, P.z, 5, SHAPE.HEART, 0xff8fb1, 0.24, 0.7, 1.2, 1.6, -0.5, vary());
        mesh(fx, 'heart', P.x, P.z, 1.2, 0.5, 0xff8fb1, rim, rel);
        // the frisbee-ring shield: three pink discs circling him
        orbit(fx, P.x, 0.9, P.z, 'RING', DISC, 3, 0.75, 0.32, 0.8, vary() * 6.28);
        return;
      case 'ng:sploot':
        funSound('nuggetSqueak', P, 1, 0.5);
        funPop(fx, id, 'SPLOOT!', P.x, funOverY(fx, id, 0.2), P.z);
        shower(fx, P.x, 0.2, P.z, 8, SHAPE.PUFF, DUST, 0.4, 0.5, 2.6, 0.5, 2, vary());
        stickerBurst(fx, P.x, 0.4, P.z, 'BONE', TREAT, 0.28, 0.6, 3, 1.4, 2.4, -8, vary());
        if (rel === 'own' && !fx.reduced) fx.cam.punch(0.05);
        return;
      case 'ng:whistle':
        return;
      case 'ng:wiggle':
        shower(fx, P.x, 0.9, P.z, 6, SHAPE.HEART, 0xff8fb1, 0.22, 0.8, 1.0, 1.4, -0.4, vary());
        funSound('nuggetSqueak', P, 1.2, 0.4);
        return;
      default:
        return;
    }
  },

  update(dt, fx) {
    now += dt;
    for (let id = 0; id < 16; id++) {
      if (TRAIL[id] >= 0) {
        if (fx.projPos?.(PROJ[id], P)) {
          fx.ribbons.feed(TRAIL[id], P.x, 0.95, P.z);
          // the spinning disc's paw print riding the frisbee
          const f = (now * 30) | 0;
          if (f % 3 === 0) sticker(fx, P.x, 0.95, P.z, 'PAW', 0xffffff, 0.32, 0.06, 0, 0, now * 14);
          else if (f % 3 === 1) sticker(fx, P.x, 0.95, P.z, 'RING', DISC, 0.5, 0.06);
        } else {
          fx.ribbons.end(TRAIL[id]);
          TRAIL[id] = -1;
          PROJ[id] = -1;
        }
      }
      if (SPLOOT_T[id] > 0) {
        SPLOOT_T[id] -= dt;
        SPLOOT_N[id] -= dt;
        if (SPLOOT_N[id] <= 0 && fx.heroPos(id, P)) {
          SPLOOT_N[id] = 0.18;
          const a = vary() * Math.PI * 2;
          const r = 0.6 + vary() * 2.4;
          // heal pluses, every third a bone treat hopping up
          if (vary() < 0.33) sticker(fx, P.x + Math.cos(a) * r, 0.3, P.z + Math.sin(a) * r, 'BONE', TREAT, 0.3, 0.6, 1.6, 0, a);
          else sticker(fx, P.x + Math.cos(a) * r, 0.3, P.z + Math.sin(a) * r, 'PLUS', HEAL, 0.3, 0.6, 1.2);
        }
      }
    }
  },
};
