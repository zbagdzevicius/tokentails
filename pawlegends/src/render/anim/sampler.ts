/**
 * Zero-allocation clip sampler (ANIM-SPEC §3, §4.4). Override clips slerp the layer buffers toward the clip pose by
 * `w × mask[bone]`; additive clips multiply `slerp(I, Δ, w × mask)` on top. A cursor caches the key segment, so a
 * forward-playing clip finds its segment in O(1). Per frame: no `new`, no literals, no closures.
 */
import * as THREE from 'three';
import { ease } from './ease';
import { BONES } from './masks';
import type { ClipBin } from './compile';

export interface Cursor {
  k: number;
}

const _a = new THREE.Quaternion();
const _b = new THREE.Quaternion();
const _i = new THREE.Quaternion();

/** Segment start key for time t (cursor-cached). */
export function segmentAt(bin: ClipBin, t: number, cur: Cursor): number {
  const T = bin.times;
  const n = bin.nKeys;
  let k = cur.k;
  if (k < 0 || k >= n || T[k] > t) k = 0;
  while (k + 1 < n && T[k + 1] <= t) k++;
  cur.k = k;
  return k;
}

/** Sample `bin` at clip time `t` into the layer buffers. `mode` 0 override, 1 additive. */
export function sampleClip(bin: ClipBin, t: number, outQ: THREE.Quaternion[], outP: THREE.Vector3[], mask: Float32Array, w: number, mode: 0 | 1, cur: Cursor): void {
  if (w <= 0) return;
  const k = segmentAt(bin, t, cur);
  const n = bin.nKeys;
  const k1 = k + 1 < n ? k + 1 : k;
  const t0 = bin.times[k];
  const t1 = bin.times[k1];
  const u = k1 === k || t1 <= t0 ? 0 : ease(bin.ease[k1], (t - t0) / (t1 - t0));
  const Q = bin.q;
  const P = bin.p;
  for (let b = 0; b < BONES; b++) {
    const m = w * mask[b];
    if (m <= 0) continue;
    const i0 = (k * BONES + b) * 4;
    const i1 = (k1 * BONES + b) * 4;
    _a.set(Q[i0], Q[i0 + 1], Q[i0 + 2], Q[i0 + 3]);
    if (u !== 0) {
      _b.set(Q[i1], Q[i1 + 1], Q[i1 + 2], Q[i1 + 3]);
      slerpOver(_a, _b, u);
    }
    if (mode === 1) {
      _i.identity();
      _i.slerp(_a, m > 1 ? 1 : m);
      outQ[b].multiply(_i);
    } else {
      outQ[b].slerp(_a, m > 1 ? 1 : m);
      const j0 = (k * BONES + b) * 3;
      const j1 = (k1 * BONES + b) * 3;
      const x = P[j0] + (P[j1] - P[j0]) * u;
      const y = P[j0 + 1] + (P[j1 + 1] - P[j0 + 1]) * u;
      const z = P[j0 + 2] + (P[j1 + 2] - P[j0 + 2]) * u;
      const v = outP[b];
      const mm = m > 1 ? 1 : m;
      v.x += (x - v.x) * mm;
      v.y += (y - v.y) * mm;
      v.z += (z - v.z) * mm;
    }
  }
}

/** slerp that keeps an overshooting ease (back, elastic: u > 1) as an extrapolation instead of clamping it. */
function slerpOver(a: THREE.Quaternion, b: THREE.Quaternion, u: number): void {
  if (u <= 1) {
    a.slerp(b, u);
    return;
  }
  // b = a · Δ, so a · Δ^u = b · Δ^(u − 1): past b by (u − 1) of the same arc
  _i.copy(a).invert().multiply(b);
  a.copy(b);
  _b.identity().slerp(_i, Math.min(1, u - 1));
  a.multiply(_b);
}

/** Sample one root channel's [t, v, ease] triples at t (linear scan: ≤ ~10 keys). NaN when the channel is absent. */
export function sampleScalar(arr: Float32Array | null, t: number): number {
  if (!arr) return NaN;
  const n = arr.length / 3;
  if (n === 0) return NaN;
  if (t <= arr[0]) return arr[1];
  for (let i = 1; i < n; i++) {
    const t1 = arr[i * 3];
    if (t < t1) {
      const t0 = arr[(i - 1) * 3];
      const v0 = arr[(i - 1) * 3 + 1];
      const v1 = arr[i * 3 + 1];
      const u = t1 > t0 ? ease(arr[i * 3 + 2], (t - t0) / (t1 - t0)) : 1;
      return v0 + (v1 - v0) * u;
    }
  }
  return arr[(n - 1) * 3 + 1];
}
