/**
 * Nugget's move set (sim v14; build spec docs/plans/moba/DOGS-V13.md §1.1 "Moves and VFX", ANIM-SPEC §14 brief).
 *
 * A happy corgi loaf: everything bounces, the ears flop, the bum wiggles.
 * - basics (ranged, release on the 8 t windup): A a bark recoil (head thrust, mouth open, hop back), B a two-paw pat;
 * - Q Frisbee: a spin-throw, the disc released on the cast;
 * - W Best Friend: a happy leap toward the friend (bound to the cast: the hop length depends on where they stand);
 * - E Sploot (signature): he drops flat on his belly, back legs straight out behind (his own `sploot` pose), a happy
 *   bum wiggle held for the 45 t state, a hop back up on stateEnd;
 * - R Herding Time: a zoomie circle over the 15 t windup (windupStart → cast), a big bark and a stomp on the cast;
 * - idle: sitting up, panting, ears twitching; fidget: the head tilt; victory: the sploot with a wiggle; emote: the
 *   butt wiggle facing away from the camera.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;

/** The sploot is a pose of his own (chars/heroes/nugget.ts POSES.sploot: the body laid flat, legs out behind). */
const SPLOOT = 'sploot';
const WIGGLE_L: D = { hips: [0, 0.3, 0] };
const WIGGLE_R: D = { hips: [0, -0.3, 0], head: [0.1, 0, 0.1] };

// ------------------------------------------------------------------------------------------------ basics

/** A: bark recoil. Rears back, the head snaps forward with the mouth open, a little hop back. */
const basicA: ClipDef = mk('nugget.basicA', C + 0.3, Prio.Basic, [
  [0, null, null],
  [C * 0.6, null, { chest: [-0.3, 0, 0], head: [0.2, 0, 0], earL: [-0.3, 0, 0], earR: [-0.3, 0, 0] }, 'out'],
  [C, null, { chest: [0.35, 0, 0], head: [-0.4, 0, 0], shoulderL: [-0.6, 0, 0.1], shoulderR: [-0.6, 0, -0.1], earL: [0.4, 0, 0], earR: [0.4, 0, 0] }, 'expoIn'],
  [C + 0.12, null, { chest: [0.15, 0, 0], head: [-0.15, 0, 0] }, 'back'],
  [C + 0.3, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [C * 0.6, -0.06], [C, 0.1, 'expoIn'], [C + 0.12, -0.05, 'out'], [C + 0.3, 0, 'inOut']), up: sk([0, 0], [C, 0.14, 'out'], [C + 0.16, 0, 'in']), sy: sk([0, 1], [C * 0.6, 0.88], [C, 1.12, 'expoIn'], [C + 0.15, 0.95], [C + 0.3, 1, 'inOut']) },
  markers: { coil: C * 0.6, contact: C, end: C + 0.3 },
  warp: [['contact', 'release']],
  cues: [['contact', 'mouthOpen', 180], ['contact', 'whoosh', 'S']],
  cancel: 'afterContact',
});

/** B: a two-paw pat forward, the bum up. */
const basicB: ClipDef = mk('nugget.basicB', C + 0.28, Prio.Basic, [
  [0, null, null],
  [C * 0.6, null, { chest: [-0.2, 0, 0], shoulderL: [-2.2, 0, 0.2], shoulderR: [-2.2, 0, -0.2], head: [-0.2, 0, 0] }, 'out'],
  [C, null, { chest: [0.5, 0, 0], hips: [0.2, 0, 0], shoulderL: [-1.0, 0, 0.1], shoulderR: [-1.0, 0, -0.1], head: [-0.3, 0, 0] }, 'expoIn'],
  [C + 0.28, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [C, 0.12, 'expoIn'], [C + 0.28, 0, 'inOut']), sy: sk([0, 1], [C * 0.6, 1.1], [C, 0.86, 'expoIn'], [C + 0.14, 1.04, 'back'], [C + 0.28, 1]) },
  markers: { coil: C * 0.6, contact: C, end: C + 0.28 },
  warp: [['contact', 'release']],
  cues: [['contact', 'mouthOpen', 140], ['contact', 'dust']],
  cancel: 'afterContact',
});

const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Frisbee

const Q_C = 0.12;
/** A spin-throw: one whole yaw spin into the release, the right paw whipping out sideways, a follow-through hop. */
const q: ClipDef = mk('nugget.q', Q_C + 0.36, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.5, null, { chest: [0, 0.9, 0], shoulderR: [-0.4, 0, -1.4], elbowR: [-0.8, 0, 0], head: [0, -0.4, 0] }, 'out'],
  [Q_C, null, { chest: [0.1, -0.9, 0], shoulderR: [-1.3, 0, -0.6], elbowR: [0, 0, 0], head: [0, 0.3, 0] }, 'expoIn'],
  [Q_C + 0.16, null, { chest: [0.05, -0.6, 0], shoulderR: [-1.0, 0, -0.2] }, 'back'],
  [Q_C + 0.36, null, null, 'inOut'],
], {
  root: { yaw: sk([0, 0], [Q_C, 1, 'inOut'], [Q_C + WRAP, 0, 'step'], [Q_C + 0.36, 0]), up: sk([0, 0], [Q_C * 0.6, 0.18, 'out'], [Q_C + 0.12, 0, 'in']), sy: sk([0, 1], [Q_C + 0.12, 0.86, 'in'], [Q_C + 0.24, 1.05, 'back'], [Q_C + 0.36, 1]) },
  calm: { yaw: 0 },
  markers: { coil: 0, contact: Q_C, end: Q_C + 0.36 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M'], ['contact', 'mouthOpen', 200], [Q_C + 0.12, 'land']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Best Friend

const W_T0 = 0.06;
const W_LAND = 0.38;
/** A happy leap to the friend: ears back, front paws reaching, a bouncy landing with a heart (skill FX). */
const w: ClipDef = mk('nugget.w', W_LAND + 0.24, Prio.Ability, [
  [0, null, null],
  [W_T0, null, { thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], chest: [0.3, 0, 0] }, 'out'],
  [(W_T0 + W_LAND) / 2, null, { chest: [-0.15, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.3, 0, 0.3], shoulderR: [-2.3, 0, -0.3], thighL: [0.6, 0, 0], thighR: [0.6, 0, 0], earL: [-0.6, 0, 0], earR: [-0.6, 0, 0] }, 'out'],
  [W_LAND, null, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], shoulderL: [-0.8, 0, 0.5], shoulderR: [-0.8, 0, -0.5] }, 'in'],
  [W_LAND + 0.24, null, null, 'back'],
], {
  root: { up: sk([0, 0], [W_T0, 0], [(W_T0 + W_LAND) / 2, 0.7, 'out'], [W_LAND, 0, 'in'], [W_LAND + 0.24, 0]), sy: sk([0, 1], [W_T0, 0.78, 'out'], [W_T0 + 0.06, 1.15, 'out'], [W_LAND, 1], [W_LAND + 0.04, 0.72, 'in'], [W_LAND + 0.2, 1, 'back']) },
  markers: { takeoff: W_T0, contact: W_T0, land: W_LAND, end: W_LAND + 0.24 },
  warp: [['takeoff', 'cast']],
  cues: [['takeoff', 'dust'], ['takeoff', 'whoosh', 'M'], ['land', 'land'], ['land', 'fx', 'ng:hearts']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ E Sploot

const E_C = 0.14;
/** Plop: a little hop and he lands flat in the sploot on the cast. */
const e: ClipDef = mk('nugget.e', E_C + 0.18, Prio.Ability, [
  [0, null, null],
  [E_C * 0.5, null, { thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0] }, 'out'],
  [E_C, SPLOOT, null, 'in'],
  [E_C + 0.18, SPLOOT, null, 'hold'],
], {
  root: { up: sk([0, 0], [E_C * 0.5, 0.18, 'out'], [E_C, 0, 'in'], [E_C + 0.18, 0]), sx: sk([0, 1], [E_C, 1.15, 'in'], [E_C + 0.1, 1.05, 'back'], [E_C + 0.18, 1.06]) },
  markers: { coil: E_C * 0.5, contact: E_C, end: E_C + 0.18 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'land'], ['contact', 'fx', 'ng:sploot']],
  cancel: 'none',
});

/** The held sploot: the happy bum wiggle (hips twisting side to side), the chin resting. Loops until stateEnd. */
const eHold: ClipDef = mk('nugget.eHold', 0.5, Prio.Ability, [
  [0, SPLOOT, WIGGLE_L],
  [0.25, SPLOOT, WIGGLE_R, 'inOut'],
  [0.5, SPLOOT, WIGGLE_L, 'inOut'],
], { root: { sx: sk([0, 1.06], [0.25, 1.02, 'inOut'], [0.5, 1.06, 'inOut']) }, blendIn: 0.08 });

/** Up again: a push-up and a hop back onto his feet. */
const eEnd: ClipDef = mk('nugget.eEnd', 0.4, Prio.Ability, [
  [0, SPLOOT, null],
  [0.16, 'corgiStand', { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], head: [-0.2, 0, 0] }, 'out'],
  [0.4, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [0.16, 0.25, 'out'], [0.3, 0, 'in'], [0.4, 0]), sy: sk([0, 1], [0.3, 0.85, 'in'], [0.4, 1, 'back']) },
  markers: { contact: 0.16, end: 0.4 },
  warp: [['contact', 'stateEnd']],
  cues: [[0.3, 'land']],
});

// ------------------------------------------------------------------------------------------------ R Herding Time

const R_C = 0.5;
/** A zoomie circle on the spot over the windup (crouched, legs scrabbling), then the big bark and a stomp. */
const r: ClipDef = mk('nugget.r', R_C + 0.45, Prio.Ult, [
  [0, null, null],
  [0.08, null, { chest: [0.35, 0, 0], hips: [0.2, 0, 0], thighL: [-0.9, 0, 0], kneeL: [0.9, 0, 0], thighR: [0.5, 0, 0], earL: [-0.6, 0, 0], earR: [-0.6, 0, 0] }, 'out'],
  [0.2, null, { chest: [0.35, 0, 0], hips: [0.2, 0, 0], thighL: [0.5, 0, 0], thighR: [-0.9, 0, 0], kneeR: [0.9, 0, 0], earL: [-0.6, 0, 0], earR: [-0.6, 0, 0] }, 'inOut'],
  [0.32, null, { chest: [0.35, 0, 0], hips: [0.2, 0, 0], thighL: [-0.9, 0, 0], kneeL: [0.9, 0, 0], thighR: [0.5, 0, 0], earL: [-0.6, 0, 0], earR: [-0.6, 0, 0] }, 'inOut'],
  [0.44, null, { chest: [-0.3, 0, 0], head: [0.2, 0, 0], shoulderL: [-1.4, 0, 0.4], shoulderR: [-1.4, 0, -0.4] }, 'out'],
  [R_C, null, { chest: [0.3, 0, 0], head: [-0.6, 0, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6], earL: [0.4, 0, 0], earR: [0.4, 0, 0] }, 'expoIn'],
  [R_C + 0.2, null, { chest: [0.2, 0, 0], head: [-0.45, 0, 0] }, 'out'],
  [R_C + 0.45, null, null, 'inOut'],
], {
  root: {
    yaw: sk([0, 0], [0.05, 0], [0.42, 1, 'inOut'], [0.42 + WRAP, 0, 'step'], [R_C + 0.45, 0]),
    roll: sk([0, 0], [0.12, 0.04], [0.36, 0.04], [0.44, 0]),
    up: sk([0, 0], [0.44, 0.25, 'out'], [R_C, 0, 'in'], [R_C + 0.45, 0]),
    sy: sk([0, 1], [0.08, 0.85, 'out'], [0.4, 0.9], [0.46, 1.12, 'out'], [R_C, 0.78, 'in'], [R_C + 0.16, 1.06, 'back'], [R_C + 0.45, 1]),
  },
  calm: { yaw: 0, roll: 0 },
  markers: { coil: 0, contact: R_C, end: R_C + 0.45 },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'fx', 'ng:whistle'], ['coil', 'whoosh', 'L'], ['contact', 'mouthOpen', 300], ['contact', 'dustRing'], ['contact', 'shake', 2], ['contact', 'punch', 0.04]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** Sitting up proud: a happy pant (the chest bobbing), one ear twitch, a slow head sway. */
const idle: ClipDef = mk('nugget.idle', 2.0, Prio.Idle, [
  [0, null, { head: [0, 0, 0.06] }],
  [0.25, null, { chest: [-0.04, 0, 0], head: [-0.04, 0, 0.06] }, 'inOut'],
  [0.5, null, { head: [0, 0, 0.06] }, 'inOut'],
  [0.75, null, { chest: [-0.04, 0, 0], head: [-0.04, 0, 0.02], earL: [0.4, 0, -0.2] }, 'inOut'],
  [1.0, null, { head: [0, 0, -0.04] }, 'inOut'],
  [1.25, null, { chest: [-0.04, 0, 0], head: [-0.04, 0, -0.06] }, 'inOut'],
  [1.5, null, { head: [0, 0, -0.06] }, 'inOut'],
  [1.75, null, { chest: [-0.04, 0, 0], head: [-0.04, 0, 0] }, 'inOut'],
  [2.0, null, { head: [0, 0, 0.06] }, 'inOut'],
], { root: { sy: sk([0, 1], [0.25, 1.03, 'inOut'], [0.5, 1, 'inOut'], [0.75, 1.03, 'inOut'], [1.0, 1, 'inOut'], [1.25, 1.03, 'inOut'], [1.5, 1, 'inOut'], [1.75, 1.03, 'inOut'], [2.0, 1, 'inOut']) } });

/** Fidget: the head tilt ("walk? did you say walk?"), one side then the other. */
const tilt: ClipDef = mk('nugget.tilt', 1.6, Prio.Idle, [
  [0, null, null],
  [0.25, null, { head: [-0.1, 0, 0.45], earL: [-0.3, 0, 0] }, 'back'],
  [0.7, null, { head: [-0.1, 0, 0.45], earL: [-0.3, 0, 0] }, 'hold'],
  [0.95, null, { head: [-0.1, 0, -0.45], earR: [-0.3, 0, 0] }, 'back'],
  [1.35, null, { head: [-0.1, 0, -0.45], earR: [-0.3, 0, 0] }, 'hold'],
  [1.6, null, null, 'inOut'],
]);

/** Victory: the sploot, with the bum wiggle (the results-screen win pose). Loops. */
const victory: ClipDef = mk('nugget.victory', 0.6, Prio.Emote, [
  [0, SPLOOT, merge(WIGGLE_L, { hips: [0, 0.35, 0] })],
  [0.3, SPLOOT, merge(WIGGLE_R, { hips: [0, -0.35, 0] }), 'inOut'],
  [0.6, SPLOOT, merge(WIGGLE_L, { hips: [0, 0.35, 0] }), 'inOut'],
], { blendIn: 0.15 });

/** Emote: turns his back to the camera and wiggles that famous fluffy bum, then looks back over his shoulder. */
const emote: ClipDef = mk('nugget.emote', 2.0, Prio.Emote, [
  [0, null, null],
  [0.3, 'stand', { hips: [0.25, 0, 0], chest: [0.2, 0, 0] }, 'inOut'],
  [0.45, 'stand', { hips: [0.25, 0.4, 0], chest: [0.2, 0, 0] }, 'inOut'],
  [0.6, 'stand', { hips: [0.25, -0.4, 0], chest: [0.2, 0, 0] }, 'inOut'],
  [0.75, 'stand', { hips: [0.25, 0.4, 0], chest: [0.2, 0, 0] }, 'inOut'],
  [0.9, 'stand', { hips: [0.25, -0.4, 0], chest: [0.2, 0, 0] }, 'inOut'],
  [1.05, 'stand', { hips: [0.25, 0.4, 0], chest: [0.2, 0, 0] }, 'inOut'],
  [1.2, 'stand', { hips: [0.25, -0.4, 0], chest: [0.2, 0, 0], head: [0, 1.0, 0] }, 'inOut'],
  [1.6, 'stand', { hips: [0.25, 0, 0], chest: [0.2, 0, 0], head: [-0.1, 1.1, 0.2] }, 'out'],
  [2.0, null, null, 'inOut'],
], {
  root: { yaw: sk([0, 0], [0.3, 0.5, 'inOut'], [1.6, 0.5], [2.0, 1, 'inOut'], [2.0 + WRAP, 0, 'step']) },
  calm: { yaw: 0 },
  markers: { contact: 0.45, end: 2.0 },
  cues: [[0.45, 'fx', 'ng:wiggle']],
});

/** Zoomies: short fast steps, a big bounce, ears streaming. */
const gait: GaitProfile = { stride: 0.72, bounce: 1.7, lean: 1.4, hipSway: 1.3, headBob: 1.2, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'nugget',
  stub: false,
  gait,
  springs: HERO_SPRINGS.nugget,
  basic: BASICS,
  basicPick,
  slots: {
    q: { cast: q },
    w: { cast: w },
    e: { cast: e, hold: eHold, end: eEnd },
    r: { cast: r },
  },
  idle,
  fidgets: [[tilt, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const NUGGET_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, eHold, eEnd, r, idle, tilt, victory, emote];
