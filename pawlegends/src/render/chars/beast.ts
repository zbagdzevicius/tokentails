// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/BeastHead.js (pug and hyena head recipes, rebuilt on the kitten head bone; TypeScript rewrite, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * Dog heads for the chibi skeleton (Kibble Corp guard dogs). PPK puts procedural beast heads on KayKit bodies; here
 * the same recipes (pug: fawn skull, dark mask, folded ears, wrinkles; spotted grinner: sloping skull, long dark snout,
 * high round ears, a grin with teeth) sit on the kitten rig's head and ear bones, so dogs share the cats' skeleton,
 * poses and animator, and stay ONE skinned mesh. Head space: skull centre (0, 0.165, 0), facing +Z.
 */
import * as THREE from 'three';
import { fbm3 } from '../ppk/characters/util.js';
import { FACE } from './skeleton';
import { C, mat, mix, type Assembly, type RGB } from './chibi';

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const PUG = Object.freeze({ fur: 0xd9b48a, furDark: 0xb89064, mask: 0x6b4a3a, snout: 0xe9c99a, crease: 0x7a5640, ear: 0x4a3b55, nose: 0x2a1e26, eye: { inner: 0xc99a6a, outer: 0x7a5a3a, ring: 0x2e2018 } });
export const HYENA = Object.freeze({ fur: 0xf0a92e, furDark: 0xc98420, spots: 0x5b3a8c, muzzle: 0x8a6aae, muzzleDark: 0x5e4680, belly: 0xf6dcae, ear: 0x3d2a5a, earInner: 0xe0a08a, nose: 0x2a1e3a, mouth: 0x4a1e30, tooth: 0xfffaf0, brow: 0x2e2040, eye: { inner: 0xf6d27a, outer: 0xd9962e, ring: 0x5a3a22 } });

/** Round dog eyes with a white catchlight (head space), on the eye bones so blinks scale them. */
function dogEyes(A: Assembly, e: { inner: number; outer: number; ring: number }, at: { x: number; y: number; z: number; r: number }): void {
  const inner = C(e.inner);
  const outer = C(e.outer);
  const ring = C(e.ring);
  const pupil = C(0x1a1016);
  for (const side of [1, -1]) {
    const bone = side > 0 ? 'eyeL' : 'eyeR';
    const m = mat([side * at.x - FACE.eyeL[0] * side, at.y - FACE.eyeL[1], at.z - FACE.eyeL[2]], [-0.06, side * 0.35, 0], [1, 1, 0.6]);
    A.add(bone, new THREE.SphereGeometry(at.r, A.seg(10, 7), A.seg(7, 5)).rotateX(Math.PI / 2), {
      m,
      color: (_v, _n, lp) => {
        if (lp.z < 0) return ring;
        const d = Math.hypot(lp.x, lp.y) / at.r;
        return d < 0.48 ? pupil : d < 0.9 ? mix(inner, outer, smooth(0.48, 0.9, d)) : ring;
      },
    });
    A.add(bone, new THREE.CircleGeometry(at.r * 0.28, 6), { m: m.clone().multiply(mat([-0.3 * at.r, 0.32 * at.r, at.r * 0.95 + 0.004])), color: [1, 1, 1] });
  }
}

/** Sir Brutus: a pug head (wide fawn skull, short dark-masked muzzle, folded ears, brow wrinkles). */
export function pugHead(A: Assembly, o: { fur?: number; dark?: number } = {}): void {
  const fur = C(o.fur ?? PUG.fur);
  const dark = C(o.dark ?? PUG.furDark);
  const mask = C(PUG.mask);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    let c = mix(fur, dark, smooth(0.22, 0.32, lp.y) * smooth(0.02, -0.12, lp.z) * 0.6);
    // the dark mask spreads from the muzzle around the eyes
    c = mix(c, mask, smooth(0.1, 0.17, lp.z) * smooth(0.21, 0.15, lp.y) * smooth(0.13, 0.07, Math.abs(lp.x)) * 0.5);
    return c;
  };
  A.add('head', new THREE.SphereGeometry(0.152, A.seg(20, 10), A.seg(14, 8)).scale(1.22, 0.95, 1.0).translate(0, 0.165, 0), { color: skin });
  // jowly cheeks and the short muzzle: a lighter tan snout (not one dark mass), a big dark nose, jowl creases
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.075, A.seg(9, 6), A.seg(7, 4)).scale(1, 0.85, 0.9).translate(s * 0.075, 0.09, 0.09), { color: skin });
  const snout = C(PUG.snout);
  const snoutDark = C(PUG.mask);
  A.add('head', new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(8, 5)).scale(1.2, 0.8, 0.75).translate(0, 0.1, 0.14), {
    color: (_v, _n, lp) => mix(snout, snoutDark, smooth(0.13, 0.17, lp.y) * 0.55),
  });
  A.add('head', new THREE.SphereGeometry(0.034, A.seg(8, 6), 5).scale(1.45, 0.85, 0.8), { m: mat([0, 0.132, 0.197]), color: PUG.nose });
  // jowl creases either side of the nose, and the brow wrinkles
  for (const s of [1, -1]) A.add('head', new THREE.TorusGeometry(0.036, 0.006, 3, 6, Math.PI * 0.6), { m: mat([s * 0.034, 0.112, 0.19], [-0.25, s * 0.4, -Math.PI * 0.8]), color: PUG.crease });
  for (const [y, k] of [[0.235, 1], [0.255, 0.8]] as const) A.add('head', new THREE.TorusGeometry(0.06 * k, 0.007, 3, 8, Math.PI * 0.8), { m: mat([0, y, 0.14], [-0.35, 0, Math.PI * 0.1]), color: dark });
  // tongue tip (friendly guard dog)
  A.add('head', new THREE.SphereGeometry(0.022, 6, 4).scale(1, 0.5, 1), { m: mat([0.01, 0.055, 0.17]), color: 0xe58a93 });
  dogEyes(A, PUG.eye, { x: 0.075, y: 0.18, z: 0.15, r: 0.042 });
  // folded ears: velvety triangles flopping forward from the ear bones
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    A.add(`ear${s}`, new THREE.SphereGeometry(0.075, A.seg(8, 5), A.seg(6, 4)).scale(0.95, 0.75, 0.32), { m: mat([sign * 0.03, -0.015, 0.03], [0.9, 0, sign * 0.9]), color: PUG.ear });
  }
}

/**
 * Cacklejaw: PPK's spotted hyena head: a big round skull in mustard with high-contrast purple spots, a SHORT broad
 * purple muzzle, a big dark nose, heavy brows, a wide grin with two fangs, and big round dark-rimmed ears that stand
 * above the cap. Front-on, so the face reads at lobby scale and the ears read from above.
 */
export function hyenaHead(A: Assembly, o: { spotted?: boolean } = {}): void {
  const P = HYENA;
  const furC = C(P.fur);
  const darkC = C(P.furDark);
  const spots = C(P.spots);
  const muzzle = C(P.muzzle);
  const belly = C(P.belly);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    let c = mix(furC, darkC, smooth(0.22, 0.32, lp.y) * smooth(0.0, -0.12, lp.z) * 0.45);
    c = mix(c, belly, smooth(0.09, 0.03, lp.y) * 0.5);
    const n = fbm3(lp.x * 17 + 3, lp.y * 17, lp.z * 17, 2) as number;
    if (o.spotted !== false && n > 0.54 && lp.z < 0.12) c = mix(c, spots, smooth(0.54, 0.57, n));
    return c;
  };
  A.add('head', new THREE.SphereGeometry(0.155, A.seg(20, 10), A.seg(14, 8)).scale(1.16, 0.98, 1.0).translate(0, 0.17, 0), { color: skin });
  // cheek ruffs and the short broad muzzle (a dome, ~40% shorter than the old snout)
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.07, A.seg(9, 6), A.seg(7, 4)).scale(1, 0.9, 0.85).translate(s * 0.095, 0.1, 0.07), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.1, A.seg(12, 7), A.seg(9, 5)).scale(0.95, 0.72, 0.95).translate(0, 0.105, 0.13), { color: (_v, _n, lp) => mix(muzzle, C(P.muzzleDark), smooth(0.08, 0.04, lp.y) * 0.5) });
  A.add('head', new THREE.SphereGeometry(0.038, A.seg(8, 6), 5).scale(1.35, 0.85, 0.85), { m: mat([0, 0.14, 0.225]), color: P.nose });
  // the grin: a dark mouth arc under the muzzle front, two fangs and small teeth
  A.add('head', new THREE.TorusGeometry(0.06, 0.012, 3, A.seg(10, 6), Math.PI), { m: mat([0, 0.088, 0.2], [0.35, 0, Math.PI], [1.1, 0.75, 1]), color: P.mouth });
  for (const s of [1, -1]) A.add('head', new THREE.ConeGeometry(0.013, 0.036, 4).rotateX(Math.PI), { m: mat([s * 0.038, 0.072, 0.214], [0.2, 0, 0]), color: P.tooth });
  for (const dx of [-0.014, 0.014]) A.add('head', new THREE.ConeGeometry(0.008, 0.016, 3).rotateX(Math.PI), { m: mat([dx, 0.076, 0.226]), color: P.tooth });
  dogEyes(A, P.eye, { x: 0.068, y: 0.195, z: 0.135, r: 0.04 });
  // heavy brows angled into a scowl-grin
  for (const s of [1, -1]) A.add('head', new THREE.BoxGeometry(0.075, 0.018, 0.02), { m: mat([s * 0.068, 0.248, 0.142], [0.3, 0, -s * 0.38]), color: P.brow });
  // big round ears with a dark rim, set high so they stand above the cap
  for (const s of ['L', 'R'] as const) {
    A.add(`ear${s}`, new THREE.SphereGeometry(0.088, A.seg(10, 6), A.seg(7, 4)).scale(1, 1.05, 0.34), { m: mat([0, 0.11, -0.01]), color: P.ear });
    A.add(`ear${s}`, new THREE.SphereGeometry(0.064, A.seg(8, 5), A.seg(6, 4)).scale(1, 1.05, 0.3), { m: mat([0, 0.112, 0.012]), color: P.earInner });
  }
  // a short purple mane down the back of the head
  for (let i = 0; i < 4; i++) A.add('head', new THREE.ConeGeometry(0.04, 0.1, 4), { m: mat([0, 0.3 - i * 0.05, -0.12 - i * 0.035], [-0.9 - i * 0.2, 0, 0]), color: 0x6a3f9a });
}

/** A pup guard minion head (mini: few segments): round fawn head, light muzzle, floppy ears, round eyes. */
export function pupHead(A: Assembly, fur: number, ear: number): void {
  A.add('head', new THREE.SphereGeometry(0.15, 8, 6).scale(1.15, 0.95, 1).translate(0, 0.165, 0), { color: fur });
  A.add('head', new THREE.SphereGeometry(0.075, 5, 3).scale(1.25, 0.85, 1).translate(0, 0.1, 0.135), { color: 0xf3dfbf });
  A.add('head', new THREE.SphereGeometry(0.024, 5, 3), { m: mat([0, 0.13, 0.19]), color: 0x2e2433 });
  for (const s of [1, -1]) {
    A.add(s > 0 ? 'eyeL' : 'eyeR', new THREE.SphereGeometry(0.036, 6, 4), { m: mat([s * 0.072 - FACE.eyeL[0] * s, 0.18 - FACE.eyeL[1], 0.135 - FACE.eyeL[2]], [0, 0, 0], [1, 1.15, 0.6]), color: 0x1a1016 });
  }
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    // big floppy ears hanging out from under the cap
    A.add(`ear${s}`, new THREE.SphereGeometry(0.085, 6, 4).scale(0.72, 1.25, 0.32), { m: mat([sign * 0.05, -0.07, 0.01], [0, 0, sign * 0.55]), color: ear });
  }
}
