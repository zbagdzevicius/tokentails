/**
 * Marshmallow's move set (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.2 "Moves and VFX", ANIM-SPEC §14 brief).
 *
 * A bouncy Samoyed puppy: two-paw tosses, belly flops, a head tilt and a sneeze.
 * - basics (ranged, release on the 8 t windup): A a two-paw overhead toss, B a one-paw underarm flick;
 * - Q Snowball: a big two-paw overhead throw with a squash, released on the cast;
 * - W Snow Patch: paws up on windupStart, a two-paw slap on the ground on the cast (9 t windup);
 * - E Belly Slide: a dive onto her belly on the cast, sliding the dash (travelEnd), a hop back up;
 * - R SNOW DAY!: arms rising to the sky over the 18 t windup, a happy jump on the cast, then she flops onto her back
 *   in the snow and waves her paws (a snow angel) before bouncing up;
 * - idle: a sit with the head tilting side to side; fidget and emote: the sneeze that shakes the snow off her hat.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { mk, sk, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.marshmallow;
/** Belly Slide air (s): the 4 m slide at its own speed. */
const E_AIR = T.slots.e.dashTicks * TICK_S;

const ARMS_UP: D = { shoulderL: [-2.7, 0, 0.25], shoulderR: [-2.7, 0, -0.25], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], chest: [-0.25, 0, 0], head: [-0.25, 0, 0] };
const TOSS: D = { shoulderL: [-1.3, 0, 0.1], shoulderR: [-1.3, 0, -0.1], elbowL: [0, 0, 0], elbowR: [0, 0, 0], chest: [0.35, 0, 0], head: [-0.1, 0, 0] };
/** Her own lying poses (chars/heroes/marshmallow.ts POSES): flat on her belly (the slide), on her back (the angel). */
const BELLY = 'bellySlide';
const ANGEL = 'snowAngel';
/** The snow angel's sweep: arms up beside her head and legs together (deltas on the angel pose). */
const ANGEL2: D = { shoulderL: [0, 0, 0.9], shoulderR: [0, 0, -0.9], thighL: [0, 0, -0.35], thighR: [0, 0, 0.35] };

// ------------------------------------------------------------------------------------------------ basics

/** A: two paws up over her head, then the toss forward with a little hop. */
const basicA: ClipDef = mk('marshmallow.basicA', C + 0.3, Prio.Basic, [
  [0, null, null],
  [C * 0.6, null, ARMS_UP, 'out'],
  [C, null, TOSS, 'expoIn'],
  [C + 0.3, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [C * 0.6, 0.1, 'out'], [C, 0, 'in']), sy: sk([0, 1], [C * 0.6, 1.1, 'out'], [C, 0.9, 'expoIn'], [C + 0.14, 1.04, 'back'], [C + 0.3, 1]) },
  markers: { coil: C * 0.6, contact: C, end: C + 0.3 },
  warp: [['contact', 'release']],
  cues: [['contact', 'whoosh', 'S']],
  cancel: 'afterContact',
});

/** B: an underarm flick with the right paw, the body twisting into it. */
const basicB: ClipDef = mk('marshmallow.basicB', C + 0.26, Prio.Basic, [
  [0, null, null],
  [C * 0.6, null, { chest: [0, 0.6, 0], shoulderR: [0.8, 0, -0.3], head: [0, -0.2, 0] }, 'out'],
  [C, null, { chest: [0.15, -0.5, 0], shoulderR: [-1.6, 0, -0.3], head: [0, 0.2, 0] }, 'expoIn'],
  [C + 0.26, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [C, 0.08, 'expoIn'], [C + 0.26, 0, 'inOut']) },
  markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
  warp: [['contact', 'release']],
  cues: [['contact', 'whoosh', 'S']],
  cancel: 'afterContact',
});

const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Snowball

const Q_C = 0.12;
/** The big snowball: both paws up, a stretch, then the overhead heave with a squash and a skip forward. */
const q: ClipDef = mk('marshmallow.q', Q_C + 0.4, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.6, null, ARMS_UP, 'out'],
  [Q_C, null, TOSS, 'expoIn'],
  [Q_C + 0.14, null, { ...TOSS, chest: [0.45, 0, 0] }, 'back'],
  [Q_C + 0.4, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [Q_C, 0.14, 'expoIn'], [Q_C + 0.4, 0, 'inOut']), sy: sk([0, 1], [Q_C * 0.6, 1.14, 'out'], [Q_C, 0.82, 'expoIn'], [Q_C + 0.16, 1.05, 'back'], [Q_C + 0.4, 1]), sx: sk([0, 1], [Q_C, 1.14, 'expoIn'], [Q_C + 0.16, 0.97, 'back'], [Q_C + 0.4, 1]) },
  markers: { coil: Q_C * 0.6, contact: Q_C, end: Q_C + 0.4 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Snow Patch

const W_C = T.slots.w.windup * TICK_S;
/** Paws up and a crouch over the windup, then a two-paw slap on the ground (patting the snow flat) on the cast. */
const w: ClipDef = mk('marshmallow.w', W_C + 0.35, Prio.Ability, [
  [0, null, null],
  [W_C * 0.8, null, { ...ARMS_UP, kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'],
  [W_C, null, { chest: [0.8, 0, 0], head: [-0.4, 0, 0], shoulderL: [-1.0, 0, 0.3], shoulderR: [-1.0, 0, -0.3], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0] }, 'expoIn'],
  [W_C + 0.12, null, { chest: [0.7, 0, 0], head: [-0.45, 0, 0], shoulderL: [-1.0, 0, 0.4], shoulderR: [-1.0, 0, -0.4], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'out'],
  [W_C + 0.35, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [W_C * 0.8, 0.15, 'out'], [W_C, 0, 'in'], [W_C + 0.35, 0, 'inOut']), sy: sk([0, 1], [W_C * 0.8, 1.1], [W_C, 0.78, 'in'], [W_C + 0.16, 1.03, 'back'], [W_C + 0.35, 1]) },
  markers: { coil: 0, contact: W_C, end: W_C + 0.35 },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'dustRing'], ['contact', 'fx', 'mm:pat']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ E Belly Slide

const E_T0 = 0.06;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.32;
/** A dive onto her belly on the cast, sliding the whole dash with her paws out front, a hop back up at the end. */
const e: ClipDef = mk('marshmallow.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, BELLY, null, 'out'],
  [E_LAND - 0.02, BELLY, { head: [-0.1, 0, 0] }, 'hold'],
  [E_LAND + 0.14, 'pupReady', { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-1.8, 0, 0.6], shoulderR: [-1.8, 0, -0.6] }, 'out'],
  [E_END, null, null, 'back'],
], {
  root: {
    up: sk([0, 0], [E_LAND, 0], [E_LAND + 0.14, 0.25, 'out'], [E_END - 0.08, 0, 'in'], [E_END, 0]),
    sx: sk([0, 1], [E_T0, 1.12], [E_LAND, 1.08], [E_LAND + 0.14, 1], [E_END, 1]),
  },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M'], ['takeoff', 'fx', 'mm:slide'], ['land', 'land'], [E_END - 0.08, 'dust']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ R SNOW DAY!

const R_C = T.slots.r.windup * TICK_S;
const R_FLOP = R_C + 0.3;
const R_UP = R_C + 1.3;
const R_END = R_UP + 0.35;
/** Arms rise over the windup, a happy jump on the cast, a flop onto her back and a snow angel, then a bounce up. */
const r: ClipDef = mk('marshmallow.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.85, null, { ...ARMS_UP, head: [-0.5, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'inOut'],
  [R_C, null, { shoulderL: [-2.4, 0, 1.0], shoulderR: [-2.4, 0, -1.0], head: [-0.4, 0, 0], chest: [-0.2, 0, 0], thighL: [0.2, 0, 0.3], thighR: [0.2, 0, -0.3] }, 'expoOut'],
  [R_FLOP, ANGEL, null, 'in'],
  [R_FLOP + 0.25, ANGEL, ANGEL2, 'inOut'],
  [R_FLOP + 0.5, ANGEL, null, 'inOut'],
  [R_FLOP + 0.75, ANGEL, ANGEL2, 'inOut'],
  [R_UP, ANGEL, null, 'inOut'],
  [R_UP + 0.18, 'pupReady', { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] }, 'out'],
  [R_END, null, null, 'back'],
], {
  root: {
    up: sk([0, 0], [R_C * 0.85, 0], [R_C + 0.12, 0.55, 'out'], [R_FLOP, 0, 'in'], [R_UP, 0], [R_UP + 0.18, 0.2, 'out'], [R_END, 0, 'in']),
    sy: sk([0, 1], [R_C * 0.85, 1.12, 'inOut'], [R_C, 0.85, 'in'], [R_C + 0.1, 1.12, 'out'], [R_FLOP, 1], [R_END, 1]),
  },
  markers: { coil: 0, contact: R_C, flop: R_FLOP, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'fx', 'mm:awoo'], ['contact', 'shake', 2], ['flop', 'land'], ['flop', 'fx', 'mm:flop']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** Sitting, the head tilting one way and the other, a soft breath. */
const idle: ClipDef = mk('marshmallow.idle', 2.4, Prio.Idle, [
  [0, null, { head: [0, 0, 0] }],
  [0.6, null, { head: [-0.05, 0, 0.12] }, 'inOut'],
  [1.2, null, { head: [0, 0, 0] }, 'inOut'],
  [1.8, null, { head: [-0.05, 0, -0.42] }, 'inOut'],
  [2.4, null, { head: [0, 0, 0] }, 'inOut'],
], { root: { sy: sk([0, 1], [0.6, 1.03, 'inOut'], [1.2, 1, 'inOut'], [1.8, 1.03, 'inOut'], [2.4, 1, 'inOut']) } });

/** The sneeze: head back, a tiny wind-up, ACHOO (the head snaps down, the body squashes), snow shaken off her hat. */
const sneeze: ClipDef = mk('marshmallow.sneeze', 1.3, Prio.Idle, [
  [0, null, null],
  [0.35, null, { head: [-0.45, 0, 0], chest: [-0.15, 0, 0] }, 'inOut'],
  [0.5, null, { head: [-0.55, 0, 0.05], chest: [-0.2, 0, 0] }, 'inOut'],
  [0.56, null, { head: [0.55, 0, 0], chest: [0.35, 0, 0], earL: [0.4, 0, 0], earR: [0.4, 0, 0] }, 'expoIn'],
  [0.8, null, { head: [0.1, 0, 0.2] }, 'back'],
  [0.95, null, { head: [0, 0, -0.2] }, 'inOut'],
  [1.3, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [0.5, 1.06], [0.56, 0.8, 'expoIn'], [0.72, 1.05, 'back'], [0.9, 1]), fwd: sk([0, 0], [0.56, 0.06, 'expoIn'], [0.8, 0, 'inOut']) },
  markers: { contact: 0.56, end: 1.3 },
  cues: [[0.56, 'fx', 'mm:sneeze'], [0.56, 'mouthOpen', 150]],
});

/** Victory: happy little hops with her paws up. Loops. */
const victory: ClipDef = mk('marshmallow.victory', 0.8, Prio.Emote, [
  [0, null, { shoulderL: [-2.5, 0, 0.5], shoulderR: [-2.5, 0, -0.5] }],
  [0.2, null, { shoulderL: [-2.7, 0, 0.8], shoulderR: [-2.7, 0, -0.8], head: [-0.3, 0, 0.1], thighL: [-0.4, 0, 0], kneeL: [0.8, 0, 0] }, 'out'],
  [0.4, null, { shoulderL: [-2.5, 0, 0.5], shoulderR: [-2.5, 0, -0.5] }, 'in'],
  [0.6, null, { shoulderL: [-2.7, 0, 0.8], shoulderR: [-2.7, 0, -0.8], head: [-0.3, 0, -0.1], thighR: [-0.4, 0, 0], kneeR: [0.8, 0, 0] }, 'out'],
  [0.8, null, { shoulderL: [-2.5, 0, 0.5], shoulderR: [-2.5, 0, -0.5] }, 'in'],
], { root: { up: sk([0, 0], [0.2, 0.35, 'out'], [0.4, 0, 'in'], [0.6, 0.35, 'out'], [0.8, 0, 'in']), sy: sk([0, 0.88], [0.08, 1.08, 'out'], [0.38, 1], [0.4, 0.88, 'in'], [0.48, 1.08, 'out'], [0.78, 1], [0.8, 0.88, 'in']) } });

/** Emote: a slow head tilt, then the sneeze. */
const emote: ClipDef = mk('marshmallow.emote', 1.9, Prio.Emote, [
  [0, null, null],
  [0.4, null, { head: [-0.05, 0, 0.5] }, 'back'],
  [0.7, null, { head: [-0.05, 0, 0.5] }, 'hold'],
  [0.95, null, { head: [-0.5, 0, 0.1], chest: [-0.2, 0, 0] }, 'inOut'],
  [1.1, null, { head: [-0.6, 0, 0.1], chest: [-0.2, 0, 0] }, 'inOut'],
  [1.16, null, { head: [0.55, 0, 0], chest: [0.35, 0, 0] }, 'expoIn'],
  [1.5, null, { head: [0.1, 0, -0.2] }, 'back'],
  [1.9, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [1.1, 1.06], [1.16, 0.8, 'expoIn'], [1.32, 1.05, 'back'], [1.5, 1]) },
  markers: { contact: 1.16, end: 1.9 },
  cues: [[1.16, 'fx', 'mm:sneeze'], [1.16, 'mouthOpen', 150]],
});

/** A bouncy puppy hop: a big bounce, short stride, paws flapping. */
const gait: GaitProfile = { stride: 0.8, bounce: 1.9, lean: 0.6, hipSway: 1.0, headBob: 1.4, arms: 'flap', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'marshmallow',
  stub: false,
  gait,
  springs: HERO_SPRINGS.marshmallow,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[sneeze, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const MARSHMALLOW_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, idle, sneeze, victory, emote];
