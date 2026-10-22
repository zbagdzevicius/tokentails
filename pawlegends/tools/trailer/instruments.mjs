/**
 * Trailer instruments (storyboard §5): our own synthesised drums, bass, leads, pads, risers, whooshes, impacts and
 * the comedy cues, plus the game's own sound effects rendered offline from their zzfx definitions (the same
 * `zzfxSamples` the game bakes on its first gesture). Every function returns a mono Float32Array at 48 kHz, except
 * the stereo ones marked [L, R]. Deterministic: noise takes a seed.
 */
import { PL_SFX } from '../../src/audio/sfx.ts';
import { PCM_RATE, ZZFX_DEFS, zzfxSamples } from '../../src/audio/sfxDefs.js';
import {
  SR, adsr, biquad, brown, decay, fit, hz, lin, mix, mul, noise, normalize, resample, reverse, saw, scale, sec, sine, square,
  sweep, tanhSat, triangle,
} from './dsp.mjs';

// ---------------------------------------------------------------- the game's own sounds

const GAME_DEFS = { ...ZZFX_DEFS, ...PL_SFX };
const gameCache = new Map();

/** A game sound at a playback rate (the game's `sfx.play(name, { rate })`), resampled from 44.1 to 48 kHz. */
export function game(name, rate = 1) {
  const key = `${name}@${rate}`;
  if (gameCache.has(key)) return gameCache.get(key);
  const def = GAME_DEFS[name];
  if (!def) throw new Error(`no game sound ${name}`);
  const out = resample(zzfxSamples(def, PCM_RATE), rate, PCM_RATE);
  gameCache.set(key, out);
  return out;
}
export const GAME_SOUNDS = Object.keys(GAME_DEFS);

// ---------------------------------------------------------------- drums

export function kick(seed = 1, { punch = 1, len = 0.42 } = {}) {
  const n = sec(len);
  const body = mul(sine(n, sweep(165, 46, sec(0.075))), decay(n, 0.17, 0.0008));
  const click = mul(biquad(noise(sec(0.012), seed), 'hp', 1800), decay(sec(0.012), 0.003, 0.0002));
  return tanhSat(mix([body, 1], [click, 0.35 * punch]), 1.6);
}

export function snare(seed = 2, tone = 190) {
  const n = sec(0.32);
  const t = mix([sine(n, sweep(tone * 1.4, tone, sec(0.02))), 1], [sine(n, tone * 1.75), 0.4]);
  const body = mul(t, decay(n, 0.05, 0.0008));
  const nz = mul(biquad(biquad(noise(n, seed), 'hp', 1400), 'peak', 5200, 1, 4), decay(n, 0.085, 0.0005));
  return tanhSat(mix([body, 0.55], [nz, 0.75]), 1.3);
}

export function clap(seed = 3) {
  const n = sec(0.35);
  const nz = biquad(noise(n, seed), 'bp', 1250, 0.9);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const burst = [0, 0.009, 0.019].reduce((a, o) => a + (t >= o ? Math.exp(-(t - o) / 0.006) : 0), 0);
    env[i] = Math.min(1.2, burst) * 0.7 + (t >= 0.019 ? Math.exp(-(t - 0.019) / 0.11) : 0) * 0.6;
  }
  return mul(nz, env);
}

export function hat(seed = 4, open = false) {
  const n = sec(open ? 0.32 : 0.06);
  // metallic: six detuned squares (the 808 ratios) through a high-pass, plus a little noise
  const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
  const metal = mix(...ratios.map((r) => [square(n, 330 * r), 1 / 6]));
  const src = mix([metal, 0.6], [noise(n, seed), 0.5]);
  return mul(biquad(biquad(src, 'hp', 7200), 'peak', 10000, 1, 3), decay(n, open ? 0.12 : 0.016, 0.0004));
}

export function crash(seed = 5, len = 2.4) {
  const n = sec(len);
  const ratios = [1, 1.47, 1.97, 2.53, 3.11, 3.79, 4.41, 5.2];
  const metal = mix(...ratios.map((r, i) => [square(n, 410 * r * (1 + i * 0.003)), 1 / 8]));
  const src = mix([metal, 0.45], [noise(n, seed), 0.8]);
  const shaped = biquad(biquad(src, 'hp', 3200), 'highshelf', 8000, 0.7, 3);
  return mul(shaped, decay(n, len / 4.2, 0.0015));
}

export function tom(f = 120, seed = 6) {
  const n = sec(0.4);
  const b = mul(sine(n, sweep(f * 1.6, f, sec(0.05))), decay(n, 0.14, 0.001));
  const nz = mul(biquad(noise(n, seed), 'bp', f * 4, 1.2), decay(n, 0.04));
  return tanhSat(mix([b, 1], [nz, 0.3]), 1.2);
}

export function rim(seed = 7) {
  const n = sec(0.08);
  return mul(mix([biquad(noise(n, seed), 'bp', 2400, 3), 1], [sine(n, 1700), 0.4]), decay(n, 0.012, 0.0002));
}

/** Snare roll: from `len` s, 16ths then 32nds, crescendo, the tone rising. Returns [mono, onsets(s)]. */
export function snareRoll(len, bpm = 120, seed = 40) {
  const n = sec(len + 0.4);
  const out = new Float32Array(n);
  const s16 = 60 / bpm / 4;
  let t = 0;
  let k = 0;
  while (t < len - 1e-6) {
    const prog = t / len;
    const step = prog < 0.5 ? s16 : s16 / 2;
    const hit = snare(seed + k, 190 + prog * 120);
    const g = 0.15 + 0.85 * prog ** 1.6;
    const at = sec(t);
    for (let i = 0; i < hit.length && at + i < n; i++) out[at + i] += hit[i] * g;
    t += step;
    k++;
  }
  return out;
}

// ---------------------------------------------------------------- tonal

/** Detuned saw stack (the stab and pad source). */
function supersaw(n, midis, voices = 5, cents = 14, seed = 11) {
  const out = new Float32Array(n);
  let s = seed;
  for (const m of midis) {
    for (let v = 0; v < voices; v++) {
      const det = ((v - (voices - 1) / 2) / ((voices - 1) / 2 || 1)) * cents;
      const f = hz(m) * 2 ** (det / 1200);
      const o = saw(n, f, ((s = (s * 16807) % 2147483647) / 2147483647));
      for (let i = 0; i < n; i++) out[i] += o[i] / (voices * midis.length) * 1.6;
    }
  }
  return out;
}

/** A chord stab: bright supersaw with a fast filter drop. [L, R]. */
export function stab(midis, len = 0.32, bright = 1, seed = 12) {
  const n = sec(len + 0.25);
  const env = adsr(n, 0.003, 0.12, 0.35, 0.22);
  const make = (sd) => {
    const s = supersaw(n, midis, 5, 16, sd);
    return mul(biquad(s, 'lp', sweep(9000 * bright, 1600 * bright, sec(0.18)), 0.9), env);
  };
  const sub = mul(sine(n, hz(Math.min(...midis) - 12)), adsr(n, 0.003, 0.1, 0.5, 0.2));
  const L = mix([make(seed), 1], [sub, 0.35]);
  const R = mix([make(seed + 7), 1], [sub, 0.35]);
  return [fit(L, n), fit(R, n)];
}

/** Held pad: supersaw, slow attack, low-passed. [L, R]. */
export function pad(midis, len, { cutoff = 1500, attack = 0.25, release = 0.5, seed = 20 } = {}) {
  const n = sec(len + release);
  const env = adsr(n, attack, 0.3, 0.85, release);
  const make = (sd) => mul(biquad(supersaw(n, midis, 4, 18, sd), 'lp', cutoff, 0.6), env);
  return [make(seed), make(seed + 3)];
}

/** Saw bass note (two detuned saws and a sub, filter envelope). */
export function bass(midi, len, { cutoff = 1800, seed = 30 } = {}) {
  const n = sec(len + 0.04);
  const f = hz(midi);
  const s = mix([saw(n, f * 1.004, 0.1), 0.5], [saw(n, f * 0.996, 0.6), 0.5], [sine(n, f / 2 * 2), 0.0]);
  const filt = biquad(s, 'lp', sweep(cutoff, 220, sec(Math.min(0.2, len))), 1.4);
  const sub = sine(n, f);
  const env = adsr(n, 0.003, 0.08, 0.75, 0.03);
  return mul(tanhSat(mix([filt, 0.8], [sub, 0.7]), 1.4), env);
}

/** Pluck lead (the game's `music.ts` layer-3 saw, here with a filter envelope). */
export function pluck(midi, len = 0.12, seed = 50) {
  const n = sec(len + 0.2);
  const f = hz(midi);
  const s = mix([saw(n, f * 1.003, 0.2), 0.6], [square(n, f * 0.997, 0.5, 0.7), 0.35]);
  return mul(biquad(s, 'lp', sweep(6200, 900, sec(0.16)), 1.2), adsr(n, 0.002, 0.09, 0.25, 0.16));
}

/** Music box: an FM bell with a fast-decaying modulator. */
export function musicBox(midi, len = 1.1) {
  const n = sec(len);
  const f = hz(midi);
  const out = new Float32Array(n);
  let pc = 0, pm = 0, pm2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = 2.2 * Math.exp(-t / 0.08) + 0.3;
    const m = Math.sin(pm) * idx;
    out[i] = Math.sin(pc + m) * Math.exp(-t / 0.42) + 0.18 * Math.sin(pm2) * Math.exp(-t / 0.15);
    pc += (6.283185307 * f) / SR;
    pm += (6.283185307 * f * 3.5) / SR;
    pm2 += (6.283185307 * f * 4.02) / SR;
  }
  const a = sec(0.002);
  for (let i = 0; i < a; i++) out[i] *= i / a;
  return out;
}

/** Shimmer stab (bar 11): bell, octave bell and a sparkle of filtered noise. [L, R]. */
export function shimmer(midi, seed = 60) {
  const n = sec(1.6);
  const b = mix([musicBox(midi, 1.6), 0.7], [musicBox(midi + 12, 1.6), 0.45], [musicBox(midi + 19, 1.6), 0.18]);
  const sp = mul(biquad(noise(n, seed), 'hp', 9000), decay(n, 0.25, 0.004));
  const [sl, sr] = stab([midi, midi + 7, midi + 12], 0.18, 1.2, seed);
  const L = mix([b, 1], [sp, 0.2], [sl, 0.35]);
  const R = mix([b, 1], [sp, 0.2], [sr, 0.35]);
  return [L, R];
}

/** Pudding's tuba: a low saw through a slow, rounded filter with a brassy blat on the attack. */
export function tuba(midi, len) {
  const n = sec(len + 0.08);
  const f = hz(midi);
  const vib = (i) => f * (1 + 0.006 * Math.sin((6.283 * 5.5 * i) / SR) * Math.min(1, i / sec(0.15)));
  const s = mix([saw(n, vib), 0.8], [square(n, vib, 0.42), 0.25]);
  const filt = biquad(biquad(s, 'lp', sweep(1400, 520, sec(0.09)), 1.1), 'peak', 300, 1, 4);
  return tanhSat(mul(filt, adsr(n, 0.025, 0.1, 0.8, 0.07)), 1.5);
}

/** The sad "womp": a muted-brass E -> C# fall (descending minor third) with a wah and a slow vibrato. */
export function womp() {
  const a = sec(0.22);
  const b = sec(0.62);
  const n = a + b;
  const f = (i) => {
    const base = i < a ? hz(64) : hz(61) * (1 - 0.03 * Math.min(1, (i - a) / b));
    const vib = i > a + sec(0.12) ? 1 + 0.012 * Math.sin((6.283 * 5 * (i - a)) / SR) : 1;
    return base * vib;
  };
  const s = mix([saw(n, f), 0.8], [square(n, f, 0.3), 0.3]);
  const wah = (i) => (i < a ? 500 + 900 * Math.min(1, i / sec(0.06)) : 500 + 1100 * Math.exp(-(i - a) / sec(0.12)) + 200 * Math.exp(-(i - a) / sec(0.4)));
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = i < a ? Math.min(1, i / sec(0.012)) * (i > a - sec(0.03) ? (a - i) / sec(0.03) * 0.6 + 0.4 : 1) : Math.min(1, (i - a) / sec(0.01)) * Math.max(0, 1 - ((i - a) / b) ** 2.2);
  return tanhSat(mul(biquad(s, 'lp', wah, 3), env), 1.4);
}

// ---------------------------------------------------------------- design

/** Sub-drop (f0 storyboard: 55 Hz -> 30 Hz over 600 ms). */
export function subDrop(f0 = 55, f1 = 30, len = 0.6, tail = 0.5) {
  const n = sec(len + tail);
  return tanhSat(mul(sine(n, sweep(f0, f1, sec(len))), adsr(n, 0.002, 0.2, 0.7, tail)), 1.8);
}

/** Riser: white noise through a rising band-pass and a saw sweep (200 Hz -> 4 kHz), crescendo. [L, R]. */
export function riser(len, seed = 70) {
  const n = sec(len);
  const nz = (sd) => biquad(noise(n, sd), 'bp', sweep(400, 9000, n, 1.4), 1.2);
  const sw = biquad(mix([saw(n, sweep(200, 4000, n, 1.6)), 0.5], [saw(n, sweep(202, 4040, n, 1.6)), 0.5]), 'lp', sweep(800, 12000, n), 0.8);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = (i / n) ** 2.2;
  return [mul(mix([nz(seed), 0.9], [sw, 0.35]), env), mul(mix([nz(seed + 1), 0.9], [sw, 0.35]), env)];
}

/** Whoosh: band-passed noise that swells and falls; `up` raises the pitch. Mono (pan it with addPanned). */
export function whoosh(len = 0.4, seed = 80, up = 1) {
  const n = sec(len);
  const nz = noise(n, seed);
  const f = (i) => 600 * up * 2 ** (3 * Math.sin((Math.PI * i) / n));
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.sin((Math.PI * i) / n) ** 1.5;
  return mul(biquad(nz, 'bp', f, 1.6), env);
}

/** Rising whoosh (crescendo, cut at the end). */
export function riseWhoosh(len = 0.25, seed = 81) {
  const n = sec(len);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = (i / n) ** 2;
  return mul(biquad(noise(n, seed), 'bp', sweep(500, 7000, n), 1.4), env);
}

/** Reverse whoosh into a cut. */
export const reverseWhoosh = (len = 0.2, seed = 82) => reverse(mul(biquad(noise(sec(len), seed), 'bp', sweep(5000, 600, sec(len)), 1.2), decay(sec(len), len / 3)));

/** Reverse cymbal peaking at its last sample. */
export const reverseCymbal = (len = 0.5, seed = 83) => reverse(fit(crash(seed, len * 1.6), sec(len)));

/** Big impact: sub, body thump and a noise blast. */
export function impact(seed = 90, { sub = 42, len = 1.4 } = {}) {
  const n = sec(len);
  const s = mul(sine(n, sweep(sub * 2.2, sub, sec(0.12))), decay(n, len / 3.5, 0.001));
  const body = mul(biquad(noise(n, seed), 'lp', sweep(4000, 200, sec(0.3)), 0.9), decay(n, 0.12, 0.0006));
  return tanhSat(mix([s, 1], [body, 0.7]), 2);
}

/** Short snap (arrow hit): a click and a bright tick. */
export function snap(seed = 91) {
  const n = sec(0.09);
  return mul(mix([biquad(noise(n, seed), 'hp', 2500), 0.9], [sine(n, sweep(3200, 1400, n)), 0.5]), decay(n, 0.018, 0.0002));
}

/** A soft thump (type slams). */
export function thump(seed = 92) {
  const n = sec(0.3);
  return mix([mul(sine(n, sweep(120, 55, sec(0.06))), decay(n, 0.09, 0.001)), 0.9], [mul(biquad(noise(n, seed), 'lp', 900), decay(n, 0.03)), 0.3]);
}

/** Pudding's bounce: a sub "boing" with a decaying wobble. */
export function boing() {
  const n = sec(0.9);
  const f = (i) => {
    const t = i / SR;
    return (55 + 70 * Math.exp(-t / 0.05)) * (1 + 0.22 * Math.sin(6.283 * 9 * t) * Math.exp(-t / 0.25));
  };
  return tanhSat(mul(mix([sine(n, f), 1], [triangle(n, (i) => f(i) * 2), 0.25]), decay(n, 0.3, 0.002)), 1.6);
}

/** Lightning crackle: random noise bursts and a falling zap. */
export function crackle(len = 0.35, seed = 93) {
  const n = sec(len);
  const r = (() => {
    let s = seed;
    return () => ((s = (s * 48271) % 2147483647) / 2147483647);
  })();
  const nz = biquad(noise(n, seed), 'hp', 1500);
  const env = new Float32Array(n);
  let t = 0;
  while (t < n) {
    const w = sec(0.004 + r() * 0.012);
    const g = 0.4 + r() * 0.6;
    for (let i = 0; i < w && t + i < n; i++) env[t + i] = g * (1 - i / w) * (1 - t / n);
    t += w + sec(r() * 0.02);
  }
  const zap = mul(saw(n, sweep(2400, 120, sec(0.12))), decay(n, 0.05, 0.0005));
  return mix([mul(nz, env), 0.9], [biquad(zap, 'lp', 5000), 0.35]);
}

/** Balloon pop: a short noise crack and a tiny rubber squeal. */
export function pop(seed = 94) {
  const n = sec(0.12);
  return mix([mul(biquad(noise(n, seed), 'hp', 1200), decay(n, 0.012, 0.0001)), 1], [mul(sine(n, sweep(1800, 900, n)), decay(n, 0.03)), 0.25]);
}

/** Heartbeat: the game's heartThump "lub" and a quieter "dub" 0.2 s later, with a little sub under it. */
export function heartbeat() {
  const lub = game('heartThump', 1);
  const n = sec(0.75);
  const out = new Float32Array(n);
  const sub = mul(sine(sec(0.25), sweep(70, 45, sec(0.1))), decay(sec(0.25), 0.07, 0.002));
  for (let i = 0; i < lub.length && i < n; i++) out[i] += lub[i];
  for (let i = 0; i < sub.length; i++) out[i] += sub[i] * 0.6;
  const d = sec(0.2);
  for (let i = 0; i < lub.length && d + i < n; i++) out[d + i] += lub[i] * 0.55;
  for (let i = 0; i < sub.length && d + i < n; i++) out[d + i] += sub[i] * 0.35;
  return normalize(out, 0.9);
}

/** Quiet outdoor bed (the dropout under the "Healing first!" gag): brown noise, low-passed, slowly breathing. */
export function ambience(len, seed = 95) {
  const n = sec(len);
  const b = biquad(brown(n, seed), 'lp', 600);
  const air = biquad(noise(n, seed + 1), 'bp', 3000, 0.5);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.min(1, i / sec(0.05), (n - i) / sec(0.05)) * (0.85 + 0.15 * Math.sin((6.283 * 0.7 * i) / SR));
  return mul(mix([b, 1], [air, 0.05]), env);
}

/** Fire whoosh (a stage igniting): low roar with crackle. */
export function fire(len = 0.6, seed = 96) {
  const n = sec(len);
  const roar = mul(biquad(noise(n, seed), 'bp', sweep(300, 1400, sec(0.15)), 0.8), adsr(n, 0.01, 0.2, 0.4, len * 0.6));
  return mix([roar, 1], [crackle(len, seed + 1), 0.25]);
}

export { lin };
export { scale };
