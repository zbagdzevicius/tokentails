/**
 * W1-AUDIO: synth recipes for the v5 events (slide, stack, pull, topple, puddle, Roomba, framed, wish, box,
 * Napper, mirror, webcam) and the prop-specific sounds of kinds 16..63 (balloon pop, flour poof, popcorn,
 * champagne, cups, paper, gift box, tray, tree, bubble wrap). Cartoon first: crunchy, bouncy, never painful.
 * Nothing here runs at module top level.
 */
import type { Cue, SpecialSound } from './sfx-map';
import { bell, brass, noise, purr, tone, type SynthGraph } from './synth';
import { mrrp, snoreVoice } from './voices';

/** Rising clinks: one per stack item, material-coloured, 2 semitones apart. */
export function stackClinks(g: SynthGraph, c: Cue, t: number, p: number, v: number, r: () => number, seed: number): void {
  const n = Math.min(8, Math.max(1, c.items ?? 3));
  for (let i = 0; i < n; i++) {
    const tt = t + i * 0.075;
    const up = p * Math.pow(2, (i * 2) / 12);
    switch (c.special ?? c.material) {
      case 'glass':
      case 'champagne':
        bell(g, tt, (2600 + r() * 300) * up, 0.08 * v, 0.25);
        break;
      case 'cups':
      case 'plastic':
        tone(g, tt, { freq: 700 * up, freqEnd: 420 * up, peak: 0.16 * v, decay: 0.07 });
        noise(g, tt, { peak: 0.06 * v, decay: 0.02, filter: { type: 'bandpass', freq: 2400, q: 3 }, seed: seed + i });
        break;
      case 'paper':
      case 'gift':
        noise(g, tt, { peak: 0.14 * v, decay: 0.06, filter: { type: 'bandpass', freq: 700 * up, q: 2 }, seed: seed + i });
        tone(g, tt, { freq: 160 * up, freqEnd: 100, peak: 0.1 * v, decay: 0.06 });
        break;
      case 'fabric':
        noise(g, tt, { peak: 0.12 * v, decay: 0.08, filter: { type: 'lowpass', freq: 500 * up }, seed: seed + i });
        break;
      case 'food':
      case 'popcorn':
        noise(g, tt, { peak: 0.12 * v, decay: 0.05, filter: { type: 'bandpass', freq: 1200 * up, q: 2 }, seed: seed + i });
        break;
      default: // ceramic plate clink
        tone(g, tt, { type: 'triangle', freq: 1500 * up, peak: 0.1 * v, decay: 0.08 });
        tone(g, tt, { freq: 1500 * 2.7 * up, peak: 0.03 * v, decay: 0.04 });
    }
  }
}

export function slide(g: SynthGraph, c: Cue, t: number, p: number, v: number, seed: number): void {
  // rubbery skid: a buzzy saw rubbing down through a narrow band, with a scuff of noise
  tone(g, t, { type: 'sawtooth', freq: 520 * p, freqEnd: 300 * p, attack: 0.01, hold: 0.12, decay: 0.14, peak: 0.07 * v, filter: { type: 'bandpass', freq: 1100, q: 4 }, vib: { hz: 28, cents: 60 } });
  noise(g, t, { peak: 0.08 * v, attack: 0.02, decay: 0.22, filter: { type: 'bandpass', freq: 1600, freqEnd: 900, q: 2 }, seed });
  // the "wheee" squeak on top
  const wv = 1 + (c.variant - 1) * 0.06;
  tone(g, t + 0.05, { freq: 900 * wv * p, freqEnd: 1650 * wv * p, glide: 0.18, attack: 0.03, hold: 0.12, decay: 0.16, peak: 0.07 * v, vib: { hz: 7, cents: 40 } });
}

export function pullCloth(g: SynthGraph, c: Cue, t: number, v: number, seed: number): void {
  const heavy = Math.min(1, (c.items ?? 0) / 4);
  noise(g, t, { peak: (0.18 + heavy * 0.08) * v, attack: 0.05, decay: 0.3, filter: { type: 'bandpass', freq: 450, freqEnd: 2600, q: 1.2 }, seed });
  // the rip: a quick zipper of high crackles
  for (let i = 0; i < 9; i++)
    noise(g, t + 0.18 + i * 0.022, { peak: 0.1 * v, decay: 0.015, filter: { type: 'highpass', freq: 2500 + i * 150 }, seed: seed + i });
}

export function pullCable(g: SynthGraph, t: number, p: number, v: number, seed: number): void {
  // twang: a plucked low string with a bending "boing"
  tone(g, t, { type: 'sawtooth', freq: 110 * p, freqEnd: 82 * p, attack: 0.003, decay: 0.45, peak: 0.14 * v, filter: { type: 'lowpass', freq: 2400, freqEnd: 300 } });
  tone(g, t, { freq: 330 * p, freqEnd: 180 * p, glide: 0.3, attack: 0.003, decay: 0.35, peak: 0.12 * v, vib: { hz: 11, cents: 80 } });
  // the lamp wobbles: metal tinks rocking left-right
  for (let i = 0; i < 4; i++) {
    const tt = t + 0.2 + i * 0.11;
    tone(g, tt, { type: 'triangle', freq: (i % 2 ? 1900 : 2100) * p, peak: (0.07 - i * 0.012) * v, decay: 0.08 });
  }
  noise(g, t, { peak: 0.06 * v, decay: 0.05, filter: { type: 'bandpass', freq: 3000, q: 2 }, seed });
}

/** A Christmas-tree crash: a thud, a shower of jingle bells and glass baubles. Crash class (boosted by the caller). */
export function jingleCrash(g: SynthGraph, t: number, p: number, v: number, r: () => number, seed: number): void {
  tone(g, t, { freq: 120 * p, freqEnd: 50, peak: 0.5 * v, decay: 0.22 });
  noise(g, t, { peak: 0.42 * v, decay: 0.3, filter: { type: 'lowpass', freq: 900 }, seed });
  for (let i = 0; i < 14; i++) {
    const tt = t + 0.02 + r() * 0.5;
    // sleigh-bell jingle: two inharmonic partials, short
    tone(g, tt, { freq: (3200 + r() * 1800) * p, peak: 0.08 * v, decay: 0.07 + r() * 0.05 });
    tone(g, tt, { freq: (5600 + r() * 2000) * p, peak: 0.04 * v, decay: 0.05 });
  }
  for (let i = 0; i < 5; i++) bell(g, t + 0.05 + r() * 0.35, (2400 + r() * 2600) * p, 0.06 * v, 0.2 + r() * 0.2);
  noise(g, t + 0.03, { peak: 0.24 * v, attack: 0.02, decay: 0.55, filter: { type: 'bandpass', freq: 5600, freqEnd: 3000, q: 0.8 }, seed: seed + 1 });
}

export function topple(g: SynthGraph, c: Cue, t: number, p: number, v: number, boost: number, r: () => number, seed: number): void {
  const cells = Math.min(6, Math.max(1, c.items ?? 3));
  // creak: a slow, wobbling woody saw
  tone(g, t, { type: 'sawtooth', freq: 95 * p, freqEnd: 70 * p, attack: 0.05, hold: 0.35, decay: 0.2, peak: 0.08 * v, filter: { type: 'bandpass', freq: 650, q: 8 }, vib: { hz: 13, cents: 90 } });
  // whoosh as it goes over
  const w = t + 0.45;
  const fall = 0.25 + cells * 0.05;
  noise(g, w, { peak: 0.14 * v, attack: fall * 0.6, decay: fall * 0.5, filter: { type: 'bandpass', freq: 600, freqEnd: 2200, q: 1 }, seed });
  jingleCrash(g, w + fall, p, v * boost, r, seed + 7);
}

export function puddle(g: SynthGraph, c: Cue, t: number, p: number, v: number, seed: number): void {
  if (c.variant === 1) {
    // soil: a dry pat
    noise(g, t, { peak: 0.14 * v, decay: 0.07, filter: { type: 'lowpass', freq: 700 }, seed });
  } else {
    noise(g, t, { peak: 0.16 * v, decay: 0.12, filter: { type: 'lowpass', freq: 1800 * p, freqEnd: 400, q: 2 }, seed });
    tone(g, t, { freq: 420 * p, freqEnd: 900 * p, peak: 0.07 * v, decay: 0.06 }); // the "plip"
  }
}

export function roombaHum(g: SynthGraph, c: Cue, t: number, v: number): void {
  const dur = Math.max(0.3, c.dur ?? 0.8);
  tone(g, t, { type: 'sawtooth', freq: 92, attack: 0.08, hold: dur - 0.2, decay: 0.15, peak: 0.022 * v, filter: { type: 'lowpass', freq: 380 } });
  tone(g, t, { type: 'sine', freq: 184, attack: 0.08, hold: dur - 0.2, decay: 0.15, peak: 0.018 * v, vib: { hz: 3, cents: 15 } });
}

export function framedSting(g: SynthGraph, t: number, v: number): void {
  // "dun dun DUN": two short stabs, then the long one a minor third down
  brass(g, t, 233.1, 0.1, 0.1 * v);
  brass(g, t + 0.2, 220, 0.1, 0.1 * v);
  brass(g, t + 0.42, 185, 0.6, 0.12 * v);
  tone(g, t + 0.42, { freq: 92.5, freqEnd: 88, peak: 0.07 * v, attack: 0.02, hold: 0.3, decay: 0.4 });
}

export function wish(g: SynthGraph, t: number, v: number, r: () => number): void {
  [1568, 1975.5, 2349.3, 3136, 3951].forEach((hz, i) => bell(g, t + i * 0.06, hz, 0.06 * v, 0.6));
  for (let i = 0; i < 6; i++) tone(g, t + 0.2 + r() * 0.4, { freq: 4000 + r() * 3000, peak: 0.02 * v, decay: 0.12 });
  mrrp(g, t + 0.42, v);
}

export function enterBox(g: SynthGraph, t: number, v: number, seed: number): void {
  tone(g, t, { freq: 150, freqEnd: 90, peak: 0.28 * v, decay: 0.12 });
  noise(g, t, { peak: 0.2 * v, decay: 0.1, filter: { type: 'bandpass', freq: 380, q: 1.6 }, seed });
  noise(g, t + 0.04, { peak: 0.06 * v, decay: 0.12, filter: { type: 'bandpass', freq: 1800, q: 2 }, seed: seed + 1 }); // cardboard rustle
  purr(g, t + 0.3, 1.2, 0.22 * v);
}

export function noiseRise(g: SynthGraph, c: Cue, t: number, p: number, v: number): void {
  const k = c.amount ?? 0.25;
  // a snort and a rising tremolo tension figure (the meter is filling up)
  snoreVoice(g, t, c.persona ?? 'napper', 0.6 * v, k);
  for (let i = 0; i < 4; i++)
    tone(g, t + i * 0.06, { type: 'triangle', freq: 392 * p * Math.pow(2, i / 12), peak: (0.04 + k * 0.05) * v, decay: 0.06, filter: { type: 'lowpass', freq: 2400 } });
}

export function glint(g: SynthGraph, t: number, v: number): void {
  tone(g, t, { freq: 3500, freqEnd: 7800, glide: 0.12, attack: 0.01, decay: 0.16, peak: 0.06 * v });
  bell(g, t + 0.1, 5274, 0.05 * v, 0.3);
}

export function shutter(g: SynthGraph, t: number, v: number, seed: number): void {
  noise(g, t, { peak: 0.2 * v, decay: 0.015, filter: { type: 'bandpass', freq: 3500, q: 2 }, seed });
  noise(g, t + 0.07, { peak: 0.14 * v, decay: 0.02, filter: { type: 'bandpass', freq: 2200, q: 2 }, seed: seed + 1 });
  tone(g, t + 0.12, { type: 'square', freq: 2637, peak: 0.03 * v, decay: 0.05, filter: { type: 'lowpass', freq: 5000 } });
}

/**
 * Prop-specific sounds. `payoff` (break or spill) gets the full crash (the caller boosts it like any crash);
 * otherwise (land) a smaller version.
 */
export function specialSound(
  g: SynthGraph,
  sp: SpecialSound,
  t: number,
  p: number,
  v: number,
  payoff: boolean,
  r: () => number,
  seed: number,
): void {
  const k = payoff ? 1 : 0.55;
  switch (sp) {
    case 'balloon': // POP + a rubbery flap
      noise(g, t, { peak: 0.75 * k * v, decay: 0.05, filter: { type: 'highpass', freq: 700 }, seed });
      tone(g, t, { freq: 220 * p, freqEnd: 80, peak: 0.45 * k * v, decay: 0.08 });
      for (let i = 0; i < 4; i++) noise(g, t + 0.08 + i * 0.05, { peak: 0.06 * v, decay: 0.03, filter: { type: 'bandpass', freq: 600, q: 3 }, seed: seed + i });
      break;
    case 'flour': // a soft thump and a big dusty POOF
      tone(g, t, { freq: 130 * p, freqEnd: 60, peak: 0.5 * k * v, decay: 0.14 });
      noise(g, t + 0.02, { peak: 0.5 * k * v, attack: 0.04, decay: 0.7, filter: { type: 'lowpass', freq: 2800, freqEnd: 500, q: 0.7 }, seed });
      noise(g, t + 0.05, { peak: 0.12 * k * v, attack: 0.1, decay: 0.6, filter: { type: 'highpass', freq: 5000 }, seed: seed + 1 });
      break;
    case 'popcorn': // bowl bonk + popcorn pattering everywhere
      tone(g, t, { freq: 360 * p, freqEnd: 200, peak: 0.6 * k * v, decay: 0.12 });
      noise(g, t, { peak: 0.55 * k * v, decay: 0.16, filter: { type: 'bandpass', freq: 1600, q: 1 }, seed });
      for (let i = 0; i < 18; i++)
        noise(g, t + 0.04 + r() * 0.6, { peak: (0.06 + r() * 0.08) * k * v, decay: 0.012, filter: { type: 'bandpass', freq: 1800 + r() * 2500, q: 4 }, seed: seed + i });
      break;
    case 'champagne': // cork POP, a bottle clonk and a fizzy hiss
      noise(g, t, { peak: 0.6 * k * v, decay: 0.04, filter: { type: 'bandpass', freq: 1100, q: 1.2 }, seed });
      tone(g, t, { freq: 700 * p, freqEnd: 260 * p, peak: 0.45 * k * v, decay: 0.06 });
      bell(g, t + 0.06, 1900 * p, 0.12 * k * v, 0.4);
      for (let i = 0; i < 4 && payoff; i++) bell(g, t + 0.08 + r() * 0.2, (2600 + r() * 2600) * p, 0.06 * v, 0.2);
      noise(g, t + 0.1, { peak: 0.28 * k * v, attack: 0.06, decay: 1.1, filter: { type: 'highpass', freq: 5500 }, seed: seed + 1 });
      for (let i = 0; i < 10; i++) tone(g, t + 0.15 + r() * 0.9, { freq: 3000 + r() * 5000, peak: 0.03 * k * v, decay: 0.02 });
      break;
    case 'cups': // a hollow plastic cascade, bouncing
      for (let i = 0; i < 6; i++) {
        const tt = t + i * 0.07 + r() * 0.03;
        tone(g, tt, { freq: (620 - i * 30 + r() * 80) * p, freqEnd: 300 * p, peak: 0.34 * k * v, decay: 0.08 });
        noise(g, tt, { peak: 0.12 * k * v, decay: 0.025, filter: { type: 'bandpass', freq: 2800, q: 2 }, seed: seed + i });
      }
      break;
    case 'paper': // paper flutter: a whump, then a cloud of flaps
      if (payoff) {
        tone(g, t, { freq: 150 * p, freqEnd: 70, peak: 0.5 * v, decay: 0.14 });
        noise(g, t, { peak: 0.5 * v, decay: 0.2, filter: { type: 'bandpass', freq: 1400, q: 0.8 }, seed: seed + 30 });
      }
      for (let i = 0; i < 10; i++)
        noise(g, t + i * 0.045 + r() * 0.02, { peak: (0.2 + r() * 0.1) * k * v, decay: 0.045, filter: { type: 'bandpass', freq: 1800 + r() * 2200, q: 1.6 }, seed: seed + i });
      noise(g, t + 0.45, { peak: 0.25 * k * v, decay: 0.1, filter: { type: 'lowpass', freq: 650 }, seed: seed + 20 });
      break;
    case 'gift': // a cardboard box THUD (with a little ribbon rattle)
      tone(g, t, { freq: 140 * p, freqEnd: 70, peak: 0.55 * k * v, decay: 0.16 });
      noise(g, t, { peak: 0.45 * k * v, decay: 0.12, filter: { type: 'bandpass', freq: 420, q: 1.4 }, seed });
      for (let i = 0; i < 3; i++) noise(g, t + 0.12 + i * 0.05, { peak: 0.06 * v, decay: 0.03, filter: { type: 'bandpass', freq: 2600, q: 3 }, seed: seed + i });
      break;
    case 'tray': // metal tray CLANG, wobbling on the floor, cookies scattering
      for (const ratio of [1, 2.32, 4.25, 6.63]) tone(g, t, { freq: 520 * ratio * p, peak: 0.16 * k * v, decay: 1.0 / Math.sqrt(ratio) });
      noise(g, t, { peak: 0.4 * k * v, decay: 0.08, filter: { type: 'highpass', freq: 2000 }, seed });
      for (let i = 0; i < 6; i++) tone(g, t + 0.25 + i * (0.12 - i * 0.012), { type: 'triangle', freq: 980 * p, peak: (0.1 - i * 0.014) * k * v, decay: 0.05 });
      for (let i = 0; i < 6; i++) noise(g, t + 0.05 + r() * 0.4, { peak: 0.08 * k * v, decay: 0.03, filter: { type: 'bandpass', freq: 900 + r() * 700, q: 2 }, seed: seed + 10 + i });
      break;
    case 'tree':
      jingleCrash(g, t, p, v * (payoff ? 1 : 0.6), r, seed);
      break;
    case 'bubbles': // a squishy thump, then pop-pop-pop
      tone(g, t, { freq: 160 * p, freqEnd: 90, peak: 0.45 * k * v, decay: 0.12 });
      noise(g, t, { peak: 0.3 * k * v, decay: 0.1, filter: { type: 'lowpass', freq: 1200 }, seed: seed + 50 });
      for (let i = 0; i < 8; i++) {
        const tt = t + i * 0.05 + r() * 0.03;
        noise(g, tt, { peak: 0.6 * k * v, decay: 0.014, filter: { type: 'highpass', freq: 1500 }, seed: seed + i });
        tone(g, tt, { freq: (900 + r() * 500) * p, freqEnd: 300, peak: 0.12 * k * v, decay: 0.02 });
      }
      break;
    case 'ornament': // glass bauble: a bright ping, then a tinkly little shatter with a jingle
      bell(g, t, 2800 * p, 0.2 * k * v, 0.3);
      noise(g, t, { peak: 0.45 * k * v, decay: 0.07, filter: { type: 'highpass', freq: 2200 }, seed });
      for (let i = 0; i < 8; i++) bell(g, t + r() * 0.3, (3000 + r() * 4000) * p, 0.06 * k * v, 0.15 + r() * 0.15);
      noise(g, t + 0.02, { peak: 0.25 * k * v, attack: 0.02, decay: 0.5, filter: { type: 'bandpass', freq: 5600, freqEnd: 3000, q: 0.7 }, seed: seed + 1 });
      break;
    case 'boardgame': // box clonk + dice and pieces scattering
      tone(g, t, { freq: 180 * p, freqEnd: 90, peak: 0.6 * k * v, decay: 0.14 });
      noise(g, t, { peak: 0.5 * k * v, decay: 0.12, filter: { type: 'bandpass', freq: 600, q: 1.4 }, seed });
      for (let i = 0; i < 12; i++) {
        const tt = t + 0.04 + r() * 0.55;
        tone(g, tt, { type: 'triangle', freq: (1200 + r() * 1600) * p, peak: 0.08 * k * v, decay: 0.03 });
      }
      break;
  }
}
