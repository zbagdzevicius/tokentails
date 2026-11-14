/**
 * Ziggy's move set (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.2 "Moves and VFX").
 *
 * A lightning Bengal in a sprinter's crouch.
 * - basics (melee, contact on the 8 t windup): A a left-claw rake, B a right-claw rake;
 * - Q Zig: a low claw-first lunge held over the dash, out of it on travelEnd (each recast plays it again, mirrored);
 * - W Spark Swipe: a coil over the 6 t windup (windupStart → cast), then a full spin swipe with both claws out;
 * - E Tail Flick: a back-flip hop (take-off on the cast, land on travelEnd);
 * - R ZIGZAG STORM (signature): a crouch over the 8 t windup, then a blur pose held while he strikes (the storm hides
 *   him from nothing: the strikes are skill FX bolts); the `clip` event 'zigzag' replays the strike pose;
 * - idle: a bouncy ready stance; fidget: shaking sparks off a paw; victory: a fist pump; emote: a lightning pose.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { gallopKeys, merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.ziggy;
const Q_AIR = T.slots.q.dashTicks * TICK_S;
const E_AIR = T.slots.e.dashTicks * TICK_S;
const W_C = T.slots.w.windup * TICK_S;
const R_C = T.slots.r.windup * TICK_S;

const RAKE_COIL = (s: 1 | -1): D => ({ chest: [-0.1, 0.4 * s, 0], [s > 0 ? 'shoulderL' : 'shoulderR']: [-2.4, 0, 0.6 * s], [s > 0 ? 'elbowL' : 'elbowR']: [-1.0, 0, 0] });
const RAKE = (s: 1 | -1): D => ({ chest: [0.2, -0.45 * s, 0], [s > 0 ? 'shoulderL' : 'shoulderR']: [-1.1, 0, -0.3 * s], [s > 0 ? 'elbowL' : 'elbowR']: [0, 0, 0] });
const LUNGE: D = { chest: [0.55, 0, 0], hips: [0.2, 0, 0], head: [-0.4, 0, 0], shoulderL: [-2.2, 0, 0.3], shoulderR: [-2.2, 0, -0.3], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };
const COIL: D = { chest: [0.3, 0.6, 0], hips: [0.1, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.8, 0, 0], thighR: [-0.6, 0, 0], kneeR: [0.8, 0, 0], shoulderL: [-1.2, 0, 0.9], shoulderR: [-1.2, 0, -0.9] };
const SWIPE: D = { chest: [0.1, -0.5, 0], shoulderL: [-1.5, 0, 1.3], shoulderR: [-1.5, 0, -1.3], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };
const TUCK: D = { chest: [-0.4, 0, 0], head: [-0.3, 0, 0], thighL: [-1.6, 0, 0], kneeL: [1.6, 0, 0], thighR: [-1.6, 0, 0], kneeR: [1.6, 0, 0], shoulderL: [-1.0, 0, 0.4], shoulderR: [-1.0, 0, -0.4] };
const BLUR: D = { chest: [0.6, 0, 0], head: [-0.5, 0, 0], shoulderL: [-2.6, 0, 0.6], shoulderR: [0.6, 0, -0.4], thighL: [-0.4, 0, 0], thighR: [0.5, 0, 0] };
const PUMP: D = { chest: [-0.2, 0, 0], head: [-0.4, 0, 0], shoulderR: [-2.9, 0, -0.3], elbowR: [-0.2, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const rake = (id: string, s: 1 | -1): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, RAKE_COIL(s), 'out'],
    [C, null, RAKE(s), 'expoIn'],
    [C + 0.12, null, merge(RAKE(s), { chest: [0.1, -0.3 * s, 0] }), 'back'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    root: { fwd: sk([0, 0], [C * 0.6, -0.05], [C, 0.18, 'expoIn'], [C + 0.26, 0, 'inOut']) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'contact']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = rake('ziggy.basicA', 1);
const basicB = rake('ziggy.basicB', -1);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Zig

const Q_T0 = 0.03;
const Q_LAND = Q_T0 + Q_AIR;
const Q_END = Q_LAND + 0.18;
const q: ClipDef = mk('ziggy.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_T0, null, LUNGE, 'out'],
  ...gallopKeys(Q_T0 + 0.02, Q_LAND, 2, LUNGE),
  [Q_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [Q_T0, 0.05], [Q_LAND, 0.02], [Q_END, 0, 'in']) },
  markers: { takeoff: Q_T0, contact: Q_T0, land: Q_LAND, end: Q_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Spark Swipe

const W_END = W_C + 0.42;
const w: ClipDef = mk('ziggy.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C, null, COIL, 'out'],
  [W_C + 0.14, null, SWIPE, 'expoIn'],
  [W_END, null, null, 'inOut'],
], {
  root: { yaw: sk([0, 0], [W_C, 0], [W_C + 0.3, 1, 'out'], [W_C + 0.3 + WRAP, 0, 'step'], [W_END, 0]) },
  calm: { yaw: 0 },
  markers: { coil: 0, contact: W_C, end: W_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Tail Flick

const E_T0 = 0.03;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.22;
const e: ClipDef = mk('ziggy.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, null, TUCK, 'out'],
  [E_LAND, null, TUCK, 'hold'],
  [E_END, null, null, 'inOut'],
], {
  root: { pitch: sk([0, 0], [E_T0, 0], [E_LAND, -1, 'inOut'], [E_LAND + WRAP, 0, 'step'], [E_END, 0]), up: sk([0, 0], [E_T0, 0], [(E_T0 + E_LAND) / 2, 0.45, 'out'], [E_LAND, 0, 'in']) },
  calm: { pitch: 0 },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R ZIGZAG STORM

const R_END = R_C + 1.0;
const r: ClipDef = mk('ziggy.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C, null, COIL, 'out'],
  [R_C + 0.08, null, BLUR, 'expoIn'],
  [R_C + 0.8, null, BLUR, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [R_C, 0.9, 'out'], [R_C + 0.08, 1.05, 'expoIn'], [R_END, 1, 'inOut']) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L'], ['contact', 'mouthOpen', 250]],
  cancel: 'none',
});

const zigzag: ClipDef = mk('ziggy.zigzag', 0.3, Prio.Ult, [
  [0, null, BLUR],
  [0.3, null, null, 'inOut'],
], { markers: { contact: 0, end: 0.3 } });

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('ziggy.idle', 1.2, Prio.Idle, [
  [0, null, null],
  [0.3, null, { chest: [0.05, 0.08, 0] }, 'inOut'],
  [0.6, null, null, 'inOut'],
  [0.9, null, { chest: [0.05, -0.08, 0] }, 'inOut'],
  [1.2, null, null, 'inOut'],
], { root: { up: sk([0, 0], [0.3, 0.04, 'out'], [0.6, 0, 'in'], [0.9, 0.04, 'out'], [1.2, 0, 'in']) } });

const shake: ClipDef = mk('ziggy.shake', 1.0, Prio.Idle, [
  [0, null, null],
  [0.2, null, { shoulderR: [-1.6, 0, -0.6], elbowR: [-0.8, 0, 0], head: [0.2, -0.3, 0] }, 'out'],
  [0.35, null, { shoulderR: [-1.6, 0.4, -0.6], elbowR: [-0.4, 0, 0], head: [0.2, -0.3, 0] }, 'inOut'],
  [0.5, null, { shoulderR: [-1.6, -0.4, -0.6], elbowR: [-0.8, 0, 0], head: [0.2, -0.3, 0] }, 'inOut'],
  [1.0, null, null, 'inOut'],
], { markers: { contact: 0.2, end: 1.0 } });

const victory: ClipDef = mk('ziggy.victory', 0.8, Prio.Emote, [
  [0, null, PUMP],
  [0.4, null, merge(PUMP, { shoulderR: [-2.4, 0, -0.3] }), 'inOut'],
  [0.8, null, PUMP, 'inOut'],
], { root: { up: sk([0, 0], [0.2, 0.2, 'out'], [0.4, 0, 'in'], [0.6, 0.2, 'out'], [0.8, 0, 'in']) }, blendIn: 0.2 });

const emote: ClipDef = mk('ziggy.emote', 2.0, Prio.Emote, [
  [0, null, null],
  [0.3, null, merge(PUMP, { shoulderL: [-0.4, 0, 1.2], chest: [-0.1, 0.3, 0] }), 'out'],
  [1.6, null, merge(PUMP, { shoulderL: [-0.4, 0, 1.2], chest: [-0.1, 0.3, 0] }), 'hold'],
  [2.0, null, null, 'inOut'],
], { markers: { contact: 0.3, end: 2.0 } });

const gait: GaitProfile = { stride: 1.35, bounce: 1.3, lean: 1.2, hipSway: 0.9, headBob: 0.9, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'ziggy',
  stub: false,
  gait,
  springs: HERO_SPRINGS.ziggy,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[shake, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { zigzag },
};

/** Tests and the gallery: every authored clip. */
export const ZIGGY_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, zigzag, idle, shake, victory, emote];
