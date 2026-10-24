// Score tracks (SHARE lane), pure: the challenger's running score, so a race shows who is ahead on SCORE (the course
// speed is fixed, so a gap in metres says almost nothing). One sample per SCORE_HZ second of run time (G.time).
// Packed: u8 hz, then per sample a zigzag varint of the change since the previous sample in units of SCORE_Q points
// (a 2-minute run is about 250 bytes before deflate). Decoding never throws; anything malformed is null.

export const SCORE_HZ = 1;
export const SCORE_Q = 10;
export const MAX_SCORE_SAMPLES = 60 * 30;

export interface ScoreTrack {
  hz: number;
  n: number;
  v: Float64Array;
}

/** A fixed-capacity recorder (push is allocation-free). */
export class ScoreTape {
  readonly v: Float64Array;
  n = 0;
  constructor(readonly cap = MAX_SCORE_SAMPLES) {
    this.v = new Float64Array(cap);
  }
  clear(): void {
    this.n = 0;
  }
  push(score: number): void {
    if (this.n < this.cap) this.v[this.n++] = Number.isFinite(score) ? score : 0;
  }
}

export function packScores(src: ArrayLike<number>, n = src.length, hz = SCORE_HZ): Uint8Array {
  const m = Math.max(0, Math.min(n, src.length, MAX_SCORE_SAMPLES));
  const out = new Uint8Array(1 + m * 5);
  let o = 0;
  out[o++] = Math.max(1, Math.min(30, Math.round(hz) || SCORE_HZ));
  let q = 0;
  for (let i = 0; i < m; i++) {
    const target = Math.round((Number.isFinite(src[i]) ? src[i] : 0) / SCORE_Q);
    const d = target - q;
    q = target;
    let z = d >= 0 ? d * 2 : -d * 2 - 1;
    // varint, 7 bits per byte (z < 2^28 for any score up to 1e9 / 10)
    z = Math.min(z, 0x0fffffff);
    while (z >= 0x80) {
      out[o++] = (z & 0x7f) | 0x80;
      z = Math.floor(z / 128);
    }
    out[o++] = z;
  }
  return out.slice(0, o);
}

export function unpackScores(bytes: Uint8Array | null | undefined): ScoreTrack | null {
  try {
    if (!bytes || bytes.length < 2) return null;
    const hz = bytes[0];
    if (hz < 1 || hz > 30) return null;
    const vals: number[] = [];
    let o = 1;
    let q = 0;
    while (o < bytes.length) {
      let z = 0;
      let mul = 1;
      for (let k = 0; ; k++) {
        if (o >= bytes.length || k > 4) return null;
        const b = bytes[o++];
        z += (b & 0x7f) * mul;
        mul *= 128;
        if (!(b & 0x80)) break;
      }
      q += z % 2 ? -(z + 1) / 2 : z / 2;
      vals.push(q * SCORE_Q);
      if (vals.length > MAX_SCORE_SAMPLES) return null;
    }
    if (!vals.length) return null;
    return { hz, n: vals.length, v: Float64Array.from(vals) };
  } catch {
    return null;
  }
}

/** the score at run time t (linear between samples; held at the ends) */
export function scoreAt(tr: ScoreTrack, t: number): number {
  if (tr.n === 0) return 0;
  const f = (Number.isFinite(t) ? t : 0) * tr.hz;
  if (f <= 0) return tr.v[0];
  if (f >= tr.n - 1) return tr.v[tr.n - 1];
  const i = Math.floor(f);
  return tr.v[i] + (tr.v[i + 1] - tr.v[i]) * (f - i);
}
