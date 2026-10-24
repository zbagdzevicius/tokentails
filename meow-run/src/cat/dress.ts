// Wardrobe accessories on Mochi: hats on the head group, scarves round the neck (hip group). Every accessory is one
// merged, vertex-coloured geometry (one draw call + one outline on HIGH), cached per item and flagged shared, so
// building a rig is cheap and disposing one never frees them. Moving bits (the propeller, scarf tails, the cape) are
// small separate meshes the rig animates. Coordinates: head-local for hats (skull centre (0, .14, .03), radii
// (.34, .29, .30), ears at x = +-.18, y = .35), hip-local for scarves (torso centre (0, 0, -.03), radii (.25, .23, .35)).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { outline, toonRamp } from './toon';

const tmpC = new THREE.Color();
let mat: THREE.MeshToonMaterial | null = null;
/** the shared vertex-colour toon material for every accessory (rigs clone it only as ghosts) */
export function dressMat(): THREE.MeshToonMaterial {
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp(), side: THREE.DoubleSide });
    mat.userData.shared = true;
  }
  return mat;
}

/** paint a geometry one colour (vertex colours) */
function col(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  tmpC.setHex(color);
  for (let i = 0; i < n; i++) {
    a[i * 3] = tmpC.r;
    a[i * 3 + 1] = tmpC.g;
    a[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const sph = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const dome = (ws = 16) => new THREE.SphereGeometry(1, ws, 8, 0, Math.PI * 2, 0, Math.PI / 2);

/** merge pieces into one geometry centred on its bounding box; returns it and the centre (where the mesh goes) */
function merged(pieces: THREE.BufferGeometry[]): { g: THREE.BufferGeometry; c: THREE.Vector3 } {
  const g = mergeGeometries(pieces, false);
  if (!g) throw new Error('dress: geometry merge failed');
  for (const p of pieces) p.dispose();
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox!.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return { g, c };
}

const geoCache = new Map<string, { g: THREE.BufferGeometry; c: THREE.Vector3 }>();
function cached(key: string, make: () => THREE.BufferGeometry[]): { g: THREE.BufferGeometry; c: THREE.Vector3 } {
  let e = geoCache.get(key);
  if (!e) {
    e = merged(make());
    geoCache.set(key, e);
  }
  return e;
}

/** a rig's accessory: the object to attach, plus an optional per-frame animation (speed u/s, k = 0..1 run amount) */
export interface Dress {
  obj: THREE.Object3D;
  anim?(dt: number, t: number, speed: number): void;
}

function meshOf(key: string, make: () => THREE.BufferGeometry[], outlineK = 0.07): THREE.Mesh {
  const { g, c } = cached(key, make);
  const m = new THREE.Mesh(g, dressMat());
  m.position.copy(c);
  m.castShadow = true;
  if (outlineK > 0) outline(m, outlineK);
  return m;
}

// ---------------------------------------------------------------- hats (head-local)
function hatPieces(id: string, C: readonly number[]): THREE.BufferGeometry[] | null {
  switch (id) {
    case 'bow': {
      // a ribbon bow by the left ear
      const p: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        p.push(col(sph(1).scale(0.075, 0.05, 0.032).rotateZ(-s * 0.35).translate(s * 0.065, 0, 0), C[0]));
        p.push(col(new THREE.ConeGeometry(0.022, 0.07, 6).rotateZ(s * 0.5).translate(s * 0.03, -0.045, 0), C[0]));
      }
      p.push(col(sph(0.032), C[1]));
      for (const g of p) g.rotateZ(0.45).rotateY(-0.35).translate(0.15, 0.43, 0.1);
      return p;
    }
    case 'beanie': {
      const p = [
        col(dome().scale(0.15, 0.13, 0.19).translate(0, 0.39, 0.0), C[0]),
        col(new THREE.TorusGeometry(1, 0.2, 8, 20).rotateX(Math.PI / 2).scale(0.155, 0.16, 0.195).translate(0, 0.4, 0), C[2]),
        col(sph(0.055).translate(0, 0.53, -0.02), C[1]),
      ];
      for (const g of p) g.rotateX(-0.18);
      return p;
    }
    case 'party': {
      const p = [
        col(new THREE.CylinderGeometry(0.058, 0.088, 0.09, 14).translate(0, 0.045, 0), C[0]),
        col(new THREE.CylinderGeometry(0.03, 0.058, 0.09, 14).translate(0, 0.135, 0), C[1]),
        col(new THREE.CylinderGeometry(0.004, 0.03, 0.09, 14).translate(0, 0.225, 0), C[0]),
        col(sph(0.036).translate(0, 0.275, 0), C[2]),
      ];
      for (const g of p) g.rotateZ(-0.28).rotateX(-0.12).translate(-0.02, 0.4, 0.03);
      return p;
    }
    case 'flowers': {
      const p: THREE.BufferGeometry[] = [];
      const centre = new THREE.Vector3(0, 0.14, 0.03);
      const n = new THREE.Vector3();
      const t1 = new THREE.Vector3();
      const t2 = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const pos = new THREE.Vector3();
      const at = (deg: number, out: THREE.Vector3) => {
        const a = (deg * Math.PI) / 180;
        return out.set(Math.sin(a) * 0.205, 0.378, 0.03 + Math.cos(a) * 0.2);
      };
      for (let i = 0; i < 7; i++) {
        const deg = -60 + i * 20;
        at(deg, pos);
        n.copy(pos).sub(centre).divide(new THREE.Vector3(0.34 * 0.34, 0.29 * 0.29, 0.3 * 0.3)).normalize();
        t1.crossVectors(n, up).normalize();
        if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
        t2.crossVectors(n, t1).normalize();
        const petal = C[i % 3];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + i;
          const q = pos.clone().addScaledVector(n, 0.006).addScaledVector(t1, Math.cos(a) * 0.027).addScaledVector(t2, Math.sin(a) * 0.027);
          p.push(col(sph(0.021, 6, 4).translate(q.x, q.y, q.z), petal));
        }
        const cc = pos.clone().addScaledVector(n, 0.016);
        p.push(col(sph(0.016, 6, 4).translate(cc.x, cc.y, cc.z), C[3]));
        if (i < 6) {
          at(deg + 10, pos);
          p.push(col(sph(1, 6, 4).scale(0.03, 0.012, 0.018).rotateY((deg + 10) * (Math.PI / 180)).translate(pos.x, pos.y - 0.012, pos.z), C[4]));
        }
      }
      return p;
    }
    case 'chef': {
      const p = [
        col(new THREE.CylinderGeometry(0.105, 0.098, 0.1, 16).translate(0, 0.46, 0), C[1]),
        col(sph(0.088, 12, 9).translate(0, 0.585, 0), C[0]),
        col(sph(0.07, 12, 9).translate(0.065, 0.55, 0.01), C[0]),
        col(sph(0.07, 12, 9).translate(-0.065, 0.55, 0.01), C[0]),
        col(sph(0.07, 12, 9).translate(0, 0.55, 0.065), C[0]),
        col(sph(0.07, 12, 9).translate(0, 0.55, -0.06), C[0]),
      ];
      for (const g of p) g.rotateX(-0.12).translate(0, -0.02, 0.0);
      return p;
    }
    case 'propeller': {
      const p = [
        col(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI, 0, Math.PI / 2).scale(0.13, 0.1, 0.15).translate(0, 0.4, 0), C[0]),
        col(new THREE.SphereGeometry(1, 12, 8, Math.PI, Math.PI, 0, Math.PI / 2).scale(0.13, 0.1, 0.15).translate(0, 0.4, 0), C[1]),
        col(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.25).translate(0, 0.405, 0.07), C[2]),
        col(sph(0.022).translate(0, 0.5, 0), C[1]),
        col(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6).translate(0, 0.52, 0), 0x3a3a3a),
      ];
      for (const g of p) g.rotateX(-0.1);
      return p;
    }
    case 'crown': {
      const p = [col(new THREE.CylinderGeometry(0.108, 0.096, 0.065, 14, 1, true), C[0])];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const x = Math.sin(a) * 0.1;
        const z = Math.cos(a) * 0.1;
        p.push(col(new THREE.ConeGeometry(0.026, 0.075, 6).translate(x, 0.07, z), C[0]));
        p.push(col(sph(0.015, 6, 4).translate(x, 0.112, z), C[0]));
      }
      p.push(col(new THREE.TorusGeometry(0.104, 0.009, 4, 24).rotateX(Math.PI / 2).translate(0, -0.03, 0), C[1]));
      p.push(col(sph(0.021, 8, 6).translate(0, 0.0, 0.106), C[2]));
      for (const s of [-1, 1]) p.push(col(sph(0.017, 8, 6).translate(Math.sin(s * 0.9) * 0.104, 0.0, Math.cos(s * 0.9) * 0.104), C[3]));
      for (const g of p) g.rotateX(-0.14).rotateZ(0.12).translate(0, 0.46, 0.02);
      return p;
    }
    case 'witch': {
      const p = [
        col(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 22).translate(0, 0, 0), C[0]),
        col(new THREE.CylinderGeometry(0.075, 0.098, 0.03, 16).translate(0, 0.02, 0), C[2]),
        col(new THREE.CylinderGeometry(0.045, 0.092, 0.17, 16).translate(0, 0.115, 0), C[0]),
        col(new THREE.CylinderGeometry(0.003, 0.045, 0.14, 12).translate(0, 0.07, 0).rotateZ(0.6).translate(0, 0.2, 0), C[1]),
      ];
      for (const g of p) g.rotateZ(0.16).rotateX(-0.1).translate(0.0, 0.44, 0.0);
      return p;
    }
  }
  return null;
}

/** a hat for the head group (null = no hat) */
const HATS = new Set(['bow', 'beanie', 'party', 'flowers', 'chef', 'propeller', 'crown', 'witch']);
const SCARVES = new Set(['red', 'bell', 'bandana', 'bowtie', 'cape']);

export function buildHat(id: string, colors: readonly number[]): Dress | null {
  if (!HATS.has(id)) return null;
  const root = new THREE.Group();
  root.name = `hat.${id}`;
  const main = meshOf(`hat.${id}`, () => hatPieces(id, colors) ?? [], id === 'flowers' ? 0 : 0.06);
  root.add(main);
  if (id === 'propeller') {
    const prop = meshOf(
      'hat.propeller.blades',
      () => [
        col(new THREE.BoxGeometry(0.1, 0.008, 0.034).translate(0.055, 0, 0), colors[3]),
        col(new THREE.BoxGeometry(0.1, 0.008, 0.034).translate(-0.055, 0, 0), colors[2]),
        col(sph(0.014, 6, 4), colors[1]),
      ],
      0.08,
    );
    // the blades sit on the stick (the cap is tilted back by 0.1 rad)
    const spinner = new THREE.Group();
    spinner.position.set(0, 0.545, -0.054);
    spinner.rotation.x = -0.1;
    prop.position.set(0, 0, 0);
    spinner.add(prop);
    root.add(spinner);
    return {
      obj: root,
      anim: (dt, _t, speed) => {
        prop.rotation.y += dt * (5 + Math.min(30, speed) * 1.1);
      },
    };
  }
  return { obj: root };
}

// ---------------------------------------------------------------- scarves (hip-local)
/** the collar ring: centre (0, .137, .105), radius .22 x .2, tilted so the back rides over the shoulders */
const RING = { y: 0.137, z: 0.105, tilt: 0.6 };
const ring = (tube: number, color: number) => col(new THREE.TorusGeometry(0.21, tube, 8, 30).rotateX(Math.PI / 2).scale(1.05, 1, 0.95).rotateX(RING.tilt).translate(0, RING.y, RING.z), color);
/** a point on the ring at angle a (0 = front, PI = back), for knots and tails */
function ringPoint(a: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(Math.sin(a) * 0.21 * 1.05, 0, Math.cos(a) * 0.21 * 0.95);
  const y = out.y * Math.cos(RING.tilt) - out.z * Math.sin(RING.tilt);
  const z = out.y * Math.sin(RING.tilt) + out.z * Math.cos(RING.tilt);
  return out.set(out.x, y + RING.y, z + RING.z);
}

function scarfPieces(id: string, C: readonly number[]): THREE.BufferGeometry[] | null {
  const v = new THREE.Vector3();
  switch (id) {
    case 'red': {
      ringPoint(Math.PI * 0.82, v);
      return [ring(0.05, C[0]), col(sph(0.062, 10, 8).translate(v.x, v.y + 0.01, v.z), C[0])];
    }
    case 'bell':
      return [ring(0.028, C[0]), col(sph(0.046, 12, 9).translate(0, 0.0, 0.34), C[1]), col(new THREE.TorusGeometry(0.046, 0.006, 4, 16).rotateX(Math.PI / 2).translate(0, -0.005, 0.34), 0x9a6a10)];
    case 'bandana': {
      const tri = new THREE.ConeGeometry(0.13, 0.19, 3).rotateY(Math.PI).rotateX(Math.PI).scale(1, 1, 0.28).rotateX(0.35).translate(0, -0.03, 0.335);
      ringPoint(Math.PI, v);
      return [ring(0.03, C[0]), col(tri, C[0]), col(sph(0.045, 8, 6).translate(v.x, v.y + 0.02, v.z), C[0])];
    }
    case 'bowtie': {
      const p = [ring(0.022, C[0])];
      for (const s of [-1, 1]) p.push(col(new THREE.ConeGeometry(0.042, 0.085, 8).rotateZ(s * (Math.PI / 2)).scale(1, 1, 0.6).translate(s * 0.045, 0.01, 0.345), C[1]));
      p.push(col(sph(0.024, 8, 6).translate(0, 0.01, 0.35), C[1]));
      return p;
    }
    case 'cape':
      return [ring(0.026, C[1])];
  }
  return null;
}

/** a scarf for the hip group (null = none) */
export function buildScarf(id: string, colors: readonly number[]): Dress | null {
  if (!SCARVES.has(id)) return null;
  const pieces = () => scarfPieces(id, colors) ?? [];
  const root = new THREE.Group();
  root.name = `scarf.${id}`;
  root.add(meshOf(`scarf.${id}`, pieces, 0.06));
  if (id === 'red') {
    // two scarf tails streaming off the back left
    const pivot = new THREE.Group();
    const v = ringPoint(Math.PI * 0.82, new THREE.Vector3());
    pivot.position.set(v.x, v.y, v.z);
    const tails: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const m = meshOf(`scarf.red.tail${i}`, () => [col(new THREE.BoxGeometry(0.075, 0.014, 0.24 - i * 0.04).translate(0, 0, -(0.12 - i * 0.02)), i ? colors[1] : colors[0])], 0.08);
      m.position.set(i * 0.03, -i * 0.01, 0);
      m.rotation.y = 0.15 + i * 0.25;
      pivot.add(m);
      tails.push(m);
    }
    root.add(pivot);
    let flap = 0;
    return {
      obj: root,
      anim: (dt, t, speed) => {
        const k = Math.min(1, Math.max(0, speed - 3) / 16);
        flap += (k - flap) * Math.min(1, dt * 4);
        pivot.rotation.x = -1.15 * (1 - flap) - 0.12 * flap + Math.sin(t * 17) * 0.13 * flap;
        tails[1].rotation.x = Math.sin(t * 19 + 1) * 0.1 * flap;
      },
    };
  }
  if (id === 'cape') {
    // a hero cape: a flared half-tube over the back, hinged at the shoulders, lifting and fluttering with speed
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.25, 0.03);
    const cape = meshOf(
      'scarf.cape.cloth',
      () => {
        const len = 0.62;
        // a flat-topped cloth that widens and droops toward the hem (drapes over her back, never a fin)
        const drape = (g: THREE.BufferGeometry) => {
          const pa = g.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < pa.count; i++) {
            const k = Math.max(0, Math.min(1, -pa.getZ(i) / len));
            const x = pa.getX(i);
            pa.setX(i, x * (1 + 0.6 * k));
            pa.setY(i, pa.getY(i) - 0.1 * k * Math.min(1, Math.abs(x) / 0.25));
          }
          g.computeVertexNormals();
          return g;
        };
        const cloth = drape(new THREE.CylinderGeometry(0.3, 0.3, len, 14, 4, true, -1.15, 2.3).rotateX(-Math.PI / 2).translate(0, -0.28, -len / 2));
        const hem = drape(new THREE.CylinderGeometry(0.306, 0.306, 0.035, 14, 1, true, -1.15, 2.3).rotateX(-Math.PI / 2).translate(0, -0.28, -len + 0.012));
        return [col(cloth, colors[0]), col(hem, colors[1])];
      },
      0.03,
    );
    pivot.add(cape);
    root.add(pivot);
    let lift = 0;
    return {
      obj: root,
      anim: (dt, t, speed) => {
        const k = Math.min(1, Math.max(0, speed - 3) / 18);
        lift += (k - lift) * Math.min(1, dt * 3.5);
        pivot.rotation.x = -0.14 * (1 - lift) + 0.32 * lift + Math.sin(t * 15) * 0.07 * lift + Math.sin(t * 2.1) * 0.02;
        pivot.rotation.z = Math.sin(t * 9.5) * 0.05 * lift;
      },
    };
  }
  return { obj: root };
}
