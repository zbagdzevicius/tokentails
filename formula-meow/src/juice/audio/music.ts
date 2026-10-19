/**
 * Adaptive race music (GDD 10): 128 BPM synthwave / chiptune, one song (key, chords, patterns) per track theme.
 * Layers: kick, snare, hats, saw bass, gated pad, square arpeggio (through a filter), lead, and a heartbeat kick.
 *
 * Reacts to the race (`musicMix`, pure and unit-tested):
 *   5th–8th: full band plus lead (the chase) · 2nd–4th: no lead, the arpeggio filter opens 800 Hz → 4 kHz as you climb
 *   1st: drums drop to hats plus a heartbeat kick, the lead comes back an octave up (protect the lead)
 *   final lap: 140 BPM, +2 semitones, a riser on the lap line; the closing stretch doubles the hats.
 * The countdown is a pad drone with a heartbeat; the band lands on the GO downbeat. Look-ahead scheduler (100 ms).
 * Sidechain pump on the bass and pad from every kick (the synthwave "breathing").
 */
import { midiHz, noise, tone, type SynthGraph } from './synth';
import type { VoiceBudget } from './sfx';

export type Scale = readonly number[];
export const MAJOR: Scale = [0, 2, 4, 5, 7, 9, 11];
export const MINOR: Scale = [0, 2, 3, 5, 7, 8, 10];
export const DORIAN: Scale = [0, 2, 3, 5, 7, 9, 10];

export interface Song {
  name: string;
  bpm: number;
  /** MIDI note of the key root (bass octave) */
  root: number;
  scale: Scale;
  /** chord roots per bar as scale degrees (4 bars) */
  prog: readonly number[];
  /** 16 steps: semitones above the chord root, -1 rest */
  bass: readonly number[];
  /** 16 steps: index into the chord tones [r, 3, 5, r', 3', 5'] */
  arp: readonly number[];
  /** 32 steps (2 bars): scale degree above root + 24, -1 rest */
  lead: readonly number[];
  leadWave: OscillatorType;
  arpWave: OscillatorType;
  padWave: OscillatorType;
}

const R = -1;

export const SONGS: readonly Song[] = [
  {
    name: 'Kitchen Counter Rush',
    bpm: 128,
    root: 41, // F2
    scale: MAJOR,
    prog: [0, 4, 5, 3], // I V vi IV
    bass: [0, R, 12, R, 0, R, 12, 0, R, 0, 12, R, 0, R, 7, 12],
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 0, 2, 4, 3, 2, 4, 5, 4],
    lead: [4, R, 4, 5, 7, R, 5, 4, 2, R, 4, R, 5, 4, 2, 0, 4, R, 4, 5, 7, R, 9, 7, 8, R, 7, R, 5, R, 4, R],
    leadWave: 'square',
    arpWave: 'square',
    padWave: 'triangle',
  },
  {
    name: 'Kaunas Neon Nights',
    bpm: 128,
    root: 45, // A2
    scale: MINOR,
    prog: [0, 5, 2, 6], // i VI III VII
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
    arp: [0, 2, 3, 2, 1, 2, 3, 5, 0, 2, 3, 2, 4, 3, 2, 1],
    lead: [7, R, R, 6, 4, R, 2, R, 4, R, R, R, 2, 1, 0, R, 7, R, R, 9, 8, R, 7, R, 6, R, 4, R, 5, R, 6, R],
    leadWave: 'sawtooth',
    arpWave: 'square',
    padWave: 'sawtooth',
  },
  {
    name: 'Spin Cycle',
    bpm: 128,
    root: 36, // C2
    scale: MAJOR,
    prog: [0, 5, 3, 4], // I vi IV V
    bass: [0, R, 0, 12, R, 12, 0, R, 0, R, 0, 12, R, 12, 7, R],
    arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3],
    lead: [0, 2, 4, 7, R, 4, R, 2, 3, R, 5, R, 4, R, 2, R, 0, 2, 4, 7, R, 9, R, 7, 8, R, 7, R, 4, R, R, R],
    leadWave: 'square',
    arpWave: 'triangle',
    padWave: 'triangle',
  },
  {
    name: 'Yarn Canyon Sunset',
    bpm: 128,
    root: 38, // D2
    scale: DORIAN,
    prog: [0, 3, 0, 6], // i IV i VII
    bass: [0, R, R, 0, 12, R, 0, R, 0, R, R, 0, 12, R, 10, R],
    arp: [0, 2, 1, 3, 2, 4, 3, 5, 0, 2, 1, 3, 2, 4, 3, 2],
    lead: [0, R, 3, R, 4, R, 3, 2, 0, R, R, R, 6, R, 5, 4, 0, R, 3, R, 4, R, 7, R, 6, R, 4, R, 3, R, 1, R],
    leadWave: 'sawtooth',
    arpWave: 'square',
    padWave: 'sawtooth',
  },
];

export function songFor(theme: number): Song {
  return SONGS[((theme % SONGS.length) + SONGS.length) % SONGS.length];
}

/** Semitones of a scale degree above the root (degrees past 6 wrap into the next octave). */
export function degreeSemis(scale: Scale, d: number): number {
  const o = Math.floor(d / 7);
  return scale[((d % 7) + 7) % 7] + 12 * o;
}

/** The six arpeggio tones (root, third, fifth, then an octave up) for one bar, in semitones above the key root. */
export function chordTones(song: Song, bar: number): number[] {
  const d = song.prog[((bar % song.prog.length) + song.prog.length) % song.prog.length];
  const t = [degreeSemis(song.scale, d), degreeSemis(song.scale, d + 2), degreeSemis(song.scale, d + 4)];
  return [...t, ...t.map((x) => x + 12)];
}

export type MusicMode = 'off' | 'pre' | 'race' | 'results';

export interface MusicMix {
  kick: number;
  snare: number;
  hats: number;
  bass: number;
  pad: number;
  arp: number;
  lead: number;
  heart: number;
  /** arpeggio low-pass cutoff (Hz) */
  arpCut: number;
  /** lead octave shift (0 or 12) */
  leadUp: number;
  /** 16th hats (closing stretch) */
  hats16: boolean;
}

/** Pure: race situation → layer mix (GDD 10 "reacts to race position"). */
export function musicMix(mode: MusicMode, place: number, finalLap: boolean, closing: boolean, won = false): MusicMix {
  const m: MusicMix = { kick: 0, snare: 0, hats: 0, bass: 0, pad: 0, arp: 0, lead: 0, heart: 0, arpCut: 1600, leadUp: 0, hats16: false };
  if (mode === 'off') return m;
  if (mode === 'pre') return { ...m, pad: 0.7, heart: 0.8, arpCut: 900 };
  if (mode === 'results') return { ...m, hats: 0.6, bass: 0.7, pad: 1, arp: 0.6, lead: won ? 0.8 : 0, kick: won ? 1 : 0, arpCut: 2400, leadUp: won ? 12 : 0 };
  if (place <= 1) {
    // protect the lead: drums drop, heartbeat, lead an octave up
    Object.assign(m, { hats: 1, heart: 1, bass: 1, pad: 1, arp: 1, lead: 1, arpCut: 4000, leadUp: 12 });
  } else if (place <= 4) {
    // 4th → 800 Hz, 3rd → 2.4 kHz, 2nd → 4 kHz
    Object.assign(m, { kick: 1, snare: 1, hats: 1, bass: 1, pad: 1, arp: 1, lead: 0, arpCut: 800 + ((4 - place) / 2) * 3200 });
  } else {
    // the chase: everything
    Object.assign(m, { kick: 1, snare: 1, hats: 1, bass: 1, pad: 0.8, arp: 0.8, lead: 1, arpCut: 1600 });
  }
  if (finalLap) {
    m.hats = Math.max(m.hats, 1);
    m.pad = Math.min(1, m.pad + 0.2);
    m.hats16 = closing;
  }
  return m;
}

const LOOKAHEAD = 0.1;
const LAYERS = ['kick', 'snare', 'hats', 'bass', 'pad', 'arp', 'lead', 'heart'] as const;
type Layer = (typeof LAYERS)[number];

export class Music {
  private song: Song = SONGS[0];
  private readonly bus: Record<Layer, GainNode>;
  private readonly arpF: BiquadFilterNode;
  private readonly pump: GainNode;
  private readonly g: SynthGraph;
  private mix: MusicMix = musicMix('off', 8, false, false);
  private mode: MusicMode = 'off';
  private step = 0;
  private next = 0;
  private bpm = 128;
  private key = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    noiseBuf: AudioBuffer,
    private readonly budget: VoiceBudget,
  ) {
    // pump (sidechain) sits on the bass + pad
    this.pump = ctx.createGain();
    this.pump.connect(out);
    this.arpF = ctx.createBiquadFilter();
    this.arpF.type = 'lowpass';
    this.arpF.Q.value = 4;
    this.arpF.frequency.value = 1600;
    this.arpF.connect(out);
    const mk = (dest: AudioNode) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(dest);
      return g;
    };
    this.bus = {
      kick: mk(out),
      snare: mk(out),
      hats: mk(out),
      bass: mk(this.pump),
      pad: mk(this.pump),
      arp: mk(this.arpF),
      lead: mk(out),
      heart: mk(out),
    };
    this.g = { ctx, out, noise: noiseBuf };
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setSong(theme: number): void {
    this.song = songFor(theme);
    this.bpm = this.song.bpm;
    this.key = 0;
  }

  /** Countdown: drone + a 60 BPM heartbeat locked to the 1 s countdown (call again on "3" to re-sync). */
  pre(): void {
    this.mode = 'pre';
    this.bpm = 60;
    this.key = 0;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.05;
    this.apply(musicMix('pre', 8, false, false));
  }

  /** GO: the band lands on this downbeat with a crash. */
  go(): void {
    this.mode = 'race';
    this.bpm = this.song.bpm;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.02;
    noise({ ...this.g, out: this.bus.hats }, this.next, { peak: 0.5, decay: 1.4, filter: { type: 'highpass', freq: 5000 }, seed: 71 });
    this.bus.hats.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
  }

  finalLap(): void {
    this.bpm = 140;
    this.key = 2;
    // riser across the line: two bars of rising filtered noise and a pitch sweep
    const t = this.ctx.currentTime;
    const bar = (60 / this.bpm) * 4;
    noise({ ...this.g, out: this.bus.hats }, t, { peak: 0.35, attack: bar * 1.6, decay: 0.2, filter: { type: 'bandpass', freq: 300, freqEnd: 7000, q: 2 }, seed: 73 });
    tone({ ...this.g, out: this.bus.lead }, t, { type: 'sawtooth', freq: 110, freqEnd: 880, attack: bar * 1.6, decay: 0.15, peak: 0.08, filter: { type: 'lowpass', freq: 3000 } });
  }

  results(won: boolean): void {
    this.mode = 'results';
    this.bpm = this.song.bpm;
    this.key = 0;
    this.apply(musicMix('results', won ? 1 : 8, false, false, won));
  }

  stop(): void {
    this.mode = 'off';
    this.apply(musicMix('off', 8, false, false));
  }

  /** Called every frame while racing. */
  setRace(place: number, finalLap: boolean, closing: boolean): void {
    if (this.mode !== 'race') return;
    this.apply(musicMix('race', place, finalLap, closing));
  }

  get currentMode(): MusicMode {
    return this.mode;
  }

  private apply(m: MusicMix): void {
    const t = this.ctx.currentTime;
    for (const l of LAYERS) if (Math.abs(this.mix[l] - m[l]) > 0.001) this.bus[l].gain.setTargetAtTime(m[l] * LEVEL[l], t, 0.25);
    if (this.mix.arpCut !== m.arpCut) this.arpF.frequency.setTargetAtTime(m.arpCut, t, 0.4);
    this.mix = m;
  }

  private schedule(): void {
    if (this.mode === 'off') return;
    const ctx = this.ctx;
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.02; // tab was asleep
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      this.play(this.step, this.next);
      this.next += 60 / this.bpm / 4;
      this.step++;
    }
  }

  private play(step: number, t: number): void {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const song = this.song;
    const m = this.mix;
    const spb = 60 / this.bpm / 4; // one 16th
    const root = song.root + this.key;
    const tones = chordTones(song, bar);
    const g = this.g;
    const admit = (prio: number, dur: number) => this.budget.admit(t, prio, dur);
    const half = this.mode === 'results';

    if (m.kick > 0 && (half ? s16 === 0 || s16 === 10 : s16 % 4 === 0) && admit(2, 0.2)) {
      tone({ ...g, out: this.bus.kick }, t, { freq: 150, freqEnd: 42, glide: 0.1, peak: 0.9, decay: 0.2 });
      // sidechain pump
      this.pump.gain.cancelScheduledValues(t);
      this.pump.gain.setValueAtTime(0.35, t);
      this.pump.gain.linearRampToValueAtTime(1, t + spb * 2.6);
    }
    const pre = this.mode === 'pre';
    const lub = pre ? s16 % 4 === 0 : s16 % 8 === 0;
    const dub = pre ? s16 % 4 === 1 : s16 % 8 === 3;
    if (m.heart > 0 && (lub || dub) && admit(1, 0.2)) {
      tone({ ...g, out: this.bus.heart }, t, { freq: 90, freqEnd: 45, glide: 0.08, peak: lub ? 0.8 : 0.55, decay: 0.16, filter: { type: 'lowpass', freq: 300 } });
    }
    if (m.snare > 0 && (s16 === 4 || s16 === 12) && admit(2, 0.2)) {
      noise({ ...g, out: this.bus.snare }, t, { peak: 0.5, decay: 0.16, filter: { type: 'bandpass', freq: 1900, q: 0.9 }, seed: step });
      tone({ ...g, out: this.bus.snare }, t, { type: 'triangle', freq: 220, freqEnd: 160, peak: 0.25, decay: 0.08 });
    }
    // fill on the 4th bar
    if (m.snare > 0 && bar % 4 === 3 && s16 >= 13 && admit(1, 0.1)) noise({ ...g, out: this.bus.snare }, t, { peak: 0.25 + (s16 - 13) * 0.08, decay: 0.08, filter: { type: 'bandpass', freq: 2200, q: 1 }, seed: step * 3 });
    if (m.hats > 0 && (m.hats16 || s16 % 2 === 1) && admit(1, 0.05)) {
      const open = s16 === 14 && !m.hats16;
      noise({ ...g, out: this.bus.hats }, t, { peak: open ? 0.22 : 0.14, decay: open ? 0.14 : 0.035, filter: { type: 'highpass', freq: 7500 }, seed: step * 7 });
    }
    // saw bass
    const b = song.bass[s16];
    if (m.bass > 0 && b >= 0 && admit(2, spb)) {
      const n = root + tones[0] + b;
      tone({ ...g, out: this.bus.bass }, t, { type: 'sawtooth', freq: midiHz(n), peak: 0.32, attack: 0.004, hold: spb * 0.5, decay: spb * 0.6, filter: { type: 'lowpass', freq: 520, freqEnd: 260, q: 3 } });
    }
    // gated pad: a chord per bar, chopped in 16ths
    if (m.pad > 0 && s16 % 2 === 0 && admit(1, spb * 2)) {
      for (let i = 0; i < 3; i++) {
        tone({ ...g, out: this.bus.pad }, t, {
          type: song.padWave,
          freq: midiHz(root + 24 + tones[i]),
          detune: (i - 1) * 7,
          peak: 0.05,
          attack: 0.01,
          hold: spb * 0.8,
          decay: spb * 0.7,
          filter: { type: 'lowpass', freq: 1800 },
        });
      }
    }
    // arpeggio
    if (m.arp > 0 && admit(1, spb)) {
      const n = root + 36 + tones[song.arp[s16] % tones.length];
      tone({ ...g, out: this.bus.arp }, t, { type: song.arpWave, freq: midiHz(n), peak: 0.09, attack: 0.003, decay: spb * 0.9 });
    }
    // lead
    const ld = song.lead[(bar % 2) * 16 + s16];
    if (m.lead > 0 && ld >= 0 && admit(1, spb * 2)) {
      let len = 1;
      while (len < 4 && song.lead[((bar % 2) * 16 + s16 + len) % 32] === R) len++;
      const n = root + 36 + degreeSemis(song.scale, ld) + m.leadUp;
      tone({ ...g, out: this.bus.lead }, t, {
        type: song.leadWave,
        freq: midiHz(n),
        peak: 0.08,
        attack: 0.01,
        hold: spb * len * 0.6,
        decay: spb * len * 0.5,
        vib: len > 1 ? { hz: 5.5, cents: 14 } : undefined,
        filter: { type: 'lowpass', freq: 3200, q: 1 },
      });
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Layer levels at mix 1. */
const LEVEL: Record<Layer, number> = { kick: 0.9, snare: 0.7, hats: 0.6, bass: 0.8, pad: 0.8, arp: 0.7, lead: 0.75, heart: 0.9 };
