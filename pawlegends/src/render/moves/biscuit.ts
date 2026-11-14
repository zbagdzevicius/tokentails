/**
 * Biscuit's move set (sim v29; build spec docs/plans/moba/ROSTER-V29.md §2.3 "Moves and VFX").
 *
 * A golden retriever who plays fetch.
 * - basics (melee, contact on the 8 t windup): A a playful paw swat, B a head bump;
 * - Q Fetch! (windup 9 t: windupStart → cast): the throw wound back, then flung overarm (the ball and the leash are
 *   skill FX); the catch (`clip` event 'fetch') is a hard yank back with both front paws;
 * - W Tail Wag: a full-body wiggle, hips swinging wide;
 * - E Stubborn: paws planted wide, head down, a big shake of the scruff;
 * - R WALKIES! (signature): the leash twirled overhead over the 12 t windup, then a heave back on the cast;
 * - idle: a happy pant with the tail going; fidget: a play bow; victory: zoomies on the spot; emote: a roll-over.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.biscuit;
const Q_C = T.slots.q.windup * TICK_S;
const R_C = T.slots.r.windup * TICK_S;

const SWAT_COIL: D = { chest: [-0.15, 0.2, 0], shoulderL: [-2.2, 0, 0.4], elbowL: [-0.8, 0, 0] };
const SWAT: D = { chest: [0.25, -0.2, 0], shoulderL: [-1.0, 0, 0.1], elbowL: [0, 0, 0] };
const BUMP_COIL: D = { chest: [-0.2, 0, 0], head: [-0.3, 0, 0] };
const BUMP: D = { chest: [0.35, 0, 0], head: [0.35, 0, 0] };
const WIND: D = { chest: [-0.3, -0.5, 0], head: [-0.2, 0.3, 0], shoulderR: [-2.8, 0, -0.5], elbowR: [-1.2, 0, 0] };
const THROW: D = { chest: [0.35, 0.45, 0], head: [0.05, -0.2, 0], shoulderR: [-1.1, 0, -0.1], elbowR: [0, 0, 0] };
const YANK: D = { chest: [-0.45, 0, 0], hips: [-0.15, 0, 0], head: [-0.3, 0, 0], shoulderL: [-1.6, 0, 0.2], shoulderR: [-1.6, 0, -0.2], elbowL: [-1.2, 0, 0], elbowR: [-1.2, 0, 0] };
const WAG_L: D = { hips: [0, 0.6, 0.15], chest: [0, -0.3, 0], head: [0, -0.2, 0] };
const WAG_R: D = { hips: [0, -0.6, -0.15], chest: [0, 0.3, 0], head: [0, 0.2, 0] };
const PLANT: D = { chest: [0.35, 0, 0], head: [0.25, 0, 0], thighL: [-0.3, 0.2, 0.3], thighR: [-0.3, -0.2, -0.3], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6] };
const TWIRL: D = { chest: [-0.2, 0, 0], head: [-0.35, 0, 0], shoulderR: [-3.0, 0, -0.2], elbowR: [-0.5, 0, 0] };
const BOW: D = { chest: [0.7, 0, 0], head: [-0.6, 0, 0], shoulderL: [-1.6, 0, 0.3], shoulderR: [-1.6, 0, -0.3], hips: [-0.3, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const hit = (id: string, coil: D, at: D): ClipDef =>
  mk(id, C + 0.28, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, coil, 'out'],
    [C, null, at, 'expoIn'],
    [C + 0.12, null, merge(at, { chest: [0.15, 0, 0] }), 'back'],
    [C + 0.28, null, null, 'inOut'],
  ], {
    root: { fwd: sk([0, 0], [C * 0.6, -0.06], [C, 0.15, 'expoIn'], [C + 0.28, 0, 'inOut']) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.28 },
    warp: [['contact', 'contact']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = hit('biscuit.basicA', SWAT_COIL, SWAT);
const basicB = hit('biscuit.basicB', BUMP_COIL, BUMP);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Fetch!

const Q_END = Q_C + 0.36;
const q: ClipDef = mk('biscuit.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.8, null, WIND, 'out'],
  [Q_C, null, THROW, 'expoIn'],
  [Q_C + 0.14, null, merge(THROW, { chest: [0.3, 0.35, 0] }), 'back'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { coil: 0, contact: Q_C, end: Q_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

/** The catch (the `clip` event 'fetch'): a hard yank back. */
const fetch: ClipDef = mk('biscuit.fetch', 0.45, Prio.Ability, [
  [0, null, null],
  [0.1, null, YANK, 'expoIn'],
  [0.25, null, YANK, 'hold'],
  [0.45, null, null, 'inOut'],
], { mask: 'upper', root: { fwd: sk([0, 0], [0.1, -0.12, 'expoIn'], [0.45, 0, 'inOut']) }, markers: { contact: 0.1, end: 0.45 }, cues: [[0.1, 'mouthOpen', 200]] });

// ------------------------------------------------------------------------------------------------ W Tail Wag

const W_C = 0.05;
const W_END = 0.6;
const w: ClipDef = mk('biscuit.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C, null, WAG_L, 'out'],
  [W_C + 0.1, null, WAG_R, 'inOut'],
  [W_C + 0.2, null, WAG_L, 'inOut'],
  [W_C + 0.3, null, WAG_R, 'inOut'],
  [W_END, null, null, 'inOut'],
], {
  markers: { contact: W_C, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Stubborn

const E_C = 0.05;
const E_END = 0.7;
const e: ClipDef = mk('biscuit.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_C, null, PLANT, 'out'],
  [E_C + 0.1, null, merge(PLANT, { head: [0.25, 0.4, 0] }), 'inOut'],
  [E_C + 0.2, null, merge(PLANT, { head: [0.25, -0.4, 0] }), 'inOut'],
  [E_C + 0.3, null, PLANT, 'inOut'],
  [E_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [E_C, 0.94, 'out'], [E_END - 0.2, 0.94], [E_END, 1, 'inOut']) },
  markers: { contact: E_C, end: E_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 220]],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R WALKIES!

const R_END = R_C + 0.6;
const r: ClipDef = mk('biscuit.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.3, null, TWIRL, 'out'],
  [R_C - 0.02, null, TWIRL, 'hold'],
  [R_C + 0.12, null, YANK, 'expoIn'],
  [R_C + 0.4, null, YANK, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [R_C, 0], [R_C + 0.12, -0.15, 'expoIn'], [R_END, 0, 'inOut']) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 350], ['contact', 'shake', 1]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('biscuit.idle', 1.6, Prio.Idle, [
  [0, null, null],
  [0.4, null, { head: [-0.08, 0, 0.08], chest: [-0.04, 0, 0] }, 'inOut'],
  [0.8, null, null, 'inOut'],
  [1.2, null, { head: [-0.08, 0, -0.08], chest: [-0.04, 0, 0] }, 'inOut'],
  [1.6, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [0.4, 1.02, 'inOut'], [0.8, 1], [1.2, 1.02, 'inOut'], [1.6, 1]) }, cues: [[0, 'mouthOpen', 300]] });

const bow: ClipDef = mk('biscuit.bow', 1.4, Prio.Idle, [
  [0, null, null],
  [0.35, null, BOW, 'out'],
  [1.0, null, BOW, 'hold'],
  [1.4, null, null, 'inOut'],
], { markers: { contact: 0.35, end: 1.4 } });

const victory: ClipDef = mk('biscuit.victory', 0.9, Prio.Emote, [
  [0, null, BOW],
  [0.45, null, merge(BOW, { head: [-0.8, 0, 0.2] }), 'inOut'],
  [0.9, null, BOW, 'inOut'],
], { root: { yaw: sk([0, 0], [0.9, 1, 'inOut'], [0.9 + WRAP, 0, 'step']) }, calm: { yaw: 0 }, blendIn: 0.2 });

const emote: ClipDef = mk('biscuit.emote', 2.2, Prio.Emote, [
  [0, null, null],
  [0.4, null, merge(BOW, { chest: [0.2, 0, 1.4] }), 'out'],
  [1.8, null, merge(BOW, { chest: [0.2, 0, 1.4], shoulderL: [-2.8, 0, 0.6] }), 'inOut'],
  [2.2, null, null, 'inOut'],
], { root: { roll: sk([0, 0], [0.4, 0.25, 'out'], [1.8, 0.25], [2.2, 0, 'inOut']) }, calm: { roll: 0 }, markers: { contact: 0.4, end: 2.2 } });

const gait: GaitProfile = { stride: 1.2, bounce: 1.3, lean: 0.8, hipSway: 1.2, headBob: 1.2, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'biscuit',
  stub: false,
  gait,
  springs: HERO_SPRINGS.biscuit,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[bow, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { fetch },
};

/** Tests and the gallery: every authored clip. */
export const BISCUIT_CLIPS: readonly ClipDef[] = [basicA, basicB, q, fetch, w, e, r, idle, bow, victory, emote];
