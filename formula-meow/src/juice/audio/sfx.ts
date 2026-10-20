/**
 * Race SFX (GDD 10; iteration 2 audio-ui lane). `cuesFor` is the pure event → cue table (unit-tested); `playCue`
 * synthesises a cue. WebAudio synth only.
 *
 * Every item has its own use sound, its own "incoming" travel sound (the beeper the target hears, `incomingCue`) and
 * its own hit sound (`hitLayer`: the item that landed is known from the attacker's last item use). Coins pling higher
 * the more you hold, every hazard has a sound, the respawn hand whooshes in, and battle has pops, steals and the out
 * horn. The announcer (announcer.ts) owns every spoken line, so the cues here carry no voice except the cats' own
 * reactions (hiss, scream, trill, yowl).
 *
 * Voice budget (GDD 10: never more than 24 voices): each priority has its own ceiling (`PRIO_CAP`), so a storm of
 * low-priority cues leaves headroom for the countdown, hits, laps and the finish, and the total never passes 24.
 */
import { BoostSource, HAZARD_KINDS, type HazardKind, type ItemId, type RaceEvent } from '../../types';
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
  | 'respawnHand'
  | 'lap'
  | 'finalLap'
  | 'trill'
  | 'yowl'
  | 'win'
  | 'podium'
  | 'finish'
  | 'slipstream'
  | 'catnip'
  // iteration 2
  | 'coin'
  | 'coinLoss'
  | 'hazard'
  | 'wrongWay'
  | 'itemFizzle'
  | 'balloonPop'
  | 'balloonSteal'
  | 'eliminated'
  | 'checkpoint'
  | 'grudge'
  | 'incoming'
  | 'splitAhead'
  | 'splitBehind'
  | 'timerTick'
  | 'timeUp'
  // iteration 3 (set pieces, juice lane)
  | 'loopRush'
  | 'loopOut'
  | 'wallOn'
  | 'wallOff'
  | 'gapLaunch'
  | 'gapLand'
  | 'net'
  | 'tunnelIn'
  | 'tunnelOut'
  | 'combo';

export interface Cue {
  id: SfxId;
  /** 0 ambience … 3 must play */
  prio: number;
  /** event number (tier, place, count, hazard kind …) */
  n: number;
  item?: ItemId;
  /** voice pitch of the cat involved */
  pitch: number;
  delay: number;
  /** 0..1 loudness (rivals' sounds are quieter) */
  vol: number;
  /** a rival's sound: the race audio plays it only when that kart is near the player */
  near?: number;
}

/** Each racer gets its own voice pitch (render-only, stable per slot). */
export function catPitch(kart: number): number {
  return 0.82 + ((kart * 0.37) % 0.42);
}

function cue(id: SfxId, prio: number, n = 0, kart = 0, extra: Partial<Cue> = {}): Cue {
  return { id, prio, n, pitch: catPitch(Math.max(0, kart)), delay: 0, vol: 1, ...extra };
}

/** HitKind index (spin 0, leap 1, wobble 2, chase 3) → the item that most likely caused it, when the attacker is unknown. */
const HIT_ITEM: readonly ItemId[] = ['hairball', 'cucumber', 'bell', 'laser'];
/** Items that can cause each HitKind (items-ai: spin = hairball, yarn, Zoomies, the Laser Dot on the leader). */
const HIT_CAN: readonly (readonly ItemId[])[] = [['hairball', 'yarn', 'zoomies', 'laser'], ['cucumber'], ['bell'], ['laser']];

/**
 * The pure event → cue table. Only the player's own events (and rivals touching the player) make sound; a few rival
 * events (hazards, eliminations) come back with `near` set so the mixer can play them when that kart is close.
 * `itemOf(kart)` is the attacker's last used item (for the per-item hit sound).
 */
export function cuesFor(e: RaceEvent, me: number, itemOf?: (kart: number) => ItemId | undefined): Cue[] {
  const mine = e.kart === me;
  const a = e.a ?? 0;
  const by = e.b ?? -1;
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
      return mine || by === me ? [cue('bump', 1)] : [];
    case 'itemPickup':
      return mine ? [cue('roulette', 2)] : [];
    case 'itemReady':
      return mine ? [cue('itemReady', 2, 0, me, { item: e.item })] : [];
    case 'itemUse':
      return mine ? [cue('item', 2, a, me, { item: e.item })] : [];
    case 'itemFizzle':
      return mine ? [cue('itemFizzle', 2, 0, me, { item: e.item })] : [];
    case 'hit': {
      const last = by >= 0 ? itemOf?.(by) : undefined;
      const item = last && HIT_CAN[a]?.includes(last) ? last : (HIT_ITEM[a] ?? 'hairball');
      if (mine) return [cue('hit', 3, a, me, { item })];
      if (by === me) return [cue('hitConfirm', 3, a, e.kart, { item })];
      return [];
    }
    case 'blocked':
      // the shield that ate it: a held yarn (event item 'yarn') or the box
      return mine || by === me ? [cue('blocked', 2, mine ? 1 : 0, me, { item: e.item ?? 'box' })] : [];
    case 'respawnStart':
      return mine ? [cue('respawnHand', 2, 0, me)] : [];
    case 'respawn':
      return mine ? [cue('respawn', 2, 0, me)] : [];
    case 'lap':
      return mine ? [cue('lap', 3, a)] : [];
    case 'finalLap':
      return mine ? [cue('finalLap', 3, 0, me)] : [];
    case 'overtake':
      if (mine) return [cue('trill', 2, a, me)];
      if (by === me) return [cue('yowl', 2, a, e.kart)];
      return [];
    case 'finish':
      if (!mine) return [];
      return [cue(a === 1 ? 'win' : a <= 3 ? 'podium' : 'finish', 3, a, me)];
    case 'coin':
      return mine ? [cue('coin', 1, a)] : [];
    case 'coinLoss':
      return mine && a > 0 ? [cue('coinLoss', 2, a)] : [];
    case 'hazard':
      if (mine) return [cue('hazard', 2, a, me)];
      return [cue('hazard', 0, a, e.kart, { vol: 0.45, near: e.kart })];
    case 'wrongWay':
      return mine ? [cue('wrongWay', 2)] : [];
    case 'balloonPop':
      if (mine) return [cue('balloonPop', 3, 1, me)];
      if (by === me) return [cue('balloonPop', 2, 0, e.kart)];
      return [cue('balloonPop', 0, 0, e.kart, { vol: 0.4, near: e.kart })];
    case 'balloonSteal':
      // kart = the one robbed, b = the thief
      if (by === me) return [cue('balloonSteal', 3, 1, me)];
      if (mine) return [cue('balloonPop', 3, 1, me)];
      return [];
    case 'eliminated':
      if (mine) return [cue('eliminated', 3, 1, me)];
      return [cue('eliminated', 1, 0, e.kart, { vol: 0.5 })];
    case 'checkpoint':
      return mine ? [cue('checkpoint', 1, a)] : [];
    case 'grudge':
      return by === me ? [cue('grudge', 1, 0, e.kart)] : [];
    // iteration 3: set pieces (a = SET_PIECE_KINDS index: 0 loop, 1 wall, 2 jump, 3 tunnel)
    case 'stuntEnter':
      if (!mine) return a === 0 ? [cue('loopRush', 0, 0, e.kart, { vol: 0.4, near: e.kart })] : [];
      if (a === 0) return [cue('loopRush', 2, 0, me)];
      if (a === 1) return [cue('wallOn', 1, 0, me)];
      if (a === 2) return [cue('gapLaunch', 2, 0, me)];
      return [];
    case 'stuntExit':
      if (!mine) return [];
      if (a === 0) return [cue('loopOut', 2, 0, me)];
      if (a === 1 && e.b === 1) return [cue('wallOff', 1, 0, me)];
      return [];
    case 'stuntLand':
      return mine ? [cue('gapLand', 2, a, me)] : [];
    case 'netCatch':
      return mine ? [cue('net', 2, 0, me)] : [];
    default:
      return [];
  }
}

/** The beeper the target of an incoming item hears (render side, from the HUD feed): kind 0 hairball, 1 yarn, 2 laser. */
export function incomingCue(kind: number, eta: number): Cue {
  return cue('incoming', 1, kind, 0, { vol: Math.max(0.35, Math.min(1, 1.6 - eta / 2)) });
}

/** How often the incoming beeper beeps for an ETA in seconds (a parking sensor: faster as it closes). */
export function incomingInterval(eta: number): number {
  return Math.max(0.09, Math.min(0.5, eta * 0.22));
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
    case 'yarn':
      if (back) {
        // dropping the tangle: a soft thud and a loose-string twang
        tone(g, t, { type: 'triangle', freq: 180, freqEnd: 110, peak: 0.16, decay: 0.12 });
        tone(g, t + 0.03, { type: 'sawtooth', freq: 392, freqEnd: 370, peak: 0.05, decay: 0.4, filter: { type: 'lowpass', freq: 1800 }, vib: { hz: 9, cents: 30 } });
      } else {
        // the homing ball spins up
        tone(g, t, { type: 'triangle', freq: 220, freqEnd: 880, peak: 0.12, decay: 0.35, vib: { hz: 28, cents: 80 } });
        whoosh(g, t, 0.35, 1, 0.18, 7);
      }
      break;
    case 'cucumber': // a heavy cool-veg thunk; a lob whistles up first
      if (!back) tone(g, t, { type: 'sine', freq: 600, freqEnd: 1400, glide: 0.25, peak: 0.06, decay: 0.3 });
      tone(g, t + (back ? 0 : 0.05), { freq: back ? 220 : 160, freqEnd: 70, peak: 0.4, decay: 0.14 });
      noise(g, t, { peak: 0.18, decay: 0.05, filter: { type: 'bandpass', freq: 1800, q: 3 }, seed: 9 });
      break;
    case 'box': // cardboard pop-up and the flaps
      noise(g, t, { peak: 0.3, decay: 0.08, filter: { type: 'lowpass', freq: 900 }, seed: 13 });
      tone(g, t + 0.04, { type: 'triangle', freq: 330, freqEnd: 495, peak: 0.12, decay: 0.12 });
      noise(g, t + 0.12, { peak: 0.14, decay: 0.05, filter: { type: 'bandpass', freq: 1400, q: 2 }, seed: 14 });
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

/** What each item sounds like when it lands on a kart (you hear it on yourself and, brighter, when you land it). */
function hitLayer(g: SynthGraph, t: number, item: ItemId | undefined, confirm: boolean): void {
  const p = confirm ? 1.25 : 1;
  switch (item) {
    case 'hairball': // a wet splat
      noise(g, t, { peak: 0.32, decay: 0.16, filter: { type: 'lowpass', freq: 1600 * p, freqEnd: 400, q: 4 }, seed: 101 });
      tone(g, t, { type: 'sine', freq: 300 * p, freqEnd: 120, peak: 0.16, decay: 0.12 });
      break;
    case 'yarn': // boing + a string snapping tight
      tone(g, t, { type: 'triangle', freq: 180 * p, freqEnd: 420 * p, glide: 0.08, peak: 0.18, decay: 0.22, vib: { hz: 18, cents: 90 } });
      tone(g, t + 0.05, { type: 'sawtooth', freq: 523 * p, freqEnd: 520 * p, peak: 0.05, decay: 0.3, filter: { type: 'bandpass', freq: 2000, q: 4 } });
      break;
    case 'cucumber': // a cartoon "sproing" up and over
      tone(g, t, { type: 'square', freq: 220 * p, freqEnd: 1100 * p, glide: 0.3, peak: 0.07, decay: 0.32, filter: { type: 'lowpass', freq: 3000 } });
      whoosh(g, t + 0.05, 0.6, 1.2, 0.18, 103);
      break;
    case 'bell': // a deep gong that wobbles
      bell(g, t, 196 * p, 0.2, 1.2);
      tone(g, t, { type: 'sine', freq: 392 * p, peak: 0.08, decay: 0.9, vib: { hz: 7, cents: 45 } });
      break;
    case 'zoomies': // knocked aside: a zap and a cartoon bonk
      tone(g, t, { type: 'sawtooth', freq: 1800 * p, freqEnd: 240, peak: 0.08, decay: 0.16, filter: { type: 'lowpass', freq: 4000 } });
      tone(g, t + 0.04, { type: 'triangle', freq: 640 * p, freqEnd: 300, peak: 0.16, decay: 0.12 });
      break;
    case 'laser': // the dot: a fizzy buzz, the cat goes "mrrp?!" (chase)
      tone(g, t, { type: 'square', freq: 880 * p, peak: 0.05, hold: 0.18, decay: 0.12, filter: { type: 'bandpass', freq: 2400, q: 3 }, vib: { hz: 30, cents: 120 } });
      if (!confirm) mrrp(g, t + 0.12, 0.9, 1.25);
      break;
    case 'box':
    case 'catnip':
    default:
      tone(g, t, { freq: 160 * p, freqEnd: 50, peak: 0.3, decay: 0.2 });
  }
}

/** Hazard sounds, one per kind (HAZARD_KINDS order). */
function hazardSound(g: SynthGraph, t: number, kind: HazardKind | undefined): void {
  switch (kind) {
    case 'roomba': // whirr + plastic bonk
      tone(g, t, { type: 'sawtooth', freq: 140, freqEnd: 90, peak: 0.06, hold: 0.12, decay: 0.12, filter: { type: 'lowpass', freq: 900 } });
      tone(g, t + 0.02, { type: 'triangle', freq: 720, freqEnd: 360, peak: 0.16, decay: 0.1 });
      bell(g, t + 0.14, 1560, 0.04, 0.2); // its little "beep-boop"
      bell(g, t + 0.22, 1170, 0.04, 0.2);
      break;
    case 'laundry': // a sheet flapping
      for (let i = 0; i < 3; i++) noise(g, t + i * 0.07, { peak: 0.22 - i * 0.05, decay: 0.06, filter: { type: 'bandpass', freq: 900 + i * 300, q: 1 }, seed: 111 + i });
      break;
    case 'milk': // splash and slide
      noise(g, t, { peak: 0.28, decay: 0.25, filter: { type: 'bandpass', freq: 1200, freqEnd: 500, q: 1.5 }, seed: 121 });
      tone(g, t + 0.06, { type: 'sine', freq: 900, freqEnd: 500, glide: 0.4, peak: 0.06, decay: 0.4, vib: { hz: 12, cents: 40 } });
      break;
    case 'toaster': // the pop: spring + ding
      tone(g, t, { type: 'triangle', freq: 300, freqEnd: 900, glide: 0.06, peak: 0.18, decay: 0.1 });
      bell(g, t + 0.05, 2093, 0.08, 0.5);
      noise(g, t, { peak: 0.2, decay: 0.05, filter: { type: 'highpass', freq: 3000 }, seed: 131 });
      break;
    case 'steam': // a hiss
      noise(g, t, { peak: 0.2, attack: 0.04, hold: 0.3, decay: 0.3, filter: { type: 'highpass', freq: 3500, freqEnd: 5500 }, seed: 141 });
      break;
    case 'drum': // the spinning drum: a metal clank
      tone(g, t, { type: 'square', freq: 210, freqEnd: 180, peak: 0.08, decay: 0.2, filter: { type: 'bandpass', freq: 1200, q: 6 } });
      tone(g, t, { type: 'square', freq: 333, peak: 0.05, decay: 0.25, filter: { type: 'bandpass', freq: 2600, q: 8 } });
      noise(g, t, { peak: 0.18, decay: 0.08, filter: { type: 'bandpass', freq: 2200, q: 2 }, seed: 151 });
      break;
    default:
      tone(g, t, { type: 'triangle', freq: 400, freqEnd: 200, peak: 0.12, decay: 0.12 });
  }
}

/** Synthesise one cue at context time `t`. */
export function playCue(g0: SynthGraph, c: Cue, t0: number): void {
  const t = t0 + c.delay;
  let g = g0;
  if (c.vol < 0.999) {
    const v = g0.ctx.createGain();
    v.gain.value = Math.max(0, c.vol);
    v.connect(g0.out);
    g = { ...g0, out: v };
  }
  const r = prng(Math.floor(t0 * 1000) ^ (c.n * 131));
  switch (c.id) {
    case 'count':
      // the beat under the announcer's "mrrp": a hand clap and a woodblock pitched up per number
      tone(g, t, { type: 'square', freq: 440 + (3 - c.n) * 60, peak: 0.07, decay: 0.12, filter: { type: 'lowpass', freq: 2400 } });
      noise(g, t, { peak: 0.16, decay: 0.05, filter: { type: 'bandpass', freq: 1500, q: 1.5 }, seed: 1 });
      break;
    case 'go':
      tone(g, t, { type: 'square', freq: 880, peak: 0.1, decay: 0.3, filter: { type: 'lowpass', freq: 3000 } });
      brass(g, t, 440, 0.25, 0.25);
      brass(g, t, 659.25, 0.25, 0.16);
      break;
    case 'pounce':
      tone(g, t, { type: 'square', freq: 660, freqEnd: 1320, glide: 0.12, peak: 0.08, decay: 0.2, filter: { type: 'lowpass', freq: 4000 } });
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
      // 12 bell ticks that slow down (1.2 s, like the roulette)
      for (let i = 0; i < 12; i++) bell(g, t + 0.05 * i + 0.004 * i * i, i % 2 ? 2093 : 1760, 0.045, 0.08);
      break;
    case 'itemReady':
      bell(g, t, 1568, 0.08, 0.35);
      bell(g, t + 0.07, 2093, 0.08, 0.5);
      break;
    case 'item':
      itemSound(g, t, c.item, c.n === 1, c.pitch);
      break;
    case 'itemFizzle':
      // nobody ahead: a deflating "pfft"
      tone(g, t, { type: 'square', freq: 700, freqEnd: 180, peak: 0.06, decay: 0.3, filter: { type: 'lowpass', freq: 2000 } });
      noise(g, t, { peak: 0.1, decay: 0.25, filter: { type: 'bandpass', freq: 3000, freqEnd: 800, q: 1 }, seed: 67 });
      break;
    case 'hit':
      hitLayer(g, t, c.item, false);
      hiss(g, t, 1.2);
      if (c.n === 1) scream(g, t + 0.05, 1); // leap = cucumber fright
      else meow(g, t + 0.15, 1, c.pitch * 0.9);
      break;
    case 'hitConfirm':
      // you landed one: the item's hit sound, brighter, plus a crunchy, satisfying ding
      hitLayer(g, t, c.item, true);
      bell(g, t + 0.02, G5 * 2, 0.12, 0.4);
      tone(g, t, { type: 'square', freq: 990, freqEnd: 1480, peak: 0.07, decay: 0.1 });
      break;
    case 'blocked':
      if (c.item === 'yarn') {
        // the held yarn ate it: a soft thump into wool
        tone(g, t, { type: 'triangle', freq: 260, freqEnd: 140, peak: 0.2, decay: 0.15 });
        noise(g, t, { peak: 0.12, decay: 0.12, filter: { type: 'lowpass', freq: 600 }, seed: 71 });
      } else {
        // cardboard "thok" and a bright ping
        noise(g, t, { peak: 0.25, decay: 0.06, filter: { type: 'bandpass', freq: 900, q: 2 }, seed: 73 });
        bell(g, t, 3100, 0.1, 0.25);
      }
      tone(g, t, { type: 'triangle', freq: 700, freqEnd: 400, peak: 0.12, decay: 0.12 });
      break;
    case 'respawnHand':
      // the big hand swoops down
      whoosh(g, t, 0.7, 0.6, 0.3, 61);
      tone(g, t, { type: 'sine', freq: 700, freqEnd: 260, glide: 0.5, peak: 0.08, decay: 0.55 });
      break;
    case 'respawn':
      // set down: a soft "pomf" and a relieved trill
      tone(g, t, { freq: 180, freqEnd: 90, peak: 0.2, decay: 0.12 });
      mrrp(g, t + 0.1, 1, c.pitch);
      break;
    case 'lap':
      [C5, E5, G5].forEach((hz, i) => tone(g, t + i * 0.08, { type: 'square', freq: hz, peak: 0.09, decay: 0.12, filter: { type: 'lowpass', freq: 3200 } }));
      break;
    case 'finalLap':
      brass(g, t, 392, 0.12, 0.35);
      brass(g, t + 0.14, 523.25, 0.12, 0.38);
      brass(g, t + 0.28, 659.25, 0.5, 0.42);
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
      break;
    case 'podium':
      [C5, E5, G5, C6].forEach((hz, i) => tone(g, t + i * 0.11, { type: 'square', freq: hz, peak: 0.1, decay: 0.18, filter: { type: 'lowpass', freq: 3200 } }));
      break;
    case 'finish':
      [G5, E5, C5].forEach((hz, i) => tone(g, t + i * 0.12, { type: 'triangle', freq: hz, peak: 0.1, decay: 0.2 }));
      break;
    case 'slipstream':
      whoosh(g, t, 0.6, 1.8, 0.2, 67);
      break;
    case 'catnip':
      [C6, 1318.5, 1568].forEach((hz, i) => bell(g, t + i * 0.05, hz, 0.05, 0.3));
      break;
    case 'coin': {
      // pling: a two-note chime that climbs a major scale with every coin held; the 10th is a sparkle chord
      const held = Math.max(1, Math.min(10, c.n));
      const steps = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
      const hz = 1046.5 * Math.pow(2, steps[held - 1] / 12);
      tone(g, t, { type: 'square', freq: hz, peak: 0.05, decay: 0.07, filter: { type: 'lowpass', freq: 6000 } });
      bell(g, t + 0.05, hz * 1.5, 0.06, 0.25);
      if (held === 10) [1, 1.25, 1.5, 2].forEach((m, i) => bell(g, t + 0.1 + i * 0.04, hz * m, 0.04, 0.3));
      break;
    }
    case 'coinLoss':
      // coins scatter: falling plinks
      for (let i = 0; i < Math.min(3, Math.max(1, c.n)); i++) bell(g, t + i * 0.06, 1760 - i * 260, 0.05, 0.15);
      break;
    case 'hazard':
      hazardSound(g, t, HAZARD_KINDS[c.n]);
      break;
    case 'wrongWay':
      // a two-tone buzzer
      tone(g, t, { type: 'square', freq: 220, peak: 0.06, hold: 0.12, decay: 0.05, filter: { type: 'lowpass', freq: 1500 } });
      tone(g, t + 0.2, { type: 'square', freq: 185, peak: 0.06, hold: 0.12, decay: 0.05, filter: { type: 'lowpass', freq: 1500 } });
      break;
    case 'balloonPop':
      noise(g, t, { peak: c.n ? 0.45 : 0.3, decay: 0.05, filter: { type: 'highpass', freq: 1200 }, seed: 161 });
      tone(g, t, { type: 'sine', freq: 900, freqEnd: 200, glide: 0.08, peak: 0.12, decay: 0.08 });
      break;
    case 'balloonSteal':
      // a cheeky slide whistle up and a pop of ownership
      tone(g, t, { type: 'sine', freq: 500, freqEnd: 1600, glide: 0.25, peak: 0.1, decay: 0.28, vib: { hz: 6, cents: 20 } });
      bell(g, t + 0.25, 2093, 0.08, 0.35);
      break;
    case 'eliminated':
      // a game-show "out" horn, falling
      brass(g, t, 233, 0.3, c.n ? 0.3 : 0.15);
      brass(g, t + 0.32, 196, 0.6, c.n ? 0.3 : 0.15);
      break;
    case 'checkpoint':
      bell(g, t, 1318.5, 0.06, 0.25);
      break;
    case 'splitAhead':
      [E5, G5, C6].forEach((hz, i) => bell(g, t + i * 0.06, hz, 0.07, 0.3));
      break;
    case 'splitBehind':
      [G5, E5, C5 * 0.94].forEach((hz, i) => tone(g, t + i * 0.08, { type: 'triangle', freq: hz, peak: 0.08, decay: 0.16 }));
      break;
    case 'grudge':
      // a rival growls at you
      tone(g, t, { type: 'sawtooth', freq: 110, freqEnd: 95, peak: 0.08, hold: 0.25, decay: 0.2, filter: { type: 'lowpass', freq: 600 }, vib: { hz: 24, cents: 60 } });
      break;
    case 'incoming': {
      // kind 0 hairball: a low knock · 1 yarn: a whirring two-tone · 2 laser: a high sonar ping
      if (c.n === 2) tone(g, t, { type: 'sine', freq: 2600, peak: 0.07, decay: 0.07 });
      else if (c.n === 1) {
        tone(g, t, { type: 'triangle', freq: 880, peak: 0.06, decay: 0.05 });
        tone(g, t + 0.05, { type: 'triangle', freq: 660, peak: 0.05, decay: 0.05 });
      } else tone(g, t, { type: 'square', freq: 520, peak: 0.05, decay: 0.05, filter: { type: 'lowpass', freq: 2000 } });
      break;
    }
    case 'timerTick':
      tone(g, t, { type: 'square', freq: c.n <= 3 ? 1320 : 990, peak: 0.07, decay: 0.07, filter: { type: 'lowpass', freq: 4000 } });
      break;
    case 'timeUp':
      brass(g, t, 349.23, 0.7, 0.35);
      brass(g, t, 440, 0.7, 0.25);
      break;
    case 'loopRush':
      // the loop: a long rising rush that peaks at the top of the ring, and a motor whine climbing with it
      noise(g, t, { peak: 0.26, attack: 0.9, decay: 1.1, filter: { type: 'bandpass', freq: 300, freqEnd: 3800, q: 1.4 }, seed: 171 });
      tone(g, t, { type: 'sawtooth', freq: 220, freqEnd: 880, glide: 1.6, peak: 0.05, attack: 0.3, hold: 0.9, decay: 0.8, filter: { type: 'lowpass', freq: 1800, freqEnd: 4200 } });
      break;
    case 'loopOut':
      // out of the loop with the exit boost: a turbo whoosh, a bright sting and a happy "wheee" meow
      whoosh(g, t, 0.6, 1.5, 0.4, 173);
      [G5, C6, E5 * 2].forEach((hz, i) => bell(g, t + 0.03 + i * 0.05, hz, 0.06, 0.3));
      happyMeow(g, t + 0.06, 1.1, c.pitch * 1.2);
      break;
    case 'wallOn':
      // onto the wall lane: the tyres bite the curl (a low hum swell)
      tone(g, t, { type: 'triangle', freq: 90, freqEnd: 140, peak: 0.12, attack: 0.08, hold: 0.25, decay: 0.3, vib: { hz: 22, cents: 30 } });
      whoosh(g, t, 0.45, 0.7, 0.18, 177);
      break;
    case 'wallOff':
      // a clean wall ride: a little slide-up and a chime
      tone(g, t, { type: 'sine', freq: 520, freqEnd: 1040, glide: 0.15, peak: 0.07, decay: 0.2 });
      bell(g, t + 0.12, C6 * 1.5, 0.05, 0.3);
      break;
    case 'gapLaunch':
      // off the lip: the cat lets out a delighted chirp over the launch whoosh
      whoosh(g, t, 0.55, 1.2, 0.28, 179);
      trill(g, t + 0.05, 0.9);
      break;
    case 'gapLand':
      // a clean landing: a soft thump and a sparkle (the landing boost)
      tone(g, t, { freq: 140, freqEnd: 55, peak: 0.32, decay: 0.18 });
      [C6, E5 * 2, G5 * 2].forEach((hz, i) => bell(g, t + 0.05 + i * 0.04, hz, 0.05, 0.35));
      whoosh(g, t + 0.04, 0.4, 1.6, 0.22, 181);
      break;
    case 'net':
      // the catch net: a soft cartoon "boing" into a cushion, and a relieved mrrp
      tone(g, t, { type: 'triangle', freq: 160, freqEnd: 420, glide: 0.12, peak: 0.16, decay: 0.35, vib: { hz: 14, cents: 120 } });
      noise(g, t, { peak: 0.14, decay: 0.2, filter: { type: 'lowpass', freq: 500 }, seed: 183 });
      mrrp(g, t + 0.3, 0.9, c.pitch);
      break;
    case 'tunnelIn':
      // into the tunnel: a dark rush closing in
      noise(g, t, { peak: 0.24, attack: 0.05, decay: 0.45, filter: { type: 'lowpass', freq: 2400, freqEnd: 500, q: 1.5 }, seed: 187 });
      break;
    case 'tunnelOut':
      // back into the open: a bright whoosh opening up
      whoosh(g, t, 0.5, 1.4, 0.3, 191);
      break;
    case 'combo': {
      // a stunt combo: a rising arpeggio, one step higher per stunt in the chain
      const n = Math.max(2, Math.min(6, c.n));
      for (let i = 0; i < n; i++) bell(g, t + i * 0.045, C5 * Math.pow(2, (i * 4) / 12), 0.05, 0.25);
      break;
    }
  }
}

/** Rough length of each cue in seconds (how long it holds a voice in the budget). */
export function cueLength(id: SfxId): number {
  switch (id) {
    case 'roulette':
    case 'win':
      return 1.3;
    case 'loopRush':
      return 2;
    case 'finalLap':
    case 'podium':
    case 'go':
    case 'eliminated':
      return 0.9;
    case 'hit':
    case 'respawn':
    case 'respawnHand':
    case 'finish':
    case 'turbo':
    case 'pounce':
    case 'timeUp':
    case 'loopOut':
    case 'net':
    case 'gapLand':
      return 0.6;
    case 'incoming':
    case 'timerTick':
    case 'checkpoint':
      return 0.1;
    default:
      return 0.3;
  }
}

/** Voice ceilings per priority (GDD 10: 24 voices). Priority 3 alone may fill the last voices. */
export const PRIO_CAP: readonly number[] = [14, 18, 21, 24];

/**
 * Voice budget (GDD 10: at most 24 voices). A voice is one cue, one music note or one announcer line while it sounds.
 * A cue is admitted only while the voices sounding stay under its priority's ceiling (`PRIO_CAP`), so the total never
 * passes `max` and the important sounds (countdown, hits, laps, finish, the announcer) always find room.
 */
export class VoiceBudget {
  private ends: number[] = [];
  /** the most voices ever sounding at once (QA, e2e) */
  peak = 0;
  constructor(readonly max = 24) {}

  get active(): number {
    return this.ends.length;
  }

  admit(now: number, prio: number, dur: number): boolean {
    if (this.ends.length) this.ends = this.ends.filter((e) => e > now);
    const p = Math.max(0, Math.min(3, Math.floor(prio)));
    const cap = Math.min(this.max, Math.round((PRIO_CAP[p] / 24) * this.max));
    if (this.ends.length >= cap) return false;
    this.ends.push(now + dur);
    if (this.ends.length > this.peak) this.peak = this.ends.length;
    return true;
  }

  clear(): void {
    this.ends.length = 0;
  }
}
