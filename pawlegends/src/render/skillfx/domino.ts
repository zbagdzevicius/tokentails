/**
 * Domino's skill FX (sim v15; build spec docs/plans/moba/DOGS-V15.md §1.3 "Moves and VFX"): black spots, ink and
 * starry lines.
 *
 * - Passive Spot On: on each of his ability hits on a hero a black spot flies off his coat onto the cat (the Spot
 *   pips over the cat's plate are overhead.ts, from `EntitySnap.dots`, both teams).
 * - Q Spot Shot: a spinning black disc (`fluff` kind, drawn black by projectileView, his STELLAR trail), the boop.
 * - W Splatter: a dotted ring telegraph at exactly the sim radius over the 12 t windup; on the cast an ink splash, a
 *   ring of black spots round the edge and a soft ink puddle that fades in 1 s, the splat.
 * - E Big Shake: droplets flying out in a ring at exactly the sim radius, the brr-rattle.
 * - R CONNECT THE DOTS! (signature): a pencil scratch over the windup; on the cast the dot-to-dot: a dotted pencil
 *   line drawn from Domino to each hero he hit on the cast tick, nearest first (0.1 s a link), lit as a starry lilac
 *   beam, a star burst and a ring (the root) on each target, the spots flying home to his coat, "CONNECT THE DOTS!".
 *   Render-only: the path follows the drawn positions at the cast tick, never sim state.
 * - The emote: every spot flies off and circles him, then drops back on.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/domino.ts): every skill also draws its nature accent (Q
 * projectile sparkle, W splash droplets, E impact dust ring, R arcane twinkle) and his motif, ink spots joined by
 * lilac stars: a spot with a sparkle off the Spot Shot, a splash of spots in the Splatter, spots flung off in a ring
 * on Big Shake, a starred spot on every CONNECT THE DOTS! target, a star glint on each Spot On spot. Sounds: the
 * framework plays the nature layer with his marimba motif (W: the splat, E: the shake, R: the pencil-draw ult voice
 * and a marimba star on each hit), so this script no longer plays the boop, splat, shake or draw on the cast; the
 * Spot Shot carries the projectile travel whoosh.
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { playSkillSfx } from '../../audio/skillSfx';
import { type SkillKey } from '../../data/identity';
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_S } from '../anim/timing';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { flying, funHeroOf, funOverY, funPop, funSound, orbit, sticker } from '../fx/fun/funKit';
import { shower } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';
import { MIX_REL, drawIdentity } from './identityFx';

const SPOT = 0x16141a;
const STAR = 0xd8c8ff;
const INK = 0x2a2440;
const WHITE = 0xffffff;

/** The R cast being collected: per caster, its tick (-1 = none) and up to 6 heroes it hit on that tick. */
const R_TICK = new Int32Array(16).fill(-1);
const R_AGE = new Float32Array(16);
const R_N = new Uint8Array(16);
const R_DST = new Int16Array(16 * 6);
/** The drawn path (positions m): a scratch list per draw, never allocated per frame. */
const PX = new Float32Array(8);
const PZ = new Float32Array(8);
const USED = new Uint8Array(8);
const QX = new Float32Array(6);
const QZ = new Float32Array(6);
const QID = new Int16Array(6);
const ok = (id: number): boolean => id >= 0 && id < 16;

// ------------------------------------------------------------------------------------------------ champion identity

/** Champion identity (render/skillfx/identityFx.ts drawIdentity): the skill's nature accent and Domino's motif. */
const identity = (fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void =>
  drawIdentity(fx, 'domino', src, skill, x, y, z, n, dx, dz, nature);


/** One spot flying from a to b (m), arriving in `t` s. */
function spotFly(fx: FxCtx, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, t: number): void {
  flying(fx, ax, y0, az, (bx - ax) / t, (y1 - y0) / t, (bz - az) / t, 'SOFT', SPOT, 0.3, t);
}

/** The dot-to-dot: link Domino to the heroes he hit, nearest first from the previous link, and draw it. */
function drawDots(id: number, fx: FxCtx): void {
  if (!fx.heroPos(id, P)) return;
  const n = Math.min(6, R_N[id]);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const d = R_DST[id * 6 + k];
    if (!fx.heroPos(d, Q)) continue;
    QX[m] = Q.x;
    QZ[m] = Q.z;
    QID[m] = d;
    USED[m] = 0;
    m++;
  }
  if (m === 0) return;
  PX[0] = P.x;
  PZ[0] = P.z;
  const rel = fx.relation(id);
  const rim = fx.rim(id);
  let len = 0;
  for (let step = 0; step < m; step++) {
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < m; k++) {
      if (USED[k]) continue;
      const dd = Math.hypot(QX[k] - PX[len], QZ[k] - PZ[len]);
      if (dd < bd || (dd === bd && best >= 0 && QID[k] < QID[best])) {
        bd = dd;
        best = k;
      }
    }
    if (best < 0) break;
    USED[best] = 1;
    const ax = PX[len];
    const az = PZ[len];
    const bx = QX[best];
    const bz = QZ[best];
    len++;
    PX[len] = bx;
    PZ[len] = bz;
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz);
    const delay = (len - 1) * 0.1;
    // the starry beam along the link, lit after its pencil line is drawn (QA v15: wider and longer, it barely showed)
    if (l > 0.05) mesh(fx, 'beam', ax, az, l, 1.0, STAR, rim, rel, { yaw: yawOf(dx / l, dz / l), sz: 1.0, delay, y: 0.6, p3: 1.6 });
    // the dotted pencil line: black dots along the link
    const dots = Math.min(14, Math.max(2, Math.round(l / 0.5)));
    for (let k = 1; k < dots; k++) sticker(fx, ax + (dx * k) / dots, 0.7, az + (dz * k) / dots, 'SOFT', SPOT, 0.3, 0.7 + delay);
    // the star burst and the root ring on the target, its spots flying home to his coat
    mesh(fx, 'ring', bx, bz, 0.9, 0.6, STAR, rim, rel, { p1: 0.7, delay });
    shower(fx, bx, 1.1, bz, 8, SHAPE.STAR4, STAR, 0.26, 0.6, 2.2, 1.2, 0, vary(), true);
    spotFly(fx, bx, bz, P.x, P.z, 1.2, 1.0, 0.45);
    // identity: a starred spot on the dot (the marimba star is his R impact sound, on the hit)
    identity(fx, id, 'r', bx, 0.4, bz, 3, 0, 0, false);
  }
  // identity: the arcane twinkle round him as the lines draw (the pencil scratch is his ult voice, on the cast)
  identity(fx, id, 'r', P.x, 0.4, P.z, 4);
  if (len >= 2) funPop(fx, id, 'CONNECT THE DOTS!', P.x, funOverY(fx, id, 0.5), P.z);
}

export const SKILL_FX: SkillFxSet = {
  hero: 'domino',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    if (e.slot === 1) {
      // the Splatter telegraph: a dotted ring at exactly the sim radius for the windup
      const a = fx.abil(e.src, 'w');
      const rad = (a.radius ?? 2400) / 1000;
      const x = e.x / 1000;
      const z = -e.y / 1000;
      mesh(fx, 'ring', x, z, rad, e.ticks * TICK_S + 0.1, INK, fx.rim(e.src), fx.relation(e.src), { p1: 0.9 });
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2;
        sticker(fx, x + Math.cos(ang) * rad, 0.15, z + Math.sin(ang) * rad, 'SOFT', SPOT, 0.2, e.ticks * TICK_S);
      }
      return;
    }
    if (e.slot === 3) funSound('dominoDraw', P, 0.8, 0.35);
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    switch (e.slot) {
      case 0:
        // identity: the projectile sparkle and a spot with a star off the throw (the boop is his motif ping)
        if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
        identity(fx, e.src, 'q', P.x + F.x * 0.6, 0.3, P.z + F.z * 0.6, 5, F.x, F.z);
        return;
      case 1: {
        const a = fx.abil(e.src, 'w');
        const rad = (a.radius ?? 2400) / 1000;
        const x = e.x / 1000;
        const z = -e.y / 1000;
        mesh(fx, 'glow', x, z, rad, 1.0, INK, rim, rel, { p3: 0.6 });
        mesh(fx, 'ring', x, z, rad, 0.4, SPOT, rim, rel, { p1: 0.8 });
        shower(fx, x, 0.4, z, 14, SHAPE.DROPLET, INK, 0.3, 0.6, rad * 1.4, 1.6, 5, vary());
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + 0.3;
          sticker(fx, x + Math.cos(ang) * rad * 0.8, 0.12, z + Math.sin(ang) * rad * 0.8, 'SOFT', SPOT, 0.34, 1.0);
        }
        // identity: splash droplets and a splash of spots (the splat is his W cast sound)
        identity(fx, e.src, 'w', x, 0.1, z, 9);
        return;
      }
      case 2: {
        const rad = (fx.abil(e.src, 'e').radius ?? 2600) / 1000;
        mesh(fx, 'ring', P.x, P.z, rad, 0.35, 0x9fd8ff, rim, rel, { p1: 0.8 });
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          flying(fx, P.x, 1.0, P.z, Math.cos(ang) * rad * 2.4, 1.5, Math.sin(ang) * rad * 2.4, 'DROPLET', 0x9fd8ff, 0.24, 0.42);
        }
        // identity: the impact ring and spots flung off him (the rattle is his E cast sound)
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 8);
        funPop(fx, e.src, 'SHAKE!', P.x, funOverY(fx, e.src, 0.4), P.z);
        return;
      }
      default:
        if (ok(e.src)) {
          R_TICK[e.src] = e.tick;
          R_AGE[e.src] = 0;
          R_N[e.src] = 0;
        }
    }
  },

  onProjectile(owner, kind, slot, fx) {
    if (kind !== PROJECTILE_KIND.fluff || slot !== 0 || !ok(owner) || funHeroOf(fx, owner) !== 'domino' || !fx.heroPos(owner, P)) return;
    sticker(fx, P.x, 1.0, P.z, 'RING', WHITE, 0.4, 0.2);
    // the projectile travel whoosh under the Spot Shot (identity mix: travel layer)
    playSkillSfx('domino', 'q', 'travel', { at: P, relation: MIX_REL[fx.relation(owner)] });
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !ok(e.src) || !fx.heroPos(e.dst, Q)) return;
    if (R_TICK[e.src] === e.tick) {
      // the R's targets, collected on the cast tick; drawn on the next update
      if (R_N[e.src] < 6) R_DST[e.src * 6 + R_N[e.src]++] = e.dst;
      return;
    }
    // Spot On: a spot flies off his coat onto the hero
    if (funHeroOf(fx, e.dst) !== null && fx.heroPos(e.src, P)) spotFly(fx, P.x, P.z, Q.x, Q.z, 1.2, 1.4, 0.25);
    shower(fx, Q.x, 1.0, Q.z, 3, SHAPE.SOFT, SPOT, 0.18, 0.3, 1.2, 0.6, 0, vary());
    // identity: Spot On: the spot sticks with a star glint
    identity(fx, e.src, 'passive', Q.x, 0.6, Q.z, 3, 0, 0, false);
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('dm:') || !fx.heroPos(id, P)) return;
    if (marker === 'dm:emote') {
      // the shake: every spot flies off and circles him, then drops back on
      orbit(fx, P.x, 1.2, P.z, 'SOFT', SPOT, 12, 1.1, 0.26, 1.1, vary() * Math.PI * 2);
      funSound('dominoShake', P, 1.1, 0.4);
    } else if (marker === 'dm:shake') shower(fx, P.x, 1.0, P.z, 10, SHAPE.DROPLET, 0x9fd8ff, 0.2, 0.4, 2.4, 1.4, 5, vary());
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      if (R_TICK[id] < 0) continue;
      R_AGE[id] += dt;
      // the cast's hits arrive with it: draw once they are in (a frame later), or give up
      if (R_AGE[id] >= 0.03) {
        drawDots(id, fx);
        R_TICK[id] = -1;
      }
    }
  },
};

