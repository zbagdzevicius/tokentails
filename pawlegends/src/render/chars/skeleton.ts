// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/KittenBuilder.js (skeleton, rest pose, pose snapshots; TypeScript rewrite, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * The upright chibi skeleton every Pawlegends character stands on (heroes, minions, Companion Kittens): PPK's 27-bone
 * kitten rig (body, hips, chest, head, mouth, ears, eyes, arms, legs, six tail joints) plus one `weapon` socket under
 * the right paw. Rest pose and proportions follow PPK `restPose()` / `PROPORTIONS` (chibi head, short body), and the
 * pose snapshots follow PPK `poseSnapshot()`: joint Euler offsets on the rest rotation, arms by two-bone IK toward paw
 * targets or sword grip points (lifted `Poses.js`).
 *
 * Character space: feet at the origin, facing +Z, the character's LEFT is +X, 1 unit = H (total height ~1).
 */
import * as THREE from 'three';
import { POSES, solveTwoBone, swordMatrix } from '../ppk/characters/Poses.js';

export const BONE_NAMES = [
  'body', 'hips', 'chest', 'head', 'mouth', 'earL', 'earR', 'eyeL', 'eyeR',
  'shoulderL', 'elbowL', 'pawL', 'shoulderR', 'elbowR', 'pawR', 'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR',
  'tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'weapon',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];

const PARENT: Record<BoneName, BoneName | null> = {
  body: null, hips: 'body', chest: 'hips', head: 'chest', mouth: 'head', earL: 'head', earR: 'head', eyeL: 'head', eyeR: 'head',
  shoulderL: 'chest', elbowL: 'shoulderL', pawL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', pawR: 'elbowR',
  thighL: 'hips', kneeL: 'thighL', footL: 'kneeL', thighR: 'hips', kneeR: 'thighR', footR: 'kneeR',
  tail0: 'hips', tail1: 'tail0', tail2: 'tail1', tail3: 'tail2', tail4: 'tail3', tail5: 'tail4', weapon: 'pawR',
};

export const BONE_INDEX: Readonly<Record<BoneName, number>> = Object.freeze(Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>);

/** PPK `ARM`: upper and fore arm lengths and the paw centre below the paw joint (H). */
export const ARM = Object.freeze({ upper: 0.115, fore: 0.11, pawCentre: [0, -0.038, 0.004] as const });
/** PPK `TAIL_CURVE`: the upright question-mark curl (root space, H). */
export const TAIL_CURVE: readonly (readonly [number, number, number])[] = [[0, 0.26, -0.12], [0.04, 0.3, -0.26], [0.06, 0.47, -0.29], [0, 0.57, -0.2]];
/** PPK `PROPORTIONS` (non-legacy) with the hero head scale. */
export const PROPORTIONS = Object.freeze({
  head: Object.freeze({ hero: 1.17, lite: 1.05, kid: 1.22 }),
  hipsY: 0.27, chestY: 0.085, leg: 0.85, neckMin: 0.15,
  legacy: Object.freeze({ hipsY: 0.3, chestY: 0.1, neckY: 0.22, leg: 1, headTop: 0.38 }),
});
/** PPK `FACE` landmarks (head space, before the head scale). */
export const FACE = Object.freeze({
  skull: [0, 0.165, 0] as const, skullScale: [1.18, 0.96, 1.0] as const, skullR: 0.145,
  eyeL: [0.081, 0.15, 0.118] as const, eyeR: [-0.081, 0.15, 0.118] as const, nose: [0, 0.12, 0.158] as const,
  mouth: [0, 0.1, 0.15] as const, muzzle: [0, 0.097, 0.135] as const, chin: [0, 0.064, 0.108] as const, pad: [0.028, 0.097, 0.125] as const, eyeR0: 0.051,
  cheek: [0.118, 0.08, 0.022] as const, cheekR: 0.093, cheekScale: [1, 0.9, 0.82] as const,
});

type V3 = readonly [number, number, number];

/** A pose in PPK `Poses.js` format (joint offsets, arm IK/FK, sword spec, tail). */
export interface PoseDef {
  body?: { p?: V3; r?: V3 };
  joints?: Partial<Record<BoneName, V3>>;
  sword?: { mode: 'hand' | 'root' | 'hidden'; guard?: V3; pommel?: V3; dir?: V3; face?: V3 };
  arms?: Partial<Record<'L' | 'R', ArmDef>>;
  tail?: V3[];
}
interface ArmDef {
  fk?: { shoulder?: V3; elbow?: V3; paw?: V3 };
  paw?: V3;
  grip?: number;
  off?: V3;
  pole?: V3;
  twist?: V3;
}

/** The lifted PPK pose library (read-only). */
export const PPK_POSES = POSES as unknown as Record<string, PoseDef | null>;

/** Rig build options (the character's proportions). */
export interface RigSpec {
  /** Body width factor (PPK `width`). */
  width?: number;
  /** Head scale on top of the tier factor. */
  headScale?: number;
  /** PPK `PROPORTIONS.head` tier: hero 1.17, lite 1.05, kid 1.22. */
  tier?: 'hero' | 'lite' | 'kid';
  /** Hips scale (PPK `bodyScale`: broad tanks). */
  bodyScale?: number;
  /** Ears lowered under a hat (PPK earsLow, 0..1). */
  earsLow?: number;
  /** Extra outward tilt of the ears (rad): cat silhouettes read from above by their ears. */
  earSplay?: number;
  tailCurve?: readonly V3[];
}

export interface Snapshot {
  name: string;
  q: THREE.Quaternion[];
  p: THREE.Vector3[];
  /** Weapon socket transform under pawR for this pose (also written into p/q at the weapon index). */
  weapon: { mode: 'hand' | 'root' | 'hidden'; p: THREE.Vector3; q: THREE.Quaternion };
}

const E = (x = 0, y = 0, z = 0): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Rest local transforms (PPK `restPose`). */
function restPose(w: number, earsLow: number, neckY: number, tailCurve: readonly V3[], earSplay = 0): { P: Record<BoneName, V3>; R: Partial<Record<BoneName, V3>> } {
  const L = PROPORTIONS.leg;
  const pr = PROPORTIONS;
  const P = {
    body: [0, 0, 0], hips: [0, pr.hipsY, 0], chest: [0, pr.chestY, 0], head: [0, neckY, 0], mouth: [...FACE.mouth],
    earL: [0.132, 0.256, -0.014], earR: [-0.132, 0.256, -0.014], eyeL: [...FACE.eyeL], eyeR: [...FACE.eyeR],
    shoulderL: [0.135 * w, 0.15, 0], elbowL: [0, -ARM.upper, 0], pawL: [0, -ARM.fore, 0],
    shoulderR: [-0.135 * w, 0.15, 0], elbowR: [0, -ARM.upper, 0], pawR: [0, -ARM.fore, 0],
    thighL: [0.085 * w, -0.06 * L, 0], kneeL: [0, -0.1 * L, 0], footL: [0, -0.11 * L, 0],
    thighR: [-0.085 * w, -0.06 * L, 0], kneeR: [0, -0.1 * L, 0], footR: [0, -0.11 * L, 0],
    weapon: [0, 0, 0],
  } as unknown as Record<BoneName, V3>;
  const R: Partial<Record<BoneName, V3>> = {
    earL: [-0.1, -0.08, -0.45 - earsLow * 0.6 - earSplay],
    earR: [-0.1, 0.08, 0.45 + earsLow * 0.6 + earSplay],
    shoulderL: [0, 0, 0.12],
    shoulderR: [0, 0, -0.12],
  };
  const dy = pr.hipsY - pr.legacy.hipsY;
  const curve = new THREE.CatmullRomCurve3(tailCurve.map((p) => new THREE.Vector3(p[0], p[1] + dy, p[2])));
  let prev = new THREE.Vector3(0, pr.hipsY, 0);
  for (let i = 0; i < 6; i++) {
    const pt = curve.getPointAt(i / 5);
    P[`tail${i}` as BoneName] = [pt.x - prev.x, pt.y - prev.y, pt.z - prev.z];
    prev = pt;
  }
  return { P, R };
}

/**
 * The bind layout for a spec: root-space bind matrices per bone, the head scale and the torso drop. Pure and
 * deterministic, so every instance of a character shares one cached geometry (built against these matrices).
 */
export interface Layout {
  spec: Required<Omit<RigSpec, 'tailCurve'>> & { tailCurve: readonly V3[] };
  headScale: number;
  bodyDrop: number;
  P: Record<BoneName, V3>;
  R: Partial<Record<BoneName, V3>>;
  bind: THREE.Matrix4[];
  tailCurve: THREE.CatmullRomCurve3;
}

export function layout(spec: RigSpec = {}): Layout {
  const s = {
    width: spec.width ?? 1,
    headScale: spec.headScale ?? 1,
    tier: spec.tier ?? 'hero',
    bodyScale: spec.bodyScale ?? 1,
    earsLow: spec.earsLow ?? 0,
    earSplay: spec.earSplay ?? 0,
    tailCurve: spec.tailCurve ?? TAIL_CURVE,
  };
  const headScale = s.headScale * PROPORTIONS.head[s.tier];
  const L0 = PROPORTIONS.legacy;
  // the neck shortens so the ear tips stay at the same height (PPK: the bigger head sits lower on the shoulders)
  const neckY = Math.max(PROPORTIONS.neckMin, L0.hipsY + L0.chestY + L0.neckY + L0.headTop * s.headScale - PROPORTIONS.hipsY - PROPORTIONS.chestY - L0.headTop * headScale);
  const { P, R } = restPose(s.width, s.earsLow, neckY, s.tailCurve, s.earSplay);
  const rig = makeBones(P, R, headScale, s.bodyScale);
  const dy = PROPORTIONS.hipsY - L0.hipsY;
  return {
    spec: s,
    headScale,
    bodyDrop: PROPORTIONS.hipsY + PROPORTIONS.chestY - (L0.hipsY + L0.chestY),
    P,
    R,
    bind: rig.bones.map((b) => b.matrixWorld.clone()),
    tailCurve: new THREE.CatmullRomCurve3(s.tailCurve.map((p) => new THREE.Vector3(p[0], p[1] + dy, p[2]))),
  };
}

function makeBones(P: Record<BoneName, V3>, R: Partial<Record<BoneName, V3>>, headScale: number, bodyScale: number): { root: THREE.Group; bones: THREE.Bone[] } {
  const root = new THREE.Group();
  const bones = BONE_NAMES.map((n) => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.fromArray(P[n]);
    const r = R[n];
    if (r) b.quaternion.copy(E(...r));
    return b;
  });
  BONE_NAMES.forEach((n, i) => {
    const par = PARENT[n];
    (par ? bones[BONE_INDEX[par]] : root).add(bones[i]);
  });
  if (headScale !== 1) bones[BONE_INDEX.head].scale.setScalar(headScale);
  if (bodyScale !== 1) bones[BONE_INDEX.hips].scale.setScalar(bodyScale);
  root.updateMatrixWorld(true);
  return { root, bones };
}

/** One live skeleton for a character instance, with cached pose snapshots. */
export class Rig {
  readonly root: THREE.Group;
  readonly bones: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  private readonly rest: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[];
  private readonly snaps = new Map<string, Snapshot>();

  constructor(
    readonly lay: Layout,
    private readonly poses: Record<string, PoseDef | null> = PPK_POSES,
  ) {
    const { root, bones } = makeBones(lay.P, lay.R, lay.headScale, lay.spec.bodyScale);
    this.root = root;
    this.bones = bones;
    this.rest = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    this.skeleton = new THREE.Skeleton(bones, lay.bind.map((m) => m.clone().invert()));
  }

  bone(n: BoneName): THREE.Bone {
    return this.bones[BONE_INDEX[n]];
  }

  /** PPK `poseSnapshot`: the joint rotations and positions of a named pose (cached). Unknown names fall back to idle. */
  snapshot(name: string): Snapshot {
    const hit = this.snaps.get(name);
    if (hit) return hit;
    const P = this.poses[name] ?? PPK_POSES[name] ?? PPK_POSES.idle!;
    const q = this.rest.map((r) => r.q.clone());
    const p = this.rest.map((r) => r.p.clone());
    const I = BONE_INDEX;
    const drop = this.lay.bodyDrop;
    if (P.body) {
      if (P.body.p) p[I.body].add(_v.set(P.body.p[0], P.body.p[1], P.body.p[2]));
      if (P.body.r) q[I.body].multiply(E(...P.body.r));
    }
    for (const [k, e] of Object.entries(P.joints ?? {})) {
      const i = I[k as BoneName];
      if (i !== undefined && e) q[i].multiply(E(...e));
    }
    if (P.tail) P.tail.forEach((e, i) => q[I[`tail${i}` as BoneName]].multiply(E(...e)));
    const TR = (k: BoneName): THREE.Matrix4 => new THREE.Matrix4().compose(p[I[k]], q[I[k]], this.rest[I[k]].s);
    const Mchest = TR('body').multiply(TR('hips')).multiply(TR('chest'));
    const chestInv = Mchest.clone().invert();
    const chestRot = new THREE.Quaternion();
    Mchest.decompose(_v, chestRot, _v2);
    const chestRotInv = chestRot.clone().invert();
    const SW = P.sword ? (swordMatrix(P.sword) as THREE.Matrix4 | null) : null;
    if (SW && drop) SW.elements[13] += drop;
    const centre = new THREE.Vector3(...ARM.pawCentre);
    for (const s of ['L', 'R'] as const) {
      const arm = P.arms?.[s];
      if (!arm) continue;
      const sh = I[`shoulder${s}`];
      const el = I[`elbow${s}`];
      const pw = I[`paw${s}`];
      if (arm.fk) {
        if (arm.fk.shoulder) q[sh].multiply(E(...arm.fk.shoulder));
        if (arm.fk.elbow) q[el].multiply(E(...arm.fk.elbow));
        if (arm.fk.paw) q[pw].multiply(E(...arm.fk.paw));
        continue;
      }
      const target = new THREE.Vector3();
      if (arm.paw) target.set(arm.paw[0], arm.paw[1], arm.paw[2]);
      else if (SW && arm.grip !== undefined) target.set(0, arm.grip, 0).applyMatrix4(SW);
      if (arm.off) target.add(_v.set(arm.off[0], arm.off[1], arm.off[2]));
      if (arm.paw) target.y += drop;
      const Tc = target.clone().applyMatrix4(chestInv);
      const pole = new THREE.Vector3(...(arm.pole ?? [s === 'L' ? 1 : -1, -0.3, -0.5])).applyQuaternion(chestRotInv);
      const qS = new THREE.Quaternion();
      const qE = new THREE.Quaternion();
      const qP = arm.twist ? E(...arm.twist) : new THREE.Quaternion();
      const S = p[sh].clone();
      const wrist = Tc.clone();
      for (let it = 0; it < 4; it++) {
        solveTwoBone(S, wrist, ARM.upper, ARM.fore, pole, qS, qE);
        const rot = qS.clone().multiply(qE).multiply(qP);
        wrist.copy(Tc).sub(_v.copy(centre).applyQuaternion(rot));
      }
      q[sh].copy(qS);
      q[el].copy(qE);
      q[pw].copy(qP);
    }
    // The weapon socket sits under pawR. A 'root' sword (planted, leaning) is stored in the paw's frame of that pose
    // too, so a held pose is exact and layered motion carries it with the paw.
    const weapon: Snapshot['weapon'] = { mode: 'hidden', p: new THREE.Vector3(), q: new THREE.Quaternion() };
    if (SW && P.sword) {
      const Mhand = Mchest.clone().multiply(TR('shoulderR')).multiply(TR('elbowR')).multiply(TR('pawR'));
      Mhand.invert().multiply(SW).decompose(weapon.p, weapon.q, _v);
      weapon.mode = P.sword.mode === 'root' ? 'root' : 'hand';
    }
    p[I.weapon].copy(weapon.p);
    q[I.weapon].copy(weapon.q);
    const snap: Snapshot = { name, q, p, weapon };
    this.snaps.set(name, snap);
    return snap;
  }
}
