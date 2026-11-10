/**
 * Howler (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.5 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The screamer: a Siberian husky. From the iso camera he is tall and broad-chested (Stilts is the stick): a grey cap
 * and a white mask with the dark widow's peak and two white eyebrow dots, medium upright ears, ice-blue eyes (the
 * left one a bit bigger: the derp), a mouth that always hangs half open with the tongue lolling to one side (the
 * mouth sits on the `mouth` bone, so every scream clip opens it), and a thick sickle tail curled up. Team colour on
 * the sled harness (mantle, chest strap, back pad); booties on the front paws.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, dogEyes, dogNose, mixC, pointedEar, smooth, shawl } from './dogParts';

/** His poses: the loose sled-dog stand with the head tilted (the "huh?" husky look). */
export const POSES: Record<string, PoseDef> = {
  huskyStand: {
    joints: { hips: [0.05, 0, 0], chest: [-0.05, 0, 0], head: [-0.06, 0, -0.2], thighL: [-0.05, 0.1, 0.08], thighR: [-0.05, -0.1, -0.08], kneeL: [0.12, 0, 0], kneeR: [0.12, 0, 0], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    arms: { L: { fk: { shoulder: [-0.2, 0, 0.18], elbow: [-0.35, 0, 0] } }, R: { fk: { shoulder: [-0.2, 0, -0.18], elbow: [-0.35, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle stands with a head tilt, runs on a loping sled-dog stride, casts chin-up (cheer), attacks with a lunge bite (claw). */
export const MOTION: MotionProfile = { idle: 'huskyStand', run: 'huskyStand', cast: 'cheer', attack: 'claw', stride: 1.2 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.75;
/** Top of the bind-pose bounds (m: the ear tips), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.95;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.howler.ring;
export const COLOR_CSS = '#7a86a0';
/** A heavy, swinging plume of a tail and alert ears. */
export const SPRINGS: SpringTuning = { tail: { k: 90, c: 8, lag: 0.55 }, ears: { k: 140, c: 10, lag: 0 } };
export const ULT_NAME = 'THE SCREAM';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0xb6f0c8;

/** Husky grey over white (bib, belly, socks and the tail's underside from the solid pattern's cream). */
const COAT: CoatSpec = { pattern: 'solid', base: 0x8a8f99, deep: 0x4a4f59, light: 0xf2f4f7, cream: 0xffffff };
const MOUTH = 0x4a1e30;
const TONGUE = 0xf27a8e;
/** A thick sickle tail curled up over his back. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.24, -0.13], [0.02, 0.37, -0.27], [0.04, 0.53, -0.25], [0.02, 0.58, -0.13]];

/**
 * The husky head: a wolfish wedge with a grey cap darkening toward the back, the white mask over the face and cheeks,
 * the dark widow's peak between the eyes, two white eyebrow dots, a longer white muzzle with a black nose, ice-blue
 * eyes with small pupils (the left one bigger), the half-open mouth and lolling tongue on the mouth bone, and medium
 * upright ears with white fur inside.
 */
function huskyHead(A: Assembly, coat: CoatSpec): void {
  const grey = C(coat.base as number);
  const deep = C(coat.deep as number);
  const white = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(grey, deep, smooth(0.02, -0.12, lp.z) * 0.45 + smooth(0.26, 0.31, lp.y) * 0.25);
    // the mask: the face below the brow, and round the eyes
    let mask = smooth(0.215, 0.19, lp.y) * smooth(0.0, 0.06, lp.z);
    // the eyebrow dots
    const dot = Math.hypot(Math.abs(lp.x) - 0.06, lp.y - 0.245) < 0.022 && lp.z > 0.06 ? 1 : 0;
    // the widow's peak: a grey stripe down the forehead to between the eyes
    const peak = smooth(0.03, 0.015, Math.abs(lp.x)) * smooth(0.15, 0.19, lp.y);
    mask = Math.max(dot, mask * (1 - peak));
    return mixC(c, white, mask);
  };
  A.add('head', new THREE.SphereGeometry(0.15, A.seg(20, 10), A.seg(14, 8)).scale(1.12, 0.96, 1.06).translate(0, 0.17, 0), { color: skin });
  // white cheek ruffs
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.07, A.seg(9, 6), A.seg(7, 4)).scale(1, 0.9, 0.85).translate(s * 0.095, 0.1, 0.05), { color: white });
  // the longer wolf muzzle, white, a grey line along the bridge
  A.add('head', new THREE.SphereGeometry(0.068, A.seg(12, 7), A.seg(9, 5)).scale(0.92, 0.7, 1.4).translate(0, 0.115, 0.16), {
    color: (_v, _n, lp) => mixC(white, grey, smooth(0.14, 0.158, lp.y) * smooth(0.02, 0.008, Math.abs(lp.x)) * 0.8),
  });
  dogNose(A, [0, 0.142, 0.252], 0.026);
  dogEyes(A, { inner: 0xc8f2ff, outer: 0x3fa6e0, ring: 0x1a2a40 }, { x: 0.068, y: 0.188, z: 0.132, r: 0.044, rL: 0.05, rR: 0.04, pupil: 0.36 });
  // the half-open mouth (on the mouth bone: mouthOpen cues scale it for AWOO and THE SCREAM) and the lolling tongue
  A.add('mouth', new THREE.SphereGeometry(0.045, A.seg(10, 6), A.seg(7, 4)).scale(1.0, 0.6, 0.8), { m: mat([0, -0.012, 0.05]), color: MOUTH });
  A.add('mouth', new THREE.SphereGeometry(0.026, A.seg(8, 5), A.seg(6, 4)).scale(0.75, 1.35, 0.45), { m: mat([0.03, -0.042, 0.072], [0.3, 0, 0.35]), color: TONGUE });
  // medium upright ears: grey outside, white fur inside
  for (const s of ['L', 'R'] as const) pointedEar(A, s, { r: 0.068, h: 0.15, depth: 0.5, tilt: 0.18, lean: -0.05, outer: (_v, _n, lp) => mixC(grey, deep, 0.35 + smooth(0.08, 0.15, lp.y) * 0.3), inner: 0xf2f4f7, innerK: 0.68 });
}

/** The sled harness: a team mantle, a strap round the chest, the padded saddle on his back and a silver D-ring. */
function harness(A: Assembly, color: Col, trim: Col): void {
  const w = A.w;
  shawl(A, color, trim, { r: 0.2, y: 0.15 });
  A.add('chest', new THREE.TorusGeometry(0.162 * w, 0.02, 3, A.seg(16, 9)), { m: mat([0, 0.04, 0], [Math.PI / 2 + 0.12, 0, 0], [1, 0.95, 1]), color });
  A.add('chest', new THREE.BoxGeometry(0.2 * w, 0.18, 0.05), { m: mat([0, 0.1, -0.15], [-0.25, 0, 0]), color });
  A.add('chest', new THREE.TorusGeometry(0.022, 0.006, 3, 8), { m: mat([0, 0.19, -0.18], [-0.2, 0, 0]), color: 0xd0d6de });
}

/** Booties on his front paws (the team's deep colour), standing in for the paws. */
function booties(A: Assembly, color: Col): void {
  for (const s of ['L', 'R'] as const) {
    A.add(`paw${s}`, new THREE.SphereGeometry(0.053, A.seg(9, 6), A.seg(7, 5)).scale(1, 0.88, 1.08), { m: mat([0, -0.035, 0.006]), color });
    A.add(`paw${s}`, new THREE.CylinderGeometry(0.05, 0.05, 0.02, A.seg(9, 6), 1, true), { m: mat([0, 0.0, 0]), color: 0xf2f4f7 });
  }
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.05, tier: 'hero', headScale: 1.0, bodyScale: 1.08, earsLow: 0, tailCurve: TAIL },
    coat,
    eyes: { inner: 0xc8f2ff, outer: 0x3fa6e0, ring: 0x1a2a40 },
    earInner: 0xf2f4f7,
    nose: 0x1a1216,
    head: 'none',
    armoured: { paws: true },
    tail: { thick: 1.5 },
    detail,
    poses,
    gear: (A) => {
      huskyHead(A, coat);
      harness(A, t.main, trim ?? t.second);
      booties(A, t.deep);
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.28, top: 0.14, bot: 0.22 });
      extras(A);
    },
  };
}
