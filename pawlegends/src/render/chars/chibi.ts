// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/KittenBuilder.js (lite-tier body recipe), Fur.js (coatColor subset), Bow.js (ear bow) (TypeScript rewrite, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * The chibi character builder: PPK's cheap-tier cat recipe (big skull with cheek ruffs and whisker pads, vertex-
 * coloured lathe eyes, cupped ears, bib, belly, capsule limbs, a tapered tail on six joints) rebuilt at segment
 * counts that fit POC.md §10 (≤ 6k triangles, ONE skinned mesh). Every piece is rigidly weighted to one bone of the
 * skeleton in skeleton.ts (the tail blends two), with per-vertex colour, so a whole hero, its armour, gear and team
 * colours are one draw call.
 *
 * `detail` (0.3..1) scales every segment count: Med/High heroes ~1, Low ~0.7, minions use the `mini` recipe.
 */
import * as THREE from 'three';
import { GeoBuilder, earGeometry, fbm3, mat as matJs, mixRgb, rgb } from '../ppk/characters/util.js';
import { BONE_INDEX, FACE, Rig, layout, type BoneName, type Layout, type PoseDef, type RigSpec } from './skeleton';

export type RGB = [number, number, number];
/** PPK `util.mat` (position, XYZ Euler, uniform or per-axis scale), typed. */
export const mat = matJs as unknown as (pos?: readonly number[], rot?: readonly number[], scale?: number | readonly number[]) => THREE.Matrix4;
type ColorFn = (v: THREE.Vector3, n: THREE.Vector3, lp: THREE.Vector3, i: number) => RGB | number[];
export type Col = number | string | RGB | ColorFn;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const C = (c: number | string): RGB => rgb(c) as RGB;
export const mix = (a: RGB | number[], b: RGB | number[], t: number): RGB => mixRgb(a, b, t) as RGB;
export const shade = (c: number | string, k: number): RGB => mix(C(c), [0, 0, 0], k);

/**
 * Coat (PPK `coat`): solid, tabby stripes, colour points (dark ears, mask, paws, tail) or spots; card skins (GDD §7.2)
 * add tuxedo (a dark coat with a cream bib, muzzle, paws and belly) and calico (a cream base with `patch` and `deep`
 * patches, never on the muzzle or bib).
 */
export interface CoatSpec {
  pattern: 'solid' | 'tabby' | 'points' | 'spots' | 'tuxedo' | 'calico';
  base: number | string;
  deep: number | string;
  light: number | string;
  cream: number | string;
  stripe?: number;
  /** Calico's third colour (the orange patches). */
  patch?: number | string;
}

export interface EyeSpec {
  inner: number | string;
  outer: number | string;
  ring: number | string;
  pupil?: number | string;
  size?: number;
}

/** What `buildChibi` needs. Gear is added by `gear(A)` (gear.ts / beast.ts recipes). */
export interface ChibiSpec {
  rig: RigSpec;
  coat: CoatSpec;
  eyes: EyeSpec;
  earInner: number | string;
  nose: number | string;
  /** 'cat' (PPK head), 'none' (a beast head is added by the gear callback), 'mini' (minion: fewer pieces). */
  head: 'cat' | 'none' | 'mini';
  /** The minion recipe (fewest segments) even when the head comes from a gear callback. */
  mini?: boolean;
  ears?: { size?: number; hidden?: boolean };
  tail?: { thick?: number; hidden?: boolean };
  /** Paws and feet in the coat (false) or hidden under armour/boots (true: gear adds them). */
  armoured?: { paws?: boolean; feet?: boolean; body?: boolean };
  blush?: boolean;
  /** Whiskers (cat heads at detail ≥ 0.9: Med, High and the lobby). */
  whiskers?: boolean;
  /** Cheek-ruff size (1 = PPK's lite ruffs; heroes run smaller so the round skull reads, not jowls). */
  cheeks?: number;
  /** The ':3' face (nose and mouth) scale, so it survives the iso lens. */
  face?: number;
  detail: number;
  gear?: (A: Assembly) => void;
  /** Pose library for `A.posed` (PPK + Pawlegends poses). */
  poses?: Record<string, PoseDef | null>;
}

/** The assembly context gear recipes write into (PPK `A`). */
export interface Assembly {
  lay: Layout;
  spec: ChibiSpec;
  w: number;
  detail: number;
  /** Segment count scaled by detail (never below `min`). */
  seg(n: number, min?: number): number;
  /** Add `geo` rigidly on `bone`, placed by `m` in the bone's bind space. */
  add(bone: BoneName, geo: THREE.BufferGeometry, o?: { m?: THREE.Matrix4; color?: Col }): void;
  /**
   * A placement for `bone` such that, in pose `pose`, the piece sits at `rootM` (character root space). Held props
   * (shield, bow) are authored where they should look right in the hero's idle pose, whatever the IK twist of the paw.
   */
  posed(bone: BoneName, pose: string, rootM: THREE.Matrix4): THREE.Matrix4;
  /** Coat colour at a point (region space). */
  coat(region: Region, lp: THREE.Vector3): RGB;
}

export type Region = 'head' | 'cheek' | 'muzzle' | 'bib' | 'body' | 'leg' | 'paw' | 'tail' | 'ear';

const _d3 = (p: THREE.Vector3, a: readonly number[]): number => Math.hypot(p.x - a[0], p.y - a[1], p.z - a[2]);

/** PPK `Fur.coatColor` subset (linear rgb). `p` is in the region's space (head space for head parts). */
export function coatColor(coat: CoatSpec, region: Region, p: THREE.Vector3, o: { t?: number; under?: number } = {}): RGB {
  const base = C(coat.base);
  const deep = C(coat.deep);
  const cream = C(coat.cream);
  let c: RGB = base;
  const n = fbm3(p.x * 9 + 3.1, p.y * 9 + 1.7, p.z * 9 + 5.3, 3) as number;
  const stripeK = coat.stripe ?? 0.45;
  const stripe = (v: number): number => smooth(0.55, 0.85, 0.5 + 0.5 * Math.sin(v)) * stripeK;
  if (coat.pattern === 'tabby') {
    if (region === 'head') {
      const fore = smooth(0.19, 0.25, p.y) * smooth(-0.02, 0.06, p.z) * smooth(0.1, 0.03, Math.abs(p.x) - 0.02);
      let s = stripe(p.x * 75 + n * 2) * fore * 1.6;
      s += stripe(p.x * 40 + p.z * 25 + n * 4) * smooth(0.0, -0.08, p.z) * 0.7;
      c = mix(c, deep, s);
    } else if (region === 'tail') c = mix(c, deep, stripe((o.t ?? 0) * 46 + n * 2) * 1.1);
    else if (region === 'body' || region === 'leg') c = mix(c, deep, stripe(p.y * 60 + n * 3) * 0.9);
    else if (region === 'ear') c = mix(c, deep, 0.15);
  } else if (coat.pattern === 'spots') {
    if (region !== 'muzzle' && region !== 'bib' && n > 0.53) c = mix(c, deep, smooth(0.535, 0.55, n) * 0.95);
  } else if (coat.pattern === 'points') {
    if (region === 'ear' || region === 'paw') c = mix(c, deep, 0.85);
    else if (region === 'tail') c = mix(c, deep, smooth(0.15, 0.6, o.t ?? 0) * 0.9);
    else if (region === 'muzzle') c = mix(c, deep, 0.55);
  } else if (coat.pattern === 'tuxedo') {
    // the dark coat with its white shirt front: bib, muzzle, paws and the belly
    let k = 0;
    if (region === 'bib' || region === 'paw') k = 1;
    else if (region === 'muzzle') k = 0.95;
    else if (region === 'body') k = smooth(0.03, 0.12, p.z);
    else if (region === 'head' || region === 'cheek') k = Math.max(smooth(0.07, 0.035, _d3(p, FACE.muzzle)), smooth(0.09, 0.05, p.y) * smooth(0.03, 0.1, p.z));
    else if (region === 'tail') k = smooth(0.85, 0.97, o.t ?? 0);
    return k > 0 ? mix(c, cream, k) : c;
  } else if (coat.pattern === 'calico') {
    // a cream cat with orange and dark patches (never on the muzzle or the bib)
    c = cream;
    if (region !== 'muzzle' && region !== 'bib') {
      const patch = C(coat.patch ?? coat.base);
      if (n > 0.58) c = mix(c, patch, smooth(0.58, 0.6, n));
      else if (n < 0.4) c = mix(c, deep, smooth(0.4, 0.38, n));
    }
    return c;
  }
  let creamK = 0;
  if (region === 'head' || region === 'cheek' || region === 'muzzle') {
    creamK = Math.max(creamK, smooth(0.07, 0.035, _d3(p, FACE.muzzle)));
    creamK = Math.max(creamK, smooth(0.09, 0.05, p.y) * smooth(0.03, 0.1, p.z));
    if (region === 'cheek') creamK = Math.max(creamK, smooth(0.06, 0.13, p.z) * smooth(0.07, 0.02, p.y) * 0.55);
    if (region === 'muzzle' && coat.pattern !== 'points') creamK = 0.9;
  } else if (region === 'bib') creamK = 1;
  else if (region === 'paw') creamK = coat.pattern === 'points' ? 0 : 0.85;
  else if (region === 'tail') creamK = coat.pattern === 'points' ? 0 : Math.max(smooth(0.78, 0.95, o.t ?? 0), smooth(0.2, -0.6, o.under ?? 0) * 0.65);
  else if (region === 'body') creamK = smooth(0.05, 0.14, p.z) * smooth(0.42, 0.3, p.y) * 0.6;
  return creamK > 0 ? mix(c, cream, creamK) : c;
}

const BLUSH = { at: [0.092, 0.086], r: [0.036, 0.022], k: 0.72, color: 0xf49ab0 } as const;

/** Lite eye (PPK `liteEyeGeometry`): rings concentric around the +Z pole so vertex colours draw a round pupil. */
function eyeGeo(r: number, radial: number): THREE.BufferGeometry {
  const ds = [0, 0.45, 0.55, 0.88, 0.96];
  const pts = ds.map((d) => new THREE.Vector2(d * r, Math.sqrt(1 - d * d) * r));
  for (const a of [0.6, 0.8, 1]) pts.push(new THREE.Vector2(Math.sin(Math.PI * a) * r, Math.cos(Math.PI * a) * r));
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts.reverse(), radial).rotateX(Math.PI / 2);
}

/** The ear bow (PPK `Bow.js`, a lighter build): two pinched loops, a knot and two tails, centred at the knot. */
export function bowPieces(radial: number, colors: { main: Col; shade: Col; knot: Col }): { geo: THREE.BufferGeometry; m: THREE.Matrix4; color: Col }[] {
  const out: { geo: THREE.BufferGeometry; m: THREE.Matrix4; color: Col }[] = [];
  for (const s of [1, -1]) {
    const loop = new THREE.SphereGeometry(0.05, radial, Math.max(4, Math.round(radial * 0.6)));
    const p = loop.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = 0.35 + 0.65 * smooth(-0.05, 0.05, x * s);
      p.setY(i, p.getY(i) * k);
      p.setZ(i, p.getZ(i) * (0.45 + 0.25 * k));
    }
    loop.computeVertexNormals();
    out.push({ geo: loop, m: mat([s * 0.045, 0, 0], [0, 0, s * 0.18], [1, 0.95, 1]), color: colors.main });
    out.push({ geo: new THREE.ConeGeometry(0.018, 0.06, 4), m: mat([s * 0.018, -0.04, 0.004], [0, 0, s * 0.35 + Math.PI]), color: colors.shade });
  }
  out.push({ geo: new THREE.SphereGeometry(0.02, Math.max(6, radial - 2), 5), m: mat([0, 0, 0.006], [0, 0, 0], [1, 1.1, 0.8]), color: colors.knot });
  return out;
}

/**
 * Build one character geometry (indexed, position/normal/color/skinIndex/skinWeight) for the layout of `spec.rig`.
 * Returns the geometry and the layout it was skinned against (instances build a Rig from the same layout).
 */
export function buildChibi(spec: ChibiSpec): { geometry: THREE.BufferGeometry; lay: Layout } {
  const lay = layout(spec.rig);
  const kit = new GeoBuilder({ skinned: true });
  const bind = lay.bind;
  // the lobby / portraits build above 1 (smooth skulls in close-up); match tiers stay ≤ 1 (POC.md §10 budget)
  const detail = Math.min(1.6, Math.max(0.25, spec.detail));
  const seg = (n: number, min = 4): number => Math.max(Math.min(min, n), Math.round(n * detail));
  const coat = spec.coat;
  const tmpM = new THREE.Matrix4();
  const A: Assembly = {
    lay,
    spec,
    w: lay.spec.width,
    detail,
    seg,
    coat: (region, lp) => coatColor(coat, region, lp),
    posed(bone, pose, rootM) {
      const rig = new Rig(lay, spec.poses);
      const snap = rig.snapshot(pose);
      rig.bones.forEach((b, i) => {
        b.quaternion.copy(snap.q[i]);
        b.position.copy(snap.p[i]);
      });
      rig.root.updateMatrixWorld(true);
      const m = rig.bones[BONE_INDEX[bone]].matrixWorld.clone().invert().multiply(rootM);
      rig.skeleton.dispose();
      return m;
    },
    add(bone, geo, o = {}) {
      const m = o.m ? tmpM.multiplyMatrices(bind[BONE_INDEX[bone]], o.m).clone() : bind[BONE_INDEX[bone]];
      const color = o.color === undefined ? [1, 1, 1] : typeof o.color === 'number' || typeof o.color === 'string' ? C(o.color) : o.color;
      kit.add(geo, { matrix: m, color, bone: BONE_INDEX[bone] });
      geo.dispose();
    },
  };
  const mini = spec.head === 'mini' || spec.mini === true;
  const coatAt = (region: Region): ColorFn => (_v, _n, lp) => coatColor(coat, region, lp);
  const blushC = C(BLUSH.color);
  const faceAt = (region: Region): ColorFn => (_v, _n, lp) => {
    const c = coatColor(coat, region, lp);
    if (spec.blush === false || lp.z < 0.04) return c;
    const dx = Math.abs(lp.x) - BLUSH.at[0];
    const dy = lp.y - BLUSH.at[1];
    const w = Math.exp(-(dx * dx) / (BLUSH.r[0] * BLUSH.r[0]) - (dy * dy) / (BLUSH.r[1] * BLUSH.r[1])) * smooth(0.04, 0.09, lp.z);
    return w > 0.01 ? mix(c, blushC, w * BLUSH.k) : c;
  };

  // ---- head (PPK _headFurPieces + face details + lite eyes), head space
  if (spec.head === 'cat' || spec.head === 'mini') {
    const sk = mini ? [seg(12, 8), seg(9, 6)] : [seg(22, 10), seg(16, 8)];
    A.add('head', new THREE.SphereGeometry(FACE.skullR, sk[0], sk[1]).scale(...FACE.skullScale).translate(...FACE.skull), { color: faceAt('head') });
    if (!mini) {
      const ck = spec.cheeks ?? 1;
      for (const s of [1, -1]) {
        A.add('head', new THREE.SphereGeometry(FACE.cheekR * ck, seg(10, 6), seg(7, 5)).scale(...FACE.cheekScale).translate(s * FACE.cheek[0] * (0.82 + 0.18 * ck), FACE.cheek[1] + (1 - ck) * 0.02, FACE.cheek[2] + (1 - ck) * 0.03), { color: faceAt('cheek') });
        A.add('head', new THREE.SphereGeometry(0.042, seg(8, 5), seg(6, 4)).translate(s * FACE.pad[0], FACE.pad[1], FACE.pad[2]), { color: faceAt('muzzle') });
      }
      A.add('head', new THREE.SphereGeometry(0.034, seg(8, 5), seg(6, 4)).translate(...FACE.chin), { color: faceAt('muzzle') });
    } else {
      A.add('head', new THREE.SphereGeometry(0.06, 6, 4).scale(1.3, 0.8, 0.9).translate(0, 0.095, 0.115), { color: faceAt('muzzle') });
    }
    // nose and the ':3' mouth (scaled up for heroes so they survive the iso lens)
    const fk = spec.face ?? 1;
    A.add('head', new THREE.SphereGeometry(0.0175 * fk, 6, 4).scale(1.35, 0.8, 0.75), { m: mat([FACE.nose[0], FACE.nose[1] + 0.002, mini ? 0.16 : 0.172]), color: spec.nose });
    if (!mini) {
      const my = FACE.mouth[1] - (fk - 1) * 0.006;
      const mw = 0.024 * fk;
      const md = 0.008 * fk;
      const mouth = [[-mw, my], [-mw / 2, my - md], [0, my], [mw / 2, my - md], [mw, my]].map(([x, y]) => new THREE.Vector3(x, y, 0.163));
      A.add('head', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouth), 6, 0.0038 * Math.sqrt(fk), 3, false), { color: 0x6b2f35 });
      // whiskers: three thin strokes per side fanning out from the whisker pads past the cheeks (PPK's face)
      if (spec.whiskers && detail >= 0.9) {
        for (const s of [1, -1]) {
          for (const [dy, tilt] of [[0.012, 0.16], [0, 0], [-0.012, -0.16]] as const) {
            const len = 0.12;
            A.add('head', new THREE.BoxGeometry(len, 0.0032, 0.0032).translate((s * len) / 2, 0, 0), {
              m: mat([s * (FACE.pad[0] + 0.028), FACE.pad[1] + dy, FACE.pad[2] + 0.018], [0, s * 0.22, s * tilt]),
              color: 0xfff8ee,
            });
          }
        }
      }
    }
    addEyes(A, spec.eyes, mini);
  }

  // ---- ears (cupped cones, pink bowl gradient)
  if (!spec.ears?.hidden && (spec.head === 'cat' || spec.head === 'mini')) addCatEars(A, spec, mini);

  // ---- bib, belly, limbs (PPK _body)
  const w = lay.spec.width;
  if (!spec.armoured?.body) {
    A.add('chest', new THREE.SphereGeometry(0.1, seg(12, 6), seg(9, 5)).scale(1.05 * w, 0.75, 0.8).translate(0, 0.215, 0.045), { color: coatAt('bib') });
    A.add('chest', new THREE.SphereGeometry(0.16, seg(14, 7), seg(10, 5)).scale(w, 1.25, 0.92), { color: coatAt('body') });
  }
  A.add('hips', new THREE.SphereGeometry(0.15, mini ? 7 : seg(14, 7), mini ? 5 : seg(10, 5)).scale(w, 0.9, 0.95), { m: mat([0, 0.02, 0]), color: coatAt('body') });
  const capR = mini ? 4 : seg(8, 5);
  const capS = mini ? 1 : 2;
  const ball = (n: number, m: number): [number, number] => (mini ? [5, 3] : [seg(n, 6), seg(m, 4)]);
  for (const s of ['L', 'R'] as const) {
    A.add(`shoulder${s}`, new THREE.CapsuleGeometry(0.047, 0.07, capS, capR), { m: mat([0, -0.055, 0]), color: coatAt('leg') });
    A.add(`elbow${s}`, new THREE.CapsuleGeometry(0.044, 0.07, capS, capR), { m: mat([0, -0.05, 0]), color: coatAt('leg') });
    if (!spec.armoured?.paws) A.add(`paw${s}`, new THREE.SphereGeometry(0.05, ...ball(10, 8)).scale(1, 0.85, 1.05), { m: mat([0, -0.035, 0.006]), color: coatAt('paw') });
    A.add(`thigh${s}`, new THREE.CapsuleGeometry(0.055, 0.05, capS, capR), { m: mat([0, -0.04, 0]), color: coatAt('leg') });
    A.add(`knee${s}`, new THREE.CapsuleGeometry(0.047, 0.06, capS, capR), { m: mat([0, -0.05, 0]), color: coatAt('leg') });
    if (!spec.armoured?.feet) {
      A.add(`foot${s}`, new THREE.SphereGeometry(1, mini ? 5 : seg(10, 6), mini ? 2 : seg(5, 3), 0, Math.PI * 2, 0, Math.PI / 2).scale(0.056, 0.052, 0.075), { m: mat([0, -0.03, 0.025]), color: coatAt('paw') });
      if (!mini) A.add(`foot${s}`, new THREE.CircleGeometry(0.048, seg(8, 6)).rotateX(Math.PI / 2).scale(1, 1, 1.35), { m: mat([0, -0.0295, 0.025]), color: 0xc98a90 });
    }
  }

  // ---- tail (PPK _tail: tapered tube along the rest curve, blended across the six tail joints)
  if (!spec.tail?.hidden) addTail(kit, lay, spec, mini);

  spec.gear?.(A);

  const g = kit.build() as THREE.BufferGeometry;
  g.deleteAttribute('uv');
  g.deleteAttribute('rmse');
  g.computeBoundingSphere();
  return { geometry: g, lay };
}

function addEyes(A: Assembly, e: EyeSpec, mini: boolean): void {
  const size = e.size ?? 1;
  const r = FACE.eyeR0 * size * (mini ? 1.1 : 1);
  const inner = C(e.inner);
  const outer = C(e.outer);
  const ring = C(e.ring);
  const pupil = C(e.pupil ?? 0x1a1016);
  for (const side of [1, -1]) {
    const bone: BoneName = side > 0 ? 'eyeL' : 'eyeR';
    const geo = mini ? new THREE.SphereGeometry(r, 7, 5).rotateX(Math.PI / 2) : eyeGeo(r, A.seg(12, 8));
    // seated on the skull so the equator meets its surface (PPK _eyeZ), turned out 0.3 rad, flattened
    const ex = FACE.eyeL[0] * (0.97 + 0.03 * size);
    const sx = ex / FACE.skullScale[0];
    const sy = (FACE.eyeL[1] - FACE.skull[1]) / FACE.skullScale[1];
    const ez = Math.sqrt(Math.max(0, FACE.skullR * FACE.skullR - sx * sx - sy * sy)) - 0.012 - 0.012;
    const o = new THREE.Object3D();
    o.position.set(side * ex - FACE.eyeL[0] * side, 0, ez - FACE.eyeL[2]);
    o.rotation.set(-0.06, side * 0.3, 0, 'YXZ');
    o.updateMatrix();
    const m = o.matrix.clone().multiply(mat([0, 0, 0], [0, 0, 0], [1, 1, 0.55]));
    A.add(bone, geo, {
      m,
      color: (_v, _n, lp) => {
        if (lp.z < 0) return ring;
        const d = Math.hypot(lp.x, lp.y) / r;
        if (d < 0.5) return pupil;
        if (d < 0.92) return mix(inner, outer, smooth(0.5, 0.92, d));
        return ring;
      },
    });
    // catchlights: a big upper one and a small lower dot, flat discs on the eye surface
    for (const [cx, cy, cr] of mini ? [[-0.3, 0.35, 0.3]] : [[-0.33, 0.36, 0.26], [0.36, -0.34, 0.11]]) {
      const z = Math.sqrt(Math.max(0, 1 - cx * cx - cy * cy)) * r + 0.002;
      const dm = m.clone().multiply(mat([cx * r, cy * r, z / 0.55]));
      A.add(bone, new THREE.CircleGeometry(cr * r, mini ? 5 : 7), { m: dm, color: [1, 1, 1] });
    }
  }
}

function addCatEars(A: Assembly, spec: ChibiSpec, mini: boolean): void {
  const earS = (spec.ears?.size ?? 1) * 1.28;
  const coat = spec.coat;
  const pink = C(spec.earInner);
  const cream = C(coat.cream);
  const light = C(coat.light);
  if (mini) {
    for (const s of ['L', 'R'] as const) {
      A.add(`ear${s}`, new THREE.ConeGeometry(0.07 * earS, 0.12 * earS, 5).scale(1, 1, 0.55).translate(0, 0.04 * earS, 0), { color: (_v, _n, lp) => (lp.z > 0.012 ? pink : coatColor(coat, 'ear', lp)) });
    }
    return;
  }
  const { geo, front, t, cup } = earGeometry(0.07 * earS, 0.118 * earS, { depth: 0.6, cup: 0.78, radial: A.seg(10, 7), rows: A.seg(6, 4) }) as {
    geo: THREE.BufferGeometry;
    front: Float32Array;
    t: Float32Array;
    cup: Float32Array;
  };
  const color: ColorFn = (_v, _n, lp, i) => {
    let c = mix(coatColor(coat, 'ear', lp), light, smooth(0.02, 0.12, lp.y) * 0.25);
    c = mix(c, cream, smooth(-0.05, 0.45, front[i]) * 0.55 * (1 - smooth(0.8, 1.0, t[i])));
    const pk = smooth(0.18, 0.62, cup[i]) * (1 - smooth(0.55, 0.9, t[i]));
    return mix(c, mix(pink, cream, smooth(0.35, 0.8, t[i]) * 0.5), pk);
  };
  for (const s of ['L', 'R'] as const) A.add(`ear${s}`, s === 'L' ? geo : geo.clone(), { m: mat([0, -0.02, 0]), color });
}

function addTail(kit: InstanceType<typeof GeoBuilder>, lay: Layout, spec: ChibiSpec, mini: boolean): void {
  const curve = lay.tailCurve;
  const tub = mini ? 5 : Math.max(6, Math.round(12 * Math.min(1, spec.detail + 0.1)));
  const rad = mini ? 4 : Math.max(5, Math.round(7 * Math.min(1, spec.detail + 0.1)));
  const thick = spec.tail?.thick ?? 1;
  const tg = new THREE.TubeGeometry(curve, tub, 1, rad, false);
  const pos = tg.attributes.position;
  const c = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tArr = new Float32Array(pos.count);
  const under = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (rad + 1));
    const t = ring / tub;
    const r = (0.04 + 0.027 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * thick;
    curve.getPointAt(t, c);
    tmp.fromBufferAttribute(pos, i).sub(c);
    under[i] = tmp.y;
    tmp.multiplyScalar(r).add(c);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    tArr[i] = t;
  }
  tg.computeVertexNormals();
  const tipP = curve.getPointAt(1);
  const cap = new THREE.SphereGeometry(0.04 * thick * 0.95, rad, 4).translate(tipP.x, tipP.y, tipP.z);
  const skinFor = (t: number): number[] => {
    const s = Math.min(1, Math.max(0, t)) * 5;
    const i0 = Math.min(4, Math.floor(s));
    const f = s - i0;
    return [BONE_INDEX[`tail${i0}` as BoneName], BONE_INDEX[`tail${i0 + 1}` as BoneName], 0, 0, 1 - f, f, 0, 0];
  };
  kit.add(tg, { color: (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3, i: number) => coatColor(spec.coat, 'tail', lp, { t: tArr[i], under: under[i] }), skin: (_v: THREE.Vector3, _lp: THREE.Vector3, i: number) => skinFor(tArr[i]) });
  kit.add(cap, { color: (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3) => coatColor(spec.coat, 'tail', lp, { t: 1 }), skin: () => skinFor(1) });
  tg.dispose();
  cap.dispose();
}
