/**
 * Pixel (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.2 "Chibi", "Moves and VFX"): everything the
 * render needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Cap Cannon look) read the constants exported here. Import only types from
 * specs.ts (it imports this module).
 *
 * The silhouette is a square: a tiny tuxedo kitten (kid rig, big head) standing in an open kraft cardboard box that
 * is her whole torso. The four box flaps fold out and up in the team colour (the patch the iso camera reads), a tape
 * stripe crosses the front, a bottle-cap cannon sits in her right paw, an antenna with a red bead stands on her head
 * and stubby brown boots poke out under the box.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'aim', attack: 'shoot', aim: 'aim', stride: 0.85 };
/** Standing height (m) in the match. */
export const HEIGHT = 2.3;
/** Top of the bind-pose bounds (m: the antenna bead), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.5;
/** Relation ring under her (m). */
export const RING = 1.9;
export const COLOR_CSS = '#7fc8e8';
export const SPRINGS: SpringTuning = { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 160, c: 12, lag: 0 } };
export const ULT_NAME = 'BOXBOT!';
/** Cast accent; null = her element colour (ICE). */
export const ACCENT: number | null = null;
/** Cap Cannon's bolt (projectileView look): size (m), height (m), colour (a red bottle cap), trail size. */
export const SHOT: readonly [number, number, number, number] = [0.32, 1.0, 0xd83a3a, 0.16];

/** Kraft cardboard and its fold shading. */
export const KRAFT = 0xc49a6c;
const KRAFT_EDGE = 0x9a7448;
const CANNON = 0x8d9aa6;
const CAP_RED = 0xd83a3a;
const BOOT = 0x6b4429;

const COAT: CoatSpec = { pattern: 'tuxedo', base: 0x2a2a33, deep: 0x16161c, light: 0xf4f4f4, cream: 0xf4f4f4 };

/** A two-sided wall (the outside in `color`, the inside darker). */
const panel = (A: Assembly, w: number, h: number, m: THREE.Matrix4, color: Col): void => G.both(A, 'hips', new THREE.PlaneGeometry(w, h), m, color);

/** The chest joint's rest height over the hips (skeleton.ts PROPORTIONS.chestY): the box rim sits this much higher. */
const CHEST_Y = 0.085;

/**
 * Pixel's cardboard box (~300 tris): one open box on the hips bone from her knees up to under her chin, so the torso
 * is a square from every side and stays one rigid shape (two boxes on the chest and hips bones slid apart whenever
 * the chest leaned or turned). Four flaps hinged on the rim fold out and up in `flap` (the team colour the iso
 * camera reads), a `flap` tape stripe across the front, darker fold edges. `k` scales the whole box.
 */
export function cardboardBox(A: Assembly, kraft: Col, flap: Col, k = 1): void {
  const hx = 0.23 * k;
  const hz = 0.21 * k;
  const top = CHEST_Y + 0.17;
  const h = 0.385 * k;
  const cy = top - h / 2;
  // four walls (front +Z, back, left +X, right)
  panel(A, hx * 2, h, mat([0, cy, hz]), kraft);
  panel(A, hx * 2, h, mat([0, cy, -hz], [0, Math.PI, 0]), kraft);
  panel(A, hz * 2, h, mat([hx, cy, 0], [0, Math.PI / 2, 0]), kraft);
  panel(A, hz * 2, h, mat([-hx, cy, 0], [0, -Math.PI / 2, 0]), kraft);
  // fold edges: thin dark bars on the four vertical corners
  for (const sx of [1, -1]) for (const sz of [1, -1]) A.add('hips', new THREE.BoxGeometry(0.018, h, 0.018), { m: mat([sx * hx, cy, sz * hz]), color: KRAFT_EDGE });
  // the flaps: hinged on the rim, folded out and up (35° above level); long sides on the front and back
  const tilt = 0.6;
  const fl = 0.17 * k;
  const flapAt = (len: number, x: number, z: number, yaw: number): THREE.Matrix4 =>
    mat([x, top, z], [0, yaw, 0]).multiply(mat([0, 0, 0], [-(Math.PI / 2 - tilt), 0, 0])).multiply(mat([0, fl / 2, 0])).multiply(new THREE.Matrix4().makeScale(len, 1, 1));
  const g = new THREE.PlaneGeometry(1, fl);
  for (const [len, x, z, yaw] of [[hx * 2, 0, hz, 0], [hx * 2, 0, -hz, Math.PI], [hz * 2, hx, 0, Math.PI / 2], [hz * 2, -hx, 0, -Math.PI / 2]] as const) {
    G.both(A, 'hips', g, flapAt(len, x, z, yaw), flap, flap);
  }
  // packing tape down the front
  A.add('hips', new THREE.PlaneGeometry(0.07, h), { m: mat([0.06, cy, hz + 0.004]), color: flap });
}

/** The bottle-cap cannon on the weapon socket: a grey tube with a red cap loaded in the muzzle. */
function capCannon(A: Assembly): void {
  A.add('weapon', new THREE.CylinderGeometry(0.05, 0.055, 0.24, A.seg(10, 6)), { m: mat([0, 0.1, 0.02]), color: CANNON });
  A.add('weapon', new THREE.TorusGeometry(0.052, 0.012, 3, A.seg(10, 6)), { m: mat([0, 0.21, 0.02], [Math.PI / 2, 0, 0]), color: G.STEEL_DARK });
  A.add('weapon', new THREE.CylinderGeometry(0.044, 0.044, 0.02, A.seg(10, 6)), { m: mat([0, 0.225, 0.02]), color: CAP_RED });
}

/**
 * BOXBOT's robot legs (~110 tris): a grey accordion tube with a flat foot on each thigh bone, built pointing UP (thigh
 * space +y), so at rest it lies folded inside the box beside her body. The BOXBOT clips (moves/pixel.ts ROBOT_LEGS)
 * turn the thighs a half turn: the tubes swing down out of the box as legs (her own short legs fold up inside it)
 * and the root lift stands the bigger box on them. LEG_TUBE is the length the lift was set for.
 */
export const LEG_TUBE = 0.3;
function robotLegs(A: Assembly): void {
  for (const s of ['L', 'R'] as const) {
    const bone = `thigh${s}` as const;
    A.add(bone, new THREE.CylinderGeometry(0.048, 0.048, LEG_TUBE - 0.03, A.seg(8, 6), 1, true), { m: mat([0, (LEG_TUBE - 0.03) / 2, 0]), color: CANNON });
    for (let i = 1; i <= 3; i++) A.add(bone, new THREE.TorusGeometry(0.05, 0.011, 3, A.seg(8, 6)), { m: mat([0, (i * LEG_TUBE) / 4, 0], [Math.PI / 2, 0, 0]), color: G.STEEL_DARK });
    A.add(bone, new THREE.BoxGeometry(0.11, 0.03, 0.14), { m: mat([0, LEG_TUBE - 0.015, -0.02]), color: G.STEEL_DARK });
  }
}

/** The antenna: a wire on the crown with a red bead. */
function antenna(A: Assembly): void {
  A.add('head', new THREE.CylinderGeometry(0.008, 0.008, 0.11, 4), { m: mat([0.05, 0.31, -0.03], [0, 0, -0.18]), color: 0x3a3a44 });
  A.add('head', new THREE.SphereGeometry(0.032, A.seg(8, 5), A.seg(6, 4)), { m: mat([0.062, 0.37, -0.03]), color: CAP_RED });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, extras, poses, lc } = dr;
  return {
    // a kid rig with a big head on a box torso. The spec's headScale 1.35 / bodyScale 0.8 put the neck joint only 0.19 H
    // over the hips (chars.test "upright" needs 0.25 H): 1.15 on a full-size body keeps the big kid head and passes.
    rig: { width: 0.85, tier: 'kid', headScale: 1.15, bodyScale: 1, earSplay: 0.1 },
    coat: lc ? { pattern: 'tuxedo', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT,
    eyes: { inner: 0xbfe8ff, outer: 0x4fa8d9, ring: 0x1a3a5a, size: 1.3 },
    earInner: 0xffb3c8,
    nose: 0xff9fb1,
    head: 'cat',
    ears: { size: 1.12 },
    cheeks: 0.7,
    face: 1.35,
    whiskers: true,
    tail: { thick: 0.85 },
    armoured: { body: true, feet: true },
    detail,
    poses,
    gear: (A) => {
      cardboardBox(A, KRAFT, t.main);
      capCannon(A);
      antenna(A);
      G.boots(A, BOOT, 0x4a2e1f);
      robotLegs(A);
      extras(A);
    },
  };
}
