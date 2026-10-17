/**
 * L-DJ: pink bow confetti, one instanced draw. Geometry is a procedural ribbon bow (two curved
 * loops, a knot and two tails, slightly cupped so it catches the light as it tumbles). Motion is
 * BowSim (confetti-sim.ts).
 */
import {
  BufferGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { BowSim, type BurstOptions, type Rng } from './confetti-sim';
import { PALETTE } from '../config';
import { bowMaterial } from './materials';

/** Lobe reach from the knot (m): the bow is ~0.55 m wide, ~3–5% of a hero frame (reference). */
export const BOW_W = 0.26;
/** The shape below is drawn for a 0.16 m lobe, then scaled up to BOW_W. */
const BASE_W = 0.16;

/**
 * A glossy ribbon bow in its XY plane, face towards +Z (reference: clearly bow-shaped hot-pink
 * bows): two full rounded lobes, a round centre knot and two short notched tails (no long
 * streamers, which read as butterflies or propellers). Slightly cupped so it catches the light.
 */
export function bowGeometry(): BufferGeometry {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const W = BASE_W;
  const N = 16;
  for (const side of [-1, 1]) {
    // Lobe: a fat teardrop fan from the knot, widest at ~70% of its reach, cupped towards +z.
    const pts: number[][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = -Math.PI * 0.5 + Math.PI * t; // bottom → top round the far end
      const r = W * (0.55 + 0.45 * Math.cos(a) ** 0.6);
      const x = side * (0.022 + Math.cos(a) * r);
      const y = Math.sin(a) * W * 0.62 * (0.55 + 0.45 * Math.cos(a));
      const z = 0.035 * Math.cos(a) * (Math.abs(x) / W);
      pts.push([x, y, z]);
    }
    const c = [side * 0.015, 0, 0.012];
    for (let i = 0; i < N; i++) {
      if (side > 0) tri(c, pts[i], pts[i + 1]);
      else tri(c, pts[i + 1], pts[i]);
    }
    // Tail: a short ribbon hanging down-out with a notched end.
    const tx = side * 0.06;
    const a0 = [side * 0.01, -0.022, 0.006];
    const a1 = [side * 0.038, -0.022, 0.006];
    const b0 = [tx - side * 0.02, -0.09, 0.0];
    const b1 = [tx + side * 0.026, -0.085, 0.0];
    const notch = [tx + side * 0.003, -0.074, 0.0];
    if (side > 0) {
      tri(a0, b0, a1);
      tri(a1, b0, notch);
      tri(a1, notch, b1);
    } else {
      tri(a0, a1, b0);
      tri(a1, notch, b0);
      tri(a1, b1, notch);
    }
  }
  // Knot: a round puck in front of the lobes.
  const K = 10;
  const kr = 0.032;
  for (let i = 0; i < K; i++) {
    const a0 = (i / K) * Math.PI * 2;
    const a1 = ((i + 1) / K) * Math.PI * 2;
    tri([0, 0, 0.03], [Math.cos(a0) * kr, Math.sin(a0) * kr * 1.15, 0.022], [Math.cos(a1) * kr, Math.sin(a1) * kr * 1.15, 0.022]);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.scale(BOW_W / BASE_W, BOW_W / BASE_W, BOW_W / BASE_W);
  g.computeVertexNormals();
  return g;
}

export interface Bows {
  mesh: InstancedMesh;
  sim: BowSim;
  burst(n: number, o: BurstOptions, rng?: Rng): number;
  /** `camera`: world position the airborne bows face (they only tilt ±35° from it). */
  update(dt: number, kick: number, camera: Vector3): void;
  setLimit(n: number): void;
  dispose(): void;
}

export function buildBows(capacity: number, limit: number): Bows {
  const geo = bowGeometry();
  const shade = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  shade.setUsage(DynamicDrawUsage);
  geo.setAttribute('aShade', shade);
  const mat = bowMaterial(PALETTE.pawPink);
  const mesh = new InstancedMesh(geo, mat, capacity);
  mesh.name = 'dj-bows';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const sim = new BowSim(capacity, limit);

  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  const face = new Matrix4();
  const qFace = new Quaternion();
  const UP = new Vector3(0, 1, 0);

  return {
    mesh,
    sim,
    burst: (n, o, rng) => sim.burst(n, o, rng),
    setLimit(n) {
      sim.setLimit(n);
    },
    update(dt, kick, camera) {
      sim.step(dt);
      const arr = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < sim.count; i++) {
        const j = i * 3;
        p.set(sim.pos[j], sim.pos[j + 1], sim.pos[j + 2]);
        e.set(sim.rot[j], sim.rot[j + 1], sim.rot[j + 2]);
        q.setFromEuler(e);
        if (sim.landed[i] < 0) {
          // Airborne: face the camera (+Z towards it), then the sim's small flutter tilt.
          face.lookAt(camera, p, UP);
          qFace.setFromRotationMatrix(face);
          q.premultiply(qFace);
        }
        const sc = sim.scaleOf(i);
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        m.toArray(arr, i * 16);
        shade.array[i] = sim.look[i * 4 + 3];
      }
      mesh.count = sim.count;
      mesh.instanceMatrix.needsUpdate = true;
      shade.needsUpdate = true;
      mat.uniforms.uKick.value = kick;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
