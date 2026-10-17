/**
 * L7 Audio: procedural 90 bpm lo-fi "heist jazz" loop (GDD 12). Swung eighths over a ii-V-I-VI walk.
 * Layers: bass + brushes (always), soft keys (calm), sneaky pizzicato (TELEGRAPH / LOOK), full band with
 * kick and louder keys (room event). Ducks under the "hm?" sting. Scheduled with a short look-ahead timer.
 *
 * W1-AUDIO styles: 'boss' (Saturday: 116 bpm, straight-ish, brass stabs), 'lullaby' (Sunday Napper: 72 bpm,
 * music-box celesta, no kick), and the theme layer: S1 Christmas adds sleigh bells + celesta. The same
 * scheduler renders the clip's 12 s music sting offline (scheduleSpan).
 */
import type { RoomTheme } from '../types';
import { midiHz, noise, tone, type SynthGraph } from './synth';
import type { MusicMode } from './sfx-map';

export const BPM = 90;
const SWING = 2 / 3;

export type MusicStyle = 'jazz' | 'boss' | 'lullaby';
export interface MusicFlavor {
  style: MusicStyle;
  theme?: RoomTheme;
}
export const STYLE_BPM: Record<MusicStyle, number> = { jazz: BPM, boss: 116, lullaby: 72 };
/** Off-beat eighth position: swung jazz, a lighter swing for the boss, straight lullaby. */
export const STYLE_SWING: Record<MusicStyle, number> = { jazz: SWING, boss: 0.6, lullaby: 0.5 };

/** Layer indexes. */
export const L_BASS = 0;
export const L_BRUSH = 1;
export const L_KEYS = 2;
export const L_PIZZ = 3;
export const L_KICK = 4;
export const L_BRASS = 5;
export const L_SLEIGH = 6;
export const L_CELESTA = 7;
const N_LAYERS = 8;

/** Style/theme mask over the layer gains. */
export function layerMask(f: MusicFlavor): number[] {
  const xmas = f.theme === 'xmas';
  const m = [1, 1, 1, 1, 1, 0, xmas ? 1 : 0, xmas ? 1 : 0];
  if (f.style === 'boss') m[L_BRASS] = 1;
  if (f.style === 'lullaby') {
    m[L_BRUSH] = 0.35;
    m[L_KICK] = 0;
    m[L_PIZZ] = 0.6;
    m[L_KEYS] = 0.6;
    m[L_CELESTA] = 1;
  }
  return m;
}
const LOOKAHEAD_S = 0.25;
const TIMER_MS = 60;

/** Four bars: Dm7 | G7 | Cmaj7 | A7 (MIDI notes, bass root octave 2). */
export const CHORDS: readonly { root: number; tones: readonly number[] }[] = [
  { root: 38, tones: [62, 65, 69, 72] },
  { root: 43, tones: [59, 62, 65, 67] },
  { root: 36, tones: [60, 64, 67, 71] },
  { root: 45, tones: [61, 64, 67, 69] },
];

/** Walking bass, one bar per chord, each bar ending on a chromatic approach to the next root. */
export const BASS: readonly (readonly number[])[] = [
  [38, 41, 45, 44], // D F A G# -> G
  [43, 47, 50, 49], // G B D C# -> C
  [48, 43, 40, 46], // C G E Bb -> A
  [45, 43, 40, 39], // A G E Eb -> D
];

export function walkingBass(bar: number): readonly number[] {
  return BASS[((bar % BASS.length) + BASS.length) % BASS.length];
}

/** Layer gains per mode: [bass, brushes, keys, pizz, kick, brass, sleigh, celesta]. */
export const LAYER_GAINS: Record<MusicMode, readonly number[]> = {
  calm: [1, 1, 0.6, 0, 0, 0.35, 0.7, 1],
  sneaky: [0.9, 0.7, 0.25, 1, 0, 0.5, 0.4, 0.5],
  full: [1, 1, 1, 0.6, 1, 1, 1, 1],
  quiet: [0.25, 0.25, 0.2, 0, 0, 0, 0.2, 0.4],
};

/** Pizzicato pattern per bar: chord-tone index per eighth (-1 = rest). Tiptoe staccato. */
const PIZZ = [0, -1, 2, 1, -1, 3, 2, -1];

export class MusicLoop {
  private readonly bus: GainNode;
  private readonly duckGain: GainNode;
  private readonly layers: GainNode[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0; // eighth-note counter (8 per bar)
  private mode: MusicMode = 'calm';
  private flavor: MusicFlavor = { style: 'jazz', theme: 'default' };
  private mask: number[] = layerMask(this.flavor);

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
    private readonly track?: (n: AudioScheduledSourceNode) => void,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.55;
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.bus.connect(this.duckGain);
    this.duckGain.connect(out);
    const mask = layerMask(this.flavor);
    this.layers = Array.from({ length: N_LAYERS }, (_, i) => {
      const g = ctx.createGain();
      g.gain.value = LAYER_GAINS.calm[i] * mask[i];
      g.connect(this.bus);
      return g;
    });
  }

  get style(): MusicFlavor {
    return this.flavor;
  }

  /** Pick the loop for the room: boss, lullaby or jazz, plus the theme layer. */
  setFlavor(f: MusicFlavor): void {
    if (f.style === this.flavor.style && (f.theme ?? 'default') === (this.flavor.theme ?? 'default')) return;
    this.flavor = { style: f.style, theme: f.theme ?? 'default' };
    this.mask = layerMask(this.flavor);
    this.applyGains(0.3);
  }

  private get beat(): number {
    return 60 / STYLE_BPM[this.flavor.style];
  }

  private applyGains(tc: number): void {
    const t = this.ctx.currentTime;
    const gains = LAYER_GAINS[this.mode];
    const mask = layerMask(this.flavor);
    // pizzicato fades in quickly (the turn), the band swells more slowly
    this.layers.forEach((g, i) => g.gain.setTargetAtTime(gains[i] * mask[i], t, i === L_PIZZ ? Math.min(tc, 0.08) : tc));
  }

  /**
   * Offline / scheduled rendering: schedule every eighth in [t0, t1) in the given mode (no timer). Used for the
   * clip's music sting. Gains are set immediately (no fades), the caller fades the output bus.
   */
  scheduleSpan(t0: number, t1: number, mode: MusicMode = 'full', swellAt?: number): void {
    this.mode = mode;
    const gains = LAYER_GAINS[mode];
    const full = LAYER_GAINS.full;
    const mask = this.mask;
    this.layers.forEach((g, i) => {
      g.gain.setValueAtTime(gains[i] * mask[i], Math.max(0, t0));
      if (swellAt !== undefined && swellAt > t0 && swellAt < t1) {
        g.gain.setValueAtTime(gains[i] * mask[i], swellAt);
        g.gain.linearRampToValueAtTime(full[i] * mask[i], swellAt + 0.3);
      }
    });
    let t = t0;
    let step = 0;
    const swing = STYLE_SWING[this.flavor.style];
    while (t < t1) {
      this.scheduleEighth(step, t);
      t += step % 2 === 0 ? this.beat * swing : this.beat * (1 - swing);
      step = (step + 1) % (8 * CHORDS.length);
    }
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.pump(), TIMER_MS);
    this.pump();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyGains(0.35);
  }

  /** Duck the whole loop under a sting for `seconds`, then recover. */
  duck(seconds = 0.7, depth = 0.3): void {
    const t = this.ctx.currentTime;
    const p = this.duckGain.gain;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(depth, t, 0.03);
    p.setTargetAtTime(1, t + seconds, 0.3);
  }

  dispose(): void {
    this.stop();
    try {
      this.duckGain.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private pump(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    // after a long suspend (tab hidden) skip ahead instead of bursting every missed note
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < horizon) {
      this.scheduleEighth(this.step, this.nextTime);
      const inBeat = this.step % 2;
      const swing = STYLE_SWING[this.flavor.style];
      this.nextTime += inBeat === 0 ? this.beat * swing : this.beat * (1 - swing);
      this.step = (this.step + 1) % (8 * CHORDS.length);
    }
  }

  private graph(layer: number): SynthGraph {
    return { ctx: this.ctx, out: this.layers[layer], noise: this.noiseBuf, track: this.track };
  }

  private scheduleEighth(step: number, t: number): void {
    const BEAT = this.beat;
    const style = this.flavor.style;
    const bar = Math.floor(step / 8);
    const e = step % 8; // eighth within the bar
    const beat = e >> 1;
    const off = e & 1;
    const chord = CHORDS[bar];
    // bass: walking quarters
    if (!off && (style !== 'lullaby' || beat === 0 || beat === 2)) {
      const note = walkingBass(bar)[style === 'lullaby' ? 0 : beat];
      tone(this.graph(0), t, {
        type: 'triangle',
        freq: midiHz(note),
        peak: 0.32,
        attack: 0.01,
        decay: BEAT * 0.9,
        filter: { type: 'lowpass', freq: 700 },
      });
    }
    // brushes: a swish every eighth, accent on 2 and 4
    const accent = !off && (beat === 1 || beat === 3);
    noise(this.graph(1), t, {
      peak: accent ? 0.07 : off ? 0.035 : 0.025,
      attack: accent ? 0.02 : 0.008,
      decay: accent ? 0.16 : 0.07,
      filter: { type: 'bandpass', freq: accent ? 3500 : 6000, q: 0.8 },
      seed: step,
    });
    // keys: Charleston comp on beat 1 and the "and" of 2
    if (e === 0 || e === 3) {
      for (const n of chord.tones) {
        tone(this.graph(2), t, { type: 'sine', freq: midiHz(n), peak: 0.035, attack: 0.01, hold: 0.06, decay: e === 0 ? 0.5 : 0.25 });
        tone(this.graph(2), t, { type: 'triangle', freq: midiHz(n + 12), peak: 0.008, decay: 0.15 });
      }
    }
    // pizzicato: staccato chord tones up an octave
    const idx = PIZZ[e];
    if (idx >= 0) {
      tone(this.graph(3), t, {
        type: 'triangle',
        freq: midiHz(chord.tones[idx] + 12),
        peak: 0.09,
        attack: 0.003,
        decay: 0.09,
        filter: { type: 'lowpass', freq: 2400 },
      });
    }
    // kick (full band) on 1 and 3
    if (!off && (beat === 0 || beat === 2)) {
      tone(this.graph(4), t, { freq: 120, freqEnd: 45, peak: 0.35, decay: 0.18 });
    }
    // brass stabs (boss): the chord, short and punchy, on the "and" of 2 and on 4
    if (this.mask[L_BRASS] > 0 && (e === 3 || e === 6)) {
      for (const n of chord.tones.slice(0, 3)) {
        for (const det of [-8, 7])
          tone(this.graph(L_BRASS), t, {
            type: 'sawtooth',
            freq: midiHz(n),
            detune: det,
            attack: 0.02,
            hold: 0.05,
            decay: 0.14,
            peak: 0.022,
            filter: { type: 'lowpass', freq: 700, freqEnd: 2600, q: 1 },
          });
      }
    }
    // sleigh bells (xmas): a shake every eighth, accent on the beat
    for (let i = 0; i < 3 && this.mask[L_SLEIGH] > 0; i++) {
      tone(this.graph(L_SLEIGH), t + i * 0.012, { freq: 4200 + ((step * 7 + i * 13) % 9) * 220, peak: off ? 0.01 : 0.018, decay: 0.05 });
    }
    if (this.mask[L_SLEIGH] > 0) noise(this.graph(L_SLEIGH), t, { peak: off ? 0.012 : 0.022, decay: 0.06, filter: { type: 'bandpass', freq: 8000, q: 2 }, seed: step + 101 });
    // celesta (xmas, lullaby): a music-box arpeggio two octaves up
    const arp = style === 'lullaby' ? [0, 2, 1, 3, 2, 1, 3, 2] : [0, -1, 2, -1, 1, -1, 3, -1];
    const ai = arp[e];
    if (ai >= 0 && this.mask[L_CELESTA] > 0) {
      const hz = midiHz(chord.tones[ai] + 24);
      tone(this.graph(L_CELESTA), t, { freq: hz, peak: 0.03, attack: 0.003, decay: 0.45 });
      tone(this.graph(L_CELESTA), t, { freq: hz * 4.01, peak: 0.006, decay: 0.12 });
    }
  }
}
