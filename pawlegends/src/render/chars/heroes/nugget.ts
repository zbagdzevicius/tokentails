/**
 * Nugget (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.1 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The cute one: a Pembroke corgi loaf. From the iso camera he is "the low one with the huge ears": a long low body
 * on short bent legs (the `corgiStand` crouch), two enormous upright red ears, a white blaze and muzzle, and the
 * heart-shaped fluffy bum (no tail) that reads from behind. Team colour on the bandana (mantle, knot, a short tail)
 * and the frisbee slung on his back; a treat pouch on his hip.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { blushDots, C, dogEyes, dogNose, faceLine, mixC, pointedEar, smooth, shawl } from './dogParts';

/** His poses (spread into specs.ts POSES_PL): the low corgi stand (bent legs: the rig has no leg length) and a sit. */
export const POSES: Record<string, PoseDef> = {
  corgiStand: {
    body: { p: [0, -0.05, 0] },
    joints: { hips: [0.18, 0, 0], chest: [0.1, 0, 0], head: [-0.22, 0, 0], thighL: [-0.55, 0.08, 0.08], thighR: [-0.55, -0.08, -0.08], kneeL: [0.95, 0, 0], kneeR: [0.95, 0, 0], footL: [-0.35, 0.2, 0], footR: [-0.35, -0.2, 0] },
    arms: { L: { fk: { shoulder: [-0.35, 0, 0.12], elbow: [-0.4, 0, 0] } }, R: { fk: { shoulder: [-0.35, 0, -0.12], elbow: [-0.4, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  corgiSit: {
    body: { p: [0, -0.12, -0.02] },
    joints: { hips: [-0.15, 0, 0], chest: [0.12, 0, 0], head: [-0.1, 0, 0.08], thighL: [-1.45, 0.2, 0.12], thighR: [-1.45, -0.2, -0.12], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], footL: [-0.3, 0.25, 0], footR: [-0.3, -0.25, 0] },
    arms: { L: { fk: { shoulder: [-0.25, 0, 0.05], elbow: [-0.35, 0, 0] } }, R: { fk: { shoulder: [-0.25, 0, -0.05], elbow: [-0.35, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // The Sploot (E, victory): flat on his belly (the body turned a quarter forward and lowered onto the ground, centred
  // on the hitbox), back legs straight out behind, front paws reaching ahead, the chin up so the face looks forward.
  sploot: {
    body: { p: [0, 0.15, -0.28], r: [Math.PI / 2, 0, 0] },
    joints: { head: [-1.3, 0, 0], chest: [-0.1, 0, 0], thighL: [0.12, 0.1, 0.18], thighR: [0.12, -0.1, -0.18], earL: [0.25, 0, 0], earR: [0.25, 0, 0] },
    arms: { L: { fk: { shoulder: [-2.6, 0, 0.35], elbow: [-0.2, 0, 0] } }, R: { fk: { shoulder: [-2.6, 0, -0.35], elbow: [-0.2, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle sits up proud, runs low on a fast short "zoomie" stride, casts with a cheer, attacks with a bark recoil (paw). */
export const MOTION: MotionProfile = { idle: 'corgiSit', run: 'corgiStand', cast: 'cheer', attack: 'paw', stride: 1.4 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.3;
/** Top of the bind-pose bounds (m: the ear tips), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.91;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.nugget.ring;
export const COLOR_CSS = '#c96a2a';
/** A bouncy bum wiggle and big ears that flop and spring back. */
export const SPRINGS: SpringTuning = { tail: { k: 140, c: 8, lag: 0.4 }, ears: { k: 60, c: 5, lag: 0 } };
export const ULT_NAME = 'Herding Time!';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0xff9fd6;

/** The Pembroke red-and-white coat: the white comes from the solid pattern's cream (bib, belly, socks). */
const COAT: CoatSpec = { pattern: 'solid', base: 0xd9782e, deep: 0xa0521f, light: 0xfbe9d2, cream: 0xffffff };
const EAR_PINK = 0xf6b2b8;
const POUCH = 0x8a5a34;
const BONE_WHITE = 0xfff6e6;

/**
 * The corgi head: a fox-like wedge in red with a white blaze down the middle and a white lower face, fluffy white
 * cheeks, a long white muzzle with a black nose, a happy open smile with the tongue out, big glossy brown eyes with a
 * blush under them, and two HUGE upright triangular ears.
 */
function corgiHead(A: Assembly, coat: CoatSpec): void {
  const red = C(coat.base as number);
  const deep = C(coat.deep as number);
  const white = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(red, deep, smooth(0.0, -0.13, lp.z) * 0.35);
    // the white blaze: a stripe up the middle of the forehead, widening down to the muzzle
    const blaze = smooth(0.032, 0.018, Math.abs(lp.x) - Math.max(0, 0.24 - lp.y) * 0.25) * smooth(0.02, 0.08, lp.z);
    // the white lower face and throat
    const lower = smooth(0.15, 0.115, lp.y) * smooth(-0.02, 0.06, lp.z);
    return mixC(c, white, Math.max(blaze, lower));
  };
  A.add('head', new THREE.SphereGeometry(0.152, A.seg(20, 10), A.seg(14, 8)).scale(1.14, 0.97, 1.02).translate(0, 0.172, 0), { color: skin });
  // fluffy white cheeks
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(7, 4)).scale(1, 0.85, 0.85).translate(s * 0.085, 0.1, 0.07), { color: white });
  // the long fox muzzle, white
  A.add('head', new THREE.SphereGeometry(0.066, A.seg(12, 7), A.seg(9, 5)).scale(0.95, 0.72, 1.3).translate(0, 0.112, 0.15), { color: white });
  dogNose(A, [0, 0.14, 0.232], 0.025);
  // the open smile and the tongue out
  faceLine(A, [[-0.04, 0.1, 0.19], [-0.02, 0.085, 0.208], [0, 0.088, 0.214], [0.02, 0.085, 0.208], [0.04, 0.1, 0.19]], 0.005, 0x4a1e26);
  A.add('head', new THREE.SphereGeometry(0.03, A.seg(8, 5), A.seg(6, 4)).scale(0.85, 0.55, 1.05), { m: mat([0, 0.07, 0.195], [0.4, 0, 0]), color: 0xf27a8e });
  dogEyes(A, { inner: 0x6a4228, outer: 0x2e1a10, ring: 0x140c0a }, { x: 0.07, y: 0.195, z: 0.128, r: 0.047 });
  blushDots(A, 0.098, 0.135, 0.11);
  // the huge upright ears (≈1.6× a cat ear), red outside, pink inside, cream fluff at the base
  for (const s of ['L', 'R'] as const) {
    pointedEar(A, s, { r: 0.085, h: 0.235, depth: 0.42, tilt: 0.22, lean: -0.08, outer: (_v, _n, lp) => mixC(red, deep, smooth(0.12, 0.23, lp.y) * 0.4), inner: EAR_PINK });
    A.add(`ear${s}`, new THREE.SphereGeometry(0.035, A.seg(6, 4), A.seg(5, 3)).scale(1.3, 0.8, 0.6), { m: mat([0, 0.025, 0.03]), color: white });
  }
}

/** The heart-shaped fluffy bum: two round lobes on his rump, red above and white fluff below (the corgi meme). */
function fluffyBum(A: Assembly, coat: CoatSpec): void {
  const w = A.w;
  const red = C(coat.base as number);
  const white = C(coat.cream as number);
  for (const s of [1, -1]) {
    A.add('hips', new THREE.SphereGeometry(0.1, A.seg(12, 7), A.seg(9, 5)).scale(0.95, 1, 0.92), {
      m: mat([s * 0.07 * w, 0.02, -0.12]),
      color: (_v, _n, lp) => mixC(red, white, smooth(0.04, -0.06, lp.y)),
    });
  }
}

/** The bandana knot: a team triangle on his chest under the chin. */
function bandanaKnot(A: Assembly, color: Col): void {
  A.add('chest', new THREE.ConeGeometry(0.08, 0.13, 3, 1).rotateX(Math.PI).scale(1.3, 1, 0.35), { m: mat([0, 0.15, 0.16], [-0.25, 0, 0]), color });
  A.add('chest', new THREE.SphereGeometry(0.024, A.seg(6, 4), A.seg(4, 3)), { m: mat([0, 0.215, 0.155]), color });
}

/** The frisbee slung across his back: a team-coloured disc with a white rim and a paw print (the iso camera's patch). */
function frisbee(A: Assembly, color: Col): void {
  const at = mat([0, 0.04, -0.2], [-1.35, 0, 0]);
  A.add('chest', new THREE.CylinderGeometry(0.13, 0.125, 0.02, A.seg(18, 10)), { m: at, color });
  A.add('chest', new THREE.TorusGeometry(0.128, 0.011, 3, A.seg(18, 10)), { m: at.clone().multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0])), color: 0xffffff });
  // the paw print on top
  const top = at.clone().multiply(mat([0, 0.012, 0]));
  A.add('chest', new THREE.CircleGeometry(0.03, 7).rotateX(-Math.PI / 2), { m: top.clone().multiply(mat([0, 0, 0.012])), color: 0xffffff });
  for (const [x, z] of [[-0.03, -0.03], [-0.011, -0.045], [0.011, -0.045], [0.03, -0.03]] as const) {
    A.add('chest', new THREE.CircleGeometry(0.011, 5).rotateX(-Math.PI / 2), { m: top.clone().multiply(mat([x, 0, z])), color: 0xffffff });
  }
}

/** His treat pouch on the left hip: brown leather with a team flap and a bone charm. */
function treatPouch(A: Assembly, flap: Col): void {
  const w = A.w;
  const at = mat([0.17 * w, -0.01, 0.05], [0, 0.6, -0.15]);
  A.add('hips', new THREE.BoxGeometry(0.1, 0.085, 0.06), { m: at, color: POUCH });
  A.add('hips', new THREE.BoxGeometry(0.105, 0.035, 0.065), { m: at.clone().multiply(mat([0, 0.035, 0.002])), color: flap });
  // the bone charm: a bar with two knobs each end
  const b = at.clone().multiply(mat([0, -0.005, 0.035]));
  A.add('hips', new THREE.BoxGeometry(0.045, 0.012, 0.01), { m: b, color: BONE_WHITE });
  for (const x of [-0.025, 0.025]) for (const y of [-0.008, 0.008]) A.add('hips', new THREE.SphereGeometry(0.009, 5, 3), { m: b.clone().multiply(mat([x, y, 0])), color: BONE_WHITE });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.25, tier: 'hero', headScale: 1.05, bodyScale: 1.15, earsLow: 0 },
    coat,
    eyes: { inner: 0x6a4228, outer: 0x2e1a10, ring: 0x140c0a },
    earInner: EAR_PINK,
    nose: 0x1a1216,
    head: 'none',
    tail: { hidden: true },
    detail,
    poses,
    gear: (A) => {
      corgiHead(A, coat);
      fluffyBum(A, coat);
      shawl(A, t.main, trim ?? t.second, { r: 0.17, y: 0.15, low: 0.56 });
      bandanaKnot(A, t.main);
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.15, top: 0.14, bot: 0.18 });
      frisbee(A, t.main);
      treatPouch(A, t.main);
      extras(A);
    },
  };
}
