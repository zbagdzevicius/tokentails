/**
 * Cat voices (GDD 10): meows, the hit hiss, the overtake trill, the "rival passed you" yowl, the cucumber scream
 * and the countdown "mrrp". All formant synthesis on top of synth.ts; `mrrp` is the bad-cat trill (voices.ts at
 * 735cbeec), the rest are new. Every call takes a pitch multiplier so each racer can have its own voice.
 */
import { noise, syllable, tone, type SynthGraph, type VoiceProfile } from './synth';

const CAT: VoiceProfile = { f0: 440, fs: 1.6, vibHz: 0, vibCents: 0, breath: 0.12 };

function cat(pitch: number, vib = 0): VoiceProfile {
  return { ...CAT, f0: CAT.f0 * pitch, vibHz: vib ? 6.5 : 0, vibCents: vib };
}

/** "mi-AOW": the classic meow. `pitch` 1 = a medium cat; >1 kitten, <1 big tom. */
export function meow(g: SynthGraph, t: number, v: number, pitch = 1, long = false): void {
  const p = cat(pitch, long ? 22 : 0);
  const d = long ? 0.55 : 0.36;
  syllable(g, t, p, { vowel: 'i', to: 'a', dur: d * 0.45, pitch: 0.95, pitchEnd: 1.25, peak: 0.16 * v });
  syllable(g, t + d * 0.4, p, { vowel: 'a', to: 'u', dur: d * 0.6, pitch: 1.25, pitchEnd: 0.85, peak: 0.18 * v });
}

/** Happy chirp-meow (pounce start, win). */
export function happyMeow(g: SynthGraph, t: number, v: number, pitch = 1): void {
  const p = cat(pitch * 1.15);
  syllable(g, t, p, { vowel: 'e', to: 'a', dur: 0.14, pitch: 1.1, pitchEnd: 1.5, peak: 0.15 * v });
  syllable(g, t + 0.12, p, { vowel: 'a', to: 'o', dur: 0.22, pitch: 1.5, pitchEnd: 1.35, peak: 0.16 * v });
}

/** The cat's "mrrp?" trill (copied shape from bad-cat): a fast flutter on a rising voice. */
export function mrrp(g: SynthGraph, t: number, v: number, pitch = 1): void {
  const p = cat(pitch * 0.95);
  for (let i = 0; i < 4; i++)
    syllable(g, t + i * 0.035, p, {
      vowel: i < 3 ? 'm' : 'uh',
      to: i < 3 ? 'm' : 'a',
      dur: i < 3 ? 0.03 : 0.14,
      pitch: 1 + i * 0.07,
      pitchEnd: 1.1 + i * 0.12,
      peak: 0.12 * v,
    });
}

/** Overtake trill: a quick rising "brrrt!". */
export function trill(g: SynthGraph, t: number, v: number): void {
  const p = cat(1.25);
  for (let i = 0; i < 3; i++) syllable(g, t + i * 0.03, p, { vowel: 'm', dur: 0.03, pitch: 1 + i * 0.1, pitchEnd: 1.1 + i * 0.1, peak: 0.1 * v });
  syllable(g, t + 0.1, p, { vowel: 'e', to: 'i', dur: 0.12, pitch: 1.45, pitchEnd: 1.8, peak: 0.12 * v });
}

/** A rival yowl ("MRAOOOW!"): long, wobbly, falling. Plays when someone passes you. */
export function yowl(g: SynthGraph, t: number, v: number, pitch = 0.85): void {
  const p = cat(pitch, 40);
  syllable(g, t, p, { vowel: 'u', to: 'a', dur: 0.18, pitch: 0.9, pitchEnd: 1.3, peak: 0.14 * v, breath: 0.2 });
  syllable(g, t + 0.16, p, { vowel: 'a', to: 'o', dur: 0.42, pitch: 1.3, pitchEnd: 0.8, peak: 0.16 * v, breath: 0.2 });
}

/** The hit hiss: a spit plosive, then a long breathy "khhhh". */
export function hiss(g: SynthGraph, t: number, v: number): void {
  noise(g, t, { peak: 0.35 * v, decay: 0.03, filter: { type: 'bandpass', freq: 3000, q: 1.5 }, seed: 11 });
  noise(g, t + 0.025, { peak: 0.28 * v, attack: 0.03, hold: 0.22, decay: 0.25, filter: { type: 'bandpass', freq: 5200, freqEnd: 3800, q: 0.8 }, seed: 23 });
}

/** Cucumber "AAAH!": a high, vibrato scream that jumps up. */
export function scream(g: SynthGraph, t: number, v: number): void {
  const p = cat(1.35, 60);
  syllable(g, t, p, { vowel: 'a', dur: 0.5, pitch: 1.0, pitchEnd: 1.6, peak: 0.2 * v, breath: 0.3 });
}

/** Squeak-toy landing. */
export function squeak(g: SynthGraph, t: number, v: number, pitch = 1): void {
  tone(g, t, { freq: 900 * pitch, freqEnd: 1500 * pitch, glide: 0.05, attack: 0.005, hold: 0.04, decay: 0.06, peak: 0.12 * v, vib: { hz: 40, cents: 60 } });
  tone(g, t + 0.1, { freq: 1300 * pitch, freqEnd: 900 * pitch, attack: 0.005, hold: 0.03, decay: 0.07, peak: 0.08 * v });
}

/** Sad "mew..." (stall, results off the podium). */
export function sadMew(g: SynthGraph, t: number, v: number): void {
  const p = cat(1.2);
  syllable(g, t, p, { vowel: 'i', to: 'u', dur: 0.35, pitch: 1.1, pitchEnd: 0.75, peak: 0.12 * v });
}
