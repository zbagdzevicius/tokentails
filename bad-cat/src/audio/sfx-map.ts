/**
 * L7 Audio: pure mapping from sim events to synth cues (GDD 12). No WebAudio here, so Node tests can
 * import it. The synth (synth.ts) turns each Cue into oscillators and filtered noise.
 */
import {
  FALL_TICKS,
  HumanSt,
  NOISE,
  ROOMBA_STEP_TICKS,
  TICK_HZ,
  propKind,
  type ClipPlan,
  type Level,
  type PlayableRoom,
  type PropMaterial,
  type RoomTheme,
  type SimEvent,
  type SimState,
  type Speed,
} from '../types';
import type { Persona } from './voices';

export type CueId =
  | 'step' // paw step; level = surface (0 floor, 1 chair, 2 counter, 3 shelf), speed 1 sneak / 2 trot
  | 'jumpUp'
  | 'jumpDown'
  | 'swat' // "pap"
  | 'swatAir'
  | 'wobble' // glass tink or rattle by material
  | 'push' // scrape
  | 'fall' // slide-whistle drop, dur = fall time
  | 'crash' // the payoff: material-specific, mixed ~3.5 dB above the rest
  | 'splat' // food spill
  | 'land' // non-breaking landing by material (plastic bonk, paper flutter, fabric thud)
  | 'bonk' // occupied-landing hit
  | 'target' // Must-Wreck gold chime
  | 'combo' // combo tick, pitch rises with the combo
  | 'grab'
  | 'drop'
  | 'stash'
  | 'purr'
  | 'hm' // TELEGRAPH: two-note "hm?" sting + voice
  | 'doubleTake' // LOOK: the double-take stab + gasp
  | 'hum' // FAKEOUT: relieved humming
  | 'eventCue' // doorbell / kettle / phone / TV jingle (eventKind)
  | 'seen' // spotted alert tick
  | 'lastCall'
  | 'caught' // softened wah-wah
  | 'badKitty' // the cuddle "BAD KITTY" jingle
  | 'perfect' // 4-note brass hit
  | 'stamp' // stamp slam
  | 'go'
  // ----- v5 (W1-AUDIO) -----
  | 'slide' // rubbery skid + "wheee" squeak
  | 'stackClink' // cascade of N clinks rising (items)
  | 'pullCloth' // fabric swoosh + rip
  | 'pullCable' // twang + lamp wobble
  | 'topple' // creak, whoosh, jingle-bell crash (crash class)
  | 'puddle' // small splat (variant 0 slip, 1 soil)
  | 'roombaHum' // soft hum while it moves one cell
  | 'framed' // comedic "dun dun DUN"
  | 'wish' // sparkly chime + happy mrrp
  | 'enter' // cardboard thunk + purr
  | 'noiseRise' // Napper noise meter crossed a quarter (amount 0.25..1): rising snore tension
  | 'wake' // big yawn + "hm?"
  | 'snore' // Napper snore (amount = noise meter 0..1)
  | 'glint' // seen in the mirror
  | 'shutter' // crash on camera
  | 'teleCue' // routine telegraph: stove timer, TV jingle, mirror hum, mute chime (teleKind)
  | 'sigh' // human relaxes back to BUSY
  | 'comeHere' // "come here" after "BAD KITTY"
  | 'nyeCountdown'; // NYE last call

export interface Cue {
  id: CueId;
  /** Sim tick that caused it (offline timing). */
  tick: number;
  /** Extra delay after the tick, in seconds. */
  delay: number;
  /** Pitch offset in semitones. */
  pitch: number;
  /** Linear gain multiplier on the recipe's own level (1 = as designed). */
  gain: number;
  /** Deterministic variant 0..2 (glass 3 variants, ceramic 3 ...). */
  variant: number;
  material?: PropMaterial;
  level?: Level;
  speed?: Speed;
  /** RoomEventKind for eventCue. */
  eventKind?: number;
  /** Duration in seconds for cues with a natural length (fall). */
  dur?: number;
  // ----- v5 (W1-AUDIO) -----
  /** Whose voice (human cues). */
  persona?: Persona;
  /** Prop-specific recipe for kinds 16..63 (balloon pop, flour poof...). */
  special?: SpecialSound;
  /** Count: stack items, pull props moved, topple cells. */
  items?: number;
  /** 0..1 intensity: noise meter level for snore / noiseRise. */
  amount?: number;
  /** Telegraph cue kind (rooms.ts TELE_*). */
  teleKind?: number;
}

/** Prop-specific sounds for the Appendix A / Season 1 kinds (W1-AUDIO). */
export type SpecialSound =
  | 'balloon'
  | 'flour'
  | 'popcorn'
  | 'champagne'
  | 'cups'
  | 'paper'
  | 'gift'
  | 'tray'
  | 'tree'
  | 'bubbles'
  | 'ornament'
  | 'boardgame';

/** PropKindDef.id -> special recipe. Everything else plays its material. */
export const SPECIAL_BY_ID: Readonly<Record<string, SpecialSound>> = {
  balloon: 'balloon',
  'flour-bag': 'flour',
  'popcorn-bowl': 'popcorn',
  'snack-tower': 'popcorn',
  'champagne-bottle': 'champagne',
  'champagne-tower': 'champagne',
  'cups-tower': 'cups',
  'receipt-pile': 'paper',
  'gift-wrap': 'paper',
  'gift-stack': 'gift',
  'box-tower': 'gift',
  'cardboard-box': 'gift',
  'cookie-tray': 'tray',
  'christmas-tree': 'tree',
  'bubble-wrap': 'bubbles',
  ornament: 'ornament',
  'board-game': 'boardgame',
};

export function specialOf(kind: number | undefined): SpecialSound | undefined {
  if (kind === undefined) return undefined;
  const d = propKind(kind);
  return d ? SPECIAL_BY_ID[d.id] : undefined;
}

/** What the audio needs to know about the room (built by roomAudioFor from a PlayableRoom). */
export interface RoomAudio {
  eventKind: number;
  /** Persona per human index (0 = routine, 1 = routine2). */
  personas: (Persona | undefined)[];
  /** Human index is a Napper (Sunday). */
  nappers: boolean[];
  /** Telegraph cue kind per human (-1 none). */
  teleKinds: number[];
  theme: RoomTheme;
  boss: boolean;
}

export const DEFAULT_ROOM_AUDIO: RoomAudio = {
  eventKind: 0,
  personas: [],
  nappers: [],
  teleKinds: [],
  theme: 'default',
  boss: false,
};

export function roomAudioFor(play: PlayableRoom): RoomAudio {
  const rs = [play.routine, play.routine2].filter((r): r is NonNullable<typeof r> => !!r);
  return {
    eventKind: (play.room.event | 0) >= 0 ? play.room.event | 0 : 0,
    personas: rs.map((r) => r.persona ?? (r.kind === 'napper' ? 'napper' : undefined)),
    nappers: rs.map((r) => r.kind === 'napper'),
    teleKinds: rs.map((r) => teleKindFor(r.cue)),
    theme: play.room.theme ?? 'default',
    boss: !!play.room.boss || !!play.routine2,
  };
}

/** Lookup context: what cuesFor needs beyond the events. Built from SimState live, from memory offline. */
export interface CueContext {
  /** Prop kind by index, or undefined. */
  kindOf(prop: number): number | undefined;
  /** Target level of a falling prop (for the fall length), or undefined. */
  levelOf?(prop: number): Level | undefined;
  /** Final stamp for the 'end' event (1 perfect, 2 clean, 3 caught), 0 unknown. */
  stamp?: number;
  /** RoomEventKind (0 doorbell, 1 kettle, 2 phone, 3 ad break, ... 11 on mute). */
  eventKind?: number;
  /** v5 room context: personas, nappers, telegraph cues, theme. */
  room?: RoomAudio;
  /** Offline only: infer Roomba pauses (a gap between moves) and bonk there. */
  inferRoombaPause?: boolean;
}

/** Telegraph cue kinds, picked from RoutineDef.cue. */
export const TELE_STOVE = 0;
export const TELE_TV = 1;
export const TELE_MIRROR = 2;
export const TELE_MUTE = 3;
/** Round 3: the Christmas Host's sleigh bells. */
export const TELE_BELLS = 4;

/** RoutineDef.cue label -> telegraph cue kind, -1 = none (the "hm?" sting alone). */
export function teleKindFor(cue: string | undefined): number {
  const c = (cue ?? '').toLowerCase();
  if (!c) return -1;
  if (c.includes('mute')) return TELE_MUTE;
  if (c.includes('mirror')) return TELE_MIRROR;
  if (c.includes('tv') || c.includes('jingle') || c.includes('ad ')) return TELE_TV;
  if (c.includes('stove') || c.includes('timer')) return TELE_STOVE;
  if (c.includes('bell')) return TELE_BELLS;
  return -1;
}

/** Ticks between two Napper snores (2.5 s). */
export const SNORE_TICKS = 75;

/** Semitones per combo step above x1, capped at COMBO_MAX. */
export const COMBO_SEMITONES = 2;

function cue(id: CueId, tick: number, extra?: Partial<Cue>): Cue {
  return { id, tick, delay: 0, pitch: 0, gain: 1, variant: 0, ...extra };
}

export function materialOf(ctx: CueContext, prop: number): PropMaterial {
  const k = ctx.kindOf(prop);
  return (k !== undefined && propKind(k)?.material) || 'ceramic';
}

function variantOf(prop: number, tick: number): number {
  return (((prop * 7 + tick) % 3) + 3) % 3;
}

/** Core mapping, usable with or without a SimState. */
export function cuesForContext(events: readonly SimEvent[], ctx: CueContext): Cue[] {
  const out: Cue[] = [];
  const room = ctx.room;
  const personaOf = (h: number): Persona | undefined => room?.personas[h];
  let lastRoomba = -1;
  for (const e of events) {
    switch (e.t) {
      case 'step':
        out.push(cue('step', e.tick, { level: e.level, speed: e.speed === 0 ? 1 : e.speed, variant: e.tick % 3 }));
        break;
      case 'jump':
        out.push(cue(e.to > e.from ? 'jumpUp' : 'jumpDown', e.tick, { level: e.to }));
        break;
      case 'swat':
        out.push(cue(e.prop < 0 ? 'swatAir' : 'swat', e.tick, { variant: e.tick % 3 }));
        break;
      case 'wobble':
        out.push(cue('wobble', e.tick, { material: materialOf(ctx, e.prop), variant: variantOf(e.prop, e.tick) }));
        break;
      case 'push':
        out.push(cue('push', e.tick));
        break;
      case 'fall': {
        const to = ctx.levelOf?.(e.prop);
        const ticks = to !== undefined ? FALL_TICKS[e.from]?.[to] ?? 0 : 0;
        const dur = ticks > 0 ? ticks / TICK_HZ : 0.2 + e.from * 0.12;
        out.push(cue('fall', e.tick, { level: e.from, dur }));
        break;
      }
      case 'break':
      case 'land':
      case 'spill':
      case 'hit': {
        const material = materialOf(ctx, e.prop);
        const variant = variantOf(e.prop, e.tick);
        const special = specialOf(ctx.kindOf(e.prop));
        if (e.t === 'break' || e.t === 'spill') {
          if (special) out.push(cue('crash', e.tick, { material, variant, special }));
          else if (e.t === 'break') out.push(cue(material === 'food' ? 'splat' : 'crash', e.tick, { material, variant }));
          else out.push(cue('splat', e.tick, { material, variant }));
        } else if (e.t === 'land') out.push(cue('land', e.tick, { material, variant, special }));
        else out.push(cue('bonk', e.tick, { material, variant }));
        if (e.points > 0 && e.combo >= 2) {
          const c = Math.min(e.combo, 8);
          out.push(cue('combo', e.tick, { delay: 0.12, pitch: (c - 1) * COMBO_SEMITONES }));
        }
        if (e.cam) out.push(cue('shutter', e.tick, { delay: 0.18 }));
        break;
      }
      case 'target':
        out.push(cue('target', e.tick, { delay: 0.2 }));
        break;
      case 'grab':
        out.push(cue('grab', e.tick));
        break;
      case 'drop':
        out.push(cue('drop', e.tick));
        break;
      case 'stash':
        out.push(cue('stash', e.tick));
        break;
      case 'loaf':
        out.push(cue('purr', e.tick, { gain: 0.6, dur: 1.4 }));
        break;
      case 'human': {
        const persona = personaOf(e.human);
        const napper = !!room?.nappers[e.human];
        if (e.state === 'telegraph') {
          // the Napper's TELEGRAPH is the yawn of its 'wake' event
          if (napper) break;
          const tk = room?.teleKinds[e.human] ?? -1;
          if (tk >= 0) out.push(cue('teleCue', e.tick, { teleKind: tk }));
          out.push(cue('hm', e.tick, { persona, delay: tk >= 0 ? 0.15 : 0 }));
        } else if (e.state === 'look') out.push(cue('doubleTake', e.tick, { persona }));
        else if (e.state === 'fakeout') out.push(cue('hum', e.tick, { persona }));
        else if (e.state === 'event') out.push(cue('eventCue', e.tick, { eventKind: ctx.eventKind ?? room?.eventKind ?? 0 }));
        else if (e.state === 'nap') out.push(cue('snore', e.tick, { persona, amount: 0, delay: 0.4 }));
        else if (e.state === 'busy' && e.tick >= TICK_HZ) out.push(cue('sigh', e.tick, { persona, gain: 0.7 }));
        break;
      }
      case 'seen':
        out.push(cue('seen', e.tick));
        if (e.by === 'mirror') out.push(cue('glint', e.tick));
        break;
      case 'cantReach':
        // round 3: the refused floor-to-table jump gets a soft fabric bonk, a little low (the cat bumps the edge)
        out.push(cue('bonk', e.tick, { material: 'fabric', gain: 0.8, pitch: -4 }));
        break;
      case 'lastcall':
        out.push(cue('lastCall', e.tick));
        if (room?.theme === 'nye') out.push(cue('nyeCountdown', e.tick, { delay: 0.5 }));
        break;
      case 'caught': {
        const persona = personaOf(0);
        out.push(cue('badKitty', e.tick, { persona }));
        out.push(cue('comeHere', e.tick, { persona, delay: 0.9 }));
        out.push(cue('caught', e.tick, { delay: 1.6 }));
        out.push(cue('purr', e.tick, { delay: 2.6, dur: 2.2 }));
        break;
      }
      case 'end':
        if (ctx.stamp === 1) out.push(cue('perfect', e.tick, { delay: 0.2 }));
        else if (ctx.stamp === 2) out.push(cue('stamp', e.tick, { delay: 0.2 }));
        break;
      // ----- v5 -----
      case 'slide':
        out.push(cue('slide', e.tick, { variant: e.tick % 3 }));
        break;
      case 'stack':
        out.push(cue('stackClink', e.tick, { material: materialOf(ctx, e.prop), items: Math.max(1, e.items | 0), special: specialOf(ctx.kindOf(e.prop)) }));
        break;
      case 'pull':
        out.push(cue(e.kind === 'cable' ? 'pullCable' : 'pullCloth', e.tick, { items: e.moved }));
        break;
      case 'topple':
        out.push(cue('topple', e.tick, { items: e.cells, special: specialOf(ctx.kindOf(e.prop)) ?? 'tree' }));
        break;
      case 'puddle':
        out.push(cue('puddle', e.tick, { variant: e.kind === 2 ? 1 : 0 }));
        break;
      case 'noise': {
        const amount = Math.min(1, Math.max(0, e.level / NOISE.max));
        out.push(cue('noiseRise', e.tick, { amount, pitch: Math.round(amount * 8) }));
        break;
      }
      case 'wake':
        out.push(cue('wake', e.tick, { persona: personaOf(e.human) ?? 'napper' }));
        break;
      case 'enter':
        out.push(cue('enter', e.tick));
        break;
      case 'roomba':
        if (ctx.inferRoombaPause && lastRoomba >= 0 && e.tick - lastRoomba > ROOMBA_STEP_TICKS + 6)
          out.push(cue('bonk', lastRoomba + ROOMBA_STEP_TICKS, { material: 'actor', gain: 0.6, pitch: -3 }));
        lastRoomba = e.tick;
        out.push(cue('roombaHum', e.tick, { dur: ROOMBA_STEP_TICKS / TICK_HZ }));
        break;
      case 'framed':
        out.push(cue('framed', e.tick, { delay: 0.25 }));
        break;
      case 'wish':
        out.push(cue('wish', e.tick, { delay: 0.15 }));
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Offline Napper snores for a clip window: replays the nap state of every napper human from all events
 * before the window (a napper starts asleep), then emits a snore every SNORE_TICKS while asleep. The snore
 * grows tense with the last noise level.
 */
export function snoreCues(events: readonly SimEvent[], fromTick: number, toTick: number, room: RoomAudio | undefined): Cue[] {
  if (!room || !room.nappers.some(Boolean)) return [];
  const asleep = room.nappers.map((n) => n);
  const since = room.nappers.map(() => fromTick);
  let noiseLv = 0;
  const out: Cue[] = [];
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  let i = 0;
  for (; i < sorted.length && sorted[i].tick < fromTick; i++) {
    const e = sorted[i];
    if (e.t === 'human' && room.nappers[e.human]) asleep[e.human] = e.state === 'nap';
    if (e.t === 'noise') noiseLv = e.level;
    if (e.t === 'wake' && room.nappers[e.human]) asleep[e.human] = false;
  }
  const flush = (h: number, until: number): void => {
    for (let t = since[h] + SNORE_TICKS / 2; t < until; t += SNORE_TICKS) {
      const ti = Math.round(t);
      out.push(cue('snore', ti, { persona: room.personas[h] ?? 'napper', amount: Math.min(1, noiseLv / NOISE.max) }));
    }
  };
  for (; i < sorted.length && sorted[i].tick < toTick; i++) {
    const e = sorted[i];
    if (e.t === 'noise') noiseLv = e.level;
    if ((e.t === 'human' || e.t === 'wake') && room.nappers[e.human]) {
      const nowAsleep = e.t === 'human' && e.state === 'nap';
      if (asleep[e.human] && !nowAsleep) flush(e.human, e.tick);
      if (!asleep[e.human] && nowAsleep) since[e.human] = e.tick;
      asleep[e.human] = nowAsleep;
    }
  }
  for (let h = 0; h < asleep.length; h++) if (asleep[h]) flush(h, toTick);
  return out.sort((a, b) => a.tick - b.tick);
}

/** Live per-tick extras the events do not carry: Napper snores and the Roomba bumping into something. */
export interface LiveTickMemo {
  roombaPause: number;
}
export function liveTickCues(s: SimState, room: RoomAudio | undefined, memo: LiveTickMemo): Cue[] {
  const out: Cue[] = [];
  for (let h = 0; h < s.humans.length; h++) {
    if (s.humans[h].state === HumanSt.NAP && s.tick > 0 && s.tick % SNORE_TICKS === 0)
      out.push(cue('snore', s.tick, { persona: room?.personas[h] ?? 'napper', amount: Math.min(1, (s.noise ?? 0) / NOISE.max) }));
  }
  const pause = s.roomba?.pause ?? 0;
  if (pause > 0 && memo.roombaPause === 0) out.push(cue('bonk', s.tick, { material: 'actor', gain: 0.6, pitch: -3 }));
  memo.roombaPause = pause;
  return out;
}

/** Live mapping: material, fall length and stamp come from the state. */
export function cuesFor(events: readonly SimEvent[], s: SimState, opts?: { eventKind?: number; room?: RoomAudio }): Cue[] {
  const ctx: CueContext = {
    kindOf: (i) => s.props[i]?.kind,
    levelOf: (i) => s.props[i]?.level,
    stamp: s.stamp,
    eventKind: opts?.eventKind,
    room: opts?.room,
  };
  return cuesForContext(events, ctx);
}

/** Music layer the human state calls for: calm (busy), sneaky (telegraph/look/fakeout), full (room event). */
export type MusicMode = 'calm' | 'sneaky' | 'full' | 'quiet';
export function musicModeFor(s: SimState): MusicMode {
  if (s.ended || s.caughtTick >= 0) return 'quiet';
  let mode: MusicMode = 'calm';
  for (const h of s.humans) {
    if (h.state === HumanSt.EVENT) return 'full';
    if (h.state === HumanSt.TELEGRAPH || h.state === HumanSt.LOOK || h.state === HumanSt.FAKEOUT) mode = 'sneaky';
  }
  return mode;
}

/** Minimum seconds between two plays of the same cue (live engine), so per-tick events never machine-gun. */
export const MIN_GAP_S: Partial<Record<CueId, number>> = {
  seen: 0.8,
  purr: 1.2,
  perfect: 2.5,
  stamp: 1.0,
  caught: 2.5,
  badKitty: 2.5,
  hm: 0.25,
  doubleTake: 0.25,
  lastCall: 2,
  eventCue: 2,
  wobble: 0.06,
  step: 0.04,
  sigh: 1.5,
  snore: 1.2,
  noiseRise: 0.4,
  roombaHum: 0.3,
  glint: 0.6,
  shutter: 0.3,
  slide: 0.15,
  teleCue: 0.25,
  comeHere: 2.5,
  wake: 2,
  framed: 1,
  wish: 1,
  nyeCountdown: 3,
  puddle: 0.1,
};

/** Cap of identical cues per tick (cascades). */
export const MAX_PER_TICK: Partial<Record<CueId, number>> = {
  crash: 3,
  splat: 2,
  land: 2,
  bonk: 2,
  combo: 1,
  target: 1,
  stackClink: 1,
  topple: 1,
  shutter: 1,
  puddle: 2,
  roombaHum: 1,
  snore: 1,
};

/** The payoff family: these are mixed 3-4 dB above every other cue (GDD 12). */
export const CRASH_CLASS: readonly CueId[] = ['crash', 'splat', 'topple'];

/**
 * Clip time for a sim tick: real time, except inside the slow-motion window where time stretches by 1/speed.
 * Returns seconds after fromTick.
 */
export function tickToClipSeconds(tick: number, fromTick: number, slowMo?: ClipPlan['slowMo']): number {
  if (!slowMo || !(slowMo.speed > 0) || slowMo.toTick <= slowMo.fromTick) return (tick - fromTick) / TICK_HZ;
  const a = Math.max(slowMo.fromTick, fromTick);
  const b = Math.max(slowMo.toTick, fromTick);
  let sec = 0;
  sec += Math.max(0, Math.min(tick, a) - fromTick) / TICK_HZ;
  sec += Math.max(0, Math.min(tick, b) - a) / TICK_HZ / slowMo.speed;
  sec += Math.max(0, tick - b) / TICK_HZ;
  return sec;
}

/** True when the tick falls inside the slow-motion window (the synth pitches those cues down a little). */
export function inSlowMo(tick: number, slowMo?: ClipPlan['slowMo']): boolean {
  return !!slowMo && slowMo.speed > 0 && tick >= slowMo.fromTick && tick < slowMo.toTick;
}
