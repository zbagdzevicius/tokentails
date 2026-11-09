/**
 * Rocket's skill FX (sim v15; build spec docs/plans/moba/DOGS-V15.md §1.1 "Moves and VFX"): turf green and white
 * speed.
 *
 * - Q Lure Shot: a white speed line riding the dart (`fluff` kind, drawn plush white by projectileView, his GRASS
 *   trail), and a stopwatch "CLICK!" over him when it hits a hero (the haste).
 * - W Photo Finish: speed lines on the take-off, a finish-line ribbon that snaps across his chest on the landing, and
 *   a camera-flash sparkle on the loaded basic that follows (his next head flick within the 3 s window).
 * - E SQUIRREL!: a plush squirrel arcs to the point over the windup, a ring telegraph in squirrel brown at exactly the
 *   sim radius; on the cast the squeak, "SQUEAK!", and a "!" over each cat that starts chasing (feared).
 * - R ZOOM… ZZZ: the goggles drop (a glint), dust in the crouch; on the cast a green-white blur trail along his path
 *   (a ribbon, no afterimage clones) and speed lines; the nap (signature, the `clip` event 'zzz'): "Zzz" letters
 *   rising off him for the whole nap, the snore, and a small camera punch for the player's own (off under reduced
 *   motion).
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/rocket.ts): the nature and start-beep layers play from
 * render/effects.ts on every cast; this script adds the moments only it knows: the dart's travel whirr, checker squares
 * flapping off the lure like a mini flag, a checker finish line under his feet on Photo Finish, a checker square under
 * the landed squirrel, one start beep on the ZOOM crouch (the race whistle is the ult voice on the go), a checkered
 * streak behind the sprint and a flag under the nap. R no longer plays rocketWhoosh (the mobility nature's whoosh
 * covers it).
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { mixPriority, type MixRelation } from '../../audio/identityMix';
import { sfx } from '../../audio/sfx';
import { champSound, playSkillSfx } from '../../audio/skillSfx';
import { BuffFlag } from '../../sim/api';
import { TICK_S, abilNumbers } from '../anim/timing';
import type { FxCtx, Relation3, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, funSound, speedLines, sticker } from '../fx/fun/funKit';
import { shower, throwSticker, zed } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';

const TURF = 0x9be07a;
const WHITE = 0xffffff;
const SQUIRREL = 0xa0663a;
/** His identity colour pair's primary (data/identity.ts): the checker flag's green. */
const FLAG = 0x1e8f4e;
const MIX_REL: Readonly<Record<Relation3, MixRelation>> = { own: 'mine', ally: 'ally', enemy: 'enemy' };
const relOf = (fx: FxCtx, id: number): MixRelation => MIX_REL[fx.relation(id)] ?? 'enemy';

/** A skill phase's nature + champion sound (audio/skillSfx.ts) for a moment only this script sees. */
function skillSound(fx: FxCtx, id: number, skill: 'q' | 'w' | 'e' | 'r', phase: 'impact' | 'travel', at: { x: number; z: number }): void {
  try {
    playSkillSfx('rocket', skill, phase, { at, relation: relOf(fx, id), src: id });
  } catch {
    /* audio not unlocked yet */
  }
}

/** One of his own sounds (audio/champ/rocket.ts `motif` / `sounds`) through the identity mix. */
function champCue(fx: FxCtx, id: number, name: string, at: { x: number; z: number }, rate = 1): void {
  const relation = relOf(fx, id);
  try {
    sfx.playLayer({ name: champSound('rocket', name), layer: 'motif', hero: 'rocket', priority: mixPriority({ relation }), relation, rate, at });
  } catch {
    /* audio not unlocked yet */
  }
}

/** A flat checker patch (cols × 2 squares, green / white) centred at (x, z), its long side along (ax, az). */
function checker(fx: FxCtx, x: number, y: number, z: number, ax: number, az: number, cols: number, size: number, life: number): void {
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < 2; r++) {
      const u = (c - (cols - 1) / 2) * size;
      const v = (r - 0.5) * size;
      sticker(fx, x + ax * u - az * v, y, z + az * u + ax * v, 'CONFETTI', (c + r) & 1 ? WHITE : FLAG, size * 1.1, life);
    }
}
/** The nap and the Photo Finish window (s): the sim's r.nap and w.window ticks. */
const NAP_S = (abilNumbers('rocket', 'r').nap ?? 18) * TICK_S;
const WINDOW_S = (abilNumbers('rocket', 'w').window ?? 90) * TICK_S;
/** The sprint's travel ticks at full length (the trail runs that long, a few ticks more). */
const T_R_DASH = Math.ceil(((abilNumbers('rocket', 'r').dash ?? 11000) * 30) / (abilNumbers('rocket', 'r').speed ?? 24000));

/** Per caster: the dart trail, the sprint blur, the nap, the loaded Photo Finish, the last Q and E casts (s ago). */
const DART = new Int16Array(16).fill(-1);
const DART_P = new Int16Array(16).fill(-1);
const BLUR = new Int16Array(16).fill(-1);
const BLUR_T = new Float32Array(16);
const NAP_T = new Float32Array(16);
const NAP_N = new Float32Array(16);
const LOADED = new Float32Array(16);
const Q_AGO = new Float32Array(16).fill(9);
const E_AGO = new Float32Array(16).fill(9);
const E_X = new Float32Array(16);
const E_Z = new Float32Array(16);
const ok = (id: number): boolean => id >= 0 && id < 16;

export const SKILL_FX: SkillFxSet = {
  hero: 'rocket',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: false, passive: false },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    if (e.slot === 2) {
      // the squirrel: a ring at exactly the sim radius for the windup, the plush toy arcing over to it
      const a = fx.abil(e.src, 'e');
      const x = e.x / 1000;
      const z = -e.y / 1000;
      const life = e.ticks * TICK_S;
      mesh(fx, 'ring', x, z, (a.radius ?? 2400) / 1000, life + 0.15, SQUIRREL, fx.rim(e.src), fx.relation(e.src), { p1: 0.86 });
      const vx = (x - P.x) / life;
      const vz = (z - P.z) / life;
      throwSticker(fx, P.x, 1.4, P.z, vx, 0.5 * 9 * life, vz, SHAPE.PUFF, SQUIRREL, 0.42, life, 9, 6, 0, false, 0.2);
      if (ok(e.src)) {
        E_X[e.src] = x;
        E_Z[e.src] = z;
      }
      return;
    }
    if (e.slot === 3) {
      // the crouch: dust off his paws, and the start light's "get set" beep (the whistle on the cast is "GO")
      shower(fx, P.x, 0.15, P.z, 6, SHAPE.PUFF, 0xe8dcc8, 0.3, 0.4, 1.8, 0.6, 2, vary());
      champCue(fx, e.src, 'motif', P, 1);
    }
  },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
    switch (e.slot) {
      case 0:
        if (ok(e.src)) Q_AGO[e.src] = 0;
        speedLines(fx, P.x, 1.0, P.z, F.x, F.z, 4, WHITE, 0.7, 10);
        // the lure's mini flag at the muzzle
        checker(fx, P.x + F.x * 0.6, 1.25, P.z + F.z * 0.6, F.x, F.z, 2, 0.16, 0.3);
        return;
      case 1:
        if (ok(e.src)) LOADED[e.src] = WINDOW_S;
        speedLines(fx, P.x, 0.6, P.z, F.x, F.z, 7, WHITE, 0.9, 9);
        shower(fx, P.x, 0.15, P.z, 6, SHAPE.PUFF, 0xe8dcc8, 0.3, 0.4, 2, 0.6, 2, vary());
        return;
      case 2: {
        const x = e.x / 1000;
        const z = -e.y / 1000;
        if (ok(e.src)) {
          E_AGO[e.src] = 0;
          E_X[e.src] = x;
          E_Z[e.src] = z;
        }
        // the toy lands squeaking: a pulse at the sim radius, the squeak and the word
        const a = fx.abil(e.src, 'e');
        mesh(fx, 'ring', x, z, (a.radius ?? 2400) / 1000, 0.4, SQUIRREL, rim, rel, { p1: 0.7 });
        sticker(fx, x, 0.5, z, 'PUFF', SQUIRREL, 0.55, 0.9);
        sticker(fx, x + 0.18, 0.7, z, 'SOFT', 0xf2d2b0, 0.25, 0.9);
        // the squirrel lands on a checker square
        checker(fx, x, 0.1, z, 1, 0, 2, 0.32, 0.9);
        funSound('rocketSqueak', { x, z }, 1, 0.55);
        funPop(fx, e.src, 'SQUEAK!', x, 1.6, z);
        return;
      }
      default: {
        // ZOOM: the blur trail along the sprint, speed lines and the whoosh
        if (ok(e.src)) {
          if (BLUR[e.src] >= 0) fx.ribbons.end(BLUR[e.src]);
          Q.x = P.x;
          Q.y = 0.9;
          Q.z = P.z;
          BLUR[e.src] = fx.ribbons.point(Q, TURF, 0.9, 0.35);
          BLUR_T[e.src] = (T_R_DASH + 4) * TICK_S;
        }
        speedLines(fx, P.x, 0.9, P.z, F.x, F.z, 10, WHITE, 1.2, 14);
        mesh(fx, 'beam', P.x, P.z, (fx.abil(e.src, 'r').dash ?? 11000) / 1000, 0.35, TURF, rim, rel, { yaw: yawOf(F.x, F.z), sz: 1.0, p3: 0.5 });
        // the mobility nature's whoosh and his race whistle (ult voice) play from render/effects.ts
        funPop(fx, e.src, 'ZOOM!', P.x, funOverY(fx, e.src, 0.4), P.z);
      }
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.fluff || slot !== 0 || index === undefined || !ok(owner)) return;
    if (funHeroOf(fx, owner) !== 'rocket') return;
    if (DART[owner] >= 0) fx.ribbons.end(DART[owner]);
    DART[owner] = -1;
    if (!fx.projPos?.(index, P)) return;
    P.y = 1.1;
    DART_P[owner] = index;
    DART[owner] = fx.ribbons.point(P, WHITE, 0.16, 0.18);
    skillSound(fx, owner, 'q', 'travel', P);
  },

  onHit(e, fx) {
    if (e.kind !== 'ability' || !ok(e.src) || !fx.heroPos(e.dst, Q)) return;
    shower(fx, Q.x, 1.0, Q.z, 4, SHAPE.STAR4, WHITE, 0.2, 0.3, 1.4, 0.6, 0, vary(), true);
    // the Lure Shot found a hero: the stopwatch click over Rocket (the haste)
    if (Q_AGO[e.src] < 0.7 && funHeroOf(fx, e.dst) !== null && fx.heroPos(e.src, P)) {
      Q_AGO[e.src] = 9;
      const y = funOverY(fx, e.src, 0.2);
      sticker(fx, P.x, y, P.z, 'RING', WHITE, 0.5, 0.45);
      sticker(fx, P.x, y, P.z, 'PLUS', TURF, 0.22, 0.45);
      funPop(fx, e.src, 'CLICK!', P.x, y + 0.4, P.z);
    }
  },

  onStatus(id, gained, _lost, fx) {
    // a cat that starts chasing the squirrel: a "!" over its head (any recent SQUIRREL! near it)
    if ((gained & BuffFlag.Feared) === 0 || !fx.heroPos(id, Q)) return;
    for (let s = 0; s < 16; s++) {
      if (E_AGO[s] > 0.4) continue;
      if (Math.hypot(Q.x - E_X[s], Q.z - E_Z[s]) > 4) continue;
      sticker(fx, Q.x, funOverY(fx, id, 0.3), Q.z, 'EXCLAIM', 0xff3b30, 0.5, 0.7, 0.3);
      return;
    }
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('rk:') || !fx.heroPos(id, P)) return;
    switch (marker) {
      case 'rk:flick':
        // the loaded Photo Finish basic: a camera-flash sparkle
        if (ok(id) && LOADED[id] > 0) {
          LOADED[id] = 0;
          const y = funOverY(fx, id, -0.4);
          sticker(fx, P.x, y, P.z, 'STAR4', WHITE, 0.9, 0.18);
          shower(fx, P.x, y, P.z, 6, SHAPE.SPARK, WHITE, 0.2, 0.25, 2.4, 0.4, 0, vary(), true);
        }
        return;
      case 'rk:ribbon': {
        // the finish line: a white tape snapping across his chest, confetti
        faceOf(fx, id);
        mesh(fx, 'beam', P.x - F.z * 1.1, P.z + F.x * 1.1, 2.2, 0.35, WHITE, fx.rim(id), fx.relation(id), { yaw: yawOf(-F.z, F.x), sz: 0.12, y: 0.9 });
        shower(fx, P.x, 1.2, P.z, 8, SHAPE.CONFETTI, TURF, 0.2, 0.7, 2, 1.6, 4, vary());
        // the finish line he crosses: a checker strip on the ground across his path
        checker(fx, P.x, 0.08, P.z, -F.z, F.x, 6, 0.28, 0.7);
        return;
      }
      case 'rk:squeak':
        funSound('rocketSqueak', P, 1.25, 0.35);
        return;
      case 'rk:goggles':
        sticker(fx, P.x, funOverY(fx, id, -0.35), P.z, 'SPARK', 0x9fe0ff, 0.4, 0.25);
        return;
      case 'rk:zzz':
        zed(fx, P.x + 0.2, 1.2, P.z, 0.32, WHITE, 0.9, 0.7);
        return;
      case 'rk:wake':
        funPop(fx, id, 'HUH?', P.x, funOverY(fx, id, 0.2), P.z);
        return;
      default:
        return;
    }
  },

  onClip(id, what, fx) {
    if (what !== 'zzz' || !ok(id) || !fx.heroPos(id, P)) return;
    NAP_T[id] = NAP_S;
    NAP_N[id] = 0;
    if (BLUR[id] >= 0) {
      fx.ribbons.end(BLUR[id]);
      BLUR[id] = -1;
    }
    funSound('rocketSnore', P, 1, 0.55);
    // a little checkered flag planted beside the nap
    checker(fx, P.x + 0.5, 1.0, P.z, 1, 0, 2, 0.18, NAP_S);
    funPop(fx, id, 'ZZZ…', P.x, funOverY(fx, id, 0.3), P.z);
    if (fx.relation(id) === 'own' && !fx.reduced) fx.cam.punch(0.05);
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      Q_AGO[id] += dt;
      E_AGO[id] += dt;
      if (LOADED[id] > 0) LOADED[id] -= dt;
      if (DART[id] >= 0) {
        if (fx.projPos?.(DART_P[id], P)) {
          fx.ribbons.feed(DART[id], P.x, 1.1, P.z);
          // checker squares flapping off the lure's flag
          if (vary() < 0.35) sticker(fx, P.x, 1.2, P.z, 'CONFETTI', vary() < 0.5 ? FLAG : WHITE, 0.18, 0.25, 0.4);
        } else {
          fx.ribbons.end(DART[id]);
          DART[id] = -1;
        }
      }
      if (BLUR[id] >= 0) {
        BLUR_T[id] -= dt;
        if (BLUR_T[id] > 0 && fx.heroPos(id, P)) {
          fx.ribbons.feed(BLUR[id], P.x, 0.9, P.z);
          if (vary() < 0.5) sticker(fx, P.x, 0.4 + vary() * 0.8, P.z, 'SOFT', WHITE, 0.35, 0.25);
          // the checkered streak: green and white squares left on his path
          else sticker(fx, P.x, 0.3 + vary() * 0.7, P.z, 'CONFETTI', vary() < 0.5 ? FLAG : WHITE, 0.24, 0.4);
        } else {
          fx.ribbons.end(BLUR[id]);
          BLUR[id] = -1;
        }
      }
      if (NAP_T[id] > 0) {
        NAP_T[id] -= dt;
        NAP_N[id] -= dt;
        if (NAP_N[id] <= 0 && fx.heroPos(id, P)) {
          // "Zzz" letters rising off him, a little bigger each time
          NAP_N[id] = 0.22;
          zed(fx, P.x + 0.15, 1.1, P.z, 0.26 + 0.08 * (1 - NAP_T[id] / NAP_S), WHITE, 1.0, 0.8);
        }
      }
    }
  },
};

