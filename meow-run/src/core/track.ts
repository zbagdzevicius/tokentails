// The spline track. FROZEN. Pure (three math only, node-importable).
// The track is a dense polyline sampled every DS = 1 u of arc length, so s is exact distance.
// PathBuilder (path.ts) appends samples; Track.fromPoints() resamples authored control points (Catmull-Rom).
// Queries interpolate between samples. They never allocate: pass an out object.
import * as THREE from 'three';
import { SEGMENT_KINDS, type Segment, type SegmentKind, type TrackFrame } from './types';

export const DS = 1;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
let _i = 0;
let _t = 0;

function lerp3(arr: number[], i: number, j: number, t: number, v: THREE.Vector3): THREE.Vector3 {
  return v.set(arr[i * 3] + (arr[j * 3] - arr[i * 3]) * t, arr[i * 3 + 1] + (arr[j * 3 + 1] - arr[i * 3 + 1]) * t, arr[i * 3 + 2] + (arr[j * 3 + 2] - arr[i * 3 + 2]) * t);
}

export function newFrame(): TrackFrame {
  return {
    s: 0,
    pos: new THREE.Vector3(),
    fwd: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: 10,
    bank: 0,
    kind: 'ground',
  };
}

export class Track {
  /** sample i sits at s = i * DS */
  private p: number[] = []; // xyz
  private f: number[] = []; // fwd xyz
  private r: number[] = []; // right xyz
  private u: number[] = []; // up xyz
  private w: number[] = [];
  private bk: number[] = [];
  private k: number[] = []; // kind index of [s_i, s_i+1)
  /** samples dropped from the front by trimBefore (endless): local index i sits at s = (base + i) * DS */
  private base = 0;
  readonly segments: Segment[] = [];

  get samples(): number {
    return this.w.length;
  }
  /** total length (u) */
  get length(): number {
    return Math.max(0, this.base + this.w.length - 1) * DS;
  }
  /** the first s still stored (0 unless trimmed) */
  get start(): number {
    return this.base * DS;
  }

  /**
   * Endless: forget everything before s (keeps a long run's arrays bounded). Queries before the new start clamp to
   * it. Keeps at least 2 samples.
   */
  trimBefore(s: number): void {
    const drop = Math.min(this.w.length - 2, Math.floor(s / DS) - this.base);
    if (drop <= 0) return;
    this.p.splice(0, drop * 3);
    this.f.splice(0, drop * 3);
    this.r.splice(0, drop * 3);
    this.u.splice(0, drop * 3);
    this.w.splice(0, drop);
    this.bk.splice(0, drop);
    this.k.splice(0, drop);
    this.base += drop;
    const s0 = this.base * DS;
    let g = 0;
    while (g < this.segments.length - 1 && this.segments[g].s1 <= s0) g++;
    if (g > 0) this.segments.splice(0, g);
  }

  /**
   * Append one sample DS after the previous one (PathBuilder does this). `kind` is the surface of the stretch
   * from the previous sample to this one; the very first sample's kind is ignored.
   */
  push(x: number, y: number, z: number, width: number, bank: number, kind: SegmentKind): void {
    this.p.push(x, y, z);
    this.f.push(0, 0, 1);
    this.r.push(-1, 0, 0);
    this.u.push(0, 1, 0);
    this.w.push(width);
    this.bk.push(bank);
    const ki = Math.max(0, SEGMENT_KINDS.indexOf(kind));
    this.k.push(ki);
    const n = this.w.length;
    if (n < 2) return;
    this.k[n - 2] = ki; // sample i's kind covers [s_i, s_i+1)
    // frames: central difference for the previous sample, backward difference for this one
    if (n >= 3) this.frameAt(n - 2, n - 3, n - 1);
    else this.frameAt(0, 0, 1);
    this.frameAt(n - 1, n - 2, n - 1);
    const s0 = (this.base + n - 2) * DS;
    const s1 = (this.base + n - 1) * DS;
    const last = this.segments[this.segments.length - 1];
    if (last && last.kind === kind) last.s1 = s1;
    else this.segments.push({ kind, s0, s1 });
  }

  private frameAt(i: number, a: number, b: number): void {
    _a.set(this.p[b * 3] - this.p[a * 3], this.p[b * 3 + 1] - this.p[a * 3 + 1], this.p[b * 3 + 2] - this.p[a * 3 + 2]);
    if (_a.lengthSq() < 1e-9) _a.set(0, 0, 1);
    _a.normalize();
    // unbanked right = fwd x worldUp (falls back to the flat heading when the path is near vertical)
    _r.crossVectors(_a, UP);
    if (_r.lengthSq() < 1e-6) _r.set(this.r[i * 3], 0, this.r[i * 3 + 2]);
    _r.normalize();
    _u.crossVectors(_r, _a).normalize();
    const bank = this.bk[i];
    if (bank !== 0) {
      const c = Math.cos(bank);
      const sn = Math.sin(bank);
      // + bank lowers the right side: up leans right, right dips down
      _b.copy(_u).multiplyScalar(c).addScaledVector(_r, sn);
      _r.multiplyScalar(c).addScaledVector(_u, -sn);
      _u.copy(_b);
    }
    this.f[i * 3] = _a.x;
    this.f[i * 3 + 1] = _a.y;
    this.f[i * 3 + 2] = _a.z;
    this.r[i * 3] = _r.x;
    this.r[i * 3 + 1] = _r.y;
    this.r[i * 3 + 2] = _r.z;
    this.u[i * 3] = _u.x;
    this.u[i * 3 + 1] = _u.y;
    this.u[i * 3 + 2] = _u.z;
  }

  /** sets the module-level _i/_t (sample index and fraction) for s */
  private idx(s: number): void {
    const n = this.w.length;
    if (n < 2) {
      _i = 0;
      _t = 0;
      return;
    }
    const q = Math.max(0, Math.min(this.length, s) / DS - this.base);
    _i = Math.min(n - 2, Math.floor(q));
    _t = q - _i;
  }

  /**
   * Full frame at s (clamped to [0, length]; past the end the position extrapolates straight ahead).
   * Allocation-free.
   */
  sample(s: number, out: TrackFrame): TrackFrame {
    const n = this.w.length;
    out.s = s;
    if (n === 0) return out;
    if (n === 1) {
      out.pos.set(this.p[0], this.p[1], this.p[2]);
      out.width = this.w[0];
      return out;
    }
    this.idx(s);
    const i = _i;
    const t = _t;
    const j = i + 1;
    lerp3(this.p, i, j, t, out.pos);
    lerp3(this.f, i, j, t, out.fwd).normalize();
    lerp3(this.r, i, j, t, out.right).normalize();
    lerp3(this.u, i, j, t, out.up).normalize();
    out.width = this.w[i] + (this.w[j] - this.w[i]) * t;
    out.bank = this.bk[i] + (this.bk[j] - this.bk[i]) * t;
    out.kind = SEGMENT_KINDS[this.k[i]];
    if (s > this.length) out.pos.addScaledVector(out.fwd, s - this.length);
    else if (s < this.start) out.pos.addScaledVector(out.fwd, s - this.start);
    return out;
  }

  /** World position of track point (s, x, y). */
  toWorld(s: number, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    this.sample(s, scratch);
    return out.copy(scratch.pos).addScaledVector(scratch.right, x).addScaledVector(scratch.up, y);
  }

  kindAt(s: number): SegmentKind {
    const n = this.w.length;
    if (n === 0) return 'ground';
    const i = Math.max(0, Math.min(n - 1, Math.floor(s / DS) - this.base));
    return SEGMENT_KINDS[this.k[i]];
  }

  widthAt(s: number): number {
    const n = this.w.length;
    if (n === 0) return 10;
    if (n === 1) return this.w[0];
    this.idx(s);
    return this.w[_i] + (this.w[_i + 1] - this.w[_i]) * _t;
  }

  /** The segment containing s (binary search). */
  segmentAt(s: number): Segment {
    const g = this.segments;
    if (g.length === 0) return { kind: 'ground', s0: 0, s1: 0 };
    let lo = 0;
    let hi = g.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (g[m].s0 <= s) lo = m;
      else hi = m - 1;
    }
    return g[lo];
  }

  /** The next segment of `kind` that starts at or after s, or null. */
  nextSegment(s: number, kind: SegmentKind): Segment | null {
    for (const g of this.segments) if (g.kind === kind && g.s0 >= s) return g;
    return null;
  }

  /** Resample authored control points (centripetal Catmull-Rom) into a track. Widths/banks/kinds per point apply forward. */
  static fromPoints(points: { x: number; y: number; z: number; width?: number; bank?: number; kind?: SegmentKind }[]): Track {
    const t = new Track();
    if (points.length < 2) throw new Error('Track.fromPoints needs 2+ points');
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'centripetal',
    );
    const len = curve.getLength();
    const n = Math.max(2, Math.round(len / DS) + 1);
    const lengths = curve.getLengths(points.length * 50);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = Math.min(1, (i * DS) / len);
      curve.getPointAt(u, v);
      // which control segment are we in (for width/bank/kind)
      const d = u * len;
      let seg = 0;
      const per = lengths.length - 1;
      for (let k = 0; k < per; k++) if (lengths[k] <= d) seg = Math.floor((k / per) * (points.length - 1));
      const a = points[seg];
      const b = points[Math.min(points.length - 1, seg + 1)];
      t.push(v.x, v.y, v.z, a.width ?? b.width ?? 10, ((a.bank ?? 0) * Math.PI) / 180, a.kind ?? 'ground');
    }
    return t;
  }
}

const scratch = newFrame();
