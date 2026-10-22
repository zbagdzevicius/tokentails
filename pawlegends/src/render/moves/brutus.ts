/**
 * Sir Brutus move set (ANIM-SPEC §14 "Sir Brutus"): a stocky tank with a tower shield on the left arm and a short sword
 * in the right. Every number that binds to the sim comes from anim/timing.ts (basic windup 8 t, Pug Charge 5 m in 8 t,
 * Guard Post 60 t); the clips put their weight into silhouette changes that read at ≈45 px: hops, slams with a deep
 * squash, a spinning rebound, a bull-rush lean, a leaping spin-slam ult and a tree-fall death.
 *
 * Joint conventions (anim/common.ts): thigh x < 0 swings the leg forward, knee x > 0 bends it, shoulder x < 0 raises the
 * arm forward / up (z +: left arm out, z −: right arm out), chest y + twists to the left, chest x > 0 leans forward,
 * head x < 0 lifts the chin. Root: fwd / side / up m, yaw / pitch / roll turns (pitch + = front flip), sx / sy factors.
 * Render only.
 */
import { BuffFlag } from '../../sim/api';
import { BASIC_CONTACT, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S, abilNumbers, slotTimingFrom } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type Key, type MoveCtx, type MoveSet, type ScalarKey } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

type D = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.brutus;
const C = BASIC_CONTACT;
/** Pug Charge travel (s): 5 m at 20 m/s = 8 t. */
export const CHARGE_AIR = T.slots.e.dashTicks * TICK_S;
/** Guard Post (level-6 branch) length (s): postDuration 60 t. */
export const POST_S = slotTimingFrom('brutus', 'w', abilNumbers('brutus', 'w', null, true)).duration * TICK_S;

// ------------------------------------------------------------------------------------------------ shared poses

/** Deep landing crouch (both knees). */
const CROUCH: D = { thighL: [-0.55, 0, 0], thighR: [-0.55, 0, 0], kneeL: [1.05, 0, 0], kneeR: [1.05, 0, 0], chest: [0.3, 0, 0] };
/** Air tuck: knees to the chest. */
const TUCK: D = { thighL: [-1.25, 0, 0.1], thighR: [-1.1, 0, -0.1], kneeL: [1.7, 0, 0], kneeR: [1.7, 0, 0] };
/** The turtle: shield thrust forward, head tucked behind it, sword cocked low behind. */
const TURTLE: D = { chest: [0.25, -0.12, 0], head: [0.3, 0, 0], shoulderL: [-0.85, 0, -0.12], elbowL: [0.15, 0, 0], shoulderR: [0.35, 0, -0.25], elbowR: [-0.9, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics (period 36 t)

const BASIC = { mask: 'full' as const, mode: 'override' as const, prio: Prio.Basic, lockFeet: true, cancel: 'afterContact' as const, warp: [['contact', 'contact']] as const };

/** A: shield shove. Lean back and pull the shield in, then drive it forward with the whole body (squash 0.12). */
const basicA: ClipDef = {
  ...BASIC,
  id: 'brutus.basicA',
  len: C + 0.5,
  keys: [
    [0, null, null],
    [C * 0.62, null, { chest: [-0.24, 0.4, 0], hips: [0, 0.18, 0], head: [-0.12, 0, 0], shoulderL: [0.4, 0, 0.3], elbowL: [-0.5, 0, 0], thighR: [0.25, 0, 0], kneeL: [0.35, 0, 0] }, 'out'],
    [C, null, { chest: [0.38, -0.28, 0], hips: [0, -0.16, 0], head: [0.15, 0, 0], shoulderL: [-1.0, 0, -0.1], elbowL: [0.2, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.55, 0, 0], thighR: [0.4, 0, 0] }, 'expoIn'],
    [C + 0.1, null, { chest: [0.45, -0.32, 0], hips: [0, -0.18, 0], head: [0.18, 0, 0], shoulderL: [-1.1, 0, -0.15], elbowL: [0.25, 0, 0], thighL: [-0.65, 0, 0], kneeL: [0.6, 0, 0], thighR: [0.42, 0, 0] }, 'out'],
    [C + 0.5, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.62, -0.07, 'out'], [C, 0.2, 'expoIn'], [C + 0.12, 0.22, 'out'], [C + 0.5, 0, 'inOut']],
    sx: [[0, 1], [C * 0.62, 0.93], [C, 1.14, 'expoIn'], [C + 0.16, 1, 'back']],
    sy: [[0, 1], [C * 0.62, 1.06], [C, 0.88, 'expoIn'], [C + 0.18, 1, 'back']],
  },
  markers: { coil: 0.05, contact: C, end: C + 0.5 },
  cues: [['coil', 'whoosh', 'S'], ['contact', 'sfx', 'clang'], ['contact', 'dust']],
};

/** B: an overhead sword chop from behind the shield, with a little hop into it. */
const basicB: ClipDef = {
  ...BASIC,
  id: 'brutus.basicB',
  len: C + 0.5,
  keys: [
    [0, null, null],
    [C * 0.64, null, { chest: [-0.32, 0.5, 0], hips: [0, 0.2, 0], head: [-0.18, 0, 0], shoulderR: [-2.6, 0, -0.3], elbowR: [-0.7, 0, 0], shoulderL: [-0.35, 0, 0.25], thighR: [0.25, 0, 0], kneeL: [0.35, 0, 0] }, 'out'],
    [C, null, { chest: [0.55, -0.4, 0], hips: [0, -0.22, 0], head: [0.22, 0, 0], shoulderR: [-0.45, 0, 0.4], elbowR: [0.1, 0, 0], shoulderL: [0.2, 0, 0.1], thighL: [-0.55, 0, 0], kneeL: [0.65, 0, 0], thighR: [0.3, 0, 0], kneeR: [0.2, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [0.62, -0.45, 0], hips: [0, -0.24, 0], head: [0.25, 0, 0], shoulderR: [-0.2, 0, 0.5], elbowR: [0.15, 0, 0], shoulderL: [0.2, 0, 0.1], thighL: [-0.6, 0, 0], kneeL: [0.7, 0, 0], thighR: [0.32, 0, 0], kneeR: [0.22, 0, 0] }, 'out'],
    [C + 0.5, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [C * 0.64, 0.14, 'out'], [C, 0, 'expoIn'], [C + 0.5, 0]],
    fwd: [[0, 0], [C, 0.14, 'expoIn'], [C + 0.5, 0, 'inOut']],
    sy: [[0, 1], [C * 0.45, 1.08], [C, 0.84, 'expoIn'], [C + 0.2, 1, 'back']],
  },
  markers: { coil: 0.05, contact: C, end: C + 0.5 },
  cues: [['coil', 'trailOn', 'weapon'], [C * 0.75, 'whoosh', 'M'], ['contact', 'smear'], ['contact', 'sfx', 'clang'], [C + 0.2, 'trailOff']],
};

/** C: shoulder check with a stomp: knee up on the coil, the foot drives down on the contact (dust ring, T1). */
const basicC: ClipDef = {
  ...BASIC,
  id: 'brutus.basicC',
  len: C + 0.55,
  keys: [
    [0, null, null],
    [C * 0.6, null, { chest: [-0.15, 0.55, 0], hips: [0, 0.25, 0], head: [-0.1, -0.2, 0], thighR: [-1.05, 0, 0], kneeR: [1.4, 0, 0], kneeL: [0.35, 0, 0], shoulderL: [-0.2, 0, 0.35], shoulderR: [-0.6, 0, -0.5] }, 'out'],
    [C, null, { chest: [0.45, -0.55, 0], hips: [0, -0.3, 0], head: [0.2, 0.15, 0], thighR: [0.1, 0, 0], kneeR: [0.2, 0, 0], thighL: [-0.45, 0, 0], kneeL: [0.75, 0, 0], shoulderL: [-0.75, 0, -0.2], shoulderR: [0.3, 0, -0.3] }, 'expoIn'],
    [C + 0.14, null, { chest: [0.5, -0.6, 0], hips: [0, -0.32, 0], head: [0.22, 0.15, 0], thighR: [0.12, 0, 0], kneeR: [0.25, 0, 0], thighL: [-0.5, 0, 0], kneeL: [0.8, 0, 0], shoulderL: [-0.8, 0, -0.2], shoulderR: [0.3, 0, -0.3] }, 'out'],
    [C + 0.55, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [C * 0.6, 0.2, 'out'], [C, 0, 'expoIn'], [C + 0.55, 0]],
    fwd: [[0, 0], [C, 0.24, 'expoIn'], [C + 0.14, 0.26, 'out'], [C + 0.55, 0, 'inOut']],
    sx: [[0, 1], [C, 1.16, 'expoIn'], [C + 0.2, 1, 'back']],
    sy: [[0, 1], [C * 0.6, 1.1, 'out'], [C, 0.8, 'expoIn'], [C + 0.22, 1, 'back']],
  },
  markers: { coil: 0.05, contact: C, end: C + 0.55 },
  cues: [['coil', 'whoosh', 'S'], ['contact', 'dustRing'], ['contact', 'sfx', 'bodyThud'], ['contact', 'shake', 1]],
};

/**
 * Passive Honour proc (render side): while Brutus carries a shield (BuffFlag.Shielded, the Honour shield or any other),
 * the combo finisher becomes a spinning shield bash: a 1-turn spin (≤ 0.3 s) with the shield arm flung out, the rim
 * striking on the contact. The skill FX adds the gold shine.
 */
const honourBash: ClipDef = {
  ...BASIC,
  id: 'brutus.basicHonour',
  len: C + 0.5,
  keys: [
    [0, null, null],
    [0.06, null, { chest: [-0.1, 0.5, 0], hips: [0, 0.2, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], shoulderL: [-0.4, 0, 0.3] }, 'out'],
    [C - 0.06, null, { chest: [0.15, 0.2, 0], shoulderL: [-1.2, 0, 1.0], elbowL: [0.2, 0, 0], shoulderR: [-0.3, 0, -0.9], ...TUCK }, 'inOut'],
    [C, null, { chest: [0.4, -0.35, 0], hips: [0, -0.2, 0], head: [0.15, 0, 0], shoulderL: [-1.15, 0, -0.1], elbowL: [0.25, 0, 0], shoulderR: [0.2, 0, -0.5], thighL: [-0.6, 0, 0], kneeL: [0.6, 0, 0], thighR: [0.35, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [0.48, -0.4, 0], hips: [0, -0.22, 0], head: [0.18, 0, 0], shoulderL: [-1.2, 0, -0.15], elbowL: [0.25, 0, 0], shoulderR: [0.2, 0, -0.5], thighL: [-0.62, 0, 0], kneeL: [0.62, 0, 0], thighR: [0.38, 0, 0] }, 'out'],
    [C + 0.5, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [0.04, 0], [C + 0.02, 1, 'inOut'], [C + 0.5, 1]],
    up: [[0, 0], [0.06, 0], [C * 0.6, 0.32, 'out'], [C, 0, 'expoIn'], [C + 0.5, 0]],
    fwd: [[0, 0], [C, 0.2, 'expoIn'], [C + 0.5, 0, 'inOut']],
    sx: [[0, 1], [C, 1.16, 'expoIn'], [C + 0.18, 1, 'back']],
    sy: [[0, 1], [0.06, 0.86, 'out'], [0.12, 1.1, 'out'], [C, 0.82, 'expoIn'], [C + 0.2, 1, 'back']],
  },
  markers: { coil: 0.04, contact: C, end: C + 0.5 },
  cues: [['coil', 'whoosh', 'M'], ['coil', 'ghost'], ['contact', 'sfx', 'tingParry'], ['contact', 'sfx', 'clang'], ['contact', 'dustRing'], ['contact', 'shake', 1], ['contact', 'fx', 'honour']],
  calm: { yaw: 0 },
};

// ------------------------------------------------------------------------------------------------ Q Shield Slam

/**
 * Q: shield raised on the peek, rim driven into the ground on the cast tick (sy 0.72), then a spinning rebound hop.
 * Upper mask: Shield Slam is instant, so the sim lets him walk from the cast tick; the gait owns the legs (no foot
 * slide) while the root channels (squash, hop, spin) still carry the slam's weight.
 */
const QC = 0.1;
const q: ClipDef = {
  id: 'brutus.q',
  len: 0.95,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, null, null],
    [QC * 0.55, null, { chest: [-0.4, 0, 0], head: [-0.3, 0, 0], shoulderL: [-2.3, 0, 0.1], elbowL: [-0.3, 0, 0], shoulderR: [-1.7, 0, -0.3], kneeL: [0.45, 0, 0], kneeR: [0.45, 0, 0], thighL: [-0.25, 0, 0], thighR: [-0.25, 0, 0] }, 'out'],
    [QC, null, { chest: [0.5, 0, 0], head: [0.3, 0, 0], shoulderL: [-0.4, 0, -0.1], elbowL: [0.2, 0, 0], shoulderR: [-0.35, 0, 0.25], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], kneeL: [1.45, 0, 0], kneeR: [1.45, 0, 0] }, 'expoIn'],
    [QC + 0.1, null, { chest: [0.52, 0, 0], head: [0.32, 0, 0], shoulderL: [-0.35, 0, -0.1], elbowL: [0.2, 0, 0], shoulderR: [-0.3, 0, 0.25], thighL: [-0.92, 0, 0], thighR: [-0.92, 0, 0], kneeL: [1.5, 0, 0], kneeR: [1.5, 0, 0] }, 'hold'],
    [QC + 0.26, null, { chest: [-0.15, 0, 0], head: [-0.3, 0, 0], shoulderL: [-1.3, 0, 0.7], shoulderR: [-1.1, 0, -0.7], ...TUCK }, 'out'],
    [QC + 0.46, null, { ...CROUCH, shoulderL: [-0.5, 0, 0.2], shoulderR: [-0.3, 0, -0.3] }, 'in'],
    [0.95, null, null, 'back'],
  ],
  root: {
    up: [[0, 0], [QC * 0.55, 0.16, 'out'], [QC, 0, 'expoIn'], [QC + 0.1, 0], [QC + 0.26, 0.42, 'out'], [QC + 0.46, 0, 'in'], [0.95, 0]],
    yaw: [[0, 0], [QC + 0.12, 0], [QC + 0.42, 1, 'inOut'], [0.95, 1]],
    sx: [[0, 1], [QC, 1.22, 'expoIn'], [QC + 0.16, 1, 'out']],
    sy: [[0, 1], [QC * 0.55, 1.1], [QC, 0.72, 'expoIn'], [QC + 0.1, 0.76], [QC + 0.2, 1.1, 'out'], [QC + 0.3, 1], [QC + 0.46, 0.8, 'in'], [QC + 0.62, 1, 'back']],
  },
  markers: { coil: 0.02, contact: QC, air: QC + 0.26, land: QC + 0.46, end: 0.95 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'shake', 2], ['contact', 'punch', 0.04], ['contact', 'earsBack'], ['air', 'whoosh', 'M'], ['air', 'ghost'], ['land', 'land'], ['land', 'fx', 'qLand']],
  lockFeet: true,
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Front Guard / Guard Post

/** W: lift the lead foot and stomp it down while the shield punches forward into the guard (the wall rises). */
const WC = 0.1;
const w: ClipDef = {
  id: 'brutus.w',
  len: 0.55,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  keys: [
    [0, null, null],
    [WC * 0.6, null, { chest: [-0.18, 0.35, 0], head: [-0.15, 0, 0], shoulderL: [0.35, 0, 0.35], elbowL: [-0.5, 0, 0], thighL: [-0.8, 0, 0], kneeL: [1.0, 0, 0] }, 'out'],
    [WC, null, { ...TURTLE, chest: [0.32, -0.15, 0], shoulderL: [-1.0, 0, -0.15], thighL: [-0.45, 0, 0], kneeL: [0.5, 0, 0], thighR: [0.35, 0, 0], kneeR: [0.25, 0, 0] }, 'expoIn'],
    [WC + 0.14, null, { ...TURTLE, chest: [0.3, -0.12, 0], thighL: [-0.4, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.32, 0, 0], kneeR: [0.22, 0, 0] }, 'out'],
    [0.55, null, TURTLE, 'inOut'],
  ],
  root: {
    up: [[0, 0], [WC * 0.6, 0.08, 'out'], [WC, 0, 'expoIn'], [0.55, 0]],
    fwd: [[0, 0], [WC, 0.12, 'expoIn'], [0.55, 0, 'inOut']],
    sy: [[0, 1], [WC * 0.6, 1.06], [WC, 0.82, 'expoIn'], [WC + 0.2, 1, 'back']],
  },
  markers: { coil: 0.02, contact: WC, end: 0.55 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'clang'], ['contact', 'dust'], ['contact', 'shake', 1]],
  lockFeet: true,
  cancel: 'any',
  blendOut: 0.2,
};

/**
 * W hold (upper body, looping) while Front Guard stands: the turtle over the walking legs, a slow braced breath. Emote
 * priority, so a basic still swings (the base 'block' pose keeps the shield up), and the end clip replaces it.
 */
const wHold: ClipDef = {
  id: 'brutus.wHold',
  len: 1.0,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.12,
  keys: [
    [0, null, TURTLE],
    [0.5, null, { ...TURTLE, chest: [0.3, -0.1, 0], head: [0.34, 0, 0], shoulderL: [-0.9, 0, -0.1] }, 'inOut'],
    [1.0, null, TURTLE, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};

/** W end (on stateEnd): the shield is flung out to the side and swung back to the guard. */
const wEnd: ClipDef = {
  id: 'brutus.wEnd',
  len: 0.55,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.06,
  keys: [
    [0, null, TURTLE],
    [0.12, null, { chest: [0.15, 0.25, 0], shoulderL: [-0.5, 0, 0.2], elbowL: [-0.4, 0, 0], head: [0.1, 0, 0] }, 'out'],
    [0.24, null, { chest: [-0.1, -0.35, 0], shoulderL: [-1.3, 0, 1.1], elbowL: [0.1, 0, 0], shoulderR: [-0.4, 0, -0.4], head: [-0.2, 0, 0] }, 'expoIn'],
    [0.55, null, null, 'inOut'],
  ],
  markers: { contact: 0.24, end: 0.55 },
  warp: [],
  cues: [[0.2, 'whoosh', 'M'], ['contact', 'fx', 'wDrop']],
  cancel: 'any',
};

/**
 * W branch, Guard Post (level 6): a crouched launch on the cast tick, an air tuck with the sword raised, a landing stab
 * into the kneel behind the shield (the dome slams down), a roar, the kneel held, and the yank free on stateEnd (the
 * dome falls: postDuration 60 t). Basic priority with `cancel: 'any'`, so a basic swing still shows while planted: the
 * basic picker then plays `postChop`, which keeps the kneel. After a swing the branch's own hold (`postHold`, the
 * kneel) and end (`postEnd`, the yank free on stateEnd) play instead of Front Guard's.
 */
const PC = 0.08;
const PLANT = 0.42;
/** The kneel sits low: a held squash (root up cannot go below the ground) plus a deeper front thigh and the sword arm planted. */
const KNEEL_SY = 0.88;
const KNEEL: D = { thighL: [-0.15, 0, 0], kneeL: [0.25, 0, 0], thighR: [0.2, 0, 0], shoulderR: [-0.25, 0, 0], elbowR: [0.3, 0, 0] };
const wPost: ClipDef = {
  id: 'brutus.wPost',
  len: POST_S + 0.45,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.03,
  keys: [
    [0, null, null],
    [PC, null, { ...CROUCH, chest: [0.4, 0, 0], shoulderR: [-0.8, 0, -0.3] }, 'out'],
    [0.25, null, { ...TUCK, chest: [-0.25, 0, 0], head: [-0.3, 0, 0], shoulderR: [-2.8, 0, -0.1], elbowR: [-0.3, 0, 0], shoulderL: [-1.4, 0, 0.4] }, 'out'],
    [PLANT, 'kneel', { ...KNEEL, chest: [0.4, 0, 0], head: [0.25, 0, 0] }, 'expoIn'],
    [PLANT + 0.1, 'kneel', { ...KNEEL, chest: [0.45, 0, 0], head: [0.3, 0, 0] }, 'hold'],
    [PLANT + 0.24, 'kneel', { ...KNEEL, chest: [-0.3, 0, 0], head: [-0.6, 0, 0] }, 'out'],
    [PLANT + 0.6, 'kneel', { ...KNEEL, chest: [-0.25, 0, 0], head: [-0.5, 0, 0] }, 'inOut'],
    [PLANT + 0.85, 'kneel', { ...KNEEL, chest: [0.1, 0, 0], head: [0.15, 0, 0] }, 'inOut'],
    [POST_S - 0.18, 'kneel', { ...KNEEL, chest: [0.15, 0, 0], head: [0.2, 0, 0] }, 'inOut'],
    [POST_S, 'shieldGuard', { chest: [-0.3, 0, 0], head: [-0.2, 0, 0], shoulderR: [-2.0, 0, -0.3], elbowR: [-0.4, 0, 0], shoulderL: [-1.5, 0, 0.5], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'expoOut'],
    [POST_S + 0.45, 'shieldGuard', null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [PC, 0], [0.25, 0.95, 'out'], [PLANT, 0, 'in'], [POST_S - 0.05, 0], [POST_S + 0.1, 0.28, 'out'], [POST_S + 0.28, 0, 'in'], [POST_S + 0.45, 0]],
    sy: [[0, 1], [PC, 0.8, 'out'], [PC + 0.06, 1.14, 'out'], [PLANT - 0.03, 1], [PLANT + 0.03, 0.7, 'in'], [PLANT + 0.2, KNEEL_SY, 'back'], [PLANT + 0.3, KNEEL_SY + 0.06], [PLANT + 0.7, KNEEL_SY], [POST_S - 0.1, KNEEL_SY - 0.04], [POST_S, 1.08, 'out'], [POST_S + 0.3, 0.86, 'in'], [POST_S + 0.45, 1, 'back']],
    sx: [[0, 1], [PLANT + 0.24, 1], [PLANT + 0.34, 1.1, 'out'], [PLANT + 0.7, 1, 'inOut']],
  },
  markers: { coil: 0.02, contact: PC, plant: PLANT, roar: PLANT + 0.24, release: POST_S, end: POST_S + 0.45 },
  warp: [['contact', 'cast'], ['release', 'stateEnd']],
  cues: [
    ['contact', 'whoosh', 'M'],
    ['contact', 'dust'],
    ['plant', 'shake', 2],
    ['plant', 'dustRing'],
    ['plant', 'sfx', 'clang'],
    ['plant', 'fx', 'postPlant'],
    ['roar', 'mouthOpen', 450],
    ['roar', 'earsBack'],
    ['roar', 'sfx', 'fwoomp'],
    ['release', 'whoosh', 'M'],
    ['release', 'fx', 'postYank'],
    [POST_S + 0.28, 'land'],
  ],
  cancel: 'any',
};

/**
 * Guard Post planted basic: an overhead chop from the kneel. Every key keeps the 'kneel' base and the kneel squash, so
 * a swing while planted (the sim holds him still for the 60 t) never stands him up. Picked by `brutusBasicPick` while
 * the Guard Post branch is up (BuffFlag.Blocking with the branch); ≤ one period long so consecutive swings chain.
 */
const postChop: ClipDef = {
  ...BASIC,
  id: 'brutus.postChop',
  len: C + 0.9,
  keys: [
    [0, 'kneel', KNEEL],
    [C * 0.62, 'kneel', { ...KNEEL, chest: [-0.3, 0.45, 0], head: [-0.2, 0, 0], shoulderR: [-2.6, 0, -0.3], elbowR: [-0.7, 0, 0] }, 'out'],
    [C, 'kneel', { ...KNEEL, chest: [0.55, -0.35, 0], head: [0.25, 0, 0], shoulderR: [-0.4, 0, 0.4], elbowR: [0.1, 0, 0] }, 'expoIn'],
    [C + 0.12, 'kneel', { ...KNEEL, chest: [0.6, -0.4, 0], head: [0.28, 0, 0], shoulderR: [-0.2, 0, 0.5], elbowR: [0.15, 0, 0] }, 'out'],
    [C + 0.5, 'kneel', KNEEL, 'inOut'],
    [C + 0.9, 'kneel', KNEEL, 'hold'],
  ],
  root: {
    sy: [[0, KNEEL_SY], [C * 0.62, KNEEL_SY + 0.08, 'out'], [C, KNEEL_SY - 0.12, 'expoIn'], [C + 0.2, KNEEL_SY, 'back'], [C + 0.9, KNEEL_SY]],
    sx: [[0, 1], [C, 1.12, 'expoIn'], [C + 0.18, 1, 'back']],
  },
  blendIn: 0.04,
  markers: { coil: 0.05, contact: C, end: C + 0.9 },
  cues: [['coil', 'trailOn', 'weapon'], [C * 0.75, 'whoosh', 'M'], ['contact', 'smear'], ['contact', 'sfx', 'clang'], ['contact', 'dust'], [C + 0.2, 'trailOff']],
};

/**
 * Guard Post hold (branchHold): the kneel behind the shield with a slow braced breath, looping while the dome stands
 * once a planted swing (postChop) has finished, so a pause between swings never stands him up.
 */
const postHold: ClipDef = {
  id: 'brutus.postHold',
  len: 1.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.1,
  keys: [
    [0, 'kneel', { ...KNEEL, chest: [0.15, 0, 0], head: [0.2, 0, 0] }],
    [0.6, 'kneel', { ...KNEEL, chest: [0.22, 0, 0], head: [0.26, 0, 0] }, 'inOut'],
    [1.2, 'kneel', { ...KNEEL, chest: [0.15, 0, 0], head: [0.2, 0, 0] }, 'inOut'],
  ],
  root: { sy: [[0, KNEEL_SY], [0.6, KNEEL_SY - 0.03, 'inOut'], [1.2, KNEEL_SY, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Guard Post end (branchEnd, on stateEnd): the yank free out of the kneel, a little hop back to the guard. */
const postEnd: ClipDef = {
  id: 'brutus.postEnd',
  len: 0.45,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.04,
  keys: [
    [0, 'kneel', { ...KNEEL, chest: [0.15, 0, 0], head: [0.2, 0, 0] }],
    [0.12, 'shieldGuard', { chest: [-0.3, 0, 0], head: [-0.2, 0, 0], shoulderR: [-2.0, 0, -0.3], elbowR: [-0.4, 0, 0], shoulderL: [-1.5, 0, 0.5] }, 'expoOut'],
    [0.45, 'shieldGuard', null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.04, 0], [0.18, 0.28, 'out'], [0.34, 0, 'in'], [0.45, 0]],
    sy: [[0, KNEEL_SY], [0.1, 1.08, 'out'], [0.34, 0.86, 'in'], [0.45, 1, 'back']],
  },
  markers: { contact: 0, end: 0.45 },
  warp: [['contact', 'stateEnd']],
  cues: [[0.02, 'whoosh', 'M'], [0.02, 'fx', 'postYank'], [0.34, 'land']],
  calm: { up: 0.5 },
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ E Pug Charge

/**
 * Alternating bull-rush strides: 3 full cycles over the 5 m (six half cycles: the drive pose on the take-off, strides
 * at 1/6..5/6 of the travel, the skid on the 6th). The reaching leg is the near-straight stance leg (the foot on the
 * ground), the other trails with a bent knee. A 25° lean in all (root pitch 12.6° + chest 8.6° + head).
 */
const RUSH: D = { chest: [0.15, 0, 0], head: [0.1, 0, 0], shoulderL: [-1.05, 0, -0.2], elbowL: [0.2, 0, 0], shoulderR: [0.55, 0, -0.35], elbowR: [-0.9, 0, 0] };
const strideA: D = { ...RUSH, thighL: [-0.75, 0, 0], kneeL: [0.25, 0, 0], thighR: [0.55, 0, 0], kneeR: [0.75, 0, 0] };
const strideB: D = { ...RUSH, thighL: [0.55, 0, 0], kneeL: [0.75, 0, 0], thighR: [-0.75, 0, 0], kneeR: [0.25, 0, 0] };
const E0 = 0.06;
const E1 = E0 + CHARGE_AIR;
const eLen = E1 + 0.32;
/** Root bounce (m): down on each footfall, up between, ≤ 0.06. */
const E_BOUNCE = 0.05;
const eKeys: Key[] = [
  [0, null, null],
  // the drive: strideB's legs with a deeper push-off knee (the first half cycle runs from here into strideA)
  [E0, null, { ...strideB, kneeL: [0.9, 0, 0] }, 'expoOut'],
];
for (let i = 1; i <= 5; i++) eKeys.push([E0 + (CHARGE_AIR * i) / 6, null, i % 2 ? strideA : strideB, 'inOut']);
const eUp: ScalarKey[] = [[0, 0], [E0, 0]];
for (let i = 1; i <= 6; i++) eUp.push([E0 + (CHARGE_AIR * (i - 0.5)) / 6, E_BOUNCE, 'out'], [E0 + (CHARGE_AIR * i) / 6, 0, 'in']);
eUp.push([eLen, 0]);
eKeys.push(
  [E1, null, { chest: [-0.28, 0, 0], head: [-0.22, 0, 0], thighL: [-0.95, 0, 0], kneeL: [0.35, 0, 0], thighR: [-0.25, 0, 0], kneeR: [0.85, 0, 0], shoulderL: [-1.25, 0, 0.35], shoulderR: [-0.8, 0, -0.55] }, 'out'],
  [E1 + 0.1, null, { chest: [-0.36, 0, 0], head: [-0.26, 0, 0], thighL: [-1.0, 0, 0], kneeL: [0.38, 0, 0], thighR: [-0.28, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-1.3, 0, 0.4], shoulderR: [-0.85, 0, -0.6] }, 'out'],
  [eLen, null, null, 'back'],
);

/**
 * E: a head-down shoulder charge (lean 25°, shield leading), three stride cycles, a heel skid at the end of the travel.
 *
 * Pug Charge always dashes the full 5 m (the sim uses only the aim's angle), but the director predicts travelEnd and
 * the progress from the aim distance (min(aim, 5 m)). So `land` (bound to travelEnd) marks where that aim-clamped
 * progress segment ends: on the full 5 m clip it is the skid; on the shorter variants (`pickE`, by the aim's travel
 * ticks) it sits k of the way through the strides, the rest of the strides play on time at 1× after it, and the skid
 * (marker `skid`, every landing cue) still lands at cast + 8 t, when the sim's dash really ends.
 */
function charge(k: number, id: string): ClipDef {
  return {
    id,
    len: eLen,
    mask: 'full',
    mode: 'override',
    prio: Prio.Ability,
    blendIn: 0.03,
    keys: eKeys,
    root: {
      pitch: [[0, 0], [E0, 0.035, 'expoOut'], [E1 - 0.02, 0.035], [E1, -0.05, 'out'], [E1 + 0.12, -0.065, 'out'], [eLen, 0, 'back']],
      up: eUp,
      sx: [[0, 1], [E0, 1.15, 'expoOut'], [E1, 1.1], [E1 + 0.05, 0.88, 'out'], [E1 + 0.2, 1, 'back']],
      sy: [[0, 1], [E0, 0.9], [E1, 0.92], [E1 + 0.05, 1.08, 'out'], [E1 + 0.2, 1, 'back']],
    },
    markers: { takeoff: E0, contact: E0, mid: E0 + CHARGE_AIR * 0.5, land: E0 + CHARGE_AIR * k, skid: E1, end: eLen },
    warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
    cues: [['takeoff', 'earsBack'], ['takeoff', 'ghost'], ['takeoff', 'whoosh', 'L'], ['takeoff', 'dust'], ['takeoff', 'fx', 'eGo'], ['mid', 'ghost'], ['skid', 'dust'], ['skid', 'land'], ['skid', 'fx', 'eSkid']],
    cancel: 'afterContact',
  };
}
/** The charge: Pug Charge always flies its full 5 m (a wall stops it early and the director snaps to the landing). */
const e = charge(1, 'brutus.e');
/** E onHit: the first hero hit mid-charge: the impact pose (squashed along the motion), a triumphant rebound hop. */
const eHit: ClipDef = {
  id: 'brutus.eHit',
  len: 0.75,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.02,
  keys: [
    [0, null, { chest: [0.4, 0, 0], head: [0.25, 0, 0], shoulderL: [-1.3, 0, -0.1], elbowL: [0.3, 0, 0], shoulderR: [0.5, 0, -0.4], elbowR: [-0.9, 0, 0], thighL: [-0.8, 0, 0], kneeL: [0.7, 0, 0], thighR: [0.6, 0, 0], kneeR: [0.3, 0, 0] }],
    [0.12, null, { chest: [0.42, 0, 0], head: [0.26, 0, 0], shoulderL: [-1.32, 0, -0.1], elbowL: [0.3, 0, 0], shoulderR: [0.5, 0, -0.4], elbowR: [-0.9, 0, 0], thighL: [-0.82, 0, 0], kneeL: [0.72, 0, 0], thighR: [0.62, 0, 0], kneeR: [0.3, 0, 0] }, 'hold'],
    [0.3, null, { chest: [-0.35, 0, 0], head: [-0.45, 0, 0], shoulderL: [-1.7, 0, 0.6], shoulderR: [-1.5, 0, -0.8], elbowR: [-0.3, 0, 0], ...TUCK }, 'out'],
    [0.46, null, { ...CROUCH, chest: [0.2, 0, 0] }, 'in'],
    [0.75, null, null, 'back'],
  ],
  root: {
    sx: [[0, 0.8], [0.12, 0.82], [0.2, 1.08, 'out'], [0.34, 1, 'out']],
    sy: [[0, 1.12], [0.12, 1.1], [0.2, 0.96], [0.44, 1], [0.48, 0.82, 'in'], [0.62, 1, 'back']],
    up: [[0, 0], [0.14, 0], [0.3, 0.36, 'out'], [0.46, 0, 'in'], [0.75, 0]],
    pitch: [[0, 0.03], [0.14, 0.03], [0.3, -0.04, 'out'], [0.46, 0, 'in'], [0.75, 0]],
  },
  markers: { contact: 0, hop: 0.16, land: 0.46, end: 0.75 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'shake', 2], ['contact', 'punch', 0.04], ['contact', 'sfx', 'bodyThud'], ['hop', 'whoosh', 'S'], ['land', 'land']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ R Champion's Challenge

const R_POINT: D = { chest: [0.15, -0.35, 0], hips: [0, -0.15, 0], head: [-0.1, -0.1, 0], shoulderR: [-1.55, 0, 0.15], elbowR: [0, 0, 0], thighL: [-0.5, 0, 0], kneeL: [0.5, 0, 0], thighR: [0.35, 0, 0] };
const THUMP: D = { chest: [-0.22, 0, 0], head: [-0.15, 0, 0], shoulderL: [-0.65, 0, -0.9], elbowL: [-0.9, 0, 0], shoulderR: [-0.65, 0, 0.9], elbowR: [-1.25, 0, 0] };
const THUMP_OPEN: D = { chest: [-0.05, 0, 0], head: [-0.05, 0, 0], shoulderL: [-0.3, 0, 0.35], shoulderR: [-0.3, 0, -0.35] };

/**
 * R: the challenge. Point the sword at the foe on the cast tick (instant), two chest thumps, a crouch, a leaping 1-turn
 * spin (0.25 s) into a shield slam (the obelisks' second wave, T3), then the roar with the chest puffed (sx 1.1).
 * `howl` (Rally Howl) swaps the roar for a head-up howl.
 */
function champion(id: string, howl: boolean): ClipDef {
  const RC = 0.1;
  const roar: D = howl
    ? { chest: [-0.5, 0, 0], head: [-0.95, 0, 0], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2], thighL: [-0.2, 0, 0.15], thighR: [-0.2, 0, -0.15] }
    : { chest: [-0.4, 0, 0], head: [-0.6, 0, 0], shoulderL: [-0.5, 0, 1.3], shoulderR: [-0.5, 0, -1.3], thighL: [-0.2, 0, 0.15], thighR: [-0.2, 0, -0.15] };
  return {
    id,
    len: 1.25,
    mask: 'upper',
    mode: 'override',
    // upper: R is instant and does not root him, so the gait drives the legs (no slide); the leap, spin and slam
    // squash stay on the root channels
    prio: Prio.Ult,
    blendIn: 0.03,
    blendOut: 0.18,
    keys: [
      [0, null, null],
      [RC * 0.5, null, { chest: [-0.1, 0.4, 0], shoulderR: [-0.6, 0, -0.6] }, 'out'],
      [RC, null, R_POINT, 'expoIn'],
      [0.24, null, R_POINT, 'hold'],
      [0.3, null, THUMP, 'expoIn'],
      [0.36, null, THUMP_OPEN, 'out'],
      [0.42, null, THUMP, 'expoIn'],
      [0.5, null, { ...CROUCH, chest: [0.4, 0, 0], shoulderL: [-0.2, 0, 0.3], shoulderR: [0.2, 0, -0.4] }, 'out'],
      [0.62, null, { ...TUCK, chest: [-0.2, 0, 0], head: [-0.25, 0, 0], shoulderL: [-2.5, 0, 0.2], elbowL: [-0.2, 0, 0], shoulderR: [-2.3, 0, -0.2] }, 'out'],
      [0.76, null, { chest: [0.55, 0, 0], head: [0.35, 0, 0], shoulderL: [-0.35, 0, -0.1], shoulderR: [-0.3, 0, 0.25], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], kneeL: [1.4, 0, 0], kneeR: [1.4, 0, 0] }, 'expoIn'],
      [0.84, null, { chest: [0.55, 0, 0], head: [0.35, 0, 0], shoulderL: [-0.35, 0, -0.1], shoulderR: [-0.3, 0, 0.25], thighL: [-0.88, 0, 0], thighR: [-0.88, 0, 0], kneeL: [1.38, 0, 0], kneeR: [1.38, 0, 0] }, 'hold'],
      [0.96, null, roar, 'expoOut'],
      [1.1, null, roar, 'hold'],
      [1.25, null, null, 'inOut'],
    ],
    root: {
      fwd: [[0, 0], [RC, 0.18, 'expoIn'], [0.24, 0.14], [0.48, 0, 'inOut'], [1.25, 0]],
      up: [[0, 0], [0.5, 0], [0.62, 0.62, 'out'], [0.76, 0, 'in'], [1.25, 0]],
      yaw: [[0, 0], [0.51, 0], [0.75, 1, 'inOut'], [1.25, 1]],
      sy: [[0, 1], [RC, 0.92], [0.24, 0.95], [0.3, 1.05], [0.36, 0.95], [0.42, 1.05], [0.5, 0.8, 'out'], [0.56, 1.14, 'out'], [0.74, 1], [0.77, 0.7, 'in'], [0.9, 1.08, 'back'], [1.1, 1.06], [1.25, 1]],
      sx: [[0, 1], [0.77, 1.25, 'in'], [0.9, 1.1, 'out'], [1.1, 1.1], [1.25, 1]],
    },
    markers: { coil: 0.02, contact: RC, thump1: 0.3, thump2: 0.42, takeoff: 0.52, slam: 0.76, roar: 0.92, end: 1.25 },
    warp: [['contact', 'cast']],
    cues: [
      ['contact', 'whoosh', 'M'],
      ['contact', 'mouthOpen', 180],
      ['thump1', 'sfx', 'drum'],
      ['thump2', 'sfx', 'drum'],
      ['takeoff', 'whoosh', 'L'],
      ['takeoff', 'ghost'],
      [0.64, 'ghost'],
      ['slam', 'shake', 3],
      ['slam', 'punch', 0.05],
      ['slam', 'dustRing'],
      ['slam', 'sfx', 'bodyThud'],
      ['slam', 'fx', 'rSlam'],
      ['roar', 'mouthOpen', howl ? 650 : 480],
      ['roar', 'earsBack'],
      ['roar', 'sfx', 'fwoomp'],
      ...(howl ? ([['roar', 'fx', 'howl']] as const) : []),
    ],
    lockFeet: true,
    cancel: 'afterContact',
  };
}
const r = champion('brutus.r', false);
const rHowl = champion('brutus.rHowl', true);

/** R hold (upper, looping): the duel stance: sword levelled at the foe, shield high, a small boxer's bounce. */
const rHold: ClipDef = {
  id: 'brutus.rHold',
  len: 0.8,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.15,
  keys: [
    [0, null, { chest: [0.15, -0.3, 0], head: [0.05, -0.1, 0], shoulderR: [-1.3, 0, 0.1], elbowR: [-0.1, 0, 0], shoulderL: [-0.75, 0, 0], elbowL: [0.1, 0, 0] }],
    [0.4, null, { chest: [0.2, -0.32, 0], head: [0.1, -0.1, 0], shoulderR: [-1.2, 0, 0.12], elbowR: [-0.15, 0, 0], shoulderL: [-0.8, 0, 0], elbowL: [0.1, 0, 0] }, 'inOut'],
    [0.8, null, { chest: [0.15, -0.3, 0], head: [0.05, -0.1, 0], shoulderR: [-1.3, 0, 0.1], elbowR: [-0.1, 0, 0], shoulderL: [-0.75, 0, 0], elbowL: [0.1, 0, 0] }, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};

/** R end (stateEnd): a sword salute to the foe: blade to the visor, then swept down and out. */
const rEnd: ClipDef = {
  id: 'brutus.rEnd',
  len: 0.7,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.2, null, { shoulderR: [-2.0, 0, 0.7], elbowR: [-1.4, 0, 0], head: [0.1, 0, 0], chest: [-0.05, 0, 0] }, 'out'],
    [0.32, null, { shoulderR: [-2.05, 0, 0.72], elbowR: [-1.45, 0, 0], head: [0.12, 0, 0] }, 'hold'],
    [0.45, null, { shoulderR: [-0.5, 0, -0.9], elbowR: [0, 0, 0], chest: [0.1, -0.2, 0] }, 'expoIn'],
    [0.7, null, null, 'inOut'],
  ],
  markers: { contact: 0.45, end: 0.7 },
  warp: [],
  cues: [[0.4, 'whoosh', 'S']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ idle, emotes, end states

/** Idle: a braced breath with the shield up (the base pose already breathes; this adds the heavy chest lift). */
const idle: ClipDef = {
  id: 'brutus.idle',
  len: 2.4,
  mask: 'upper',
  mode: 'additive',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [1.1, null, { chest: [-0.06, 0, 0], head: [-0.05, 0, 0], shoulderL: [-0.06, 0, 0] }, 'inOut'],
    [2.4, null, null, 'inOut'],
  ],
  markers: {},
  warp: [],
};

/** Fidget: a bull snort: head down, a double head shake, sy puff on the exhale. */
const snort: ClipDef = {
  id: 'brutus.snort',
  len: 0.9,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.18, null, { head: [0.35, 0, 0], chest: [0.15, 0, 0] }, 'out'],
    [0.32, null, { head: [0.3, 0.35, 0.1], chest: [0.12, 0, 0] }, 'inOut'],
    [0.44, null, { head: [0.3, -0.35, -0.1], chest: [0.12, 0, 0] }, 'inOut'],
    [0.56, null, { head: [0.3, 0.25, 0.08], chest: [0.12, 0, 0] }, 'inOut'],
    [0.7, null, { head: [-0.2, 0, 0], chest: [-0.12, 0, 0] }, 'out'],
    [0.9, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.68, 1], [0.74, 1.07, 'out'], [0.9, 1, 'inOut']] },
  markers: { end: 0.9 },
  warp: [],
  cues: [[0.72, 'sfx', 'pop']],
  cancel: 'any',
};

/** Fidget: the helmet adjust: sword paw up to the visor, a tug, back down. */
const helmet: ClipDef = {
  id: 'brutus.helmet',
  len: 1.0,
  mask: 'armR',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.3, null, { shoulderR: [-2.3, 0, 0.75], elbowR: [-1.7, 0, 0] }, 'out'],
    [0.42, null, { shoulderR: [-2.4, 0, 0.7], elbowR: [-1.8, 0, 0] }, 'inOut'],
    [0.54, null, { shoulderR: [-2.25, 0, 0.8], elbowR: [-1.65, 0, 0] }, 'inOut'],
    [1.0, null, null, 'inOut'],
  ],
  markers: { end: 1.0 },
  warp: [],
  cancel: 'any',
};

/** Fidget: the sword pommel taps the shield rim twice (clink, clink). */
const shieldTap: ClipDef = {
  id: 'brutus.shieldTap',
  len: 0.9,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.2, null, { shoulderR: [-1.0, 0, 0.9], elbowR: [-1.0, 0, 0], chest: [0, 0.2, 0] }, 'out'],
    [0.3, null, { shoulderR: [-0.8, 0, 1.15], elbowR: [-0.8, 0, 0], chest: [0, 0.25, 0] }, 'expoIn'],
    [0.42, null, { shoulderR: [-1.0, 0, 0.9], elbowR: [-1.0, 0, 0], chest: [0, 0.2, 0] }, 'out'],
    [0.52, null, { shoulderR: [-0.8, 0, 1.15], elbowR: [-0.8, 0, 0], chest: [0, 0.25, 0] }, 'expoIn'],
    [0.9, null, null, 'inOut'],
  ],
  markers: { end: 0.9 },
  warp: [],
  cues: [[0.3, 'sfx', 'clang'], [0.52, 'sfx', 'clang']],
  cancel: 'any',
};

/** Victory: shield hoisted overhead, a crouch and a full-spin hop, then the sword-up cheer held. */
const victory: ClipDef = {
  id: 'brutus.victory',
  len: 1.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.18, null, { ...CROUCH, shoulderL: [-2.6, 0, 0.3], elbowL: [-0.2, 0, 0], shoulderR: [-0.6, 0, -0.5] }, 'out'],
    [0.36, 'cheer', { ...TUCK, shoulderL: [-2.7, 0, 0.2], elbowL: [-0.1, 0, 0] }, 'out'],
    [0.56, 'cheer', { ...CROUCH, shoulderL: [-2.7, 0, 0.2] }, 'in'],
    [0.8, 'cheer', { shoulderL: [-2.8, 0, 0.3], chest: [-0.15, 0, 0], head: [-0.25, 0, 0] }, 'back'],
    [1.5, 'cheer', { shoulderL: [-2.8, 0, 0.3], chest: [-0.18, 0, 0], head: [-0.3, 0, 0] }, 'inOut'],
    [1.7, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.18, 0], [0.36, 0.55, 'out'], [0.56, 0, 'in'], [1.7, 0]],
    yaw: [[0, 0], [0.2, 0], [0.48, 1, 'inOut'], [1.7, 1]],
    sy: [[0, 1], [0.18, 0.8, 'out'], [0.24, 1.12, 'out'], [0.54, 1], [0.58, 0.78, 'in'], [0.75, 1.06, 'back'], [1.7, 1]],
  },
  markers: { takeoff: 0.2, land: 0.56, contact: 0.56, end: 1.7 },
  warp: [],
  cues: [['takeoff', 'whoosh', 'M'], ['land', 'land'], ['land', 'dustRing'], [0.8, 'mouthOpen', 400]],
  cancel: 'any',
};

/** Emote: three chest thumps with the sword hilt and a snort. */
const emote: ClipDef = {
  id: 'brutus.emote',
  len: 1.3,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.15, null, THUMP_OPEN, 'out'],
    [0.25, null, THUMP, 'expoIn'],
    [0.38, null, THUMP_OPEN, 'out'],
    [0.48, null, THUMP, 'expoIn'],
    [0.61, null, THUMP_OPEN, 'out'],
    [0.71, null, THUMP, 'expoIn'],
    [0.95, null, { chest: [-0.3, 0, 0], head: [-0.5, 0, 0], shoulderL: [-0.4, 0, 0.9], shoulderR: [-0.4, 0, -0.9] }, 'out'],
    [1.3, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.25, 1.05], [0.48, 1.06], [0.71, 1.08], [0.95, 1.1, 'out'], [1.3, 1, 'inOut']] },
  markers: { contact: 0.25, end: 1.3 },
  warp: [],
  cues: [[0.25, 'sfx', 'drum'], [0.48, 'sfx', 'drum'], [0.71, 'sfx', 'drum'], [0.95, 'mouthOpen', 300]],
  cancel: 'any',
};

/**
 * Death: a stagger back, a teeter forward, then he topples BACKWARD like a felled tree (pitch −0.24 turn, accelerating),
 * away from the killer (who stands in front: Brutus faces his target), lands flat on his back, bounces once, and only
 * then eases into the lying 'faint' base pose over 0.2 s while the root pitch unwinds (a quarter yaw keeps the head
 * away from the killer); the plume flops.
 */
const D_IMPACT = 0.66;
const D_REST = D_IMPACT + 0.4;
/** Held to the end of the corpse (heroView sinks it from 1.2 s and hides it at 2.6 s): the rest offsets never snap back into the killer. */
const D_LEN = 2.7;
const death: ClipDef = {
  id: 'brutus.death',
  len: D_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.14, null, { chest: [-0.45, 0.2, 0], head: [-0.55, 0, 0], shoulderL: [0.35, 0, 0.5], shoulderR: [0.3, 0, -0.7], kneeL: [0.3, 0, 0], thighR: [0.25, 0, 0] }, 'expoOut'],
    [0.34, null, { chest: [0.2, 0, 0], head: [0.25, 0, 0], shoulderL: [-0.3, 0, 0.3], shoulderR: [-0.2, 0, -0.4], kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0] }, 'inOut'],
    [D_IMPACT - 0.02, null, { chest: [-0.2, 0, 0], head: [-0.35, 0, 0], thighL: [-0.15, 0, 0.05], thighR: [-0.1, 0, -0.05], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], shoulderL: [-2.5, 0, 0.5], shoulderR: [-2.4, 0, -0.5], elbowL: [0, 0, 0], elbowR: [0, 0, 0] }, 'in'],
    [D_IMPACT + 0.1, null, { chest: [-0.1, 0, 0], head: [-0.2, 0.2, 0.1], thighL: [-0.4, 0, 0.1], thighR: [-0.3, 0, -0.1], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], shoulderL: [-2.0, 0, 0.9], shoulderR: [-2.0, 0, -0.9] }, 'out'],
    [D_IMPACT + 0.2, null, { chest: [-0.15, 0, 0], head: [-0.25, 0.3, 0.15], thighL: [-0.3, 0, 0.1], thighR: [-0.25, 0, -0.1], kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0], shoulderL: [-2.2, 0, 0.7], shoulderR: [-2.2, 0, -0.7] }, 'inOut'],
    [D_REST, 'faint', null, 'inOut'],
    [D_LEN, 'faint', null, 'hold'],
  ],
  root: {
    pitch: [[0, 0], [0.14, -0.03, 'expoOut'], [0.34, 0.02, 'inOut'], [D_IMPACT, -0.24, 'in'], [D_IMPACT + 0.1, -0.2, 'out'], [D_IMPACT + 0.2, -0.24, 'in'], [D_REST, 0, 'inOut'], [D_LEN, 0]],
    fwd: [[0, 0], [0.14, -0.12, 'expoOut'], [0.34, -0.05, 'inOut'], [D_IMPACT, -0.5, 'in'], [D_IMPACT + 0.2, -0.55, 'out'], [D_REST, -0.58, 'inOut'], [D_LEN, -0.58]],
    // the 'faint' pose lies on its side, head to his right: a quarter turn keeps the head pointing away from the killer
    yaw: [[0, 0], [D_IMPACT + 0.2, 0], [D_REST, -0.25, 'inOut'], [D_LEN, -0.25]],
    up: [[0, 0], [D_IMPACT, 0], [D_IMPACT + 0.1, 0.12, 'out'], [D_IMPACT + 0.2, 0, 'in'], [D_LEN, 0]],
    sy: [[0, 1], [D_IMPACT - 0.04, 1.04], [D_IMPACT + 0.02, 0.72, 'in'], [D_IMPACT + 0.14, 1.04, 'back'], [D_IMPACT + 0.22, 0.9, 'in'], [D_REST, 0.95, 'inOut'], [D_LEN, 0.95]],
    sx: [[0, 1], [D_IMPACT + 0.02, 1.2, 'in'], [D_IMPACT + 0.16, 1.0, 'out']],
  },
  markers: { contact: 0, fall: 0.34, impact: D_IMPACT, rest: D_REST, end: D_LEN },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['contact', 'earsBack'], ['fall', 'whoosh', 'S'], ['impact', 'land'], ['impact', 'sfx', 'bodyThud'], ['impact', 'dustRing'], ['impact', 'shake', 1], ['impact', 'fx', 'deathThud']],
  cancel: 'none',
};

/** Respawn: a cannonball drop from 1.2 m with a tucked front flip behind the shield, a shield-slam landing, a spin into the cheer. */
const respawn: ClipDef = {
  id: 'brutus.respawn',
  len: 1.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, { ...TUCK, chest: [0.4, 0, 0], head: [0.3, 0, 0], shoulderL: [-1.2, 0, -0.1] }],
    [0.3, null, { ...TUCK, chest: [0.45, 0, 0], head: [0.35, 0, 0], shoulderL: [-1.3, 0, -0.1] }, 'in'],
    [0.36, null, { chest: [0.55, 0, 0], head: [0.35, 0, 0], shoulderL: [-0.35, 0, -0.1], shoulderR: [-0.3, 0, 0.25], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], kneeL: [1.45, 0, 0], kneeR: [1.45, 0, 0] }, 'expoIn'],
    [0.5, null, { ...CROUCH }, 'out'],
    [0.75, 'cheer', { chest: [-0.1, 0, 0] }, 'back'],
    [1.1, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.36, 0, 'in'], [1.1, 0]],
    pitch: [[0, 0], [0.03, 0], [0.31, 1, 'inOut'], [1.1, 1]],
    yaw: [[0, 0], [0.48, 0], [0.74, 1, 'inOut'], [1.1, 1]],
    sy: [[0, 1.12], [0.34, 1.1], [0.38, 0.68, 'in'], [0.56, 1.06, 'back'], [0.7, 1]],
    sx: [[0, 1], [0.38, 1.25, 'in'], [0.56, 1, 'back']],
  },
  markers: { land: 0.36, end: 1.1 },
  warp: [],
  cues: [[0.05, 'whoosh', 'M'], [0.1, 'ghost'], ['land', 'land'], ['land', 'dustRing'], ['land', 'sfx', 'clang'], ['land', 'shake', 1], ['land', 'fx', 'spawnSlam'], [0.5, 'whoosh', 'M']],
  cancel: 'any',
};

/** Level up (4/7/10): a quick shield bang overhead with a hop. */
const levelUp: ClipDef = {
  id: 'brutus.levelUp',
  len: 0.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.12, null, { ...CROUCH }, 'out'],
    [0.28, null, { shoulderL: [-2.7, 0, 0.2], shoulderR: [-2.5, 0, -0.2], chest: [-0.2, 0, 0], head: [-0.3, 0, 0] }, 'out'],
    [0.42, null, { shoulderL: [-2.6, 0, 0.1], shoulderR: [-2.6, 0, -0.1], chest: [-0.15, 0, 0], head: [-0.25, 0, 0] }, 'inOut'],
    [0.7, null, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.12, 0], [0.28, 0.3, 'out'], [0.44, 0, 'in'], [0.7, 0]], sy: [[0, 1], [0.12, 0.84], [0.18, 1.1], [0.44, 0.85, 'in'], [0.6, 1, 'back']] },
  markers: { contact: 0.28, end: 0.7 },
  warp: [],
  cues: [[0.3, 'sfx', 'clang'], [0.44, 'land']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ gait and the set

/** Stocky waddle: short strides, heavy footfall bounce, a big hip roll, low lean (the shield rides in front). */
export const BRUTUS_GAIT: GaitProfile = {
  stride: 0.85,
  bounce: 1.5,
  lean: 0.6,
  hipSway: 1.8,
  headBob: 1.25,
  arms: 'hold',
  variants: DEFAULT_GAIT.variants,
};

const SHIELDED = BuffFlag.Shielded;
const BLOCKING = BuffFlag.Blocking;
/**
 * Basics: while Guard Post stands (the branch with BuffFlag.Blocking: he is planted), every swing is the kneeling chop;
 * otherwise the combo finisher (3rd swing) becomes the Honour bash while a shield is up. Allocation-free.
 */
export function brutusBasicPick(ctx: MoveCtx): ClipDef | null {
  if (ctx.branch && (ctx.buffs & BLOCKING) !== 0) return postChop;
  return (ctx.buffs & SHIELDED) !== 0 && ctx.comboIndex % 3 === 2 ? honourBash : null;
}
/** R: Rally Howl swaps the roar for the howl. Allocation-free. */
function rPick(ctx: MoveCtx): ClipDef | null {
  return ctx.talents.includes('rally-howl') ? rHowl : null;
}

export const MOVES: MoveSet = {
  hero: 'brutus',
  stub: false,
  gait: BRUTUS_GAIT,
  springs: HERO_SPRINGS.brutus,
  basic: [basicA, basicB, basicC],
  basicPick: brutusBasicPick,
  slots: {
    q: { cast: q },
    w: { cast: w, branch: wPost, hold: wHold, end: wEnd, branchHold: postHold, branchEnd: postEnd },
    e: { cast: e, onHit: eHit },
    r: { cast: r, hold: rHold, end: rEnd, pick: rPick },
  },
  idle,
  fidgets: [
    [snort, 2],
    [helmet, 1],
    [shieldTap, 1],
  ],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Every clip in the set (tests, the gallery). */
export const BRUTUS_CLIPS: readonly ClipDef[] = [basicA, basicB, basicC, honourBash, q, w, wHold, wEnd, wPost, postChop, postHold, postEnd, e, eHit, r, rHowl, rHold, rEnd, idle, snort, helmet, shieldTap, victory, emote, death, respawn, levelUp];
