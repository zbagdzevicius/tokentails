/**
 * Offline synth for the trailer score (storyboard §5): oscillators, envelopes, filters, a Freeverb, a true-peak
 * limiter and a 24-bit WAV writer. Pure functions over Float32Arrays at 48 kHz, no dependencies, deterministic (every
 * noise source takes a seed). Used by score.mjs only; never part of the game build.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const SR = 48000;
export const TAU = Math.PI * 2;
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const dbToGain = (db) => 10 ** (db / 20);
export const sec = (s) => Math.max(0, Math.round(s * SR));

/** mulberry32: a seeded uniform generator in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- sources

const blep = (t, dt) => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};

/** Frequency argument: a number or a function of the sample index. */
const fq = (f) => (typeof f === 'function' ? f : () => f);

/** Band-limited sawtooth (polyBLEP). */
export function saw(n, f, phase = 0) {
  const out = new Float32Array(n);
  const ff = fq(f);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const dt = ff(i) / SR;
    out[i] = 2 * ph - 1 - blep(ph, dt);
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
  return out;
}

/** Band-limited square (polyBLEP), duty 0.5 unless given. */
export function square(n, f, duty = 0.5, phase = 0) {
  const out = new Float32Array(n);
  const ff = fq(f);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const dt = ff(i) / SR;
    let v = ph < duty ? 1 : -1;
    v += blep(ph, dt);
    let p2 = ph - duty;
    if (p2 < 0) p2 += 1;
    v -= blep(p2, dt);
    out[i] = v;
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
  return out;
}

export function sine(n, f, phase = 0) {
  const out = new Float32Array(n);
  const ff = fq(f);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(TAU * ph);
    ph += ff(i) / SR;
    if (ph >= 1) ph -= 1;
  }
  return out;
}

export function triangle(n, f, phase = 0) {
  const out = new Float32Array(n);
  const ff = fq(f);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    out[i] = 1 - 4 * Math.abs(ph - 0.5);
    ph += ff(i) / SR;
    if (ph >= 1) ph -= 1;
  }
  return out;
}

export function noise(n, seed) {
  const r = rng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Brown noise (integrated white, leaky), normalised to about ±1. */
export function brown(n, seed) {
  const r = rng(seed);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = 0.996 * y + (r() * 2 - 1) * 0.06;
    out[i] = y;
  }
  return out;
}

// ---------------------------------------------------------------- envelopes and math

/** Linear attack, exponential-ish decay to sustain, hold, linear release (seconds). */
export function adsr(n, a, d, s, r) {
  const out = new Float32Array(n);
  const A = Math.max(1, sec(a));
  const D = Math.max(1, sec(d));
  const R = Math.max(1, sec(r));
  const relAt = Math.max(A, n - R);
  for (let i = 0; i < n; i++) {
    let v;
    if (i < A) v = i / A;
    else if (i < A + D) v = s + (1 - s) * Math.exp((-4 * (i - A)) / D);
    else v = s;
    if (i >= relAt) v *= Math.max(0, 1 - (i - relAt) / R);
    out[i] = v;
  }
  return out;
}

/** exp(-t/tau) with a short linear attack (s). */
export function decay(n, tau, attack = 0.001) {
  const out = new Float32Array(n);
  const A = Math.max(1, sec(attack));
  for (let i = 0; i < n; i++) out[i] = (i < A ? i / A : 1) * Math.exp(-(i / SR) / tau);
  return out;
}

export function mul(a, b) {
  const n = Math.min(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] * b[i];
  return out;
}

export function scale(a, g) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * g;
  return out;
}

/** Sum arrays (the longest wins the length), each with its gain. */
export function mix(...parts) {
  let n = 0;
  for (const [x] of parts) n = Math.max(n, x.length);
  const out = new Float32Array(n);
  for (const [x, g = 1] of parts) for (let i = 0; i < x.length; i++) out[i] += x[i] * g;
  return out;
}

export function tanhSat(a, drive = 1) {
  const out = new Float32Array(a.length);
  const k = Math.tanh(drive);
  for (let i = 0; i < a.length; i++) out[i] = Math.tanh(a[i] * drive) / k;
  return out;
}

export function reverse(a) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[a.length - 1 - i];
  return out;
}

/** Pad or cut to n samples, with a short fade at a cut. */
export function fit(a, n, fadeS = 0.004) {
  const out = new Float32Array(n);
  out.set(a.subarray(0, Math.min(n, a.length)));
  if (a.length > n) {
    const F = Math.min(n, sec(fadeS));
    for (let i = 0; i < F; i++) out[n - 1 - i] *= i / F;
  }
  return out;
}

export function peak(a) {
  let p = 0;
  for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i]));
  return p;
}

export function normalize(a, to = 1) {
  const p = peak(a);
  return p > 0 ? scale(a, to / p) : a;
}

/** Resample by `rate` (2 = an octave up and half as long), cubic Hermite. `fromRate` converts sample rates too. */
export function resample(a, rate = 1, fromRate = SR) {
  const step = rate * (fromRate / SR);
  const n = Math.max(1, Math.floor((a.length - 1) / step));
  const out = new Float32Array(n);
  const at = (i) => a[Math.min(a.length - 1, Math.max(0, i))];
  for (let j = 0; j < n; j++) {
    const x = j * step;
    const i = Math.floor(x);
    const t = x - i;
    const y0 = at(i - 1);
    const y1 = at(i);
    const y2 = at(i + 1);
    const y3 = at(i + 2);
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    out[j] = ((c3 * t + c2) * t + c1) * t + y1;
  }
  return out;
}

// ---------------------------------------------------------------- filters

function coeffs(type, f, q, gainDb = 0) {
  const w = (TAU * Math.min(f, SR * 0.49)) / SR;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const al = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case 'hp':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case 'bp':
      b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case 'peak':
      b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
      break;
    case 'lowshelf': {
      const s2 = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 - (A - 1) * cw + s2); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s2);
      a0 = A + 1 + (A - 1) * cw + s2; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s2;
      break;
    }
    case 'highshelf': {
      const s2 = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 + (A - 1) * cw + s2); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s2);
      a0 = A + 1 - (A - 1) * cw + s2; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s2;
      break;
    }
    default:
      throw new Error(`filter ${type}`);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/**
 * RBJ biquad. `f` is a number or a function of the sample index (coefficients refresh every 32 samples, so sweeps
 * stay smooth and cheap).
 */
export function biquad(x, type, f, q = 0.707, gainDb = 0) {
  const out = new Float32Array(x.length);
  const ff = fq(f);
  let c = coeffs(type, ff(0), q, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (typeof f === 'function' && (i & 31) === 0) c = coeffs(type, ff(i), q, gainDb);
    const y = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Exponential sweep helper: value from a to b over n samples (then holds b). */
export const sweep = (a, b, n, curve = 1) => (i) => a * (b / a) ** Math.min(1, (i / Math.max(1, n)) ** curve);
/** Linear sweep helper. */
export const lin = (a, b, n) => (i) => a + (b - a) * Math.min(1, i / Math.max(1, n));

// ---------------------------------------------------------------- stereo bus

export class Bus {
  constructor(n) {
    this.n = n;
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
  }

  /** Add mono `x` at sample `at` with a gain and an equal-power pan (-1..1). */
  add(at, x, gain = 1, pan = 0) {
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < x.length; i++) {
      const j = at + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      this.L[j] += x[i] * gl;
      this.R[j] += x[i] * gr;
    }
  }

  addStereo(at, L, R, gain = 1) {
    for (let i = 0; i < L.length; i++) {
      const j = at + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      this.L[j] += L[i] * gain;
      this.R[j] += R[i] * gain;
    }
  }

  /** Mono `x` with a pan that moves over time (a function of the sample index, -1..1). */
  addPanned(at, x, gain, panFn) {
    for (let i = 0; i < x.length; i++) {
      const j = at + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      const p = panFn(i);
      this.L[j] += x[i] * gain * Math.cos(((p + 1) * Math.PI) / 4);
      this.R[j] += x[i] * gain * Math.sin(((p + 1) * Math.PI) / 4);
    }
  }

  mixIn(o, gain = 1) {
    for (let i = 0; i < this.n; i++) {
      this.L[i] += o.L[i] * gain;
      this.R[i] += o.R[i] * gain;
    }
  }

  /** Multiply by a gain curve (function of the sample index) between samples a and b. */
  gainCurve(fn, a = 0, b = this.n) {
    for (let i = Math.max(0, a); i < Math.min(this.n, b); i++) {
      const g = fn(i);
      this.L[i] *= g;
      this.R[i] *= g;
    }
  }

  /** Silence [a, b): a short fade-out from a, zero until b, then a short fade back in after b (nothing bleeds early). */
  mute(a, b, fade = sec(0.003)) {
    this.gainCurve((i) => (i < a + fade ? 1 - (i - a) / fade : 0), a, b);
    this.gainCurve((i) => (i - b) / fade, b, b + fade);
  }

  /** Filter [a, b) through `fn(channel) => filtered`, crossfading in and out over `xf` samples. */
  region(a, b, fn, xf = sec(0.01)) {
    for (const ch of ['L', 'R']) {
      const seg = this[ch].slice(a, b);
      const f = fn(seg);
      for (let i = 0; i < seg.length; i++) {
        const w = Math.min(1, i / xf, (seg.length - i) / xf);
        this[ch][a + i] = seg[i] * (1 - w) + f[i] * w;
      }
    }
  }

  clone() {
    const o = new Bus(this.n);
    o.L.set(this.L);
    o.R.set(this.R);
    return o;
  }
}

// ---------------------------------------------------------------- effects

/** Freeverb (Jezar's tunings at 48 kHz): stereo in, stereo wet out. */
export function freeverb(L, R, { room = 0.82, damp = 0.35, width = 1, predelay = 0.012 } = {}) {
  const k = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => Math.round(t * k));
  const apT = [556, 441, 341, 225].map((t) => Math.round(t * k));
  const spread = Math.round(23 * k);
  const fb = room * 0.28 + 0.7;
  const n = L.length;
  const pd = sec(predelay);
  const run = (input, off) => {
    const out = new Float32Array(n);
    const combs = combT.map((t) => ({ b: new Float32Array(t + off), i: 0, s: 0 }));
    const aps = apT.map((t) => ({ b: new Float32Array(t + off), i: 0 }));
    for (let j = 0; j < n; j++) {
      const x = (j >= pd ? input[j - pd] : 0) * 0.015;
      let acc = 0;
      for (const c of combs) {
        const y = c.b[c.i];
        c.s = y * (1 - damp) + c.s * damp;
        c.b[c.i] = x + c.s * fb;
        if (++c.i >= c.b.length) c.i = 0;
        acc += y;
      }
      for (const a of aps) {
        const y = a.b[a.i];
        a.b[a.i] = acc + y * 0.5;
        if (++a.i >= a.b.length) a.i = 0;
        acc = y - acc;
      }
      out[j] = acc;
    }
    return out;
  };
  const wl = run(L, 0);
  const wr = run(R, spread);
  const w1 = width / 2 + 0.5;
  const w2 = (1 - width) / 2;
  const oL = new Float32Array(n);
  const oR = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    oL[j] = wl[j] * w1 + wr[j] * w2;
    oR[j] = wr[j] * w1 + wl[j] * w2;
  }
  return [oL, oR];
}

/** Ping-pong delay (stereo wet out). */
export function pingpong(L, R, time = 0.375, feedback = 0.35, lp = 4000) {
  const n = L.length;
  const d = sec(time);
  const oL = new Float32Array(n);
  const oR = new Float32Array(n);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let i = 0;
  let sl = 0, sr = 0;
  const a = Math.exp((-TAU * lp) / SR);
  for (let j = 0; j < n; j++) {
    const yl = bl[i];
    const yr = br[i];
    sl = (1 - a) * yl + a * sl;
    sr = (1 - a) * yr + a * sr;
    bl[i] = (L[j] + R[j]) * 0.5 + sr * feedback;
    br[i] = sl * feedback;
    oL[j] = yl;
    oR[j] = yr;
    if (++i >= d) i = 0;
  }
  return [oL, oR];
}

/**
 * Tape stop: from sample `a` the playback rate falls from 1 to `endRate` (a pitch curve, exponential in semitones)
 * over `len` samples, reading the bus as it would have continued; after that, silence until `b`.
 */
export function tapeStop(bus, a, len, b, endRate = 0.25) {
  for (const ch of ['L', 'R']) {
    const src = bus[ch].slice(a, a + len * 2);
    let p = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const rate = endRate ** (t * t);
      const k = Math.floor(p);
      const fr = p - k;
      const v = (src[k] ?? 0) * (1 - fr) + (src[k + 1] ?? 0) * fr;
      const fade = i > len - sec(0.01) ? (len - i) / sec(0.01) : 1;
      bus[ch][a + i] = v * fade;
      p += rate;
    }
    for (let i = a + len; i < b; i++) bus[ch][i] = 0;
  }
}

/** Sidechain-style pump: gain dips by `depth` at each onset and recovers with time constant `tau` (s). */
export function pumpCurve(onsets, depth = 0.45, tau = 0.11, attack = 0.004) {
  const sorted = [...onsets].sort((x, y) => x - y);
  const A = sec(attack);
  return (i) => {
    // last onset at or before i (binary search)
    let lo = 0, hi = sorted.length - 1, k = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m] <= i) {
        k = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    if (k < 0) return 1;
    const dt = i - sorted[k];
    const env = dt < A ? dt / A : Math.exp(-(dt - A) / SR / tau);
    return 1 - depth * env;
  };
}

// ---------------------------------------------------------------- dynamics

/** RMS compressor on a stereo pair (linked), in place. */
export function compress(bus, { threshDb = -18, ratio = 2, attack = 0.01, release = 0.15, makeupDb = 0 } = {}) {
  const at = Math.exp(-1 / (attack * SR));
  const rt = Math.exp(-1 / (release * SR));
  let env = 0;
  const mk = dbToGain(makeupDb);
  for (let i = 0; i < bus.n; i++) {
    const x = Math.max(Math.abs(bus.L[i]), Math.abs(bus.R[i]));
    const c = x > env ? at : rt;
    env = c * env + (1 - c) * x;
    const db = 20 * Math.log10(env + 1e-9);
    const over = db - threshDb;
    const g = over > 0 ? dbToGain(-over * (1 - 1 / ratio)) : 1;
    bus.L[i] *= g * mk;
    bus.R[i] *= g * mk;
  }
}

/** 4x oversampled inter-sample peak between i and i+1 (Catmull-Rom on 4 neighbours). */
function truePeakAt(x, i) {
  const y0 = x[i - 1] ?? 0, y1 = x[i] ?? 0, y2 = x[i + 1] ?? 0, y3 = x[i + 2] ?? 0;
  let p = Math.abs(y1);
  for (const t of [0.25, 0.5, 0.75]) {
    const v = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
    p = Math.max(p, Math.abs(v));
  }
  return p;
}

/**
 * Look-ahead brick-wall limiter on oversampled peaks, linked stereo, in place and latency-compensated (the output
 * lines up with the input sample for sample, so frame-locked hits stay on their frames).
 */
export function limit(bus, ceilingDb = -1.2, lookahead = 0.002, release = 0.08) {
  const c = dbToGain(ceilingDb);
  const n = bus.n;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(truePeakAt(bus.L, i), truePeakAt(bus.R, i));
    need[i] = p > c ? c / p : 1;
  }
  const la = Math.max(1, sec(lookahead));
  // min over the look-ahead window (a sliding minimum via a monotone deque)
  const wmin = new Float32Array(n);
  const dq = [];
  let h = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > h && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[h] > i + la) h++;
    wmin[i] = need[dq[h]];
  }
  // smooth: instant-ish attack across the look-ahead ramp, exponential release
  const rel = Math.exp(-1 / (release * SR));
  let g = 1;
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = wmin[i];
    g = t < g ? t : rel * g + (1 - rel) * t;
    gain[i] = Math.min(g, wmin[i]);
  }
  // ramp into each dip over the look-ahead window (backwards pass) so the attack is not a step
  for (let i = n - 2; i >= 0; i--) gain[i] = Math.min(gain[i], gain[i + 1] + (1 - gain[i + 1]) / la);
  for (let i = 0; i < n; i++) {
    bus.L[i] *= gain[i];
    bus.R[i] *= gain[i];
  }
}

// ---------------------------------------------------------------- files

/** Write a 24-bit PCM WAV (mono when R is omitted). */
export function writeWav(path, L, R = null) {
  const ch = R ? 2 : 1;
  const n = L.length;
  const bytes = n * ch * 3;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * ch * 3, 28);
  buf.writeUInt16LE(ch * 3, 32);
  buf.writeUInt16LE(24, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = c === 0 ? L[i] : R[i];
      let v = Math.round(Math.max(-1, Math.min(1, s)) * 8388607);
      if (v < 0) v += 16777216;
      buf[o++] = v & 255;
      buf[o++] = (v >> 8) & 255;
      buf[o++] = (v >> 16) & 255;
    }
  }
  writeFileSync(path, buf);
}

/** Write a 32-bit float WAV (stereo): stems keep their headroom (a pre-master stem may peak above 0 dBFS). */
export function writeWavFloat(path, L, R) {
  const n = L.length;
  const bytes = n * 2 * 4;
  const buf = Buffer.alloc(58 + bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(50 + bytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(18, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2 * 4, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.writeUInt16LE(0, 36);
  buf.write('fact', 38);
  buf.writeUInt32LE(4, 42);
  buf.writeUInt32LE(n, 46);
  buf.write('data', 50);
  buf.writeUInt32LE(bytes, 54);
  let o = 58;
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(L[i], o);
    buf.writeFloatLE(R[i], o + 4);
    o += 8;
  }
  writeFileSync(path, buf);
}

/** Read a PCM 16/24/32-bit or float 32-bit WAV (mono or stereo) as { sr, L, R } Float32Arrays. */
export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV`);
  let o = 12;
  let fmt = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    const body = o + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe) format = buf.readUInt16LE(body + 24);
      fmt = { format, ch: buf.readUInt16LE(body + 2), sr: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt) throw new Error(`${path}: data before fmt`);
      const bps = fmt.bits / 8;
      const n = Math.floor(size / (bps * fmt.ch));
      const L = new Float32Array(n);
      const R = new Float32Array(n);
      const rd = fmt.format === 3
        ? (p) => buf.readFloatLE(p)
        : fmt.bits === 16 ? (p) => buf.readInt16LE(p) / 32768
          : fmt.bits === 24 ? (p) => buf.readIntLE(p, 3) / 8388608
            : (p) => buf.readInt32LE(p) / 2147483648;
      for (let i = 0; i < n; i++) {
        const p = body + i * bps * fmt.ch;
        L[i] = rd(p);
        R[i] = fmt.ch > 1 ? rd(p + bps) : L[i];
      }
      return { sr: fmt.sr, L, R };
    }
    o = body + size + (size & 1);
  }
  throw new Error(`${path}: no data chunk`);
}
