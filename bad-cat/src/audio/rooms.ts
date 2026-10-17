/**
 * W1-AUDIO: the room's world sounds. Room events 0..11 (GDD 4.3 / ROOM_EVENT_NAMES) and the per-routine
 * telegraph cues (GDD 3.5: stove timer, TV jingle, mirror hum, "you're on mute" chime).
 * Nothing here runs at module top level.
 */
import { SILENT, bell, brass, noise, run, tone, type SynthGraph } from './synth';
import { crowd } from './voices';
import { TELE_BELLS, TELE_MIRROR, TELE_MUTE, TELE_STOVE, TELE_TV } from './sfx-map';

/** Small "bloop-bloop" chime (generic, not any app's sound). */
function muteChime(g: SynthGraph, t: number, v: number): void {
  tone(g, t, { type: 'sine', freq: 880, peak: 0.14 * v, attack: 0.01, decay: 0.22 });
  tone(g, t, { type: 'triangle', freq: 1760, peak: 0.03 * v, decay: 0.1 });
  tone(g, t + 0.16, { type: 'sine', freq: 659.3, peak: 0.14 * v, attack: 0.01, decay: 0.32 });
  tone(g, t + 0.16, { type: 'triangle', freq: 1318.5, peak: 0.03 * v, decay: 0.14 });
}

/** Telegraph cue, played on TELEGRAPH just before the "hm?" sting. */
export function teleCue(g: SynthGraph, kind: number, t: number, v: number, seed: number): void {
  switch (kind) {
    case TELE_STOVE: // a kitchen timer ticking fast, then a tiny ding
      for (let i = 0; i < 6; i++) noise(g, t + i * 0.045, { peak: 0.1 * v, decay: 0.012, filter: { type: 'bandpass', freq: 3800, q: 6 }, seed: seed + i });
      bell(g, t + 0.3, 2637, 0.07 * v, 0.35);
      break;
    case TELE_TV: // the ad-break bumper: three bright square notes
      [784, 988, 1318.5].forEach((hz, i) =>
        tone(g, t + i * 0.08, { type: 'square', freq: hz, peak: 0.06 * v, decay: 0.08, filter: { type: 'lowpass', freq: 3000 } }),
      );
      break;
    case TELE_MIRROR: // a shimmering glass hum swelling up
      for (const det of [-12, 0, 13])
        tone(g, t, { type: 'sine', freq: 1046.5, freqEnd: 1568, detune: det, attack: 0.15, hold: 0.1, decay: 0.3, peak: 0.05 * v });
      noise(g, t, { peak: 0.03 * v, attack: 0.2, decay: 0.2, filter: { type: 'bandpass', freq: 6000, q: 3 }, seed });
      break;
    case TELE_MUTE:
      muteChime(g, t, 0.8 * v);
      break;
    case TELE_BELLS: // sleigh bells: a quick shake of tiny high bells
      for (let i = 0; i < 5; i++) bell(g, t + i * 0.055, [2637, 3136, 2793.8, 3520, 2960][i], 0.035 * v, 0.18);
      noise(g, t, { peak: 0.025 * v, decay: 0.3, filter: { type: 'highpass', freq: 7000 }, seed });
      break;
  }
}

/** Room event cue (the human leaves or turns away for it). */
export function eventCue(g: SynthGraph, kind: number, t: number, v: number, seed: number, r: () => number): void {
  switch (kind) {
    case 1: {
      // kettle: rising whistle with a hiss
      const { ctx } = g;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500, t);
      osc.frequency.linearRampToValueAtTime(2100, t + 1.2);
      const vib = ctx.createOscillator();
      vib.frequency.setValueAtTime(7, t);
      const vibD = ctx.createGain();
      vibD.gain.setValueAtTime(25, t);
      vib.connect(vibD);
      vibD.connect(osc.frequency);
      const gn = ctx.createGain();
      gn.gain.value = SILENT;
      gn.gain.setValueAtTime(SILENT, t);
      const kv = Math.max(SILENT * 2, 0.08 * v);
      gn.gain.exponentialRampToValueAtTime(kv, t + 0.9);
      gn.gain.setValueAtTime(kv, t + 1.3);
      gn.gain.exponentialRampToValueAtTime(SILENT, t + 1.6);
      osc.connect(gn);
      gn.connect(g.out);
      run(g, osc, t, t + 1.65);
      run(g, vib, t, t + 1.65);
      noise(g, t, { peak: 0.08 * v, attack: 0.6, decay: 1.0, filter: { type: 'highpass', freq: 4000 }, seed });
      break;
    }
    case 2: // phone: two short rings
      for (let ring = 0; ring < 2; ring++) {
        for (let i = 0; i < 8; i++) {
          const tt = t + ring * 0.55 + i * 0.05;
          tone(g, tt, { freq: 440, peak: 0.07 * v, decay: 0.035 });
          tone(g, tt, { freq: 480, peak: 0.07 * v, decay: 0.035 });
        }
      }
      break;
    case 3: // ad break: TV jingle
      [523.3, 659.3, 784, 1046.5, 784, 1046.5].forEach((hz, i) =>
        tone(g, t + i * 0.12, { type: 'square', freq: hz, peak: 0.08 * v, decay: 0.1, filter: { type: 'lowpass', freq: 2500 } }),
      );
      break;
    case 4: // oven ding: one fat bell and the timer's rattle
      for (let i = 0; i < 4; i++) noise(g, t + i * 0.03, { peak: 0.06 * v, decay: 0.01, filter: { type: 'bandpass', freq: 3000, q: 5 }, seed: seed + i });
      bell(g, t + 0.14, 1568, 0.12 * v, 1.4);
      bell(g, t + 0.14, 2093, 0.06 * v, 0.9);
      break;
    case 5: {
      // lights off, then "SURPRISE!": switch click, a hush, the crowd and a party horn unrolling
      noise(g, t, { peak: 0.2 * v, decay: 0.02, filter: { type: 'bandpass', freq: 2500, q: 3 }, seed });
      tone(g, t, { type: 'square', freq: 1200, peak: 0.04 * v, decay: 0.015 });
      crowd(g, t + 0.5, 0.45, 1.6 * v, r, 6);
      partyHorn(g, t + 0.55, v);
      break;
    }
    case 6: // alarm clock: a bell hammer ringing for 1.6 s
      for (let i = 0; i < 32; i++) {
        const tt = t + i * 0.05;
        tone(g, tt, { type: 'triangle', freq: i % 2 ? 2350 : 2480, peak: 0.07 * v, decay: 0.045 });
        noise(g, tt, { peak: 0.04 * v, decay: 0.01, filter: { type: 'highpass', freq: 5000 }, seed: seed + i });
      }
      break;
    case 7: // speeches: a knife on a glass, three clinks, then a hush of guests
      for (let i = 0; i < 3; i++) {
        bell(g, t + i * 0.2, 3520, 0.09 * v, 0.6);
        tone(g, t + i * 0.2, { freq: 3520 * 2.76, peak: 0.02 * v, decay: 0.2 });
      }
      crowd(g, t + 0.75, 0.4, 0.5 * v, r, 3);
      break;
    case 8: // guests arrive: door, chatter, a laugh
      noise(g, t, { peak: 0.12 * v, decay: 0.12, filter: { type: 'lowpass', freq: 500 }, seed });
      crowd(g, t + 0.15, 1.2, v, r, 5);
      break;
    case 9: // courier: knock-knock-knock
      for (let i = 0; i < 3; i++) {
        const tt = t + i * (i === 2 ? 0.16 : 0.14);
        tone(g, tt, { freq: 210, freqEnd: 140, peak: 0.32 * v, decay: 0.07 });
        noise(g, tt, { peak: 0.2 * v, decay: 0.04, filter: { type: 'bandpass', freq: 900, q: 2 }, seed: seed + i });
      }
      break;
    case 10: // pizza: a cheerful bicycle-bell "brring-brring"
      for (let ring = 0; ring < 2; ring++)
        for (let i = 0; i < 6; i++) bell(g, t + ring * 0.4 + i * 0.04, i % 2 ? 2900 : 3150, 0.06 * v, 0.25);
      break;
    case 11: // you're on mute
      muteChime(g, t, v);
      break;
    default: // doorbell ding-dong
      bell(g, t, 659.3, 0.14 * v, 0.9);
      bell(g, t + 0.45, 523.3, 0.14 * v, 1.2);
  }
}

/** Party horn: a buzzy reed that unrolls up, wobbles, and drops off. */
export function partyHorn(g: SynthGraph, t: number, v: number): void {
  for (const det of [0, 14])
    tone(g, t, {
      type: 'sawtooth',
      freq: 330,
      freqEnd: 440,
      glide: 0.18,
      detune: det,
      attack: 0.03,
      hold: 0.4,
      decay: 0.18,
      peak: 0.07 * v,
      vib: { hz: 9, cents: 35 },
      filter: { type: 'bandpass', freq: 1400, q: 2 },
    });
}

/** NYE countdown sting: three beeps up, a cork pop and a horn. */
export function nyeCountdown(g: SynthGraph, t: number, v: number, seed: number): void {
  [880, 988, 1175].forEach((hz, i) => tone(g, t + i * 0.3, { type: 'square', freq: hz, peak: 0.07 * v, decay: 0.12, filter: { type: 'lowpass', freq: 3000 } }));
  noise(g, t + 0.95, { peak: 0.3 * v, decay: 0.04, filter: { type: 'bandpass', freq: 1200, q: 1 }, seed });
  tone(g, t + 0.95, { freq: 600, freqEnd: 200, peak: 0.2 * v, decay: 0.06 });
  partyHorn(g, t + 1.0, v);
  brass(g, t + 1.0, 523.3, 0.3, 0.12 * v);
}
