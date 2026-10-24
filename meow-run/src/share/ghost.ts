// Ghost runs (SHARE lane), the pure part: the recording tape, the compact binary pack, and playback sampling.
// Node-importable (no DOM, no engine).
//
// A ghost is the player's track-space position sampled every 1/hz s of run time (G.time): s (along the track),
// x (lateral), y (height above the surface) and flags. Packed format (little-endian):
//   u8 hz, u16 n, then the samples in groups of 8. Each group starts with 4 flag bytes (bit planes: slide, airborne,
//   ability, cut; bit j = sample j of the group), then per sample:
//     ds  u8   advance in 1/8 u since the previous sample (0..254); 255 = keyframe: a u32 absolute s in 1/8 u follows
//              (the first sample, respawns, teleports or anything out of range)
//     x   i8   lateral offset in 0.1 u (+-12.7)
//     y   u8   height in 0.08 u (0..20.4; below the surface clamps to 0)
// s is quantised against the reconstructed value (error feedback), so the error never accumulates (<= 1/16 u).
// CUT marks a discontinuity (respawn, fall teleport): playback never interpolates across it.

export const GHOST_HZ = 6;
export const F_SLIDE = 1;
export const F_AIR = 2;
export const F_ABILITY = 4;
export const F_CUT = 8;
const PLANES = [F_SLIDE, F_AIR, F_ABILITY, F_CUT];
const DS_Q = 8;
const X_Q = 10;
const Y_Q = 0.08;
const KEY = 255;
export const GHOST_MAX_SAMPLES = 65535;

export interface Ghost {
  hz: number;
  n: number;
  s: Float64Array;
  x: Float64Array;
  y: Float64Array;
  flags: Uint8Array;
}
export interface GhostSample {
  s: number;
  x: number;
  y: number;
  flags: number;
}
/** sampleAt output (reuse one object: no allocation per frame) */
export interface GhostPoint extends GhostSample {
  /** u/s along the track */
  speed: number;
  /** t is inside the recording */
  inside: boolean;
}
export const newPoint = (): GhostPoint => ({ s: 0, x: 0, y: 0, flags: 0, speed: 0, inside: false });

export function emptyGhost(hz: number, cap: number): Ghost {
  return { hz, n: 0, s: new Float64Array(cap), x: new Float64Array(cap), y: new Float64Array(cap), flags: new Uint8Array(cap) };
}

/** A fixed-capacity recording buffer (push is allocation-free; it stops at the cap). */
export class GhostTape {
  readonly g: Ghost;
  constructor(readonly cap = GHOST_HZ * 60 * 20, hz = GHOST_HZ) {
    this.g = emptyGhost(hz, cap);
  }
  get n(): number {
    return this.g.n;
  }
  get full(): boolean {
    return this.g.n >= this.cap;
  }
  clear(): void {
    this.g.n = 0;
  }
  push(s: number, x: number, y: number, flags: number): void {
    const g = this.g;
    if (g.n >= this.cap) return;
    g.s[g.n] = s;
    g.x[g.n] = x;
    g.y[g.n] = y;
    g.flags[g.n] = flags;
    g.n++;
  }
  /** a trimmed copy */
  snapshot(): Ghost {
    return ghostFrom(this.g, this.g.n);
  }
}

function ghostFrom(src: Ghost, n: number): Ghost {
  const out = emptyGhost(src.hz, n);
  out.n = n;
  out.s.set(src.s.subarray(0, n));
  out.x.set(src.x.subarray(0, n));
  out.y.set(src.y.subarray(0, n));
  out.flags.set(src.flags.subarray(0, n));
  return out;
}

/** samples -> a Ghost (tests, test hooks) */
export function ghostOf(samples: readonly GhostSample[], hz = GHOST_HZ): Ghost {
  const g = emptyGhost(hz, samples.length);
  for (const p of samples) {
    g.s[g.n] = +p.s || 0;
    g.x[g.n] = +p.x || 0;
    g.y[g.n] = +p.y || 0;
    g.flags[g.n] = (p.flags | 0) & 15;
    g.n++;
  }
  return g;
}

const clampHz = (hz: number) => Math.max(1, Math.min(30, Math.round(hz) || GHOST_HZ));

/** Pack a ghost (or samples) into bytes. At most GHOST_MAX_SAMPLES samples are kept. */
export function packGhost(src: Ghost | readonly GhostSample[], hz?: number): Uint8Array {
  const g = Array.isArray(src) ? ghostOf(src as GhostSample[], hz ?? GHOST_HZ) : (src as Ghost);
  const n = Math.min(g.n, GHOST_MAX_SAMPLES);
  // worst case: every sample a keyframe (7 bytes) + 4 flag bytes per 8
  const out = new Uint8Array(3 + n * 7 + Math.ceil(n / 8) * 4);
  let o = 0;
  out[o++] = clampHz(hz ?? g.hz);
  out[o++] = n & 255;
  out[o++] = n >>> 8;
  let q = 0; // reconstructed s in 1/8 u
  for (let g0 = 0; g0 < n; g0 += 8) {
    const end = Math.min(n, g0 + 8);
    for (const bit of PLANES) {
      let b = 0;
      for (let i = g0; i < end; i++) if (g.flags[i] & bit) b |= 1 << (i - g0);
      out[o++] = b;
    }
    for (let i = g0; i < end; i++) {
      const target = Math.max(0, Math.min(0xffffffff, Math.round(g.s[i] * DS_Q)));
      const d = target - q;
      if (i > 0 && d >= 0 && d < KEY) {
        out[o++] = d;
        q += d;
      } else {
        out[o++] = KEY;
        out[o++] = target & 255;
        out[o++] = (target >>> 8) & 255;
        out[o++] = (target >>> 16) & 255;
        out[o++] = (target >>> 24) & 255;
        q = target;
      }
      const xi = Math.max(-127, Math.min(127, Math.round(g.x[i] * X_Q)));
      out[o++] = xi & 255;
      out[o++] = Math.max(0, Math.min(255, Math.round(g.y[i] / Y_Q)));
    }
  }
  return out.slice(0, o);
}

/** Bytes -> a Ghost, or null when malformed (never throws). An empty byte array is null too. */
export function unpackGhost(bytes: Uint8Array | null | undefined): Ghost | null {
  try {
    if (!bytes || bytes.length < 3) return null;
    const hz = bytes[0];
    const n = bytes[1] | (bytes[2] << 8);
    if (hz < 1 || hz > 30 || n < 1) return null;
    const g = emptyGhost(hz, n);
    let o = 3;
    let q = 0;
    const L = bytes.length;
    for (let g0 = 0; g0 < n; g0 += 8) {
      const end = Math.min(n, g0 + 8);
      if (o + 4 > L) return null;
      const pl = [bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]];
      o += 4;
      for (let i = g0; i < end; i++) {
        if (o >= L) return null;
        const d = bytes[o++];
        if (d === KEY) {
          if (o + 4 > L) return null;
          q = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
          o += 4;
        } else {
          if (i === 0) return null; // the first sample must be a keyframe
          q += d;
        }
        if (o + 2 > L) return null;
        const xb = bytes[o++];
        const yb = bytes[o++];
        let f = 0;
        for (let k = 0; k < 4; k++) if (pl[k] & (1 << (i - g0))) f |= PLANES[k];
        g.s[i] = q / DS_Q;
        g.x[i] = (xb > 127 ? xb - 256 : xb) / X_Q;
        g.y[i] = yb * Y_Q;
        g.flags[i] = f;
      }
    }
    if (o !== L) return null;
    g.n = n;
    return g;
  } catch {
    return null;
  }
}

/** seconds covered by the ghost */
export const ghostDuration = (g: Ghost): number => (g.n > 1 ? (g.n - 1) / g.hz : 0);

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/**
 * The ghost at run time t (s): linear in s, Catmull-Rom in x and y, never across a CUT. Before the start it holds the
 * first sample, after the end the last one (out.inside = false). Allocation-free.
 */
export function sampleAt(g: Ghost, t: number, out: GhostPoint): GhostPoint {
  const n = g.n;
  if (n === 0) {
    out.s = out.x = out.y = out.speed = 0;
    out.flags = 0;
    out.inside = false;
    return out;
  }
  const f = (Number.isFinite(t) ? t : 0) * g.hz;
  out.inside = f >= 0 && f <= n - 1;
  let i = Math.floor(f);
  let u = f - i;
  if (i < 0) {
    i = 0;
    u = 0;
  } else if (i >= n - 1) {
    i = n - 1;
    u = 0;
  }
  const j = i + 1;
  if (u > 0 && j < n && !(g.flags[j] & F_CUT)) {
    const i0 = i > 0 && !(g.flags[i] & F_CUT) ? i - 1 : i;
    const j1 = j + 1 < n && !(g.flags[j + 1] & F_CUT) ? j + 1 : j;
    out.s = g.s[i] + (g.s[j] - g.s[i]) * u;
    out.x = catmull(g.x[i0], g.x[i], g.x[j], g.x[j1], u);
    out.y = Math.max(0, catmull(g.y[i0], g.y[i], g.y[j], g.y[j1], u));
    out.flags = (u < 0.5 ? g.flags[i] : g.flags[j]) & ~F_CUT;
    out.speed = (g.s[j] - g.s[i]) * g.hz;
  } else {
    out.s = g.s[i];
    out.x = g.x[i];
    out.y = g.y[i];
    out.flags = g.flags[i] & ~F_CUT;
    // speed from the previous continuous sample (a held end keeps its last pace for the run animation)
    out.speed = i > 0 && !(g.flags[i] & F_CUT) ? (g.s[i] - g.s[i - 1]) * g.hz : 0;
  }
  return out;
}

/** Re-sample a ghost at a lower rate (link too long). Cuts inside an interval carry over to the new sample. */
export function resampleGhost(g: Ghost, hz: number): Ghost {
  hz = clampHz(hz);
  const dur = ghostDuration(g);
  const n = Math.min(GHOST_MAX_SAMPLES, Math.floor(dur * hz + 1e-9) + 1);
  const out = emptyGhost(hz, n);
  const pt = newPoint();
  let prevIdx = 0;
  for (let k = 0; k < n; k++) {
    const t = k / hz;
    sampleAt(g, t, pt);
    const idx = Math.min(g.n - 1, Math.floor(t * g.hz + 1e-9));
    let cut = 0;
    for (let i = prevIdx + 1; i <= idx; i++) if (g.flags[i] & F_CUT) cut = F_CUT;
    prevIdx = idx;
    out.s[k] = pt.s;
    out.x[k] = pt.x;
    out.y[k] = pt.y;
    out.flags[k] = (pt.flags & 7) | (k > 0 ? cut : 0);
    out.n++;
  }
  return out;
}

/** The first n samples (a link that does not fit even at 1 Hz). */
export function truncateGhost(g: Ghost, n: number): Ghost {
  return ghostFrom(g, Math.max(0, Math.min(g.n, Math.floor(n))));
}
