/**
 * Race SFX (GDD 10). `cuesFor` is the pure event → cue table (unit-tested); `playCue` synthesises a cue.
 * Priorities feed the voice budget: when the mixer is over 24 voices only cues with priority ≥ 2 still play.
 */
import { BoostSource, type ItemId, type RaceEvent } from '../../types';
import { bell, brass, noise, prng, tone, type SynthGraph } from './synth';
import { happyMeow, hiss, meow, mrrp, sadMew, scream, squeak, trill, yowl } from './voices';

export type SfxId =
  | 'count'
  | 'go'
  | 'pounce'
  | 'stall'
  | 'hop'
  | 'driftTier'
  | 'turbo'
  | 'pad'
  | 'ramp'
  | 'trick'
  | 'land'
  | 'bigLand'
  | 'graze'
  | 'wallHit'
  | 'bump'
  | 'roulette'
  | 'itemReady'
  | 'item'
  | 'hit'
  | 'hitConfirm'
  | 'blocked'
  | 'respawn'
  | 'lap'
  | 'finalLap'
  | 'trill'
  | 'yowl'
  | 'win'
  | 'podium'
  | 'finish'
  | 'slipstream'
  | 'catnip';

export interface Cue {
  id: SfxId;
  /** 0 ambience … 3 must play */
  prio: number;
  /** event number (tier, place, count …) */
  n: number;
  item?: ItemId;
  /** voice pitch of the cat involved */
  pitch: number;
  delay: number;
}

/** Each racer gets its own voice pitch (render-only, stable per slot). */
export function catPitch(kart: number): number {
  return 0.82 + ((kart * 0.37) % 0.42);
}

function cue(id: SfxId, prio: number, n = 0, kart = 0, extra: Partial<Cue> = {}): Cue {
  return { id, prio, n, pitch: catPitch(kart), delay: 0, ...extra };
}

/** The pure event → cue table. Only the player's own events (and rivals touching the player) make sound. */
export function cuesFor(e: RaceEvent, me: number): Cue[] {
  const mine = e.kart === me;
  const a = e.a ?? 0;
  switch (e.type) {
    case 'countdown':
      return e.kart === me || e.kart === -1 ? [cue('count', 3, a, me)] : [];
    case 'go':
      return e.kart === me || e.kart === -1 ? [cue('go', 3, 0, me)] : [];
    case 'pounce':
      return mine ? [cue('pounce', 3, 0, me)] : [];
    case 'stall':
      return mine ? [cue('stall', 2, 0, me)] : [];
    case 'hop':
      return mine ? [cue('hop', 1)] : [];
    case 'driftTier':
      return mine ? [cue('driftTier', 2, a)] : [];
    case 'miniTurbo':
      return mine ? [cue('turbo', 3, a, me)] : [];
    case 'boost':
      if (!mine) return [];
      if (a === BoostSource.Slipstream) return [cue('slipstream', 2)];
      if (a === BoostSource.Catnip) return [cue('catnip', 2)];
      return [];
    case 'pad':
      return mine ? [cue('pad', 2)] : [];
    case 'ramp':
      return mine ? [cue('ramp', 1)] : [];
    case 'trick':
      return mine ? [cue('trick', 2, 0, me)] : [];
    case 'land':
      return mine ? [cue(a > 30 ? 'bigLand' : 'land', 1, a, me)] : [];
    case 'wall':
      return mine ? [cue(a === 2 ? 'wallHit' : 'graze', a === 2 ? 2 : 1, a)] : [];
    case 'bump':
      return mine || e.b === me ? [cue('bump', 1)] : [];
    case 'itemPickup':
      return mine ? [cue('roulette', 2)] : [];
    case 'itemReady':
      return mine ? [cue('itemReady', 2)] : [];
    case 'itemUse':
      return mine ? [cue('item', 2, a, me, { item: e.item })] : [];
    case 'hit':
      if (mine) return [cue('hit', 3, a, me)];
      if (e.b === me) return [cue('hitConfirm', 3, a, e.kart)];
      return [];
    case 'blocked':
      return mine || e.b === me ? [cue('blocked', 2)] : [];
    case 'respawn':
      return mine ? [cue('respawn', 2, 0, me)] : [];
    case 'lap':
      return mine ? [cue('lap', 3, a)] : [];
    case 'finalLap':
      return mine ? [cue('finalLap', 3, 0, me)] : [];
    case 'overtake':
      if (mine) return [cue('trill', 2, a, me)];
      if (e.b === me) return [cue('yowl', 2, a, e.kart)];
      return [];
    case 'finish':
      if (!mine) return [];
      return [cue(a === 1 ? 'win' : a <= 3 ? 'podium' : 'finish', 3, a, me)];
    default:
      return [];
  }
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

function whoosh(g: SynthGraph, t: number, dur: number, bright: number, peak: number, seed: number): void {
  noise(g, t, { peak, attack: dur * 0.15, decay: dur * 0.85, filter: { type: 'bandpass', freq: 400 * bright, freqEnd: 3400 * bright, q: 1.2 }, seed });
}

function itemSound(g: SynthGraph, t: number, item: ItemId | undefined, back: boolean, pitch: number): void {
  switch (item) {
    case 'hairball': // wet "hork… thwp"
      tone(g, t, { type: 'sawtooth', freq: 160, freqEnd: 90, peak: 0.12, decay: 0.12, filter: { type: 'lowpass', freq: 600 } });
      noise(g, t + 0.1, { peak: 0.3, decay: 0.12, filter: { type: 'lowpass', freq: 1200, freqEnd: 300, q: 3 }, seed: 5 });
      break;
    case 'yarn': // a whirring spin-up
      tone(g, t, { type: 'triangle', freq: 220, freqEnd: 880, peak: 0.12, decay: 0.35, vib: { hz: 28, cents: 80 } });
      whoosh(g, t, 0.35, 1, 0.18, 7);
      break;
    case 'cucumber': // a heavy cool-veg thunk
      tone(g, t, { freq: back ? 220 : 160, freqEnd: 70, peak: 0.4, decay: 0.14 });
      noise(g, t, { peak: 0.18, decay: 0.05, filter: { type: 'bandpass', freq: 1800, q: 3 }, seed: 9 });
      break;
    case 'box': // cardboard pop-up
      noise(g, t, { peak: 0.3, decay: 0.08, filter: { type: 'lowpass', freq: 900 }, seed: 13 });
      tone(g, t + 0.04, { type: 'triangle', freq: 330, freqEnd: 495, peak: 0.12, decay: 0.12 });
      break;
    case 'bell': // the bell: a big ring that everyone hears
      bell(g, t, 1318.5, 0.2, 1.1);
      bell(g, t + 0.12, 1760, 0.14, 0.9);
      break;
    case 'zoomies':
      yowl(g, t, 1, pitch * 1.2);
      whoosh(g, t + 0.1, 0.9, 1.4, 0.3, 17);
      break;
    case 'laser': // pew-zap
      tone(g, t, { type: 'square', freq: 2400, freqEnd: 300, peak: 0.1, decay: 0.22, filter: { type: 'lowpass', freq: 5000 } });
      tone(g, t, { type: 'sawtooth', freq: 1200, freqEnd: 200, peak: 0.06, decay: 0.2 });
      break;
    case 'catnip':
    default:
      [C6, 1318.5, 1568, 2093].forEach((hz, i) => bell(g, t + i * 0.045, hz, 0.06, 0.35));
      whoosh(g, t, 0.5, 1.3, 0.25, 19);
  }
}

/** Synthesise one cue at context time `t`. */
export function playCue(g: SynthGraph, c: Cue, t0: number): void {
  const t = t0 + c.delay;
  const r = prng(Math.floor(t0 * 1000) ^ (c.n * 131));
  switch (c.id) {
    case 'count':
      mrrp(g, t, 1.2, 0.9 + (3 - c.n) * 0.06);
      tone(g, t, { type: 'square', freq: 440, peak: 0.07, decay: 0.12, filter: { type: 'lowpass', freq: 2400 } });
      break;
    case 'go':
      meow(g, t, 1.6, 1.05, true);
      tone(g, t, { type: 'square', freq: 880, peak: 0.1, decay: 0.3, filter: { type: 'lowpass', freq: 3000 } });
      brass(g, t, 440, 0.25, 0.25);
      break;
    case 'pounce':
      happyMeow(g, t, 1.4, c.pitch);
      whoosh(g, t, 0.6, 1.5, 0.45, 3);
      break;
    case 'stall':
      noise(g, t, { peak: 0.2, decay: 0.15, filter: { type: 'bandpass', freq: 500, q: 2 }, seed: 29 });
      sadMew(g, t + 0.12, 0.9);
      break;
    case 'hop':
      tone(g, t, { freq: 300, freqEnd: 600, peak: 0.07, decay: 0.08 });
      break;
    case 'driftTier': {
      // three rising steps; the third is a sparkly chord
      const hz = [0, 660, 880, 1320][Math.min(3, c.n)];
      tone(g, t, { type: 'square', freq: hz, peak: 0.08, decay: 0.12, filter: { type: 'lowpass', freq: 4000 } });
      if (c.n >= 2) bell(g, t + 0.04, hz * 1.5, 0.06, 0.3);
      if (c.n >= 3) bell(g, t + 0.08, hz * 2, 0.05, 0.4);
      break;
    }
    case 'turbo': {
      const tier = Math.max(1, Math.min(3, c.n));
      whoosh(g, t, 0.35 + 0.15 * tier, 0.9 + 0.3 * tier, 0.35 + 0.08 * tier, 31);
      // exhaust "pop-pop"
      for (let i = 0; i < tier; i++) noise(g, t + i * 0.06, { peak: 0.3, decay: 0.04, filter: { type: 'lowpass', freq: 700 }, seed: 37 + i });
      if (tier === 3) meow(g, t + 0.05, 1.1, c.pitch * 1.1);
      break;
    }
    case 'pad':
      tone(g, t, { type: 'sawtooth', freq: 300, freqEnd: 1200, peak: 0.08, decay: 0.25, filter: { type: 'lowpass', freq: 3000 } });
      whoosh(g, t, 0.45, 1.2, 0.3, 41);
      break;
    case 'ramp':
      whoosh(g, t, 0.5, 0.8, 0.2, 43);
      break;
    case 'trick':
      mrrp(g, t, 1.1, c.pitch * 1.1);
      [E5, G5, C6].forEach((hz, i) => bell(g, t + i * 0.05, hz, 0.06, 0.3));
      break;
    case 'land':
      squeak(g, t, 0.8, 0.9 + r() * 0.2);
      break;
    case 'bigLand':
      tone(g, t, { freq: 120, freqEnd: 50, peak: 0.4, decay: 0.2 });
      squeak(g, t + 0.02, 1, 0.85);
      break;
    case 'graze':
      noise(g, t, { peak: 0.14, decay: 0.12, filter: { type: 'bandpass', freq: 2600, q: 3 }, seed: 47 });
      break;
    case 'wallHit':
      tone(g, t, { freq: 110, freqEnd: 40, peak: 0.55, decay: 0.2 });
      noise(g, t, { peak: 0.3, decay: 0.12, filter: { type: 'lowpass', freq: 900 }, seed: 53 });
      tone(g, t + 0.02, { type: 'triangle', freq: 540, freqEnd: 250, peak: 0.15, decay: 0.13 }); // "bonk"
      break;
    case 'bump':
      tone(g, t, { type: 'triangle', freq: 260, freqEnd: 140, peak: 0.18, decay: 0.1 });
      noise(g, t, { peak: 0.12, decay: 0.05, filter: { type: 'lowpass', freq: 700 }, seed: 59 });
      break;
    case 'roulette':
      // 12 bell ticks that slow down
      for (let i = 0; i < 12; i++) bell(g, t + 0.05 * i + 0.004 * i * i, i % 2 ? 2093 : 1760, 0.045, 0.08);
      break;
    case 'itemReady':
      bell(g, t, 1568, 0.08, 0.35);
      bell(g, t + 0.07, 2093, 0.08, 0.5);
      break;
    case 'item':
      itemSound(g, t, c.item, c.n === 1, c.pitch);
      break;
    case 'hit':
      hiss(g, t, 1.2);
      if (c.n === 1) scream(g, t + 0.05, 1); // leap = cucumber fright
      else meow(g, t + 0.15, 1, c.pitch * 0.9);
      tone(g, t, { freq: 160, freqEnd: 50, peak: 0.4, decay: 0.22 });
      break;
    case 'hitConfirm':
      // you landed one: a crunchy, satisfying ding + their hiss far away
      bell(g, t, G5 * 2, 0.12, 0.4);
      tone(g, t, { type: 'square', freq: 990, freqEnd: 1480, peak: 0.07, decay: 0.1 });
      hiss(g, t + 0.05, 0.5);
      break;
    case 'blocked':
      bell(g, t, 3100, 0.1, 0.25);
      tone(g, t, { type: 'triangle', freq: 700, freqEnd: 400, peak: 0.12, decay: 0.12 });
      break;
    case 'respawn':
      whoosh(g, t, 0.6, 0.7, 0.25, 61);
      mrrp(g, t + 0.3, 1, c.pitch);
      break;
    case 'lap':
      [C5, E5, G5].forEach((hz, i) => tone(g, t + i * 0.08, { type: 'square', freq: hz, peak: 0.09, decay: 0.12, filter: { type: 'lowpass', freq: 3200 } }));
      break;
    case 'finalLap':
      brass(g, t, 392, 0.12, 0.35);
      brass(g, t + 0.14, 523.25, 0.12, 0.38);
      brass(g, t + 0.28, 659.25, 0.5, 0.42);
      yowl(g, t + 0.3, 1.1, c.pitch);
      break;
    case 'trill':
      trill(g, t, 1.1);
      tone(g, t, { type: 'square', freq: 990, freqEnd: 1480, peak: 0.05, decay: 0.08 });
      break;
    case 'yowl':
      yowl(g, t, 0.9, c.pitch);
      break;
    case 'win':
      [C5, E5, G5].forEach((hz, i) => brass(g, t + i * 0.11, hz, 0.1, 0.32));
      for (const hz of [C5, E5, G5, C6]) brass(g, t + 0.36, hz, 0.9, 0.18);
      happyMeow(g, t + 0.5, 1.4, c.pitch);
      break;
    case 'podium':
      [C5, E5, G5, C6].forEach((hz, i) => tone(g, t + i * 0.11, { type: 'square', freq: hz, peak: 0.1, decay: 0.18, filter: { type: 'lowpass', freq: 3200 } }));
      happyMeow(g, t + 0.45, 1.1, c.pitch);
      break;
    case 'finish':
      [G5, E5, C5].forEach((hz, i) => tone(g, t + i * 0.12, { type: 'triangle', freq: hz, peak: 0.1, decay: 0.2 }));
      meow(g, t + 0.4, 1, c.pitch);
      break;
    case 'slipstream':
      whoosh(g, t, 0.6, 1.8, 0.2, 67);
      break;
    case 'catnip':
      [C6, 1318.5, 1568].forEach((hz, i) => bell(g, t + i * 0.05, hz, 0.05, 0.3));
      break;
  }
}

/** Rough length of each cue in seconds (how long it holds a voice in the budget). */
export function cueLength(id: SfxId): number {
  switch (id) {
    case 'roulette':
    case 'win':
      return 1.3;
    case 'finalLap':
    case 'podium':
    case 'go':
      return 0.9;
    case 'hit':
    case 'respawn':
    case 'finish':
    case 'turbo':
    case 'pounce':
      return 0.6;
    default:
      return 0.3;
  }
}

/**
 * Voice budget (GDD 10: at most 24 voices). A voice is one cue or one music note while it sounds. Over budget, only
 * priority-3 cues still play (countdown, hits, laps, finish), so the important sounds never drop.
 */
export class VoiceBudget {
  private ends: number[] = [];
  constructor(readonly max = 24) {}

  get active(): number {
    return this.ends.length;
  }

  admit(now: number, prio: number, dur: number): boolean {
    if (this.ends.length) this.ends = this.ends.filter((e) => e > now);
    if (this.ends.length >= this.max && prio < 3) return false;
    this.ends.push(now + dur);
    return true;
  }

  clear(): void {
    this.ends.length = 0;
  }
}
