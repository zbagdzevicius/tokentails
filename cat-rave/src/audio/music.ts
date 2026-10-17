/**
 * L-AUDIO: the original tune (A minor, i–VI–III–VII: Am F C G, one chord per bar). Pure data, no
 * WebAudio, so tests can import it. Nothing here is taken from the meme song.
 */

export const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export interface Chord {
  name: string;
  /** Bass root (octave 2/3, audible on phone speakers through the saw harmonics). */
  root: number;
  /** Pad voicing. */
  pad: readonly number[];
}

export const CHORDS: readonly Chord[] = Object.freeze([
  { name: 'Am', root: 45, pad: [57, 60, 64] },
  { name: 'F', root: 41, pad: [57, 60, 65] },
  { name: 'C', root: 48, pad: [55, 60, 64] },
  { name: 'G', root: 43, pad: [55, 59, 62] },
]);

/** Lead rhythm inside one bar of 16ths: 3+3+2+3+3+2, the classic hands-up gallop. */
export const LEAD_STEPS: readonly number[] = Object.freeze([0, 3, 6, 8, 11, 14]);

/** One row per chord, one note per LEAD_STEPS slot. */
export const LEAD: readonly (readonly number[])[] = Object.freeze([
  [76, 76, 81, 76, 84, 83],
  [77, 77, 81, 77, 84, 81],
  [79, 79, 84, 79, 88, 86],
  [83, 81, 79, 74, 79, 83],
]);

/** Length of a lead note in 16ths (until the next slot; the last one rings 2). */
export function leadLength(slot: number): number {
  const next = LEAD_STEPS[slot + 1];
  return next === undefined ? 2 : next - LEAD_STEPS[slot];
}

/** Snare-roll hits per bar while building: doubles every two bars (4 → 8 → 16). */
export function rollRate(sectionBar: number, held: boolean): number {
  if (held && sectionBar >= 4) return 16;
  const RATES = [4, 4, 8, 8, 16, 16, 16, 16];
  return RATES[Math.max(0, Math.min(RATES.length - 1, sectionBar))];
}

/**
 * Per-loop variation so the second pass never sounds the same: the key moves (semitones, applied
 * to bass, pads, lead and vocal chops) and every other loop the lead switches to a rolling 8th-note
 * arpeggio instead of the gallop.
 */
export const KEY_SHIFTS: readonly number[] = Object.freeze([0, 2, -3, 3]);

export function keyShift(loop: number): number {
  const n = KEY_SHIFTS.length;
  return KEY_SHIFTS[((Math.floor(loop) % n) + n) % n];
}

/** Arpeggio lead (odd loops): straight 8ths over the chord, peaking mid-bar. */
export const LEAD_ALT_STEPS: readonly number[] = Object.freeze([0, 2, 4, 6, 8, 10, 12, 14]);
export const LEAD_ALT: readonly (readonly number[])[] = Object.freeze([
  [69, 72, 76, 81, 84, 81, 76, 72],
  [69, 72, 77, 81, 84, 81, 77, 72],
  [67, 72, 76, 79, 84, 79, 76, 72],
  [67, 71, 74, 79, 83, 79, 74, 71],
]);

/** The lead note (already transposed) at 16th `s16` of a bar on `chordIdx`, or null. */
export function leadAt(loop: number, chordIdx: number, s16: number): { note: number; steps: number } | null {
  const shift = keyShift(loop);
  if (((Math.floor(loop) % 2) + 2) % 2 === 1) {
    const slot = LEAD_ALT_STEPS.indexOf(s16);
    if (slot < 0) return null;
    return { note: LEAD_ALT[chordIdx][slot] + shift, steps: 2 };
  }
  const slot = LEAD_STEPS.indexOf(s16);
  if (slot < 0) return null;
  return { note: LEAD[chordIdx][slot] + shift, steps: leadLength(slot) };
}
