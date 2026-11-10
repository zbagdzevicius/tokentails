/**
 * Domino (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1.3 "Art brief"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The cute one: a dalmatian puppy. From the iso camera he is "the spotty one with the beret": a round white puppy with
 * twelve big black spots (flat discs on the body, head and legs; a coat skin tints them with its dark: liver, lemon),
 * black floppy ears, a round puppy skull with a short white muzzle, big round eyes with catchlights, one black spot
 * round his left eye (the classic look), a pink tongue, and a thin happy tail. Team colour
 * on the artist's beret (a flattened dome with a stalk) and the neckerchief; a fat crayon in his mouth (his "wand").
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import type { BoneName, PoseDef } from '../skeleton';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { blushDots, C, dogEyes, dogNose, faceLine, mixC, shawl, smooth } from './dogParts';

/** His poses: the puppy sit with a head tilt (idle) and a bouncy ready stance (run). */
export const POSES: Record<string, PoseDef> = {
  dalmSit: {
    body: { p: [0, -0.085, -0.02] },
    joints: { hips: [-0.16, 0, 0], chest: [0.06, 0, 0], head: [0.0, 0, -0.24], thighL: [-1.45, 0.25, 0.14], thighR: [-1.45, -0.25, -0.14], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0], footL: [-0.3, 0.3, 0], footR: [-0.3, -0.3, 0] },
    arms: { L: { fk: { shoulder: [-0.3, 0, 0.1], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [-0.3, 0, -0.1], elbow: [-0.3, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  dalmReady: {
    joints: { chest: [0.08, 0, 0], head: [-0.06, 0, 0.08], thighL: [-0.15, 0.1, 0.08], thighR: [-0.15, -0.1, -0.08], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], footL: [-0.1, 0.3, 0], footR: [-0.1, -0.3, 0] },
    arms: { L: { fk: { shoulder: [-0.6, 0, 0.22], elbow: [-0.8, 0, 0] } }, R: { fk: { shoulder: [-0.6, 0, -0.22], elbow: [-0.8, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle sits with a head tilt, runs on a bouncy puppy trot, casts waving the crayon (cheer), attacks with a head flick. */
export const MOTION: MotionProfile = { idle: 'dalmSit', run: 'dalmReady', cast: 'cheer', attack: 'paw', stride: 1.3 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.2;
/** Top of the bind-pose bounds (m: the beret's stalk), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.55;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.domino.ring;
export const COLOR_CSS = '#c23b5e';
/** A thin happy tail and soft floppy ears that bounce. */
export const SPRINGS: SpringTuning = { tail: { k: 150, c: 7, lag: 0.35 }, ears: { k: 70, c: 5, lag: 0 } };
export const ULT_NAME = 'CONNECT THE DOTS!';
/** Cast accent (combat-vfx.test: no gold-family colour): a starry lilac. */
export const ACCENT: number | null = 0xd8c8ff;

/** Clean white (the spots are added as discs: black, or a coat skin's dark). */
const COAT: CoatSpec = { pattern: 'solid', base: 0xf7f5f2, deep: 0xdcd8d2, light: 0xffffff, cream: 0xffffff };
const SPOT = 0x16141a;
const EAR = 0x1e1c22;
const TONGUE = 0xf27a8e;
const CRAYON = 0xe0405e;
const CRAYON_WRAP = 0xfff2e6;
/** A thin tail up and out with a happy curve. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.2, -0.13], [0, 0.3, -0.25], [0.02, 0.43, -0.3], [0.03, 0.52, -0.26]];

/**
 * The twelve spots: [bone, direction from the part's centre, radius]. Each is a flat disc set on the surface of its
 * part (the chest and hips ellipsoids, the skull, the limb capsules), facing out, so it reads from the front, the side
 * and the iso camera above.
 */
const SPOTS: readonly (readonly [BoneName, readonly [number, number, number], number])[] = [
  ['head', [-0.9, 0.15, -0.4], 0.046],
  ['head', [0.75, 0.25, -0.62], 0.04],
  ['chest', [0.5, -0.5, 0.72], 0.052],
  ['chest', [-0.92, -0.25, 0.2], 0.05],
  ['chest', [0.15, 0.2, -1], 0.058],
  ['hips', [-0.45, -0.15, 0.85], 0.046],
  ['hips', [0.95, 0.15, 0.1], 0.046],
  ['hips', [-0.3, 0.35, -0.9], 0.052],
  ['shoulderL', [0.3, 0, 1], 0.03],
  ['elbowR', [-0.3, 0, 1], 0.028],
  ['thighR', [-0.3, 0, 1], 0.034],
  ['kneeL', [0.3, 0, 1], 0.03],
];

/** Each part's ellipsoid: centre and radii in its bone's bind space (chibi.ts body, skull and limb sizes). */
function partOf(bone: BoneName, w: number): { c: readonly [number, number, number]; r: readonly [number, number, number] } {
  if (bone === 'head') return { c: [0, 0.17, 0], r: [0.18, 0.158, 0.164] };
  if (bone === 'chest') return { c: [0, 0, 0], r: [0.16 * w, 0.2, 0.147] };
  if (bone === 'hips') return { c: [0, 0.02, 0], r: [0.15 * w, 0.135, 0.143] };
  return { c: [0, -0.05, 0], r: [0.05, 0.08, 0.05] };
}

/** One flat spot disc on `bone` on its part's surface in direction `d` (a squashed sphere in the spot colour). */
function spot(A: Assembly, bone: BoneName, d: readonly [number, number, number], r: number, color: number): void {
  const { c, r: R } = partOf(bone, A.w);
  const n = new THREE.Vector3(d[0], d[1], d[2]).normalize();
  // the surface point along n: the ray from the centre meets the ellipsoid at t = 1 / |n / R|
  const t = 1 / Math.hypot(n.x / R[0], n.y / R[1], n.z / R[2]);
  // the outward normal at that point (gradient of the ellipsoid)
  const out = new THREE.Vector3(n.x / (R[0] * R[0]), n.y / (R[1] * R[1]), n.z / (R[2] * R[2])).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(c[0] + n.x * t, c[1] + n.y * t, c[2] + n.z * t), q, new THREE.Vector3(1, 1, 0.22));
  A.add(bone, new THREE.SphereGeometry(r, A.seg(8, 6), A.seg(4, 3)), { m, color });
}

/**
 * The dalmatian puppy head: a big round white skull, a short white muzzle with a black nose, big round eyes with
 * catchlights, the black spot round his left eye, a little smile with the pink tongue out, a blush, and black floppy
 * ears hanging beside his cheeks.
 */
function dalmatianHead(A: Assembly, coat: CoatSpec): void {
  const white = C(coat.base as number);
  const shade = C(coat.deep as number);
  const dark = C(SPOT);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(white, shade, smooth(0.0, -0.14, lp.z) * 0.4 + smooth(0.12, 0.04, lp.y) * 0.2);
    // the black patch round his left eye
    const patch = smooth(0.092, 0.078, Math.hypot(lp.x - 0.07, (lp.y - 0.195) * 0.95)) * smooth(0.06, 0.1, lp.z);
    return mixC(c, dark, patch);
  };
  A.add('head', new THREE.SphereGeometry(0.158, A.seg(20, 10), A.seg(14, 8)).scale(1.14, 1.0, 1.04).translate(0, 0.17, 0), { color: skin });
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(7, 4)).scale(1, 0.86, 0.85).translate(s * 0.092, 0.1, 0.065), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.062, A.seg(12, 7), A.seg(8, 5)).scale(1.05, 0.78, 1.05).translate(0, 0.108, 0.15), { color: white });
  dogNose(A, [0, 0.132, 0.21], 0.026);
  faceLine(A, [[-0.045, 0.1, 0.18], [-0.022, 0.086, 0.197], [0, 0.09, 0.204], [0.022, 0.086, 0.197], [0.045, 0.1, 0.18]], 0.005, 0x2a1418);
  A.add('head', new THREE.SphereGeometry(0.024, A.seg(8, 5), A.seg(6, 4)).scale(0.9, 0.55, 1.1), { m: mat([-0.012, 0.075, 0.2], [0.45, 0, 0]), color: TONGUE });
  dogEyes(A, { inner: 0x4a2e22, outer: 0x1e120c, ring: 0x0a0606 }, { x: 0.068, y: 0.192, z: 0.135, r: 0.048 }, { wet: true });
  blushDots(A, 0.1, 0.13, 0.115, 0.024);
  // black floppy ears hanging down beside the cheeks
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    A.add(`ear${s}`, new THREE.SphereGeometry(0.07, A.seg(10, 6), A.seg(8, 5)).scale(0.95, 1.35, 0.34), { m: mat([sign * 0.06, -0.05, 0.025], [0.15, 0, sign * 0.8]), color: EAR });
  }
}

/** The artist's beret: a team dome flattened over the crown, tipped to one side, a small stalk on top and a trim band. */
function beret(A: Assembly, color: Col, trim: Col): void {
  const at = mat([0.015, 0.29, -0.02], [-0.12, 0, -0.22], [1.25, 0.42, 1.2]);
  A.add('head', new THREE.SphereGeometry(0.15, A.seg(16, 9), A.seg(8, 5), 0, Math.PI * 2, 0, Math.PI * 0.62), { m: at, color });
  A.add('head', new THREE.TorusGeometry(0.15 * Math.sin(Math.PI * 0.62), 0.012, 3, A.seg(16, 9)), { m: at.clone().multiply(mat([0, Math.cos(Math.PI * 0.62) * 0.15, 0], [Math.PI / 2, 0, 0])), color: trim });
  A.add('head', new THREE.CylinderGeometry(0.008, 0.012, 0.05, 5), { m: mat([-0.005, 0.37, -0.03], [-0.1, 0, -0.3]), color });
}

/** The fat crayon held in his mouth: a red-pink stick with a paper wrap and a sharpened tip, poking out to his right. */
function crayon(A: Assembly): void {
  const at = mat([-0.06, 0.09, 0.19], [0, 0.2, Math.PI / 2 - 0.25]);
  A.add('head', new THREE.CylinderGeometry(0.02, 0.02, 0.15, A.seg(8, 6)), { m: at, color: CRAYON });
  A.add('head', new THREE.CylinderGeometry(0.021, 0.021, 0.07, A.seg(8, 6), 1, true), { m: at.clone().multiply(mat([0, 0.02, 0])), color: CRAYON_WRAP });
  A.add('head', new THREE.ConeGeometry(0.02, 0.04, A.seg(8, 6)), { m: at.clone().multiply(mat([0, -0.095, 0], [Math.PI, 0, 0])), color: CRAYON });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  // a coat skin changes the base (and the spots on liver and lemon coats take its dark); the default spots are black
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.light, light: lc.light, cream: lc.light } : COAT;
  const spotCol = lc ? lc.dark : SPOT;
  return {
    rig: { width: 1.15, tier: 'kid', headScale: 1.15, bodyScale: 1.1, earsLow: 0.7, tailCurve: TAIL },
    coat,
    eyes: { inner: 0x4a2e22, outer: 0x1e120c, ring: 0x0a0606 },
    earInner: EAR,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 0.85 },
    detail,
    poses,
    gear: (A) => {
      dalmatianHead(A, coat);
      for (const [b, d, r] of SPOTS) spot(A, b, d, r, spotCol);
      beret(A, t.main, trim ?? t.second);
      shawl(A, t.main, trim ?? t.second, { r: 0.17, y: 0.15, low: 0.5 });
      crayon(A);
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.2, top: 0.13, bot: 0.18 });
      extras(A);
    },
  };
}
