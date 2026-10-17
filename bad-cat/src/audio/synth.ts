/**
 * L7 Audio: WebAudio synthesis recipes (GDD 12). Every sound is built from oscillators, filtered noise and
 * envelopes; there are no audio files. Works on AudioContext and OfflineAudioContext alike.
 * Nothing here runs at module top level.
 */
import type { Cue } from './sfx-map';
import { eventCue, nyeCountdown, teleCue } from './rooms';
import * as rx from './recipes';
import * as vx from './voices';

export interface SynthGraph {
  ctx: BaseAudioContext;
  /** Destination for this voice (the sfx bus). */
  out: AudioNode;
  /** 2 s of seeded white noise for this context. */
  noise: AudioBuffer;
  /** Optional: told about every source node a recipe starts (scheduleClip cancels them). */
  track?: (n: AudioScheduledSourceNode) => void;
}

/** Start a source at t and stop it at `stop`, reporting it to the graph's tracker. */
export function run(g: SynthGraph, n: AudioScheduledSourceNode, t: number, stop: number, offset?: number): void {
  if (offset !== undefined) (n as AudioBufferSourceNode).start(t, offset);
  else n.start(t);
  n.stop(stop);
  g.track?.(n);
}

export const SILENT = 0.0001;

/** Small deterministic PRNG (mulberry32) so a cue sounds the same live and in the clip. */
export function prng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(0xbadca7);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
}

export const semis = (n: number): number => Math.pow(2, n / 12);
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface EnvOpts {
  attack?: number;
  /** Peak gain. */
  peak: number;
  /** Decay time from peak to silence. */
  decay: number;
  /** Hold at peak before the decay. */
  hold?: number;
}

function envelope(g: GainNode, t: number, o: EnvOpts): number {
  const a = Math.max(0.002, o.attack ?? 0.004);
  const peak = Math.max(SILENT * 2, o.peak);
  const hold = o.hold ?? 0;
  const p = g.gain;
  // a GainNode is 1 until its first event: without this, a source starting exactly on a sample boundary at t
  // leaks one full-scale sample (an audible click through a high-pass; measured in Chromium)
  p.value = SILENT;
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  const end = t + a + hold + Math.max(0.01, o.decay);
  p.exponentialRampToValueAtTime(SILENT, end);
  return end;
}

interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
}

export function filter(ctx: BaseAudioContext, t: number, dur: number, f: FilterOpts): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = f.type;
  n.frequency.setValueAtTime(clampHz(ctx, f.freq), t);
  if (f.freqEnd !== undefined) n.frequency.exponentialRampToValueAtTime(clampHz(ctx, f.freqEnd), t + Math.max(0.01, dur));
  if (f.q !== undefined) n.Q.setValueAtTime(f.q, t);
  return n;
}

function clampHz(ctx: BaseAudioContext, f: number): number {
  return Math.min(ctx.sampleRate / 2 - 100, Math.max(20, f));
}

export interface ToneOpts extends EnvOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** Glide time for freqEnd (defaults to the whole note). */
  glide?: number;
  detune?: number;
  filter?: FilterOpts;
  /** Vibrato (grandma's wobble, the kettle): LFO rate in Hz and depth in cents. */
  vib?: { hz: number; cents: number };
}

/** One oscillator voice. Returns its end time. */
export function tone(g: SynthGraph, t: number, o: ToneOpts, dest: AudioNode = g.out): number {
  const { ctx } = g;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(clampHz(ctx, o.freq), t);
  const len = (o.attack ?? 0.004) + (o.hold ?? 0) + o.decay;
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(clampHz(ctx, o.freqEnd), t + Math.max(0.01, o.glide ?? len));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const gain = ctx.createGain();
  const end = envelope(gain, t, o);
  let head: AudioNode = osc;
  if (o.filter) {
    const f = filter(ctx, t, len, o.filter);
    osc.connect(f);
    head = f;
  }
  head.connect(gain);
  gain.connect(dest);
  if (o.vib && o.vib.cents > 0) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(Math.max(0.1, o.vib.hz), t);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(o.vib.cents, t);
    lfo.connect(depth);
    depth.connect(osc.detune);
    run(g, lfo, t, end + 0.02);
  }
  run(g, osc, t, end + 0.02);
  return end;
}

export interface NoiseOpts extends EnvOpts {
  filter: FilterOpts;
  /** Seed for the start offset in the noise buffer. */
  seed?: number;
}

/** One filtered-noise burst. Returns its end time. */
export function noise(g: SynthGraph, t: number, o: NoiseOpts, dest: AudioNode = g.out): number {
  const { ctx } = g;
  const src = ctx.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  const len = (o.attack ?? 0.004) + (o.hold ?? 0) + o.decay;
  const f = filter(ctx, t, len, o.filter);
  const gain = ctx.createGain();
  const end = envelope(gain, t, o);
  src.connect(f);
  f.connect(gain);
  gain.connect(dest);
  const offset = ((o.seed ?? 0) % 97) / 97 * Math.max(0, g.noise.duration - 0.5);
  run(g, src, t, end + 0.02, offset);
  return end;
}

/** Amplitude-modulated low noise: a purr. */
export function purr(g: SynthGraph, t: number, durIn: number, level: number): void {
  const dur = Math.max(0.8, durIn);
  const { ctx } = g;
  const src = ctx.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  const lp = filter(ctx, t, dur, { type: 'lowpass', freq: 260, q: 1.2 });
  const am = ctx.createGain();
  am.gain.setValueAtTime(0.5, t);
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(24, t);
  lfo.frequency.linearRampToValueAtTime(21, t + dur);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(0.5, t);
  lfo.connect(lfoDepth);
  lfoDepth.connect(am.gain);
  const env = ctx.createGain();
  env.gain.value = SILENT;
  env.gain.setValueAtTime(SILENT, t);
  const lv = Math.max(SILENT * 2, level);
  env.gain.linearRampToValueAtTime(lv, t + 0.25);
  env.gain.setValueAtTime(lv, t + Math.max(0.3, dur - 0.4));
  env.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  src.connect(lp);
  lp.connect(am);
  am.connect(env);
  env.connect(g.out);
  // a soft low body under the rumble
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(48, t);
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.35, t);
  body.connect(bodyG);
  bodyG.connect(am);
  run(g, src, t, t + dur + 0.05);
  run(g, lfo, t, t + dur + 0.05);
  run(g, body, t, t + dur + 0.05);
}

/** Wordless "voice": a sawtooth through two formant band-passes (the human's "hm?", "BAD KITTY"). */
export function voice(
  g: SynthGraph,
  t: number,
  o: { f0: number; f1?: number; dur: number; peak: number; formants: [number, number] },
): void {
  const { ctx } = g;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(1, t);
  bus.connect(g.out);
  for (const [i, fc] of o.formants.entries()) {
    const f = filter(ctx, t, o.dur, { type: 'bandpass', freq: fc, q: 5 });
    f.connect(bus);
    tone(g, t, { type: 'sawtooth', freq: o.f0, freqEnd: o.f1, attack: 0.02, hold: o.dur * 0.55, decay: o.dur * 0.45, peak: o.peak * (i === 0 ? 1.6 : 0.9) }, f);
  }
  // fundamental hum
  tone(g, t, { type: 'sine', freq: o.f0, freqEnd: o.f1, attack: 0.02, hold: o.dur * 0.5, decay: o.dur * 0.5, peak: o.peak * 0.35 });
}

/** Brass-like stab: detuned saws through an opening low-pass. */
export function brass(g: SynthGraph, t: number, hz: number, dur: number, peak: number): void {
  for (const det of [-9, 0, 8]) {
    tone(g, t, {
      type: 'sawtooth',
      freq: hz,
      detune: det,
      attack: 0.025,
      hold: dur * 0.5,
      decay: dur * 0.6,
      peak: peak / 3,
      filter: { type: 'lowpass', freq: 600, freqEnd: 2600, q: 1 },
    });
  }
}

export function bell(g: SynthGraph, t: number, hz: number, peak: number, decay = 0.6): void {
  tone(g, t, { freq: hz, peak, decay });
  tone(g, t, { freq: hz * 2.01, peak: peak * 0.35, decay: decay * 0.6 });
  tone(g, t, { freq: hz * 3.98, peak: peak * 0.12, decay: decay * 0.3 });
}

// ---------------------------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------------------------

/** Crash level relative to everything else: about +3.5 dB (GDD 12: "mixed 3-4 dB above"). */
export const CRASH_BOOST = 1.5;
/** Food splats are payoffs too (crash family), a little below a full crash. */
export const SPLAT_BOOST = 1.4;

/** Play one cue starting at `when` (context seconds). Never throws on valid contexts. */
export function playCue(g: SynthGraph, c: Cue, when: number): void {
  const t = Math.max(when + c.delay, g.ctx.currentTime);
  const p = semis(c.pitch);
  const v = c.gain;
  const r = prng(c.tick * 131 + c.variant * 977 + c.id.length * 31);
  const seed = Math.floor(r() * 1e6);
  switch (c.id) {
    case 'step': {
      const lvl = c.speed === 2 ? 0.2 : 0.11;
      const vr = 1 + (c.variant - 1) * 0.07;
      switch (c.level ?? 0) {
        case 0: // wooden floor tap
          noise(g, t, { peak: lvl * v, decay: 0.04, filter: { type: 'bandpass', freq: 900 * vr, q: 2 }, seed });
          tone(g, t, { freq: 170 * vr, freqEnd: 110, peak: lvl * 0.6 * v, decay: 0.05 });
          break;
        case 1: // chair cushion
          noise(g, t, { peak: lvl * 0.9 * v, attack: 0.01, decay: 0.07, filter: { type: 'lowpass', freq: 450 * vr }, seed });
          break;
        case 2: // tiled counter click
          noise(g, t, { peak: lvl * 0.8 * v, decay: 0.025, filter: { type: 'bandpass', freq: 3200 * vr, q: 4 }, seed });
          tone(g, t, { freq: 1300 * vr, peak: lvl * 0.25 * v, decay: 0.015 });
          break;
        default: // hollow shelf
          tone(g, t, { type: 'triangle', freq: 250 * vr, freqEnd: 190, peak: lvl * 0.8 * v, decay: 0.08 });
          noise(g, t, { peak: lvl * 0.5 * v, decay: 0.03, filter: { type: 'bandpass', freq: 1300 * vr, q: 3 }, seed });
      }
      break;
    }
    case 'jumpUp':
      tone(g, t, { freq: 300 * p, freqEnd: 720 * p, peak: 0.12 * v, decay: 0.13, glide: 0.1 });
      noise(g, t, { peak: 0.05 * v, decay: 0.12, filter: { type: 'bandpass', freq: 1500, freqEnd: 3000, q: 1 }, seed });
      noise(g, t + 0.36, { peak: 0.12 * v, decay: 0.05, filter: { type: 'lowpass', freq: 700 }, seed: seed + 1 });
      break;
    case 'jumpDown':
      noise(g, t, { peak: 0.08 * v, attack: 0.03, decay: 0.2, filter: { type: 'bandpass', freq: 1800, freqEnd: 600, q: 1 }, seed });
      noise(g, t + 0.38, { peak: 0.18 * v, decay: 0.07, filter: { type: 'lowpass', freq: 600 }, seed: seed + 1 });
      tone(g, t + 0.38, { freq: 140, freqEnd: 70, peak: 0.12 * v, decay: 0.08 });
      break;
    case 'swat': // "pap"
      noise(g, t, { peak: 0.38 * v, decay: 0.05, filter: { type: 'bandpass', freq: 1500 * p, q: 1.2 }, seed });
      tone(g, t, { freq: 320 * p, freqEnd: 150, peak: 0.3 * v, decay: 0.06 });
      break;
    case 'swatAir':
      noise(g, t, { peak: 0.14 * v, attack: 0.02, decay: 0.12, filter: { type: 'bandpass', freq: 800, freqEnd: 2600, q: 1.5 }, seed });
      break;
    case 'wobble':
      if (c.material === 'glass') {
        // the tink of a glass rocking on its base
        for (let i = 0; i < 3; i++) bell(g, t + i * 0.085, (3100 + r() * 1200) * p, 0.07 * v, 0.18);
      } else {
        for (let i = 0; i < 4; i++)
          noise(g, t + i * 0.06, { peak: 0.14 * v, decay: 0.03, filter: { type: 'bandpass', freq: 1500 + r() * 900, q: 6 }, seed: seed + i });
      }
      break;
    case 'push':
      noise(g, t, { peak: 0.16 * v, attack: 0.03, decay: 0.16, filter: { type: 'bandpass', freq: 650, freqEnd: 420, q: 3 }, seed });
      break;
    case 'fall': {
      const dur = Math.max(0.15, c.dur ?? 0.35);
      tone(g, t, { freq: 1500 * p, freqEnd: 480 * p, attack: 0.02, hold: dur * 0.6, decay: dur * 0.4, peak: 0.08 * v });
      noise(g, t, { peak: 0.05 * v, attack: dur * 0.5, decay: dur * 0.5, filter: { type: 'bandpass', freq: 1200, freqEnd: 2500, q: 1 }, seed });
      break;
    }
    case 'crash':
      if (c.special) rx.specialSound(g, c.special, t, p, v * CRASH_BOOST, true, r, seed);
      else crash(g, c, t, p, v * CRASH_BOOST, r, seed);
      break;
    case 'splat': {
      // a food payoff: part of the crash family, so it gets most of the crash's lift
      const vs = v * SPLAT_BOOST;
      noise(g, t, { peak: 0.6 * vs, decay: 0.26, filter: { type: 'lowpass', freq: 1400 * p, freqEnd: 260, q: 2 }, seed });
      tone(g, t, { freq: 170 * p, freqEnd: 55, peak: 0.45 * vs, decay: 0.18 });
      noise(g, t + 0.1, { peak: 0.2 * vs, decay: 0.15, filter: { type: 'bandpass', freq: 650, freqEnd: 380, q: 5 }, seed: seed + 3 });
      break;
    }
    case 'land':
      if (c.special) rx.specialSound(g, c.special, t, p, v, false, r, seed);
      else landByMaterial(g, c, t, p, v, r, seed);
      break;
    case 'bonk':
      tone(g, t, { freq: 540 * p, freqEnd: 250 * p, peak: 0.4 * v, decay: 0.13 });
      tone(g, t, { type: 'triangle', freq: 1080 * p, peak: 0.08 * v, decay: 0.05 });
      break;
    case 'target':
      [1046.5, 1318.5, 1568, 2093].forEach((hz, i) => bell(g, t + i * 0.07, hz * p, 0.1 * v, 0.5));
      break;
    case 'combo':
      tone(g, t, { type: 'square', freq: 660 * p, peak: 0.1 * v, decay: 0.09, filter: { type: 'lowpass', freq: 3500 } });
      tone(g, t + 0.06, { type: 'square', freq: 990 * p, peak: 0.08 * v, decay: 0.1, filter: { type: 'lowpass', freq: 4000 } });
      break;
    case 'grab': // "mrp"
      voice(g, t, { f0: 420, f1: 620, dur: 0.14, peak: 0.12 * v, formants: [900, 2200] });
      break;
    case 'drop':
      noise(g, t, { peak: 0.14 * v, decay: 0.07, filter: { type: 'lowpass', freq: 500 }, seed });
      break;
    case 'stash':
      tone(g, t, { type: 'triangle', freq: 880, peak: 0.14 * v, decay: 0.12 });
      tone(g, t + 0.09, { type: 'triangle', freq: 1318.5, peak: 0.14 * v, decay: 0.2 });
      break;
    case 'purr':
      purr(g, t, c.dur ?? 1.6, 0.3 * v);
      break;
    case 'hm': {
      // two-note sting (low, then up a fourth) with the persona's "hm?" gliding up on top: loud and short
      brass(g, t, 196, 0.14, 0.42 * v);
      brass(g, t + 0.15, 261.6, 0.22, 0.5 * v);
      vx.hmVoice(g, t + 0.04, c.persona, v);
      break;
    }
    case 'doubleTake':
      // W1-AUDIO: 3 dB under M0 so the crash it lands on stays on top (GDD 12)
      brass(g, t, 523.3, 0.07, 0.26 * v);
      brass(g, t + 0.1, 784, 0.12, 0.3 * v);
      vx.gaspVoice(g, t, c.persona, v);
      break;
    case 'hum': // relieved humming (fake-out)
      vx.humVoice(g, t, c.persona, v);
      break;
    case 'eventCue':
      eventCue(g, c.eventKind ?? 0, t, v, seed, r);
      break;
    case 'seen':
      tone(g, t, { freq: 1760, peak: 0.1 * v, decay: 0.05 });
      tone(g, t + 0.08, { freq: 2093, peak: 0.1 * v, decay: 0.07 });
      break;
    case 'lastCall':
      [523.3, 659.3, 784, 1046.5].forEach((hz, i) =>
        tone(g, t + i * 0.09, { type: 'square', freq: hz, peak: 0.12 * v, decay: 0.12, filter: { type: 'lowpass', freq: 3000 } }),
      );
      break;
    case 'caught': {
      // softened "wah-wah-wah-waaah": muted trombone through a wah filter
      const notes = [196, 185, 174.6, 164.8];
      notes.forEach((hz, i) => {
        const last = i === notes.length - 1;
        const tt = t + i * 0.36;
        tone(g, tt, {
          type: 'sawtooth',
          freq: hz,
          freqEnd: last ? hz * 0.94 : undefined,
          attack: 0.04,
          hold: last ? 0.5 : 0.18,
          decay: last ? 0.45 : 0.12,
          peak: 0.22 * v,
          filter: { type: 'lowpass', freq: 380, freqEnd: 1100, q: 6 },
        });
      });
      break;
    }
    case 'badKitty': {
      // "BAD KIT-TY": the persona's vocoder-ish chirp, scolding but warm, with a music-box answer
      vx.badKittyVoice(g, t, c.persona, v);
      [1568, 1318.5, 1046.5].forEach((hz, i) => bell(g, t + 0.15 + i * 0.16, hz, 0.06 * v, 0.4));
      break;
    }
    case 'comeHere':
      vx.comeHereVoice(g, t, c.persona, v);
      break;
    case 'perfect': {
      // 4-note brass hit: pickup G-C-E, then a long C chord
      brass(g, t, 392, 0.08, 0.32 * v);
      brass(g, t + 0.11, 523.3, 0.08, 0.34 * v);
      brass(g, t + 0.22, 659.3, 0.08, 0.36 * v);
      for (const hz of [523.3, 659.3, 784, 1046.5]) brass(g, t + 0.36, hz, 0.7, 0.2 * v);
      break;
    }
    case 'stamp':
      tone(g, t, { freq: 95, freqEnd: 40, peak: 0.7 * v, decay: 0.25 });
      noise(g, t, { peak: 0.5 * v, decay: 0.12, filter: { type: 'lowpass', freq: 900 }, seed });
      break;
    case 'go':
      tone(g, t, { freq: 600, freqEnd: 1250, peak: 0.16 * v, decay: 0.2, glide: 0.12 });
      noise(g, t, { peak: 0.18 * v, decay: 0.08, filter: { type: 'highpass', freq: 2000 }, seed });
      break;
    // ----- v5 (W1-AUDIO) -----
    case 'slide':
      rx.slide(g, c, t, p, v, seed);
      break;
    case 'stackClink':
      rx.stackClinks(g, c, t, p, v, r, seed);
      break;
    case 'pullCloth':
      rx.pullCloth(g, c, t, v, seed);
      break;
    case 'pullCable':
      rx.pullCable(g, t, p, v, seed);
      break;
    case 'topple':
      rx.topple(g, c, t, p, v, CRASH_BOOST, r, seed);
      break;
    case 'puddle':
      rx.puddle(g, c, t, p, v, seed);
      break;
    case 'roombaHum':
      rx.roombaHum(g, c, t, v);
      break;
    case 'framed':
      rx.framedSting(g, t, v);
      break;
    case 'wish':
      rx.wish(g, t, v, r);
      break;
    case 'enter':
      rx.enterBox(g, t, v, seed);
      break;
    case 'noiseRise':
      rx.noiseRise(g, c, t, p, v);
      break;
    case 'wake':
      vx.yawnVoice(g, t, c.persona ?? 'napper', v);
      break;
    case 'snore':
      vx.snoreVoice(g, t, c.persona ?? 'napper', v, c.amount ?? 0);
      break;
    case 'glint':
      rx.glint(g, t, v);
      break;
    case 'shutter':
      rx.shutter(g, t, v, seed);
      break;
    case 'teleCue':
      teleCue(g, c.teleKind ?? -1, t, v, seed);
      break;
    case 'sigh':
      vx.sighVoice(g, t, c.persona, v);
      break;
    case 'nyeCountdown':
      nyeCountdown(g, t, v, seed);
      break;
  }
}

function crash(g: SynthGraph, c: Cue, t: number, p: number, v: number, r: () => number, seed: number): void {
  const vr = c.variant;
  switch (c.material) {
    case 'glass': {
      noise(g, t, { peak: 0.55 * v, decay: 0.08, filter: { type: 'highpass', freq: 1800 }, seed });
      const n = 6 + vr * 2;
      for (let i = 0; i < n; i++) {
        bell(g, t + r() * 0.28, (2400 + r() * 4200) * p, (0.05 + r() * 0.05) * v, 0.12 + r() * 0.25);
      }
      // the comic "kshhh" tail
      noise(g, t + 0.02, { peak: 0.3 * v, attack: 0.02, decay: 0.6 + vr * 0.12, filter: { type: 'bandpass', freq: 5200, freqEnd: 2600, q: 0.7 }, seed: seed + 1 });
      break;
    }
    case 'metal':
      for (const ratio of [1, 2.76, 5.4, 8.93]) tone(g, t, { freq: 410 * ratio * p, peak: 0.12 * v, decay: 1.1 / Math.sqrt(ratio) });
      noise(g, t, { peak: 0.3 * v, decay: 0.1, filter: { type: 'highpass', freq: 2500 }, seed });
      break;
    case 'tech':
      noise(g, t, { peak: 0.7 * v, decay: 0.3, filter: { type: 'bandpass', freq: 1100 * p, q: 0.8 }, seed });
      tone(g, t, { freq: 180 * p, freqEnd: 70, peak: 0.35 * v, decay: 0.12 });
      tone(g, t, { type: 'square', freq: 880, freqEnd: 110, peak: 0.2 * v, decay: 0.28, filter: { type: 'lowpass', freq: 2800 } });
      for (let i = 0; i < 4; i++) tone(g, t + 0.05 + r() * 0.2, { type: 'triangle', freq: 900 + r() * 1400, peak: 0.08 * v, decay: 0.04 });
      noise(g, t + 0.05, { peak: 0.18 * v, decay: 0.4, filter: { type: 'bandpass', freq: 4000, freqEnd: 2200, q: 0.7 }, seed: seed + 2 });
      break;
    default: {
      // ceramic (and anything unknown): thunk + crunch + clacks + kshhh
      tone(g, t, { freq: (210 + vr * 25) * p, freqEnd: 85, peak: 0.45 * v, decay: 0.13 });
      noise(g, t, { peak: 0.5 * v, decay: 0.28, filter: { type: 'bandpass', freq: (1300 + vr * 300) * p, q: 0.9 }, seed });
      for (let i = 0; i < 4 + vr; i++) tone(g, t + 0.03 + r() * 0.3, { type: 'triangle', freq: (1100 + r() * 1300) * p, peak: 0.07 * v, decay: 0.05 });
      noise(g, t + 0.03, { peak: 0.22 * v, attack: 0.02, decay: 0.45, filter: { type: 'bandpass', freq: 4200, freqEnd: 2200, q: 0.7 }, seed: seed + 1 });
    }
  }
}

function landByMaterial(g: SynthGraph, c: Cue, t: number, p: number, v: number, r: () => number, seed: number): void {
  switch (c.material) {
    case 'plastic':
    case 'actor':
      tone(g, t, { freq: 520 * p, freqEnd: 260 * p, peak: 0.4 * v, decay: 0.12 });
      tone(g, t + 0.13, { freq: 470 * p, freqEnd: 300 * p, peak: 0.14 * v, decay: 0.08 });
      break;
    case 'paper':
      for (let i = 0; i < 5; i++)
        noise(g, t + i * 0.05 + r() * 0.02, { peak: 0.14 * v, decay: 0.04, filter: { type: 'bandpass', freq: 2200 + r() * 1200, q: 2 }, seed: seed + i });
      noise(g, t + 0.25, { peak: 0.2 * v, decay: 0.08, filter: { type: 'lowpass', freq: 600 }, seed: seed + 9 });
      break;
    case 'metal':
      for (const ratio of [1, 2.76, 5.4]) tone(g, t, { freq: 620 * ratio * p, peak: 0.1 * v, decay: 0.6 / ratio });
      break;
    default: // fabric and the rest: soft thud
      noise(g, t, { peak: 0.22 * v, decay: 0.1, filter: { type: 'lowpass', freq: 380 }, seed });
      tone(g, t, { freq: 110, freqEnd: 60, peak: 0.12 * v, decay: 0.09 });
  }
}
