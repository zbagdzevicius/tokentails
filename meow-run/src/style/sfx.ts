// STYLE lane sounds, all procedural (synth.ts tone/noise/env on the sfx bus): the slow-mo whoosh, the finish sting,
// trick landings, tier-ups, the bank and the broken combo. Each is short and quiet next to the audio lane's mix; the
// fanfare at the finish still comes from the audio lane.
import { audio, env, noise, tone } from '../audio/synth';

function filteredNoise(dur: number, f0: number, f1: number, q: number, peak: number, at?: number): void {
  const A = audio();
  if (!A) return;
  const c = A.ctx;
  const t = at ?? c.currentTime;
  const src = noise(dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = c.createGain();
  env(g, peak, 0.03, dur, t);
  src.connect(bp).connect(g).connect(A.sfx);
}

/** near-miss slow motion: air rushing past, then time dropping */
export function whoosh(): void {
  filteredNoise(0.5, 2600, 260, 1.4, 0.5);
  tone('sine', 240, 0.42, 0.14, { to: 70 });
}

/** a trick landed: a bright blip that climbs with the trick level (1 spin .. 3 triple) */
export function trickSound(level: number): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime;
  const base = 620 * Math.pow(1.19, Math.max(0, level - 1));
  tone('triangle', base, 0.09, 0.16, { to: base * 1.5, at: t });
  tone('triangle', base * 1.5, 0.12, 0.12, { at: t + 0.07 });
  if (level >= 3) tone('square', base * 2, 0.14, 0.05, { at: t + 0.13 });
}

/** SLOPPY! a wobbly bwomp */
export function sloppySound(): void {
  tone('sawtooth', 300, 0.22, 0.07, { to: 180 });
}

/** a new combo tier: a chord stab that rises with the tier */
export function tierSound(tier: number): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime;
  const root = 392 * Math.pow(1.122, Math.max(0, tier - 1));
  tone('square', root, 0.16, 0.06, { at: t });
  tone('triangle', root * 1.26, 0.2, 0.12, { at: t + 0.01 });
  tone('triangle', root * 1.5, 0.26, 0.12, { at: t + 0.06 });
  filteredNoise(0.18, 6000, 9000, 2, 0.12, t);
}

/** chain banked: a coin cascade */
export function bankSound(n: number): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime;
  const steps = Math.min(5, 2 + Math.floor(n / 15));
  for (let i = 0; i < steps; i++) tone('square', 988 * Math.pow(1.122, i), 0.07, 0.045, { at: t + i * 0.055 });
}

/** COMBO BROKEN */
export function brokenSound(): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime;
  tone('square', 330, 0.12, 0.06, { to: 220, at: t });
  tone('square', 247, 0.2, 0.06, { to: 120, at: t + 0.1 });
}

/** the finish: a short rank sting (S sparkles more) */
export function stingSound(rank: string): void {
  const A = audio();
  if (!A) return;
  const t = A.ctx.currentTime + 0.05;
  const notes = rank === 'S' ? [784, 988, 1175, 1568] : rank === 'A' ? [659, 831, 988, 1319] : [523, 659, 784];
  for (let i = 0; i < notes.length; i++) tone('triangle', notes[i], 0.16, 0.11, { at: t + i * 0.075 });
  tone('square', notes[notes.length - 1] / 2, 0.4, 0.04, { at: t + notes.length * 0.075 });
  if (rank === 'S' || rank === 'A') filteredNoise(0.4, 7000, 11000, 1.5, 0.1, t + notes.length * 0.075);
}

/** the landing shockwave thump */
export function slamSound(): void {
  tone('sine', 140, 0.22, 0.25, { to: 50 });
  filteredNoise(0.18, 900, 200, 0.8, 0.25);
}
