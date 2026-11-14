/**
 * Champ's move set (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.4 "Moves and VFX").
 *
 * A boxer in a boxing guard.
 * - basics (melee, contact on the 8 t windup): A a left jab, B a right straight (the One-Two's Cross is skill FX);
 * - Q Haymaker (windup 6 t: windupStart → cast): the right glove cocked back, then a wide looping swing;
 * - W Rope-a-Dope: gloves up tight in front of the face, chin tucked, held for the guard;
 * - E Bob and Weave: a duck and slip forward over the dash (land on travelEnd);
 * - R KNOCKOUT! (signature): a deep wind-up over the 15 t windup, then the uppercut on the cast; a wall hit (`clip`
 *   event 'ko', on the dazed victim) is skill FX only;
 * - idle: bouncing on his toes; fidget: a glove tap; victory: both gloves up; emote: shadow boxing.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.champ;
const Q_C = T.slots.q.windup * TICK_S;
const R_C = T.slots.r.windup * TICK_S;
const E_AIR = T.slots.e.dashTicks * TICK_S;

const JAB_COIL = (s: 1 | -1): D => ({ chest: [0, 0.3 * s, 0], [s > 0 ? 'shoulderL' : 'shoulderR']: [-1.2, 0, 0.5 * s], [s > 0 ? 'elbowL' : 'elbowR']: [-1.4, 0, 0] });
const JAB = (s: 1 | -1): D => ({ chest: [0.15, -0.35 * s, 0], [s > 0 ? 'shoulderL' : 'shoulderR']: [-1.6, 0, 0.05 * s], [s > 0 ? 'elbowL' : 'elbowR']: [0, 0, 0] });
const COCK: D = { chest: [-0.15, 0.7, 0], hips: [0, 0.2, 0], shoulderR: [-0.8, 0, -1.2], elbowR: [-1.4, 0, 0] };
const HAY: D = { chest: [0.25, -0.7, 0], hips: [0, -0.2, 0], shoulderR: [-1.5, 0, 0.4], elbowR: [-0.4, 0, 0] };
const GUARD: D = { chest: [0.15, 0, 0], head: [0.3, 0, 0], shoulderL: [-1.9, 0, 0.1], shoulderR: [-1.9, 0, -0.1], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0] };
const DUCK: D = { chest: [0.5, 0.3, 0.2], head: [0.2, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.9, 0, 0], thighR: [-0.4, 0, 0], kneeR: [0.7, 0, 0] };
const DEEP: D = { chest: [0.4, 0.5, 0], hips: [0.1, 0.2, 0], thighL: [-0.6, 0, 0], kneeL: [0.9, 0, 0], thighR: [-0.5, 0, 0], kneeR: [0.8, 0, 0], shoulderR: [-0.3, 0, -0.4], elbowR: [-1.5, 0, 0] };
const UPPER: D = { chest: [-0.35, -0.3, 0], head: [-0.3, 0, 0], shoulderR: [-3.0, 0, -0.1], elbowR: [-0.5, 0, 0] };
const CHAMP: D = { chest: [-0.2, 0, 0], head: [-0.4, 0, 0], shoulderL: [-2.9, 0, 0.3], shoulderR: [-2.9, 0, -0.3], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const jab = (id: string, s: 1 | -1): ClipDef =>
  mk(id, C + 0.24, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, JAB_COIL(s), 'out'],
    [C, null, JAB(s), 'expoIn'],
    [C + 0.1, null, merge(JAB(s), { chest: [0.05, -0.2 * s, 0] }), 'back'],
    [C + 0.24, null, null, 'inOut'],
  ], {
    mask: 'upper',
    root: { fwd: sk([0, 0], [C * 0.6, -0.04], [C, 0.12, 'expoIn'], [C + 0.24, 0, 'inOut']) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.24 },
    warp: [['contact', 'contact']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = jab('champ.basicA', 1);
const basicB = jab('champ.basicB', -1);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Haymaker

const Q_END = Q_C + 0.36;
const q: ClipDef = mk('champ.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C, null, COCK, 'out'],
  [Q_C + 0.1, null, HAY, 'expoIn'],
  [Q_END, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [Q_C, -0.05], [Q_C + 0.1, 0.15, 'expoIn'], [Q_END, 0, 'inOut']) },
  markers: { coil: 0, contact: Q_C, end: Q_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Rope-a-Dope

const W_DUR = T.slots.w.duration * TICK_S;
const W_END = 0.08 + W_DUR + 0.2;
const w: ClipDef = mk('champ.w', W_END, Prio.Ability, [
  [0, null, null],
  [0.08, null, GUARD, 'out'],
  [0.08 + W_DUR, null, GUARD, 'hold'],
  [W_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: 0.08, end: W_END },
  warp: [['contact', 'cast']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ E Bob and Weave

const E_T0 = 0.03;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.2;
const e: ClipDef = mk('champ.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, null, DUCK, 'out'],
  [(E_T0 + E_LAND) / 2, null, merge(DUCK, { chest: [0.5, -0.3, -0.2] }), 'inOut'],
  [E_LAND, null, DUCK, 'inOut'],
  [E_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [E_T0, 0.9, 'out'], [E_LAND, 0.9], [E_END, 1, 'inOut']) },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R KNOCKOUT!

const R_END = R_C + 0.6;
const r: ClipDef = mk('champ.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.7, null, DEEP, 'out'],
  [R_C - 0.02, null, merge(DEEP, { chest: [0.45, 0.6, 0] }), 'inOut'],
  [R_C + 0.1, null, UPPER, 'expoIn'],
  [R_C + 0.35, null, UPPER, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [R_C, 0.92, 'out'], [R_C + 0.1, 1.06, 'expoIn'], [R_END, 1, 'inOut']) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L'], ['contact', 'shake', 2]],
  cancel: 'none',
});


// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('champ.idle', 0.8, Prio.Idle, [
  [0, null, null],
  [0.4, null, { chest: [0.05, 0.05, 0], head: [0.03, -0.05, 0] }, 'inOut'],
  [0.8, null, null, 'inOut'],
], { root: { up: sk([0, 0], [0.2, 0.05, 'out'], [0.4, 0, 'in'], [0.6, 0.05, 'out'], [0.8, 0, 'in']) } });

const tap: ClipDef = mk('champ.tap', 1.0, Prio.Idle, [
  [0, null, null],
  [0.2, null, { shoulderL: [-1.4, 0, -0.3], shoulderR: [-1.4, 0, 0.3], elbowL: [-1.0, 0, 0], elbowR: [-1.0, 0, 0] }, 'out'],
  [0.35, null, { shoulderL: [-1.3, 0, -0.1], shoulderR: [-1.3, 0, 0.1], elbowL: [-1.0, 0, 0], elbowR: [-1.0, 0, 0] }, 'inOut'],
  [0.5, null, { shoulderL: [-1.4, 0, -0.3], shoulderR: [-1.4, 0, 0.3], elbowL: [-1.0, 0, 0], elbowR: [-1.0, 0, 0] }, 'inOut'],
  [1.0, null, null, 'inOut'],
], { markers: { contact: 0.2, end: 1.0 } });

const victory: ClipDef = mk('champ.victory', 0.8, Prio.Emote, [
  [0, null, CHAMP],
  [0.4, null, merge(CHAMP, { head: [-0.55, 0, 0] }), 'inOut'],
  [0.8, null, CHAMP, 'inOut'],
], { root: { up: sk([0, 0], [0.2, 0.18, 'out'], [0.4, 0, 'in'], [0.6, 0.18, 'out'], [0.8, 0, 'in']) }, blendIn: 0.2 });

const emote: ClipDef = mk('champ.emote', 1.6, Prio.Emote, [
  [0, null, null],
  [0.2, null, JAB(1), 'expoIn'],
  [0.4, null, JAB(-1), 'expoIn'],
  [0.6, null, JAB(1), 'expoIn'],
  [0.9, null, UPPER, 'expoIn'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.2, end: 1.6 } });

const gait: GaitProfile = { stride: 1.15, bounce: 1.4, lean: 0.9, hipSway: 0.8, headBob: 0.8, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'champ',
  stub: false,
  gait,
  springs: HERO_SPRINGS.champ,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[tap, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const CHAMP_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, idle, tap, victory, emote];
