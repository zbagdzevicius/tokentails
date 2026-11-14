/**
 * Mochi's move set (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.1 "Moves and VFX").
 *
 * A round ragdoll who hugs a pillow.
 * - basics (ranged, release on the 8 t windup): A a pillow bop forward (a little feather puff flies), B a one-paw toss;
 * - Q Pillow Toss: the pillow swung back and thrown (upper body);
 * - W Cuddle Bubble: both paws open wide, then a hug toward the friend (upper body);
 * - E Purr Wave: eyes shut, a happy purr wiggle from the shoulders (the purr rings are skill FX);
 * - R LULLABY (signature): she sways side to side over the 15 t windup (windupStart → cast), then lifts the pillow up
 *   and rests her cheek on it on the cast; the lullaby's own clip (the `clip` event 'lullaby') is a slow yawn;
 * - idle: a slow sleepy sway; fidget: a big yawn; victory: a pillow hug and a spin; emote: she curls up on the pillow.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.mochi;
const R_C = T.slots.r.windup * TICK_S;

const BOP_COIL: D = { chest: [-0.2, 0, 0], head: [-0.1, 0, 0], shoulderL: [-2.0, 0, 0.3], shoulderR: [-2.0, 0, -0.3], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] };
const BOP: D = { chest: [0.25, 0, 0], head: [0.1, 0, 0], shoulderL: [-1.3, 0, 0.15], shoulderR: [-1.3, 0, -0.15], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };
const TOSS_COIL: D = { chest: [-0.15, -0.4, 0], shoulderR: [-2.5, 0, -0.5], elbowR: [-1.1, 0, 0] };
const TOSS: D = { chest: [0.25, 0.35, 0], shoulderR: [-1.2, 0, -0.1], elbowR: [0, 0, 0] };
const OPEN: D = { chest: [-0.2, 0, 0], head: [-0.25, 0, 0], shoulderL: [-1.4, 0, 1.0], shoulderR: [-1.4, 0, -1.0], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] };
const HUG: D = { chest: [0.15, 0, 0], head: [0.1, 0, 0.1], shoulderL: [-1.2, 0, 0.1], shoulderR: [-1.2, 0, -0.1], elbowL: [-1.2, 0, 0], elbowR: [-1.2, 0, 0] };
const SWAY_L: D = { chest: [0, 0, 0.18], head: [0, 0, 0.25], hips: [0, 0, -0.08] };
const SWAY_R: D = { chest: [0, 0, -0.18], head: [0, 0, -0.25], hips: [0, 0, 0.08] };
const PILLOW_UP: D = { chest: [-0.2, 0, 0], head: [0.15, 0, 0.35], shoulderL: [-2.4, 0, 0.3], shoulderR: [-2.4, 0, -0.3], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0] };
const YAWN: D = { chest: [-0.3, 0, 0], head: [-0.55, 0, 0], shoulderL: [-2.6, 0, 0.5], shoulderR: [-2.6, 0, -0.5] };

// ------------------------------------------------------------------------------------------------ basics

const bop = (id: string, one: boolean): ClipDef =>
  mk(id, C + 0.28, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, one ? TOSS_COIL : BOP_COIL, 'out'],
    [C, null, one ? TOSS : BOP, 'expoIn'],
    [C + 0.12, null, merge(one ? TOSS : BOP, { chest: [0.1, 0, 0] }), 'back'],
    [C + 0.28, null, null, 'inOut'],
  ], {
    mask: 'upper',
    root: { sy: sk([0, 1], [C * 0.6, 0.94], [C, 1.05, 'expoIn'], [C + 0.28, 1, 'inOut']) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.28 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = bop('mochi.basicA', false);
const basicB = bop('mochi.basicB', true);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Pillow Toss

const Q_C = 0.12;
const Q_END = Q_C + 0.34;
const q: ClipDef = mk('mochi.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.5, null, TOSS_COIL, 'out'],
  [Q_C, null, TOSS, 'expoIn'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Cuddle Bubble

const W_C = 0.16;
const W_END = W_C + 0.4;
const w: ClipDef = mk('mochi.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C * 0.7, null, OPEN, 'out'],
  [W_C, null, HUG, 'inOut'],
  [W_C + 0.2, null, HUG, 'hold'],
  [W_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: W_C, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 160]],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Purr Wave

const E_C = 0.05;
const E_END = 0.55;
const e: ClipDef = mk('mochi.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_C, null, merge(SWAY_L, { head: [0.15, 0, 0.2] }), 'out'],
  [E_C + 0.12, null, SWAY_R, 'inOut'],
  [E_C + 0.24, null, SWAY_L, 'inOut'],
  [E_C + 0.36, null, SWAY_R, 'inOut'],
  [E_END, null, null, 'inOut'],
], {
  mask: 'upper',
  root: { sy: sk([0, 1], [E_C, 0.96], [E_C + 0.12, 1.03], [E_C + 0.24, 0.97], [E_END, 1, 'inOut']) },
  markers: { contact: E_C, end: E_END },
  warp: [['contact', 'cast']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R LULLABY

const R_END = R_C + 0.8;
const r: ClipDef = mk('mochi.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.25, null, SWAY_L, 'out'],
  [R_C * 0.5, null, SWAY_R, 'inOut'],
  [R_C * 0.75, null, SWAY_L, 'inOut'],
  [R_C - 0.02, null, SWAY_R, 'inOut'],
  [R_C + 0.2, null, PILLOW_UP, 'out'],
  [R_C + 0.6, null, PILLOW_UP, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [R_C, 0], [R_C + 0.2, 0.12, 'out'], [R_C + 0.5, 0, 'in'], [R_END, 0]) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 400]],
  cancel: 'none',
});

/** The lullaby moment (the `clip` event): a slow yawn with the paws up. */
const lullaby: ClipDef = mk('mochi.lullaby', 0.9, Prio.Ult, [
  [0, null, null],
  [0.35, null, YAWN, 'out'],
  [0.6, null, YAWN, 'hold'],
  [0.9, null, null, 'inOut'],
], { mask: 'upper', markers: { contact: 0.35, end: 0.9 }, cues: [[0.35, 'mouthOpen', 400]] });

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('mochi.idle', 3.0, Prio.Idle, [
  [0, null, null],
  [1.0, null, { head: [0.1, 0, 0.18], chest: [0, 0, 0.05] }, 'inOut'],
  [2.0, null, { head: [0.05, 0, -0.12], chest: [0, 0, -0.04] }, 'inOut'],
  [3.0, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [1.5, 1.025, 'inOut'], [3.0, 1, 'inOut']) } });

const yawn: ClipDef = mk('mochi.yawn', 1.6, Prio.Idle, [
  [0, null, null],
  [0.4, null, YAWN, 'out'],
  [0.9, null, YAWN, 'hold'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.4, end: 1.6 }, cues: [[0.4, 'mouthOpen', 500]] });

const victory: ClipDef = mk('mochi.victory', 1.0, Prio.Emote, [
  [0, null, HUG],
  [0.5, null, merge(HUG, { head: [-0.3, 0, 0.25] }), 'inOut'],
  [1.0, null, HUG, 'inOut'],
], { root: { yaw: sk([0, 0], [1.0, 1, 'inOut'], [1.0 + WRAP, 0, 'step']), up: sk([0, 0], [0.25, 0.15, 'out'], [0.5, 0, 'in'], [0.75, 0.15, 'out'], [1.0, 0, 'in']) }, calm: { yaw: 0 }, blendIn: 0.2 });

const emote: ClipDef = mk('mochi.emote', 2.4, Prio.Emote, [
  [0, null, null],
  [0.5, null, merge(HUG, { chest: [0.5, 0, 0], head: [0.4, 0, 0.3] }), 'out'],
  [1.9, null, merge(HUG, { chest: [0.55, 0, 0], head: [0.45, 0, 0.35] }), 'inOut'],
  [2.4, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [0.5, 0.88, 'out'], [1.9, 0.88], [2.4, 1, 'inOut']) }, markers: { contact: 0.5, end: 2.4 } });

/** A soft round waddle. */
const gait: GaitProfile = { stride: 0.95, bounce: 1.2, lean: 0.5, hipSway: 1.3, headBob: 0.9, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'mochi',
  stub: false,
  gait,
  springs: HERO_SPRINGS.mochi,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[yawn, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { lullaby },
};

/** Tests and the gallery: every authored clip. */
export const MOCHI_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, lullaby, idle, yawn, victory, emote];
