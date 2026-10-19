/**
 * Centripetal Catmull-Rom through a closed loop of control points (GDD 6.2 step 1), resampled to an even
 * arc-length polyline. Sim-safe math only (sqrt, no trig), so authored and UGC tracks build identically everywhere.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Knot spacing: centripetal (alpha = 0.5) on the planar distance. */
function knot(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.sqrt(Math.sqrt(dx * dx + dz * dz));
  return d < 1e-4 ? 1e-4 : d;
}

/** Barry–Goldman evaluation of one centripetal segment p1 → p2 at u in [0, 1]. */
function segPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number, out: Vec3): void {
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const lerp3 = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const k = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  };
  const a1 = lerp3(p0, p1, t0, t1);
  const a2 = lerp3(p1, p2, t1, t2);
  const a3 = lerp3(p2, p3, t2, t3);
  const b1 = lerp3(a1, a2, t0, t2);
  const b2 = lerp3(a2, a3, t1, t3);
  const c = lerp3(b1, b2, t1, t2);
  out.x = c.x;
  out.y = c.y;
  out.z = c.z;
}

export interface Polyline {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  /** arc length at each dense vertex */
  len: Float64Array;
  /** dense vertex index where control point k starts */
  pointAt: number[];
  total: number;
}

/** Dense polyline through the closed spline (`sub` vertices per segment). */
export function densePolyline(pts: readonly Vec3[], sub = 48): Polyline {
  const n = pts.length;
  const m = n * sub;
  const x = new Float64Array(m + 1);
  const y = new Float64Array(m + 1);
  const z = new Float64Array(m + 1);
  const len = new Float64Array(m + 1);
  const pointAt: number[] = [];
  const o: Vec3 = { x: 0, y: 0, z: 0 };
  let k = 0;
  for (let i = 0; i < n; i++) {
    pointAt.push(k);
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let j = 0; j < sub; j++) {
      segPoint(p0, p1, p2, p3, j / sub, o);
      x[k] = o.x;
      y[k] = o.y;
      z[k] = o.z;
      k++;
    }
  }
  x[m] = x[0];
  y[m] = y[0];
  z[m] = z[0];
  for (let i = 1; i <= m; i++) {
    const dx = x[i] - x[i - 1];
    const dz = z[i] - z[i - 1];
    len[i] = len[i - 1] + Math.sqrt(dx * dx + dz * dz);
  }
  return { x, y, z, len, pointAt, total: len[m] };
}

/** Resample a closed dense polyline to `count` points evenly spaced in planar arc length. */
export function resample(p: Polyline, count: number): { x: Float64Array; y: Float64Array; z: Float64Array; step: number } {
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const z = new Float64Array(count);
  const step = p.total / count;
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (j < p.len.length - 2 && p.len[j + 1] < s) j++;
    const seg = p.len[j + 1] - p.len[j];
    const f = seg > 1e-9 ? (s - p.len[j]) / seg : 0;
    x[i] = p.x[j] + (p.x[j + 1] - p.x[j]) * f;
    y[i] = p.y[j] + (p.y[j + 1] - p.y[j]) * f;
    z[i] = p.z[j] + (p.z[j + 1] - p.z[j]) * f;
  }
  return { x, y, z, step };
}
