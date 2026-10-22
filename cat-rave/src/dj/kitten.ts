/**
 * L-DJ: the DJ kitten, built from procedural primitives. Ginger tabby with a cream muzzle and
 * belly, big round head, huge glossy eyes, oversized black headphones with green-glowing cups,
 * stretchy-but-cute arms on two-bone IK, and glowing pink toe beans.
 *
 * Units are kitten units (a crowd cat is ~1.0 tall); the caller scales the root by LAYOUT.djScale.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  Matrix4,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config';
import { furMaterial, litMaterial, type SharedUniforms } from './materials';
import { RIG } from './motion';

export const MAX_SHELLS = 10;

/** Eye size relative to the previous cut (round-3 review: 15% bigger, closer to the reference kitten). */
const EYE_SCALE = 0.98;
const FUR_GINGER = 0xdc8f4e;
const FUR_CREAM = 0xf8e6cf;
const FUR_TIP = 0xffe9cf;
/** Muzzle and chest: lighter than the paws' cream (reference: a white muzzle and chest). */
const FUR_BIB = 0xfff4e6;

export interface ArmRig {
  shoulder: Vector3;
  pole: Vector3;
  upper: Mesh;
  fore: Mesh;
  elbowJoint: Mesh;
  paw: Group;
  /** Smoothed IK target and solved points (body space). */
  target: Vector3;
  elbow: Vector3;
  end: Vector3;
  primed: boolean;
}

export interface KittenRig {
  root: Group;
  body: Group;
  head: Group;
  earL: Group;
  earR: Group;
  tail: Group;
  armR: ArmRig;
  armL: ArmRig;
  eyesOpen: Object3D[];
  eyesHappy: Object3D[];
  highlights: Object3D[];
  mouthClosed: Object3D[];
  mouthOpen: Mesh;
  /** Headphone cup rings + toe beans (colours pulsed per frame). */
  phonesGlow: MeshBasicMaterial;
  padGlow: MeshBasicMaterial;
  setShells(n: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
function setShell(g: BufferGeometry, shell: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('aShell', new Float32BufferAttribute(new Float32Array(n).fill(shell), 1));
  return g;
}

function sphere(r: number, ws: number, hs: number, at: [number, number, number], scale: [number, number, number] = [1, 1, 1]) {
  const g = new SphereGeometry(r, ws, hs);
  g.scale(scale[0], scale[1], scale[2]);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/** Strip to the attributes fur needs so parts from different generators merge. */
function furReady(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'aFur') g.deleteAttribute(name);
  if (!g.getAttribute('aFur')) g.setAttribute('aFur', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(1), 1));
  return setShell(g, 0);
}

/** Fur length multiplier: short on the face (around `dir` from `center`), full elsewhere. */
function shortFurToward(g: BufferGeometry, center: Vector3, dir: Vector3, from = 0.5, to = 0.85): BufferGeometry {
  const pos = g.getAttribute('position');
  const fur = new Float32Array(pos.count);
  const v = new Vector3();
  const d = dir.clone().normalize();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(center).normalize();
    const t = Math.min(1, Math.max(0, (v.dot(d) - from) / (to - from)));
    fur[i] = 1 - 0.85 * t * t * (3 - 2 * t);
  }
  g.setAttribute('aFur', new Float32BufferAttribute(fur, 1));
  return g;
}

/** Static parts that share a material, baked into one geometry (one draw call instead of several). */
const _bake = new Matrix4();
function bakeMerge(parts: { geo: BufferGeometry; at: readonly number[]; rot?: readonly [number, number, number] }[]): BufferGeometry {
  const baked = parts.map(({ geo, at, rot }) => {
    const g = geo.clone();
    _bake.makeRotationFromEuler(new Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0));
    _bake.setPosition(at[0], at[1], at[2]);
    return g.applyMatrix4(_bake);
  });
  const m = mergeGeometries(baked);
  baked.forEach((g) => g.dispose());
  if (!m) throw new Error('dj: static merge failed');
  return m;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const m = mergeGeometries(parts.map(furReady));
  if (!m) throw new Error('dj: geometry merge failed');
  parts.forEach((p) => p.dispose());
  return m;
}

/** Base fur mesh plus a shell stack (drawRange picks how many shells draw). */
class FurPart {
  readonly base: Mesh;
  readonly shells: Mesh;
  private readonly perShell: number;

  constructor(geo: BufferGeometry, baseMat: ShaderMaterial, shellMat: ShaderMaterial) {
    this.base = new Mesh(geo, baseMat);
    const layers: BufferGeometry[] = [];
    for (let k = 1; k <= MAX_SHELLS; k++) layers.push(setShell(geo.clone(), k));
    const stack = mergeGeometries(layers);
    layers.forEach((l) => l.dispose());
    if (!stack) throw new Error('dj: shell merge failed');
    this.perShell = geo.index ? geo.index.count : geo.getAttribute('position').count;
    this.shells = new Mesh(stack, shellMat);
    this.shells.renderOrder = 1;
  }

  setShells(n: number) {
    this.shells.visible = n > 0;
    this.shells.geometry.setDrawRange(0, this.perShell * Math.max(0, Math.min(n, MAX_SHELLS)));
  }

  addTo(parent: Object3D) {
    parent.add(this.base, this.shells);
  }
}

const Y = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------
export function buildKitten(shared: SharedUniforms): KittenRig {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Materials -------------------------------------------------------------------------------
  const headBase = keep(furMaterial(shared, { shell: false, base: FUR_GINGER, tip: FUR_TIP, cream: FUR_BIB, creamDir: [0, -0.55, 1], creamAmt: 1, stripe: 0.75, stripeFreq: 44, shellLen: 0.035 }));
  const headShell = keep(furMaterial(shared, { shell: true, base: FUR_GINGER, tip: FUR_TIP, cream: FUR_BIB, creamDir: [0, -0.55, 1], creamAmt: 1, stripe: 0.75, stripeFreq: 44, shellLen: 0.035 }));
  const bodyBase = keep(furMaterial(shared, { shell: false, base: FUR_GINGER, tip: FUR_TIP, cream: FUR_BIB, creamDir: [0, 0.1, 1], creamAmt: 1, stripe: 0.6, stripeFreq: 30, shellLen: 0.045 }));
  const bodyShell = keep(furMaterial(shared, { shell: true, base: FUR_GINGER, tip: FUR_TIP, cream: FUR_BIB, creamDir: [0, 0.1, 1], creamAmt: 1, stripe: 0.6, stripeFreq: 30, shellLen: 0.045 }));
  const limbMat = keep(furMaterial(shared, { shell: false, base: FUR_GINGER, tip: FUR_TIP, stripe: 0.55, stripeFreq: 22 }));
  const pawMat = keep(furMaterial(shared, { shell: false, base: FUR_CREAM, tip: FUR_TIP, stripe: 0 }));
  const tailMat = keep(furMaterial(shared, { shell: false, base: FUR_GINGER, tip: FUR_TIP, stripe: 0.8, stripeFreq: 70 }));
  limbMat.uniforms.uBaseAo.value = 1;
  pawMat.uniforms.uBaseAo.value = 1;
  tailMat.uniforms.uBaseAo.value = 1;
  const earInner = keep(litMaterial(shared, { color: 0xffa3c2, emissive: 0xff6fa8, emissiveStrength: 0.15, rim: 0.2 }));
  // Amber iris (#c98a2a) with a dark pupil: the old solid-black discs read as alien up close.
  const eyeMat = keep(litMaterial(shared, { color: 0xc98a2a, emissive: 0x7a4a10, emissiveStrength: 0.35, spec: 1.4, shininess: 90, rim: 0.25, rimColor: 0x3dff6a }));
  const pupilMat = keep(litMaterial(shared, { color: 0x0b0704, spec: 1.2, shininess: 90, rim: 0.05 }));
  const darkMat = keep(litMaterial(shared, { color: 0x2a1610, rim: 0.1 }));
  const noseMat = keep(litMaterial(shared, { color: 0xff8fb0, spec: 0.5, shininess: 30, rim: 0.15 }));
  const mouthMat = keep(litMaterial(shared, { color: 0x6e1530, emissive: 0xff3f7f, emissiveStrength: 0.15, rim: 0 }));
  const phonesMat = keep(litMaterial(shared, { color: PALETTE.headphones, spec: 0.9, shininess: 60, rim: 0.5, rimColor: 0x6dff8c }));
  const cushionMat = keep(litMaterial(shared, { color: 0x2b2b33, rim: 0.2 }));
  // Theme roles for the rim colours (dj/index.ts setTheme); the rest go by their default hex.
  eyeMat.userData.rimKey = 'kittenRim';
  phonesMat.userData.rimKey = 'kittenRim2';
  const phonesGlow = keep(new MeshBasicMaterial({ color: PALETTE.moonGlow }));
  phonesGlow.color.multiplyScalar(2.2);
  const padGlow = keep(new MeshBasicMaterial({ color: PALETTE.pawPink }));
  padGlow.color.multiplyScalar(1.6);
  const highlightMat = keep(new MeshBasicMaterial({ color: 0xffffff }));
  highlightMat.color.multiplyScalar(1.35);
  const whiskerMat = keep(new LineBasicMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.55 }));

  const root = new Group();
  root.name = 'dj-kitten';

  // Legs + feet (root space; the hips pivot sits above them) ----------------------------------
  const legsGeo = keep(
    merge([
      sphere(0.1, 14, 10, [-0.09, 0.17, 0.0], [1, 1.1, 1]),
      sphere(0.1, 14, 10, [0.09, 0.17, 0.0], [1, 1.1, 1]),
      sphere(0.07, 12, 8, [-0.09, 0.04, 0.05], [1, 0.6, 1.4]),
      sphere(0.07, 12, 8, [0.09, 0.04, 0.05], [1, 0.6, 1.4]),
    ]),
  );
  root.add(new Mesh(legsGeo, limbMat));

  // Body ------------------------------------------------------------------------------------
  const body = new Group();
  body.name = 'dj-body';
  body.position.set(0, 0.25, 0);
  root.add(body);
  const torsoGeo = keep(merge([sphere(0.2, 26, 18, [0, 0.15, 0], [1, 1.2, 0.86]), sphere(0.13, 18, 12, [0, 0.24, 0.09], [1.05, 0.9, 0.8])]));
  const torso = new FurPart(torsoGeo, bodyBase, bodyShell);
  keep(torso.shells.geometry);
  torso.addTo(body);

  // Tail ------------------------------------------------------------------------------------
  const tail = new Group();
  tail.position.set(0, 0.02, -0.15);
  body.add(tail);
  const tailCurve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0, -0.05, -0.12), new Vector3(0.07, 0.04, -0.24), new Vector3(0.12, 0.2, -0.3), new Vector3(0.1, 0.32, -0.27)]);
  const tailTube = new TubeGeometry(tailCurve, 20, 0.042, 8, false);
  const tailTip = sphere(0.042, 8, 6, [0.1, 0.32, -0.27]);
  const tailGeo = keep(bakeMerge([{ geo: tailTube, at: [0, 0, 0] }, { geo: tailTip, at: [0, 0, 0] }]));
  tailTube.dispose();
  tailTip.dispose();
  tail.add(new Mesh(tailGeo, tailMat));

  // Head ------------------------------------------------------------------------------------
  const head = new Group();
  head.name = 'dj-head';
  head.position.set(0, 0.37, 0.02);
  body.add(head);
  const hc: [number, number, number] = [0, 0.17, 0.02];
  const at = (x: number, y: number, z: number): [number, number, number] => [hc[0] + x, hc[1] + y, hc[2] + z];
  const headGeo = keep(
    merge([
      sphere(0.22, 30, 22, at(0, 0, 0), [1.1, 0.95, 0.97]),
      sphere(0.11, 16, 12, at(-0.115, -0.065, 0.085)),
      sphere(0.11, 16, 12, at(0.115, -0.065, 0.085)),
      sphere(0.056, 12, 10, at(-0.037, -0.07, 0.185)),
      sphere(0.056, 12, 10, at(0.037, -0.07, 0.185)),
      sphere(0.05, 12, 8, at(0, -0.115, 0.15)),
    ]),
  );
  shortFurToward(headGeo, new Vector3(...hc), new Vector3(0, 0.12, 1), 0.45, 0.8);
  const headFur = new FurPart(headGeo, headBase, headShell);
  keep(headFur.shells.geometry);
  headFur.addTo(head);

  // Cream cheek fluff: a rim of soft tufts round the jowls (reference kitten), one merged mesh.
  const tuftGeo = new ConeGeometry(0.03, 0.075, 6, 1);
  const tufts: { geo: BufferGeometry; at: readonly number[]; rot: [number, number, number] }[] = [];
  for (const side of [1, -1]) {
    for (const [dy, dz, tilt] of [
      [0.01, 0.03, 0.15],
      [-0.03, 0.06, 0.45],
      [-0.065, 0.085, 0.75],
      [-0.095, 0.1, 1.05],
    ] as const) {
      // Cones point along +Y: lay them out sideways and a little down, round the cheek.
      tufts.push({ geo: tuftGeo, at: at(side * (0.218 - dy * 0.25), dy - 0.035, dz), rot: [0, 0, -side * (Math.PI / 2 + tilt)] });
    }
  }
  const cheekGeo = keep(bakeMerge(tufts));
  tuftGeo.dispose();
  head.add(new Mesh(cheekGeo, pawMat));

  // Ears
  const earOuterGeo = keep(new ConeGeometry(0.088, 0.17, 14, 1));
  earOuterGeo.translate(0, 0.085, 0);
  earOuterGeo.scale(1, 1, 0.55);
  furReady(earOuterGeo);
  const earInnerGeo = keep(new ConeGeometry(0.058, 0.12, 12, 1));
  earInnerGeo.translate(0, 0.065, 0);
  earInnerGeo.scale(1, 1, 0.3);
  const makeEar = (side: 1 | -1) => {
    const g = new Group();
    g.position.set(...at(side * 0.13, 0.15, -0.01));
    g.rotation.set(-0.05, 0, -side * 0.34);
    g.add(new Mesh(earOuterGeo, headBase));
    const inner = new Mesh(earInnerGeo, earInner);
    inner.position.set(0, 0.008, 0.024);
    g.add(inner);
    head.add(g);
    return g;
  };
  const earL = makeEar(1);
  const earR = makeEar(-1);

  // Eyes (glossy, a little apart: kitten proportions)
  // 25% smaller than the first cut, then 15% smaller again (round-2 review: less cartoon).
  const eyeGeo = keep(new SphereGeometry(0.045, 20, 16));
  eyeGeo.scale(1, 1.08, 0.62);
  const pupilGeo = keep(new SphereGeometry(0.03, 14, 10));
  pupilGeo.scale(0.55, 1.05, 0.3);
  const hiGeo = keep(new SphereGeometry(0.0095, 8, 6));
  const hiGeo2 = keep(new SphereGeometry(0.005, 6, 4));
  const happyGeo = keep(new TorusGeometry(0.036, 0.009, 6, 16, Math.PI));
  const eyesOpen: Object3D[] = [];
  const eyesHappy: Object3D[] = [];
  const highlights: Object3D[] = [];
  for (const side of [1, -1] as const) {
    const eye = new Group();
    eye.position.set(...at(side * 0.088, 0.018, 0.212));
    eye.rotation.y = side * 0.32;
    eye.scale.setScalar(EYE_SCALE);
    eye.add(new Mesh(eyeGeo, eyeMat));
    const pupil = new Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.022);
    eye.add(pupil);
    const h1 = new Mesh(hiGeo, highlightMat);
    h1.position.set(0.012, 0.017, 0.029);
    const h2 = new Mesh(hiGeo2, highlightMat);
    h2.position.set(-0.011, -0.013, 0.028);
    eye.add(h1, h2);
    highlights.push(h1);
    head.add(eye);
    eyesOpen.push(eye);
    const happy = new Mesh(happyGeo, darkMat);
    happy.position.set(...at(side * 0.09, 0.006, 0.222));
    happy.rotation.y = side * 0.32;
    happy.scale.setScalar(EYE_SCALE);
    happy.visible = false;
    head.add(happy);
    eyesHappy.push(happy);
  }

  // Nose, mouth, whiskers
  const noseGeo = keep(new SphereGeometry(0.022, 10, 8));
  noseGeo.scale(1.35, 0.8, 0.8);
  const nose = new Mesh(noseGeo, noseMat);
  nose.position.set(...at(0, -0.035, 0.228));
  head.add(nose);
  const smile = new TorusGeometry(0.018, 0.0045, 5, 10, Math.PI);
  const smileGeo = keep(bakeMerge([1, -1].map((side) => ({ geo: smile, at: at(side * 0.018, -0.068, 0.236), rot: [0, 0, Math.PI] as [number, number, number] }))));
  smile.dispose();
  const mouthClosed: Object3D[] = [new Mesh(smileGeo, darkMat)];
  head.add(mouthClosed[0]);
  const mouthGeo = keep(new SphereGeometry(0.032, 12, 8));
  mouthGeo.scale(1, 1, 0.45);
  const mouthOpen = new Mesh(mouthGeo, mouthMat);
  mouthOpen.position.set(...at(0, -0.085, 0.222));
  mouthOpen.visible = false;
  head.add(mouthOpen);

  const wPts: number[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const y = -0.045 - i * 0.016;
      wPts.push(side * 0.07 + hc[0], y + hc[1], 0.21 + hc[2]);
      wPts.push(side * 0.27 + hc[0], y + hc[1] + (1 - i) * 0.03, 0.17 + hc[2]);
    }
  }
  const whiskerGeo = keep(new BufferGeometry());
  whiskerGeo.setAttribute('position', new Float32BufferAttribute(wPts, 3));
  head.add(new LineSegments(whiskerGeo, whiskerMat));

  // Headphones: big glossy black band, chunky cups (1.2x), glowing green rings, pink dot logo,
  // sitting high on the head (reference).
  const PH_Y = 0.03;
  // Static: band + cups, cushions, rings and logos are each one merged mesh per material.
  const bandG = new TorusGeometry(0.272, 0.027, 8, 30, Math.PI);
  const cupG = new CylinderGeometry(0.12, 0.12, 0.096, 24);
  const cushionG = new TorusGeometry(0.096, 0.029, 8, 22);
  const ringG = new TorusGeometry(0.1, 0.012, 6, 30);
  const logoG = new CylinderGeometry(0.036, 0.036, 0.01, 16);
  const sides = [1, -1] as const;
  const zRot: [number, number, number] = [0, 0, Math.PI / 2];
  const yRot: [number, number, number] = [0, Math.PI / 2, 0];
  const phonesGeo = keep(
    bakeMerge([{ geo: bandG, at: at(0, PH_Y, -0.07), rot: [-0.12, 0, 0] }, ...sides.map((sd) => ({ geo: cupG, at: at(sd * 0.275, PH_Y, -0.03), rot: zRot }))]),
  );
  const cushionsGeo = keep(bakeMerge(sides.map((sd) => ({ geo: cushionG, at: at(sd * 0.228, PH_Y, -0.03), rot: yRot }))));
  const ringsGeo = keep(bakeMerge(sides.map((sd) => ({ geo: ringG, at: at(sd * 0.324, PH_Y, -0.03), rot: yRot }))));
  const logosGeo = keep(bakeMerge(sides.map((sd) => ({ geo: logoG, at: at(sd * 0.325, PH_Y, -0.03), rot: zRot }))));
  for (const g of [bandG, cupG, cushionG, ringG, logoG]) g.dispose();
  head.add(new Mesh(phonesGeo, phonesMat), new Mesh(cushionsGeo, cushionMat), new Mesh(ringsGeo, phonesGlow), new Mesh(logosGeo, padGlow));

  // Arms (IK) -------------------------------------------------------------------------------
  const upperGeo = keep(new CylinderGeometry(0.052, 0.06, 1, 12, 1, true));
  upperGeo.translate(0, 0.5, 0);
  furReady(upperGeo);
  const foreGeo = keep(new CylinderGeometry(0.048, 0.053, 1, 12, 1, true));
  foreGeo.translate(0, 0.5, 0);
  furReady(foreGeo);
  const jointGeo = keep(new SphereGeometry(0.056, 12, 8));
  furReady(jointGeo);
  const shoulderGeo = keep(new SphereGeometry(0.068, 12, 8));
  furReady(shoulderGeo);
  const pawGeo = keep(new SphereGeometry(0.066, 14, 10));
  pawGeo.scale(1.05, 1.1, 0.85);
  furReady(pawGeo);
  // Main bean + three toe beans: one merged glowing mesh per paw.
  const beanG = new SphereGeometry(0.03, 10, 8);
  beanG.scale(1.15, 0.7, 0.5);
  const toeG = new SphereGeometry(0.013, 8, 6);
  const beansGeo = keep(
    bakeMerge([
      { geo: beanG, at: [0, 0.035, 0.045], rot: [-0.6, 0, 0] },
      ...[
        [-0.03, 0.062],
        [0, 0.072],
        [0.03, 0.062],
      ].map(([x, y]) => ({ geo: toeG, at: [x, y, 0.035] })),
    ]),
  );
  beanG.dispose();
  toeG.dispose();

  const makeArm = (shoulder: readonly number[], side: 1 | -1): ArmRig => {
    const s = new Vector3(shoulder[0], shoulder[1], shoulder[2]);
    const sMesh = new Mesh(shoulderGeo, limbMat);
    sMesh.position.copy(s);
    body.add(sMesh);
    const upper = new Mesh(upperGeo, limbMat);
    const fore = new Mesh(foreGeo, limbMat);
    const elbowJoint = new Mesh(jointGeo, limbMat);
    const paw = new Group();
    paw.add(new Mesh(pawGeo, pawMat));
    paw.add(new Mesh(beansGeo, padGlow));
    body.add(upper, fore, elbowJoint, paw);
    return {
      shoulder: s,
      pole: new Vector3(side * 1, -0.7, -0.5).normalize(),
      upper,
      fore,
      elbowJoint,
      paw,
      target: new Vector3(),
      elbow: new Vector3(),
      end: new Vector3(),
      primed: false,
    };
  };
  const armR = makeArm(RIG.shoulderR, -1);
  const armL = makeArm(RIG.shoulderL, 1);

  // Everything casts into the bloom pass the same way; nothing here needs shadows.
  root.traverse((o) => {
    o.frustumCulled = false;
  });
  // Out of the planar floor mirror: its reflection sits behind the booth front anyway, and the
  // DJ's ~60 draws were doubled by the high tier's mirror pass.
  root.userData.noMirror = true;

  const parts = [torso, headFur];
  const shellMats = [headShell, bodyShell];
  const baseMats = [headBase, bodyBase];
  return {
    root,
    body,
    head,
    earL,
    earR,
    tail,
    armR,
    armL,
    eyesOpen,
    eyesHappy,
    highlights,
    mouthClosed,
    mouthOpen,
    phonesGlow,
    padGlow,
    setShells(n: number) {
      for (const p of parts) p.setShells(n);
      for (const m of shellMats) m.uniforms.uShells.value = Math.max(1, n);
      // Without shells the base is the whole fur, so it must not be root-darkened.
      for (const m of baseMats) m.uniforms.uBaseAo.value = n > 0 ? 0.72 : 1;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

const _q = new Quaternion();
const _dir = new Vector3();

/** Place a unit-length (y 0..1) segment mesh from a to b. */
export function placeSegment(mesh: Object3D, a: Vector3, b: Vector3): void {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-6) return;
  _dir.divideScalar(len);
  mesh.position.copy(a);
  mesh.quaternion.copy(_q.setFromUnitVectors(Y, _dir));
  mesh.scale.set(1, len, 1);
}

/** Orient the paw along the forearm (its +Y towards the fingertips). */
export function placePaw(paw: Object3D, elbow: Vector3, end: Vector3): void {
  _dir.subVectors(end, elbow).normalize();
  paw.position.copy(end);
  paw.quaternion.setFromUnitVectors(Y, _dir);
}
