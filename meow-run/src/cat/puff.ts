// The puff cloud (a fluffy cat-shaped cloud: ears, a curly tail, a sleepy face) and the leaf surfboard.
// Used as Mochi's attachments and registered as the 'cloud' and 'leaf' actors.
import * as THREE from 'three';
import type { ActorRig, ActorState } from '../core/types';
import { geo, outline, part, SPHERE, SPHERE_LO, toon, flat } from './toon';
import { hump } from './anim';

export interface PuffCloud {
  root: THREE.Group;
  /** t: time, hop: 0..1 squash from a hop landing, lean -1..1, speed u/s */
  animate(dt: number, t: number, hop: number, lean: number, speed: number): void;
}

/** Puff: about 2.6 u long, top surface at y = 0 (the rider sits there), facing +z. */
export function buildPuffCloud(): PuffCloud {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(0.85);
  const white = toon('cloud', 0xffffff, { emissive: 0xd8ecff, emissiveIntensity: 0.35 });
  const shade = toon('cloudShade', 0xdfeeff, { emissive: 0xb8d4ff, emissiveIntensity: 0.2 });
  const S = SPHERE();
  const puffs: THREE.Mesh[] = [];
  const P: [number, number, number, number][] = [
    // x, y, z, radius
    [0, -0.32, 0.1, 0.62],
    [0.55, -0.36, 0.35, 0.45],
    [-0.55, -0.36, 0.35, 0.45],
    [0.6, -0.38, -0.35, 0.48],
    [-0.6, -0.38, -0.35, 0.48],
    [0, -0.36, -0.7, 0.5],
    [0, -0.28, 0.75, 0.5], // head puff
    [0.35, -0.55, 0.0, 0.42],
    [-0.35, -0.55, 0.0, 0.42],
  ];
  for (let i = 0; i < P.length; i++) {
    const [x, y, z, r] = P[i];
    const m = part(S, i >= 7 ? shade : white, body, [x, y, z], [r * 1.15, r * 0.95, r * 1.05]);
    if (i < 7) outline(m, 0.05, 0x6b8fb8);
    puffs.push(m);
  }
  // cat ears on the head puff
  const earGeo = geo('cloudEar', () => new THREE.ConeGeometry(0.16, 0.34, 8).translate(0, 0.17, 0));
  for (const side of [-1, 1]) {
    const e = part(earGeo, white, body, [side * 0.26, 0.02, 0.88]);
    e.rotation.z = -side * 0.35;
    outline(e, 0.08, 0x6b8fb8);
  }
  // sleepy happy face on the front of the head puff: closed eyes and a cat smile
  const faceMat = flat('cloudFace', 0x5a7aa6);
  const arc = geo('cloudEye', () => new THREE.TorusGeometry(0.07, 0.018, 4, 10, Math.PI));
  for (const side of [-1, 1]) {
    const eye = part(arc, faceMat, body, [side * 0.18, -0.16, 1.27], [1, 1, 1], false);
    eye.rotation.set(0, 0, 0);
  }
  const blush = toon('cloudBlush', 0xffb3c6);
  for (const side of [-1, 1]) part(SPHERE_LO(), blush, body, [side * 0.3, -0.32, 1.13], [0.07, 0.04, 0.03], false);
  const smile = geo('cloudSmile', () => new THREE.TorusGeometry(0.045, 0.014, 4, 10, Math.PI));
  for (const side of [-1, 1]) {
    const m = part(smile, faceMat, body, [side * 0.045, -0.3, 1.29], [1, 1, 1], false);
    m.rotation.z = Math.PI;
  }
  // curly cloud tail at the back
  const tail: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 0.7;
    tail.push(part(S, white, body, [Math.sin(a) * 0.12, -0.15 + i * 0.18, -1.05 - Math.cos(a) * 0.12 - i * 0.05], [0.2 - i * 0.03, 0.2 - i * 0.03, 0.2 - i * 0.03]));
  }
  return {
    root,
    animate(_dt, t, hop, lean, speed) {
      for (let i = 0; i < puffs.length; i++) {
        const k = 1 + Math.sin(t * 3.2 + i * 1.7) * 0.05;
        const r = P[i][3];
        puffs[i].scale.set(r * 1.15 * k, r * 0.95 * (2 - k), r * 1.05 * k);
      }
      for (let i = 0; i < tail.length; i++) tail[i].position.x = Math.sin(t * 4 - i * 0.8) * (0.08 + i * 0.04);
      const squash = hop;
      body.scale.set(1 + squash * 0.18, 1 - squash * 0.25, 1 + squash * 0.1);
      body.position.y = Math.sin(t * 2.3) * 0.05 - squash * 0.08;
      body.rotation.z = -lean * 0.22;
      body.rotation.x = Math.sin(t * 1.7) * 0.03 - Math.min(0.12, speed * 0.003);
    },
  };
}

export interface LeafBoard {
  root: THREE.Group;
  animate(dt: number, t: number, lean: number, speed: number): void;
}

/** A big glossy leaf surfboard, ~1.6 u long, top at y = 0, pointing +z. */
export function buildLeaf(): LeafBoard {
  const root = new THREE.Group();
  const board = new THREE.Group();
  root.add(board);
  const leafGeo = geo('leaf', () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.85);
    s.bezierCurveTo(0.55, -0.55, 0.62, 0.35, 0, 0.95);
    s.bezierCurveTo(-0.62, 0.35, -0.55, -0.55, 0, -0.85);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 2, curveSegments: 16 });
    g.rotateX(-Math.PI / 2); // shape y -> -z... flip so the tip points +z
    g.rotateY(Math.PI);
    g.translate(0, -0.06, 0);
    return g;
  });
  const leaf = part(leafGeo, toon('leaf', 0x58c23a), board, [0, 0, 0]);
  outline(leaf, 0.04, 0x1f5a14);
  const rib = geo('leafRib', () => new THREE.BoxGeometry(0.035, 0.02, 1.55));
  part(rib, toon('leafRib', 0xb8f07a), board, [0, 0.005, 0.02], [1, 1, 1], false);
  const vein = geo('leafVein', () => new THREE.BoxGeometry(0.02, 0.015, 0.42));
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const v = part(vein, toon('leafRib', 0xb8f07a), board, [side * 0.16, 0.004, -0.45 + i * 0.32], [1, 1, 1], false);
      v.rotation.y = side * 0.75;
    }
  }
  // the stalk sticks out at the back
  const stalk = geo('leafStalk', () => new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6).rotateX(Math.PI / 2 + 0.25));
  part(stalk, toon('leafStalk', 0x3f8f2a), board, [0, 0.0, -1.0]);
  board.scale.setScalar(1.3);
  return {
    root,
    animate(_dt, t, lean, speed) {
      board.rotation.x = Math.sin(t * 3.1) * 0.05 - 0.04 - Math.min(0.06, speed * 0.002);
      board.rotation.z = -lean * 0.2 + Math.sin(t * 2.3) * 0.04;
      board.position.y = Math.sin(t * 4.2) * 0.03;
    },
  };
}

export function cloudActor(): ActorRig {
  const c = buildPuffCloud();
  let hopT = 9;
  return {
    root: c.root,
    animate(dt: number, t: number, st: ActorState) {
      if (st.action === 'hop') hopT = 0;
      hopT += dt;
      c.animate(dt, t, hump(Math.min(1, hopT / 0.3)), 0, st.speed);
    },
  };
}

export function leafActor(): ActorRig {
  const l = buildLeaf();
  return {
    root: l.root,
    animate(dt: number, t: number, st: ActorState) {
      l.animate(dt, t, 0, st.speed);
    },
  };
}
