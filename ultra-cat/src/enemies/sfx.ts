// Enemy sounds, all synthesised from src/audio/synth.ts (no files). Owned by the ENEMIES lane.
// Loops (siren, hose, vacuum whine) start on the first user gesture and are driven by set*(level) every frame.
import { audio, env, noise, onAudioInit, tone } from '../audio/synth';

let sirenGain: GainNode | null = null;
let hoseGain: GainNode | null = null;
let vacGain: GainNode | null = null;
let vacOsc: OscillatorNode | null = null;
let vacOsc2: OscillatorNode | null = null;
const lvl = { siren: 0, hose: 0, vac: 0, vacPitch: 1 };

onAudioInit((a) => {
  const c = a.ctx;
  // fire-truck siren: a hi-lo two-tone wail (square through a bandpass so it sounds tinny and far away)
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = 700;
  const lfo = c.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 1.6;
  const lg = c.createGain();
  lg.gain.value = 140;
  lfo.connect(lg).connect(o.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 1.2;
  sirenGain = c.createGain();
  sirenGain.gain.value = 0;
  o.connect(bp).connect(sirenGain).connect(a.sfx);
  o.start();
  lfo.start();
});

onAudioInit((a) => {
  // hose: hissing band-passed noise
  const c = a.ctx;
  const src = c.createBufferSource();
  src.buffer = a.noiseBuf;
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  hoseGain = c.createGain();
  hoseGain.gain.value = 0;
  src.connect(bp).connect(hoseGain).connect(a.sfx);
  src.start();
});

onAudioInit((a) => {
  // vacuum whine: two detuned saws over a breathy noise bed, pitch follows the closest / biggest vacuum
  const c = a.ctx;
  vacOsc = c.createOscillator();
  vacOsc.type = 'sawtooth';
  vacOsc.frequency.value = 520;
  vacOsc2 = c.createOscillator();
  vacOsc2.type = 'sawtooth';
  vacOsc2.frequency.value = 527;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const og = c.createGain();
  og.gain.value = 0.25;
  const src = c.createBufferSource();
  src.buffer = a.noiseBuf;
  src.loop = true;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  vacGain = c.createGain();
  vacGain.gain.value = 0;
  vacOsc.connect(lp);
  vacOsc2.connect(lp);
  lp.connect(og).connect(vacGain);
  src.connect(hp).connect(vacGain);
  vacGain.connect(a.sfx);
  vacOsc.start();
  vacOsc2.start();
  src.start();
});

function setLoop(g: GainNode | null, v: number, cap: number, key: 'siren' | 'hose' | 'vac'): void {
  const a = audio();
  const val = Math.max(0, Math.min(cap, v));
  if (!g || !a || Math.abs(val - lvl[key]) < 0.004) return;
  lvl[key] = val;
  g.gain.setTargetAtTime(val, a.ctx.currentTime, 0.12);
}

/** 0..1, call every frame (0 when no truck is near or the game is not playing). */
export const setSiren = (v: number) => setLoop(sirenGain, v * 0.07, 0.07, 'siren');
export const setHose = (v: number) => setLoop(hoseGain, v * 0.12, 0.12, 'hose');
/** level 0..1; pitch 1 = a small vacuum, ~0.45 = Roomba Prime. */
export function setVacuum(v: number, pitch = 1): void {
  setLoop(vacGain, v * 0.09, 0.09, 'vac');
  const a = audio();
  if (!a || !vacOsc || !vacOsc2 || Math.abs(pitch - lvl.vacPitch) < 0.01) return;
  lvl.vacPitch = pitch;
  vacOsc.frequency.setTargetAtTime(520 * pitch, a.ctx.currentTime, 0.2);
  vacOsc2.frequency.setTargetAtTime(527 * pitch, a.ctx.currentTime, 0.2);
}
/** Silence every loop (level end, pause, quit). */
export function silenceLoops(): void {
  setSiren(0);
  setHose(0);
  setVacuum(0);
}

/** Cucumber launch: a rubbery thwip. */
export function thwip(): void {
  const a = audio();
  if (!a) return;
  tone('square', 180, 0.12, 0.12, { to: 900 });
  const n = noise(0.12);
  const bp = a.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(600, a.ctx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(3000, a.ctx.currentTime + 0.1);
  const g = a.ctx.createGain();
  env(g, 0.18, 0.005, 0.1);
  n.connect(bp).connect(g).connect(a.sfx);
}

/** Falling whistle for incoming bombs / lobs. */
export function whistle(dur = 1.1): void {
  if (!audio()) return;
  tone('sine', 1900, dur, 0.05, { to: 700, attack: 0.1 });
}

/** Cartoon boing (swatted back, bouncing balls). */
export function boing(pitch = 1): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(220 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.35);
  const vib = c.createOscillator();
  vib.frequency.value = 22;
  const vg = c.createGain();
  vg.gain.value = 40 * pitch;
  vib.connect(vg).connect(o.frequency);
  const g = c.createGain();
  env(g, 0.22, 0.005, 0.38);
  o.connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + 0.45);
  vib.start(t);
  vib.stop(t + 0.45);
}

/** Wet splat (cucumber / water bomb lands). */
export function splat(size = 1): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  const n = noise(0.3);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, c.currentTime);
  lp.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.25);
  const g = c.createGain();
  env(g, Math.min(0.5, 0.25 * size), 0.003, 0.25);
  n.connect(lp).connect(g).connect(a.sfx);
  tone('sine', 140, 0.15, 0.2 * size, { to: 60 });
}

/** Metal clank (boss hit, shield). */
export function clank(pitch = 1): void {
  if (!audio()) return;
  for (const f of [1200, 1730, 2650]) tone('triangle', f * pitch * (0.97 + Math.random() * 0.06), 0.25, 0.06);
  tone('square', 160 * pitch, 0.08, 0.1, { to: 90 });
}

/** Robo bark: two distorted "ARF"s. */
export function bark(): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  for (let i = 0; i < 2; i++) {
    const t = c.currentTime + i * 0.18;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.14);
    const ring = c.createOscillator(); // ring-mod buzz makes it robotic
    ring.type = 'square';
    ring.frequency.value = 70;
    const rg = c.createGain();
    rg.gain.value = 0;
    ring.connect(rg.gain);
    const g = c.createGain();
    env(g, 0.5, 0.01, 0.16, t);
    o.connect(bp).connect(rg).connect(g).connect(a.sfx);
    o.start(t);
    o.stop(t + 0.22);
    ring.start(t);
    ring.stop(t + 0.22);
  }
}

/** Growl / rev before a charge. */
export function growl(dur = 0.7): void {
  if (!audio()) return;
  tone('sawtooth', 70, dur, 0.18, { to: 120, attack: 0.08 });
  tone('square', 52, dur, 0.08, { to: 80, attack: 0.08 });
}

/** Boss alarm klaxon: three two-tone blasts. */
export function alarm(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone('square', 520, 0.22, 0.1, { at: t + i * 0.5 });
    tone('square', 390, 0.22, 0.1, { at: t + i * 0.5 + 0.25 });
  }
}

/** Robot power-down: a long sagging whine. */
export function powerDown(): void {
  const a = audio();
  if (!a) return;
  tone('sawtooth', 900, 1.6, 0.16, { to: 40 });
  tone('square', 450, 1.4, 0.06, { to: 30 });
}

/** Small vacuum unplugged: a bloop down. */
export function unplug(): void {
  if (!audio()) return;
  tone('square', 1200, 0.35, 0.08, { to: 120 });
  tone('sine', 300, 0.2, 0.15, { to: 80 });
}

/** Jet fly-by roar. */
export function jetRoar(): void {
  const a = audio();
  if (!a) return;
  const c = a.ctx;
  const n = noise(1.6);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(400, c.currentTime);
  bp.frequency.exponentialRampToValueAtTime(2200, c.currentTime + 0.8);
  bp.frequency.exponentialRampToValueAtTime(300, c.currentTime + 1.6);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.6);
  n.connect(bp).connect(g).connect(a.sfx);
}

/** Spin attack whirr. */
export function whirr(dur = 3): void {
  if (!audio()) return;
  tone('sawtooth', 200, dur, 0.08, { to: 900, attack: 0.3 });
}

/** Truck honk: a sad two-note horn when flipped. */
export function honk(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  tone('square', 330, 0.15, 0.08, { at: t });
  tone('square', 247, 0.4, 0.08, { at: t + 0.17, to: 180 });
}
