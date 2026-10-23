// Core gameplay sounds (moved from the POC audio.ts). FROZEN: lanes add new sounds in their own sfx files.
import { audio, env, noise, onAudioInit } from './synth';

export { initAudio } from './synth';

let heliGain: GainNode | null = null;
let laserGain: GainNode | null = null;

export function thud(strength = 1): void {
  const a = audio();
  if (!a) return;
  const ctx = a.ctx;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(70 + 20 * strength, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.35);
  const g = ctx.createGain();
  env(g, 0.5 * strength, 0.005, 0.4);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.5);
  const n = noise(0.3);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const g2 = ctx.createGain();
  env(g2, 0.35 * strength, 0.005, 0.25);
  n.connect(lp).connect(g2).connect(a.sfx);
}

let lastCrash = 0;
export function crash(size = 1): void {
  const a = audio();
  if (!a) return;
  const ctx = a.ctx;
  const t = ctx.currentTime;
  if (t - lastCrash < 0.05) return;
  lastCrash = t;
  const n = noise(0.9);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900 + Math.random() * 500, t);
  bp.frequency.exponentialRampToValueAtTime(180, t + 0.8);
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  env(g, Math.min(0.7, 0.3 * size), 0.005, 0.7 + 0.2 * size);
  n.connect(bp).connect(g).connect(a.sfx);
  // glass tinkles
  for (let i = 0; i < 3 + size * 2; i++) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 2500 + Math.random() * 3000;
    const gg = ctx.createGain();
    const st = t + Math.random() * 0.4;
    gg.gain.setValueAtTime(0.0001, st);
    gg.gain.exponentialRampToValueAtTime(0.05, st + 0.005);
    gg.gain.exponentialRampToValueAtTime(0.0001, st + 0.15);
    o.connect(gg).connect(a.sfx);
    o.start(st);
    o.stop(st + 0.2);
  }
}

export function whoosh(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  const n = noise(0.25);
  const bp = a.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(2200, t + 0.2);
  bp.Q.value = 2;
  const g = a.ctx.createGain();
  env(g, 0.25, 0.04, 0.18);
  n.connect(bp).connect(g).connect(a.sfx);
}

/** pitch multiplies the base frequency (cats lane: chonk ~0.7, siamese ~1.3). */
export function meow(kind: 'short' | 'ultra' | 'sad' = 'short', pitch = 1): void {
  const a = audio();
  if (!a) return;
  const ctx = a.ctx;
  const t = ctx.currentTime;
  const dur = kind === 'ultra' ? 1.3 : kind === 'sad' ? 1.1 : 0.6;
  const base = (kind === 'ultra' ? 240 : kind === 'sad' ? 300 : 420) * pitch;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(base, t);
  o.frequency.linearRampToValueAtTime(base * 1.8, t + dur * 0.3);
  o.frequency.linearRampToValueAtTime(base * (kind === 'sad' ? 0.8 : 1.1), t + dur);
  const vib = ctx.createOscillator();
  vib.frequency.value = 7;
  const vg = ctx.createGain();
  vg.gain.value = base * 0.03;
  vib.connect(vg).connect(o.frequency);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 4;
  f1.frequency.setValueAtTime(700, t);
  f1.frequency.linearRampToValueAtTime(1900, t + dur * 0.35);
  f1.frequency.linearRampToValueAtTime(900, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === 'ultra' ? 0.9 : 0.6, t + 0.06);
  g.gain.setValueAtTime(kind === 'ultra' ? 0.9 : 0.6, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f1).connect(g).connect(a.sfx);
  if (kind === 'ultra') {
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    ws.curve = curve;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    f1.connect(ws).connect(g2).connect(a.sfx);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
  vib.start(t);
  vib.stop(t + dur + 0.05);
}

export function hiss(): void {
  const a = audio();
  if (!a) return;
  const n = noise(0.6);
  const hp = a.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = a.ctx.createGain();
  env(g, 0.3, 0.03, 0.55);
  n.connect(hp).connect(g).connect(a.sfx);
}

export function nom(): void {
  const a = audio();
  if (!a) return;
  for (let i = 0; i < 3; i++) {
    const t = a.ctx.currentTime + i * 0.11;
    const o = a.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(300 + i * 80, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(a.sfx);
    o.start(t);
    o.stop(t + 0.1);
  }
}

export function scream(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  const o = a.ctx.createOscillator();
  o.type = 'triangle';
  const f = 700 + Math.random() * 500;
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 1.3, t + 0.15);
  o.frequency.linearRampToValueAtTime(f * 0.9, t + 0.5);
  const g = a.ctx.createGain();
  env(g, 0.04, 0.03, 0.45);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.55);
}

export function boom(): void {
  if (!audio()) return;
  thud(1.6);
  crash(2);
}

onAudioInit((a) => {
  // helicopter chop loop
  const c = a.ctx;
  const src = c.createBufferSource();
  src.buffer = a.noiseBuf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const chop = c.createGain();
  chop.gain.value = 0.5;
  const lfo = c.createOscillator();
  lfo.frequency.value = 13;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.5;
  lfo.connect(lfoG).connect(chop.gain);
  heliGain = c.createGain();
  heliGain.gain.value = 0;
  src.connect(lp).connect(chop).connect(heliGain).connect(a.sfx);
  src.start();
  lfo.start();
});

onAudioInit((a) => {
  // laser hum loop
  const c = a.ctx;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 110;
  const o2 = c.createOscillator();
  o2.type = 'square';
  o2.frequency.value = 221;
  const vib = c.createOscillator();
  vib.frequency.value = 9;
  const vg = c.createGain();
  vg.gain.value = 18;
  vib.connect(vg).connect(o.frequency);
  vg.connect(o2.frequency);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  laserGain = c.createGain();
  laserGain.gain.value = 0;
  o.connect(lp);
  o2.connect(lp);
  lp.connect(laserGain).connect(a.sfx);
  o.start();
  o2.start();
  vib.start();
});

export function setHeli(level: number): void {
  const a = audio();
  if (heliGain && a) heliGain.gain.setTargetAtTime(Math.min(0.35, level), a.ctx.currentTime, 0.1);
}

export function setLaser(on: boolean): void {
  const a = audio();
  if (laserGain && a) laserGain.gain.setTargetAtTime(on ? 0.22 : 0, a.ctx.currentTime, 0.05);
}
