/**
 * The Watcher (GDD 4.3, 11.1): a stylised human made of rigid parts (thighs, shins, torso, head with brows, eyes and
 * mouth, upper arms, forearms, the prop in hand) on bones, merged into ONE rigidly skinned mesh (one draw call per
 * human). The persona (`actors/personas.ts`) sets the outfit, hair, headwear, glasses, the prop in hand, the posture
 * (stand / sit on the sofa or desk chair / lie on the bed) and the BUSY motion.
 *
 * The turn is a show: on LOOK the human does a big 0.8 s double-take (glance, look away, snap back with wide eyes
 * and an "O" mouth; grandma takes 1.5× as long) as a visual beat only; the sim's cone timing is unchanged. Also:
 * a head tilt + "?" during TELEGRAPH, a twitch on FAKEOUT, a walk out and back during the room EVENT, the Napper
 * asleep on the bed breathing (the wake TELEGRAPH is a sit-up yawn), and the scoop cuddle on CAUGHT: he walks up,
 * leans in, lifts the cat and hugs it ("BAD KITTY... come here", hearts).
 */
import { Bone, Group, Material, Mesh, Object3D, Vector3, type BufferGeometry, type SkinnedMesh } from 'three';
import { HumanSt, type HumanState, type PlayableRoom, type RoutineDef } from '../types';
import { GeoBuilder } from './geo';
import { PAL, desaturateHex, shadeHex } from './palette';
import { angleDelta, cellX, cellZ, clamp01, damp, facingYaw, lerpAngle, smooth01 } from './space';
import { humanLook, type HumanLook, type Holding } from './actors/personas';
import { mergeRigid, skinnedMesh, type RigidPart } from './actors/skin';

export interface HumanRig {
  root: Group;
  torso: Object3D;
  head: Object3D;
  brows: Object3D;
  eyes: Object3D;
  mouth: Object3D;
  armL: Object3D;
  armR: Object3D;
  foreL: Object3D;
  foreR: Object3D;
  legL: Object3D;
  legR: Object3D;
  shinL: Object3D;
  shinR: Object3D;
  /** the prop in the right hand (scale 0 hides it: it would clip through the cat in the cuddle) */
  held: Object3D;
  /** where the cat sits during the cuddle */
  arms: Object3D;
  /** the one skinned mesh */
  mesh: Mesh;
  look: HumanLook;
  /** kept for older callers: the held prop */
  spoon?: Object3D;
}

/** Thigh / shin / upper arm / forearm lengths (m). */
const THIGH = 0.43;
const UPPER = 0.29;
const HIP_Y = 0.86;
const TORSO_Y = 0.84;

function heldGeo(g: GeoBuilder, kind: Holding): void {
  const NV = { vary: 0.01 };
  switch (kind) {
    case 'pan':
      // frying pan held out by its handle
      g.cylUp(0.012, 0.012, 0.2, 5, 0x3b3340, { z: 0.1, rx: Math.PI / 2 }, NV);
      g.cylUp(0.13, 0.11, 0.035, 12, 0x2f2b36, { z: 0.3 }, NV);
      g.cylUp(0.105, 0.105, 0.004, 12, 0xffd166, { y: 0.03, z: 0.3 }, NV); // an egg
      g.sphere(0.03, 0xffb347, { y: 0.035, z: 0.3, sy: 0.5 }, NV, 6, 4);
      break;
    case 'remote':
      g.box(0.05, 0.022, 0.16, 0x2b2733, { z: 0.06 }, NV);
      g.box(0.016, 0.006, 0.016, 0xff4d4d, { y: 0.013, z: 0.11 }, NV);
      break;
    case 'phone':
      g.box(0.07, 0.14, 0.012, 0x22223b, { y: 0.04, z: 0.05, rx: -0.3 }, NV);
      g.box(0.06, 0.12, 0.004, 0x8fd3ff, { y: 0.04, z: 0.058, rx: -0.3 }, NV);
      break;
    case 'laptop':
      // an open laptop resting on the hands
      g.box(0.34, 0.018, 0.24, 0xb8bcc8, { y: 0.02, z: 0.1 }, NV);
      g.box(0.34, 0.22, 0.014, 0xb8bcc8, { y: 0.13, z: -0.02, rx: -0.25 }, NV);
      g.box(0.3, 0.18, 0.004, 0x9ad1ff, { y: 0.13, z: -0.01, rx: -0.25 }, NV);
      break;
    case 'tray':
      // a silver tray with two glasses and canapés, carried flat at shoulder height
      g.cylUp(0.2, 0.2, 0.014, 14, 0xd7dde3, { y: 0.02, z: 0.06 }, NV);
      g.cylUp(0.022, 0.016, 0.1, 7, 0xd8f0ff, { x: -0.07, y: 0.034, z: 0.02 }, NV);
      g.cylUp(0.022, 0.016, 0.1, 7, 0xffe08a, { x: 0.07, y: 0.034, z: 0.1 }, NV);
      for (let i = 0; i < 3; i++) g.sphere(0.022, [0xff7b9c, 0x8ac926, 0xffd166][i], { x: -0.05 + i * 0.05, y: 0.045, z: 0.14 }, NV, 5, 3);
      break;
    case 'mug':
      g.cylUp(0.035, 0.032, 0.08, 8, 0xff9f7a, { y: -0.02, z: 0.05 }, NV);
      g.torus(0.022, 0.007, 0xff9f7a, { x: 0.04, y: 0.02, z: 0.05, ry: Math.PI / 2 }, NV, 4, 8);
      break;
    case 'book':
      g.box(0.15, 0.2, 0.03, 0x6b8fd6, { y: 0.05, z: 0.05, rx: -0.4 }, NV);
      g.box(0.14, 0.19, 0.025, 0xfffaf2, { x: 0.006, y: 0.05, z: 0.05, rx: -0.4 }, NV);
      break;
    default:
      break;
  }
}

export function buildHumanRig(play: PlayableRoom, mat: Material, routine: RoutineDef = play.routine): HumanRig {
  const look = humanLook(routine);
  const outfit = desaturateHex(look.outfit, 0.3);
  const root = new Group();
  root.name = 'human';
  const parts: RigidPart[] = [];
  const bones: Bone[] = [];
  const bone = (name: string, parent: Object3D, x: number, y: number, z: number): Bone => {
    const b = new Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    bones.push(b);
    return b;
  };
  const part = (b: Bone, build: (g: GeoBuilder) => void): void => {
    const g = new GeoBuilder();
    build(g);
    parts.push({ bone: b, geo: g.build() });
  };
  const pants = look.pyjama ? outfit : look.pants;

  // legs: thigh bone at the hip, shin bone at the knee
  const legs: Bone[] = [];
  const shins: Bone[] = [];
  for (const side of [-1, 1]) {
    const thigh = bone(`thigh${side}`, root, side * 0.1, HIP_Y, 0);
    part(thigh, (g) => {
      g.boxUp(0.155, THIGH + 0.02, 0.175, pants, { y: -THIGH });
      if (look.pyjama) g.boxUp(0.158, 0.03, 0.178, shadeHex(outfit, 1.15), { y: -THIGH * 0.5 });
    });
    const shin = bone(`shin${side}`, thigh, 0, -THIGH, 0);
    part(shin, (g) => {
      g.boxUp(0.145, HIP_Y - THIGH - 0.06, 0.165, pants, { y: -(HIP_Y - THIGH - 0.06) });
      g.boxUp(0.16, 0.07, 0.27, look.shoes, { y: -(HIP_Y - THIGH), z: 0.04 });
    });
    legs.push(thigh);
    shins.push(shin);
  }

  const torso = bone('torso', root, 0, TORSO_Y, 0);
  part(torso, (g) => {
    g.boxUp(0.46, 0.62, 0.27, outfit, { y: -0.02 });
    g.boxUp(0.48, 0.06, 0.29, shadeHex(outfit, 0.8), { y: -0.04 });
    if (look.apron) {
      g.boxUp(0.37, 0.5, 0.02, PAL.apron, { y: -0.04, z: 0.145 }, { vary: 0.01 });
      g.boxUp(0.2, 0.12, 0.022, PAL.apron, { y: 0.44, z: 0.145 }, { vary: 0.01 });
      g.boxUp(0.16, 0.1, 0.01, shadeHex(PAL.apron, 0.9), { y: 0.12, z: 0.158 });
      g.boxUp(0.2, 0.06, 0.08, 0xe2453c, { y: 0.56, z: 0.12 }); // neckerchief
    }
    if (look.cardigan) {
      g.boxUp(0.05, 0.6, 0.02, shadeHex(outfit, 0.82), { y: -0.02, z: 0.14 });
      for (let i = 0; i < 4; i++) g.sphere(0.018, 0xfff3dc, { x: 0.045, y: 0.08 + i * 0.13, z: 0.148 }, undefined, 5, 3);
      g.boxUp(0.3, 0.12, 0.02, 0xfffaf2, { y: 0.47, z: 0.13 }); // blouse collar
    }
    if (look.hoodie) {
      g.boxUp(0.24, 0.12, 0.02, shadeHex(outfit, 0.85), { y: 0.05, z: 0.142 }); // pocket
      g.boxUp(0.36, 0.12, 0.12, shadeHex(outfit, 0.9), { y: 0.52, z: -0.12 }); // hood
      g.box(0.01, 0.12, 0.01, 0xfffaf2, { x: -0.05, y: 0.42, z: 0.142 });
      g.box(0.01, 0.12, 0.01, 0xfffaf2, { x: 0.05, y: 0.42, z: 0.142 });
    }
    if (look.pyjama) for (let i = 0; i < 4; i++) g.boxUp(0.465, 0.03, 0.275, shadeHex(outfit, 1.18), { y: 0.06 + i * 0.13 });
    if (look.bowtie) {
      g.boxUp(0.36, 0.55, 0.02, 0x2b2733, { y: 0.0, z: 0.138 }); // waistcoat
      g.boxUp(0.1, 0.55, 0.024, 0xfffaf2, { y: 0.0, z: 0.14 }); // shirt front
      g.cone(0.035, 0.06, 3, 0xd62828, { x: -0.03, y: 0.56, z: 0.155, rz: Math.PI / 2 });
      g.cone(0.035, 0.06, 3, 0xd62828, { x: 0.03, y: 0.56, z: 0.155, rz: -Math.PI / 2 });
    }
  });

  const head = bone('head', torso, 0, 0.63, 0);
  part(head, (g) => {
    const skin = look.faceMask ? 0x9ed9a5 : look.skin;
    g.cylUp(0.06, 0.065, 0.07, 6, look.skin);
    g.boxUp(0.26, 0.29, 0.25, skin, { y: 0.05 });
    g.box(0.05, 0.07, 0.05, shadeHex(look.skin, 0.95), { x: -0.14, y: 0.18 });
    g.box(0.05, 0.07, 0.05, shadeHex(look.skin, 0.95), { x: 0.14, y: 0.18 });
    g.box(0.05, 0.06, 0.06, shadeHex(skin, 0.92), { y: 0.15, z: 0.14 });
    if (look.faceMask) {
      // cucumber slices pushed up on the forehead
      g.cyl(0.032, 0.032, 0.008, 8, 0xb5e48c, { x: -0.06, y: 0.27, z: 0.128, rx: Math.PI / 2 }, { vary: 0 });
      g.cyl(0.032, 0.032, 0.008, 8, 0xb5e48c, { x: 0.06, y: 0.27, z: 0.128, rx: Math.PI / 2 }, { vary: 0 });
    }
    // hair styles
    const hair = look.hair;
    switch (look.hairStyle) {
      case 'long':
        g.boxUp(0.28, 0.07, 0.27, hair, { y: 0.31 });
        g.boxUp(0.29, 0.38, 0.08, hair, { y: -0.04, z: -0.11 });
        g.boxUp(0.05, 0.3, 0.2, hair, { x: -0.135, y: 0.02, z: -0.02 });
        g.boxUp(0.05, 0.3, 0.2, hair, { x: 0.135, y: 0.02, z: -0.02 });
        break;
      case 'bun':
      case 'grey-bun':
        g.boxUp(0.28, 0.08, 0.27, hair, { y: 0.3 });
        g.boxUp(0.28, 0.2, 0.07, hair, { y: 0.14, z: -0.11 });
        g.sphere(0.075, hair, { y: 0.4, z: -0.06 }, undefined, 7, 5);
        break;
      case 'curly':
        g.boxUp(0.28, 0.05, 0.27, hair, { y: 0.31 });
        for (let i = 0; i < 7; i++) g.sphere(0.055, hair, { x: -0.11 + (i % 4) * 0.075, y: 0.35 + (i > 3 ? 0.02 : 0), z: i > 3 ? -0.06 : 0.04 }, undefined, 5, 4);
        g.boxUp(0.28, 0.2, 0.07, hair, { y: 0.14, z: -0.11 });
        break;
      case 'messy':
        g.boxUp(0.28, 0.07, 0.27, hair, { y: 0.31 });
        for (let i = 0; i < 5; i++) g.cone(0.035, 0.08, 4, hair, { x: -0.1 + i * 0.05, y: 0.4, z: -0.02 + (i % 2) * 0.05, rz: (i - 2) * 0.35 });
        g.boxUp(0.28, 0.2, 0.07, hair, { y: 0.14, z: -0.11 });
        break;
      case 'neat':
        g.boxUp(0.28, 0.06, 0.27, hair, { y: 0.31 });
        g.boxUp(0.28, 0.16, 0.06, hair, { y: 0.18, z: -0.11 });
        g.box(0.2, 0.02, 0.02, shadeHex(hair, 1.4), { x: -0.02, y: 0.36, z: 0.04, rz: 0.1 });
        break;
      default:
        g.boxUp(0.28, 0.07, 0.27, hair, { y: 0.31 });
        g.boxUp(0.28, 0.2, 0.07, hair, { y: 0.14, z: -0.11 });
        g.boxUp(0.05, 0.1, 0.27, hair, { x: -0.125, y: 0.22 });
        g.boxUp(0.05, 0.1, 0.27, hair, { x: 0.125, y: 0.22 });
    }
    if (look.moustache) g.box(0.12, 0.03, 0.02, hair, { y: 0.125, z: 0.135 });
    if (look.glasses) {
      for (const sx of [-1, 1]) g.torus(0.04, 0.008, 0x3b2f3a, { x: sx * 0.06, y: 0.2, z: 0.135 }, { vary: 0 }, 4, 12);
      g.box(0.04, 0.008, 0.008, 0x3b2f3a, { y: 0.205, z: 0.135 }, { vary: 0 });
    }
    switch (look.headwear) {
      case 'chef':
        g.boxUp(0.3, 0.07, 0.29, 0xfffaf2, { y: 0.3 });
        g.cylUp(0.15, 0.13, 0.13, 10, 0xffffff, { y: 0.37 });
        g.sphere(0.09, 0xffffff, { x: -0.06, y: 0.5 }, undefined, 7, 4);
        g.sphere(0.1, 0xffffff, { x: 0.05, y: 0.52 }, undefined, 7, 4);
        g.sphere(0.08, 0xffffff, { z: 0.05, y: 0.5 }, undefined, 7, 4);
        break;
      case 'party':
        g.cone(0.1, 0.26, 8, 0x4cc9f0, { y: 0.49, x: 0.03, rz: -0.15 });
        g.sphere(0.035, 0xffd166, { y: 0.62, x: 0.05 }, undefined, 6, 4);
        for (let i = 0; i < 3; i++) g.torus(0.085 - i * 0.025, 0.008, 0xff4d8d, { x: 0.02 + i * 0.006, y: 0.39 + i * 0.07, rx: Math.PI / 2, rz: -0.15 }, undefined, 4, 10);
        break;
      case 'headset':
        g.torus(0.15, 0.012, 0x2b2733, { y: 0.2, rz: 0, ry: Math.PI / 2, sy: 1.25 }, { vary: 0 }, 4, 16);
        g.cyl(0.05, 0.05, 0.035, 10, 0x2b2733, { x: -0.15, y: 0.17, rz: Math.PI / 2 }, { vary: 0 });
        g.cyl(0.05, 0.05, 0.035, 10, 0x2b2733, { x: 0.15, y: 0.17, rz: Math.PI / 2 }, { vary: 0 });
        g.box(0.012, 0.012, 0.13, 0x2b2733, { x: -0.15, y: 0.1, z: 0.07, ry: 0.4 }, { vary: 0 });
        g.sphere(0.018, 0xff4d4d, { x: -0.11, y: 0.1, z: 0.14 }, { vary: 0 }, 5, 4);
        break;
      case 'towel':
        g.cylUp(0.16, 0.15, 0.16, 10, 0xffc8dd, { y: 0.29, z: -0.01 });
        g.sphere(0.12, 0xffc8dd, { y: 0.45, z: -0.05, sy: 0.7 }, undefined, 8, 5);
        g.torus(0.15, 0.02, 0xffafcc, { y: 0.31, rx: Math.PI / 2 }, undefined, 4, 14);
        break;
      case 'nightcap':
        g.torus(0.14, 0.03, 0xfffaf2, { y: 0.32, rx: Math.PI / 2 }, undefined, 4, 14);
        g.cone(0.14, 0.3, 8, 0x9db7d6, { y: 0.46, z: -0.08, rx: -0.9 });
        g.sphere(0.04, 0xfffaf2, { y: 0.48, z: -0.27 }, undefined, 6, 4);
        break;
      default:
        break;
    }
  });
  const eyes = bone('eyes', head, 0, 0.2, 0.127);
  part(eyes, (g) => {
    g.box(0.04, 0.055, 0.01, 0x2a1f2b, { x: -0.06 }, { vary: 0 });
    g.box(0.04, 0.055, 0.01, 0x2a1f2b, { x: 0.06 }, { vary: 0 });
    g.box(0.014, 0.014, 0.006, 0xffffff, { x: -0.052, y: 0.012, z: 0.006 }, { vary: 0 });
    g.box(0.014, 0.014, 0.006, 0xffffff, { x: 0.068, y: 0.012, z: 0.006 }, { vary: 0 });
  });
  const mouth = bone('mouth', head, 0, 0.1, 0.127);
  part(mouth, (g) => {
    g.box(0.07, 0.014, 0.01, 0x8a4a3a, {}, { vary: 0 });
  });
  const brows = bone('brows', head, 0, 0.255, 0.128);
  part(brows, (g) => {
    const c = look.hairStyle === 'grey-bun' ? 0xb8b0aa : look.hair;
    g.box(0.065, 0.016, 0.012, c, { x: -0.06 }, { vary: 0 });
    g.box(0.065, 0.016, 0.012, c, { x: 0.06 }, { vary: 0 });
  });

  const arms: Bone[] = [];
  const fores: Bone[] = [];
  let held: Bone | null = null;
  for (const side of [-1, 1]) {
    const arm = bone(`arm${side}`, torso, side * 0.29, 0.56, 0);
    part(arm, (g) => g.boxUp(0.12, UPPER + 0.01, 0.13, outfit, { y: -UPPER }));
    const fore = bone(`fore${side}`, arm, 0, -UPPER, 0);
    part(fore, (g) => {
      g.boxUp(0.095, 0.27, 0.1, look.sleeve !== null ? shadeHex(outfit, 0.97) : look.skin, { y: -0.27 });
      g.sphere(0.06, look.skin, { y: -0.31 }, undefined, 6, 4);
    });
    if (side === 1) {
      held = bone('held', fore, 0, -0.32, 0.02);
      if (look.holding !== 'none') part(held, (g) => heldGeo(g, look.holding));
    }
    arms.push(arm);
    fores.push(fore);
  }
  // the cuddle anchor (not a bone: nothing is skinned to it)
  const cuddle = new Object3D();
  cuddle.position.set(0, 0.3, 0.3);
  torso.add(cuddle);

  const geo: BufferGeometry = mergeRigid(parts, bones, root);
  for (const p of parts) p.geo.dispose();
  const mesh = skinnedMesh(geo, mat, bones, root);
  mesh.name = 'human-mesh';
  mesh.castShadow = true;
  return {
    root,
    torso,
    head,
    brows,
    eyes,
    mouth,
    armL: arms[0],
    armR: arms[1],
    foreL: fores[0],
    foreR: fores[1],
    legL: legs[0],
    legR: legs[1],
    shinL: shins[0],
    shinR: shins[1],
    held: held!,
    arms: cuddle,
    mesh,
    look,
    spoon: held!,
  };
}

export interface DoubleTake {
  body: number;
  head: number;
  brow: number;
  lean: number;
}

/**
 * The LOOK double-take (pure): yaws for the body and head `e` seconds after the LOOK started.
 * 0–0.18 s glance toward the room, 0.18–0.4 s look away, 0.4–0.6 s snap back with overshoot,
 * 0.6–0.8 s settle; then a slow scan. Brows shoot up on the snap.
 */
export function doubleTake(e: number, busyYaw: number, lookYaw: number): DoubleTake {
  const d = angleDelta(busyYaw, lookYaw);
  let head: number;
  let body: number;
  let brow = 0;
  let lean = 0;
  if (e < 0.18) {
    const k = smooth01(e / 0.18);
    head = busyYaw + d * k;
    body = busyYaw + d * 0.45 * k;
  } else if (e < 0.4) {
    const k = smooth01((e - 0.18) / 0.22);
    head = lookYaw - d * 0.7 * k;
    body = busyYaw + d * 0.45;
  } else if (e < 0.6) {
    const k = smooth01((e - 0.4) / 0.12);
    head = lookYaw - d * 0.7 * (1 - k) + d * 0.12 * k;
    body = busyYaw + d * (0.45 + 0.55 * smooth01((e - 0.4) / 0.2));
    brow = k;
    lean = k;
  } else if (e < 0.8) {
    const k = smooth01((e - 0.6) / 0.2);
    head = lookYaw + d * 0.12 * (1 - k);
    body = lookYaw;
    brow = 1;
    lean = 1 - k * 0.5;
  } else {
    head = lookYaw + Math.sin((e - 0.8) * 1.6) * 0.14;
    body = lookYaw;
    brow = Math.max(0, 1 - (e - 0.8) * 1.5);
    lean = 0.5 * Math.max(0, 1 - (e - 0.8) * 2);
  }
  return { body, head, brow, lean };
}

/** Scoop cuddle timing (render ticks after the catch): walk up, lean in, lift, hug. CUDDLE_TICKS is 75. */
export const SCOOP = { approach: 18, reachFrom: 12, reach: 26, lift: 38 } as const;
/** Scoop phases 0..1 at `t` ticks after the catch (pure, shared by the human and the cat). */
export function scoopPhase(t: number): { approach: number; reach: number; lift: number; hug: number } {
  return {
    approach: smooth01(t / SCOOP.approach),
    reach: smooth01((t - SCOOP.reachFrom) / (SCOOP.reach - SCOOP.reachFrom)),
    lift: smooth01((t - SCOOP.reach) / (SCOOP.lift - SCOOP.reach)),
    hug: smooth01((t - SCOOP.lift) / 8),
  };
}
/** How far (m) he walks toward the cat at most, and where he stops short of it. */
export const SCOOP_MAX_WALK = 1.7;
export const SCOOP_STOP = 0.42;

/** '?g': the small grey "?" over a frozen cat in sight; 'say': the cuddle's spoken line (round 3). */
export type BubbleKind = '?' | '?g' | '!' | '!?' | '...' | 'heart' | 'say' | null;

/** Per-frame inputs of HumanView.update beyond the sim state. */
export interface HumanFrame {
  T: number;
  alpha: number;
  dtTicks: number;
  /** the cat is seen moving (the "!" bubble) */
  seen: boolean;
  /** this human scoops the cat (CAUGHT and the nearest human) */
  scooping: boolean;
  /** CAUGHT, someone else scoops: this one cheers */
  caughtOther: boolean;
  /** ticks since the catch (scoop timeline) */
  caughtTicks: number;
  /** the cat's resting world position (where it was caught) */
  catWorld: Vector3;
  w: number;
  d: number;
}

/** Drives one human rig from the sim state; keeps only render-side smoothing. */
export class HumanView {
  readonly rig: HumanRig;
  readonly look: HumanLook;
  readonly routine: RoutineDef;
  private bodyYaw = 0;
  private pos = new Vector3();
  private init = false;
  bubble: BubbleKind = null;
  /** Own copy of the shared material so the human alone can fade (occlusion) without touching the room. */
  private ownMat: Material;
  private fade = 1;
  /** Render tick of the last break during BUSY (flinch + "!?"), -1 none. */
  private flinchT = -1;
  /** Posture blends (render only). */
  private sitK = 0;
  private lieK = 0;
  private bedK = 0;
  /** Where the scoop walk started (the human's position at the catch). */
  private scoopFrom: Vector3 | null = null;
  private readonly spot: { x: number; z: number };
  private readonly eventSpot: { x: number; z: number };

  constructor(
    private readonly play: PlayableRoom,
    mat: Material,
    readonly index = 0,
  ) {
    this.routine = index > 0 && play.routine2 ? play.routine2 : play.routine;
    this.ownMat = mat.clone();
    this.rig = buildHumanRig(play, this.ownMat, this.routine);
    this.look = this.rig.look;
    const sh = play.shell;
    this.spot = index > 0 ? (sh.humanSpot2 ?? { x: Math.min(sh.width - 1, sh.humanSpot.x + 3), z: sh.humanSpot.z }) : sh.humanSpot;
    this.eventSpot = index > 0 ? (sh.humanEventSpot2 ?? sh.humanEventSpot) : sh.humanEventSpot;
  }

  /** World position of the spot (cell centre) and the routine's BUSY yaw. */
  spotWorld(out: Vector3): Vector3 {
    return out.set(cellX(this.spot.x, this.play.shell.width), 0, cellZ(this.spot.z, this.play.shell.depth));
  }
  get busyYaw(): number {
    return facingYaw(this.routine.busyFacing);
  }

  reset(): void {
    this.init = false;
    this.flinchT = -1;
    this.scoopFrom = null;
    this.rig.held.scale.setScalar(1);
    this.setFade(1, 1);
  }

  /** A crash behind his back: shoulders jump 0.05 m and a "!?" pops for 8 ticks (render only, no suspicion). */
  flinch(T: number): void {
    this.flinchT = T;
  }

  /** Ease the human toward `target` opacity (1 opaque, 0.4 while something is hidden behind him). */
  setFade(target: number, k: number): void {
    this.fade += (target - this.fade) * Math.min(1, k);
    const on = this.fade < 0.985;
    if (this.ownMat.transparent !== on) {
      this.ownMat.transparent = on;
      this.ownMat.needsUpdate = true;
    }
    this.ownMat.opacity = on ? this.fade : 1;
    this.ownMat.depthWrite = !on;
  }

  /** Posture this human wants in a state (render only). */
  private postureFor(st: number, scoop: boolean): 'stand' | 'sit' | 'lie' | 'bed' {
    if (scoop) return 'stand';
    const p = this.look.posture;
    if (st === HumanSt.EVENT) return 'stand';
    if (this.look.napper || p === 'lie') {
      if (st === HumanSt.NAP || st === HumanSt.BUSY) return 'lie';
      return 'bed';
    }
    if (p === 'sit') return 'sit';
    return 'stand';
  }

  update(h: HumanState, f: HumanFrame): void {
    const r = this.rig;
    const L = this.look;
    const { T, alpha, dtTicks, w, d } = f;
    const t = T / 30;
    const busyYaw = this.busyYaw;
    const elapsed = (h.stateTicks - h.timer + alpha) / 30; // seconds into the state (timer counts down after the tick)
    const spot = this.spotWorld(new Vector3());
    let target = spot.clone();
    let yaw = facingYaw(h.facing);
    let walk = 0;
    let headYaw = 0;
    let headPitch = 0;
    let headRoll = 0;
    let brow = 0;
    let lean = 0;
    let eyesY = 1;
    let mouthY = 1;
    let armL = { x: 0, z: -0.08 };
    let armR = { x: 0, z: 0.08 };
    let foreL = 0;
    let foreR = 0;
    this.bubble = null;
    let snapYaw: number | null = null;
    let hop = 0;
    let heldScale = 1;
    const scoop = f.scooping;

    if (scoop) {
      // ---- the scoop cuddle: walk up, lean in, lift, hug (GDD 4.3)
      if (!this.scoopFrom) this.scoopFrom = this.init ? this.pos.clone() : spot.clone();
      const ph = scoopPhase(f.caughtTicks);
      const from = this.scoopFrom;
      const to = f.catWorld.clone().setY(0);
      const dir = to.clone().sub(from);
      const dist = dir.length();
      const walkLen = Math.max(0, Math.min(SCOOP_MAX_WALK, dist - SCOOP_STOP));
      if (dist > 1e-4) dir.multiplyScalar(1 / dist);
      const hx = (w * 0.4) / 2 - 0.25;
      const hz = (d * 0.4) / 2 - 0.25;
      const goal = from.clone().addScaledVector(dir, walkLen);
      goal.x = Math.max(-hx, Math.min(hx, goal.x));
      goal.z = Math.max(-hz, Math.min(hz, goal.z));
      target = from.clone().lerp(goal, ph.approach);
      walk = ph.approach > 0 && ph.approach < 1 ? 1 : 0;
      yaw = Math.atan2(to.x - target.x, to.z - target.z);
      // the cat on a counter is reached straight ahead; on the floor he bends down
      const low = f.catWorld.y < 0.6 ? 1 : f.catWorld.y < 1.2 ? 0.45 : 0;
      const reach = ph.reach * (1 - ph.lift);
      lean = 0.55 * low * reach - 0.08 * ph.hug;
      const hugK = Math.max(ph.lift, ph.hug);
      // reach: arms forward and down; hug: forearms wrapped around the cat at the chest
      armL = { x: -1.1 * reach - 1.05 * hugK, z: 0.12 * reach + 0.35 * hugK };
      armR = { x: -1.1 * reach - 1.05 * hugK, z: -0.12 * reach - 0.35 * hugK };
      foreL = -0.25 * reach - 1.35 * hugK;
      foreR = -0.25 * reach - 1.35 * hugK;
      brow = 0.7;
      heldScale = 0;
      // "BAD KITTY… come here" while he walks up and lifts, then the heart
      this.bubble = f.caughtTicks < 36 ? 'say' : 'heart';
      // a gentle rock while he holds the cat (±6° at 1.2 Hz) and a happy squint
      headRoll = Math.sin(t * Math.PI * 2 * 1.2) * 0.1 * ph.hug;
      headPitch = 0.25 * reach + 0.15 * ph.hug;
      eyesY = ph.hug > 0.5 ? 0.25 : 1;
      mouthY = f.caughtTicks < 36 ? 2.2 : 1;
    } else if (f.caughtOther) {
      // the other human in a boss room: turns and claps
      target = this.init ? this.pos.clone() : spot;
      yaw = Math.atan2(f.catWorld.x - target.x, f.catWorld.z - target.z);
      const clap = Math.sin(t * 14);
      armL = { x: -1.3, z: 0.35 + clap * 0.18 };
      armR = { x: -1.3, z: -0.35 - clap * 0.18 };
      foreL = foreR = -0.6;
      brow = 0.8;
      mouthY = 2;
      this.bubble = 'heart';
    } else {
      switch (h.state) {
        case HumanSt.NAP:
        case HumanSt.BUSY: {
          yaw = busyYaw;
          const bz = this.busyMotion(t);
          armL = bz.armL;
          armR = bz.armR;
          foreL = bz.foreL;
          foreR = bz.foreR;
          headYaw = bz.headYaw;
          headRoll = bz.headRoll;
          headPitch = bz.headPitch;
          if (L.napper || h.state === HumanSt.NAP) {
            eyesY = 0.15;
            mouthY = 1 + Math.max(0, Math.sin(t * 1.6)) * 1.2;
          }
          const fl = this.flinchT >= 0 ? (T - this.flinchT) / 8 : 1; // 8 ticks: shoulders up, "?!"
          if (fl >= 0 && fl < 1) {
            const k = Math.sin(fl * Math.PI);
            armL = { x: armL.x - 0.5 * k, z: armL.z - 0.35 * k };
            armR = { x: armR.x - 0.4 * k, z: armR.z + 0.35 * k };
            headRoll += 0.25 * k;
            lean = -0.12 * k;
            hop = 0.05 * k;
            eyesY = 1.4;
            this.bubble = '!?';
          }
          break;
        }
        case HumanSt.TELEGRAPH: {
          yaw = busyYaw;
          const k = smooth01(elapsed / 0.25);
          if (L.napper) {
            // wake: sit up, stretch both arms up and yawn wide, eyes squeezed, then blink open
            const y = clamp01(elapsed / 0.6);
            const stretch = Math.sin(Math.min(1, y) * Math.PI);
            armL = { x: -2.7 * stretch, z: -0.2 };
            armR = { x: -2.7 * stretch, z: 0.2 };
            foreL = foreR = -0.3 * stretch;
            mouthY = 1 + 3.2 * stretch;
            eyesY = stretch > 0.3 ? 0.15 : 1;
            headPitch = -0.3 * stretch;
            this.bubble = y > 0.6 ? '?' : null;
            break;
          }
          // whole-body hop (0.06 m over 4 ticks) at the start of the turn
          const hp = (h.stateTicks - h.timer + alpha) / 4;
          if (hp >= 0 && hp < 1) hop = 0.06 * Math.sin(hp * Math.PI);
          headYaw = angleDelta(busyYaw, facingYaw(h.lookFacing)) * 0.15 * k;
          headRoll = 0.22 * k;
          brow = 0.5 * k;
          armR = { x: -0.7, z: 0.05 };
          armL = { x: -0.45, z: -0.12 };
          foreR = -0.4;
          this.bubble = '?';
          break;
        }
        case HumanSt.FAKEOUT: {
          yaw = busyYaw;
          const k = Math.sin(clamp01(elapsed / 0.5) * Math.PI);
          headYaw = angleDelta(busyYaw, facingYaw(h.lookFacing)) * 0.3 * k;
          headRoll = 0.1 * (1 - k);
          armR = { x: -0.8, z: 0.05 };
          armL = { x: -0.5, z: -0.12 };
          foreR = -0.5;
          if (L.napper) {
            eyesY = 0.5;
            mouthY = 1.6;
          }
          this.bubble = elapsed < 0.3 ? '?' : null;
          break;
        }
        case HumanSt.LOOK: {
          const lookYaw = facingYaw(h.facing);
          const e = elapsed / Math.max(0.5, L.turnScale);
          const dt = doubleTake(e, busyYaw, lookYaw);
          snapYaw = dt.body;
          headYaw = angleDelta(dt.body, dt.head);
          brow = dt.brow;
          lean = dt.lean * 0.12;
          // the big beat: eyes pop and the mouth makes an "O" on the snap back
          const pop = e > 0.38 && e < 0.95 ? Math.sin(((e - 0.38) / 0.57) * Math.PI) : 0;
          eyesY = 1 + 0.6 * pop;
          mouthY = 1 + 1.6 * pop;
          hop = 0.035 * (e > 0.4 && e < 0.55 ? Math.sin(((e - 0.4) / 0.15) * Math.PI) : 0);
          armL = { x: -0.15 - 0.35 * pop, z: -0.55 };
          armR = { x: -0.15 - 0.35 * pop, z: 0.55 };
          foreL = foreR = -0.5 * pop;
          this.bubble = f.seen ? '!' : e < 0.8 ? '?' : null;
          break;
        }
        case HumanSt.EVENT: {
          // walk toward the event spot but stop at the diorama's edge so the human stays on screen
          const hx = (w * 0.4) / 2 - 0.22;
          const hz = (d * 0.4) / 2 - 0.22;
          const ev = new Vector3(Math.max(-hx, Math.min(hx, cellX(this.eventSpot.x, w))), 0, Math.max(-hz, Math.min(hz, cellZ(this.eventSpot.z, d))));
          const walkT = 36 / L.walkScale;
          const out = clamp01((h.stateTicks - h.timer + alpha) / walkT);
          const back = clamp01((h.timer - alpha) / walkT);
          const k = smooth01(Math.min(out, back));
          target = spot.clone().lerp(ev, k);
          const going = out < 1;
          const away = Math.atan2(ev.x - spot.x, ev.z - spot.z);
          yaw = going || back >= 1 ? away : away + Math.PI;
          walk = out < 1 || back < 1 ? 1 : 0;
          if (!walk) {
            // busy with the event (phone at the ear)
            armR = { x: -2.6, z: -0.3 };
            foreR = -1.2;
            yaw = away;
          }
          this.bubble = '...';
          break;
        }
      }
    }

    if (!this.init) {
      this.pos.copy(target);
      this.bodyYaw = snapYaw ?? yaw;
      this.init = true;
    }
    if (!scoop) this.scoopFrom = null;
    // position: walking follows the computed path exactly; otherwise a quick settle
    if (h.state === HumanSt.EVENT || scoop) this.pos.copy(target);
    else this.pos.lerp(target, damp(0.25, dtTicks));
    if (snapYaw !== null) this.bodyYaw = snapYaw;
    else this.bodyYaw = lerpAngle(this.bodyYaw, yaw, damp(0.22, dtTicks));

    // ---- posture blends
    const want = this.postureFor(h.state, scoop || f.caughtOther);
    const kk = damp(0.18, dtTicks);
    this.sitK += ((want === 'sit' ? 1 : 0) - this.sitK) * kk;
    this.lieK += ((want === 'lie' ? 1 : 0) - this.lieK) * kk;
    this.bedK += ((want === 'bed' ? 1 : 0) - this.bedK) * kk;
    const sitK = this.sitK;
    const lieK = this.lieK;
    const bedK = this.bedK;
    const seated = Math.max(sitK, bedK, lieK);
    // seated/lying humans keep the body on the seat and turn the torso and head instead
    let rootYaw = this.bodyYaw;
    let torsoYaw = 0;
    if (seated > 0.01) {
      const turn = angleDelta(busyYaw, this.bodyYaw);
      rootYaw = lerpAngle(this.bodyYaw, busyYaw, seated);
      torsoYaw = turn * 0.65 * seated;
      headYaw += turn * 0.35 * seated;
    }

    r.root.position.copy(this.pos);
    // sit: hips at seat height (0.47 m); bed (sit up in bed): hips at 0.55 m with the legs straight along the bed;
    // lie: the whole body pitched flat on the bed (0.45 m top), centred on the spot
    const lieDir = new Vector3(Math.sin(rootYaw), 0, Math.cos(rootYaw));
    r.root.position.y += hop + (0.47 - HIP_Y) * sitK + (0.55 - HIP_Y) * bedK + 0.6 * lieK;
    r.root.position.addScaledVector(lieDir, 0.85 * lieK);
    r.root.rotation.set(-Math.PI / 2 * lieK, rootYaw, 0, 'YXZ');
    const walkHz = 9 * L.walkScale;
    const swing = walk ? Math.sin(t * walkHz) * 0.5 : 0;
    r.legL.rotation.set(swing - 1.5 * sitK - 1.55 * bedK, 0, 0);
    r.legR.rotation.set(-swing - 1.5 * sitK - 1.55 * bedK, 0, 0);
    r.shinL.rotation.set((walk ? Math.max(0, -Math.sin(t * walkHz)) * 0.6 : 0) + 1.5 * sitK, 0, 0);
    r.shinR.rotation.set((walk ? Math.max(0, Math.sin(t * walkHz)) * 0.6 : 0) + 1.5 * sitK, 0, 0);
    const breath = Math.sin(t * (lieK > 0.5 ? 1.6 : 2)) * (lieK > 0.5 ? 0.025 : 0.004);
    r.torso.rotation.set(lean - 0.08 * sitK, torsoYaw, 0);
    r.torso.position.y = TORSO_Y + (walk ? Math.abs(Math.cos(t * walkHz)) * 0.02 : 0);
    r.torso.scale.set(1 + breath * 0.6, 1, 1 + breath);
    r.head.rotation.set(-lean * 0.5 + headPitch, headYaw, headRoll);
    r.brows.position.y = 0.255 + brow * 0.035;
    r.eyes.scale.set(1 + (eyesY - 1) * 0.3, eyesY, 1);
    r.mouth.scale.set(mouthY > 1.5 ? 0.6 : 1, mouthY, 1);
    r.armL.rotation.set(armL.x + (walk ? -swing * 0.6 : 0), 0, armL.z);
    r.armR.rotation.set(armR.x + (walk && armR.x > -2 ? swing * 0.6 : 0), 0, armR.z);
    r.foreL.rotation.set(foreL, 0, 0);
    r.foreR.rotation.set(foreR, 0, 0);
    r.held.scale.setScalar(heldScale);
  }

  /** BUSY motion per persona (arms, forearms, head). */
  private busyMotion(t: number): { armL: { x: number; z: number }; armR: { x: number; z: number }; foreL: number; foreR: number; headYaw: number; headRoll: number; headPitch: number } {
    const L = this.look;
    switch (L.busy) {
      case 'remote':
        return { armL: { x: -0.2, z: -0.1 }, armR: { x: -0.6, z: 0.1 }, foreL: -0.4, foreR: -0.9 + Math.max(0, Math.sin(t * 5)) * 0.15, headYaw: Math.sin(t * 0.4) * 0.05, headRoll: Math.sin(t * 1.1) * 0.04, headPitch: 0.05 };
      case 'cream': {
        const k = Math.sin(t * 2.4);
        return { armL: { x: -0.5, z: -0.2 }, armR: { x: -0.7 + k * 0.1, z: 0.25 }, foreL: -1.2, foreR: -2.1, headYaw: k * 0.08, headRoll: 0.08, headPitch: -0.05 };
      }
      case 'type': {
        const a = Math.sin(t * 13) * 0.08;
        return { armL: { x: -0.7 + a, z: -0.05 }, armR: { x: -0.7 - a, z: 0.05 }, foreL: -0.9, foreR: -0.9, headYaw: Math.sin(t * 0.6) * 0.06, headRoll: 0, headPitch: 0.12 };
      }
      case 'mingle': {
        const k = Math.sin(t * 2.2);
        return { armL: { x: -0.3, z: -0.3 + k * 0.2 }, armR: { x: -1.3, z: 0.1 }, foreL: -0.3, foreR: -1.2, headYaw: k * 0.2, headRoll: Math.sin(t * 3) * 0.05, headPitch: 0 };
      }
      case 'snore':
        return { armL: { x: -0.3, z: -0.25 }, armR: { x: -0.3, z: 0.25 }, foreL: -0.6, foreR: -0.6, headYaw: 0.3, headRoll: 0.2, headPitch: 0 };
      case 'knit': {
        const k = Math.sin(t * 7);
        // knitting: elbows in, hands together under the chin, needles clicking
        return { armL: { x: -0.3 + k * 0.05, z: 0.32 }, armR: { x: -0.3 - k * 0.05, z: -0.32 }, foreL: -1.55, foreR: -1.55, headYaw: Math.sin(t * 0.5) * 0.05, headRoll: 0, headPitch: 0.25 };
      }
      case 'tray':
        return { armL: { x: -0.2, z: -0.1 }, armR: { x: -1.25, z: 0.05 }, foreL: -0.2, foreR: -1.35 + Math.sin(t * 1.5) * 0.05, headYaw: Math.sin(t * 0.9) * 0.25, headRoll: 0, headPitch: 0 };
      case 'stir':
      default: {
        // the pan held over the stove at counter height, a little toss every second
        const toss = Math.max(0, Math.sin(t * 6.2)) * 0.18;
        return { armL: { x: -0.45, z: -0.1 }, armR: { x: -0.55 - toss, z: 0.12 + Math.cos(t * 6) * 0.05 }, foreL: -0.7, foreR: -0.75 - toss * 0.6, headYaw: Math.sin(t * 0.8) * 0.12, headRoll: Math.sin(t * 1.7) * 0.05, headPitch: 0.12 };
      }
    }
  }

  /** Head-top world position (bubble anchor). */
  headTop(out: Vector3): Vector3 {
    this.rig.head.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(this.rig.head.matrixWorld);
    // lying down, the anchor floats just above the face (the head bone's up points along the bed)
    const lie = this.lieK;
    return out.add(new Vector3(0, this.look.headTop * (1 - lie) + 0.35 * lie, 0));
  }

  /** Head bone world position (edge arrow, projectWorld). */
  headPos(out: Vector3): Vector3 {
    this.rig.head.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.rig.head.matrixWorld).add(new Vector3(0, 0.15, 0));
  }

  /** 1 when asleep on the bed (render blend). */
  get asleep(): number {
    return this.lieK;
  }

  dispose(): void {
    this.rig.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    (this.rig.mesh as SkinnedMesh).skeleton?.dispose();
    this.ownMat.dispose();
  }
}
