/**
 * Frankie (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1.2 "Art brief"): everything the render
 * needs that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The hot dog: a dachshund in a hot-dog costume. From the iso camera he is "the hot dog": the lowest and longest hero,
 * his long red-brown body leaning low on very short bent legs (his own `weenieStand` crouch), lying inside two
 * toasted bun halves along his flanks (a few sesame seeds on top), a thick squiggle of "mustard" in team colour down his back (the team read, with a small team shawl at the neck), a
 * long tapered muzzle with a shiny black nose, long soft floppy ears, worried tan eyebrow dots, and a short thin tail
 * poking out of the back of the bun. The bun is never team-coloured: bread must read as bread.
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
 * His poses: the low sausage crouch (the body leaning well forward on very short bent legs, so his back and the
 * mustard face the camera and he is the lowest hero), the bark (chest up, front paws lifted), and the tuck for the roll.
 */
export const POSES: Record<string, PoseDef> = {
  weenieStand: {
    body: { p: [0, -0.05, -0.02] },
    joints: { hips: [0.3, 0, 0], chest: [0.18, 0, 0], head: [-0.45, 0, 0], thighL: [-0.8, 0.08, 0.1], thighR: [-0.8, -0.08, -0.1], kneeL: [1.05, 0, 0], kneeR: [1.05, 0, 0], footL: [-0.3, 0.2, 0], footR: [-0.3, -0.2, 0] },
    arms: { L: { fk: { shoulder: [-1.0, 0, 0.16], elbow: [-0.2, 0, 0] } }, R: { fk: { shoulder: [-1.0, 0, -0.16], elbow: [-0.2, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  weenieBark: {
    body: { p: [0, -0.06, -0.02] },
    joints: { hips: [0.2, 0, 0], chest: [-0.05, 0, 0], head: [-0.45, 0, 0], thighL: [-0.85, 0.08, 0.1], thighR: [-0.85, -0.08, -0.1], kneeL: [1.15, 0, 0], kneeR: [1.15, 0, 0], footL: [-0.3, 0.2, 0], footR: [-0.3, -0.2, 0] },
    arms: { L: { fk: { shoulder: [-1.5, 0, 0.3], elbow: [-0.6, 0, 0] } }, R: { fk: { shoulder: [-1.5, 0, -0.3], elbow: [-0.6, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // tucked into the bun for the Weenie Roll: the body level, head down, legs and paws pulled in
  weenieTuck: {
    body: { p: [0, 0.02, -0.1], r: [Math.PI / 2, 0, 0] },
    joints: { head: [-0.4, 0, 0], thighL: [-2.0, 0, 0.1], thighR: [-2.0, 0, -0.1], kneeL: [1.6, 0, 0], kneeR: [1.6, 0, 0], earL: [0.4, 0, 0], earR: [0.4, 0, 0] },
    arms: { L: { fk: { shoulder: [-2.2, 0, 0.1], elbow: [-1.4, 0, 0] } }, R: { fk: { shoulder: [-2.2, 0, -0.1], elbow: [-1.4, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle crouches low, runs on a fast short-legged scurry, casts with a bark, attacks with a quick lunge-nip (claw). */
export const MOTION: MotionProfile = { idle: 'weenieStand', run: 'weenieStand', cast: 'weenieBark', attack: 'claw', stride: 1.5 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.4;
/** Top of the bind-pose bounds (m: the ear tops), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.28;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.frankie.ring;
export const COLOR_CSS = '#d4a017';
/** A short thin tail that wags fast, and long soft ears that swing. */
export const SPRINGS: SpringTuning = { tail: { k: 260, c: 8, lag: 0.2 }, ears: { k: 70, c: 6, lag: 0 } };
export const ULT_NAME = 'FOOTLONG!';
/** Cast accent (combat-vfx.test: no gold-family colour; the mustard is his hero colour, never an effect colour). */
export const ACCENT: number | null = 0xff7a5c;

/** Smooth red-brown, tan lower face and paws (the cream). */
const COAT: CoatSpec = { pattern: 'solid', base: 0x9c4a1f, deep: 0x6e3214, light: 0xc87a46, cream: 0xe0a070 };
const BUN = 0xd99a4e;
const BUN_TOP = 0xb8692a;
const BUN_CRUMB = 0xf2cc8a;
const SESAME = 0xfff2d2;
const EAR = 0x6e3214;
/** A short thin tail straight out of the back of the bun. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.1, -0.13], [0, 0.07, -0.22], [0, 0.07, -0.3], [0, 0.09, -0.36]];

/**
 * The dachshund head: a long tapered muzzle on a narrow skull, a big shiny black nose at the tip, round worried eyes
 * under two tan eyebrow dots (always a little concerned about the costume), tan cheeks, and long soft floppy ears.
 */
function dachshundHead(A: Assembly, coat: CoatSpec): void {
  const red = C(coat.base as number);
  const deep = C(coat.deep as number);
  const tan = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(red, deep, smooth(0.02, -0.12, lp.z) * 0.35);
    // the worried eyebrow dots
    const dot = Math.hypot(Math.abs(lp.x) - 0.055, lp.y - 0.245) < 0.019 && lp.z > 0.07 ? 1 : 0;
    // tan cheeks and throat
    const cheek = smooth(0.13, 0.1, lp.y) * smooth(0.0, 0.06, lp.z) * 0.8;
    return mixC(c, tan, Math.max(dot, cheek));
  };
  A.add('head', new THREE.SphereGeometry(0.142, A.seg(20, 10), A.seg(14, 8)).scale(1.02, 0.96, 1.12).translate(0, 0.175, -0.005), { color: skin });
  // the long tapered muzzle, a tan underside
  const muzzle = new THREE.CylinderGeometry(0.032, 0.066, 0.2, A.seg(12, 7), 1).rotateX(Math.PI / 2).scale(1, 0.85, 1);
  A.add('head', muzzle, { m: mat([0, 0.122, 0.2], [0.08, 0, 0]), color: (_v, _n, lp) => mixC(red, tan, smooth(0.01, -0.02, lp.y)) });
  dogNose(A, [0, 0.13, 0.305], 0.03);
  faceLine(A, [[-0.04, 0.098, 0.2], [-0.015, 0.092, 0.26], [0, 0.094, 0.28]], 0.0042, 0x3a1e18);
  faceLine(A, [[0.04, 0.098, 0.2], [0.015, 0.092, 0.26], [0, 0.094, 0.28]], 0.0042, 0x3a1e18);
  dogEyes(A, { inner: 0x6a3a1c, outer: 0x2a140a, ring: 0x100806 }, { x: 0.064, y: 0.188, z: 0.13, r: 0.046 }, { wet: true });
  // long soft floppy ears hanging beside the head, darker red
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    A.add(`ear${s}`, new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(8, 5)).scale(0.8, 1.6, 0.32), { m: mat([sign * 0.075, -0.06, 0.02], [0.1, 0, sign * 0.85]), color: EAR });
  }
}

/**
 * The bun: two toasted halves along his flanks from shoulder to hip (darker toast on top, a crumb-pale inside), with a
 * few sesame seeds. On the chest bone, so the bun travels with the body.
 */
function bun(A: Assembly): void {
  const w = A.w;
  for (const s of [1, -1]) {
    const half = new THREE.CapsuleGeometry(0.1, 0.26, 3, A.seg(12, 8)).scale(0.8, 1, 1.15);
    A.add('chest', half, {
      m: mat([s * 0.215 * w, -0.03, 0.015]),
      color: (_v, n, lp) => (lp.x * s < -0.02 ? C(BUN_CRUMB) : mixC(C(BUN), C(BUN_TOP), smooth(-0.2, 0.6, -n.z * 0.6 + Math.abs(n.x) * 0.2))),
    });
    // sesame seeds along the back of each half (the side the camera sees)
    for (let k = 0; k < 4; k++) {
      A.add('chest', new THREE.SphereGeometry(0.013, 4, 3).scale(1, 0.5, 1.6), { m: mat([s * (0.215 * w + 0.025 * ((k % 2) - 0.5)), -0.15 + k * 0.085, -0.09], [0.3, 0, 0]), color: SESAME });
    }
  }
}

/** The mustard: a thick squiggle down his back in team colour (a tube along a sine curve), the team read from above. */
function mustard(A: Assembly, color: Col): void {
  const pts: THREE.Vector3[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 3) * 0.06 * A.w, 0.2 - t * 0.38, -0.162 + Math.sin(t * Math.PI) * -0.012));
  }
  A.add('chest', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), A.seg(28, 14), 0.035, A.seg(6, 4), false), { color });
  for (const p of [pts[0], pts[n]]) A.add('chest', new THREE.SphereGeometry(0.035, A.seg(6, 4), A.seg(4, 3)), { m: mat([p.x, p.y, p.z]), color });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.35, tier: 'hero', headScale: 1.0, bodyScale: 1.05, earsLow: 0.8, tailCurve: TAIL },
    coat,
    eyes: { inner: 0x6a3a1c, outer: 0x2a140a, ring: 0x100806 },
    earInner: EAR,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 0.55 },
    detail,
    poses,
    gear: (A) => {
      dachshundHead(A, coat);
      bun(A);
      mustard(A, t.main);
      shawl(A, t.main, trim ?? t.second, { r: 0.155, y: 0.16, low: 0.4 });
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.16, top: 0.12, bot: 0.16 });
      extras(A);
    },
  };
}
