/**
 * Bravo's move set (sim v13; build spec docs/plans/moba/DOGS-V13.md §1.3 "Moves and VFX", ANIM-SPEC §14 brief).
 *
 * A theatre pug: every move is played to the back row.
 * - basics (melee, contact on the 8 t windup): A a cape swat, B a dramatic backhand slap;
 * - Q Crocodile Tears: the tear flicked on the cast, then the paws over his face and a shoulder-shaking sob;
 * - W Center Stage: "ta-da!" on the cast (arms flung wide, chest out), held for the 90 t spotlight with a slow sway,
 *   a quick bow on stateEnd;
 * - E Stage Dive: a grand leap with the arms out (take-off on the cast, landing on travelEnd);
 * - R ENCORE!: a sweeping flourish over the 18 t windup, the deep bow on the cast;
 * - the flop (signature, the `clip` event 'flop', his passive): he clutches his chest, turns a quarter, falls flat
 *   on his back with the legs in the air, twitches, and pops back up as the 30 t flop ends;
 * - idle: chest out, chin up, swaying; fidget: the back of a paw to his forehead (the sigh); victory and emote: the
 *   deep bow.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, swing } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, type D } from './dogKit';

const T = SIM_TIMING.bravo;
const E_AIR = T.slots.e.dashTicks * TICK_S;
/** The flop's length (s): the sim's passive duration (30 t). */
const FLOP_S = 30 * TICK_S;

/** Clutching his heart: left paw on his chest, right paw to his forehead, head thrown back. */
const CLUTCH: D = { chest: [-0.3, 0, 0], head: [-0.55, 0.2, 0], shoulderL: [-1.3, 0, -0.5], elbowL: [-1.6, 0, 0], shoulderR: [-2.4, 0, -0.3], elbowR: [-1.9, 0, 0] };
/** Flat on his back, legs in the air, arms flung out: his own pose (chars/heroes/bravo.ts POSES.playDead). */
const PLAYING_DEAD = 'playDead';
/** The legs twitching (deltas on the pose). */
const TWITCH: D = { thighL: [-0.25, 0, 0.1], kneeL: [0.35, 0, 0], thighR: [0.15, 0, 0.05] };
/** The deep bow: one arm across his belly, the other swept out behind, chest folded down. */
const BOW: D = { chest: [1.0, 0, 0], head: [0.35, 0, 0], hips: [0.15, 0, 0], shoulderR: [-0.7, 0, 0.7], elbowR: [-1.2, 0, 0], shoulderL: [0.6, 0, 1.0], thighL: [-0.2, 0, 0], thighR: [0.3, 0, 0], kneeR: [0.3, 0, 0] };
const TADA: D = { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-1.6, 0, 1.3], shoulderR: [-1.6, 0, -1.3], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [0, 0.1, 0.25], thighR: [0, -0.1, -0.25] };
const SOB: D = { chest: [0.4, 0, 0], head: [0.45, 0, 0], shoulderL: [-1.9, 0, -0.4], elbowL: [-1.9, 0, 0], shoulderR: [-1.9, 0, 0.4], elbowR: [-1.9, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const basicA: ClipDef = { ...swing({ id: 'bravo.basicA', side: 1, arc: 1.1, twist: 0.8 }), cues: [['contact', 'whoosh', 'M'], ['contact', 'sfx', 'bodyThud']] };
/** B: the backhand slap with a flourish of the wrist. */
const basicB: ClipDef = { ...swing({ id: 'bravo.basicB', side: -1, arc: 0.9, twist: 0.6 }), cues: [['contact', 'whoosh', 'S']] };
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Crocodile Tears

const Q_C = 0.1;
const Q_END = Q_C + 0.85;
/** The tear flicked on the cast, then both paws over his face and the shoulders shaking with sobs. */
const q: ClipDef = mk('bravo.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.5, null, { chest: [0, 0.5, 0], shoulderR: [-0.6, 0, -0.9], elbowR: [-1.4, 0, 0] }, 'out'],
  [Q_C, null, { chest: [0.15, -0.4, 0], shoulderR: [-1.5, 0, -0.3], elbowR: [-0.1, 0, 0] }, 'expoIn'],
  [Q_C + 0.18, null, SOB, 'inOut'],
  [Q_C + 0.3, null, merge(SOB, { chest: [0.5, 0.15, 0] }), 'inOut'],
  [Q_C + 0.42, null, merge(SOB, { chest: [0.4, -0.15, 0] }), 'inOut'],
  [Q_C + 0.54, null, merge(SOB, { chest: [0.5, 0.15, 0] }), 'inOut'],
  [Q_C + 0.66, null, merge(SOB, { chest: [0.4, -0.15, 0] }), 'inOut'],
  [Q_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [Q_C + 0.18, 0.95], [Q_C + 0.3, 1.02], [Q_C + 0.42, 0.95], [Q_C + 0.54, 1.02], [Q_C + 0.66, 0.95], [Q_END, 1, 'inOut']) },
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'S'], [Q_C + 0.18, 'fx', 'bv:sob']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Center Stage

const W_C = 0.12;
const w: ClipDef = mk('bravo.w', W_C + 0.3, Prio.Ability, [
  [0, null, null],
  [W_C * 0.6, null, { chest: [0.3, 0, 0], shoulderL: [-0.3, 0, -0.3], shoulderR: [-0.3, 0, 0.3], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }, 'out'],
  [W_C, null, TADA, 'expoOut'],
  [W_C + 0.3, null, TADA, 'hold'],
], {
  root: { up: sk([0, 0], [W_C * 0.6, 0], [W_C + 0.08, 0.3, 'out'], [W_C + 0.22, 0, 'in'], [W_C + 0.3, 0]), sy: sk([0, 1], [W_C * 0.6, 0.85], [W_C + 0.06, 1.12, 'out'], [W_C + 0.22, 0.9, 'in'], [W_C + 0.3, 1, 'back']) },
  markers: { coil: W_C * 0.6, contact: W_C, end: W_C + 0.3 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'fx', 'bv:tada'], [W_C + 0.22, 'land']],
  cancel: 'none',
});
/** In the spotlight: arms wide, chin up, a slow proud sway. Loops until stateEnd. */
const wHold: ClipDef = mk('bravo.wHold', 1.2, Prio.Ability, [
  [0, null, TADA],
  [0.6, null, merge(TADA, { chest: [-0.35, 0.15, 0.05], head: [-0.4, 0.15, 0] }), 'inOut'],
  [1.2, null, TADA, 'inOut'],
], { mask: 'upper', blendIn: 0.1 });
/** The spotlight goes out: a quick bob of a bow. */
const wEnd: ClipDef = mk('bravo.wEnd', 0.45, Prio.Ability, [
  [0, null, TADA],
  [0.2, null, merge(BOW, { chest: [0.6, 0, 0] }), 'out'],
  [0.45, null, null, 'inOut'],
], { markers: { contact: 0.2, end: 0.45 }, warp: [['contact', 'stateEnd']] });

// ------------------------------------------------------------------------------------------------ E Stage Dive

const E_T0 = 0.06;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.3;
/** A grand leap into the crowd: arms flung out, chest leading, legs trailing; a plié landing. */
const e: ClipDef = mk('bravo.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, null, { kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], shoulderL: [0.4, 0, 0.3], shoulderR: [0.4, 0, -0.3] }, 'out'],
  [E_T0 + E_AIR * 0.5, null, { chest: [0.3, 0, 0], head: [-0.4, 0, 0], shoulderL: [-1.4, 0, 1.4], shoulderR: [-1.4, 0, -1.4], thighL: [0.7, 0, 0], thighR: [0.9, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.6, 0, 0] }, 'out'],
  [E_LAND, null, { kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], shoulderL: [-1.0, 0, 1.2], shoulderR: [-1.0, 0, -1.2] }, 'in'],
  [E_END, null, null, 'back'],
], {
  root: { up: sk([0, 0], [E_T0, 0], [E_T0 + E_AIR * 0.5, 0.85, 'out'], [E_LAND, 0, 'in'], [E_END, 0]), pitch: sk([0, 0], [E_T0 + E_AIR * 0.5, 0.06], [E_LAND, 0], [E_END, 0]), sy: sk([0, 1], [E_T0, 0.8, 'out'], [E_T0 + 0.06, 1.12, 'out'], [E_LAND, 1], [E_LAND + 0.04, 0.74, 'in'], [E_LAND + 0.18, 1.04, 'back'], [E_END, 1]) },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'L'], ['takeoff', 'dust'], ['land', 'land'], ['land', 'dustRing'], ['land', 'shake', 1], ['land', 'fx', 'bv:dive']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ R ENCORE!

const R_C = T.slots.r.windup * TICK_S;
const R_END = R_C + 0.75;
/** A sweeping flourish over the windup (one arm circling up), then the deep bow on the cast, held, and rise. */
const r: ClipDef = mk('bravo.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.4, null, { chest: [-0.25, 0.3, 0], head: [-0.4, 0.2, 0], shoulderR: [-2.6, 0, -0.6], shoulderL: [-0.6, 0, 1.2] }, 'out'],
  [R_C * 0.8, null, { chest: [-0.3, -0.2, 0], head: [-0.45, 0, 0], shoulderR: [-1.6, 0, -1.4], shoulderL: [-1.6, 0, 1.4] }, 'inOut'],
  [R_C, null, BOW, 'expoIn'],
  [R_C + 0.45, null, merge(BOW, { chest: [1.1, 0, 0] }), 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [R_C * 0.8, 0.1, 'out'], [R_C, 0, 'in'], [R_END, 0]), sy: sk([0, 1], [R_C * 0.8, 1.08], [R_C, 0.9, 'in'], [R_C + 0.12, 1, 'back'], [R_END, 1]) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'whoosh', 'L'], ['contact', 'fx', 'bv:bow'], ['contact', 'shake', 2]],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ the flop

const F_FALL = 0.32;
const F_UP = FLOP_S - 0.06;
const F_END = F_UP + 0.32;
/** Dramatic Flop: clutch, quarter turn, flat on his back with the legs up, a twitch, then up as if nothing happened. */
const flop: ClipDef = mk('bravo.flop', F_END, Prio.Ult, [
  [0, null, null],
  [0.12, null, CLUTCH, 'expoOut'],
  [F_FALL, PLAYING_DEAD, null, 'in'],
  [F_FALL + 0.2, PLAYING_DEAD, TWITCH, 'inOut'],
  [F_FALL + 0.4, PLAYING_DEAD, null, 'inOut'],
  [F_UP, PLAYING_DEAD, null, 'hold'],
  [F_UP + 0.16, 'stageStand', { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6] }, 'out'],
  [F_END, null, null, 'back'],
], {
  root: {
    yaw: sk([0, 0], [0.12, 0], [F_FALL, 0.25, 'inOut'], [F_UP, 0.25], [F_END, 0, 'inOut']),
    up: sk([0, 0], [0.12, 0.08, 'out'], [F_FALL, 0, 'in'], [F_UP, 0], [F_UP + 0.16, 0.3, 'out'], [F_END, 0, 'in']),
    sy: sk([0, 1], [F_FALL, 1], [F_FALL + 0.05, 0.85, 'in'], [F_FALL + 0.16, 1, 'back'], [F_END, 1]),
  },
  calm: { yaw: 0 },
  markers: { contact: 0, fall: F_FALL, up: F_UP, end: F_END },
  cues: [[0, 'fx', 'bv:gasp'], [F_FALL, 'land'], [F_FALL, 'fx', 'bv:thud'], [F_UP + 0.16, 'fx', 'bv:bravo']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** Chest out, chin up, a slow proud sway (playing to the gallery even standing still). */
const idle: ClipDef = mk('bravo.idle', 2.2, Prio.Idle, [
  [0, null, { head: [0, 0.1, 0] }],
  [1.1, null, { chest: [-0.06, 0, 0.04], head: [-0.08, -0.15, 0.05] }, 'inOut'],
  [2.2, null, { head: [0, 0.1, 0] }, 'inOut'],
], { root: { sy: sk([0, 1], [1.1, 1.03, 'inOut'], [2.2, 1, 'inOut']) } });

/** Fidget: the theatrical sigh, the back of a paw to his forehead, swooning back. */
const sigh: ClipDef = mk('bravo.sigh', 1.8, Prio.Idle, [
  [0, null, null],
  [0.4, null, { chest: [-0.35, 0, 0.1], head: [-0.6, 0.25, 0.1], shoulderR: [-2.5, 0, -0.5], elbowR: [-2.0, 0, 0], shoulderL: [-0.3, 0, 0.8] }, 'out'],
  [1.3, null, { chest: [-0.4, 0, 0.12], head: [-0.65, 0.25, 0.15], shoulderR: [-2.5, 0, -0.5], elbowR: [-2.0, 0, 0], shoulderL: [-0.3, 0, 0.9] }, 'hold'],
  [1.8, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [0.4, 1.05, 'out'], [1.3, 1.04], [1.8, 1, 'inOut']) }, markers: { contact: 0.4, end: 1.8 }, cues: [[0.4, 'fx', 'bv:sigh']] });

/** Victory: arms up to the crowd, then the deep bow. Loops. */
const victory: ClipDef = mk('bravo.victory', 2.0, Prio.Emote, [
  [0, null, TADA],
  [0.5, null, merge(TADA, { shoulderL: [-2.6, 0, 0.8], shoulderR: [-2.6, 0, -0.8] }), 'out'],
  [0.9, null, BOW, 'inOut'],
  [1.5, null, BOW, 'hold'],
  [2.0, null, TADA, 'inOut'],
], { root: { up: sk([0, 0], [0.3, 0.2, 'out'], [0.5, 0, 'in'], [2.0, 0]) }, cues: [[0.9, 'fx', 'bv:bow']] });

/** Emote: the deep bow. */
const emote: ClipDef = mk('bravo.emote', 1.6, Prio.Emote, [
  [0, null, null],
  [0.35, null, { chest: [-0.25, 0.3, 0], shoulderR: [-2.6, 0, -0.6], shoulderL: [-0.6, 0, 1.2] }, 'out'],
  [0.7, null, BOW, 'inOut'],
  [1.2, null, BOW, 'hold'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.7, end: 1.6 }, cues: [[0.7, 'fx', 'bv:bow']] });

/** A prancing stride: high knees, chest out, little bounce. */
const gait: GaitProfile = { stride: 0.85, bounce: 1.3, lean: -0.4, hipSway: 1.2, headBob: 0.7, arms: 'trail', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'bravo',
  stub: false,
  gait,
  springs: HERO_SPRINGS.bravo,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w, hold: wHold, end: wEnd }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[sigh, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { flop },
};

/** Tests and the gallery: every authored clip. */
export const BRAVO_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, wHold, wEnd, e, r, flop, idle, sigh, victory, emote];
