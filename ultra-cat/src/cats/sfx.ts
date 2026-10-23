// ULTRA sound effects for the cat roster, built from the synth primitives (no audio files). Owned by the CATS lane.
import { audio, env, noise, tone } from '../audio/synth';

let shaper: Float32Array | null = null;
function drive(): Float32Array {
  if (shaper) return shaper;
  shaper = new Float32Array(256);
  for (let i = 0; i < 256; i++) shaper[i] = Math.tanh((i / 128 - 1) * 5);
  return shaper;
}

/** Big Biscuit: a wet belly-flop SPLAT. strength 1 = a normal landing. */
export function splat(strength = 1): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  const t = c.currentTime;
  // deep body thump
  tone('sine', 110, 0.6, 0.7 * strength, { to: 28 });
  tone('triangle', 70, 0.45, 0.35 * strength, { to: 30, at: t + 0.01 });
  // the slap: bright noise burst, fast decay
  const n = noise(0.35);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1800, t);
  bp.frequency.exponentialRampToValueAtTime(300, t + 0.3);
  bp.Q.value = 1.2;
  const g = c.createGain();
  env(g, 0.5 * strength, 0.003, 0.28);
  n.connect(bp).connect(g).connect(a.sfx);
  // the jiggle: a wobbly low "blub-blub" of belly settling
  for (let i = 0; i < 3; i++) tone('sine', 180 - i * 30, 0.12, 0.18 * strength, { to: 90, at: t + 0.12 + i * 0.09 });
}

/** Big Biscuit takes off: a cartoon spring "boing". */
export function boing(): void {
  if (!audio()) return;
  tone('square', 160, 0.25, 0.08, { to: 520 });
  tone('sine', 220, 0.3, 0.14, { to: 660 });
}

/** Midnight: a sharp shadow whoosh with a dark, descending tail. */
export function shadowWhoosh(): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  const t = c.currentTime;
  const n = noise(0.4);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(4500, t);
  bp.frequency.exponentialRampToValueAtTime(260, t + 0.32);
  bp.Q.value = 3;
  const g = c.createGain();
  env(g, 0.45, 0.01, 0.32);
  n.connect(bp).connect(g).connect(a.sfx);
  tone('sawtooth', 900, 0.22, 0.05, { to: 90 });
  tone('sine', 60, 0.3, 0.25, { to: 35, at: t + 0.04 });
}

/** Midnight's ULTRA opening: a low phasey shimmer. */
export function shadowRise(): void {
  if (!audio()) return;
  tone('sine', 55, 0.9, 0.25, { to: 110, attack: 0.15 });
  tone('triangle', 880, 0.6, 0.04, { to: 220, attack: 0.05 });
}

/** Duchess: one SONIC YOWL wave, a distorted, wobbling Siamese wail. `pitch` follows the cat voice. */
export function yowl(pitch = 1.3, n = 0): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  const t = c.currentTime;
  const dur = 0.42;
  const base = 330 * pitch * (n % 2 ? 1.12 : 1);
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(base, t);
  o.frequency.linearRampToValueAtTime(base * 1.6, t + dur * 0.35);
  o.frequency.linearRampToValueAtTime(base * 1.15, t + dur);
  const vib = c.createOscillator();
  vib.frequency.value = 11;
  const vg = c.createGain();
  vg.gain.value = base * 0.06;
  vib.connect(vg).connect(o.frequency);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(2400, t + dur * 0.4);
  f.frequency.linearRampToValueAtTime(1100, t + dur);
  const ws = c.createWaveShaper();
  ws.curve = drive() as Float32Array<ArrayBuffer>;
  const g = c.createGain();
  env(g, 0.32, 0.03, dur);
  o.connect(f).connect(ws).connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + dur + 0.08);
  vib.start(t);
  vib.stop(t + dur + 0.08);
  // the shockwave thump under the voice
  tone('sine', 90, 0.25, 0.3, { to: 40 });
}

/** Siamese / small passive: a quick chirp. */
export function chirp(pitch = 1): void {
  if (!audio()) return;
  tone('triangle', 900 * pitch, 0.08, 0.06, { to: 1400 * pitch });
}
