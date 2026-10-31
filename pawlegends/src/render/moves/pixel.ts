/**
 * Pixel move set (sim v11; build spec docs/plans/moba/CATS-V11.md §2.2 "Moves and VFX"): a tiny gadget kitten planted
 * in a cardboard box. She never strides: a short shuffle with a peek bob, the cannon held level, and every shot kicks
 * the whole box back a few centimetres. MoveCtx.form (BOXBOT) swaps in the big-box basics; MoveCtx.channel is the
 * Laser Pointer (its loop holds the pointer arm out while she steers).
 *
 * Every sim-bound number comes from anim/timing.ts (no literals): basics release on the 8 t bolt (`release`), Q and R
 * are instant (`contact` on the cast tick), the Laser Pointer and Duck and Cover end on `stateEnd` (cast + the sim
 * duration: 45 t / 30 t), and the BOXBOT loop lasts the 210 t window.
 *
 * Joint conventions (anim/common.ts): shoulder x < 0 raises the arm forward, chest x > 0 leans forward, head x < 0
 * lifts the chin; root fwd / side / up in m, sx / sy factors. Render only.
 */
import { BASIC_CONTACT, COMMON, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

type Pose = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.pixel.slots;
const C = BASIC_CONTACT;
/** W: the beam's life (stateEnd − cast). */
export const W_DUR_S = T.w.duration * TICK_S;
/** E: the duck's life (stateEnd − cast). */
export const E_DUR_S = T.e.duration * TICK_S;
/** R: BOXBOT's window. */
export const R_DUR_S = T.r.duration * TICK_S;
/** BOXBOT's box scale and lift (the box grows legs). */
export const BOXBOT_SCALE = 1.25;
export const BOXBOT_LIFT = 0.2;

// ------------------------------------------------------------------------------------------------ shared poses

/** Cannon level at the chest, the left paw steadying it. */
const LEVEL: Pose = { shoulderR: [-1.45, 0, 0.2], elbowR: [-0.3, 0, 0], shoulderL: [-1.2, 0, -0.35], elbowL: [-0.9, 0, 0], head: [0.05, 0, 0] };
/** The recoil: cannon up, chest back, chin up. */
const KICK: Pose = { shoulderR: [-1.9, 0, 0.2], elbowR: [-0.5, 0, 0], shoulderL: [-1.0, 0, -0.35], elbowL: [-1.0, 0, 0], chest: [-0.25, 0, 0], head: [-0.2, 0, 0] };
/** The laser pointer: the left paw straight out at the dot, the cannon tucked. */
const POINT: Pose = { shoulderL: [-1.55, 0, 0], elbowL: [0, 0, 0], shoulderR: [-0.4, 0, 0.3], elbowR: [-1.2, 0, 0], chest: [0.1, 0, 0], head: [0.1, 0, 0] };
/** Ducked: curled into the box, paws over the head. */
const DUCK: Pose = { chest: [0.15, 0, 0], head: [0.45, 0, 0], shoulderL: [-2.6, 0, -0.3], shoulderR: [-2.6, 0, 0.3], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0], thighL: [-1.0, 0, 0], thighR: [-1.0, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0] };
/** BOXBOT: arms out like a toy robot, chin up. */
const ROBOT: Pose = { shoulderL: [-1.4, 0, 0.6], shoulderR: [-1.4, 0, -0.6], elbowL: [-1.5, 0, 0], elbowR: [-1.5, 0, 0], head: [-0.15, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics (ranged: release at 8 t)

function shot(id: string, k: number, boxbot: boolean): ClipDef {
  const s = boxbot ? BOXBOT_SCALE : 1;
  const up = boxbot ? BOXBOT_LIFT : 0;
  return {
    id,
    len: 0.7,
    mask: 'upper',
    mode: 'override',
    prio: Prio.Basic,
    keys: [
      [0, 'aim', null],
      [C * 0.6, 'aim', LEVEL, 'out'],
      [C, 'aim', KICK, 'expoOut'],
      [C + 0.16, 'aim', LEVEL, 'out'],
      [0.7, null, null, 'inOut'],
    ],
    root: {
      fwd: [[0, 0], [C, 0], [C + 0.05, -0.06 * k, 'expoOut'], [0.7, 0, 'inOut']],
      sx: [[0, s], [C, s], [C + 0.05, s * 1.06, 'expoOut'], [0.7, s, 'inOut']],
      sy: [[0, s], [C * 0.6, s * 0.95], [C + 0.05, s * 0.9, 'expoOut'], [C + 0.2, s, 'back'], [0.7, s]],
      up: [[0, up], [0.7, up]],
    },
    markers: { coil: 0.05, contact: C, end: 0.7 },
    warp: [['contact', 'release']],
    cues: [['contact', 'fx', 'px:pop'], ['contact', 'shake', 0]],
    cancel: 'afterContact',
  };
}

const basicA = shot('pixel.basicA', 1, false);
const basicB = shot('pixel.basicB', 1.4, false);
const basicBoxbot = shot('pixel.basicBoxbot', 1.6, true);

// ------------------------------------------------------------------------------------------------ Q Cap Cannon (instant skillshot)

/** Impact-first: the big bang on the cast tick, the box skids back, she wobbles and re-levels. */
const Q_C = 0.03;
const q: ClipDef = {
  id: 'pixel.q',
  len: 0.75,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, 'aim', LEVEL],
    [Q_C, 'aim', { ...KICK, shoulderR: [-2.2, 0, 0.2], chest: [-0.4, 0, 0], head: [-0.3, 0, 0] }, 'expoOut'],
    [Q_C + 0.22, 'aim', { ...LEVEL, chest: [0.1, 0, 0] }, 'back'],
    [0.75, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [Q_C, 0], [Q_C + 0.1, -0.2, 'expoOut'], [0.75, 0, 'inOut']],
    pitch: [[0, 0], [Q_C, 0], [Q_C + 0.08, -0.03, 'out'], [Q_C + 0.26, 0.01, 'inOut'], [0.75, 0, 'inOut']],
    sy: [[0, 1], [Q_C, 0.86, 'expoOut'], [Q_C + 0.2, 1.06, 'out'], [0.45, 1, 'inOut']],
  },
  markers: { coil: 0, contact: Q_C, end: 0.75 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'freeze', 50], ['contact', 'shake', 1], ['contact', 'whoosh', 'M'], ['contact', 'sfx', 'pop']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Laser Pointer (45 t channel)

/** The click on: the pointer paw snaps out. */
const w: ClipDef = {
  id: 'pixel.w',
  len: 0.3,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  keys: [[0, null, null], [0.05, 'aim', POINT, 'expoOut'], [0.3, 'aim', POINT, 'lin']],
  root: { sy: [[0, 1], [0.05, 1.05, 'out'], [0.3, 1, 'inOut']] },
  markers: { contact: 0.05, end: 0.3 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'zap']],
  cancel: 'afterContact',
};
/** Held: the pointer paw out with a tiny jitter (she is steering the dot); upper body, so she can shuffle. */
const wHold: ClipDef = {
  id: 'pixel.w.hold',
  len: 0.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, 'aim', POINT],
    [0.2, 'aim', { ...POINT, shoulderL: [-1.6, 0.05, 0.04], head: [0.05, 0.08, 0] }, 'inOut'],
    [0.4, 'aim', POINT, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};
/** The beam ends (stateEnd): the paw drops. */
const wEnd: ClipDef = {
  id: 'pixel.w.end',
  len: 0.3,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [[0, 'aim', POINT], [0.3, null, null, 'inOut']],
  markers: { contact: 0, end: 0.3 },
  warp: [['contact', 'stateEnd']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ E Duck and Cover (30 t)

/** She drops into the box on the cast, stays curled for exactly the sim duration, and pops out on stateEnd. */
const E_IN = 0.04;
const E_OUT = E_IN + E_DUR_S;
const E_LEN = E_OUT + 0.25;
const e: ClipDef = {
  id: 'pixel.e',
  len: E_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, null, null],
    [E_IN, null, DUCK, 'expoOut'],
    [E_OUT - 0.02, null, DUCK, 'lin'],
    [E_OUT + 0.08, null, { head: [-0.3, 0, 0], shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6] }, 'back'],
    [E_LEN, null, null, 'inOut'],
  ],
  root: {
    sy: [[0, 1], [E_IN, 0.72, 'expoOut'], [E_OUT, 0.72], [E_OUT + 0.08, 1.12, 'out'], [E_LEN, 1, 'inOut']],
    up: [[0, 0], [E_OUT, 0], [E_OUT + 0.08, 0.12, 'out'], [E_LEN, 0, 'in']],
  },
  markers: { contact: E_IN, out: E_OUT, end: E_LEN },
  warp: [['contact', 'cast'], ['out', 'stateEnd']],
  cues: [['contact', 'fx', 'px:duck'], ['contact', 'land'], ['out', 'whoosh', 'S']],
  lockFeet: true,
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ R BOXBOT MK II (instant, 210 t)

/** The transformation: squash, then the box pops up onto its new legs, robot arms out. */
const R_C = 0.04;
const R_LEN = 0.7;
const r: ClipDef = {
  id: 'pixel.r',
  len: R_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  keys: [
    [0, null, DUCK],
    [R_C, null, DUCK, 'lin'],
    [R_C + 0.18, null, ROBOT, 'backBig'],
    [R_LEN, null, ROBOT, 'lin'],
  ],
  root: {
    sx: [[0, 0.9], [R_C, 0.9], [R_C + 0.18, BOXBOT_SCALE * 1.06, 'out'], [R_C + 0.34, BOXBOT_SCALE, 'back'], [R_LEN, BOXBOT_SCALE]],
    sy: [[0, 0.8], [R_C, 0.8], [R_C + 0.18, BOXBOT_SCALE * 1.12, 'out'], [R_C + 0.34, BOXBOT_SCALE, 'back'], [R_LEN, BOXBOT_SCALE]],
    up: [[0, 0], [R_C, 0], [R_C + 0.18, BOXBOT_LIFT + 0.25, 'out'], [R_C + 0.34, BOXBOT_LIFT, 'in'], [R_LEN, BOXBOT_LIFT]],
  },
  markers: { contact: R_C, end: R_LEN },
  warp: [['contact', 'cast']],
  cues: [['contact', 'fx', 'px:boxbot'], ['contact', 'shake', 2], ['contact', 'punch', 0.04], [R_C + 0.34, 'land']],
  cancel: 'afterContact',
};
/** The BOXBOT stomp loop while the window lasts: bigger box on its legs, a mechanical bob. */
const rHold: ClipDef = {
  id: 'pixel.r.hold',
  len: 0.5,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [[0, null, ROBOT], [0.25, null, { ...ROBOT, chest: [0, 0.12, 0] }, 'inOut'], [0.5, null, ROBOT, 'inOut']],
  root: {
    sx: [[0, BOXBOT_SCALE], [0.5, BOXBOT_SCALE]],
    sy: [[0, BOXBOT_SCALE], [0.25, BOXBOT_SCALE * 1.03, 'inOut'], [0.5, BOXBOT_SCALE, 'inOut']],
    up: [[0, BOXBOT_LIFT], [0.25, BOXBOT_LIFT + 0.03, 'inOut'], [0.5, BOXBOT_LIFT, 'inOut']],
  },
  markers: {},
  warp: [],
  cancel: 'any',
};
/** The legs fold away on stateEnd: the box settles back to the ground. */
const rEnd: ClipDef = {
  id: 'pixel.r.end',
  len: 0.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [[0, null, ROBOT], [0.4, null, null, 'inOut']],
  root: {
    sx: [[0, BOXBOT_SCALE], [0.2, 1, 'in'], [0.4, 1]],
    sy: [[0, BOXBOT_SCALE], [0.2, 0.86, 'in'], [0.4, 1, 'back']],
    up: [[0, BOXBOT_LIFT], [0.2, 0, 'in'], [0.4, 0]],
  },
  markers: { contact: 0, end: 0.4 },
  warp: [['contact', 'stateEnd']],
  cues: [[0.2, 'land'], [0.2, 'fx', 'px:fold']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ idle, flavour

/** Idle: the peek bob (head up over the box rim and back down). */
const idle: ClipDef = {
  id: 'pixel.idle',
  len: 1.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, LEVEL],
    [0.5, null, { ...LEVEL, head: [-0.15, 0.2, 0] }, 'inOut'],
    [0.9, null, { ...LEVEL, head: [-0.1, -0.2, 0] }, 'inOut'],
    [1.4, null, LEVEL, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.5, 1.04, 'inOut'], [0.9, 0.98, 'inOut'], [1.4, 1, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};
/** Fidget: ducks into the box and peeks out again. */
const fidgetPeek: ClipDef = {
  id: 'pixel.fidgetPeek',
  len: 1.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [[0, null, null], [0.2, null, DUCK, 'out'], [0.7, null, DUCK, 'lin'], [0.85, null, { head: [-0.3, 0.3, 0] }, 'back'], [1.2, null, null, 'inOut']],
  root: { sy: [[0, 1], [0.2, 0.75, 'out'], [0.7, 0.75], [0.85, 1.08, 'out'], [1.2, 1, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};
/** Fidget: taps the antenna. */
const fidgetAntenna: ClipDef = {
  id: 'pixel.fidgetAntenna',
  len: 1.0,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [0.25, null, { shoulderL: [-2.8, 0, 0.3], elbowL: [-1.4, 0, 0], head: [-0.2, 0, 0.1] }, 'out'],
    [0.45, null, { shoulderL: [-2.9, 0, 0.2], elbowL: [-1.5, 0, 0], head: [-0.2, 0, -0.1] }, 'inOut'],
    [1.0, null, null, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};
/** Victory: the box hops three times, robot arms up. */
const victory: ClipDef = {
  id: 'pixel.victory',
  len: 1.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [[0, null, null], [0.15, null, ROBOT, 'out'], [0.5, null, { ...ROBOT, shoulderL: [-2.8, 0, 0.3], shoulderR: [-2.8, 0, -0.3] }, 'out'], [1.6, null, null, 'inOut']],
  root: {
    up: [[0, 0], [0.12, 0], [0.25, 0.35, 'out'], [0.38, 0, 'in'], [0.5, 0.3, 'out'], [0.63, 0, 'in'], [0.76, 0.4, 'out'], [0.92, 0, 'in'], [1.6, 0]],
    sy: [[0, 1], [0.1, 0.85], [0.25, 1.1, 'out'], [0.38, 0.85, 'in'], [0.5, 1.08], [0.63, 0.85, 'in'], [0.76, 1.1], [0.92, 0.82, 'in'], [1.1, 1, 'back']],
  },
  markers: { end: 1.6 },
  warp: [],
  cues: [[0.38, 'land'], [0.63, 'land'], [0.92, 'land'], [0.92, 'dust']],
  cancel: 'any',
};
/** Emote: a proud salute with the cannon. */
const emote: ClipDef = {
  id: 'pixel.emote',
  len: 1.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.2, null, { shoulderR: [-2.9, 0, 0.1], elbowR: [-0.2, 0, 0], shoulderL: [-1.5, 0, -0.9], elbowL: [-1.9, 0, 0], head: [-0.25, 0, 0] }, 'backBig'],
    [0.9, null, { shoulderR: [-2.9, 0, 0.1], elbowR: [-0.2, 0, 0], shoulderL: [-1.5, 0, -0.9], elbowL: [-1.9, 0, 0], head: [-0.25, 0, 0] }, 'lin'],
    [1.2, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.2, 1.1, 'out'], [0.9, 1.05], [1.2, 1, 'inOut']] },
  markers: { end: 1.2 },
  warp: [],
  cues: [[0.2, 'fx', 'px:pop']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ the set

/** The box shuffle: tiny steps, almost no lean, a big head bob (she peeks over the rim as she goes). */
const GAIT: GaitProfile = { ...DEFAULT_GAIT, stride: 0.6, bounce: 0.7, lean: 0.3, hipSway: 0.5, headBob: 1.5, arms: 'hold' };

/** BOXBOT: the big-box basic (no allocation). */
const basicPick = (ctx: MoveCtx): ClipDef | null => (ctx.form === true ? basicBoxbot : null);

export const MOVES: MoveSet = {
  hero: 'pixel',
  stub: false,
  gait: GAIT,
  springs: HERO_SPRINGS.pixel,
  basic: [basicA, basicB],
  basicPick,
  slots: {
    q: { cast: q },
    w: { cast: w, hold: wHold, end: wEnd },
    e: { cast: e },
    r: { cast: r, hold: rHold, end: rEnd },
  },
  idle,
  fidgets: [
    [fidgetPeek, 3],
    [fidgetAntenna, 2],
  ],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the capture: every clip of the set by name. */
export const PIXEL_CLIPS = Object.freeze({ basicA, basicB, basicBoxbot, q, w, wHold, wEnd, e, r, rHold, rEnd, idle, fidgetPeek, fidgetAntenna, victory, emote, death: COMMON.death, recall: COMMON.recall });
