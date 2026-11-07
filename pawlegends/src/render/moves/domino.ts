/**
 * Domino's move set (sim v15; build spec docs/plans/moba/DOGS-V15.md §1.3 "Moves and VFX", ANIM-SPEC §15 brief).
 *
 * A dalmatian puppy who throws his own spots and draws with a fat crayon.
 * - basics (ranged, release on the 8 t windup): A a head flick that throws a spot, B a paw flick;
 * - Q Spot Shot: a crayon flick (upper body);
 * - W Splatter: the crayon wound back over the 12 t windup (windupStart → cast), then flung forward;
 * - E Big Shake: the wet-dog shake, a full-body wobble from nose to tail (fast alternating twists of the spine,
 *   ears flying);
 * - R CONNECT THE DOTS! (signature): scribbling in the air with the crayon over the 15 t windup (windupStart → cast),
 *   then a happy spin with the paws up on the cast (the dot-to-dot lines are skill FX);
 * - idle: the puppy sit with a head tilt; fidget: an ear scratch; victory: happy hops; emote: the shake that sends
 *   every spot flying round him (skill FX) before they drop back on.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.domino;
const W_C = T.slots.w.windup * TICK_S;
const R_C = T.slots.r.windup * TICK_S;

const FLICK_COIL: D = { chest: [-0.15, 0, 0], head: [0.35, 0.2, 0], earL: [-0.3, 0, 0], earR: [-0.3, 0, 0] };
const FLICK: D = { chest: [0.25, 0, 0], head: [-0.3, -0.25, 0], earL: [0.4, 0, 0], earR: [0.4, 0, 0] };
const WIND: D = { chest: [-0.25, -0.5, 0], head: [-0.1, 0.3, 0], shoulderR: [-2.6, 0, -0.6], elbowR: [-1.0, 0, 0] };
const FLING: D = { chest: [0.3, 0.45, 0], head: [-0.15, -0.2, 0], shoulderR: [-1.3, 0, -0.1], elbowR: [0, 0, 0] };
const SHAKE_L: D = { chest: [0, 0.5, 0.15], head: [0, 0.6, 0.25], hips: [0, -0.35, -0.1], earL: [0, 0, 0.9], earR: [0, 0, 0.6] };
const SHAKE_R: D = { chest: [0, -0.5, -0.15], head: [0, -0.6, -0.25], hips: [0, 0.35, 0.1], earL: [0, 0, -0.6], earR: [0, 0, -0.9] };
const DRAW_A: D = { chest: [-0.1, 0.2, 0], head: [-0.2, 0.15, 0], shoulderR: [-2.2, 0, -0.9], elbowR: [-0.4, 0, 0], shoulderL: [-0.4, 0, 0.3] };
const DRAW_B: D = { chest: [-0.1, -0.15, 0], head: [-0.25, -0.1, 0], shoulderR: [-2.6, 0, -0.2], elbowR: [-0.8, 0, 0], shoulderL: [-0.4, 0, 0.3] };
const CHEER: D = { chest: [-0.3, 0, 0], head: [-0.45, 0, 0], shoulderL: [-2.7, 0, 0.5], shoulderR: [-2.7, 0, -0.5], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const flick = (id: string, paw: boolean): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, paw ? { chest: [-0.1, 0.3, 0], shoulderL: [-1.8, 0, 0.6], elbowL: [-1.0, 0, 0] } : FLICK_COIL, 'out'],
    [C, null, paw ? { chest: [0.2, -0.3, 0], shoulderL: [-1.0, 0, 0.1], elbowL: [0, 0, 0] } : FLICK, 'expoIn'],
    [C + 0.12, null, paw ? { chest: [0.1, -0.2, 0], shoulderL: [-0.8, 0, 0.1] } : merge(FLICK, { chest: [0.1, 0, 0] }), 'back'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    mask: 'upper',
    root: { sy: sk([0, 1], [C * 0.6, 0.94], [C, 1.06, 'expoIn'], [C + 0.26, 1, 'inOut']) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S'], ['contact', 'fx', 'dm:flick']],
    cancel: 'afterContact',
  });
const basicA = flick('domino.basicA', false);
const basicB = flick('domino.basicB', true);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Spot Shot

const Q_C = 0.1;
const Q_END = Q_C + 0.32;
/** A crayon flick: the right paw snaps forward, the head follows. */
const q: ClipDef = mk('domino.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.5, null, { chest: [-0.15, -0.3, 0], shoulderR: [-2.2, 0, -0.5], elbowR: [-1.0, 0, 0] }, 'out'],
  [Q_C, null, FLING, 'expoIn'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'S'], ['contact', 'fx', 'dm:boop']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Splatter

const W_END = W_C + 0.38;
/** The crayon wound back over the windup, then flung (the ink flies with it). */
const w: ClipDef = mk('domino.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C * 0.6, null, WIND, 'out'],
  [W_C - 0.03, null, merge(WIND, { shoulderR: [-2.8, 0, -0.5] }), 'inOut'],
  [W_C, null, FLING, 'expoIn'],
  [W_C + 0.14, null, merge(FLING, { chest: [0.25, 0.35, 0] }), 'back'],
  [W_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [W_C, 0.1, 'out'], [W_C + 0.14, 0, 'in']), fwd: sk([0, 0], [W_C * 0.6, -0.06, 'out'], [W_C, 0.1, 'expoIn'], [W_END, 0, 'inOut']) },
  markers: { coil: 0, contact: W_C, end: W_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M'], ['contact', 'fx', 'dm:fling']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Big Shake

const E_C = 0.06;
const E_END = 0.7;
/** The wet-dog shake: fast alternating twists from head to hips, ears flying, a settle. */
const shakeKeys = (t0: number, t1: number, n: number): [number, null, D, 'inOut'][] => {
  const out: [number, null, D, 'inOut'][] = [];
  for (let i = 0; i < n; i++) out.push([t0 + ((t1 - t0) * i) / (n - 1), null, i % 2 ? SHAKE_R : SHAKE_L, 'inOut']);
  return out;
};
const e: ClipDef = mk('domino.e', E_END, Prio.Ability, [
  [0, null, null],
  ...shakeKeys(E_C, E_END - 0.16, 8),
  [E_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [E_C, 0.9, 'out'], [E_C + 0.08, 1.06, 'back'], [E_END - 0.16, 1.02], [E_END, 1]), roll: sk([0, 0], [E_C + 0.05, 0.02], [E_C + 0.12, -0.02], [E_C + 0.2, 0.02], [E_C + 0.28, -0.02], [E_END - 0.1, 0, 'inOut'], [E_END, 0]) },
  calm: { roll: 0 },
  markers: { contact: E_C, end: E_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'fx', 'dm:shake'], ['contact', 'shake', 1]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ R CONNECT THE DOTS!

const R_END = R_C + 0.7;
/** Scribbling in the air over the windup, then the happy spin with both paws up. */
const r: ClipDef = mk('domino.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.2, null, DRAW_A, 'out'],
  [R_C * 0.4, null, DRAW_B, 'inOut'],
  [R_C * 0.6, null, DRAW_A, 'inOut'],
  [R_C * 0.8, null, DRAW_B, 'inOut'],
  [R_C - 0.02, null, DRAW_A, 'inOut'],
  [R_C + 0.3, null, CHEER, 'out'],
  [R_C + 0.5, null, CHEER, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { yaw: sk([0, 0], [R_C, 0], [R_C + 0.4, 1, 'inOut'], [R_C + 0.4 + WRAP, 0, 'step'], [R_END, 0]), up: sk([0, 0], [R_C, 0], [R_C + 0.2, 0.3, 'out'], [R_C + 0.4, 0, 'in'], [R_END, 0]) },
  calm: { yaw: 0 },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'fx', 'dm:draw'], ['contact', 'mouthOpen', 300], ['contact', 'fx', 'dm:dots']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** The puppy sit: the head tilting one way and back, a little bounce. */
const idle: ClipDef = mk('domino.idle', 2.4, Prio.Idle, [
  [0, null, null],
  [0.8, null, { head: [0, 0.1, 0.3] }, 'inOut'],
  [1.6, null, { head: [0, -0.05, -0.1] }, 'inOut'],
  [2.4, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [1.2, 1.02, 'inOut'], [2.4, 1, 'inOut']) } });

/** Fidget: a back-paw ear scratch (the head tipped, the leg going). */
const scratch: ClipDef = mk('domino.scratch', 1.4, Prio.Idle, [
  [0, null, null],
  [0.25, null, { head: [0.1, 0, 0.5], thighL: [-1.6, 0, 0.6], kneeL: [0.4, 0, 0] }, 'out'],
  [0.4, null, { head: [0.1, 0, 0.5], thighL: [-1.9, 0, 0.6], kneeL: [0.6, 0, 0] }, 'inOut'],
  [0.55, null, { head: [0.1, 0, 0.5], thighL: [-1.6, 0, 0.6], kneeL: [0.4, 0, 0] }, 'inOut'],
  [0.7, null, { head: [0.1, 0, 0.5], thighL: [-1.9, 0, 0.6], kneeL: [0.6, 0, 0] }, 'inOut'],
  [0.85, null, { head: [0.1, 0, 0.5], thighL: [-1.6, 0, 0.6], kneeL: [0.4, 0, 0] }, 'inOut'],
  [1.4, null, null, 'inOut'],
], { markers: { contact: 0.25, end: 1.4 } });

/** Victory: happy hops with the paws up. Loops. */
const victory: ClipDef = mk('domino.victory', 0.7, Prio.Emote, [
  [0, null, CHEER],
  [0.35, null, merge(CHEER, { head: [-0.5, 0, 0.2] }), 'inOut'],
  [0.7, null, CHEER, 'inOut'],
], { root: { up: sk([0, 0], [0.18, 0.25, 'out'], [0.35, 0, 'in'], [0.53, 0.25, 'out'], [0.7, 0, 'in']) }, blendIn: 0.2 });

/** Emote: the shake; every spot flies off and circles him (skill FX), then drops back on. */
const emote: ClipDef = mk('domino.emote', 2.2, Prio.Emote, [
  [0, null, null],
  ...shakeKeys(0.1, 0.8, 8),
  [1.0, null, { head: [0, 0.2, 0.35] }, 'inOut'],
  [1.8, null, { head: [0, -0.2, -0.3] }, 'inOut'],
  [2.2, null, null, 'inOut'],
], { markers: { contact: 0.1, end: 2.2 }, cues: [[0.1, 'fx', 'dm:emote']] });

/** A bouncy puppy trot. */
const gait: GaitProfile = { stride: 1.2, bounce: 1.5, lean: 0.8, hipSway: 1.1, headBob: 1.3, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'domino',
  stub: false,
  gait,
  springs: HERO_SPRINGS.domino,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[scratch, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const DOMINO_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, idle, scratch, victory, emote];
