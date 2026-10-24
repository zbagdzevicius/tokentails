// Meow Run's procedural songs: pure data + a pattern builder (no WebAudio here, so vitest can check it).
// Each song is 8 bars (A: bars 1-4, B: bars 5-8) of 16th steps with an authored melody, a chord progression per
// bar, and a style that decides the drums, bass, chords and lead timbres. Variants:
//   level  - the normal stage loop
//   chase  - the dog / yarn ball chase: faster, minor, driving 16th bass and alarm stabs (same bar grid, so the
//            music can swap variants on a bar line and keep its place)
//   calm   - title / results / menus: no drums, half-time bass, sparse lead
// Melody notation, one token per 8th note: a scale degree (0 = root, 7 = octave, may be negative), '-' holds the
// previous note, '.' is a rest.

export type SongId = 'meadow' | 'gorge' | 'sunset' | 'endless';
export type Variant = 'level' | 'chase' | 'calm';
export type Style = 'skip' | 'quest' | 'breeze' | 'dash';

export interface SongDef {
  id: SongId;
  bpm: number;
  /** MIDI root note */
  root: number;
  scale: number[];
  style: Style;
  /** chord root (scale degree) per bar, 8 bars */
  chords: number[];
  /** 64 tokens (8 bars of 8ths) */
  melody: string;
  /** swing amount 0..1 (delay of the off 16th) */
  swing: number;
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const SONGS: Record<SongId, SongDef> = {
  // Sunny Meadow Canyon: a bouncy skip with ukulele strums and a whistled tune.
  meadow: {
    id: 'meadow',
    bpm: 128,
    root: 60,
    scale: SCALES.major,
    style: 'skip',
    chords: [0, 4, 5, 3, 3, 4, 5, 4],
    melody:
      '4 . 4 5 4 2 0 2 ' + '1 - 4 - 6 5 4 - ' + '2 . 2 4 5 - 7 5 ' + '4 - 3 2 3 - . . ' +
      '5 - 5 7 5 4 3 4 ' + '4 - 1 - 4 5 6 - ' + '7 - 6 5 4 5 7 - ' + '8 - 7 6 4 - . .',
    swing: 0.18,
  },
  // River Gorge: an adventurous dorian quest with plucked strings and a brassy lead.
  gorge: {
    id: 'gorge',
    bpm: 140,
    root: 62,
    scale: SCALES.dorian,
    style: 'quest',
    chords: [0, 6, 3, 0, 2, 6, 3, 4],
    melody:
      '0 . 4 . 7 - 6 4 ' + '6 - 5 4 2 - . 4 ' + '3 - 5 6 7 - 6 5 ' + '4 - - - 2 3 4 . ' +
      '9 - 7 - 9 10 9 7 ' + '6 - 4 - 6 7 6 4 ' + '5 - 6 7 8 - 7 6 ' + '4 - - - . 4 6 7',
    swing: 0,
  },
  // Sunset Hills: a warm, laid-back breeze with a flute and soft pads.
  sunset: {
    id: 'sunset',
    bpm: 118,
    root: 65,
    scale: SCALES.major,
    style: 'breeze',
    chords: [0, 2, 3, 4, 5, 3, 0, 4],
    melody:
      '4 - - 2 4 - 7 - ' + '6 - - 4 2 - - . ' + '3 - 5 - 7 - 5 3 ' + '4 - - - - - . . ' +
      '5 - 7 - 9 - 7 5 ' + '3 - 5 - 7 - - . ' + '4 - 2 - 4 5 7 - ' + '6 - - - 4 - . .',
    swing: 0.3,
  },
  // Endless: a fast mixolydian dash with 16th arps.
  endless: {
    id: 'endless',
    bpm: 150,
    root: 57,
    scale: SCALES.mixolydian,
    style: 'dash',
    chords: [0, 6, 3, 0, 3, 4, 6, 0],
    melody:
      '0 2 4 7 - 4 6 7 ' + '6 - 4 - 3 4 6 - ' + '3 4 5 7 - 5 4 3 ' + '4 - 2 - 0 - . . ' +
      '7 - 9 - 10 9 7 - ' + '8 - 7 - 6 4 6 - ' + '6 - 7 8 9 - 8 7 ' + '7 - - - . . 4 6',
    swing: 0,
  },
};

export const BARS = 8;
export const STEPS = BARS * 16;

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Scale degree (any integer) to MIDI. */
export function degree(root: number, scale: readonly number[], deg: number, oct = 0): number {
  const L = scale.length;
  const o = Math.floor(deg / L);
  const i = ((deg % L) + L) % L;
  return root + scale[i] + 12 * (o + oct);
}

/** Parse the melody string into per-8th tokens: a degree, 'hold' or 'rest'. */
export function parseMelody(src: string): (number | 'hold' | 'rest')[] {
  return src
    .trim()
    .split(/\s+/)
    .map((t) => (t === '-' ? 'hold' : t === '.' ? 'rest' : Number(t)));
}

export type Voice = 'pluck' | 'whistle' | 'brass' | 'flute' | 'synth' | 'glock' | 'pad' | 'bassPluck' | 'bassSaw' | 'bassSub';

/** Everything the scheduler needs, in flat arrays indexed by step. Frequencies in Hz, 0 = nothing. */
export interface Pattern {
  song: SongId;
  variant: Variant;
  bpm: number;
  swing: number;
  echo: number;
  kick: Float32Array;
  snare: Float32Array;
  hat: Float32Array;
  hatOpen: Uint8Array;
  tom: Float32Array; // Hz
  bass: Float32Array;
  bassDur: Float32Array; // in 16ths
  bassVoice: Voice;
  bassVol: number;
  lead: Float32Array;
  leadDur: Float32Array;
  leadVoice: Voice;
  leadVol: number;
  /** chord notes: STEPS * 4 */
  chord: Float32Array;
  chordDur: Float32Array;
  chordVoice: Voice;
  chordVol: number;
  strum: number;
  /** counter-melody / sparkle */
  bell: Float32Array;
  bellVol: number;
  /** chase alarm stabs */
  stab: Float32Array;
}

function empty(def: SongDef, variant: Variant): Pattern {
  return {
    song: def.id,
    variant,
    bpm: def.bpm,
    swing: def.swing,
    echo: 0.18,
    kick: new Float32Array(STEPS),
    snare: new Float32Array(STEPS),
    hat: new Float32Array(STEPS),
    hatOpen: new Uint8Array(STEPS),
    tom: new Float32Array(STEPS),
    bass: new Float32Array(STEPS),
    bassDur: new Float32Array(STEPS),
    bassVoice: 'bassPluck',
    bassVol: 0.45,
    lead: new Float32Array(STEPS),
    leadDur: new Float32Array(STEPS),
    leadVoice: 'whistle',
    leadVol: 0.12,
    chord: new Float32Array(STEPS * 4),
    chordDur: new Float32Array(STEPS),
    chordVoice: 'pluck',
    chordVol: 0.06,
    strum: 0,
    bell: new Float32Array(STEPS),
    bellVol: 0.05,
    stab: new Float32Array(STEPS),
  };
}

/** Build one song variant into flat step arrays. Pure and deterministic. */
export function buildPattern(id: SongId, variant: Variant): Pattern {
  const def = SONGS[id];
  const chase = variant === 'chase';
  const calm = variant === 'calm';
  const scale = chase ? SCALES.minor : def.scale;
  const t = empty(def, variant);
  const note = (deg: number, oct = 0) => mtof(degree(def.root, scale, deg, oct));
  t.bpm = chase ? Math.round(def.bpm * 1.12) : calm ? Math.round(def.bpm * 0.8) : def.bpm;
  t.swing = chase ? 0 : def.swing;
  const setChord = (s: number, deg: number, dur: number, oct = 0, seventh = false) => {
    t.chord[s * 4] = note(deg, oct);
    t.chord[s * 4 + 1] = note(deg + 2, oct);
    t.chord[s * 4 + 2] = note(deg + 4, oct);
    t.chord[s * 4 + 3] = seventh ? note(deg + 6, oct) : 0;
    t.chordDur[s] = dur;
  };

  // ---- melody (8ths -> 16th steps, holds extend the previous note) ----
  const mel = parseMelody(def.melody);
  let last = -1;
  for (let i = 0; i < mel.length && i * 2 < STEPS; i++) {
    const tok = mel[i];
    const s = i * 2;
    if (tok === 'hold') {
      if (last >= 0) t.leadDur[last] += 2;
    } else if (tok === 'rest') last = -1;
    else {
      t.lead[s] = note(tok, chase ? 1 : 1);
      t.leadDur[s] = 1.7;
      last = s;
    }
  }

  // ---- per-style accompaniment ----
  for (let s = 0; s < STEPS; s++) {
    const bar = s >> 4;
    const b = s & 15;
    const deg = def.chords[bar];
    const beat = b % 4 === 0;
    switch (def.style) {
      case 'skip': {
        // bouncy shuffle: kick on 1 and the "a" of 2, light snare on 2 and 4, shaker 16ths, ukulele strums
        t.echo = 0.14;
        if (b === 0 || b === 7 || b === 8) t.kick[s] = b === 7 ? 0.45 : 0.75;
        if (b === 4 || b === 12) t.snare[s] = 0.32;
        t.hat[s] = b % 2 === 0 ? 0.07 : 0.045;
        if (b === 0 || b === 6 || b === 8 || b === 11 || b === 14) {
          t.bass[s] = note(deg + (b === 6 || b === 14 ? 4 : b === 11 ? 2 : 0), -2);
          t.bassDur[s] = 1.6;
        }
        if (b === 0 || b === 3 || b === 6 || b === 8 || b === 10 || b === 12 || b === 14) setChord(s, deg, 1.1, 0, b === 0);
        t.chordVoice = 'pluck';
        t.chordVol = 0.07;
        t.strum = 0.012;
        t.leadVoice = 'whistle';
        t.leadVol = 0.11;
        if (b === 0 && bar % 2 === 1) t.bell[s] = note(deg + 7, 1);
        if (b === 10 && bar % 4 === 3) t.bell[s] = note(deg + 9, 1);
        t.bassVoice = 'bassPluck';
        break;
      }
      case 'quest': {
        // driving 8th bass, tom fills, plucked string arpeggios, brass lead
        t.echo = 0.2;
        if (beat) t.kick[s] = b === 0 ? 0.9 : 0.6;
        if (b === 4 || b === 12) t.snare[s] = 0.5;
        if (b % 2 === 0) t.hat[s] = b % 4 === 2 ? 0.11 : 0.06;
        if (bar % 4 === 3 && b >= 12) t.tom[s] = [196, 165, 147, 110][b - 12];
        if (b % 2 === 0) {
          t.bass[s] = note(deg + (b % 8 === 6 ? 4 : 0), -2);
          t.bassDur[s] = 1.4;
        }
        t.bassVoice = 'bassSaw';
        t.bassVol = 0.34;
        // arpeggio: root, third, fifth, octave on the off 16ths
        if (b % 2 === 1) {
          const arp = [0, 2, 4, 7, 4, 2, 0, 2];
          t.bell[s] = note(deg + arp[(b >> 1) % 8], 0);
        }
        t.bellVol = 0.035;
        if (b === 0) setChord(s, deg, 15, -1);
        t.chordVoice = 'pad';
        t.chordVol = 0.03;
        t.leadVoice = 'brass';
        t.leadVol = 0.075;
        break;
      }
      case 'breeze': {
        // laid-back: soft kick, rim on 3, swung hats, flute, warm pad, glockenspiel sparkles
        t.echo = 0.26;
        if (b === 0 || b === 10) t.kick[s] = 0.5;
        if (b === 8) t.snare[s] = 0.22;
        if (b % 4 === 2) t.hat[s] = 0.06;
        if (b === 0 || b === 10) {
          t.bass[s] = note(deg, -2);
          t.bassDur[s] = b === 0 ? 7 : 5;
        }
        if (b === 7) {
          t.bass[s] = note(deg + 4, -2);
          t.bassDur[s] = 2;
        }
        t.bassVoice = 'bassSub';
        t.bassVol = 0.42;
        if (b === 0) setChord(s, deg, 15, 0, true);
        t.chordVoice = 'pad';
        t.chordVol = 0.035;
        if (b === 4 || b === 12) setChord(s, deg, 2, 1);
        t.leadVoice = 'flute';
        t.leadVol = 0.12;
        if (b === 14 && bar % 2 === 0) t.bell[s] = note(deg + 4, 2);
        if (b === 6 && bar % 2 === 1) t.bell[s] = note(deg + 2, 2);
        t.bellVol = 0.04;
        break;
      }
      case 'dash': {
        // four on the floor, offbeat open hats, 16th synth arps, octave bass
        t.echo = 0.24;
        if (beat) t.kick[s] = 0.9;
        if (b === 4 || b === 12) t.snare[s] = 0.55;
        if (b % 4 === 2) {
          t.hat[s] = 0.12;
          t.hatOpen[s] = 1;
        } else if (b % 2 === 1) t.hat[s] = 0.05;
        if (b % 2 === 0) {
          t.bass[s] = note(deg, b % 4 === 0 ? -2 : -1);
          t.bassDur[s] = 1.3;
        }
        t.bassVoice = 'bassSaw';
        t.bassVol = 0.36;
        const arp = [0, 2, 4, 7];
        t.bell[s] = note(deg + arp[b % 4], 1);
        t.bellVol = 0.025;
        if (b === 0) setChord(s, deg, 15, 0);
        t.chordVoice = 'pad';
        t.chordVol = 0.03;
        t.leadVoice = 'synth';
        t.leadVol = 0.07;
        break;
      }
    }
  }

  if (chase) {
    // the chase: everything pushes: kick on every beat + pickups, snare backbeat with a roll every 4 bars,
    // 16th bass, alarm stabs on bar starts and a staccato lead an octave up
    t.echo = 0.12;
    for (let s = 0; s < STEPS; s++) {
      const bar = s >> 4;
      const b = s & 15;
      const deg = def.chords[bar];
      t.kick[s] = b % 4 === 0 ? 0.95 : b === 14 ? 0.5 : 0;
      t.snare[s] = b === 4 || b === 12 ? 0.6 : bar % 4 === 3 && b >= 12 ? 0.25 + (b - 12) * 0.1 : 0;
      t.hat[s] = b % 2 === 0 ? 0.1 : 0.06;
      t.hatOpen[s] = 0;
      t.bass[s] = note(deg + (b % 4 === 3 ? 4 : 0), b % 2 === 0 ? -2 : -1);
      t.bassDur[s] = 0.85;
      t.stab[s] = b === 0 || (b === 6 && bar % 2 === 1) ? note(deg + 4, 1) : 0;
      if (t.lead[s] > 0) t.leadDur[s] = Math.min(t.leadDur[s], 1.2);
      t.tom[s] = bar % 2 === 1 && b === 14 ? 140 : bar % 2 === 1 && b === 15 ? 110 : 0;
    }
    t.bassVoice = 'bassSaw';
    t.bassVol = 0.34;
    t.leadVoice = def.style === 'breeze' ? 'flute' : 'brass';
    t.leadVol = 0.08;
  }

  if (calm) {
    for (let s = 0; s < STEPS; s++) {
      const b = s & 15;
      t.kick[s] = b === 0 ? 0.2 : 0;
      t.snare[s] = 0;
      t.tom[s] = 0;
      t.hat[s] = b % 8 === 4 ? 0.03 : 0;
      t.hatOpen[s] = 0;
      if (b % 8 !== 0) t.bass[s] = 0;
      else t.bassDur[s] = 7;
      // keep the melody on strong 8ths only
      if (b % 4 !== 0) t.lead[s] = 0;
      t.stab[s] = 0;
    }
    t.bassVoice = 'bassSub';
    t.leadVol *= 0.75;
    t.echo = Math.max(t.echo, 0.3);
  }
  return t;
}

/** Short one-shot jingles: [time (beats), midi, duration (beats), voice]. */
export interface Jingle {
  bpm: number;
  notes: [number, number, number, Voice][];
}

/** The finish fanfare: a rising run and a ta-da chord in the song's key. */
export function fanfare(id: SongId): Jingle {
  const d = SONGS[id];
  const n = (deg: number, oct = 0) => degree(d.root, d.scale, deg, oct);
  const notes: Jingle['notes'] = [];
  [0, 2, 4, 7].forEach((deg, i) => notes.push([i * 0.25, n(deg, 1), 0.3, 'glock']));
  notes.push([1, n(4, 1), 0.5, 'brass'], [1.5, n(7, 1), 2.5, 'brass']);
  for (const deg of [0, 2, 4, 7]) notes.push([1.5, n(deg, 0), 2.5, 'pad']);
  notes.push([1.5, n(0, -2), 2, 'bassSub']);
  return { bpm: 140, notes };
}

/** Out of hearts (endless): a deflating wah-wah. */
export function sadJingle(): Jingle {
  return {
    bpm: 100,
    notes: [
      [0, 67, 0.7, 'brass'],
      [0.75, 66, 0.7, 'brass'],
      [1.5, 65, 0.7, 'brass'],
      [2.25, 64, 1.6, 'brass'],
    ],
  };
}

/** Home for dinner: a cozy music-box lullaby in F, about 8 s. */
export function endingJingle(): Jingle {
  const root = 65;
  const sc = SCALES.major;
  const n = (deg: number, oct = 0) => degree(root, sc, deg, oct);
  const mel = [4, 2, 0, 2, 4, 4, 4, -99, 3, 3, 4, 3, 2, -99, 0, 2, 4, 7, 6, 4, 2, 0];
  const notes: Jingle['notes'] = [];
  let t = 0;
  for (let i = 0; i < mel.length; i++) {
    if (mel[i] !== -99) notes.push([t, n(mel[i], 1), i === mel.length - 1 ? 3 : 0.9, 'glock']);
    t += i === mel.length - 1 ? 0 : 0.5;
  }
  const chords = [0, 3, 4, 0];
  chords.forEach((c, i) => {
    for (const k of [0, 2, 4]) notes.push([i * 2.75, n(c + k, 0), 2.6, 'pad']);
    notes.push([i * 2.75, n(c, -1), 2.5, 'bassSub']);
  });
  return { bpm: 92, notes };
}

/** Song id for a stage's `music` field (unknown ids fall back to the meadow tune). */
export function songFor(music: string | undefined): SongId {
  return music && music in SONGS ? (music as SongId) : 'meadow';
}
