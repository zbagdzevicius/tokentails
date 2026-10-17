/**
 * Clip loudness (round 3: the clip measured -23.5 LUFS; TikTok/Reels sit at -14). Pure Float32Array maths, no
 * WebAudio, so it runs on the rendered clip buffer and in Node tests.
 * - integratedLufs: ITU-R BS.1770-4 (K-weighting, 400 ms blocks with 75 % overlap, -70 LUFS absolute and -10 LU
 *   relative gates).
 * - normalizeClip: input gain (found by a scan) into a look-ahead peak limiter at the ceiling (sample peak;
 *   -1 dBFS sample peak keeps true peak near -1 dBTP at 48 kHz for this material).
 */

export const CLIP_TARGET_LUFS = -14;
export const CLIP_CEILING_DB = -1;

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** BS.1770 K-weighting filters (pre-filter shelf + RLB high-pass) for any sample rate. */
export function kWeighting(fs: number): [Biquad, Biquad] {
  // stage 1: high shelf
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // stage 2: high-pass
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const o = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = o;
    y[i] = o;
  }
  return y;
}

/** Integrated loudness in LUFS; -Infinity for silence. */
export function integratedLufs(channels: readonly Float32Array[], fs: number): number {
  if (!channels.length || !channels[0].length) return -Infinity;
  const [s1, s2] = kWeighting(fs);
  const w = channels.map((c) => filter(filter(c, s1), s2));
  const n = w[0].length;
  const block = Math.round(0.4 * fs);
  const hop = Math.max(1, Math.round(0.1 * fs));
  const z: number[] = [];
  if (n < block) {
    let sum = 0;
    for (const c of w) {
      let m = 0;
      for (let i = 0; i < n; i++) m += c[i] * c[i];
      sum += m / n;
    }
    z.push(sum);
  } else {
    for (let start = 0; start + block <= n; start += hop) {
      let sum = 0;
      for (const c of w) {
        let m = 0;
        for (let i = start; i < start + block; i++) m += c[i] * c[i];
        sum += m / block;
      }
      z.push(sum);
    }
  }
  const lk = (v: number): number => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => v > 0 && lk(v) > -70);
  if (!abs.length) return -Infinity;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = lk(mean) - 10;
  const gated = abs.filter((v) => lk(v) > rel);
  if (!gated.length) return -Infinity;
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/** Sample peak in dBFS across channels. */
export function peakDb(channels: readonly Float32Array[]): number {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
}

/**
 * In-place look-ahead limiter: the gain at each sample is the minimum needed over the next 2 ms (instant attack),
 * recovering over ~60 ms. A final clamp guarantees the ceiling.
 */
export function limitInPlace(channels: Float32Array[], fs: number, ceiling: number): void {
  const n = channels[0]?.length ?? 0;
  if (!n) return;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of channels) p = Math.max(p, Math.abs(c[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  const la = Math.max(1, Math.round(0.002 * fs));
  // forward-looking window minimum (monotonic deque)
  const g = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const end = Math.min(n - 1, i + la);
    for (; j <= end; j++) {
      while (tail > head && need[dq[tail - 1]] >= need[j]) tail--;
      dq[tail++] = j;
    }
    while (dq[head] < i) head++;
    g[i] = need[dq[head]];
  }
  const rel = 1 - Math.exp(-1 / (0.06 * fs));
  let env = 1;
  for (let i = 0; i < n; i++) {
    const t = g[i];
    env = t < env ? t : env + (t - env) * rel;
    for (const c of channels) {
      const v = c[i] * env;
      c[i] = v > ceiling ? ceiling : v < -ceiling ? -ceiling : v;
    }
  }
}

/**
 * Bring a clip mix to `target` LUFS with peaks at or under `ceilingDb`. In place; returns the final loudness.
 * The input gain is searched on copies (a coarse 2 dB scan, then 1 / 0.5 / 0.25 dB refinements): BS.1770 gating
 * makes loudness after the limiter jump on quiet-bed-plus-crash mixes, so a closed-form gain misses.
 */
export function normalizeClip(channels: Float32Array[], fs: number, target = CLIP_TARGET_LUFS, ceilingDb = CLIP_CEILING_DB): number {
  const ceiling = Math.pow(10, ceilingDb / 20);
  const L0 = integratedLufs(channels, fs);
  if (!Number.isFinite(L0)) return L0;
  const render = (db: number): { out: Float32Array[]; L: number } => {
    const g = Math.pow(10, db / 20);
    const out = channels.map((c) => {
      const o = new Float32Array(c.length);
      for (let i = 0; i < c.length; i++) o[i] = c[i] * g;
      return o;
    });
    limitInPlace(out, fs, ceiling);
    return { out, L: integratedLufs(out, fs) };
  };
  // never boost by more than 24 dB (a near-silent clip stays quiet rather than turning into noise). Gating can
  // make loudness jump as the limiter flattens the crashes, so: a coarse 2 dB scan, then refine around the best.
  const lo = Math.min(0, target - L0);
  const hi = Math.max(lo, Math.min(24, target - L0 + 12));
  let best = render(lo);
  let bestDb = lo;
  for (let db = lo + 2; db <= hi + 1e-9 && Math.abs(best.L - target) > 0.25; db += 2) {
    const r = render(db);
    if (Math.abs(r.L - target) < Math.abs(best.L - target)) {
      best = r;
      bestDb = db;
    }
    if (r.L > target + 3) break;
  }
  for (const step of [1, 0.5, 0.25]) {
    if (Math.abs(best.L - target) <= 0.25) break;
    const db = best.L < target ? bestDb + step : bestDb - step;
    const r = render(db);
    if (Math.abs(r.L - target) < Math.abs(best.L - target)) {
      best = r;
      bestDb = db;
    }
  }
  for (let c = 0; c < channels.length; c++) channels[c].set(best.out[c]);
  return best.L;
}
