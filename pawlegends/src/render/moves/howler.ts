/**
 * Howler's move set (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.5 "Moves and VFX", ANIM-SPEC §14 brief).
 *
 * A husky with opinions: every move is a howl, a grumble or a scream. His mouth sits on the `mouth` bone, so the
 * `mouthOpen` cues (with a 'ms*scale' arg for the big ones) open it.
 * - basics (melee, contact on the 8 t windup): A a lunge bite (mouth open), B a paw swipe;
 * - Q AWOO: chin up and a long howl on the cast;
 * - W Derp Dash: the derp face (head lolled sideways) and a scrabbling dash (take-off on the cast, a skid on travelEnd);
 * - E Talk Back: paws planted, chin out, the head bobbing as he argues for the 30 t state (mouth flapping), a huff on
 *   stateEnd;
 * - R THE SCREAM (signature): the INHALE over the 21 t windup (windupStart → cast): chest back, chin up, the whole
 *   body ballooning to 1.28× wide; then the scream on the cast: he lurches forward, the mouth wide open, trembling,
 *   recoiling back;
 * - idle: the head tilt and an ear twitch; fidget: a long grumble; victory: the howl; emote: the grumble ending in
 *   one offended "WOO".
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT, swing } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { gallopKeys, merge, mk, sk, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.howler;
const W_AIR = T.slots.w.dashTicks * TICK_S;
const R_C = T.slots.r.windup * TICK_S;

const HOWL: D = { chest: [-0.4, 0, 0], head: [-1.1, 0, 0], shoulderL: [0.2, 0, 0.3], shoulderR: [0.2, 0, -0.3], earL: [-0.3, 0, 0], earR: [-0.3, 0, 0] };
const ARGUE_A: D = { chest: [0.2, 0, 0], head: [0.25, 0, 0.1], shoulderL: [-0.9, 0, 0.6], elbowL: [-1.0, 0, 0], shoulderR: [-0.2, 0, -0.3] };
const ARGUE_B: D = { chest: [0.25, 0, 0], head: [-0.25, 0, -0.1], shoulderL: [-0.4, 0, 0.3], shoulderR: [-1.0, 0, -0.7], elbowR: [-1.0, 0, 0] };
const INHALE: D = { chest: [-0.4, 0, 0], head: [-0.45, 0, 0], shoulderL: [-0.6, 0, 1.2], shoulderR: [-0.6, 0, -1.2], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0], earL: [-0.4, 0, 0], earR: [-0.4, 0, 0], thighL: [0, 0.1, 0.15], thighR: [0, -0.1, -0.15] };
const SCREAM: D = { chest: [0.45, 0, 0], head: [-0.05, 0, 0], shoulderL: [0.6, 0, 0.7], shoulderR: [0.6, 0, -0.7], earL: [-1.0, 0, -0.3], earR: [-1.0, 0, 0.3], thighL: [-0.3, 0, 0.2], thighR: [0.3, 0, -0.2], kneeL: [0.4, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

/** A: the lunge bite. Coils low, lunges with the head out and the mouth open, snaps back. */
const basicA: ClipDef = mk('howler.basicA', C + 0.3, Prio.Basic, [
  [0, null, null],
  [C * 0.6, null, { chest: [0.25, 0, 0], head: [0.15, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'],
  [C, null, { chest: [0.55, 0, 0], head: [-0.25, 0, 0], shoulderL: [-1.2, 0, 0.3], shoulderR: [-1.2, 0, -0.3], thighL: [-0.6, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.4, 0, 0] }, 'expoIn'],
  [C + 0.12, null, { chest: [0.4, 0, 0], head: [-0.1, 0, 0], thighL: [-0.5, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.3, 0, 0] }, 'back'],
  [C + 0.3, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [C * 0.6, -0.08], [C, 0.3, 'expoIn'], [C + 0.12, 0.25], [C + 0.3, 0, 'inOut']), sy: sk([0, 1], [C * 0.6, 0.9], [C, 1.06, 'expoIn'], [C + 0.3, 1]) },
  markers: { coil: C * 0.6, contact: C, end: C + 0.3 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'mouthOpen', 160], ['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});
const basicB: ClipDef = { ...swing({ id: 'howler.basicB', side: 1, arc: 1.0, twist: 0.7 }), cues: [['contact', 'whoosh', 'M']] };
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q AWOO

const Q_C = 0.1;
const Q_END = Q_C + 0.8;
const q: ClipDef = mk('howler.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C, null, HOWL, 'expoOut'],
  [Q_C + 0.6, null, merge(HOWL, { head: [-1.2, 0, 0.05] }), 'inOut'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  root: { sy: sk([0, 1], [Q_C, 1.1, 'out'], [Q_C + 0.6, 1.08], [Q_END, 1, 'inOut']) },
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'mouthOpen', '650*2.0'], ['contact', 'fx', 'hw:awoo']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Derp Dash

const W_T0 = 0.05;
const W_LAND = W_T0 + W_AIR;
const W_END = W_LAND + 0.3;
/** The derp face: the head lolled to one side, chest low, ears flying. */
const DERP: D = { chest: [0.5, 0, 0], hips: [0.2, 0, 0], head: [-0.35, 0.2, 0.55], earL: [-0.8, 0, 0], earR: [-0.8, 0, 0] };
const w: ClipDef = mk('howler.w', W_END, Prio.Ability, [
  [0, null, null],
  ...gallopKeys(W_T0, W_LAND, 4, DERP),
  [W_LAND + 0.12, null, { chest: [-0.3, 0, 0], head: [-0.1, 0, 0.3], thighL: [-0.6, 0, 0.3], thighR: [-0.6, 0, -0.3], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'out'],
  [W_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [W_T0 + W_AIR * 0.3, 0.15, 'out'], [W_T0 + W_AIR * 0.55, 0, 'in'], [W_T0 + W_AIR * 0.8, 0.15, 'out'], [W_LAND, 0, 'in']), fwd: sk([0, 0], [W_LAND, 0], [W_LAND + 0.12, -0.15, 'out'], [W_END, 0, 'inOut']), roll: sk([0, 0], [W_T0 + 0.05, 0.03], [W_LAND, 0.03], [W_END, 0]) },
  calm: { roll: 0 },
  markers: { takeoff: W_T0, contact: W_T0, land: W_LAND, end: W_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'mouthOpen', '500*1.8'], ['takeoff', 'whoosh', 'L'], ['takeoff', 'fx', 'hw:derp'], ['land', 'dust'], ['land', 'land']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ E Talk Back

const E_C = 0.1;
const e: ClipDef = mk('howler.e', E_C + 0.2, Prio.Ability, [
  [0, null, null],
  [E_C, null, ARGUE_A, 'expoOut'],
  [E_C + 0.2, null, ARGUE_B, 'inOut'],
], {
  root: { up: sk([0, 0], [E_C * 0.5, 0.12, 'out'], [E_C, 0, 'in']), sy: sk([0, 1], [E_C, 0.88, 'in'], [E_C + 0.12, 1.05, 'back'], [E_C + 0.2, 1]) },
  markers: { contact: E_C, end: E_C + 0.2 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'land'], ['contact', 'mouthOpen', 120], ['contact', 'fx', 'hw:argue']],
  cancel: 'none',
});
/** Arguing: the head bobbing on the beat, paws gesturing, the mouth flapping. Loops until stateEnd. */
const eHold: ClipDef = mk('howler.eHold', 0.5, Prio.Ability, [
  [0, null, ARGUE_B],
  [0.25, null, ARGUE_A, 'inOut'],
  [0.5, null, ARGUE_B, 'inOut'],
], { root: { sy: sk([0, 1], [0.25, 1.04, 'inOut'], [0.5, 1, 'inOut']) }, cues: [[0.0, 'mouthOpen', 110], [0.25, 'mouthOpen', 110]], blendIn: 0.06 });
/** The huff: a toss of the head, turning away. */
const eEnd: ClipDef = mk('howler.eEnd', 0.4, Prio.Ability, [
  [0, null, ARGUE_A],
  [0.18, null, { head: [-0.4, 0.6, 0.15], chest: [-0.1, 0.25, 0] }, 'out'],
  [0.4, null, null, 'inOut'],
], { markers: { contact: 0, end: 0.4 }, warp: [['contact', 'stateEnd']] });

// ------------------------------------------------------------------------------------------------ R THE SCREAM

const R_END = R_C + 1.05;
/** The inhale (the whole windup, the counterplay window), then the scream on the cast. */
const r: ClipDef = mk('howler.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.85, null, INHALE, 'inOut'],
  [R_C - 0.03, null, merge(INHALE, { head: [-0.55, 0, 0] }), 'out'],
  [R_C, null, SCREAM, 'expoIn'],
  [R_C + 0.12, null, merge(SCREAM, { chest: [0.5, 0.06, 0] }), 'inOut'],
  [R_C + 0.24, null, merge(SCREAM, { chest: [0.5, -0.06, 0] }), 'inOut'],
  [R_C + 0.36, null, merge(SCREAM, { chest: [0.5, 0.06, 0] }), 'inOut'],
  [R_C + 0.48, null, merge(SCREAM, { chest: [0.5, -0.06, 0] }), 'inOut'],
  [R_C + 0.65, null, merge(SCREAM, { chest: [0.4, 0, 0] }), 'inOut'],
  [R_END, null, null, 'inOut'],
], {
  root: {
    sx: sk([0, 1], [R_C * 0.85, 1.25, 'inOut'], [R_C - 0.03, 1.3, 'out'], [R_C, 0.92, 'expoIn'], [R_C + 0.15, 1.04, 'back'], [R_C + 0.65, 1], [R_END, 1]),
    sy: sk([0, 1], [R_C * 0.85, 1.1, 'inOut'], [R_C - 0.03, 1.12, 'out'], [R_C, 0.94, 'expoIn'], [R_C + 0.15, 1.02, 'back'], [R_END, 1]),
    fwd: sk([0, 0], [R_C * 0.85, -0.12, 'inOut'], [R_C, 0.18, 'expoIn'], [R_C + 0.4, -0.2, 'out'], [R_END, 0, 'inOut']),
    up: sk([0, 0], [R_C * 0.85, 0.12, 'inOut'], [R_C, 0, 'in'], [R_END, 0]),
  },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'fx', 'hw:inhale'], ['contact', 'mouthOpen', '950*2.8'], ['contact', 'fx', 'hw:scream'], ['contact', 'shake', 3], ['contact', 'punch', 0.06]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** The head tilt one way and back, an ear twitch, the tongue-out pant. */
const idle: ClipDef = mk('howler.idle', 2.4, Prio.Idle, [
  [0, null, null],
  [0.6, null, { head: [-0.04, 0, 0.1], chest: [-0.03, 0, 0] }, 'inOut'],
  [1.2, null, { head: [0, 0, 0.32], earR: [0.35, 0, 0.2] }, 'inOut'],
  [1.8, null, { head: [-0.04, 0, 0.1], chest: [-0.03, 0, 0] }, 'inOut'],
  [2.4, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [0.6, 1.02, 'inOut'], [1.2, 1, 'inOut'], [1.8, 1.02, 'inOut'], [2.4, 1, 'inOut']) } });

/** Fidget: the long grumble, the head bobbing with each "woo". */
const grumble: ClipDef = mk('howler.grumble', 1.5, Prio.Idle, [
  [0, null, null],
  [0.2, null, { head: [0.2, 0.2, 0.15], chest: [0.1, 0, 0] }, 'inOut'],
  [0.45, null, { head: [-0.2, -0.1, -0.1] }, 'inOut'],
  [0.7, null, { head: [0.2, 0.2, 0.15], chest: [0.1, 0, 0] }, 'inOut'],
  [1.0, null, { head: [-0.45, 0, 0.05], chest: [-0.15, 0, 0] }, 'inOut'],
  [1.5, null, null, 'inOut'],
], { markers: { contact: 0.2, end: 1.5 }, cues: [[0.2, 'mouthOpen', 140], [0.45, 'mouthOpen', 140], [1.0, 'mouthOpen', '300*1.8'], [0.2, 'fx', 'hw:argue']] });

/** Victory: the howl, held. Loops. */
const victory: ClipDef = mk('howler.victory', 1.6, Prio.Emote, [
  [0, null, HOWL],
  [0.8, null, merge(HOWL, { head: [-1.2, 0, 0.08] }), 'inOut'],
  [1.6, null, HOWL, 'inOut'],
], { root: { sy: sk([0, 1.08], [0.8, 1.1, 'inOut'], [1.6, 1.08, 'inOut']) }, cues: [[0, 'mouthOpen', '1500*2.0']], blendIn: 0.2 });

/** Emote: the grumble, ending in one offended "WOO" (chin up, mouth wide). */
const emote: ClipDef = mk('howler.emote', 2.0, Prio.Emote, [
  [0, null, null],
  [0.25, null, { head: [0.2, 0.2, 0.15] }, 'inOut'],
  [0.5, null, { head: [-0.2, -0.1, -0.1] }, 'inOut'],
  [0.75, null, { head: [0.2, 0.2, 0.15] }, 'inOut'],
  [1.1, null, HOWL, 'expoOut'],
  [1.6, null, HOWL, 'hold'],
  [2.0, null, null, 'inOut'],
], { markers: { contact: 1.1, end: 2.0 }, cues: [[0.25, 'mouthOpen', 130], [0.5, 'mouthOpen', 130], [0.75, 'mouthOpen', 130], [1.1, 'mouthOpen', '500*2.2'], [1.1, 'fx', 'hw:woo']] });

/** A loping sled-dog stride: long, a little bounce, a forward lean. */
const gait: GaitProfile = { stride: 1.15, bounce: 0.9, lean: 1.6, hipSway: 0.8, headBob: 0.9, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'howler',
  stub: false,
  gait,
  springs: HERO_SPRINGS.howler,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e, hold: eHold, end: eEnd }, r: { cast: r } },
  idle,
  fidgets: [[grumble, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const HOWLER_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, eHold, eEnd, r, idle, grumble, victory, emote];
