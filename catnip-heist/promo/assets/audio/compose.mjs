// Catnip Heist promo soundtrack. Pure-JS deterministic synthesis, no deps.
// 128 BPM, D minor, 32 beats = exactly 15.000 s, 48 kHz stereo 16-bit.
// Usage: node compose.mjs   -> writes track.wav + cues.json next to this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000, DUR = 15, N = SR * DUR;
const BEAT = 60 / 128, BAR = BEAT * 4, S16 = BEAT / 4, S32 = BEAT / 8;
const bt = (b) => b * BEAT;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, p) => a + (b - a) * p;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };

// ---------- deterministic RNG ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let seedCounter = 1000;
const seed = () => (seedCounter += 7919);
const noiseGen = () => { const r = rng(seed()); return () => r() * 2 - 1; };
const arrRand = rng(4242);

// ---------- DSP primitives ----------
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
class Osc {
  constructor(ph = 0) { this.p = ph; }
  adv(f) { this.p += f / SR; if (this.p >= 1) this.p -= Math.floor(this.p); }
  saw(f) { const dt = f / SR; const v = 2 * this.p - 1 - blep(this.p, dt); this.adv(f); return v; }
  sq(f, pw = 0.5) {
    const dt = f / SR; let v = this.p < pw ? 1 : -1;
    v += blep(this.p, dt); v -= blep((this.p + 1 - pw) % 1, dt);
    this.adv(f); return v;
  }
  sin(f) { const v = Math.sin(TAU * this.p); this.adv(f); return v; }
  tri(f) { const v = 1 - 4 * Math.abs(this.p - 0.5); this.adv(f); return v; }
}
// TPT state variable filter (Zavalishin); stable under modulation
class SVF {
  constructor() { this.a = 0; this.b = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  run(x, fc, q = 0.707) {
    fc = clamp(fc, 10, SR * 0.45);
    const g = Math.tan(Math.PI * fc / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.b;
    const v1 = a1 * this.a + a2 * v3;
    const v2 = this.b + a2 * this.a + a3 * v3;
    this.a = 2 * v1 - this.a; this.b = 2 * v2 - this.b;
    this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2;
    return this;
  }
}

// ---------- buses ----------
const mainL = new Float32Array(N), mainR = new Float32Array(N); // dry, not ducked
const scL = new Float32Array(N), scR = new Float32Array(N);     // sidechain-ducked (bass/pad/arp)
const revIn = new Float32Array(N);                               // mono reverb send
const dlyIn = new Float32Array(N);                               // mono delay send
const cues = [];
const cue = (t, type, extra = {}) => cues.push({ t: +t.toFixed(6), type, ...extra });

// Render a mono voice starting at t0 with fn(tt) -> sample; auto end-fade.
function voice(t0, dur, fn, o = {}) {
  const { pan = 0, gain = 1, bus = 'main', rev = 0, dly = 0 } = o;
  const s0 = Math.round(t0 * SR);
  const n = Math.ceil(dur * SR);
  const fade = Math.max(1, Math.min(Math.round(0.004 * SR), n >> 2));
  const L = bus === 'sc' ? scL : mainL, R = bus === 'sc' ? scR : mainR;
  const panF = typeof pan === 'function';
  let gl = 0, gr = 0;
  const setPan = (p) => { const a = (clamp(p, -1, 1) + 1) * Math.PI / 4; gl = Math.cos(a) * Math.SQRT2; gr = Math.sin(a) * Math.SQRT2; };
  if (!panF) setPan(pan);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i;
    const tt = i / SR;
    let s = fn(tt, i);
    if (idx < 0 || idx >= N) continue;
    if (i > n - fade) s *= (n - i) / fade;
    s *= gain;
    if (panF) setPan(pan(tt));
    L[idx] += s * gl; R[idx] += s * gr;
    if (rev) revIn[idx] += s * rev;
    if (dly) dlyIn[idx] += s * dly;
  }
}

// ---------- instruments ----------
const kickTimes = [];
function kick(t, amp = 1, decay = 0.24, label) {
  cue(t, 'kick', label ? { label } : {}); kickTimes.push([t, 1]);
  const nz = noiseGen(), hp = new SVF(); let ph = 0;
  voice(t, decay * 5, (tt) => {
    const f = 44 + 120 * Math.exp(-tt / 0.032) + 700 * Math.exp(-tt / 0.0022);
    ph += f / SR;
    const env = Math.min(1, tt / 0.0006) * Math.exp(-tt / decay);
    const click = hp.run(nz(), 3000, 0.8).hp * Math.exp(-tt / 0.0025) * 0.35;
    return Math.tanh(Math.sin(TAU * ph) * env * 1.7 + click) * amp;
  }, { gain: 0.95 });
}
function clap(t, amp = 1) {
  cue(t, 'snare', { label: 'clap' });
  const nz = noiseGen(), f = new SVF(), f2 = new SVF();
  voice(t, 0.6, (tt) => {
    const n = nz();
    const b = f.run(n, 1350, 1.3).bp;
    const h = f2.run(n, 5200, 0.9).bp * 0.4;
    let env = 0;
    for (let k = 0; k < 3; k++) { const d = tt - k * 0.0095; if (d >= 0) env += Math.exp(-d / 0.0032); }
    const d = tt - 0.028; if (d >= 0) env += 0.95 * Math.exp(-d / 0.13);
    return (b + h) * env * amp * 2.6;
  }, { rev: 0.35, pan: 0.05 });
  // snare tone layer
  let o = new Osc(0.25);
  voice(t, 0.25, (tt) => o.tri(185 + 60 * Math.exp(-tt / 0.02)) * Math.exp(-tt / 0.06) * amp * 0.35);
}
function snare(t, amp = 1, bright = 1, label) {
  cue(t, 'snare', label ? { label } : {});
  const nz = noiseGen(), f = new SVF(); const o = new Osc(0.25);
  voice(t, 0.3, (tt) => {
    const n = f.run(nz(), 2200 + 3000 * bright, 0.7).bp;
    const tone = o.tri(200 * (0.9 + 0.3 * bright) + 80 * Math.exp(-tt / 0.015)) * Math.exp(-tt / 0.045);
    return (n * 1.6 * Math.exp(-tt / 0.07) + tone * 0.5) * amp;
  }, { rev: 0.3, pan: (arrRand() - 0.5) * 0.3 });
}
function hat(t, amp = 0.1, open = false, pan = 0) {
  const nz = noiseGen(), f = new SVF(), f2 = new SVF();
  const dec = open ? 0.09 : 0.022;
  voice(t, dec * 6, (tt) => {
    const n = nz();
    const h = f.run(n, 7500, 0.7).hp;
    const r = f2.run(n, 11000, 2.5).bp;
    return (h * 0.8 + r * 0.6) * Math.exp(-tt / dec) * amp;
  }, { pan, rev: open ? 0.08 : 0 });
}
function crash(t, amp = 0.5, decay = 0.9) {
  for (const p of [-0.5, 0.5]) {
    const nz = noiseGen(), f = new SVF(), f2 = new SVF();
    voice(t, decay * 4, (tt) => {
      const n = nz();
      const s = f.run(n, 4200, 0.6).hp + f2.run(n, 7800, 3).bp * 0.5;
      return s * Math.min(1, tt / 0.002) * Math.exp(-tt / decay) * amp;
    }, { pan: p, rev: 0.3 });
  }
}
function swell(tEnd, dur = 0.45, amp = 0.35, label) {
  cue(tEnd, 'whoosh', { label: label || 'reverse-swell', start: +(tEnd - dur).toFixed(6) });
  for (const p of [-0.6, 0.6]) {
    const nz = noiseGen(), f = new SVF();
    voice(tEnd - dur, dur, (tt) => {
      const q = tt / dur;
      return f.run(nz(), 1500 + 9000 * q * q, 0.8).hp * Math.pow(q, 3) * amp;
    }, { pan: p, rev: 0.2 });
  }
}
function impact(t, amp = 1, size = 1, label, bright = 1) {
  cue(t, 'impact', { strength: +(amp * size).toFixed(2), ...(label ? { label } : {}) });
  kickTimes.push([t, 1.25]);
  const nz = noiseGen(), lp = new SVF(); let ph = 0;
  voice(t, 2.4 * size + 0.4, (tt) => {
    const f = 27 + 75 * Math.exp(-tt / (0.07 * size));
    ph += f / SR;
    const sub = Math.tanh(1.6 * Math.sin(TAU * ph)) * Math.exp(-tt / (0.55 * size)) * Math.min(1, tt / 0.001);
    const n = lp.run(nz(), 150 + 5000 * bright * Math.exp(-tt / 0.05), 0.8).lp * Math.exp(-tt / (0.22 * size));
    return (sub * 0.9 + n * 0.9) * amp;
  }, { rev: 0.5 });
}
function slam(t, amp = 0.8, label) {
  cue(t, 'impact', { strength: +(amp * 0.6).toFixed(2), label: label || 'slam' });
  const nz = noiseGen(), f = new SVF(); let ph = 0;
  voice(t, 0.7, (tt) => {
    ph += (58 + 90 * Math.exp(-tt / 0.03)) / SR;
    const body = Math.sin(TAU * ph) * Math.exp(-tt / 0.16);
    const n = f.run(nz(), 900 + 3000 * Math.exp(-tt / 0.02), 0.9).lp * Math.exp(-tt / 0.07);
    return Math.tanh((body + n * 0.8) * 1.4) * amp;
  }, { rev: 0.35 });
}
function riser(t0, t1, amp = 0.5, top = 9000, label) {
  cue(t0, 'riser_start', label ? { label } : {}); cue(t1, 'riser_end', label ? { label } : {});
  const dur = t1 - t0;
  for (const side of [-1, 1]) {
    const nz = noiseGen(), bp = new SVF(), lp = new SVF();
    const o1 = new Osc(side > 0 ? 0.3 : 0), o2 = new Osc(0.6); let trem = 0;
    voice(t0, dur, (tt) => {
      const p = tt / dur;
      const fc = 300 * Math.pow(top / 300, p);
      const n = bp.run(nz(), fc, 2.2).bp;
      const f = mtof(45 + 36 * p * p) * (1 + side * 0.004);
      const s = lp.run((o1.saw(f) + o2.saw(f * 1.5)) * 0.5, fc * 0.7, 1.1).lp;
      trem += (3 + 26 * p * p) / SR;
      const tr = 1 - 0.35 * p * (0.5 + 0.5 * Math.sin(TAU * trem));
      return (n * 1.4 + s * 0.3) * Math.pow(p, 1.7) * tr * amp;
    }, { pan: side * 0.55, rev: 0.35 });
  }
}
function whoosh(tp, amp = 0.5, pre = 0.28, post = 0.18, from = -0.7, to = 0.7, label) {
  cue(tp, 'whoosh', { start: +(tp - pre).toFixed(6), ...(label ? { label } : {}) });
  const nz = noiseGen(), bp = new SVF(), dur = pre + post;
  voice(tp - pre, dur, (tt) => {
    const x = tt - pre;
    const env = x < 0 ? Math.pow(1 + x / pre, 3) : Math.exp(-x / (post * 0.3));
    const fc = x < 0 ? 400 * Math.pow(12, 1 + x / pre) : 900 + 3900 * Math.exp(-x / 0.06);
    return bp.run(nz(), fc, 1.4).bp * env * amp * 2.4;
  }, { pan: (tt) => lerp(from, to, smooth(tt / dur)), rev: 0.2 });
}
function bassNote(t, dur, midi, amp = 0.4, bright = 1) {
  const f = mtof(midi), o1 = new Osc(), o2 = new Osc(0.5), lp = new SVF();
  voice(t, dur + 0.03, (tt) => {
    const s = o1.saw(f) * 0.65 + o2.sq(f * 0.5) * 0.45;
    const fc = 110 + bright * 1500 * Math.exp(-tt / 0.065);
    const y = lp.run(s, fc, 1.4).lp;
    const env = Math.min(1, tt / 0.002) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.03) : 1);
    return Math.tanh(y * 1.8) * env * amp;
  }, { bus: 'sc' });
}
function pluck(t, midi, amp = 0.2, bright = 1, pan = 0) {
  const f = mtof(midi), o1 = new Osc(), o2 = new Osc(0.37), lp = new SVF();
  voice(t, 0.32, (tt) => {
    const s = o1.sq(f, 0.25) * 0.7 + o2.saw(f * 1.003) * 0.3;
    const y = lp.run(s, 500 + bright * 6500 * Math.exp(-tt / 0.05), 0.9).lp;
    return y * Math.min(1, tt / 0.0015) * Math.exp(-tt / 0.1) * amp;
  }, { bus: 'sc', pan, dly: 0.35, rev: 0.12 });
}
function pad(t0, t1, notes, fcFn, amp = 0.05, att = 0.02, rel = 0.12) {
  const dur = t1 - t0;
  notes.forEach((m, k) => {
    for (const side of [-1, 1]) {
      const f = mtof(m) * Math.pow(2, side * (6 + k) / 1200);
      const o = new Osc(((k * 0.29 + (side > 0 ? 0.5 : 0)) % 1)), lp = new SVF();
      voice(t0, dur + rel, (tt) => {
        const env = smooth(tt / att) * (tt > dur ? Math.max(0, 1 - (tt - dur) / rel) : 1);
        return lp.run(o.saw(f), fcFn(t0 + tt), 0.9).lp * env * amp;
      }, { bus: 'sc', pan: side * 0.65, rev: 0.3 });
    }
  });
}
function stab(t, notes, amp = 0.12, decay = 0.5, rev = 0.5) {
  notes.forEach((m, k) => {
    for (const side of [-1, 1]) {
      const f = mtof(m) * Math.pow(2, side * 9 / 1200);
      const o = new Osc((k * 0.37) % 1), o2 = new Osc(0.5), lp = new SVF();
      voice(t, decay * 5, (tt) => {
        const s = o.saw(f) * 0.7 + o2.sq(f * 0.5, 0.5) * 0.3;
        return lp.run(s, 500 + 5500 * Math.exp(-tt / 0.18), 0.8).lp * Math.min(1, tt / 0.003) * Math.exp(-tt / decay) * amp;
      }, { pan: side * 0.7, rev });
    }
  });
}
function meow(t, amp = 0.5) {
  cue(t, 'fx', { label: 'meow', dur: 0.55 });
  const dur = 0.55, o = new Osc(), o2 = new Osc(0.5), f1 = new SVF(), f2 = new SVF(), f3 = new SVF();
  voice(t, dur, (tt) => {
    const p = tt / dur;
    let f0 = p < 0.28 ? lerp(560, 860, smooth(p / 0.28)) : lerp(860, 440, smooth((p - 0.28) / 0.72));
    f0 *= 1 + 0.025 * Math.sin(TAU * 7 * tt) * p;
    const src = o.saw(f0) * 0.8 + o2.sq(f0, 0.3) * 0.2;
    const F1 = p < 0.15 ? lerp(320, 480, p / 0.15) : p < 0.45 ? lerp(480, 980, (p - 0.15) / 0.3) : lerp(980, 480, (p - 0.45) / 0.55);
    const F2 = p < 0.15 ? lerp(1900, 2500, p / 0.15) : p < 0.45 ? lerp(2500, 1500, (p - 0.15) / 0.3) : lerp(1500, 850, (p - 0.45) / 0.55);
    const y = f1.run(src, F1, 5).bp + f2.run(src, F2, 7).bp * 0.7 + f3.run(src, 3200, 6).bp * 0.2;
    const env = smooth(tt / 0.035) * (p < 0.1 ? 0.55 + 4.5 * p : 1) * (p > 0.65 ? Math.pow((1 - p) / 0.35, 1.5) : 1);
    return y * env * amp * 1.8;
  }, { rev: 0.3, dly: 0.25, pan: 0.1 });
}
function coin(t, midi, amp = 0.12, pan = 0) {
  cue(t, 'fx', { label: 'coin' });
  const o = new Osc();
  voice(t, 0.4, (tt) => {
    const first = tt < 0.05;
    const s = o.sq(mtof(first ? midi : midi + 5), 0.5);
    return s * (first ? 1 : Math.exp(-(tt - 0.05) / 0.09)) * amp;
  }, { pan, dly: 0.25, rev: 0.15 });
}
function star(t, midi, amp = 0.2, pan = 0) {
  cue(t, 'fx', { label: 'star-pop' });
  const o = new Osc(), o2 = new Osc();
  voice(t, 0.5, (tt) => {
    const m = midi - 12 * Math.exp(-tt / 0.012);
    return (o.sin(mtof(m)) * 0.8 + o2.sq(mtof(m + 12), 0.5) * 0.12) * Math.min(1, tt / 0.001) * Math.exp(-tt / 0.13) * amp;
  }, { pan, rev: 0.3, dly: 0.2 });
}
function alertStab(t) {
  cue(t, 'fx', { label: 'alert' });
  for (const [d, a] of [[0, 1], [S32 * 1.2, 0.8]]) {
    [86, 93, 98].forEach((m, k) => {
      const o = new Osc(k * 0.2);
      voice(t + d, 0.35, (tt) => o.sq(mtof(m) * (1 + 0.03 * Math.exp(-tt / 0.01)), 0.3) * Math.exp(-tt / 0.08) * 0.07 * a,
        { pan: (k - 1) * 0.5, rev: 0.25 });
    });
  }
  const nz = noiseGen(), f = new SVF();
  voice(t, 0.08, (tt) => f.run(nz(), 6000, 1).bp * Math.exp(-tt / 0.012) * 0.6);
}
function glitch(t, dur, amp = 0.1) {
  cue(t, 'fx', { label: 'glitch', dur });
  const r = rng(seed()); let hold = 0, val = 0; const o = new Osc(); let f = 400;
  voice(t, dur, (tt, i) => {
    if (i >= hold) { hold = i + 20 + Math.floor(r() * 400); f = 150 + r() * 3000; val = r() < 0.3 ? 0 : 1; }
    const s = Math.round(o.sq(f, 0.5) * 3) / 3; // 2-bit crush
    return s * val * amp;
  }, { pan: (arrRand() - 0.5) * 1.2, rev: 0.1 });
}
function scan(t0, t1, amp = 0.12) {
  cue(t0, 'fx', { label: 'scan-sweep', dur: +(t1 - t0).toFixed(6) });
  const dur = t1 - t0, nz = noiseGen(), bp = new SVF(), o = new Osc();
  voice(t0, dur, (tt) => {
    const p = tt / dur, sw = Math.sin(Math.PI * p);
    const n = bp.run(nz(), 700 + 2600 * sw, 6).bp;
    const las = o.sin(1600 + 500 * sw) * (0.5 + 0.5 * Math.sin(TAU * 18 * tt));
    return (n * 1.5 + las * 0.25) * sw * amp;
  }, { pan: (tt) => lerp(-0.9, 0.9, tt / dur), rev: 0.25, dly: 0.15 });
}
function bootSting(t) {
  cue(t, 'impact', { strength: 0.2, label: 'boot-sting' });
  const o = new Osc();
  voice(t, 0.3, (tt) => o.sin(120 * Math.pow(12, clamp(tt / 0.22))) * Math.min(1, tt / 0.01) * (tt > 0.22 ? Math.max(0, 1 - (tt - 0.22) / 0.08) : 1) * 0.12, { rev: 0.3 });
  for (const d of [0.28, 0.4]) {
    const b = new Osc(); cue(t + d, 'fx', { label: 'rec-beep' });
    voice(t + d, 0.06, (tt) => b.sin(1976) * Math.exp(-tt / 0.03) * 0.1, { rev: 0.2, dly: 0.2 });
  }
  let ph = 0;
  voice(t, 1.0, (tt) => { ph += (mtof(26) + 30 * Math.exp(-tt / 0.05)) / SR; return -Math.sin(TAU * ph) * Math.exp(-tt / 0.3) * Math.min(1, tt / 0.002) * 0.4; });
}
function swapBlip(t) {
  cue(t, 'fx', { label: 'swap-blip' });
  [[0, 74, -0.5], [0.06, 81, 0.5]].forEach(([d, m, p]) => {
    const o = new Osc();
    voice(t + d, 0.2, (tt) => o.sq(mtof(m), 0.25) * Math.exp(-tt / 0.06) * 0.1, { pan: p, dly: 0.3, rev: 0.1 });
  });
}
function door(t) {
  cue(t, 'fx', { label: 'door-clunk' });
  let ph = 0; const nz = noiseGen(), f = new SVF();
  const partials = [[312, 0.3], [527, 0.2], [883, 0.14], [1291, 0.08]].map(([fr, a]) => [new Osc(), fr, a]);
  voice(t, 0.9, (tt) => {
    ph += (60 + 50 * Math.exp(-tt / 0.02)) / SR;
    let s = Math.sin(TAU * ph) * Math.exp(-tt / 0.18) * 0.9;
    for (const [o, fr, a] of partials) s += o.sin(fr) * a * Math.exp(-tt / 0.25);
    s += f.run(nz(), 2500, 1).bp * Math.exp(-tt / 0.01) * 0.8;
    return Math.tanh(s * 1.2) * 0.55;
  }, { rev: 0.35, pan: -0.15 });
}
function rattle(t, amp = 0.35) {
  cue(t, 'fx', { label: 'crate-rattle' });
  const r = rng(seed());
  let d = 0;
  for (let k = 0; k < 4; k++) {
    const nz = noiseGen(), f = new SVF(), o = new Osc(); const fr = 160 + r() * 90, fc = 600 + r() * 700;
    const a = amp * (1 - k * 0.18);
    voice(t + d, 0.09, (tt) => (f.run(nz(), fc, 3).bp * 1.6 + o.sin(fr) * 0.5) * Math.exp(-tt / 0.018) * a,
      { pan: (r() - 0.5) * 0.8, rev: 0.15 });
    d += 0.018 + r() * 0.02;
  }
}
function burst(t) {
  cue(t, 'fx', { label: 'crate-burst' });
  impact(t, 0.75, 1.1, 'crate-burst');
  crash(t, 0.35, 0.6);
  const r = rng(seed());
  for (let k = 0; k < 6; k++) {
    const nz = noiseGen(), f = new SVF(); const d = k * 0.012 + r() * 0.01;
    voice(t + d, 0.25, (tt) => f.run(nz(), 900 + r() * 2500, 1.2).bp * Math.exp(-tt / 0.03) * 0.6, { pan: (r() - 0.5) * 1.4, rev: 0.2 });
  }
  [86, 90, 93, 98, 102].forEach((m, k) => { // sparkle chime (D major shimmer: freed!)
    const o = new Osc();
    voice(t + 0.02 + k * 0.035, 1.2, (tt) => o.sin(mtof(m)) * Math.exp(-tt / 0.35) * 0.06, { pan: (k - 2) * 0.35, dly: 0.35, rev: 0.4 });
  });
}
function portal(t0, t1, amp = 0.12) {
  cue(t0, 'fx', { label: 'portal-swirl', dur: +(t1 - t0).toFixed(6) });
  const dur = t1 - t0;
  for (const side of [-1, 1]) {
    const o = new Osc(side > 0 ? 0.5 : 0), bp = new SVF(); let lfo = side > 0 ? 0.25 : 0;
    voice(t0, dur, (tt) => {
      const p = tt / dur;
      lfo += (4 + 20 * p) / SR;
      const f = mtof(57 + 24 * p);
      const s = bp.run(o.saw(f), 800 + 3000 * (0.5 + 0.5 * Math.sin(TAU * lfo)) * (0.5 + p), 3).bp;
      return s * smooth(p * 3) * amp;
    }, { pan: side * 0.7, rev: 0.4 });
  }
}
function drone(t0, t1) {
  const dur = t1 - t0, o = new Osc();
  voice(t0, dur + 0.1, (tt) => o.sin(mtof(26)) * smooth(tt / 1.2) * 0.3 * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.1) : 1), { bus: 'sc' });
}
function subSwell(t0, t1, midi, amp = 0.35) {
  const dur = t1 - t0, o = new Osc(), o2 = new Osc(), lp = new SVF();
  voice(t0, dur, (tt) => {
    const p = tt / dur;
    const s = o.sin(mtof(midi)) * 0.8 + lp.run(o2.saw(mtof(midi)), 120 + 900 * p * p, 1.2).lp * 0.5;
    return s * (0.25 + 0.75 * p) * amp * smooth((dur - tt) / 0.02);
  }, { bus: 'sc' });
}

// ---------- harmony ----------
const CH = {
  Dm: { bass: 38, pad: [50, 53, 57, 62], arp: [62, 65, 69, 74] },
  Bb: { bass: 34, pad: [50, 53, 58, 62], arp: [62, 65, 70, 74] },
  Gm: { bass: 31, pad: [50, 55, 58, 62], arp: [62, 67, 70, 74] },
  F:  { bass: 41, pad: [48, 53, 57, 60], arp: [60, 65, 69, 72] },
  A:  { bass: 33, pad: [49, 52, 57, 61], arp: [61, 64, 69, 73] },
};
const barChord = ['Dm', 'Dm', 'Dm', 'Bb', 'Gm', 'F', 'A', 'Dm'];
const ARP = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 3, 2, 1, 2];
const barOf = (t) => Math.min(7, Math.floor(t / BAR + 1e-9));

// ============ ARRANGEMENT ============
// --- Bar 1: COLD OPEN (0 - 1.875) ---
bootSting(0);
drone(0, bt(8));
pad(0, BAR, CH.Dm.pad, (t) => 180 + 500 * (t / BAR), 0.035, 1.0, 0.1);
glitch(bt(1), 0.09, 0.09); glitch(bt(1.25), 0.05, 0.08); glitch(bt(1.75), 0.07, 0.07); glitch(bt(3), 0.05, 0.06);
cue(bt(1), 'fx', { label: 'title: KIBBLE CORP // RESTRICTED' });
scan(bt(1.5), bt(3.5), 0.13);
for (let s = 8; s < 16; s++) hat(s * S16, 0.03 + 0.07 * (s - 8) / 8, false, s % 2 ? 0.3 : -0.3);
riser(bt(2), bt(4), 0.3, 7000, 'into-crew');
whoosh(bt(4), 0.45, 0.3, 0.15, -0.8, 0.8, 'into-crew');

// --- Bar 2: THE CREW (1.875 - 3.75) ---
impact(bt(4), 0.8, 1.0, 'drop-kick / cat 1 slam');
crash(bt(4), 0.3, 0.7);
slam(bt(5), 0.8, 'cat 2 slam'); slam(bt(6), 0.8, 'TWO CATS.'); slam(bt(7), 0.9, 'ONE HEIST.');
pad(bt(4), bt(8), CH.Dm.pad, () => 700, 0.04);
for (let b = 4; b < 8; b++) kick(bt(b), 0.95);
clap(bt(5), 0.8); clap(bt(7), 0.9);
for (let s = 16; s < 32; s++) {
  const st = s % 4;
  if (st === 2) hat(s * S16, 0.11, true, 0.2);
  else if (st !== 0) hat(s * S16, 0.05, false, -0.2);
  if (st === 2 || st === 3) bassNote(s * S16, S16 * 0.8, CH.Dm.bass + (st === 3 ? 12 : 0), 0.33, 0.6);
}
// snare fill into montage
[[7.5, 0.35], [7.625, 0.45], [7.75, 0.55], [7.8125, 0.6], [7.875, 0.7], [7.9375, 0.8]].forEach(([b, a]) => snare(bt(b), a, 0.5 + a * 0.5, 'fill'));
riser(bt(7), bt(8), 0.25, 9000, 'swap-whip');
whoosh(bt(8), 0.7, 0.3, 0.2, 0.9, -0.9, 'SWAP whip');

// --- Bars 3-6: GAMEPLAY MONTAGE, STAKES, BREEDS (3.75 - 11.25) ---
impact(bt(8), 1.0, 1.4, 'MONTAGE DROP'); crash(bt(8), 0.45, 1.0);
cue(bt(8), 'callout', { label: 'SNEAK' });
for (let b = 8; b < 24; b++) {
  kick(bt(b), 1.0);
  if (b % 2 === 1) clap(bt(b), 1.0);
}
kick(bt(15.75), 0.7, 0.12, 'pickup');
for (let s = 32; s < 96; s++) {
  const t = s * S16, st = s % 4, bar = barOf(t + 1e-6), ch = CH[barChord[bar]];
  // hats
  const vel = [0.06, 0.035, 0.12, 0.045][st] * (1 + 0.15 * (arrRand() - 0.5));
  if (st !== 0 || bar >= 4) hat(t, st === 0 ? 0.04 : vel, st === 2, st % 2 ? 0.35 : -0.25);
  // bass: 16th gallop, rest on kick
  if (st !== 0) bassNote(t, S16 * 0.78, ch.bass + (st === 2 ? 12 : 0), st === 2 ? 0.36 : 0.28, 1);
  // arp lead
  const bright = bar === 5 ? 1.25 : bar === 2 ? 0.55 + 0.45 * ((s - 32) / 16) : 1;
  const oct = bar === 5 ? 12 : 0;
  const m = ch.arp[ARP[s % 16]] + oct + (bar >= 4 && s % 16 === 12 ? 12 : 0);
  pluck(t, m, bar === 5 ? 0.15 : 0.17, bright, s % 2 ? 0.45 : -0.45);
  if (bar === 5 && st === 0) pluck(t + S32, m + 7, 0.06, 1.3, 0); // sparkle layer
}
for (let bar = 2; bar < 6; bar++) {
  const ch = CH[barChord[bar]];
  pad(bar * BAR, (bar + 1) * BAR, ch.pad, () => (bar === 5 ? 2600 : 1500), 0.035);
}
// montage callouts
whoosh(bt(10), 0.4, 0.2, 0.15, -0.8, 0.8, 'panel cut'); swapBlip(bt(10)); cue(bt(10), 'callout', { label: 'SWAP' });
meow(bt(12), 0.24); impact(bt(12), 0.3, 0.5, 'meow shockwave'); cue(bt(12), 'callout', { label: 'MEOW' });
whoosh(bt(14), 0.4, 0.2, 0.15, 0.8, -0.8, 'panel cut'); door(bt(14)); cue(bt(14), 'callout', { label: 'HOLD THE DOOR' });
riser(bt(15), bt(16), 0.25, 9000, 'into-stakes');
whoosh(bt(16), 0.55, 0.28, 0.2, -0.8, 0.8, 'into-stakes');

// Bar 5: STAKES & SCORE
impact(bt(16), 1.0, 1.5, 'STAKES HIT'); crash(bt(16), 0.45, 1.0);
[86, 89, 91, 93, 96, 98, 101, 103].forEach((m, k) => coin(bt(16) + k * S16, m, 0.11, ((k * 0.37) % 1 - 0.5) * 1.2));
cue(bt(16), 'fx', { label: 'coin-burst -> counter', dur: +(8 * S16).toFixed(6) });
slam(bt(18), 0.85, '8 HEISTS'); stab(bt(18), [50, 57, 62, 65], 0.06, 0.25, 0.4);
star(bt(18.5), 86, 0.18, -0.5); star(bt(18.75), 89, 0.18, 0); star(bt(19), 93, 0.2, 0.5);
alertStab(bt(19.5));
whoosh(bt(20), 0.5, 0.25, 0.18, 0.8, -0.8, 'into-breeds');

// Bar 6: BREEDS
impact(bt(20), 0.75, 1.0, 'BREEDS'); crash(bt(20), 0.35, 0.8);
swell(bt(22), 0.45, 0.3, 'into 58 CATS reveal');
impact(bt(22), 0.6, 0.9, '58 CATS reveal'); crash(bt(22), 0.3, 0.8);
whoosh(bt(24), 0.5, 0.3, 0.2, -0.8, 0.8, 'into-rescue');

// --- Bar 7: RESCUE BUILD-UP (11.25 - 13.125) ---
impact(bt(24), 0.5, 0.9, 'breakdown', 0.3);
riser(bt(24), bt(28), 0.55, 12000, 'rescue build');
subSwell(bt(24), bt(28) - 0.01, 33, 0.35);
pad(bt(24), bt(28), CH.A.pad, (t) => 300 * Math.pow(18, (t - bt(24)) / BAR), 0.04, 0.1, 0.02);
for (let s = 96; s < 112; s++) {
  const t = s * S16, p = (s - 96) / 16;
  pluck(t, CH.A.arp[ARP[s % 16]] + (s >= 104 ? 12 : 0), 0.08 + 0.1 * p, 0.05 + 0.9 * p * p, s % 2 ? 0.45 : -0.45);
}
// accelerating snare roll: quarters -> 8ths -> 16ths -> 32nds, last 32nd left empty (suck-in)
const roll = [];
roll.push(24, 25);
for (let k = 0; k < 4; k++) roll.push(26 + k * 0.25);
for (let k = 0; k < 7; k++) roll.push(27 + k * 0.125);
roll.forEach((b, k) => snare(bt(b), 0.25 + 0.6 * (k / (roll.length - 1)), 0.2 + 0.8 * (k / (roll.length - 1)), 'roll'));
[24.5, 25.25, 25.75, 26.25, 26.5, 26.75].forEach((b, k) => rattle(bt(b), 0.3 + k * 0.03));
burst(bt(27));
portal(bt(27), bt(28) - 0.02, 0.1);
swell(bt(28), 0.5, 0.35, 'into LOGO SLAM');

// --- Bar 8: LOGO SLAM (13.125 - 15.0) ---
impact(bt(28), 1.2, 2.2, 'LOGO SLAM (massive)');
kick(bt(28), 1.0, 0.35);
crash(bt(28), 0.55, 1.3);
stab(bt(28), [38, 50, 57, 62, 65, 69], 0.08, 0.7, 0.6);
cue(bt(28), 'callout', { label: 'CATNIP HEIST' });
for (let b = 29; b < 31; b++) kick(bt(b), 1.0);
clap(bt(29), 1.0);
cue(bt(29), 'callout', { label: 'Sneak. Swap. Rescue.' });
cue(bt(30), 'callout', { label: 'PLAY NOW' });
for (let s = 112; s < 124; s++) {
  const t = s * S16, st = s % 4;
  hat(t, [0.04, 0.035, 0.12, 0.045][st], st === 2, st % 2 ? 0.35 : -0.25);
  if (st !== 0 && s >= 116) bassNote(t, S16 * 0.78, CH.Dm.bass + (st === 2 ? 12 : 0), st === 2 ? 0.36 : 0.28, 1.2);
  pluck(t, CH.Dm.arp[ARP[s % 16]] + 12, 0.15, 1.2, s % 2 ? 0.45 : -0.45);
}
pad(bt(28), bt(31), CH.Dm.pad, () => 3000, 0.03);
clap(bt(30.75), 0.6); snare(bt(30.875), 0.7, 1, 'pickup');
swell(bt(31), 0.35, 0.3, 'into FINAL');
// final hit on the last downbeat, tail rings out
impact(bt(31), 1.1, 1.6, 'FINAL HIT');
kick(bt(31), 1.0, 0.4);
crash(bt(31), 0.5, 1.4);
stab(bt(31), [38, 50, 57, 62, 65, 69, 74], 0.08, 0.9, 0.8);
{ const o = new Osc(); voice(bt(31), 0.47, (tt) => o.sin(mtof(98)) * Math.exp(-tt / 0.25) * 0.05, { rev: 0.5, dly: 0.4 }); }
cue(DUR, 'end');

// ============ MIX ============
// sidechain envelope from kicks/impacts
const sc = new Float32Array(N).fill(1);
for (const [t, depthMul] of kickTimes) {
  const s0 = Math.round(t * SR), len = Math.round(0.22 * SR), depth = Math.min(0.9, 0.72 * depthMul);
  for (let i = 0; i < len && s0 + i < N; i++) {
    const p = i / len;
    const g = 1 - depth * (1 - smooth(p)) * Math.min(1, i / 48);
    if (g < sc[s0 + i]) sc[s0 + i] = g;
  }
}
// ping-pong dotted-8th delay
const dl = { L: new Float32Array(N), R: new Float32Array(N) };
{
  const D = Math.round(BEAT * 0.75 * SR), fb = 0.38;
  const bufL = new Float32Array(D), bufR = new Float32Array(D); const lpL = new SVF(), lpR = new SVF(); let w = 0;
  for (let i = 0; i < N; i++) {
    const oL = bufL[w], oR = bufR[w];
    bufL[w] = dlyIn[i] + lpR.run(oR, 4500, 0.6).lp * fb;
    bufR[w] = lpL.run(oL, 4500, 0.6).lp * fb;
    dl.L[i] = oL; dl.R[i] = oR;
    revIn[i] += (oL + oR) * 0.15;
    w = (w + 1) % D;
  }
}
// Freeverb (stereo)
function freeverb(input, room = 0.86, damp = 0.35) {
  const sc = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const out = [new Float32Array(N), new Float32Array(N)];
  [0, 23].forEach((spread, ch) => {
    const combs = combT.map((c) => ({ b: new Float32Array(Math.round((c + spread) * sc)), i: 0, f: 0 }));
    const aps = apT.map((a) => ({ b: new Float32Array(Math.round((a + spread) * sc)), i: 0 }));
    const o = out[ch];
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015;
      let acc = 0;
      for (const c of combs) {
        const y = c.b[c.i];
        c.f = y * (1 - damp) + c.f * damp;
        c.b[c.i] = x + c.f * room;
        if (++c.i >= c.b.length) c.i = 0;
        acc += y;
      }
      for (const a of aps) {
        const bo = a.b[a.i];
        a.b[a.i] = acc + bo * 0.5;
        acc = bo - acc;
        if (++a.i >= a.b.length) a.i = 0;
      }
      o[n] = acc;
    }
  });
  return out;
}
const [rvL, rvR] = freeverb(revIn);
const WET = 0.9, DLY = 0.55;
let mixL = new Float32Array(N), mixR = new Float32Array(N);
{
  const hpL = new SVF(), hpR = new SVF(), rhL = new SVF(), rhR = new SVF();
  for (let i = 0; i < N; i++) {
    const rl = rhL.run(rvL[i], 180, 0.7).hp, rr = rhR.run(rvR[i], 180, 0.7).hp; // keep reverb out of the sub
    const l = mainL[i] + scL[i] * sc[i] + rl * WET + dl.L[i] * DLY;
    const r = mainR[i] + scR[i] * sc[i] + rr * WET + dl.R[i] * DLY;
    mixL[i] = hpL.run(l, 24, 0.7).hp;
    mixR[i] = hpR.run(r, 24, 0.7).hp;
  }
}

// ---------- mastering ----------
function softclip(x) { const a = Math.abs(x), t = 0.6; if (a <= t) return x; return Math.sign(x) * (t + (1 - t) * Math.tanh((a - t) / (1 - t))); }
const CEIL = Math.pow(10, -1.05 / 20);
const TPK = [0.25, 0.5, 0.75].map((fr) => { // 16-tap Hann-windowed sinc for position i+fr
  const k = []; for (let j = 0; j < 16; j++) { const x = j - 7 - fr; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / 8.5);
    k.push((x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w); }
  const sum = k.reduce((a, b) => a + b, 0); return k.map((v) => v / sum);
});
// section dynamics: leave headroom in the montage so the LOGO SLAM (bar 8) lands biggest,
// plus a 60 ms suck-out gap right before 13.125.
const sect = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR; let g = 1;
  if (t >= bt(8) && t < bt(24)) g = 0.8;
  const g0 = bt(28) - 0.06, g1 = bt(28) - 0.004;
  if (t >= g0 - 0.006 && t < bt(28)) g *= t < g0 ? lerp(1, 0.3, (t - g0 + 0.006) / 0.006) : t < g1 ? 0.3 : lerp(0.3, 1, (t - g1) / 0.004);
  sect[i] = g;
}
function master(gain) {
  const L = new Float32Array(N), R = new Float32Array(N), req = new Float32Array(N);
  for (let i = 0; i < N; i++) { L[i] = softclip(mixL[i] * gain * sect[i]); R[i] = softclip(mixR[i] * gain * sect[i]); }
  // true-peak aware gain request: sample peak plus 4x windowed-sinc intersample estimate
  const TC = CEIL * 0.97;
  for (let i = 0; i < N; i++) {
    let pk = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    for (let f = 0; f < 3; f++) {
      const k = TPK[f]; let a = 0, b = 0;
      for (let j = 0; j < 16; j++) { const n = i - 7 + j; if (n < 0 || n >= N) continue; a += L[n] * k[j]; b += R[n] * k[j]; }
      pk = Math.max(pk, Math.abs(a), Math.abs(b));
    }
    req[i] = pk > TC ? TC / pk : 1;
  }
  const W = 96; // 2 ms lookahead
  const gmin = new Float32Array(N);
  { // sliding min over [n-W, n+W] via deque
    const dq = new Int32Array(N); let h = 0, tl = 0;
    for (let j = 0; j < N + W; j++) {
      if (j < N) { while (tl > h && req[dq[tl - 1]] >= req[j]) tl--; dq[tl++] = j; }
      const n = j - W; if (n < 0) continue;
      while (dq[h] < n - W) h++;
      gmin[n] = req[dq[h]];
    }
  }
  // box-average gmin over the same window: result <= req[n] everywhere (no overs)
  const g = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let s = 0; const a = n - W, b = n + W;
    if (n === 0) { for (let k = a; k <= b; k++) s += k >= 0 && k < N ? gmin[k] : 1; g[0] = s / (2 * W + 1); continue; }
    g[n] = g[n - 1] + ((b < N ? gmin[b] : 1) - (a - 1 >= 0 ? gmin[a - 1] : 1)) / (2 * W + 1);
  }
  const rel = 1 - Math.exp(-1 / (0.08 * SR)); let gr = 1;
  for (let n = 0; n < N; n++) {
    gr = Math.min(g[n], gr + rel * (1 - gr));
    L[n] = clamp(L[n] * gr, -CEIL, CEIL); R[n] = clamp(R[n] * gr, -CEIL, CEIL);
  }
  // edges: 5 ms fade-in, gentle tail settle over the last 0.3 s, 20 ms fade-out
  const fi = Math.round(0.005 * SR), fo = Math.round(0.02 * SR), ts = Math.round(0.3 * SR);
  for (let i = 0; i < fi; i++) { L[i] *= i / fi; R[i] *= i / fi; }
  for (let i = 0; i < ts; i++) { const k = N - ts + i, gg = 1 - 0.6 * Math.pow(i / ts, 1.5); L[k] *= gg; R[k] *= gg; }
  for (let i = 0; i < fo; i++) { const k = N - 1 - i, gg = i / fo; L[k] *= gg; R[k] *= gg; }
  return [L, R];
}
function biquad(x, b, a) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function lufs(L, R) {
  const kw = (x) => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  const kl = kw(L), kr = kw(R), blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), zs = [];
  for (let s = 0; s + blk <= N; s += hop) { let a = 0; for (let i = s; i < s + blk; i++) a += kl[i] * kl[i] + kr[i] * kr[i]; zs.push(a / blk); }
  const ld = (z) => -0.691 + 10 * Math.log10(z);
  const abs = zs.filter((z) => ld(z) > -70);
  const rel = ld(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((z) => ld(z) > rel);
  return ld(g.reduce((a, b) => a + b, 0) / g.length);
}
const TARGET = -10.3;
let gain = 1, out, lu;
for (let it = 0; it < 6; it++) {
  out = master(gain); lu = lufs(out[0], out[1]);
  if (Math.abs(lu - TARGET) < 0.15) break;
  gain *= Math.pow(10, (TARGET - lu) / 20);
}

// ---------- write WAV (16-bit, TPDF dither) ----------
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const dr = rng(777);
let peak = 0;
for (let i = 0; i < N; i++) {
  for (let c = 0; c < 2; c++) {
    const v = out[c][i]; peak = Math.max(peak, Math.abs(v));
    const d = (dr() - dr()) / 32768;
    buf.writeInt16LE(Math.round(clamp(v + d, -1, 32767 / 32768) * 32767), 44 + i * 4 + c * 2);
  }
}
fs.writeFileSync(path.join(HERE, 'track.wav'), buf);
cues.sort((a, b) => a.t - b.t || a.type.localeCompare(b.type));
fs.writeFileSync(path.join(HERE, 'cues.json'), JSON.stringify(cues, null, 1));
console.log(`wrote track.wav (${(N / SR).toFixed(3)} s) gain=${gain.toFixed(3)} LUFS~${lu.toFixed(2)} peak=${(20 * Math.log10(peak)).toFixed(2)} dBFS, ${cues.length} cues`);
