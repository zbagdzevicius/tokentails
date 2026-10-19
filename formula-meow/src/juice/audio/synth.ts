// Copied from bad-cat/src/audio/synth.ts and voices.ts at 735cbeec (copy, never import; adapted for formula-meow).
/**
 * WebAudio synthesis primitives (GDD 10): every sound is oscillators, filtered noise and envelopes. No audio files.
 * Adds a voice counter (`track`) so the race mixer can hold the GDD budget of 24 voices.
 * Nothing here runs at module top level.
 */

export interface SynthGraph {
  ctx: BaseAudioContext;
  /** destination for this voice (a bus) */
  out: AudioNode;
  /** seeded white noise for this context */
  noise: AudioBuffer;
  /** told about every source node started (voice budget) */
  track?: (n: AudioScheduledSourceNode) => void;
}

export const SILENT = 0.0001;

export function run(g: SynthGraph, n: AudioScheduledSourceNode, t: number, stop: number, offset?: number): void {
  if (offset !== undefined) (n as AudioBufferSourceNode).start(t, offset);
  else n.start(t);
  n.stop(stop);
  g.track?.(n);
}

/** mulberry32: a cue sounds the same live and in a clip render */
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
  const r = prng(0x3e0a);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
}

export const semis = (n: number): number => Math.pow(2, n / 12);
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface EnvOpts {
  attack?: number;
  peak: number;
  decay: number;
  hold?: number;
}

function envelope(g: GainNode, t: number, o: EnvOpts): number {
  const a = Math.max(0.002, o.attack ?? 0.004);
  const peak = Math.max(SILENT * 2, o.peak);
  const hold = o.hold ?? 0;
  const p = g.gain;
  // a GainNode is 1 until its first event: without this a source starting on a sample boundary clicks
  p.value = SILENT;
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  const end = t + a + hold + Math.max(0.01, o.decay);
  p.exponentialRampToValueAtTime(SILENT, end);
  return end;
}

export interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
}

export function clampHz(ctx: BaseAudioContext, f: number): number {
  return Math.min(ctx.sampleRate / 2 - 100, Math.max(20, f));
}

export function filter(ctx: BaseAudioContext, t: number, dur: number, f: FilterOpts): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = f.type;
  n.frequency.setValueAtTime(clampHz(ctx, f.freq), t);
  if (f.freqEnd !== undefined) n.frequency.exponentialRampToValueAtTime(clampHz(ctx, f.freqEnd), t + Math.max(0.01, dur));
  if (f.q !== undefined) n.Q.setValueAtTime(f.q, t);
  return n;
}

export interface ToneOpts extends EnvOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  glide?: number;
  detune?: number;
  filter?: FilterOpts;
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
  const offset = (((o.seed ?? 0) % 97) / 97) * Math.max(0, g.noise.duration - 0.5);
  run(g, src, t, end + 0.02, offset);
  return end;
}

export function bell(g: SynthGraph, t: number, hz: number, peak: number, decay = 0.6, dest: AudioNode = g.out): void {
  tone(g, t, { freq: hz, peak, decay }, dest);
  tone(g, t, { freq: hz * 2.01, peak: peak * 0.35, decay: decay * 0.6 }, dest);
}

/** Brass-like stab: detuned saws through an opening low-pass. */
export function brass(g: SynthGraph, t: number, hz: number, dur: number, peak: number, dest: AudioNode = g.out): void {
  for (const det of [-9, 8]) {
    tone(g, t, { type: 'sawtooth', freq: hz, detune: det, attack: 0.02, hold: dur * 0.5, decay: dur * 0.6, peak: peak / 2, filter: { type: 'lowpass', freq: 700, freqEnd: 3200, q: 1 } }, dest);
  }
}

// ---- formant voice (copied syllable() from bad-cat voices.ts, trimmed to two formants for the voice budget) ----

export interface VoiceProfile {
  f0: number;
  /** formant scale (1 = adult; cats sit near 1.6) */
  fs: number;
  vibHz: number;
  vibCents: number;
  breath: number;
}

export const VOWELS = {
  a: [780, 1250],
  e: [500, 1850],
  i: [320, 2250],
  o: [520, 920],
  u: [360, 820],
  uh: [620, 1180],
  m: [280, 1050],
} as const;
export type Vowel = keyof typeof VOWELS;

export interface SyllableOpts {
  vowel: Vowel;
  to?: Vowel;
  dur: number;
  pitch?: number;
  pitchEnd?: number;
  peak: number;
  breath?: number;
}

/** One sung syllable: a sawtooth through two gliding formant band-passes. Returns its end time. */
export function syllable(g: SynthGraph, t: number, prof: VoiceProfile, o: SyllableOpts, dest: AudioNode = g.out): number {
  const { ctx } = g;
  const f0 = prof.f0 * (o.pitch ?? 1);
  const f1 = prof.f0 * (o.pitchEnd ?? o.pitch ?? 1);
  const dur = Math.max(0.05, o.dur);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(1, t);
  bus.connect(dest);
  const from = VOWELS[o.vowel];
  const to = VOWELS[o.to ?? o.vowel];
  const weights = [1.6, 1.0];
  for (let i = 0; i < 2; i++) {
    const f = filter(ctx, t, dur, { type: 'bandpass', freq: from[i] * prof.fs, freqEnd: to[i] * prof.fs, q: 5 + i * 2 });
    f.connect(bus);
    tone(
      g,
      t,
      {
        type: 'sawtooth',
        freq: f0,
        freqEnd: f1,
        attack: 0.02,
        hold: dur * 0.55,
        decay: dur * 0.45,
        peak: o.peak * weights[i],
        vib: prof.vibCents > 0 ? { hz: prof.vibHz, cents: prof.vibCents } : undefined,
      },
      f,
    );
  }
  const br = Math.min(1, prof.breath + (o.breath ?? 0));
  if (br > 0.01) noise(g, t, { peak: o.peak * 0.4 * br, attack: 0.02, hold: dur * 0.4, decay: dur * 0.6, filter: { type: 'bandpass', freq: to[1] * prof.fs, q: 1.2 }, seed: Math.round(f0) }, dest);
  return t + dur;
}
