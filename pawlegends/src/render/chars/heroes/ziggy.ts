/**
 * Ziggy (sim v29, original cat; build spec docs/plans/moba/ROSTER-V29.md §2.2 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The silhouette is "the lightning bolt": a lean golden Bengal with dark rosettes in a sprinter's crouch, two big
 * yellow lightning-bolt shapes standing up off his back like fins (the read from the iso camera, and no other hero has
 * a zig-zag outline), a team headband with two long tails streaming back, and spark claws on both paws.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { SPOT_FREQ } from '../chibi';

/** His poses: the sprinter's crouch (weight forward, claws low and wide, ready to zig). */
export const POSES: Record<string, PoseDef> = {
  zigReady: {
    body: { p: [0, -0.03, 0] },
    joints: { hips: [0.16, 0, 0], chest: [0.12, 0, 0], head: [-0.2, 0, 0], thighL: [-0.42, 0.14, 0.12], thighR: [-0.3, -0.14, -0.12], kneeL: [0.6, 0, 0], kneeR: [0.5, 0, 0], footL: [-0.18, 0.32, 0], footR: [-0.2, -0.32, 0] },
    arms: {
      L: { paw: [0.22, 0.28, 0.18], pole: [1, -0.6, -0.3], twist: [0.4, 0, -0.4] },
      R: { paw: [-0.22, 0.3, 0.2], pole: [-1, -0.6, -0.3], twist: [0.4, 0, 0.4] },
    },
    sword: { mode: 'hidden' },
  },
};

/** Idle and run in the crouch; cast 'twirl', attack 'claw'. */
export const MOTION: MotionProfile = { idle: 'zigReady', run: 'zigReady', cast: 'twirl', attack: 'claw', stride: 1.35 };
export const HEIGHT = 2.5;
/** Top of the bind-pose bounds (m: the bolt tips), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.75;
export const RING = HERO_BUILD.ziggy.ring;
export const COLOR_CSS = '#ffd84a';
/** A whippy tail and twitchy ears. */
export const SPRINGS: SpringTuning = { tail: { k: 220, c: 9, lag: 0.25 }, ears: { k: 260, c: 14, lag: 0 } };
export const ULT_NAME = 'ZIGZAG STORM';
/** Cast accent: electric cyan (combat-vfx.test: no gold-family colour; the yellow bolts are his hero colour). */
export const ACCENT: number | null = 0x7fe8ff;

const COAT: CoatSpec = { pattern: 'spots', base: 0xe8a640, deep: 0x4a2a12, light: 0xfff0d0, cream: 0xfff0d0, spotFreq: SPOT_FREQ };
const BOLT = 0xffe14a;
const BOLT_RIM = 0xff8a1e;

/** A flat zig-zag lightning bolt (an extruded 2D shape), `h` tall, on `bone` placed by `m`. */
function bolt(A: Assembly, bone: 'chest' | 'head' | 'hips', h: number, m: THREE.Matrix4, color: Col): void {
  const s = new THREE.Shape();
  const k = h;
  s.moveTo(0.05 * k, 1 * k);
  s.lineTo(-0.22 * k, 0.42 * k);
  s.lineTo(0.02 * k, 0.46 * k);
  s.lineTo(-0.1 * k, 0);
  s.lineTo(0.24 * k, 0.6 * k);
  s.lineTo(0.0, 0.56 * k);
  s.lineTo(0.18 * k, 1 * k);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false });
  g.translate(0, 0, -0.0125);
  A.add(bone, g, { m, color });
}

/** The headband: a team band round the brow and two tails streaming back off the knot. */
function headband(A: Assembly, color: Col): void {
  A.add('head', new THREE.TorusGeometry(0.15, 0.02, A.seg(5, 3), A.seg(16, 9)), { m: mat([0, 0.21, 0], [Math.PI / 2 + 0.25, 0, 0], [1.03, 1, 1]), color });
  for (const s of [1, -1]) {
    A.add('head', new THREE.BoxGeometry(0.03, 0.012, 0.16), { m: mat([s * 0.035, 0.2, -0.22], [0.5, s * 0.25, 0]), color });
  }
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'spots', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light, spotFreq: SPOT_FREQ } : COAT;
  const boltCol = chroma ?? BOLT;
  return {
    rig: { width: 0.95, tier: 'hero', headScale: 1.22, earSplay: 0.1, tailCurve: [[0.02, 0.22, -0.13], [0.12, 0.3, -0.24], [0.08, 0.44, -0.3], [0.16, 0.56, -0.26]] },
    coat,
    // green Bengal eyes
    eyes: { inner: 0xd8ff8a, outer: 0x5fae3a, ring: 0x1e3a14, size: 1.12 },
    earInner: 0xf0a890,
    nose: 0xc8705a,
    head: 'cat',
    ears: { size: 1.15 },
    cheeks: 0.7,
    face: 1.35,
    whiskers: true,
    tail: { thick: 0.9 },
    detail,
    poses,
    gear: (A) => {
      G.mantle(A, t.main, trim ?? BOLT_RIM, { r: 0.2 });
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.26 });
      headband(A, t.main);
      // the two bolts off his back, splayed a little, and a small one on the chest
      bolt(A, 'chest', 0.5, mat([0.1, 0.12, -0.17], [-0.2, 0.15, -0.35]), boltCol);
      bolt(A, 'chest', 0.42, mat([-0.1, 0.1, -0.16], [-0.2, -0.15, 0.4]), boltCol);
      bolt(A, 'chest', 0.1, mat([0, 0.02, 0.17], [0.1, 0, 0]), BOLT_RIM);
      G.clawGauntlets(A, t.main, BOLT, 1);
      extras(A);
    },
  };
}
