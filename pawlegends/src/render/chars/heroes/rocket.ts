/**
 * Rocket (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1.1 "Art brief"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The racer: a greyhound. From the iso camera he is "the stick dog in the jacket": the tallest, thinnest dog, a long
 * narrow wedge of a head, a long thin muzzle, rose ears folded flat back, calm eyes, a smooth brindle-grey
 * coat with a white chest blaze and white toes, and a thin whip tail curled low. Team colour on the racing jacket (a
 * blanket over his back, chest and hips with a big white number 7 on each side); small racing goggles pushed up on his
 * forehead. No muzzle (a racing muzzle reads as a cage).
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, dogEyes, dogNose, faceLine, mixC, smooth, shawl } from './dogParts';

/**
 * His poses: the classic greyhound lean (weight on one side, head low, the long legs straight, so he stands tall), the
 * run stance, and the roach nap: flat on his back with all four legs straight up in the air.
 */
export const POSES: Record<string, PoseDef> = {
  houndLean: {
    joints: { hips: [0.02, 0, 0.06], chest: [0.12, 0, -0.05], head: [0.16, 0, 0.12], thighL: [0.02, 0.06, 0.1], thighR: [0.02, -0.06, -0.02], kneeL: [0.04, 0, 0], kneeR: [0.04, 0, 0], footL: [0, 0.2, 0], footR: [0, -0.2, 0] },
    arms: { L: { fk: { shoulder: [-0.12, 0, 0.12], elbow: [-0.1, 0, 0] } }, R: { fk: { shoulder: [-0.12, 0, -0.04], elbow: [-0.1, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  houndRun: {
    joints: { hips: [0.12, 0, 0], chest: [0.22, 0, 0], head: [0.05, 0, 0], thighL: [-0.1, 0.06, 0.06], thighR: [-0.1, -0.06, -0.06], kneeL: [0.12, 0, 0], kneeR: [0.12, 0, 0], footL: [0, 0.2, 0], footR: [0, -0.2, 0] },
    arms: { L: { fk: { shoulder: [-0.4, 0, 0.08], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [-0.4, 0, -0.08], elbow: [-0.3, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // The roach: on his back (the body turned a quarter backward, lowered), all four legs straight up, the head lolled
  roachNap: {
    body: { p: [0, 0.16, 0.28], r: [-Math.PI / 2, 0, 0] },
    joints: { head: [0.55, 0, 0.45], thighL: [-1.55, 0, 0.08], thighR: [-1.55, 0, -0.08], kneeL: [0.05, 0, 0], kneeR: [0.05, 0, 0], earL: [0.5, 0, 0], earR: [0.5, 0, 0] },
    arms: { L: { fk: { shoulder: [-3.0, 0, 0.12], elbow: [-0.1, 0, 0] } }, R: { fk: { shoulder: [-3.0, 0, -0.12], elbow: [-0.1, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle leans, runs on a long double-suspension gallop, casts with a crouch-and-point (cheer), attacks with a head flick. */
export const MOTION: MotionProfile = { idle: 'houndLean', run: 'houndRun', cast: 'cheer', attack: 'paw', stride: 1.6 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 3.2;
/** Top of the bind-pose bounds (m: the goggles), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.92;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.rocket.ring;
export const COLOR_CSS = '#4caf6a';
/** A thin whip tail that lashes, and small rose ears that barely move. */
export const SPRINGS: SpringTuning = { tail: { k: 180, c: 7, lag: 0.35 }, ears: { k: 200, c: 12, lag: 0 } };
export const ULT_NAME = 'ZOOM… ZZZ';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0x9be07a;

/** Smooth brindle grey: the tabby stripes run as faint brindle bands; white bib (cream) and toes. */
const COAT: CoatSpec = { pattern: 'tabby', base: 0x8c8682, deep: 0x5e5955, light: 0xd8d2cc, cream: 0xf2eee8, stripe: 0.55 };
const EAR_FOLD = 0x4a4542;
const GOGGLE = 0x2a2e36;
const LENS = 0x9fe0ff;
const NUMBER = 0xffffff;
/** The whip tail: down off the rump, the last bones curled low. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.17, -0.13], [0, 0.07, -0.29], [0.01, -0.08, -0.35], [0.02, -0.17, -0.27]];

/**
 * The greyhound head: a long narrow wedge skull, the long thin muzzle (white underneath), a black nose at its tip, calm
 * half-lidded eyes (a coat-coloured lid over the top), a white blaze, and small rose ears folded flat back.
 */
function greyhoundHead(A: Assembly, coat: CoatSpec): void {
  const grey = C(coat.base as number);
  const deep = C(coat.deep as number);
  const white = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(grey, deep, smooth(0.02, -0.12, lp.z) * 0.35 + smooth(0.24, 0.3, lp.y) * 0.2);
    // the white blaze: a narrow stripe down the forehead between the eyes
    const blaze = smooth(0.022, 0.012, Math.abs(lp.x)) * smooth(0.27, 0.2, lp.y) * smooth(0.04, 0.1, lp.z);
    return mixC(c, white, blaze);
  };
  // the narrow wedge skull, long front to back
  A.add('head', new THREE.SphereGeometry(0.14, A.seg(20, 10), A.seg(14, 8)).scale(0.82, 0.86, 1.3).translate(0, 0.18, -0.02), { color: skin });
  // the long, thin muzzle: a stretched egg sloping down from the forehead (no stop), white underneath
  const muzzle = new THREE.SphereGeometry(0.072, A.seg(14, 8), A.seg(10, 6)).scale(0.82, 0.8, 2.15);
  A.add('head', muzzle, {
    m: mat([0, 0.155, 0.16], [0.3, 0, 0]),
    color: (_v, _n, lp) => mixC(mixC(grey, deep, smooth(0.0, 0.04, lp.y) * 0.45), white, Math.max(smooth(-0.02, -0.04, lp.y), smooth(0.012, 0.004, Math.abs(lp.x)) * smooth(0.02, 0.045, lp.y) * 0.8)),
  });
  dogNose(A, [0, 0.112, 0.31], 0.024);
  // a calm little mouth line along the muzzle
  faceLine(A, [[-0.04, 0.098, 0.18], [-0.016, 0.09, 0.25], [0, 0.092, 0.275]], 0.004, 0x3a2224);
  faceLine(A, [[0.04, 0.098, 0.18], [0.016, 0.09, 0.25], [0, 0.092, 0.275]], 0.004, 0x3a2224);
  dogEyes(A, { inner: 0x7a5636, outer: 0x3a2414, ring: 0x140c0a }, { x: 0.06, y: 0.195, z: 0.118, r: 0.036, turn: 0.45 });
  // the rose ears: small flaps folded back along the top of the skull, tips pointing back and out, the darker
  // inside showing at the fold (on the ear bones, so the Q and R clips flip them up)
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    const at = mat([0, -0.01, -0.02], [-2.25, sign * 0.35, 0]);
    A.add(`ear${s}`, new THREE.SphereGeometry(0.05, A.seg(10, 6), A.seg(7, 4)).scale(0.75, 1.3, 0.28).translate(0, 0.05, 0), { m: at, color: (_v, _n, lp) => mixC(grey, deep, 0.3 + smooth(0.02, 0.1, lp.y) * 0.35) });
    A.add(`ear${s}`, new THREE.SphereGeometry(0.032, A.seg(8, 5), A.seg(5, 3)).scale(0.65, 1.2, 0.22).translate(0, 0.042, 0.01), { m: at, color: EAR_FOLD });
  }
}

/** Racing goggles pushed up on his forehead: a dark strap round the head, two round frames with pale lenses. */
function goggles(A: Assembly): void {
  A.add('head', new THREE.TorusGeometry(0.135, 0.012, 3, A.seg(18, 10)), { m: mat([0, 0.25, -0.01], [Math.PI / 2 - 0.5, 0, 0], [0.95, 1.18, 1]), color: GOGGLE });
  for (const s of [1, -1]) {
    const at = mat([s * 0.045, 0.3, 0.075], [-0.95, s * 0.25, 0]);
    A.add('head', new THREE.TorusGeometry(0.032, 0.011, 4, A.seg(12, 8)), { m: at, color: GOGGLE });
    A.add('head', new THREE.CircleGeometry(0.03, A.seg(10, 7)), { m: at.clone().multiply(mat([0, 0, 0.004])), color: LENS });
  }
}

/** One white "7" on a flank of the jacket (a top bar and a slanted stem), chest space, side `s`. */
function seven(A: Assembly, s: 1 | -1): void {
  const w = A.w;
  const at = mat([s * 0.178 * w, 0.02, -0.02], [0, (s * Math.PI) / 2, 0]);
  A.add('chest', new THREE.BoxGeometry(0.1, 0.028, 0.012), { m: at.clone().multiply(mat([0, 0.055, 0])), color: NUMBER });
  A.add('chest', new THREE.BoxGeometry(0.028, 0.13, 0.012), { m: at.clone().multiply(mat([0.012, -0.01, 0], [0, 0, -0.38])), color: NUMBER });
}

/**
 * The racing jacket: a team blanket over his back, shoulders and chest (the shawl on top, a wrap round the chest and
 * a flap over the hips), a trim, the big white 7 on each side.
 */
function jacket(A: Assembly, color: Col, trim: Col): void {
  const w = A.w;
  shawl(A, color, trim, { r: 0.205, y: 0.15, low: 0.6 });
  // the wrap round the chest: an open band just over the body
  A.add('chest', new THREE.CylinderGeometry(0.172 * w, 0.168 * w, 0.2, A.seg(18, 10), 1, true), { m: mat([0, 0.02, -0.01], [0, 0, 0], [1, 1, 0.95]), color });
  // the flap over the hips (the big up-facing patch from behind)
  const t1 = Math.PI * 0.42;
  A.add('hips', new THREE.SphereGeometry(0.168, A.seg(14, 8), A.seg(6, 4), 0, Math.PI * 2, 0, t1), { m: mat([0, 0.035, -0.015], [-0.25, 0, 0], [w * 1.06, 0.8, 1.04]), color });
  seven(A, 1);
  seven(A, -1);
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 0.8, tier: 'hero', headScale: 0.9, bodyScale: 1.0, earsLow: 0.3, tailCurve: TAIL },
    coat,
    eyes: { inner: 0x7a5636, outer: 0x3a2414, ring: 0x140c0a },
    earInner: EAR_FOLD,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 0.8 },
    detail,
    poses,
    gear: (A) => {
      greyhoundHead(A, coat);
      goggles(A);
      jacket(A, t.main, trim ?? t.second);
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.24, top: 0.12, bot: 0.18 });
      extras(A);
    },
  };
}
