/**
 * Reduced motion: where the still "TV camera" beside a loop stands (render-only). The piece skins dress a loop's sides
 * (Laundry's drum hubs and spokes, Shelter's wheel and its A-frame stand, Café's mug handle on one side), and a mirrored
 * track swaps those sides, so no single fixed spot works: one 16 m beside the loop centre, at its height, looked through
 * the hub and spokes on Laundry and Shelter and straight into the handle on mirrored Café.
 *
 * `chooseTvSpot` tries a short list of spots on both sides and picks the one whose sight lines to the kart round the
 * loop cross the fewest triangles of the drawn track (one pass over the triangles near the loop, done once per loop
 * and cached by the race view).
 */
import { Matrix4, Vector3, type BufferAttribute, type BufferGeometry, type Mesh, type Object3D } from 'three';
import type { BuiltPiece, BuiltTrack } from '../track/build';
import { LOOP_LP, LOOP_SHAPE } from '../track/stunt';
import { ribbonPose, shadowToWorld, type StuntPose } from '../render/stunt-pose';

export interface TvSpotCandidate {
  /** lateral offset from the loop centre (m, the sim's d axis) */
  side: number;
  /** height above the loop centre (m) */
  up: number;
}

/**
 * In order of preference (ties keep the earlier one). Raised 5 m: the sight line to the kart crosses the side dressing's
 * plane above the hub and below the rim, and the kart is still seen inside the ribbon over the top.
 */
export const TV_CANDIDATES: readonly TvSpotCandidate[] = [
  { side: -16, up: 5 },
  { side: 16, up: 5 },
  { side: -16, up: 3 },
  { side: 16, up: 3 },
  { side: -20, up: 6 },
  { side: 20, up: 6 },
  { side: -13, up: 6 },
  { side: 13, up: 6 },
  // the old spot (at the loop centre's height) and its mirror, last
  { side: -16, up: 0 },
  { side: 16, up: 0 },
];

/** A candidate spot in the world. */
export function tvSpotAt(t: BuiltTrack, pc: BuiltPiece, c: TvSpotCandidate, out: { x: number; y: number; z: number }): void {
  const L = LOOP_SHAPE;
  shadowToWorld(t, pc, L.lead + L.c * Math.PI, L.R + c.up, c.side, out);
}

/** The kart points round the loop the sight lines go to (both edges of the rail, kart height). */
export function tvTargets(t: BuiltTrack, pc: BuiltPiece): Vector3[] {
  const pose: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
  const out: Vector3[] = [];
  for (let su = 1; su < LOOP_LP - 1; su += 2.5)
    for (const sd of [-2, 2]) {
      ribbonPose(t, pc, su, sd, 0.7, pose);
      out.push(new Vector3(pose.x, pose.y, pose.z));
    }
  return out;
}

/** Sight lines stop this short of the kart (the deck and its edge strips right round the kart are not in the way). */
const NEAR_KART = 2;

const _m = new Matrix4();
const _v = new Vector3();

/** World-space triangles of every mesh under `root` with any part inside the box [min, max] (flat xyz triples). */
export function trianglesNear(root: Object3D, min: Vector3, max: Vector3): Float32Array {
  root.updateMatrixWorld(true);
  const tris: number[] = [];
  const p = [new Vector3(), new Vector3(), new Vector3()];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || !m.visible) return;
    const g = m.geometry as BufferGeometry;
    const pos = g.getAttribute('position') as BufferAttribute | undefined;
    if (!pos) return;
    _m.copy(m.matrixWorld);
    const idx = g.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let q = 0; q < 3; q++) p[q].fromBufferAttribute(pos, idx ? idx.getX(i + q) : i + q).applyMatrix4(_m);
      if (Math.max(p[0].x, p[1].x, p[2].x) < min.x || Math.min(p[0].x, p[1].x, p[2].x) > max.x) continue;
      if (Math.max(p[0].y, p[1].y, p[2].y) < min.y || Math.min(p[0].y, p[1].y, p[2].y) > max.y) continue;
      if (Math.max(p[0].z, p[1].z, p[2].z) < min.z || Math.min(p[0].z, p[1].z, p[2].z) > max.z) continue;
      tris.push(p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z, p[2].x, p[2].y, p[2].z);
    }
  });
  return new Float32Array(tris);
}

/** Does the segment a→b cross any triangle (Möller–Trumbore, both faces)? */
export function segmentBlocked(tris: Float32Array, a: Vector3, b: Vector3): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  for (let i = 0; i < tris.length; i += 9) {
    const e1x = tris[i + 3] - tris[i];
    const e1y = tris[i + 4] - tris[i + 1];
    const e1z = tris[i + 5] - tris[i + 2];
    const e2x = tris[i + 6] - tris[i];
    const e2y = tris[i + 7] - tris[i + 1];
    const e2z = tris[i + 8] - tris[i + 2];
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-9 && det < 1e-9) continue;
    const inv = 1 / det;
    const sx = a.x - tris[i];
    const sy = a.y - tris[i + 1];
    const sz = a.z - tris[i + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (s > 0 && s < 1) return true;
  }
  return false;
}

/** How many of the sight lines from `cam` to `targets` the triangles block. */
export function blockedSightLines(tris: Float32Array, cam: Vector3, targets: readonly Vector3[]): number {
  let n = 0;
  for (const k of targets) {
    const d = k.distanceTo(cam);
    if (d <= NEAR_KART) continue;
    _v.copy(k).sub(cam).multiplyScalar((d - NEAR_KART) / d).add(cam);
    if (segmentBlocked(tris, cam, _v)) n++;
  }
  return n;
}

/** The clearest TV spot for loop `pc` among TV_CANDIDATES, judged against the meshes under `root`, into `out`. */
export function chooseTvSpot(t: BuiltTrack, pc: BuiltPiece, root: Object3D, out: { x: number; y: number; z: number }): TvSpotCandidate {
  const targets = tvTargets(t, pc);
  const cams = TV_CANDIDATES.map((c) => {
    const p = { x: 0, y: 0, z: 0 };
    tvSpotAt(t, pc, c, p);
    return new Vector3(p.x, p.y, p.z);
  });
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of [...targets, ...cams]) {
    min.min(p);
    max.max(p);
  }
  const tris = trianglesNear(root, min, max);
  let best = 0;
  let bestN = Infinity;
  for (let i = 0; i < cams.length; i++) {
    const n = blockedSightLines(tris, cams[i], targets);
    if (n < bestN) {
      bestN = n;
      best = i;
      if (n === 0) break;
    }
  }
  out.x = cams[best].x;
  out.y = cams[best].y;
  out.z = cams[best].z;
  return TV_CANDIDATES[best];
}
