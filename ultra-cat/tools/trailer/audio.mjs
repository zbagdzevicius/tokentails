#!/usr/bin/env node
// Ultra Cat trailer soundtrack, rendered offline in node (no browser, no asset files).
//   node tools/trailer/audio.mjs [trailer|mode ...]   -> build/audio/<cut>.wav (48 kHz stereo, about -14 LUFS, TP <= -1 dBTP)
// Music: 150 BPM in D minor (kick, clap, hats, saw bass riff, chord stabs, square lead), arranged per cut from edl.mjs.
// SFX: placed on the game events logged during capture (build/footage/<shot>-<aspect>.json), mapped through the EDL,
// plus edit hits (title slam, cut whooshes, end-card meow).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BAR, BEAT, CUTS, FPS, layout } from './edl.mjs';
import { BUILD, FOOTAGE } from './lib.mjs';

const SR = 48000;
const OUT = path.join(BUILD, 'audio');
fs.mkdirSync(OUT, { recursive: true });
const SPB = (BEAT / FPS) * SR; // samples per beat (0.4 s)

// ------------------------------------------------------------------------------------------- tiny DSP kit
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
class Bus {
  constructor(n) {
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
    this.n = n;
  }
  add(at, buf, gain = 1, pan = 0) {
    const s = Math.round(at);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    for (let i = 0; i < buf.length; i++) {
      const k = s + i;
      if (k < 0 || k >= this.n) continue;
      this.L[k] += buf[i] * gl;
      this.R[k] += buf[i] * gr;
    }
  }
}
function biquad(buf, type, f0, q = 0.707, fEnd) {
  // time-varying when fEnd is given (linear sweep in log frequency)
  const out = new Float32Array(buf.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0, b1, b2, a1, a2;
  const coef = (f) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const al = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    let B0, B1, B2;
    if (type === 'lp') (B0 = (1 - c) / 2), (B1 = 1 - c), (B2 = (1 - c) / 2);
    else if (type === 'hp') (B0 = (1 + c) / 2), (B1 = -(1 + c)), (B2 = (1 + c) / 2);
    else (B0 = al), (B1 = 0), (B2 = -al); // bp
    const A0 = 1 + al;
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = (-2 * c) / A0; a2 = (1 - al) / A0;
  };
  coef(f0);
  for (let i = 0; i < buf.length; i++) {
    if (fEnd && i % 32 === 0) coef(f0 * Math.pow(fEnd / f0, i / buf.length));
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}
const env = (n, a, d, curve = 3) => (i) => (i < a ? i / a : Math.pow(Math.max(0, 1 - (i - a) / d), curve));
function make(dur, fn) {
  const n = Math.round(dur * SR);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = fn(i, i / SR, n);
  return b;
}
const noise = (dur) => make(dur, () => rnd());

// ------------------------------------------------------------------------------------------- instruments
const kick = () => {
  let ph = 0;
  return make(0.42, (i, t) => {
    const f = 48 + 140 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    return Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t * 7.5)) + (i < 160 ? rnd() * 0.25 * (1 - i / 160) : 0);
  });
};
const KICK = kick();
const CLAP = (() => {
  const n = biquad(noise(0.3), 'bp', 1400, 0.8);
  return make(0.3, (i, t) => n[i] * (t < 0.03 ? (Math.floor(t * 100) % 1 === 0 ? 1 : 0.6) * Math.exp(-((t * 1000) % 10) / 3) : Math.exp(-(t - 0.03) * 22)) * 1.4);
})();
const HAT = (() => { const n = biquad(noise(0.08), 'hp', 7500, 0.7); return make(0.08, (i, t) => n[i] * Math.exp(-t * 60)); })();
const OHAT = (() => { const n = biquad(noise(0.3), 'hp', 6500, 0.7); return make(0.3, (i, t) => n[i] * Math.exp(-t * 11)); })();
const CRASH = (() => { const n = biquad(noise(2.2), 'hp', 3500, 0.5); return make(2.2, (i, t) => n[i] * Math.exp(-t * 2.2)); })();
function saw(f, dur, { cut = 1800, cutEnd, q = 1.2, det = 0.006, a = 0.005, d } = {}) {
  let p1 = 0, p2 = 0;
  const raw = make(dur, (i, t) => {
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * (1 + det)) / SR) % 1;
    const e = t < a ? t / a : Math.exp(-(t - a) * (d ?? 3));
    return ((2 * p1 - 1) + (2 * p2 - 1)) * 0.5 * e;
  });
  return biquad(raw, 'lp', cut, q, cutEnd);
}
function square(f, dur, { d = 6, vib = 0 } = {}) {
  let p = 0;
  return biquad(make(dur, (i, t) => {
    p = (p + (f * (1 + vib * Math.sin(t * 34) * Math.min(1, t * 4))) / SR) % 1;
    return (p < 0.5 ? 1 : -1) * Math.min(1, t * 300) * Math.exp(-t * d);
  }), 'lp', 4200, 0.7);
}
function meow(pitch = 1, dur = 0.55) {
  let p = 0;
  const src = make(dur, (i, t) => {
    const x = t / dur;
    const f = pitch * (520 + 300 * Math.sin(Math.PI * Math.min(1, x * 1.6)) - 160 * x);
    p = (p + f / SR) % 1;
    return 2 * p - 1;
  });
  const f1 = biquad(src, 'bp', 450, 4, 900);
  const f2 = biquad(src, 'bp', 2600, 6, 1200);
  return make(dur, (i, t) => {
    const x = t / dur;
    const e = Math.min(1, x * 12) * Math.pow(1 - x, 0.8);
    return (f1[i] * 1.2 + f2[i] * 0.8) * e * 1.6;
  });
}
function whoosh(dur = 0.22, from = 600, to = 3500) {
  const n = biquad(noise(dur), 'bp', from, 1.4, to);
  return make(dur, (i, t) => n[i] * Math.sin(Math.PI * (t / dur)) * 1.8);
}
function thud(size = 1) {
  let ph = 0;
  const n = biquad(noise(0.5), 'lp', 900);
  return make(0.6, (i, t) => {
    ph += (2 * Math.PI * (38 + 110 * Math.exp(-t * 18))) / SR;
    return (Math.sin(ph) * Math.exp(-t * 6) * 1.2 + n[Math.min(i, n.length - 1)] * Math.exp(-t * 9) * 0.9) * size;
  });
}
function crumble(size = 1) {
  // building floors falling: filtered noise with clattery amplitude bursts
  const dur = 0.5 + 0.5 * size;
  const n = biquad(noise(dur), 'lp', 1400 + 800 * size, 0.8);
  let g = 0;
  return make(dur, (i, t) => {
    if (i % 900 === 0) g = 0.4 + 0.6 * Math.abs(rnd());
    return n[i] * g * Math.exp(-t * (4 / dur)) * 1.6;
  });
}
function boom(size = 1) {
  const n = biquad(noise(1.4), 'lp', 600, 0.7, 120);
  let ph = 0;
  return make(1.4, (i, t) => {
    ph += (2 * Math.PI * (30 + 70 * Math.exp(-t * 6))) / SR;
    return (n[i] * 2.4 * Math.exp(-t * 2.8) + Math.sin(ph) * Math.exp(-t * 3.5)) * size;
  });
}
function zap(dur = 1.2) {
  let p = 0;
  return biquad(make(dur, (i, t) => {
    p = (p + (180 + 40 * Math.sin(t * 50)) / SR) % 1;
    return (2 * p - 1) * Math.min(1, t * 30) * Math.min(1, (dur - t) * 6) * 0.6;
  }), 'bp', 1200, 1.2);
}
function boing() {
  let p = 0;
  return make(0.4, (i, t) => {
    p += (2 * Math.PI * (220 + 260 * Math.sin(t * 40) * Math.exp(-t * 5))) / SR;
    return Math.sin(p) * Math.exp(-t * 6) * 0.8;
  });
}
function alarm() {
  let p = 0;
  return make(0.9, (i, t) => {
    p = (p + (t % 0.3 < 0.15 ? 880 : 660) / SR) % 1;
    return (p < 0.5 ? 0.5 : -0.5) * Math.min(1, (0.9 - t) * 8);
  });
}
function riser(dur) {
  const n = biquad(noise(dur), 'bp', 300, 2, 6000);
  return make(dur, (i, t) => n[i] * Math.pow(t / dur, 2) * 1.6);
}
function bark() {
  const n = biquad(noise(0.25), 'bp', 700, 2);
  let p = 0;
  return make(0.25, (i, t) => {
    p = (p + (300 - 400 * t) / SR) % 1;
    return ((2 * p - 1) * 0.6 + n[i]) * Math.exp(-t * 14) * 1.2;
  });
}

// ------------------------------------------------------------------------------------------- music
// D minor: chords i - VI - III - VII (Dm Bb F C), one per bar; bass riff in 8ths
const CHORDS = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
const BASS = [[38, 38, 50, 38, 41, 38, 43, 45], [34, 34, 46, 34, 38, 34, 41, 43], [41, 41, 53, 41, 45, 41, 48, 46], [36, 36, 48, 36, 40, 36, 43, 45]];
const LEAD = [74, 72, 69, 72, 74, 77, 76, 72, 74, 72, 69, 67, 69, 72, 74, 0];

function music(bus, bars, plan) {
  const at = (bar, beat = 0) => bar * 4 * SPB + beat * SPB;
  for (let bar = 0; bar < bars; bar++) {
    const sec = plan(bar);
    if (sec === 'silent') continue;
    const ch = CHORDS[bar % 4];
    const bs = BASS[bar % 4];
    const boss = sec === 'boss';
    const big = sec === 'frenzy';
    const intro = sec === 'intro';
    for (let beat = 0; beat < 4; beat++) {
      if (sec !== 'end' || (bar === plan.endBar && beat === 0)) bus.add(at(bar, beat), KICK, intro ? 0.8 : 0.95);
      if (!intro && sec !== 'end' && (beat === 1 || beat === 3)) bus.add(at(bar, beat), CLAP, 0.4, 0.05);
      if (sec === 'end') continue;
      for (let s = 0; s < 4; s++) {
        if (intro && s % 2) continue;
        bus.add(at(bar, beat + s / 4), HAT, s % 2 ? 0.06 : 0.11, 0.35);
      }
      if (!intro) bus.add(at(bar, beat + 0.5), OHAT, 0.08, -0.3);
      if (boss) bus.add(at(bar, beat + 0.5), KICK, 0.5);
    }
    // bass 8ths
    if (sec !== 'end')
      for (let e = 0; e < 8; e++) {
        const n = bs[e] + (boss ? 0 : 0);
        bus.add(at(bar, e / 2), saw(mtof(n), 0.19, { cut: intro ? 500 : big ? 1600 : 1000, cutEnd: 220, q: 2.2, d: 9, det: 0.004 }), intro ? 0.32 : 0.42);
      }
    // chord stabs
    if (!intro) {
      const stabs = sec === 'end' ? [0] : [0, 1.5, 2.5];
      for (const st of stabs)
        for (const n of ch) {
          const long = sec === 'end';
          bus.add(at(bar, st), saw(mtof(n + 12), long ? 3.2 : 0.3, { cut: long ? 2600 : 3200, cutEnd: long ? 700 : 900, d: long ? 0.9 : 8, det: 0.01 }), long ? 0.16 : 0.12, (n % 3) * 0.3 - 0.3);
        }
    }
    // lead
    if (sec === 'lead' || big || boss) {
      for (let s = 0; s < 8; s++) {
        let n = LEAD[((bar % 2) * 8 + s) % 16];
        if (!n) continue;
        if (boss) n = [62, 65, 62, 68, 62, 65, 69, 68][s] + 12;
        if (big) n += 12;
        bus.add(at(bar, s / 2), square(mtof(n), 0.22, { d: 9, vib: 0.006 }), big ? 0.07 : 0.085, 0.15);
      }
    }
    if (boss && bar % 2 === 0) bus.add(at(bar), alarm(), 0.12);
  }
}

// ------------------------------------------------------------------------------------------- events -> sfx
function eventSfx(bus, cut) {
  const { clips } = layout(cut);
  const toS = (f) => (f / FPS) * SR;
  const lastCrash = { f: -99 };
  for (const c of clips) {
    if (c.fx === 'end') continue;
    const file = path.join(FOOTAGE, `${c.shot}-${cut.aspect}.json`);
    if (!fs.existsSync(file)) continue;
    const { log } = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const e of log) {
      if (e.f < c.src || e.f >= c.src + c.len) continue;
      const d = c.at + e.f - c.src;
      const pan = rnd() * 0.4;
      switch (e.e) {
        case 'swat': bus.add(toS(d), whoosh(0.18, 500, 3000), 0.22, pan); break;
        case 'damage':
          if (d - lastCrash.f >= 9 && e.amount > 0.6) {
            lastCrash.f = d;
            bus.add(toS(d), crumble(Math.min(1.5, 0.4 + Math.log10(1 + e.amount) * 0.6)), 0.24, pan);
          }
          break;
        case 'pounce': bus.add(toS(d), meow(1.25, 0.28), 0.18, pan); break;
        case 'pounceLand': bus.add(toS(d), thud(1), 0.55); break;
        case 'ultraStart':
          bus.add(toS(d), meow(e.ability === 'flop' ? 0.75 : 1, 0.7), 0.4);
          bus.add(toS(d), e.ability === 'laser' ? zap(1.4) : whoosh(0.5, 300, 5000), 0.3);
          break;
        case 'enemyKilled': bus.add(toS(d), boom(e.boss ? 1.6 : 0.6), e.boss ? 0.7 : 0.35, pan); break;
        case 'bossPhase': bus.add(toS(d), alarm(), 0.2); break;
        case 'landmarkToppled': bus.add(toS(d), boom(1), 0.5); bus.add(toS(d), crumble(1.5), 0.4); break;
        case 'startled': bus.add(toS(d), boing(), 0.3); break;
        case 'bossSpawn': bus.add(toS(d), bark(), 0.4); break;
      }
    }
  }
}

function editSfx(bus, cut) {
  const { clips, frames } = layout(cut);
  const toS = (f) => (f / FPS) * SR;
  for (const c of clips) if (c.fx === 'punch') bus.add(toS(c.at) - 0.12 * SR, whoosh(0.2, 1500, 6000), 0.12, rnd() * 0.5);
  for (const k of cut.cards) {
    if (k.kind === 'slam') {
      bus.add(toS(k.at), boom(1), 0.5);
      bus.add(toS(k.at), CRASH, 0.35);
      bus.add(toS(k.at) + 0.15 * SR, meow(1, 0.6), 0.45);
    }
    if (k.kind === 'end') {
      bus.add(toS(k.at), boom(1.2), 0.55);
      bus.add(toS(k.at), CRASH, 0.4);
      bus.add(toS(k.at + 30), meow(1.05, 0.75), 0.5);
    }
  }
  bus.add(toS(frames) - 1, new Float32Array(1)); // keep length
}

// ------------------------------------------------------------------------------------------- per cut
const ARR = {
  // trailer: 22 bars. 0 hook (intro + riser), 1 slam, 2-5 groove, 6-12 lead, 13-17 boss, 18 frenzy, 19-21 end
  trailer: Object.assign((bar) => (bar === 0 ? 'intro' : bar < 6 ? 'groove' : bar < 13 ? 'lead' : bar < 18 ? 'boss' : bar < 19 ? 'frenzy' : 'end'), { endBar: 19 }),
  // mode: 16.5 bars. 0 intro, 1-4 groove, 5-8 lead, 9-11 boss, 12-14 frenzy, 15-16 end
  mode: Object.assign((bar) => (bar === 0 ? 'intro' : bar < 5 ? 'groove' : bar < 8 ? 'lead' : bar < 12 ? (bar >= 9 && bar < 12 ? 'boss' : 'lead') : bar < 15 ? 'frenzy' : 'end'), { endBar: 15 }),
};
// music drop-outs [from, to) in beats: half a beat of silence before the title slam and before Roomba Prime, so the
// hits land (the sfx keep playing)
const DROPS = { trailer: [[3.5, 4], [59.5, 60]], mode: [[37.5, 38]] };
const RISERS = { trailer: [[0.5, 1], [12, 13], [17, 18]], mode: [[0, 1], [8.5, 9.5], [14, 15]] };

function wav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  let o = 44;
  for (let i = 0; i < n; i++) (buf.writeFloatLE(L[i], o), buf.writeFloatLE(R[i], o + 4), (o += 8));
  fs.writeFileSync(file, buf);
}
function ebur(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary'));
  return { I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1]), TP: Number(/Peak:\s+(-?[\d.inf]+) dBFS/.exec(s)?.[1]) };
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CUTS);
for (const id of want) {
  const cut = CUTS[id];
  const { frames } = layout(cut);
  const n = Math.round((frames / FPS) * SR);
  const mus = new Bus(n);
  const sfx = new Bus(n);
  seed = 777;
  music(mus, frames / BAR, ARR[id]);
  for (const [a, b2] of RISERS[id]) mus.add(a * 4 * SPB, riser((b2 - a) * 4 * (BEAT / FPS)), 0.35);
  for (const [a, b2] of DROPS[id]) {
    const s0 = Math.round(a * SPB);
    const s1 = Math.min(n, Math.round(b2 * SPB));
    const fade = Math.round(0.006 * SR);
    for (let i = s0 - fade; i < s1; i++) {
      if (i < 0) continue;
      const g = i < s0 ? (s0 - i) / fade : i >= s1 - fade ? (i - (s1 - fade)) / fade : 0;
      mus.L[i] *= g;
      mus.R[i] *= g;
    }
  }
  eventSfx(sfx, cut);
  editSfx(sfx, cut);
  // sidechain-ish duck of the music under big sfx, then sum
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let envF = 0;
  for (let i = 0; i < n; i++) {
    const lvl = Math.abs(sfx.L[i]) + Math.abs(sfx.R[i]);
    envF = Math.max(lvl, envF * 0.9997);
    const duck = 1 / (1 + envF * 0.6);
    L[i] = mus.L[i] * 0.8 * duck + sfx.L[i];
    R[i] = mus.R[i] * 0.8 * duck + sfx.R[i];
  }
  const pre = path.join(OUT, `${id}-premix.wav`);
  wav(pre, L, R);
  const outF = path.join(OUT, `${id}.wav`);
  let gain = -14 - ebur(pre).I;
  let res = null;
  for (let pass = 0; pass < 5; pass++) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', pre, '-af', `highpass=f=30,acompressor=threshold=-16dB:ratio=2.5:attack=8:release=150,volume=${gain.toFixed(2)}dB,aresample=${SR * 4},alimiter=limit=${Math.pow(10, -2 / 20).toFixed(4)}:attack=1.5:release=60:level=false,aresample=${SR},afade=t=out:st=${(frames / FPS - 0.6).toFixed(3)}:d=0.6`, '-ar', String(SR), '-c:a', 'pcm_s24le', outF]);
    res = ebur(outF);
    if (Math.abs(res.I + 14) <= 0.3) break;
    gain += -14 - res.I;
  }
  console.log(`${id}: ${(frames / FPS).toFixed(2)} s, ${res.I} LUFS, TP ${res.TP} dBTP -> ${path.relative(process.cwd(), outF)}`);
}
