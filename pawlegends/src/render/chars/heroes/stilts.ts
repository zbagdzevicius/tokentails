/**
 * Stilts (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.4 "Chibi", "Moves and VFX"): everything the
 * render needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The silhouette from the iso camera is a stick: the tallest, thinnest cat in the game (a lanky spotted Savannah,
 * narrow body, a small head), with huge upright ears tipped with tufts (the shape that reads first from above), long
 * legs in striped team-coloured leg-warmers (they draw the eye down the shin, so the legs read longer), a long low whip
 * tail and a team-coloured scarf wrapped round the neck whose two long ends stream out behind her (the team read,
 * with the small mantle under it). A bell on her collar. No rig code: real leg and neck length is later polish.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import type { ChibiSpec, CoatSpec } from '../chibi';
import { mat, mix, SPOT_FREQ, type Assembly, type Col } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

/** Idle on her toes, ready; runs in a long bounding stride; casts with a boop; attacks with claws. */
export const MOTION: MotionProfile = { idle: 'ready', run: 'stand', cast: 'boop', attack: 'claw', stride: 1.35 };
/**
 * Standing height (m) in the match: the tallest cat. The spec's 2.95 put her ear tips level with Clem's bow (her lite
 * head is small, so less of her model is head); 3.2 makes her the tallest cat on the field (only Sir Brutus's plume
 * and Lambo's bulk stand higher).
 */
export const HEIGHT = 3.2;
/** Top of the bind-pose bounds (m: the ear tufts), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 3.23;
/** Relation ring under her (m). */
export const RING = 1.95;
export const COLOR_CSS = '#c9874a';
/** A whippy tail and twitchy radar ears. */
export const SPRINGS: SpringTuning = { tail: { k: 220, c: 13, lag: 0.6 }, ears: { k: 180, c: 12, lag: 0 } };
export const ULT_NAME = 'Zoomies!';
/** Cast accent: terracotta, not the gold-family SAND colour (combat-vfx.test: yellow means you). */
export const ACCENT: number | null = 0xd9734a;

const COAT: CoatSpec = { pattern: 'spots', base: 0xd9a66b, deep: 0x3a2a1c, light: 0xf2dcbc, cream: 0xfaf0e0, spotFreq: SPOT_FREQ };
/** Collar leather and the brass bell. */
const COLLAR = 0x5a3424;
const BELL = 0xf2c94c;
/** The long, low whip tail: out behind her near hip height, a flick up at the tip (root space, H). */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.25, -0.12], [0.03, 0.2, -0.3], [0.07, 0.19, -0.48], [0.1, 0.27, -0.6]];

const rgbOf = G.rgbOf;

/** Lynx-style tufts: a dark cone standing on each ear tip (the ears are 2× a normal cat's). */
export function earTufts(A: Assembly, color: Col): void {
  const s = A.spec.ears?.size ?? 1;
  for (const e of ['earL', 'earR'] as const) A.add(e, new THREE.ConeGeometry(0.014 * s, 0.045 * s, A.seg(5, 4)), { m: mat([0, 0.15 * s + 0.005, -0.004], [0.08, 0, 0]), color });
}

/**
 * Striped leg-warmers on both shins (knee bones) and a cuff over each ankle, in the team colour with `stripe` bands.
 * Ribbed tubes that run the whole shin: the eye follows them down, so her legs read longer.
 */
export function legWarmers(A: Assembly, color: Col, stripe: Col): void {
  const c = rgbOf(color);
  const s = rgbOf(stripe);
  for (const side of ['L', 'R'] as const) {
    const tube = new THREE.CylinderGeometry(0.06, 0.068, 0.13, A.seg(9, 6), A.seg(4, 2), true);
    A.add(`knee${side}`, tube, { m: mat([0, -0.06, 0.002]), color: (_v, _n, lp) => (Math.abs(lp.y) < 0.012 || lp.y > 0.052 ? s : c) });
    // the slouched cuff at the ankle (a soft torus) and a rolled top at the knee
    A.add(`knee${side}`, new THREE.TorusGeometry(0.066, 0.016, 3, A.seg(10, 6)), { m: mat([0, -0.122, 0.004], [Math.PI / 2, 0, 0]), color: c });
    A.add(`knee${side}`, new THREE.TorusGeometry(0.06, 0.012, 3, A.seg(10, 6)), { m: mat([0, 0.004, 0.002], [Math.PI / 2, 0, 0]), color: s });
  }
}

/** A thin leather collar with a brass bell under the chin. */
export function bellCollar(A: Assembly, band: Col, bell: Col): void {
  const w = A.w;
  A.add('chest', new THREE.TorusGeometry(0.085 * w + 0.01, 0.011, 3, A.seg(14, 8)), { m: mat([0, 0.235, 0.0], [Math.PI / 2 + 0.25, 0, 0], [1.05, 1, 1]), color: band });
  A.add('chest', new THREE.SphereGeometry(0.03, A.seg(8, 5), A.seg(6, 4)), { m: mat([0, 0.2, 0.115]), color: bell });
  A.add('chest', new THREE.TorusGeometry(0.03, 0.006, 3, A.seg(8, 5)), { m: mat([0, 0.2, 0.115], [Math.PI / 2, 0, 0]), color: mix(rgbOf(bell), [0, 0, 0], 0.35) });
}

/**
 * A double-sided cloth ribbon along `pts` (bone space), `half` wide, narrowing to `tip` × half at the end, with a
 * `hem` band over the last share `hemK` of its length. Its flat face looks back (it hangs down her back like cloth,
 * not out sideways like a board) and turns `twist` rad along its length, with a soft ripple in the width.
 */
function ribbon(A: Assembly, pts: readonly (readonly [number, number, number])[], half: number, tip: number, twist: number, color: Col, hem: Col, hemK: number): void {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const n = A.seg(12, 7);
  const pos: number[] = [];
  const ts: number[] = [];
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const back = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    side.crossVectors(tan, back).normalize().applyAxisAngle(tan, twist * t);
    const h = half * (1 - (1 - tip) * t) * (1 + 0.12 * Math.sin(t * Math.PI * 3));
    pos.push(p.x - side.x * h, p.y - side.y * h, p.z - side.z * h, p.x + side.x * h, p.y + side.y * h, p.z + side.z * h);
    ts.push(t, t);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const c = rgbOf(color);
  const hc = rgbOf(hem);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  G.both(A, 'chest', g, undefined, (_v, _n, _lp, i) => (ts[i] > 1 - hemK ? hc : c));
}

/**
 * The team scarf: a thick wrap round the neck, a knot at the side and two long ends draped down her back from the
 * knot, flaring back and out a little at the hem (the "trailing" read without boards sticking out of her neck).
 */
export function scarf(A: Assembly, color: Col, hem: Col): void {
  const w = A.w;
  A.add('chest', new THREE.TorusGeometry(0.105 * w + 0.015, 0.038, A.seg(6, 4), A.seg(14, 8)), { m: mat([0, 0.19, -0.005], [Math.PI / 2 + 0.12, 0, 0], [1.05, 1, 1]), color });
  A.add('chest', new THREE.SphereGeometry(0.045, A.seg(7, 5), A.seg(5, 4)).scale(1, 0.8, 0.9), { m: mat([0.1 * w + 0.02, 0.17, -0.07]), color });
  ribbon(A, [[0.09, 0.16, -0.1], [0.1, 0.08, -0.15], [0.13, -0.02, -0.19], [0.17, -0.11, -0.25]], 0.062, 0.75, 0.5, color, hem, 0.16);
  ribbon(A, [[0.06, 0.15, -0.11], [0.04, 0.07, -0.15], [0.05, -0.01, -0.18], [0.03, -0.07, -0.22]], 0.055, 0.8, -0.4, color, hem, 0.2);
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const scarfColor = founder || chroma !== null ? capeColor : t.main;
  return {
    // the thinnest body in the game, a small head, ears standing straight up (no splay)
    rig: { width: 0.78, tier: 'lite', headScale: 0.9, bodyScale: 0.9, earsLow: 0, earSplay: -0.06, tailCurve: TAIL },
    coat: lc ? { pattern: 'spots', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light, spotFreq: SPOT_FREQ } : COAT,
    eyes: { inner: 0xd8e86a, outer: 0x8fae2c, ring: 0x2c3a14, size: 1.1 },
    earInner: 0xe8b0a0,
    nose: 0x8a4a3a,
    head: 'cat',
    ears: { size: 1.6 },
    cheeks: 0.6,
    face: 1.35,
    whiskers: true,
    tail: { thick: 0.7 },
    detail,
    poses,
    gear: (A) => {
      earTufts(A, lc ? lc.dark : COAT.deep);
      G.mantle(A, t.main, trim ?? t.second, { r: 0.2, drop: 0.25 });
      scarf(A, scarfColor, founder ? capeHem : (trim ?? t.second));
      bellCollar(A, COLLAR, BELL);
      legWarmers(A, t.main, trim ?? t.second);
      extras(A);
    },
  };
}
