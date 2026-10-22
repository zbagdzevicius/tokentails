/**
 * Clem's move set (ANIM-SPEC §14 "Clem", the reference hero): a three-swing sword combo, the Paw Combo's three stages
 * (lunge, spinning backhand, launcher uppercut into a front somersault), The Stand's planted guard held to the sim's
 * block end, Tumble's dive roll driven by the dash's progress, Golden Hour's spinning sun-leap into a plant-slam, the
 * 360° sun-cleave on every 3rd basic during Golden Hour, and her idle, victory, emote, death and respawn.
 *
 * Every number the sim decides comes from anim/timing.ts (the 8 t basic windup, the dash ticks, The Stand's duration
 * via the stateEnd anchor), never literals. Instant casts get the ≈53 ms peek coil and put the weight in the
 * follow-through (§4.2 rule 7). Rotation channels that finish a whole turn step back to 0 on the same frame (a held
 * 1.0 turn would unwind backwards while the clip blends out). `lockFeet` is not implemented yet (anim/feet.ts), so
 * the planted swings keep the root within 0.06 m of her feet and put the lunge into chest and hip pitch instead of a
 * root slide. Render only.
 */
import { DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type Cue, type GaitProfile, type MoveCtx, type MoveSet, type ScalarKey } from '../anim/types';

const C = BASIC_CONTACT;
const EPS = 0.001;

/** A whole-turn rotation from t0 to t1 that steps back to 0 right after (the same orientation, no unwinding). */
const turn = (t0: number, t1: number, turns: number, ease: ScalarKey[2] = 'inOut', pre: readonly ScalarKey[] = []): ScalarKey[] => [
  [0, 0],
  ...pre,
  [t0, pre.length ? pre[pre.length - 1][1] : 0],
  [t1, turns, ease],
  [t1 + EPS, 0, 'step'],
];

// ------------------------------------------------------------------------------------------------ live state

/**
 * Render-side state shared with skillfx/clem.ts (per entity id, preallocated): the FX clock (advanced by the skill
 * FX's update), Golden Hour's start and the basic count at its cast (the sim fires the wave on every 3rd basic after
 * the cast), and Valor (full bar seen, spent on this cast).
 */
export const CLEM_LIVE = {
  now: 0,
  rUntil: new Float64Array(16).fill(-1),
  rCount: new Int32Array(16),
  valorFull: new Uint8Array(16),
  /** Render time (s) until which hit readings may not re-latch `valorFull` (right after a cast spent it). */
  valorBlock: new Float64Array(16).fill(-1),
  empowered: new Uint8Array(16),
};
/** Golden Hour's default length (s) until the cast FX reads the talent-resolved one. */
const R_DEFAULT_S = 180 * TICK_S;

// ------------------------------------------------------------------------------------------------ basics

const trail: readonly Cue[] = [
  [0.1, 'trailOn', 'weapon'],
  ['contact', 'smear'],
  [0.46, 'trailOff'],
];

/** A: a flat slash from her right to her left, hips leading, the right foot stepping in and planting. */
const basicA: ClipDef = {
  id: 'clem.basicA',
  len: 0.62,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, null, null],
    [0.17, null, { chest: [-0.08, -0.65, 0], hips: [0, -0.3, 0], shoulderR: [-1.25, 0, -1.1], elbowR: [-0.7, 0, 0], shoulderL: [-0.3, 0, 0.5], thighR: [-0.2, 0, 0], kneeR: [0.25, 0, 0], thighL: [0.15, 0, 0], kneeL: [0.25, 0, 0] }, 'out'],
    [C, null, { chest: [0.36, 0.55, 0], hips: [0.1, 0.3, 0], head: [0.05, -0.3, 0], shoulderR: [-1.35, 0, 1.05], elbowR: [0.05, 0, 0], shoulderL: [0.2, 0, -0.4], thighR: [-0.6, 0, 0], kneeR: [0.55, 0, 0], thighL: [0.4, 0, 0], kneeL: [0.25, 0, 0] }, 'expoIn'],
    [C + 0.1, null, { chest: [0.38, 0.75, 0], hips: [0.1, 0.4, 0], head: [0.05, -0.35, 0], shoulderR: [-1.05, 0, 1.3], elbowR: [0.1, 0, 0], shoulderL: [0.3, 0, -0.5], thighR: [-0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [0.4, 0, 0], kneeL: [0.25, 0, 0] }, 'out'],
    [0.62, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.17, -0.02, 'out'], [C, 0.05, 'expoIn'], [C + 0.12, 0.06], [0.62, 0, 'inOut']],
    yaw: [[0, 0], [0.17, -0.05, 'out'], [C, 0.06, 'expoIn'], [C + 0.1, 0.08, 'out'], [0.62, 0, 'inOut']],
    sy: [[0, 1], [0.17, 0.9, 'out'], [C, 1.06, 'expoIn'], [C + 0.16, 1, 'out']],
  },
  markers: { coil: 0.17, contact: C, end: 0.62 },
  warp: [['contact', 'contact']],
  cues: [...trail, ['contact', 'whoosh', 'S']],
  lockFeet: true,
  cancel: 'afterContact',
};

/** B: a rising backhand from her low left to high right, the chest counter-rotating, a step in. */
const basicB: ClipDef = {
  id: 'clem.basicB',
  len: 0.62,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, null, null],
    [0.17, null, { chest: [0.3, 0.8, 0], hips: [0, 0.35, 0], head: [0.1, -0.4, 0], shoulderR: [-0.35, 0, 1.25], elbowR: [-0.9, 0, 0], shoulderL: [0.1, 0, -0.3], thighL: [-0.2, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [C, null, { chest: [-0.2, -0.75, 0], hips: [0, -0.35, 0], head: [-0.2, 0.3, 0], shoulderR: [-2.3, 0, -0.85], elbowR: [0, 0, 0], shoulderL: [-0.5, 0, 0.7], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.3, 0, 0], kneeR: [0.15, 0, 0] }, 'expoIn'],
    [C + 0.1, null, { chest: [-0.25, -0.95, 0], hips: [0, -0.4, 0], head: [-0.25, 0.35, 0], shoulderR: [-2.6, 0, -1.05], elbowR: [0.05, 0, 0], shoulderL: [-0.6, 0, 0.8], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.3, 0, 0] }, 'out'],
    [0.62, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.17, -0.02], [C, 0.05, 'expoIn'], [C + 0.12, 0.05], [0.62, 0, 'inOut']],
    up: [[0, 0], [0.17, 0], [C, 0.1, 'expoIn'], [C + 0.14, 0.04, 'out'], [0.4, 0, 'in']],
    yaw: [[0, 0], [0.17, 0.06, 'out'], [C, -0.07, 'expoIn'], [C + 0.1, -0.09, 'out'], [0.62, 0, 'inOut']],
    sy: [[0, 1], [0.17, 0.86, 'out'], [C, 1.1, 'expoIn'], [C + 0.18, 1, 'out']],
  },
  markers: { coil: 0.17, contact: C, end: 0.62 },
  warp: [['contact', 'contact']],
  cues: [...trail, ['contact', 'whoosh', 'S']],
  lockFeet: true,
  cancel: 'afterContact',
};

/** C: the overhead chop: a crouch, a hop with the blade high, slammed down onto the contact with a landing squash. */
const basicC: ClipDef = {
  id: 'clem.basicC',
  len: 0.64,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, null, null],
    [0.08, null, { chest: [0.2, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], shoulderR: [-0.6, 0, 0], shoulderL: [-0.4, 0, 0] }, 'out'],
    [0.19, null, { chest: [-0.45, 0, 0], head: [-0.3, 0, 0], shoulderR: [-2.9, 0, 0.1], elbowR: [-0.5, 0, 0], shoulderL: [-2.6, 0, -0.1], elbowL: [-0.5, 0, 0], thighL: [-0.7, 0, 0], kneeL: [0.9, 0, 0], thighR: [0.2, 0, 0], kneeR: [0.5, 0, 0] }, 'out'],
    [C, null, { chest: [0.45, 0, 0], head: [0.3, 0, 0], shoulderR: [-0.8, 0, 0.25], elbowR: [0, 0, 0], shoulderL: [-0.8, 0, -0.25], elbowL: [0, 0, 0], thighL: [-0.85, 0, 0], kneeL: [1.0, 0, 0], thighR: [-0.1, 0, 0], kneeR: [1.1, 0, 0] }, 'expoIn'],
    [C + 0.14, null, { chest: [0.4, 0, 0], head: [0.15, 0, 0], shoulderR: [-0.6, 0, 0.3], shoulderL: [-0.6, 0, -0.3], thighL: [-0.8, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0] }, 'out'],
    [0.64, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.08, -0.02], [C, 0.06, 'in'], [C + 0.14, 0.06], [0.64, 0, 'inOut']],
    up: [[0, 0], [0.08, 0], [0.19, 0.3, 'out'], [C, 0, 'expoIn'], [0.64, 0]],
    pitch: [[0, 0], [0.19, -0.03, 'out'], [C, 0.02, 'expoIn'], [C + 0.14, 0.015], [0.64, 0, 'inOut']],
    sy: [[0, 1], [0.08, 0.82, 'out'], [0.14, 1.12, 'out'], [C - 0.02, 1.05], [C, 0.8, 'expoIn'], [C + 0.18, 1.04, 'back'], [0.4, 1, 'inOut']],
  },
  markers: { coil: 0.19, contact: C, end: 0.64 },
  warp: [['contact', 'contact']],
  cues: [...trail, ['contact', 'whoosh', 'M'], ['contact', 'dust']],
  lockFeet: true,
  cancel: 'afterContact',
};

/** Root yaw (turns) of the sun-cleave on its contact: the blade arm points at the aim (anim-clem test checks it). */
export const SUN_CLEAVE_C_TURN = 0.24;

/** Golden Hour's every-3rd basic: a 360° sun-cleave, the blade crossing the front on the wave's spawn. */
const sunCleave: ClipDef = {
  id: 'clem.sunCleave',
  len: 0.66,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, null, null],
    [0.12, null, { chest: [0.25, -0.5, 0], hips: [0, -0.2, 0], shoulderR: [-1.0, 0, -1.2], elbowR: [-0.5, 0, 0], shoulderL: [-0.4, 0, 0.6], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'],
    [C, null, { chest: [0.1, 0.3, 0], shoulderR: [-1.45, 0, -1.45], elbowR: [0, 0, 0], shoulderL: [-1.3, 0, 1.4], elbowL: [0, 0, 0], thighL: [-0.9, 0, 0], kneeL: [1.3, 0, 0], thighR: [0.1, 0, 0] }, 'expoIn'],
    [0.4, null, { chest: [0.15, 0.4, 0], shoulderR: [-1.4, 0, -1.4], shoulderL: [-1.3, 0, 1.4], thighL: [-0.6, 0, 0], kneeL: [0.9, 0, 0] }, 'lin'],
    [0.48, null, { chest: [0.3, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], shoulderR: [-1.2, 0, 0.6] }, 'out'],
    [0.66, null, null, 'inOut'],
  ],
  root: {
    // the blade arm is out to her right at the contact pose (≈ −87° in the body frame): 0.24 of the turn lands on C so
    // the blade crosses her front on the impact frame (the wave leaves with it), then the turn whips round to 1
    yaw: [[0, 0], [0.1, -0.04, 'out'], [C, SUN_CLEAVE_C_TURN, 'expoIn'], [0.42, 1, 'out'], [0.42 + EPS, 0, 'step']],
    up: [[0, 0], [0.12, 0], [C, 0.22, 'out'], [0.42, 0, 'in'], [0.66, 0]],
    sy: [[0, 1], [0.12, 0.84, 'out'], [0.2, 1.1, 'out'], [0.42, 1], [0.45, 0.82, 'in'], [0.6, 1, 'back']],
  },
  markers: { coil: 0.12, contact: C, end: 0.66 },
  warp: [['contact', 'contact']],
  cues: [[0.08, 'trailOn', 'weapon'], ['contact', 'smear'], ['contact', 'ghost'], ['contact', 'whoosh', 'L'], [0.42, 'land'], [0.42, 'dust'], [0.5, 'trailOff']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

/** The basic cycle A → B → C by confirmed basics; Golden Hour's wave basics become the sun-cleave. Allocation-free. */
function basicPick(ctx: MoveCtx): ClipDef {
  const id = ctx.id & 15;
  const L = CLEM_LIVE;
  noteValor(id, ctx.resource);
  if (L.now < L.rUntil[id] && (ctx.basicCount - L.rCount[id] + 1) % 3 === 0) return sunCleave;
  const k = ctx.basicCount % 3;
  return k === 0 ? basicA : k === 1 ? basicB : basicC;
}

// ------------------------------------------------------------------------------------------------ Q Paw Combo

/** Q1: a lunging thrust on the cast tick, a long hold in the lunge, back to guard. */
const q1: ClipDef = {
  id: 'clem.q1',
  len: 0.52,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: [
    [0, null, null],
    [0.05, null, { chest: [-0.15, -0.5, 0], hips: [0, -0.25, 0], shoulderR: [0.4, 0, -0.5], elbowR: [-1.4, 0, 0], thighR: [0.35, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [0.1, null, { chest: [0.38, 0.35, 0], hips: [0.12, 0.2, 0], head: [0.05, -0.2, 0], shoulderR: [-1.55, 0, 0.35], elbowR: [0, 0, 0], pawR: [0.9, 0, 0], shoulderL: [0.5, 0, 0.6], elbowL: [-0.4, 0, 0], thighL: [-1.05, 0, 0], kneeL: [0.95, 0, 0], thighR: [0.75, 0, 0], kneeR: [0.15, 0, 0] }, 'expoIn'],
    [0.26, null, { chest: [0.42, 0.4, 0], hips: [0.12, 0.2, 0], head: [0.05, -0.2, 0], shoulderR: [-1.6, 0, 0.4], pawR: [1.0, 0, 0], shoulderL: [0.6, 0, 0.7], elbowL: [-0.4, 0, 0], thighL: [-1.1, 0, 0], kneeL: [1.0, 0, 0], thighR: [0.8, 0, 0], kneeR: [0.15, 0, 0] }, 'out'],
    [0.52, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.05, -0.03, 'out'], [0.1, 0.06, 'expoIn'], [0.26, 0.06, 'out'], [0.52, 0, 'inOut']],
    sy: [[0, 1], [0.05, 0.88, 'out'], [0.1, 0.94, 'expoIn'], [0.3, 0.92], [0.52, 1, 'inOut']],
    sx: [[0, 1], [0.1, 1.12, 'expoIn'], [0.2, 1, 'out']],
  },
  markers: { coil: 0.05, contact: 0.1, end: 0.52 },
  warp: [['contact', 'cast']],
  cues: [[0, 'trailOn', 'weapon'], ['contact', 'smear'], ['contact', 'whoosh', 'M'], [0.34, 'trailOff']],
  lockFeet: true,
  cancel: 'afterContact',
};

/** Q2: a spinning backhand: one turn in 220 ms, her extended right arm crossing the front on the cast tick, one ghost. */
const q2: ClipDef = {
  id: 'clem.q2',
  len: 0.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.05,
  keys: [
    [0, null, null],
    [0.03, null, { chest: [0.2, -0.4, 0], shoulderR: [-1.0, 0, -1.0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [0.06, null, { chest: [0.1, 0.25, 0], shoulderR: [-1.5, 0, -1.45], elbowR: [0, 0, 0], shoulderL: [-1.2, 0, 1.3], thighL: [-0.9, 0, 0.1], kneeL: [1.4, 0, 0], thighR: [0.05, 0, 0] }, 'expoIn'],
    [0.2, null, { chest: [0.1, 0.35, 0], shoulderR: [-1.5, 0, -1.4], shoulderL: [-1.2, 0, 1.3], thighL: [-0.9, 0, 0.1], kneeL: [1.4, 0, 0] }, 'lin'],
    [0.3, null, { chest: [0.35, 0.1, 0], shoulderR: [-1.0, 0, 0.6], elbowR: [-0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'],
    [0.5, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [0.06, 0.25, 'in'], [0.28, 1, 'out'], [0.28 + EPS, 0, 'step']],
    up: [[0, 0], [0.06, 0.12, 'out'], [0.2, 0.12], [0.28, 0, 'in'], [0.5, 0]],
    sy: [[0, 1], [0.03, 0.9, 'out'], [0.06, 1.08, 'out'], [0.26, 1], [0.3, 0.84, 'in'], [0.45, 1, 'back']],
  },
  markers: { contact: 0.06, end: 0.5 },
  warp: [['contact', 'cast']],
  cues: [[0, 'trailOn', 'weapon'], ['contact', 'ghost'], ['contact', 'smear'], ['contact', 'whoosh', 'M'], [0.28, 'dust'], [0.36, 'trailOff']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

/** Q3: the launcher uppercut on the cast tick, then a front somersault (apex 0.8 m) landing back in guard. */
const Q3_LAND = 0.46;
const q3: ClipDef = {
  id: 'clem.q3',
  len: 0.78,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.05,
  keys: [
    [0, null, null],
    [0.04, null, { chest: [0.45, 0, 0], head: [0.2, 0, 0], shoulderR: [0.3, 0, 0.6], elbowR: [-0.6, 0, 0], thighL: [-0.5, 0, 0], kneeL: [1.0, 0, 0], kneeR: [0.9, 0, 0], thighR: [-0.2, 0, 0] }, 'out'],
    [0.08, null, { chest: [-0.4, -0.2, 0], head: [-0.4, 0, 0], shoulderR: [-2.9, 0, -0.2], elbowR: [0, 0, 0], shoulderL: [-0.4, 0, 0.9], thighR: [0.3, 0, 0], kneeR: [0.1, 0, 0], thighL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] }, 'expoIn'],
    [0.16, null, { chest: [-0.2, 0, 0], head: [-0.2, 0, 0], shoulderR: [-2.8, 0, -0.3], shoulderL: [-1.6, 0, 0.6], thighL: [-1.3, 0, 0], kneeL: [1.7, 0, 0], thighR: [-1.2, 0, 0], kneeR: [1.7, 0, 0] }, 'out'],
    [0.3, null, { chest: [0.6, 0, 0], head: [0.4, 0, 0], shoulderR: [-1.4, 0, 0.3], elbowR: [-0.8, 0, 0], shoulderL: [-1.4, 0, -0.3], elbowL: [-0.8, 0, 0], thighL: [-1.6, 0, 0], kneeL: [2.0, 0, 0], thighR: [-1.6, 0, 0], kneeR: [2.0, 0, 0] }, 'inOut'],
    [Q3_LAND - 0.04, null, { chest: [0.2, 0, 0], shoulderR: [-1.0, 0, -0.4], shoulderL: [-0.9, 0, 0.6], thighL: [-0.6, 0, 0], kneeL: [0.7, 0, 0], thighR: [-0.5, 0, 0], kneeR: [0.7, 0, 0] }, 'inOut'],
    [Q3_LAND, 'ready', { chest: [0.25, 0, 0], thighL: [-0.7, 0, 0], kneeL: [1.1, 0, 0], thighR: [-0.4, 0, 0], kneeR: [1.2, 0, 0] }, 'in'],
    [0.62, 'ready', { kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'back'],
    [0.78, 'restSide', null, 'inOut'],
  ],
  root: {
    pitch: turn(0.12, Q3_LAND, 1, 'inOut'),
    up: [[0, 0], [0.08, 0.15, 'out'], [0.27, 0.8, 'out'], [Q3_LAND, 0, 'in'], [0.78, 0]],
    sy: [[0, 1], [0.04, 0.85, 'out'], [0.08, 1.15, 'expoOut'], [0.2, 1], [Q3_LAND - 0.02, 1.02], [Q3_LAND + 0.02, 0.72, 'in'], [Q3_LAND + 0.2, 1, 'back']],
  },
  markers: { contact: 0.08, apex: 0.27, land: Q3_LAND, end: 0.78 },
  warp: [['contact', 'cast']],
  cues: [
    [0, 'trailOn', 'weapon'],
    ['contact', 'smear'],
    ['contact', 'ghost'],
    ['contact', 'whoosh', 'L'],
    ['contact', 'shake', 2],
    ['contact', 'punch', 0.04],
    ['contact', 'earsBack'],
    ['apex', 'ghost'],
    ['apex', 'sfx', 'flip'],
    ['land', 'land'],
    ['land', 'dust'],
    [0.6, 'trailOff'],
  ],
  calm: { pitch: 0 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W The Stand

/**
 * The Stand, in three parts so a basic swung during the block (the sim allows it) never leaves her standing neutral
 * behind a live wall: the cast snaps into the wide planted guard (blade flat across her face) on the cast tick; the
 * director then loops `wHold` (the held guard) whenever no other clip plays until the sim's block ends (23 t, Steady
 * Stand 38 t), so the guard comes back after a basic; on the block end `wEnd` twirls the sword out of it. All three
 * are Prio Basic with cancel 'any'.
 */
const BLOCK_LEGS = { thighL: [-0.2, 0.1, 0.25], thighR: [0.15, -0.1, -0.25], kneeL: [0.45, 0, 0], kneeR: [0.4, 0, 0] } as const;
const wStand: ClipDef = {
  id: 'clem.w',
  len: 0.34,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.03,
  blendOut: 0.1,
  keys: [
    [0, null, null],
    [0.03, null, { chest: [-0.2, -0.6, 0], shoulderR: [-2.4, 0, -0.6], elbowR: [-0.4, 0, 0] }, 'out'],
    [0.1, 'block', { chest: [0.18, 0.12, 0], thighL: [-0.25, 0.1, 0.3], thighR: [0.2, -0.1, -0.3], kneeL: [0.6, 0, 0], kneeR: [0.5, 0, 0] }, 'expoIn'],
    [0.2, 'block', { chest: [0.12, 0, 0], ...BLOCK_LEGS }, 'back'],
    [0.34, 'block', { chest: [0.14, 0, 0], ...BLOCK_LEGS }, 'inOut'],
  ],
  root: {
    sy: [[0, 1], [0.1, 0.84, 'expoIn'], [0.2, 0.92, 'back'], [0.34, 0.92]],
    sx: [[0, 1], [0.1, 1.12, 'expoIn'], [0.2, 1.06, 'back'], [0.34, 1.06]],
  },
  markers: { contact: 0.1, end: 0.34 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'clang'], ['contact', 'earsBack']],
  lockFeet: true,
  cancel: 'any',
};

/** The held guard (looped by the director until the block ends): a slow braced breath in the planted stance. */
const wHold: ClipDef = {
  id: 'clem.wHold',
  len: 0.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.08,
  blendOut: 0.08,
  keys: [
    [0, 'block', { chest: [0.14, 0, 0], ...BLOCK_LEGS }],
    [0.3, 'block', { chest: [0.18, 0, 0], head: [0.05, 0, 0], thighL: [-0.2, 0.1, 0.25], thighR: [0.15, -0.1, -0.25], kneeL: [0.5, 0, 0], kneeR: [0.45, 0, 0] }, 'inOut'],
    [0.6, 'block', { chest: [0.14, 0, 0], ...BLOCK_LEGS }, 'inOut'],
  ],
  root: { sy: [[0, 0.92], [0.3, 0.9, 'inOut'], [0.6, 0.92, 'inOut']], sx: [[0, 1.06], [0.6, 1.06]] },
  markers: { contact: 0, end: 0.6 },
  warp: [],
  lockFeet: true,
  cancel: 'any',
};

/** The block's end (played on stateEnd): the guard breaks into a sword twirl and back to her stance. */
const wEnd: ClipDef = {
  id: 'clem.wEnd',
  len: 0.42,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.04,
  keys: [
    [0, 'block', { chest: [0.12, 0, 0], ...BLOCK_LEGS }],
    [0.1, 'twirl', { shoulderR: [-1.6, 0, -0.4], pawR: [0, 2.0, 0] }, 'out'],
    [0.2, 'twirl', { shoulderR: [-1.6, 0, -0.4], pawR: [0, -2.2, 0] }, 'lin'],
    [0.42, null, null, 'inOut'],
  ],
  root: {
    sy: [[0, 0.92], [0.1, 1.04, 'out'], [0.3, 1, 'inOut']],
    sx: [[0, 1.06], [0.1, 1, 'out']],
  },
  markers: { contact: 0, end: 0.42 },
  warp: [['contact', 'stateEnd']],
  cues: [['contact', 'trailOn', 'weapon'], ['contact', 'whoosh', 'S'], [0.32, 'trailOff']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ E Tumble

/**
 * Tumble: a crouch on the peek, a low dive roll (one forward turn) driven by the dash's progress from the cast to the
 * dash's last tick, a crouched landing and a blade flourish. Three ghosts across the untargetable window.
 */
const E_TO = 0.06;
const E_LAND = E_TO + 0.3;
const eTumble: ClipDef = {
  id: 'clem.e',
  len: E_LAND + 0.38,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, null, null],
    [E_TO, null, { chest: [0.55, 0, 0], head: [0.3, 0, 0], thighL: [-0.7, 0, 0], kneeL: [1.2, 0, 0], thighR: [-0.4, 0, 0], kneeR: [1.2, 0, 0], shoulderR: [-1.2, 0, 0], shoulderL: [-1.0, 0, 0] }, 'out'],
    [E_TO + 0.08, null, { chest: [0.7, 0, 0], head: [0.6, 0, 0], thighL: [-1.7, 0, 0], kneeL: [2.1, 0, 0], thighR: [-1.7, 0, 0], kneeR: [2.1, 0, 0], shoulderR: [-1.4, 0, 0.3], elbowR: [-1.0, 0, 0], shoulderL: [-1.4, 0, -0.3], elbowL: [-1.0, 0, 0] }, 'out'],
    [E_LAND - 0.06, null, { chest: [0.7, 0, 0], head: [0.6, 0, 0], thighL: [-1.7, 0, 0], kneeL: [2.1, 0, 0], thighR: [-1.7, 0, 0], kneeR: [2.1, 0, 0], shoulderR: [-1.4, 0, 0.3], elbowR: [-1.0, 0, 0], shoulderL: [-1.4, 0, -0.3], elbowL: [-1.0, 0, 0] }, 'lin'],
    [E_LAND, null, { chest: [0.45, 0, 0], head: [-0.1, 0, 0], thighL: [-1.2, 0, 0], kneeL: [1.6, 0, 0], thighR: [0.4, 0, 0], kneeR: [1.8, 0, 0], shoulderR: [-0.9, 0, -0.7], shoulderL: [-0.6, 0, 0.9] }, 'out'],
    [E_LAND + 0.16, null, { chest: [0.2, -0.3, 0], thighL: [-0.6, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.7, 0, 0], shoulderR: [-1.7, 0, -1.2], elbowR: [0, 0, 0], pawR: [0, 1.6, 0], shoulderL: [-0.4, 0, 0.8] }, 'back'],
    [E_LAND + 0.26, null, { chest: [0.1, -0.2, 0], shoulderR: [-1.3, 0, -0.8], pawR: [0, -1.2, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0] }, 'lin'],
    [E_LAND + 0.38, null, null, 'inOut'],
  ],
  root: {
    pitch: turn(E_TO, E_LAND, 1, 'inOut'),
    up: [[0, 0], [E_TO, 0], [E_TO + 0.1, 0.38, 'out'], [E_LAND - 0.08, 0.12, 'in'], [E_LAND, 0, 'out'], [E_LAND + 0.38, 0]],
    sy: [[0, 1], [E_TO, 0.8, 'out'], [E_TO + 0.05, 1.05, 'out'], [E_TO + 0.12, 0.86], [E_LAND - 0.04, 0.86], [E_LAND, 0.78, 'in'], [E_LAND + 0.16, 1.03, 'back'], [E_LAND + 0.3, 1, 'inOut']],
  },
  markers: { takeoff: E_TO, contact: E_TO, mid: E_TO + 0.15, land: E_LAND, end: E_LAND + 0.38 },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [
    ['takeoff', 'dust'],
    ['takeoff', 'earsBack'],
    ['takeoff', 'whoosh', 'L'],
    ['takeoff', 'ghost'],
    ['mid', 'ghost'],
    ['land', 'ghost'],
    ['land', 'land'],
    ['land', 'dust'],
    ['land', 'fx', 'fxE1'],
    ['land', 'trailOn', 'weapon'],
    [E_LAND + 0.3, 'trailOff'],
  ],
  calm: { pitch: 0 },
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ R Golden Hour

/**
 * Golden Hour: a coil on the peek, a spinning sun-leap (one turn, apex 0.85 m) with the blade raised to the sky,
 * driven down into a kneeling plant-slam at 0.24 s, then up. The cast does no damage (the sim only sets the buff) and
 * Golden Hour's +40% attack speed can land a basic ≈ 0.27 s after the cast (her windup keeps running through it), so
 * the clip is front-loaded: Prio Ult only until 0.26 s (len − blendOut), the kneel-and-rise blends out under the
 * first Golden Hour basic instead of hiding it.
 */
const R_SLAM = 0.24;
const rGolden: ClipDef = {
  id: 'clem.r',
  len: 0.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.05,
  blendOut: 0.24,
  keys: [
    [0, null, null],
    [0.03, null, { chest: [0.4, 0, 0], head: [0.2, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], shoulderR: [0.2, 0, -0.3] }, 'out'],
    [0.06, null, { chest: [-0.2, 0, 0], head: [-0.3, 0, 0], thighL: [0.1, 0, 0], thighR: [0.1, 0, 0], shoulderL: [-1.8, 0, -0.4] }, 'expoIn'],
    [0.13, 'cheer', { chest: [-0.35, 0, 0], head: [-0.4, 0, 0], thighL: [-1.0, 0, 0], kneeL: [1.5, 0, 0], thighR: [0.3, 0, 0], kneeR: [0.9, 0, 0] }, 'out'],
    [0.18, 'cheer', { chest: [-0.4, 0, 0], head: [-0.45, 0, 0], thighL: [-0.9, 0, 0], kneeL: [1.4, 0, 0], thighR: [0.2, 0, 0], kneeR: [0.8, 0, 0] }, 'lin'],
    [R_SLAM, 'kneel', { chest: [0.25, 0, 0] }, 'expoIn'],
    [R_SLAM + 0.12, 'kneel', { chest: [0.1, 0, 0], head: [-0.2, 0, 0] }, 'out'],
    [0.5, 'restSide', { head: [-0.1, 0, 0] }, 'inOut'],
  ],
  root: {
    yaw: turn(0.05, 0.2, 1, 'inOut'),
    up: [[0, 0], [0.06, 0.05], [0.13, 0.85, 'out'], [0.18, 0.8], [R_SLAM, 0, 'expoIn'], [0.5, 0]],
    sy: [[0, 1], [0.03, 0.8, 'out'], [0.06, 1.15, 'expoOut'], [0.13, 1.05], [R_SLAM - 0.02, 1.1], [R_SLAM, 0.7, 'expoIn'], [R_SLAM + 0.14, 1.04, 'back'], [0.44, 1, 'inOut']],
    sx: [[0, 1], [R_SLAM - 0.02, 1], [R_SLAM, 1.18, 'expoIn'], [R_SLAM + 0.14, 1, 'back']],
  },
  markers: { contact: 0.05, apex: 0.13, slam: R_SLAM, end: 0.5 },
  warp: [['contact', 'cast']],
  cues: [
    [0, 'trailOn', 'weapon'],
    ['contact', 'whoosh', 'L'],
    ['contact', 'ghost'],
    ['contact', 'dust'],
    ['contact', 'mouthOpen', 400],
    ['apex', 'fx', 'fxRApex'],
    ['apex', 'ghost'],
    ['slam', 'land'],
    ['slam', 'dust'],
    ['slam', 'shake', 2],
    ['slam', 'punch', 0.04],
    ['slam', 'fx', 'fxRSlam'],
    [R_SLAM + 0.2, 'trailOff'],
  ],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

/** Seconds a cast's Valor reading blocks the per-hit latch (the peek horizon plus slack: pre-cast hits fire late). */
const VALOR_BLOCK_S = 0.2;

/**
 * Valor (render side): the sim spends a full bar on the Q or R cast itself, so a snapshot taken after the cast reads
 * 0. Every hit and basic swing (fillCtx reads the current snapshot) latches `valorFull`; a cast is empowered when its
 * own reading is full or the latch from before it is. The latch is then cleared and blocked for the peek window so a
 * late pre-cast reading cannot re-arm it.
 */
export function noteValor(id: number, resource: number): void {
  const L = CLEM_LIVE;
  if (L.now < L.valorBlock[id]) return;
  L.valorFull[id] = resource >= 100 ? 1 : 0;
}

function spendValor(id: number, resource: number): void {
  const L = CLEM_LIVE;
  L.empowered[id] = resource >= 100 || L.valorFull[id] === 1 ? 1 : 0;
  L.valorFull[id] = 0;
  L.valorBlock[id] = L.now + VALOR_BLOCK_S;
}

function rPick(ctx: MoveCtx): ClipDef {
  const id = ctx.id & 15;
  const L = CLEM_LIVE;
  L.rUntil[id] = L.now + R_DEFAULT_S;
  L.rCount[id] = ctx.basicCount;
  spendValor(id, ctx.resource);
  return rGolden;
}

function qPick(ctx: MoveCtx): ClipDef {
  // Valor: a full bar is spent on this cast (+50%), the FX reads `empowered`
  spendValor(ctx.id & 15, ctx.resource);
  return ctx.recastIndex === 1 ? q2 : ctx.recastIndex >= 2 ? q3 : q1;
}

// ------------------------------------------------------------------------------------------------ idle, emotes, death

/** Idle flavour: the blade rested on her shoulder, weight on one hip, a slow breath. Loops. */
const idle: ClipDef = {
  id: 'clem.idle',
  len: 2.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.3,
  blendOut: 0.3,
  keys: [
    [0, null, { shoulderR: [-1.9, 0, -0.5], elbowR: [-1.7, 0, 0], pawR: [0.4, 0, 0], chest: [-0.05, 0.1, 0.04], head: [-0.05, -0.1, 0.06] }],
    [1.2, null, { shoulderR: [-1.95, 0, -0.5], elbowR: [-1.75, 0, 0], pawR: [0.4, 0, 0], chest: [-0.09, 0.12, 0.05], head: [-0.1, -0.05, 0.08] }, 'inOut'],
    [2.4, null, { shoulderR: [-1.9, 0, -0.5], elbowR: [-1.7, 0, 0], pawR: [0.4, 0, 0], chest: [-0.05, 0.1, 0.04], head: [-0.05, -0.1, 0.06] }, 'inOut'],
  ],
  markers: { contact: 0, end: 2.4 },
  warp: [],
  cancel: 'any',
};

/** Fidget: twirl the sword around the grip twice and catch it in her rest stand. */
const twirlFidget: ClipDef = {
  id: 'clem.fidgetTwirl',
  len: 1.1,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.12,
  keys: [
    [0, null, null],
    [0.15, 'twirl', null, 'out'],
    [0.3, 'twirl', { pawR: [0, 2.1, 0] }, 'lin'],
    [0.45, 'twirl', { pawR: [0, 4.2, 0] }, 'lin'],
    [0.6, 'twirl', { pawR: [0, 6.28, 0] }, 'lin'],
    [0.75, 'twirl', { pawR: [0, 8.4, 0], shoulderR: [-0.3, 0, 0] }, 'lin'],
    [0.86, 'twirl', { pawR: [0, 10.5, 0], shoulderR: [-0.5, 0, 0] }, 'lin'],
    [0.94, 'twirl', { pawR: [0, 12.566, 0], shoulderR: [-0.3, 0, 0] }, 'out'],
    [1.1, null, null, 'back'],
  ],
  root: { sy: [[0, 1], [0.92, 1], [0.97, 0.94, 'out'], [1.1, 1, 'back']] },
  markers: { contact: 0.94, end: 1.1 },
  warp: [],
  cues: [[0.15, 'trailOn', 'weapon'], [0.94, 'trailOff'], [0.94, 'sfx', 'tingParry']],
  cancel: 'any',
};

/** Victory: a spinning blade sweep, the sword planted as she kneels, then up with the blade raised. */
const victory: ClipDef = {
  id: 'clem.victory',
  len: 2.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.1,
  keys: [
    [0, null, null],
    [0.15, null, { chest: [0.2, -0.5, 0], shoulderR: [-1.4, 0, -1.4], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }, 'out'],
    [0.45, null, { chest: [0.1, 0.3, 0], shoulderR: [-1.5, 0, -1.5], shoulderL: [-1.3, 0, 1.4], thighL: [-0.8, 0, 0], kneeL: [1.2, 0, 0] }, 'inOut'],
    [0.7, 'kneel', { chest: [0.25, 0, 0] }, 'expoIn'],
    [1.3, 'kneel', { chest: [0.15, 0, 0], head: [0.5, 0, 0] }, 'inOut'],
    [1.65, 'oath', { chest: [-0.15, 0, 0], head: [-0.2, 0, 0] }, 'backBig'],
    [2.0, 'cheer', { chest: [-0.2, 0, 0], head: [-0.3, 0, 0] }, 'back'],
    [2.6, 'cheer', null, 'inOut'],
  ],
  root: {
    yaw: turn(0.2, 0.5, 1, 'inOut'),
    up: [[0, 0], [0.15, 0], [0.35, 0.45, 'out'], [0.7, 0, 'in'], [1.65, 0], [1.85, 0.35, 'out'], [2.05, 0, 'in'], [2.6, 0]],
    sy: [[0, 1], [0.15, 0.85, 'out'], [0.25, 1.08], [0.68, 1.02], [0.72, 0.78, 'in'], [0.9, 1, 'back'], [1.6, 0.9], [1.7, 1.1, 'out'], [2.05, 0.85, 'in'], [2.25, 1, 'back']],
  },
  markers: { contact: 0, plant: 0.7, rise: 1.65, end: 2.6 },
  warp: [],
  cues: [[0.15, 'trailOn', 'weapon'], [0.15, 'whoosh', 'M'], ['plant', 'land'], ['plant', 'dustRing'], [0.75, 'trailOff'], ['rise', 'sfx', 'gong'], [2.05, 'land']],
  calm: { yaw: 0 },
  cancel: 'any',
};

/** Emote: a sword twirl and a knight's salute (blade upright before her face). */
const emote: ClipDef = {
  id: 'clem.emote',
  len: 1.7,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.1,
  keys: [
    [0, null, null],
    [0.15, 'twirl', null, 'out'],
    [0.3, 'twirl', { pawR: [0, 2.1, 0] }, 'lin'],
    [0.45, 'twirl', { pawR: [0, 4.2, 0] }, 'lin'],
    [0.6, 'twirl', { pawR: [0, 6.28, 0] }, 'lin'],
    [0.85, 'oath', { chest: [-0.1, 0, 0], head: [-0.15, 0, 0] }, 'backBig'],
    [1.35, 'oath', { chest: [-0.12, 0, 0], head: [-0.12, 0, 0] }, 'inOut'],
    [1.7, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.8, 1], [0.86, 1.08, 'out'], [1.05, 1, 'inOut']] },
  markers: { contact: 0.85, end: 1.7 },
  warp: [],
  cues: [[0.12, 'trailOn', 'weapon'], [0.8, 'trailOff'], ['contact', 'sfx', 'tingParry']],
  cancel: 'any',
};

/** Death: the hit snaps her back, two staggering steps, the sword arm flung out, knees, then she faints back. */
const death: ClipDef = {
  id: 'clem.death',
  len: 1.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.03,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.1, null, { chest: [-0.55, 0.35, 0.15], head: [-0.6, 0, 0.2], shoulderR: [-1.6, 0, -1.3], elbowR: [0, 0, 0], shoulderL: [-0.8, 0, 1.2], thighR: [0.45, 0, 0], kneeR: [0.3, 0, 0] }, 'expoOut'],
    [0.32, null, { chest: [-0.4, -0.2, -0.1], head: [-0.4, 0, -0.2], shoulderR: [-1.0, 0, -1.4], shoulderL: [-0.4, 0, 1.0], thighL: [0.5, 0, 0], kneeL: [0.3, 0, 0], thighR: [-0.2, 0, 0], kneeR: [0.4, 0, 0] }, 'inOut'],
    [0.55, null, { chest: [0.3, 0.1, 0.1], head: [0.4, 0, 0], shoulderR: [-0.2, 0, -0.6], shoulderL: [0, 0, 0.4], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0] }, 'in'],
    [0.75, null, { chest: [0.2, 0, 0], head: [0.3, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [1.9, 0, 0], kneeR: [1.9, 0, 0], shoulderR: [-0.1, 0, -0.4] }, 'inOut'],
    [1.05, 'faint', null, 'in'],
    [1.2, 'faint', null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.1, -0.2, 'expoOut'], [0.32, -0.38, 'inOut'], [0.55, -0.45, 'out'], [1.05, -0.55, 'in'], [1.2, -0.55]],
    up: [[0, 0], [0.1, 0.08, 'out'], [0.2, 0, 'in'], [1.2, 0]],
    sy: [[0, 1], [0.1, 1.08, 'out'], [0.55, 0.85, 'in'], [0.62, 0.95, 'out'], [1.02, 1], [1.06, 0.82, 'in'], [1.2, 1, 'back']],
  },
  markers: { contact: 0, knees: 0.55, fall: 1.05, end: 1.2 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['contact', 'earsBack'], ['contact', 'mouthOpen', 300], ['knees', 'land'], ['fall', 'sfx', 'bodyThud'], ['fall', 'dust']],
  cancel: 'none',
};

/** Respawn: she drops in from the light column with a front flip, lands in a crouch and twirls into her rest stand. */
const respawn: ClipDef = {
  id: 'clem.respawn',
  len: 1.05,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, { chest: [0.5, 0, 0], head: [0.4, 0, 0], thighL: [-1.6, 0, 0], kneeL: [2.0, 0, 0], thighR: [-1.6, 0, 0], kneeR: [2.0, 0, 0], shoulderR: [-1.4, 0, 0.3], elbowR: [-1.0, 0, 0], shoulderL: [-1.4, 0, -0.3], elbowL: [-1.0, 0, 0] }],
    [0.24, null, { chest: [0.3, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.6, 0, 0], thighR: [-0.5, 0, 0], kneeR: [0.6, 0, 0], shoulderR: [-1.8, 0, -0.8], shoulderL: [-1.6, 0, 0.8] }, 'out'],
    [0.32, 'ready', { chest: [0.4, 0, 0], thighL: [-1.0, 0, 0], kneeL: [1.5, 0, 0], thighR: [0.3, 0, 0], kneeR: [1.7, 0, 0] }, 'in'],
    [0.55, 'ready', { kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'back'],
    [0.7, 'twirl', { pawR: [0, 3.1, 0] }, 'lin'],
    [0.85, 'twirl', { pawR: [0, 6.28, 0] }, 'lin'],
    [1.05, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.32, 0, 'in'], [1.05, 0]],
    pitch: turn(0, 0.3, 1, 'out'),
    sy: [[0, 1.1], [0.3, 1.05], [0.34, 0.7, 'in'], [0.52, 1.04, 'back'], [0.7, 1, 'inOut']],
  },
  markers: { contact: 0, land: 0.32, end: 1.05 },
  warp: [],
  cues: [['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'fxRespawn'], [0.55, 'trailOn', 'weapon'], [0.85, 'trailOff'], [0.85, 'sfx', 'tingParry']],
  calm: { pitch: 0 },
  cancel: 'any',
};

/** Level-up flourish: a hop with a half spin, blade thrust to the sky. */
const levelUp: ClipDef = {
  id: 'clem.levelUp',
  len: 0.75,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.05,
  keys: [
    [0, null, null],
    [0.08, null, { kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], chest: [0.3, 0, 0] }, 'out'],
    [0.25, 'cheer', { chest: [-0.3, 0, 0], head: [-0.4, 0, 0] }, 'out'],
    [0.5, 'cheer', null, 'inOut'],
    [0.75, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.08, 0], [0.24, 0.45, 'out'], [0.4, 0, 'in'], [0.75, 0]],
    sy: [[0, 1], [0.08, 0.84, 'out'], [0.15, 1.12], [0.38, 1.02], [0.42, 0.82, 'in'], [0.6, 1, 'back']],
  },
  markers: { contact: 0.25, end: 0.75 },
  warp: [],
  cues: [[0.08, 'whoosh', 'S'], [0.4, 'land']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ gait

/** A proud knight's jog: chest up and a touch forward, steady bounce, the blade trailing low. */
const gait: GaitProfile = {
  ...DEFAULT_GAIT,
  stride: 1.05,
  bounce: 0.9,
  lean: 1.25,
  hipSway: 0.85,
  headBob: 0.7,
  arms: 'trail',
};

export const MOVES: MoveSet = {
  hero: 'clem',
  stub: false,
  gait,
  springs: HERO_SPRINGS.clem,
  basic: [basicA, basicB, basicC],
  basicPick,
  slots: {
    q: { cast: q1, recasts: [q2, q3], pick: qPick },
    w: { cast: wStand, hold: wHold, end: wEnd },
    e: { cast: eTumble },
    r: { cast: rGolden, pick: rPick },
  },
  idle,
  fidgets: [[twirlFidget, 1]],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Every Clem clip by name (gallery substitution, tests). */
export const CLEM_CLIPS: Readonly<Record<string, ClipDef>> = Object.freeze({
  basicA,
  basicB,
  basicC,
  sunCleave,
  q1,
  q2,
  q3,
  w: wStand,
  wHold,
  wEnd,
  e: eTumble,
  r: rGolden,
  idle,
  fidgetTwirl: twirlFidget,
  victory,
  emote,
  death,
  respawn,
  levelUp,
});
