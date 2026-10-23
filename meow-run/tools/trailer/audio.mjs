#!/usr/bin/env node
// Meow Run trailer soundtrack, rendered offline in node (no browser, no asset files; DSP kit from ultra-cat's trailer).
//   node tools/trailer/audio.mjs [trailer|mode ...]   -> build/audio/<cut>.wav (48 kHz stereo, about -14 LUFS, TP <= -1 dBTP)
// Music: 144 BPM in F major (kick, clap, shaker, bouncy bass, bright stabs, marimba lead, glockenspiel), arranged per
// cut from the section plan in edl.mjs (groove, lead, chase, cozy, end).
// SFX: placed on the game events logged during capture (build/footage/<shot>-<aspect>.json), mapped through the EDL,
// plus edit hits (title slam, cut whooshes, end-card meow).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BEAT, CUTS, FPS, layout } from './edl.mjs';
import { BUILD, FOOTAGE } from './lib.mjs';

const SR = 48000;
const OUT = path.join(BUILD, 'audio');
fs.mkdirSync(OUT, { recursive: true });
const SPB = (BEAT / FPS) * SR; // samples per beat (25 frames = 0.4167 s at 144 BPM)

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
const KICK = (() => {
  let ph = 0;
  return make(0.36, (i, t) => {
    const f = 52 + 120 * Math.exp(-t * 30);
    ph += (2 * Math.PI * f) / SR;
    return Math.tanh(1.5 * Math.sin(ph) * Math.exp(-t * 9)) + (i < 120 ? rnd() * 0.2 * (1 - i / 120) : 0);
  });
})();
const CLAP = (() => {
  const n = biquad(noise(0.25), 'bp', 1600, 0.9);
  return make(0.25, (i, t) => n[i] * (t < 0.025 ? 0.6 + 0.4 * Math.exp(-((t * 1000) % 8) / 2.5) : Math.exp(-(t - 0.025) * 26)) * 1.3);
})();
const SHAKER = (() => { const n = biquad(noise(0.07), 'hp', 6000, 0.7); return make(0.07, (i, t) => n[i] * Math.min(1, t * 400) * Math.exp(-t * 55)); })();
const TOM = (() => {
  let ph = 0;
  return make(0.3, (i, t) => {
    ph += (2 * Math.PI * (110 + 80 * Math.exp(-t * 20))) / SR;
    return Math.sin(ph) * Math.exp(-t * 10);
  });
})();
const CRASH = (() => { const n = biquad(noise(1.8), 'hp', 4000, 0.5); return make(1.8, (i, t) => n[i] * Math.exp(-t * 2.6)); })();
/** plucky saw bass */
function bass(f, dur = 0.2, cut = 900) {
  let p1 = 0;
  const raw = make(dur, (i, t) => {
    p1 = (p1 + f / SR) % 1;
    return (2 * p1 - 1) * Math.min(1, t * 400) * Math.exp(-t * 7);
  });
  return biquad(raw, 'lp', cut, 1.6, 200);
}
/** bright detuned saw stab */
function stab(f, dur = 0.22, d = 9) {
  let p1 = 0, p2 = 0;
  const raw = make(dur, (i, t) => {
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * 1.008) / SR) % 1;
    return ((2 * p1 - 1) + (2 * p2 - 1)) * 0.5 * Math.min(1, t * 300) * Math.exp(-t * d);
  });
  return biquad(raw, 'lp', 3400, 0.8, 1200);
}
/** soft pad (cozy section, end card) */
function pad(f, dur) {
  let p1 = 0, p2 = 0, p3 = 0;
  const raw = make(dur, (i, t) => {
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * 1.005) / SR) % 1;
    p3 = (p3 + (f * 0.995) / SR) % 1;
    const e = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.4);
    return ((2 * p1 - 1) + (2 * p2 - 1) + (2 * p3 - 1)) * 0.33 * e;
  });
  return biquad(raw, 'lp', 1500, 0.7);
}
/** marimba: sine + 4th partial, quick decay */
function marimba(f, dur = 0.35) {
  return make(dur, (i, t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 40)) * Math.min(1, t * 800) * Math.exp(-t * 11));
}
/** glockenspiel: bright bell partials */
function glock(f, dur = 0.9) {
  return make(dur, (i, t) => (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 12)) * Math.min(1, t * 1500) * Math.exp(-t * 4.5) * 0.7);
}
function meow(pitch = 1, dur = 0.5) {
  let p = 0;
  const src = make(dur, (i, t) => {
    const x = t / dur;
    const f = pitch * (560 + 320 * Math.sin(Math.PI * Math.min(1, x * 1.6)) - 180 * x);
    p = (p + f / SR) % 1;
    return 2 * p - 1;
  });
  const f1 = biquad(src, 'bp', 480, 4, 950);
  const f2 = biquad(src, 'bp', 2700, 6, 1300);
  return make(dur, (i, t) => {
    const x = t / dur;
    return (f1[i] * 1.2 + f2[i] * 0.8) * Math.min(1, x * 12) * Math.pow(1 - x, 0.8) * 1.6;
  });
}
function whoosh(dur = 0.22, from = 600, to = 3500) {
  const n = biquad(noise(dur), 'bp', from, 1.4, to);
  return make(dur, (i, t) => n[i] * Math.sin(Math.PI * (t / dur)) * 1.8);
}
function boing(f0 = 260, dur = 0.32) {
  let p = 0;
  return make(dur, (i, t) => {
    p += (2 * Math.PI * (f0 + f0 * 1.2 * (t / dur) + 40 * Math.sin(t * 60) * Math.exp(-t * 8))) / SR;
    return Math.sin(p) * Math.min(1, t * 600) * Math.exp(-t * 9) * 0.9;
  });
}
function spring() {
  // the tail vault: a wobbly rising twang
  let p = 0;
  return make(0.7, (i, t) => {
    p += (2 * Math.PI * (180 + 520 * t + 70 * Math.sin(t * 45) * Math.exp(-t * 3))) / SR;
    return Math.sin(p) * Math.min(1, t * 300) * Math.exp(-t * 3.2) * 0.8;
  });
}
function pat(size = 1) {
  let ph = 0;
  const n = biquad(noise(0.2), 'lp', 1200);
  return make(0.2, (i, t) => {
    ph += (2 * Math.PI * (90 + 80 * Math.exp(-t * 30))) / SR;
    return (Math.sin(ph) * Math.exp(-t * 18) + n[i] * Math.exp(-t * 30) * 0.6) * size;
  });
}
function swish() {
  const n = biquad(noise(0.45), 'bp', 2500, 0.8, 900);
  return make(0.45, (i, t) => n[i] * Math.min(1, t * 30) * Math.exp(-t * 6) * 1.4);
}
function puff() {
  const n = biquad(noise(0.6), 'lp', 1400, 0.7, 300);
  return make(0.6, (i, t) => n[i] * Math.min(1, t * 60) * Math.exp(-t * 5) * 2.2);
}
function splash() {
  const n = biquad(noise(0.7), 'bp', 1800, 0.6, 600);
  let g = 0;
  return make(0.7, (i, t) => {
    if (i % 700 === 0) g = 0.5 + 0.5 * Math.abs(rnd());
    return n[i] * g * Math.min(1, t * 50) * Math.exp(-t * 4) * 1.5;
  });
}
function scratch() {
  const n = biquad(noise(0.5), 'bp', 3200, 2.5);
  return make(0.5, (i, t) => n[i] * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 22)) * Math.exp(-t * 4) * 1.6);
}
function blip(f) {
  return make(0.12, (i, t) => Math.sin(2 * Math.PI * f * t * (1 + t * 3)) * Math.min(1, t * 2000) * Math.exp(-t * 30) * 0.7);
}
function bark(pitch = 1) {
  const n = biquad(noise(0.22), 'bp', 650 * pitch, 2);
  let p = 0;
  return make(0.22, (i, t) => {
    p = (p + (pitch * (340 - 420 * t)) / SR) % 1;
    return ((2 * p - 1) * 0.7 + n[i]) * Math.min(1, t * 300) * Math.exp(-t * 15) * 1.3;
  });
}
function rumble(dur = 1.6) {
  const n = biquad(noise(dur), 'lp', 220, 0.9);
  return make(dur, (i, t) => n[i] * Math.min(1, t * 3) * Math.min(1, (dur - t) * 3) * 3 * (0.8 + 0.2 * Math.sin(t * 30)));
}
function riser(dur) {
  const n = biquad(noise(dur), 'bp', 400, 2, 7000);
  return make(dur, (i, t) => n[i] * Math.pow(t / dur, 2) * 1.5);
}
function boom(size = 1) {
  const n = biquad(noise(1.2), 'lp', 700, 0.7, 120);
  let ph = 0;
  return make(1.2, (i, t) => {
    ph += (2 * Math.PI * (40 + 70 * Math.exp(-t * 7))) / SR;
    return (n[i] * 1.8 * Math.exp(-t * 3.2) + Math.sin(ph) * Math.exp(-t * 3.8)) * size;
  });
}

// ------------------------------------------------------------------------------------------- music
// F major, one chord a bar: F C Dm Bb (I V vi IV); the chase sections go Dm Bb C A (minor, driving)
const PROG = { major: [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]], chase: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]] };
const ROOT = { major: [41, 36, 38, 34], chase: [38, 34, 36, 33] };
// marimba hook over two bars (8ths, 0 = rest)
const LEAD = [77, 0, 76, 77, 79, 0, 77, 72, 74, 0, 72, 74, 76, 72, 69, 0];
const GLOCK = [84, 0, 0, 81, 0, 0, 79, 0, 81, 0, 0, 84, 0, 0, 86, 0];

/** sections: [[fromBeat, name], ...] with names intro, groove, lead, chase, cozy, end, silent */
function music(bus, beats, sections, endBeat) {
  const at = (beat) => beat * SPB;
  const secAt = (b) => {
    let s = 'groove';
    for (const [from, name] of sections) if (b >= from) s = name;
    return s;
  };
  for (let beat = 0; beat < beats; beat++) {
    const sec = secAt(beat);
    if (sec === 'silent') continue;
    const bar = Math.floor(beat / 4);
    const bb = beat % 4;
    const key = sec === 'chase' ? 'chase' : 'major';
    const ch = PROG[key][bar % 4];
    const root = ROOT[key][bar % 4];
    if (sec === 'end') {
      if (beat === endBeat) {
        bus.add(at(beat), KICK, 1);
        for (const n of [53, 57, 60, 65]) bus.add(at(beat), pad(mtof(n), 4.2), 0.16, (n % 3) * 0.3 - 0.3);
        bus.add(at(beat), bass(mtof(29), 1.6, 500), 0.5);
      }
      // a glockenspiel tag over the end card
      const k = beat - endBeat;
      if (k >= 1 && k < 9) {
        for (let e = 0; e < 2; e++) {
          const n = [77, 81, 84, 81, 89, 84, 81, 77, 72, 77, 81, 0, 84, 0, 89, 0][(k - 1) * 2 + e];
          if (n) bus.add(at(beat + e / 2), glock(mtof(n)), 0.12, 0.2);
        }
      }
      continue;
    }
    if (sec === 'cozy') {
      if (bb === 0) for (const n of ch) bus.add(at(beat), pad(mtof(n + 12), 4 * (BEAT / FPS) + 0.3), 0.13, (n % 3) * 0.3 - 0.3);
      if (bb === 0) bus.add(at(beat), bass(mtof(root), 1.2, 400), 0.35);
      for (let e = 0; e < 2; e++) {
        const n = GLOCK[((bar % 2) * 8 + bb * 2 + e) % 16];
        if (n) bus.add(at(beat + e / 2), glock(mtof(n - 12)), 0.1, -0.2);
      }
      continue;
    }
    const intro = sec === 'intro';
    const chase = sec === 'chase';
    bus.add(at(beat), KICK, intro ? 0.75 : 0.9);
    if (!intro && (bb === 1 || bb === 3)) bus.add(at(beat), CLAP, 0.38, 0.05);
    for (let s = 0; s < 4; s++) if (!intro || s % 2 === 0) bus.add(at(beat + s / 4), SHAKER, s % 2 ? 0.07 : 0.12, 0.35);
    if (chase) {
      bus.add(at(beat + 0.5), KICK, 0.45);
      if (bb === 3) for (let s = 0; s < 4; s++) bus.add(at(beat + s / 4), TOM, 0.18 + s * 0.05, -0.2 + s * 0.15);
    }
    // bass: bouncy 8ths, root / octave
    for (let e = 0; e < 2; e++) {
      const n = root + (e === 1 ? 12 : 0) + (chase && e === 1 && bb % 2 ? 7 : 0);
      bus.add(at(beat + e / 2), bass(mtof(n), 0.19, intro ? 500 : chase ? 1300 : 950), intro ? 0.3 : 0.4);
    }
    // stabs on the offbeats
    if (!intro) for (const n of ch) bus.add(at(beat + 0.5), stab(mtof(n + 12), 0.18), chase ? 0.07 : 0.06, (n % 3) * 0.3 - 0.3);
    // lead
    if (sec === 'lead' || chase) {
      for (let e = 0; e < 2; e++) {
        let n = LEAD[((bar % 2) * 8 + bb * 2 + e) % 16];
        if (!n) continue;
        if (chase) n = [74, 0, 72, 74, 76, 0, 74, 69][(bb * 2 + e) % 8] || 0;
        if (n) bus.add(at(beat + e / 2), marimba(mtof(n)), 0.2, 0.15);
      }
    }
    if (sec === 'lead' && bb === 0 && bar % 2 === 1) bus.add(at(beat), glock(mtof(84)), 0.08, -0.3);
  }
}

// ------------------------------------------------------------------------------------------- events -> sfx
function eventSfx(bus, cut) {
  const { clips } = layout(cut);
  const toS = (f) => (f / FPS) * SR;
  for (const c of clips) {
    if (c.fx === 'end') continue;
    const file = path.join(FOOTAGE, `${c.shot}-${cut.aspect}.json`);
    if (!fs.existsSync(file)) continue;
    const { log } = JSON.parse(fs.readFileSync(file, 'utf8'));
    let mult = 1;
    let lastFish = -99;
    for (const e of log) {
      if (e.e === 'mult') mult = e.value;
      if (e.f < c.src || e.f >= c.src + c.len) continue;
      const d = c.at + e.f - c.src;
      const pan = rnd() * 0.35;
      switch (e.e) {
        case 'jump': bus.add(toS(d), boing(240, 0.26), 0.22, pan); break;
        case 'pounce': bus.add(toS(d), whoosh(0.3, 500, 4500), 0.3, pan); bus.add(toS(d), meow(1.35, 0.25), 0.16, pan); break;
        case 'land': if (e.impact > 6) bus.add(toS(d), pat(Math.min(1.2, e.impact / 14)), 0.4); break;
        case 'slide': if (e.on) bus.add(toS(d), swish(), 0.28, pan); break;
        case 'abilityStart':
          if (e.id === 'vault') { bus.add(toS(d), spring(), 0.35); bus.add(toS(d) + 0.1 * SR, meow(1.1, 0.45), 0.3); }
          else if (e.id === 'cloud') { bus.add(toS(d), puff(), 0.5); bus.add(toS(d) + 0.08 * SR, meow(1.2, 0.4), 0.28); }
          break;
        case 'pickup':
          if (e.kind === 'fish' && d - lastFish >= 3) {
            lastFish = d;
            bus.add(toS(d), blip(880 * Math.pow(2, Math.min(24, mult) / 24)), 0.16, pan);
          } else if (e.kind !== 'fish' && e.kind !== 'bell') bus.add(toS(d), glock(mtof(91)), 0.1, pan);
          break;
        case 'bell': bus.add(toS(d), glock(mtof(88)), 0.32); bus.add(toS(d) + 0.09 * SR, glock(mtof(93)), 0.28); break;
        case 'nearMiss': bus.add(toS(d), whoosh(0.25, 800, 5000), 0.2, pan); break;
        case 'hit': bus.add(toS(d), pat(1.4), 0.5); bus.add(toS(d), meow(0.8, 0.4), 0.3); break;
        case 'surface':
          if (e.kind === 'wall') bus.add(toS(d), scratch(), 0.3);
          else if (e.kind === 'river') bus.add(toS(d), splash(), 0.35);
          break;
        case 'chase':
          if (e.on && e.kind === 'dog') { bus.add(toS(d), bark(1), 0.42, -0.3); bus.add(toS(d) + 0.24 * SR, bark(1.08), 0.38, -0.3); }
          if (e.on && e.kind !== 'dog') bus.add(toS(d), rumble(2.2), 0.5);
          break;
        case 'callout':
          if (/WOOF/.test(e.text) && !log.some((x) => x.e === 'chase' && x.f === e.f)) bus.add(toS(d), bark(1.05), 0.38, -0.3);
          break;
      }
    }
  }
}

function editSfx(bus, cut) {
  const { clips, frames } = layout(cut);
  const toS = (f) => (f / FPS) * SR;
  for (const c of clips) if (c.fx === 'punch') bus.add(toS(c.at) - 0.12 * SR, whoosh(0.2, 1500, 6000), 0.1, rnd() * 0.5);
  for (const k of cut.cards) {
    if (k.kind === 'slam') {
      bus.add(toS(k.at), boom(1), 0.45);
      bus.add(toS(k.at), CRASH, 0.3);
      bus.add(toS(k.at) + 0.12 * SR, meow(1, 0.55), 0.45);
    }
    if (k.kind === 'end') {
      bus.add(toS(k.at), boom(1.1), 0.5);
      bus.add(toS(k.at), CRASH, 0.35);
      bus.add(toS(k.at + 30), meow(1.05, 0.7), 0.5);
    }
  }
  for (const [f, what] of cut.hits ?? []) if (what === 'meow') bus.add(toS(f), meow(1.15, 0.6), 0.4);
  bus.add(toS(frames) - 1, new Float32Array(1)); // keep length
}

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
  const beats = Math.ceil(frames / BEAT);
  const endBeat = cut.music.find(([, s]) => s === 'end')?.[0] ?? beats;
  music(mus, beats, cut.music, endBeat);
  for (const [a, b2] of cut.risers ?? []) mus.add(a * SPB, riser((b2 - a) * (BEAT / FPS)), 0.32);
  for (const [a, b2] of cut.drops ?? []) {
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
    const duck = 1 / (1 + envF * 0.5);
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
