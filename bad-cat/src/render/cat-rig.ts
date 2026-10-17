/**
 * Procedural low-poly cat (GDD 6.1, 11.1): rigid parts on bones (body, head with ears, four legs, a three-segment
 * tail) merged into ONE rigidly skinned fur mesh (GDD 11.2: one skinned material), plus the face quad parented to
 * the head bone and the outline twin. Body/ears/tail variants are scale and part swaps; collars and hats
 * (`actors/cosmetics.ts`) are built into the head part. Poses (gait, sneak crouch, jump stretch, swat, loaf, sit,
 * blink and the smug half-blink, the clip's look-at-camera, curled in the human's arms) are procedural bone offsets
 * in `poseCat`. One fur material (cat-material.ts) + one face material per cat.
 * Pure three.js: builds in Node without a WebGL context.
 */
import { Bone, Group, Material, Mesh, MeshLambertMaterial, Object3D, PlaneGeometry, type BufferGeometry, type SkinnedMesh, type Texture } from 'three';
import type { CatSpec } from '../types';
import { GeoBuilder } from './geo';
import { createCatMaterial, updateCatMaterial, type CatMaterial } from './cat-material';
import { createFaceMaterial, disposeFaceMaterial, setFaceDecal, setFaceLid, type FaceMaterial, type Lid } from './face-decal-material';
import { catColors } from './palette';
import { addCatOutline, setCatOutline } from './cat-outline';
import { addCollar, addHat } from './actors/cosmetics';
import { mergeRigid, skinnedMesh, type RigidPart } from './actors/skin';

const FUR = { fur: 1, vary: 0 };
/** Visual scale of the whole cat (cat-space coordinates in the shader stay unscaled). */
export const CAT_SCALE = 1.9;
/** Ear size multiplier (round 3 readability). */
export const EAR_SCALE = 1.15;
/** Extra curl (rad) of the tail tip while trotting: the "?" tail. */
export const TAIL_CURL = 0.9;
/** Face quad width in cat space (metres before CAT_SCALE). */
export const FACE_QUAD_W = 0.185;

export interface CatRig {
  root: Group;
  /** crouch / loaf / breathing */
  bodyPivot: Object3D;
  /** the one skinned fur mesh (body, head, legs, tail) */
  body: Mesh;
  head: Object3D;
  legs: Object3D[]; // FL, FR, BL, BR
  tail: Object3D[];
  face: Mesh;
  /** carried props hang here */
  mouth: Object3D;
  fur: CatMaterial;
  faceMat: FaceMaterial;
  detailMat: MeshLambertMaterial;
  spec: CatSpec;
  /** the toy-scale group (CAT_SCALE) */
  scaleGroup: Group;
  /** rest offsets */
  rest: { bodyY: number; headY: number; headZ: number; legY: number; tailRx: number[] };
}

/** Per-variant dimensions. */
function dims(spec: CatSpec) {
  const w = spec.body === 'chonk' ? 1.32 : spec.body === 'slim' ? 0.84 : 1;
  const h = spec.body === 'chonk' ? 1.12 : spec.body === 'slim' ? 0.92 : 1;
  return { w, h };
}

function furGeo(build: (g: GeoBuilder) => void): BufferGeometry {
  const g = new GeoBuilder();
  build(g);
  return g.build(true);
}

export function buildCatRig(spec: CatSpec, decal?: Texture | null): CatRig {
  const { w, h } = dims(spec);
  const cc = catColors(spec);
  const fur = createCatMaterial(spec);
  const faceMat = createFaceMaterial(spec, decal ?? null);
  const detailMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const root = new Group();
  root.name = 'cat';
  /** Toy scale: the cat reads at phone size in the whole-room camera (it still occupies one cell). */
  const body0 = new Group();
  body0.name = 'cat-scale';
  root.add(body0);
  const parts: RigidPart[] = [];
  const bones: Bone[] = [];
  const bone = (name: string): Bone => {
    const b = new Bone();
    b.name = name;
    bones.push(b);
    return b;
  };

  const legY = 0.085;
  const bodyY = 0.15 * h;
  const bodyPivot = bone('cat-body');
  body0.add(bodyPivot);

  // body: hexagonal barrel along z with a chest and a haunch
  parts.push({
    bone: bodyPivot,
    geo: furGeo((g) => {
      g.cyl(0.076 * w, 0.08 * w, 0.17, 7, 0xffffff, { y: bodyY, rx: Math.PI / 2, sy: 1, sz: h * 0.98 }, FUR);
      g.sphere(0.082 * w, 0xffffff, { y: bodyY + 0.005, z: 0.075, sy: 0.98 * h }, FUR, 7, 5);
      g.sphere(0.086 * w, 0xffffff, { y: bodyY - 0.002, z: -0.075, sy: 0.95 * h }, FUR, 7, 5);
      if (spec.body === 'chonk') g.sphere(0.07 * w, 0xffffff, { y: bodyY - 0.05, z: 0, sx: 1.1, sz: 1.6 }, FUR, 7, 4);
    }),
  });

  // head bone at the neck
  const headY = bodyY + 0.075;
  const headZ = 0.105;
  const head = bone('cat-head');
  head.position.set(0, headY, headZ);
  bodyPivot.add(head);
  parts.push({
    bone: head,
    geo: furGeo((g) => {
      g.ico(0.1, 0xffffff, { y: 0.035, z: 0.035, sx: 1.12 * (spec.body === 'chonk' ? 1.08 : 1), sy: 0.94, sz: 0.82 }, FUR, 1);
      // cheeks
      g.sphere(0.045, 0xffffff, { x: -0.06, y: -0.005, z: 0.06, sz: 0.8 }, FUR, 6, 4);
      g.sphere(0.045, 0xffffff, { x: 0.06, y: -0.005, z: 0.06, sz: 0.8 }, FUR, 6, 4);
      // ears
      for (const side of [-1, 1]) {
        const fold = spec.ears === 'fold';
        const t = fold
          ? { x: side * 0.062, y: 0.115, z: 0.035, rx: 0.9, rz: -side * 0.35, sy: 0.55 }
          : { x: side * 0.066, y: 0.128, z: 0.025, rz: -side * 0.32, rx: 0.08 };
        // round 3: ears 15 % larger (the silhouette must read as a cat from behind, at phone size)
        g.cone(0.042 * EAR_SCALE, 0.075 * EAR_SCALE, 4, 0xffffff, { ...t, ry: Math.PI / 4 }, FUR);
        g.cone(0.026 * EAR_SCALE, 0.05 * EAR_SCALE, 4, cc.innerEar, { ...t, z: (t.z ?? 0) + 0.012, y: (t.y ?? 0) - 0.006, ry: Math.PI / 4 }, { fur: 0, vary: 0 });
      }
      // cosmetics (COSMETICS collar / hat ids; unknown ids draw nothing)
      addCollar(g, spec.collar | 0);
      addHat(g, spec.hat | 0, spec.ears === 'fold');
    }),
  });

  // face quad (its own UV island): the photo crop or the procedural toon face
  // the quad is bent to follow the head's curvature so it never shows as a flat plate from the side
  const faceGeo = new PlaneGeometry(FACE_QUAD_W, 0.17, 8, 8);
  const fp = faceGeo.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i);
    const y = fp.getY(i);
    fp.setZ(i, -((x * x) / 0.2 + (y * y) / 0.24));
  }
  faceGeo.computeVertexNormals();
  const face = new Mesh(faceGeo, faceMat);
  face.name = 'cat-face';
  face.position.set(0, 0.03, 0.12);
  face.renderOrder = 1;
  face.frustumCulled = false;
  head.add(face);

  const mouth = new Object3D();
  mouth.position.set(0, -0.035, 0.1);
  head.add(mouth);

  // legs (bone at the hip, geometry hangs down)
  const legs: Object3D[] = [];
  const legGeo = (): BufferGeometry =>
    furGeo((g) => {
      g.cyl(0.022 * Math.sqrt(w), 0.02 * Math.sqrt(w), legY, 6, 0xffffff, { y: -legY / 2 }, FUR);
      g.sphere(0.026 * Math.sqrt(w), 0xffffff, { y: -legY + 0.008, z: 0.008, sy: 0.6 }, FUR, 6, 4);
    });
  const legPos: [number, number][] = [
    [-0.045 * w, 0.07],
    [0.045 * w, 0.07],
    [-0.048 * w, -0.07],
    [0.048 * w, -0.07],
  ];
  for (const [x, z] of legPos) {
    const pv = bone(`cat-leg${legs.length}`);
    pv.position.set(x, legY, z);
    bodyPivot.add(pv);
    parts.push({ bone: pv, geo: legGeo() });
    legs.push(pv);
  }

  // tail: chained segments curving up
  const tail: Object3D[] = [];
  const segs = spec.tail === 'bob' ? 1 : 3;
  const tailR = spec.tail === 'fluffy' ? 0.032 : 0.019;
  const segL = spec.tail === 'bob' ? 0.045 : 0.075;
  const tailRx = spec.tail === 'bob' ? [0.9] : [0.75, 0.35, 0.25];
  let parent: Object3D = bodyPivot;
  for (let i = 0; i < segs; i++) {
    const pv = bone(`cat-tail${i}`);
    if (i === 0) pv.position.set(0, bodyY + 0.03, -0.125);
    else pv.position.set(0, 0, -segL);
    pv.rotation.x = tailRx[i];
    const r0 = tailR * (1 - i * 0.12);
    const r1 = tailR * (1 - (i + 1) * 0.12);
    parts.push({
      bone: pv,
      geo: furGeo((g) => {
        g.cyl(r0, r1, segL + 0.01, 6, 0xffffff, { z: -segL / 2, rx: Math.PI / 2 }, FUR);
        if (i === segs - 1) g.sphere(r1 * (spec.tail === 'bob' ? 1.5 : 1.05), 0xffffff, { z: -segL }, FUR, 6, 4);
      }),
    });
    parent.add(pv);
    tail.push(pv);
    parent = pv;
  }

  // one skinned fur mesh in body0 space (merged before the toy scale, so aCat stays in unscaled cat space)
  const merged = mergeRigid(parts, bones, body0, true);
  for (const p of parts) p.geo.dispose();
  const body = skinnedMesh(merged, fur, bones, body0);
  body.name = 'cat-fur';
  body.castShadow = true;
  addCatOutline(body0);
  body0.scale.setScalar(CAT_SCALE);
  const rig: CatRig = {
    root,
    bodyPivot,
    body,
    head,
    legs,
    tail,
    face,
    mouth,
    fur,
    faceMat,
    detailMat,
    spec,
    scaleGroup: body0,
    rest: { bodyY, headY, headZ, legY, tailRx },
  };
  root.userData.rig = rig;
  return rig;
}

export interface CatPose {
  /** visual time in ticks (tick + alpha) */
  T: number;
  /** 0 idle, 1 sneak, 2 trot, 3 jump, 4 swat, 5 grab, 6 loaf, 7 cuddled (CatAct) */
  act: number;
  /** progress of the current action 0..1 (swat, grab, jump) */
  actP: number;
  /** walking: 0 none, 1 sneak, 2 trot */
  moving: number;
  /** gait phase in radians */
  phase: number;
  blink: boolean;
  /** extra head yaw/pitch (look at camera), radians */
  headYaw?: number;
  headPitch?: number;
  /** loaf blend 0..1 */
  loaf: number;
  /** sit blend 0..1 (spectators, the accomplice, mugshots, in the box) */
  sit?: number;
  /** overrides `blink`: the smug half-blink ('half') or a held state */
  lid?: Lid;
  /** curled up in the human's arms (the scoop cuddle), 0..1 */
  hug?: number;
}

/** Apply a procedural pose to the rig (bone offsets only). */
export function poseCat(r: CatRig, p: CatPose): void {
  const { rest } = r;
  const t = p.T / 30;
  const breathe = Math.sin(t * 3.1) * 0.012;
  const loaf = p.loaf;
  const sit = p.sit ?? 0;
  const hug = p.hug ?? 0;
  const crouch = p.moving === 1 ? 1 : 0;
  // body height: sneak crouch, loaf flattens, sit pitches the chest up on the haunches
  r.bodyPivot.position.set(0, -0.022 * crouch - 0.07 * loaf + (p.moving === 2 ? Math.abs(Math.sin(p.phase)) * 0.012 : 0) + 0.035 * sit, -0.03 * sit);
  r.bodyPivot.rotation.set(-0.62 * sit, 0, 0);
  r.bodyPivot.scale.set(1 + breathe * 0.5, 1 + breathe, 1);

  // legs
  const amp = p.moving === 2 ? 0.75 : p.moving === 1 ? 0.45 : 0;
  const offs = [0, Math.PI, Math.PI, 0];
  for (let i = 0; i < 4; i++) {
    const L = r.legs[i];
    L.rotation.set(Math.sin(p.phase + offs[i]) * amp, 0, 0);
    L.scale.set(1, 1 - 0.75 * loaf, 1);
  }
  if (sit > 0) {
    // front legs straight down (cancel the body pitch), hind legs folded forward under the haunch
    r.legs[0].rotation.x += 0.62 * sit;
    r.legs[1].rotation.x += 0.62 * sit;
    r.legs[2].rotation.x += -1.0 * sit;
    r.legs[3].rotation.x += -1.0 * sit;
    r.legs[2].scale.y = r.legs[3].scale.y = 1 - 0.35 * sit;
  }
  if (hug > 0) {
    // curled in the arms: paws tucked, a contented slump
    for (let i = 0; i < 4; i++) {
      r.legs[i].rotation.x = (i < 2 ? -0.9 : 0.9) * hug;
      r.legs[i].scale.y = 1 - 0.3 * hug;
    }
  }
  // swat: front-right paw raised and swiped
  if (p.act === 4) {
    const u = p.actP;
    const up = Math.sin(Math.min(1, u * 1.6) * Math.PI);
    r.legs[1].rotation.x = -1.9 * up;
    r.legs[1].rotation.z = 0.5 * Math.sin(u * Math.PI * 2);
    r.bodyPivot.rotation.x = 0.12 * up;
  }
  // jump: stretch mid-air, tuck at the ends
  if (p.act === 3) {
    const u = p.actP;
    const s = Math.sin(u * Math.PI);
    r.legs[0].rotation.x = r.legs[1].rotation.x = -0.9 * s;
    r.legs[2].rotation.x = r.legs[3].rotation.x = 0.9 * s;
    r.bodyPivot.scale.set(1 - 0.08 * s, 1 - 0.05 * s, 1 + 0.18 * s);
  }
  // head: look-around idle, dip for grab, sneak forward, optional look-at-camera
  let hy = Math.sin(t * 0.7) * 0.18 * (p.moving ? 0.2 : 1) * (1 - loaf);
  let hp = 0.62 * sit; // keep the face level while sitting
  if (p.act === 5) hp = 0.6 * Math.sin(p.actP * Math.PI);
  if (crouch) hp += 0.15;
  if (p.act === 7) hp = -0.25;
  if (p.headYaw !== undefined) hy = p.headYaw;
  if (p.headPitch !== undefined) hp += p.headPitch;
  r.head.rotation.set(hp, hy, Math.sin(t * 0.5) * 0.06 * (1 - loaf) + 0.18 * hug);
  r.head.position.set(0, rest.headY - 0.025 * crouch - 0.01 * loaf, rest.headZ + 0.01 * crouch);
  // tail: sway, up while trotting, wrapped in a loaf; sitting, it drops to the floor and curls round the paws
  const sway = Math.sin(t * (p.moving ? 5 : 2.2)) * (p.moving === 1 ? 0.15 : 0.35);
  for (let i = 0; i < r.tail.length; i++) {
    const seg = r.tail[i];
    const up = p.moving === 2 ? 0.35 : p.moving === 1 ? -0.55 : 0;
    const standing = rest.tailRx[i] + (i === 0 ? up : 0);
    const loafed = i === 0 ? -0.45 : 0.08;
    // trotting: the tip curls over into a question mark (3-segment tails)
    const curl = p.moving === 2 && r.tail.length > 1 && i === r.tail.length - 1 ? TAIL_CURL : 0;
    let rx = standing + curl + (loafed - standing) * loaf;
    let ry = sway * (i + 1) * 0.5 * (1 - loaf) + (i === 0 ? 1.2 : 0.5) * loaf;
    if (sit > 0) {
      const sx = i === 0 ? 0.05 : -0.1;
      const sy = (i === 0 ? 0.55 : 1.0) + Math.sin(t * 1.3 + i) * 0.08;
      rx += (sx - rx) * sit;
      ry += (sy - ry) * sit;
    }
    seg.rotation.x = rx;
    seg.rotation.y = ry;
    if (p.act === 7) seg.rotation.y = Math.sin(t * 6) * 0.5;
  }
  setFaceLid(r.faceMat, p.lid ?? (p.blink ? 'closed' : 'open'));
}

export function setCatSpec(r: CatRig, spec: CatSpec): void {
  updateCatMaterial(r.fur, spec);
}

export function setCatDecal(r: CatRig, decal: Texture | null): void {
  setFaceDecal(r.faceMat, decal);
}

/** Make a rig translucent (ghost cats, M1). */
export function setCatGhost(r: CatRig, opacity: number): void {
  setCatOutline(r.root, false);
  for (const m of [r.fur, r.faceMat, r.detailMat] as Material[]) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
}

export function disposeCatRig(r: CatRig): void {
  r.root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.geometry) m.geometry.dispose();
  });
  (r.body as SkinnedMesh).skeleton?.dispose();
  r.fur.dispose();
  r.detailMat.dispose();
  disposeFaceMaterial(r.faceMat);
}
