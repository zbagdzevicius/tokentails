/**
 * Dusty's move set (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.2 "Moves and VFX").
 *
 * A cowgirl with a popgun.
 * - basics (ranged, release on the 8 t windup): A a shot from the hip, B a shot with the gun raised (the Big Cork's
 *   `clip` event 'bigcork' adds a recoil kick);
 * - Q Trick Shot: a quick snap shot with a spin of the gun;
 * - W Lasso: the rope swung over her head over the 9 t windup (windupStart → cast), then thrown;
 * - E Quick Draw: a low slide over the dash (land on travelEnd), the gun spun back up;
 * - R HIGH NOON (signature): she tips her hat over the 15 t windup, then plants her boots and fires (the `clip` event
 *   'highnoon' holds the stance);
 * - idle: a weight shift and a glance from under the brim; fidget: a gun spin; victory: hat raised; emote: a little
 *   line dance.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.dusty;
const W_C = T.slots.w.windup * TICK_S;
const R_C = T.slots.r.windup * TICK_S;
const E_AIR = T.slots.e.dashTicks * TICK_S;
const NOON_S = (T.slots.r.duration > 0 ? T.slots.r.duration : 36) * TICK_S;

const HIP: D = { chest: [0.05, -0.2, 0], shoulderR: [-1.2, 0, -0.2], elbowR: [-0.5, 0, 0] };
const RAISED: D = { chest: [0.0, -0.3, 0], head: [0.05, 0.1, 0], shoulderR: [-1.6, 0, -0.05], elbowR: [-0.1, 0, 0], shoulderL: [-1.3, 0, 0.3], elbowL: [-0.9, 0, 0] };
const KICK: D = { chest: [-0.15, -0.25, 0], head: [-0.1, 0, 0], shoulderR: [-1.9, 0, -0.05], elbowR: [-0.3, 0, 0] };
const SPIN: D = { shoulderR: [-1.4, 0, -0.5], elbowR: [-1.5, 0, 0] };
const ROPE_UP: D = { chest: [-0.15, 0, 0], shoulderL: [-3.0, 0, 0.3], elbowL: [-0.6, 0, 0] };
const ROPE_THROW: D = { chest: [0.3, 0.3, 0], shoulderL: [-1.5, 0, 0.0], elbowL: [0, 0, 0] };
const SLIDE: D = { chest: [0.2, 0, 0], thighL: [-1.1, 0, 0], kneeL: [0.3, 0, 0], thighR: [0.3, 0, 0], kneeR: [1.2, 0, 0] };
const TIP: D = { head: [0.25, 0, 0], shoulderL: [-2.6, 0, 0.6], elbowL: [-1.9, 0, 0] };
const PLANT: D = { hips: [0, -0.3, 0], chest: [0.05, -0.2, 0], thighL: [-0.3, 0, 0.25], thighR: [0.2, 0, -0.25], shoulderR: [-1.6, 0, -0.05], elbowR: [-0.05, 0, 0], shoulderL: [-1.5, 0, 0.35], elbowL: [-0.7, 0, 0] };
const HAT_UP: D = { head: [-0.25, 0, 0], shoulderL: [-3.0, 0, 0.2], elbowL: [-0.4, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const shot = (id: string, pose: D): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, pose, 'out'],
    [C, null, pose, 'hold'],
    [C + 0.08, null, merge(pose, { chest: [-0.12, -0.2, 0] }), 'out'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    mask: 'upper',
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = shot('dusty.basicA', HIP);
const basicB = shot('dusty.basicB', RAISED);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Trick Shot

const Q_C = 0.1;
const Q_END = Q_C + 0.38;
const q: ClipDef = mk('dusty.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.7, null, SPIN, 'out'],
  [Q_C, null, RAISED, 'expoIn'],
  [Q_C + 0.08, null, KICK, 'out'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Lasso

const W_END = W_C + 0.4;
const w: ClipDef = mk('dusty.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C * 0.5, null, ROPE_UP, 'out'],
  [W_C - 0.02, null, merge(ROPE_UP, { chest: [-0.2, 0.3, 0] }), 'inOut'],
  [W_C + 0.1, null, ROPE_THROW, 'expoIn'],
  [W_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { coil: 0, contact: W_C, end: W_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Quick Draw

const E_T0 = 0.03;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.22;
const e: ClipDef = mk('dusty.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, null, SLIDE, 'out'],
  [E_LAND, null, merge(SLIDE, SPIN), 'inOut'],
  [E_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [E_T0, 0.85, 'out'], [E_LAND, 0.85], [E_END, 1, 'inOut']) },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R HIGH NOON

const R_END = R_C + 0.5;
const r: ClipDef = mk('dusty.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.6, null, TIP, 'out'],
  [R_C - 0.02, null, TIP, 'hold'],
  [R_C + 0.1, null, PLANT, 'expoIn'],
  [R_END, null, PLANT, 'hold'],
], {
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'shake', 1]],
  cancel: 'none',
});

/** HIGH NOON's stance (the `clip` event): planted, a recoil kick on each cork. */
const highnoon: ClipDef = mk('dusty.highnoon', NOON_S, Prio.Ult, [
  [0, null, PLANT],
  [NOON_S * 0.33, null, merge(PLANT, KICK), 'out'],
  [NOON_S * 0.4, null, PLANT, 'inOut'],
  [NOON_S * 0.73, null, merge(PLANT, KICK), 'out'],
  [NOON_S * 0.8, null, PLANT, 'inOut'],
  [NOON_S, null, null, 'inOut'],
], { markers: { contact: 0, end: NOON_S } });

/** The Big Cork's recoil (the `clip` event 'bigcork'). */
const bigcork: ClipDef = mk('dusty.bigcork', 0.3, Prio.Basic, [
  [0, null, null],
  [0.06, null, KICK, 'expoIn'],
  [0.3, null, null, 'inOut'],
], { mask: 'upper', markers: { contact: 0.06, end: 0.3 } });

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('dusty.idle', 2.8, Prio.Idle, [
  [0, null, null],
  [1.0, null, { hips: [0, 0, 0.06], chest: [0, 0, -0.05], head: [0.1, 0.15, 0] }, 'inOut'],
  [2.0, null, { hips: [0, 0, -0.04], head: [0.05, -0.1, 0] }, 'inOut'],
  [2.8, null, null, 'inOut'],
]);

const twirl: ClipDef = mk('dusty.twirl', 1.2, Prio.Idle, [
  [0, null, null],
  [0.2, null, SPIN, 'out'],
  [0.5, null, merge(SPIN, { elbowR: [-0.6, 0, 0] }), 'inOut'],
  [0.8, null, SPIN, 'inOut'],
  [1.2, null, null, 'inOut'],
], { markers: { contact: 0.2, end: 1.2 } });

const victory: ClipDef = mk('dusty.victory', 0.9, Prio.Emote, [
  [0, null, HAT_UP],
  [0.45, null, merge(HAT_UP, { head: [-0.4, 0, 0.15] }), 'inOut'],
  [0.9, null, HAT_UP, 'inOut'],
], { root: { up: sk([0, 0], [0.22, 0.14, 'out'], [0.45, 0, 'in'], [0.67, 0.14, 'out'], [0.9, 0, 'in']) }, blendIn: 0.2 });

const emote: ClipDef = mk('dusty.emote', 1.6, Prio.Emote, [
  [0, null, null],
  [0.4, null, { hips: [0, 0.3, 0], thighL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] }, 'inOut'],
  [0.8, null, { hips: [0, -0.3, 0], thighR: [-0.5, 0, 0], kneeR: [0.6, 0, 0] }, 'inOut'],
  [1.2, null, { hips: [0, 0.3, 0], thighL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] }, 'inOut'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.4, end: 1.6 } });

const gait: GaitProfile = { stride: 1.15, bounce: 1.0, lean: 0.7, hipSway: 1.1, headBob: 0.8, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'dusty',
  stub: false,
  gait,
  springs: HERO_SPRINGS.dusty,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[twirl, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { highnoon, bigcork },
};

/** Tests and the gallery: every authored clip. */
export const DUSTY_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, highnoon, bigcork, idle, twirl, victory, emote];
