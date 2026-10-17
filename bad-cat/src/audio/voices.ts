/**
 * W1-AUDIO: the humans' wordless voices (GDD 12). A sawtooth (plus a little breath noise) through three formant
 * band-passes reads as a mouth without any words; each persona gets its own pitch, formant shift and wobble.
 * The only English is "BAD KITTY" and "come here", sung as a warm vocoder-ish chirp on CAUGHT.
 * Nothing here runs at module top level.
 */
import type { RoutineDef } from '../types';
import { SILENT, filter, noise, run, tone, type SynthGraph } from './synth';

export type Persona = NonNullable<RoutineDef['persona']>;

export const PERSONAS: readonly Persona[] = [
  'chef-dad',
  'couch-potato',
  'skincare-sis',
  'wfh-worker',
  'party-host',
  'napper',
  'grandma',
  'caterer',
];

export interface VoiceProfile {
  /** Speaking pitch (Hz). */
  f0: number;
  /** Formant scale (1 = adult male average; >1 brighter, smaller head). */
  fs: number;
  /** Wobble: vibrato rate (Hz) and depth (cents). Grandma has the big one. */
  vibHz: number;
  vibCents: number;
  /** Breath noise mixed under the voice, 0..1. */
  breath: number;
  /** How far "hm?" glides up (semitones). */
  lilt: number;
}

export const VOICE_PROFILES: Record<Persona, VoiceProfile> = {
  'chef-dad': { f0: 128, fs: 0.95, vibHz: 0, vibCents: 0, breath: 0.1, lilt: 8 },
  'couch-potato': { f0: 104, fs: 0.9, vibHz: 0, vibCents: 0, breath: 0.25, lilt: 5 },
  'skincare-sis': { f0: 228, fs: 1.2, vibHz: 5, vibCents: 12, breath: 0.15, lilt: 9 },
  'wfh-worker': { f0: 150, fs: 1.05, vibHz: 0, vibCents: 0, breath: 0.1, lilt: 7 },
  'party-host': { f0: 196, fs: 1.15, vibHz: 5.5, vibCents: 18, breath: 0.1, lilt: 11 },
  napper: { f0: 108, fs: 0.92, vibHz: 0, vibCents: 0, breath: 0.35, lilt: 6 },
  grandma: { f0: 210, fs: 1.12, vibHz: 6.5, vibCents: 55, breath: 0.2, lilt: 7 },
  caterer: { f0: 140, fs: 1.0, vibHz: 0, vibCents: 0, breath: 0.1, lilt: 7 },
};

export function profileOf(p: Persona | undefined): VoiceProfile {
  return (p && VOICE_PROFILES[p]) || VOICE_PROFILES['chef-dad'];
}

/** Vowel formants F1, F2, F3 (Hz) for an adult voice; scaled by VoiceProfile.fs. */
export const VOWELS = {
  a: [780, 1250, 2550],
  e: [500, 1850, 2600],
  i: [320, 2250, 2950],
  o: [520, 920, 2450],
  u: [360, 820, 2350],
  uh: [620, 1180, 2500],
  m: [280, 1050, 2300], // closed-mouth hum
} as const;
export type Vowel = keyof typeof VOWELS;

export interface SyllableOpts {
  vowel: Vowel;
  /** Glide into this vowel over the syllable (diphthongs, "here" -> "hee-uh"). */
  to?: Vowel;
  dur: number;
  /** Pitch multipliers on the profile's f0 at the start and end. */
  pitch?: number;
  pitchEnd?: number;
  peak: number;
  /** Consonant burst in front: plosive (b, d, k, t), breathy h, nasal m. */
  onset?: 'b' | 'd' | 'k' | 't' | 'h' | 'm' | 'c';
  /** Extra breath on top of the profile's. */
  breath?: number;
}

/**
 * One sung syllable: sawtooth source through three formant band-passes (a crude channel vocoder), with an
 * optional consonant burst. Returns the end time.
 */
export function syllable(g: SynthGraph, t: number, prof: VoiceProfile, o: SyllableOpts): number {
  const { ctx } = g;
  const f0 = prof.f0 * (o.pitch ?? 1);
  const f1 = prof.f0 * (o.pitchEnd ?? o.pitch ?? 1);
  let t0 = t;
  if (o.onset) {
    const plosive = o.onset === 'b' || o.onset === 'd' || o.onset === 'k' || o.onset === 't' || o.onset === 'c';
    if (plosive) {
      const hz = o.onset === 'b' ? 500 : o.onset === 'd' ? 2200 : o.onset === 't' ? 4500 : 3000;
      noise(g, t, { peak: o.peak * 0.9, decay: 0.025, filter: { type: 'bandpass', freq: hz, q: 1.5 }, seed: Math.round(hz) });
      t0 = t + 0.03;
    } else if (o.onset === 'h') {
      noise(g, t, { peak: o.peak * 0.45, attack: 0.03, decay: 0.07, filter: { type: 'bandpass', freq: 1500 * prof.fs, q: 0.8 }, seed: 7 });
      t0 = t + 0.06;
    } else {
      tone(g, t, { freq: f0, peak: o.peak * 0.5, attack: 0.01, decay: 0.07, filter: { type: 'lowpass', freq: 400 } });
      t0 = t + 0.05;
    }
  }
  const dur = Math.max(0.05, o.dur);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(1, t0);
  bus.connect(g.out);
  const from = VOWELS[o.vowel];
  const to = VOWELS[o.to ?? o.vowel];
  const weights = [1.5, 0.9, 0.45];
  for (let i = 0; i < 3; i++) {
    const f = filter(ctx, t0, dur, { type: 'bandpass', freq: from[i] * prof.fs, freqEnd: to[i] * prof.fs, q: 6 + i * 2 });
    f.connect(bus);
    tone(
      g,
      t0,
      {
        type: 'sawtooth',
        freq: f0,
        freqEnd: f1,
        attack: 0.025,
        hold: dur * 0.55,
        decay: dur * 0.45,
        peak: o.peak * weights[i],
        vib: prof.vibCents > 0 ? { hz: prof.vibHz, cents: prof.vibCents } : undefined,
      },
      f,
    );
  }
  // fundamental body + breath
  tone(g, t0, { type: 'sine', freq: f0, freqEnd: f1, attack: 0.02, hold: dur * 0.5, decay: dur * 0.5, peak: o.peak * 0.3 });
  const br = Math.min(1, prof.breath + (o.breath ?? 0));
  if (br > 0.01)
    noise(g, t0, { peak: o.peak * 0.35 * br, attack: 0.03, hold: dur * 0.4, decay: dur * 0.6, filter: { type: 'bandpass', freq: to[1] * prof.fs, q: 1.2 }, seed: Math.round(f0) });
  return t0 + dur;
}

// ---------------------------------------------------------------------------------------------
// The vocal set (GDD 12): "hm?", gasp, sigh, humming, yawn, snore, "BAD KITTY", "come here"
// ---------------------------------------------------------------------------------------------

/** "hm?": a closed-mouth hum gliding up by the persona's lilt. */
export function hmVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  const up = Math.pow(2, prof.lilt / 12);
  syllable(g, t, prof, { vowel: 'm', to: 'uh', dur: 0.36, pitch: 1, pitchEnd: up, peak: 0.26 * v });
}

/** Gasp: a sharp breathy inhale with a voiced "ah!" edge. */
export function gaspVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  noise(g, t, { peak: 0.22 * v, attack: 0.05, decay: 0.12, filter: { type: 'bandpass', freq: 1300 * prof.fs, freqEnd: 2600 * prof.fs, q: 1.6 }, seed: 31 });
  syllable(g, t + 0.06, prof, { vowel: 'a', dur: 0.12, pitch: 1.5, pitchEnd: 1.8, peak: 0.16 * v, breath: 0.4 });
}

/** Sigh: a relieved "haaah" sliding down. */
export function sighVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  syllable(g, t, prof, { onset: 'h', vowel: 'a', to: 'uh', dur: 0.42, pitch: 1.1, pitchEnd: 0.8, peak: 0.1 * v, breath: 0.6 });
}

/** Humming: three lazy notes (the fake-out "hmm-mm-mm"). */
export function humVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  const notes = [1, 1.122, 0.94];
  notes.forEach((m, i) => syllable(g, t + i * 0.24, prof, { vowel: 'm', dur: 0.22, pitch: m, pitchEnd: m * 0.98, peak: 0.12 * v }));
}

/** Big yawn: up into a wide "aaah", down into "oh", then the sleepy "hm?" (the Napper wakes). */
export function yawnVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  syllable(g, t, prof, { onset: 'h', vowel: 'uh', to: 'a', dur: 0.55, pitch: 1.1, pitchEnd: 1.7, peak: 0.2 * v, breath: 0.4 });
  syllable(g, t + 0.62, prof, { vowel: 'a', to: 'o', dur: 0.5, pitch: 1.6, pitchEnd: 0.85, peak: 0.18 * v, breath: 0.3 });
  hmVoice(g, t + 1.25, p, v);
}

/**
 * Snore: a rumbly inhale (low noise fluttering at ~30 Hz) and a whistled exhale. `tension` 0..1 (the noise
 * meter) makes it shorter, higher and twitchier: the Napper is about to wake.
 */
export function snoreVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number, tension: number): void {
  const prof = profileOf(p);
  const { ctx } = g;
  const k = Math.min(1, Math.max(0, tension));
  const inDur = 0.7 - k * 0.25;
  const src = ctx.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  const lp = filter(ctx, t, inDur, { type: 'lowpass', freq: 380 * prof.fs, freqEnd: 600 * prof.fs, q: 3 });
  const am = ctx.createGain();
  am.gain.setValueAtTime(0.5, t);
  const flutter = ctx.createOscillator();
  flutter.frequency.setValueAtTime(28 + k * 14, t);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0.5, t);
  flutter.connect(depth);
  depth.connect(am.gain);
  const env = ctx.createGain();
  const lv = Math.max(SILENT * 2, (0.22 + k * 0.1) * v);
  env.gain.value = SILENT;
  env.gain.setValueAtTime(SILENT, t);
  env.gain.linearRampToValueAtTime(lv, t + inDur * 0.6);
  env.gain.exponentialRampToValueAtTime(SILENT, t + inDur);
  src.connect(lp);
  lp.connect(am);
  am.connect(env);
  env.connect(g.out);
  run(g, src, t, t + inDur + 0.05, 0.1);
  run(g, flutter, t, t + inDur + 0.05);
  // the "pfffew" whistle out
  const ex = t + inDur + 0.15;
  tone(g, ex, { freq: (700 + k * 500) * prof.fs, freqEnd: (480 + k * 300) * prof.fs, attack: 0.08, hold: 0.15, decay: 0.3, peak: (0.05 + k * 0.03) * v });
  noise(g, ex, { peak: 0.06 * v, attack: 0.08, decay: 0.35, filter: { type: 'bandpass', freq: 1800, q: 1.2 }, seed: 13 });
}

/** "BAD KIT-TY": three syllables, scolding but warm. */
export function badKittyVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  syllable(g, t, prof, { onset: 'b', vowel: 'a', dur: 0.24, pitch: 1.75, pitchEnd: 1.55, peak: 0.26 * v });
  syllable(g, t + 0.32, prof, { onset: 'k', vowel: 'i', dur: 0.11, pitch: 2.1, pitchEnd: 2.05, peak: 0.24 * v });
  syllable(g, t + 0.47, prof, { onset: 't', vowel: 'i', to: 'e', dur: 0.28, pitch: 1.95, pitchEnd: 1.45, peak: 0.22 * v });
}

/** "come HERE": two syllables, a sing-song call (rising, then the soft fall of a cuddle). */
export function comeHereVoice(g: SynthGraph, t: number, p: Persona | undefined, v: number): void {
  const prof = profileOf(p);
  syllable(g, t, prof, { onset: 'c', vowel: 'uh', to: 'm', dur: 0.2, pitch: 1.5, pitchEnd: 1.55, peak: 0.22 * v });
  syllable(g, t + 0.26, prof, { onset: 'h', vowel: 'i', to: 'uh', dur: 0.42, pitch: 1.9, pitchEnd: 1.4, peak: 0.24 * v });
}

/** Many short random syllables: guests chattering, the "SURPRISE!" crowd. */
export function crowd(g: SynthGraph, t: number, seconds: number, v: number, r: () => number, voices = 5): void {
  const vowels: Vowel[] = ['a', 'e', 'o', 'uh', 'i'];
  for (let k = 0; k < voices; k++) {
    const p = PERSONAS[Math.floor(r() * PERSONAS.length)];
    let tt = t + r() * 0.15;
    while (tt < t + seconds) {
      const d = 0.08 + r() * 0.12;
      const m = 0.9 + r() * 0.5;
      syllable(g, tt, profileOf(p), { vowel: vowels[Math.floor(r() * vowels.length)], dur: d, pitch: m, pitchEnd: m * (0.9 + r() * 0.25), peak: 0.06 * v });
      tt += d + 0.03 + r() * 0.1;
    }
  }
}

/** The cat's happy "mrrp?" (trill): a fast amplitude flutter on a rising voice. */
export function mrrp(g: SynthGraph, t: number, v: number): void {
  const cat: VoiceProfile = { f0: 420, fs: 1.6, vibHz: 0, vibCents: 0, breath: 0.1, lilt: 7 };
  for (let i = 0; i < 4; i++)
    syllable(g, t + i * 0.035, cat, { vowel: i < 3 ? 'm' : 'uh', to: i < 3 ? 'm' : 'a', dur: i < 3 ? 0.03 : 0.16, pitch: 1 + i * 0.07, pitchEnd: 1.1 + i * 0.12, peak: 0.12 * v });
}
