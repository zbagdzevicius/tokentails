/**
 * UI sounds and stingers (iteration 2, audio-ui lane): menu hover / confirm / back, toggles and tabs, the results
 * place stamp and count-up ticks, and the stingers for unlocks, achievements, purchases, fish earned, the podium and
 * the end of a cup. Short, bright and quiet enough to sit over the menu music. Synth only.
 */
import { bell, brass, noise, tone, type SynthGraph } from './synth';

export type UiSoundId =
  | 'hover'
  | 'confirm'
  | 'primary'
  | 'back'
  | 'toggleOn'
  | 'toggleOff'
  | 'tab'
  | 'slider'
  | 'stamp'
  | 'countTick'
  | 'unlock'
  | 'achievement'
  | 'purchase'
  | 'fish'
  | 'podium'
  | 'cupWin'
  | 'cupDone'
  | 'error'
  | 'wipe';

export const UI_SOUND_IDS: readonly UiSoundId[] = [
  'hover',
  'confirm',
  'primary',
  'back',
  'toggleOn',
  'toggleOff',
  'tab',
  'slider',
  'stamp',
  'countTick',
  'unlock',
  'achievement',
  'purchase',
  'fish',
  'podium',
  'cupWin',
  'cupDone',
  'error',
  'wipe',
];

/** Voice-budget priority and length per sound (stingers must play; hover may drop). */
export function uiSoundSpec(id: UiSoundId): { prio: number; len: number } {
  switch (id) {
    case 'hover':
    case 'slider':
    case 'countTick':
      return { prio: 0, len: 0.06 };
    case 'confirm':
    case 'primary':
    case 'back':
    case 'toggleOn':
    case 'toggleOff':
    case 'tab':
    case 'wipe':
    case 'error':
      return { prio: 1, len: 0.15 };
    case 'stamp':
    case 'fish':
      return { prio: 2, len: 0.3 };
    case 'podium':
    case 'cupWin':
      return { prio: 3, len: 2.2 };
    default:
      return { prio: 3, len: 1 };
  }
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/** Play a UI sound at context time `t`. `n` varies the pitch (count-up step, place). */
export function playUi(g: SynthGraph, id: UiSoundId, t: number, n = 0): void {
  switch (id) {
    case 'hover':
      tone(g, t, { type: 'sine', freq: 1760, peak: 0.025, decay: 0.035 });
      break;
    case 'confirm':
      tone(g, t, { type: 'square', freq: 880, freqEnd: 1320, glide: 0.04, peak: 0.04, decay: 0.07, filter: { type: 'lowpass', freq: 3500 } });
      break;
    case 'primary':
      tone(g, t, { type: 'square', freq: 660, peak: 0.04, decay: 0.06, filter: { type: 'lowpass', freq: 3500 } });
      tone(g, t + 0.05, { type: 'square', freq: 990, peak: 0.045, decay: 0.1, filter: { type: 'lowpass', freq: 3500 } });
      break;
    case 'back':
      tone(g, t, { type: 'triangle', freq: 990, freqEnd: 520, glide: 0.08, peak: 0.06, decay: 0.1 });
      break;
    case 'toggleOn':
      tone(g, t, { type: 'triangle', freq: 700, freqEnd: 1050, glide: 0.04, peak: 0.07, decay: 0.07 });
      break;
    case 'toggleOff':
      tone(g, t, { type: 'triangle', freq: 1050, freqEnd: 700, glide: 0.04, peak: 0.06, decay: 0.07 });
      break;
    case 'tab':
      noise(g, t, { peak: 0.08, decay: 0.03, filter: { type: 'bandpass', freq: 2400, q: 3 }, seed: 201 });
      tone(g, t, { type: 'sine', freq: 1320, peak: 0.03, decay: 0.05 });
      break;
    case 'slider':
      tone(g, t, { type: 'sine', freq: 600 + n * 900, peak: 0.03, decay: 0.03 });
      break;
    case 'stamp':
      // the place stamp lands: a felt thud with a paper slap
      tone(g, t, { freq: 140, freqEnd: 55, peak: 0.45, decay: 0.18 });
      noise(g, t, { peak: 0.25, decay: 0.07, filter: { type: 'bandpass', freq: 1100, q: 1 }, seed: 203 });
      if (n === 1) bell(g, t + 0.05, C6, 0.07, 0.6);
      break;
    case 'countTick':
      tone(g, t, { type: 'square', freq: 1200 + (n % 8) * 40, peak: 0.02, decay: 0.025, filter: { type: 'lowpass', freq: 5000 } });
      break;
    case 'unlock':
      // a lock clicks open, then a bright rising arpeggio
      noise(g, t, { peak: 0.2, decay: 0.03, filter: { type: 'bandpass', freq: 3000, q: 4 }, seed: 205 });
      [C5, E5, G5, C6, C6 * 1.25].forEach((hz, i) => tone(g, t + 0.08 + i * 0.07, { type: 'square', freq: hz, peak: 0.06, decay: 0.16, filter: { type: 'lowpass', freq: 4000 } }));
      bell(g, t + 0.45, C6 * 1.5, 0.08, 0.8);
      break;
    case 'achievement':
      // a trophy chime: two bells and a sparkle
      bell(g, t, G5, 0.1, 0.8);
      bell(g, t + 0.12, C6, 0.1, 1);
      [1.25, 1.5, 2].forEach((m, i) => bell(g, t + 0.3 + i * 0.05, C6 * m, 0.05, 0.4));
      break;
    case 'purchase':
      // fish coins tumble into the bowl
      [0, 1, 2, 3].forEach((i) => bell(g, t + i * 0.05, 1568 + i * 220, 0.05, 0.2));
      tone(g, t + 0.22, { type: 'triangle', freq: 523, freqEnd: 784, glide: 0.08, peak: 0.08, decay: 0.2 });
      break;
    case 'fish':
      bell(g, t, 1568 + (n % 5) * 110, 0.05, 0.2);
      break;
    case 'podium':
      // a short fanfare with a "timpani" roll under it
      for (let i = 0; i < 8; i++) tone(g, t + i * 0.04, { freq: 98, freqEnd: 80, peak: 0.12 + i * 0.02, decay: 0.08 });
      [C5, E5, G5].forEach((hz, i) => brass(g, t + 0.35 + i * 0.14, hz, 0.12, 0.3));
      for (const hz of [C5, E5, G5, C6]) brass(g, t + 0.8, hz, 1.1, 0.16);
      noise(g, t + 0.8, { peak: 0.3, decay: 1.4, filter: { type: 'highpass', freq: 5000 }, seed: 207 });
      break;
    case 'cupWin':
      [G5 / 2, C5, E5, G5].forEach((hz, i) => brass(g, t + i * 0.12, hz, 0.1, 0.3));
      for (const hz of [C5, E5, G5, C6]) brass(g, t + 0.5, hz, 1.2, 0.18);
      [1, 1.25, 1.5, 2].forEach((m, i) => bell(g, t + 0.6 + i * 0.06, C6 * m, 0.05, 0.6));
      break;
    case 'cupDone':
      [C5, G5 / 2, C5].forEach((hz, i) => tone(g, t + i * 0.14, { type: 'triangle', freq: hz, peak: 0.1, decay: 0.22 }));
      break;
    case 'error':
      tone(g, t, { type: 'square', freq: 196, peak: 0.05, decay: 0.12, filter: { type: 'lowpass', freq: 1200 } });
      break;
    case 'wipe':
      noise(g, t, { peak: 0.08, attack: 0.08, decay: 0.25, filter: { type: 'bandpass', freq: 600, freqEnd: 3000, q: 1.2 }, seed: 209 });
      break;
  }
}
