/**
 * Shared head parts for the sim v14 dogs (Nugget, Marshmallow, Bravo, Chili, Howler): render only. beast.ts keeps
 * Sir Brutus's and Cacklejaw's recipes untouched (DOGS-V13 §7 lane RENDER); these are the PPK-chibi pieces the five
 * new heads share: big glossy dog eyes (two catchlights, so they read as cute at lobby scale and as two bright dots
 * from the iso camera), pointed or rounded ears on the ear bones, and a few small face helpers.
 *
 * Head space: skull centre (0, 0.165, 0), facing +Z (skeleton.ts FACE). Ear bones sit at (±0.132, 0.256, −0.014),
 * tilted 0.45 rad outward: an ear's `tilt` turns it back toward upright (+) or splays it further out (−).
 */
import * as THREE from 'three';
import { FACE } from '../skeleton';
import { C, mat, mix, type Assembly, type Col, type RGB } from '../chibi';


export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface DogEyeColours {
  inner: number;
  outer: number;
  ring: number;
  pupil?: number;
}

/**
 * Round glossy dog eyes on the eye bones (blinks scale them): a big pupil, an iris ring, a dark rim, one big and one
 * small catchlight (a third, lower one with `wet`: Bravo's puppy-dog eyes). `rL` / `rR` give the two eyes their own
 * size (Howler's derp eye); `pupil` is the pupil share of the radius (0.48 default; huskies run smaller).
 */
export function dogEyes(
  A: Assembly,
  e: DogEyeColours,
  at: { x: number; y: number; z: number; r: number; rL?: number; rR?: number; pupil?: number; turn?: number },
  o: { wet?: boolean; flat?: number } = {},
): void {
  const inner = C(e.inner);
  const outer = C(e.outer);
  const ring = C(e.ring);
  const pupil = C(e.pupil ?? 0x140c10);
  const pk = at.pupil ?? 0.5;
  for (const side of [1, -1]) {
    const bone = side > 0 ? 'eyeL' : 'eyeR';
    const r = side > 0 ? (at.rL ?? at.r) : (at.rR ?? at.r);
    const m = mat([side * at.x - FACE.eyeL[0] * side, at.y - FACE.eyeL[1], at.z - FACE.eyeL[2]], [-0.06, side * (at.turn ?? 0.32), 0], [1, 1, o.flat ?? 0.62]);
    A.add(bone, new THREE.SphereGeometry(r, A.seg(12, 8), A.seg(9, 6)).rotateX(Math.PI / 2), {
      m,
      color: (_v, _n, lp) => {
        if (lp.z < 0) return ring;
        const d = Math.hypot(lp.x, lp.y) / r;
        return d < pk ? pupil : d < 0.9 ? mix(inner, outer, smooth(pk, 0.9, d)) : ring;
      },
    });
    const lights: readonly (readonly [number, number, number])[] = o.wet
      ? [[-0.3, 0.34, 0.34], [0.34, -0.3, 0.15], [0.05, -0.48, 0.1]]
      : [[-0.3, 0.34, 0.31], [0.36, -0.32, 0.13]];
    for (const [cx, cy, cr] of lights) {
      const z = Math.sqrt(Math.max(0, 1 - cx * cx - cy * cy)) * r + 0.002;
      A.add(bone, new THREE.CircleGeometry(cr * r, 7), { m: m.clone().multiply(mat([cx * r, cy * r, z / (o.flat ?? 0.62)])), color: [1, 1, 1] });
    }
  }
}

/**
 * A pointed (or, with `round`, a soft rounded) ear on an ear bone: an outer cone in `outer` and an inner cone in
 * `inner`, set a little in front so the pink shows from the front. `depth` flattens the cone front to back.
 */
export function pointedEar(
  A: Assembly,
  s: 'L' | 'R',
  o: { r: number; h: number; outer: Col; inner: Col; depth?: number; tilt?: number; lean?: number; y?: number; z?: number; round?: boolean; innerK?: number },
): void {
  const sign = s === 'L' ? 1 : -1;
  const depth = o.depth ?? 0.5;
  const m = mat([0, o.y ?? -0.01, o.z ?? 0], [o.lean ?? 0, 0, sign * (o.tilt ?? 0)]);
  const radial = A.seg(10, 5);
  const outer = o.round
    ? new THREE.SphereGeometry(o.r, radial, A.seg(7, 4)).scale(1, o.h / o.r / 2, depth).translate(0, o.h * 0.45, 0)
    : new THREE.ConeGeometry(o.r, o.h, radial, 2).scale(1, 1, depth).translate(0, o.h / 2, 0);
  A.add(`ear${s}`, outer, { m, color: o.outer });
  const k = o.innerK ?? 0.62;
  const inner = o.round
    ? new THREE.SphereGeometry(o.r * k, radial, A.seg(6, 4)).scale(1, o.h / o.r / 2, depth * 0.55).translate(0, o.h * 0.42, o.r * depth * 0.5)
    : new THREE.ConeGeometry(o.r * k, o.h * 0.8, radial, 1).scale(1, 1, depth * 0.55).translate(0, o.h * 0.38, o.r * depth * 0.5);
  A.add(`ear${s}`, inner, { m, color: o.inner });
}

/** A small black dog nose (a soft rounded triangle) at head-space `p`. */
export function dogNose(A: Assembly, p: readonly [number, number, number], r = 0.026, color: Col = 0x1a1216): void {
  A.add('head', new THREE.SphereGeometry(r, A.seg(9, 6), A.seg(6, 4)).scale(1.45, 0.92, 0.95), { m: mat(p), color });
  // the shine on top of it
  A.add('head', new THREE.SphereGeometry(r * 0.32, 5, 3), { m: mat([p[0] - r * 0.4, p[1] + r * 0.55, p[2] + r * 0.45]), color: 0x8a8088 });
}

/** A smooth line through head-space points (a smile, a brow): a thin tube. */
export function faceLine(A: Assembly, pts: readonly (readonly [number, number, number])[], r: number, color: Col, bone: 'head' | 'mouth' = 'head'): void {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  A.add(bone, new THREE.TubeGeometry(curve, A.seg(8, 5), r, 3, false), { color });
}

/** A rosy blush dot on each cheek (the cute read at lobby scale). */
export function blushDots(A: Assembly, x: number, y: number, z: number, r = 0.026, color: Col = 0xff9fb4): void {
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(r, A.seg(8, 5), A.seg(5, 3)).scale(1.3, 0.75, 0.35), { m: mat([s * x, y, z], [0, s * 0.55, 0]), color });
}

/**
 * A dog's team shawl (bandana, scarf, harness pad): a rounded collar hugging the shoulders, the big up-facing patch
 * the iso camera reads as the team (gear.ts `mantle` is a flat pauldron saucer; on a dog with no armour it read as a
 * plate held at the chest). A trim band round its lower edge.
 */
export function shawl(A: Assembly, color: Col, trim: Col, o: { r?: number; y?: number; low?: number } = {}): void {
  const w = A.w;
  const r = o.r ?? 0.19;
  const y = o.y ?? 0.16;
  const t0 = Math.PI * 0.1;
  const t1 = Math.PI * (o.low ?? 0.52);
  const sx = 1.08 * w;
  const sy = 0.8;
  const g = new THREE.SphereGeometry(r, A.seg(16, 9), A.seg(6, 4), 0, Math.PI * 2, t0, t1 - t0).scale(sx, sy, 1.0);
  A.add('chest', g, { m: mat([0, y, -0.005]), color });
  A.add('chest', g.clone().scale(0.97, 0.97, 0.97), { m: mat([0, y, -0.005]), color });
  const rimY = Math.cos(t1) * r * sy;
  const rimR = Math.sin(t1) * r;
  A.add('chest', new THREE.TorusGeometry(rimR, 0.013, 3, A.seg(18, 10)), { m: mat([0, y + rimY, -0.005], [Math.PI / 2, 0, 0], [sx, 1.0, 1]), color: trim });
}

/** The linear-rgb mix used in head colour functions (exported so the hero modules share one helper). */
export const mixC = (a: RGB, b: RGB, t: number): RGB => mix(a, b, t);
export { C };
