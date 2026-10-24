/**
 * Sage's move set (ANIM-SPEC §14 "Sage: Marksman, Wind, bow and hood"). Render only: every timing comes from
 * anim/timing.ts (the hero data), never a literal, so a balance retune breaks the timing contract test instead of
 * desyncing the bow from the bolt.
 *
 * - Basics (27 t period, release on the bolt spawn at 8 t): A standing draw with a recoil lean, B quick-draw side hop
 *   with a tail flick (alternating sides), C deep crouch shot; the draw opens the chest to the camera and the release
 *   flings the string paw out. Steady Paw (every 4th basic pierces): a knee-drop shot with a back-foot slide, predicted from
 *   the hero's own bolts (STEADY, kept in sync by skillfx/sage.ts on every real pierce bolt).
 * - Q Volley: a short coil to the side, then ONE square-on release with the bow rolled flat on the cast tick (the sim
 *   spawns all arrows at once) and a ±0.1 rad shudder; the big chest motion is the follow-through recoil hop.
 *   Level-6 Piercing Shot (branch): a one-knee lance shot with a long recoil skid.
 * - Every recoil recovers with a STEP (a small root hop and the back leg swinging through), kneeling ones rise first:
 *   the root never glides back over planted feet.
 * - Every ability hands over within HANDOVER (0.25 s) of its cast, so a basic woven right after it plays its own draw.
 * - W Sun Snare: kneeling underhand toss on the cast, a fast full twirl, a paw snap at the trap (its arm is skill FX).
 * - E Hop Back: a backflip, 0.9 turn at a constant rate over the dash, the last 0.1 easing out in a 70 ms landing;
 *   the arc peaks at 0.95 m early (45% of the dash) and is down to 0.25 m when the dash stops, so she lands on it.
 * - R Moonshot: the 30 t windup as kneel → full draw with a 25° back lean → dead-still hold; release on the cast tick
 *   with a recoil slide and a bow-arm overshoot.
 * - Death (bow arm flung, half-turn, the knees buckle, falls back), respawn (drop into a crouch, bow flourish), victory (an arrow
 *   straight up, a backflip, the catch), emote, idle and fidgets.
 *
 * Joint conventions (anim/common.ts): thigh x < 0 forward, knee x > 0 bends, shoulder x < 0 raises the arm, chest y
 * twists (+ to her left), chest x > 0 leans forward, head x < 0 chin up. Root: fwd / side / up m, yaw / pitch / roll
 * turns (pitch + = front flip), sx / sy factors. She holds the bow in the LEFT paw ('bowIdle', 'aim').
 */
import { HEROES } from '../../data/heroes';
import { BASIC_CONTACT, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

const T = SIM_TIMING.sage;
/** Basic release (s): the bolt spawns BASIC_WINDUP ticks after the swing starts. */
const C = BASIC_CONTACT;
/** Basic period (s): a basic clip must hand over before the next swing starts. */
const PERIOD = T.period * TICK_S;
/** Hop Back air time (s): the dash's travel ticks. */
const HOP_AIR = T.slots.e.dashTicks * TICK_S;
/** Moonshot windup (s). */
const MOON_WIND = T.slots.r.windup * TICK_S;
/** Sun Snare arm (s). */
const SNARE_ARM = T.slots.w.arm * TICK_S;
/** The peek coil before an instant cast (≈ 53 ms of lookahead). */
const PEEK = 0.06;

type D = Partial<Record<BoneName, BoneDelta>>;
const IDLE = 'bowIdle';

// ------------------------------------------------------------------------------------------------ draw poses

/** Nocking: the string paw comes up to the bow, the chest starts to open. */
const NOCK: D = { chest: [0.04, 0.22, 0], head: [0, -0.1, 0], shoulderR: [-0.3, 0, 0.3], elbowR: [-0.5, 0, 0] };
/** Full draw, pushed for the game camera (behind and above): the chest opens the draw side to the camera, the string
 *  elbow pokes out of the silhouette behind her head, the head tilts onto the arrow. */
const DRAW: D = { chest: [-0.08, 0.5, 0], head: [0.06, -0.35, 0.14], shoulderR: [0.6, 0, 0.6], elbowR: [-1.5, 0, 0], shoulderL: [-0.15, 0, 0] };
/** Release: the string paw flung out wide (overshoot key in each clip), the bow arm kicks up, the chest rocks back. */
const LOOSE: D = { chest: [-0.18, 0.3, 0], head: [-0.06, -0.1, 0], shoulderR: [0.7, 0, 1.5], elbowR: [0.15, 0, 0], shoulderL: [-0.4, 0, 0] };
/** The one-frame overshoot of the flung string paw past LOOSE. */
const FLING: D = { ...LOOSE, shoulderR: [0.8, 0, 1.75], elbowR: [0.25, 0, 0] };
/** Low crouch on bent knees. */
const CROUCH: D = { thighL: [-0.55, 0, 0], kneeL: [1.0, 0, 0], thighR: [-0.1, 0, 0], kneeR: [0.9, 0, 0], footL: [-0.4, 0, 0], footR: [-0.5, 0, 0] };
/** Kneel ('kneel' pose) with the bow brought up to the eye: bow arm forward, string paw drawn. */
const KNEEL_AIM: D = { head: [-0.45, -0.1, 0], chest: [-0.12, 0.35, 0], shoulderL: [-1.15, 0, 0.25], elbowL: [0.2, 0, 0], shoulderR: [-0.4, 0, 0.7], elbowR: [-1.1, 0, 0] };
const KNEEL_LOOSE: D = { head: [-0.5, 0, 0], chest: [-0.28, 0.2, 0], shoulderL: [-1.45, 0, 0.25], elbowL: [0.1, 0, 0], shoulderR: [0.4, 0, 1.2], elbowR: [0.1, 0, 0] };

const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;

// ------------------------------------------------------------------------------------------------ basics

/** Basic A: a standing shot. Draw 0–220 ms, hold, release on the bolt with the string paw flung out, a 0.08 m recoil
 *  with a back lean, then a step forward out of it. */
const basicA: ClipDef = {
  id: 'sage.basicA',
  len: 0.66,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.05,
  blendOut: 0.14,
  keys: [
    [0, null, null],
    [0.09, 'aim', NOCK, 'out'],
    [C - 0.05, 'aim', DRAW, 'inOut'],
    [C, 'aim', merge(DRAW, { chest: [-0.1, 0.55, 0] }), 'hold'],
    [C + 0.03, 'aim', FLING, 'expoOut'],
    [C + 0.08, 'aim', LOOSE, 'inOut'],
    [C + 0.24, 'aim', { chest: [-0.06, 0.1, 0], shoulderL: [-0.1, 0, 0] }, 'inOut'],
    [0.55, IDLE, { chest: [0.04, 0, 0], thighR: [-0.45, 0, 0], kneeR: [0.75, 0, 0], thighL: [0.1, 0, 0] }, 'inOut'],
    [0.66, IDLE, null, 'inOut'],
  ],
  root: {
    // the recoil holds, then a step forward (a root hop, the back leg swinging through), never a glide
    fwd: [[0, 0], [C - 0.05, 0.04, 'inOut'], [C, 0.04], [C + 0.06, -0.08, 'expoOut'], [C + 0.22, -0.08], [0.6, 0, 'inOut'], [0.66, 0]],
    up: [[0, 0], [C + 0.22, 0], [0.54, 0.05, 'out'], [0.6, 0, 'in'], [0.66, 0]],
    pitch: [[0, 0], [C, 0.01, 'inOut'], [C + 0.05, -0.03, 'expoOut'], [C + 0.24, -0.03], [0.5, 0, 'inOut'], [0.66, 0]],
    sy: [[0, 1], [C - 0.05, 0.92, 'inOut'], [C, 0.92], [C + 0.05, 1.08, 'expoOut'], [C + 0.25, 1, 'inOut']],
    roll: [[0, 0], [C - 0.05, -0.015, 'inOut'], [C + 0.06, 0.02, 'expoOut'], [0.66, 0, 'inOut']],
  },
  markers: { coil: 0.06, draw: C - 0.05, contact: C, end: 0.66 },
  warp: [['contact', 'release']],
  cues: [['contact', 'whoosh', 'S'], ['contact', 'fx', 'loose'], [0.6, 'footstep']],
  cancel: 'afterContact',
};

/** Basic B: a quick-draw side hop (0.3 m), the tail flicking the other way. Built for both sides (B and BL); the
 *  combo alternates them so she does not hop the same way every cycle. */
function basicB(id: string, side: 1 | -1): ClipDef {
  return {
    id,
    len: 0.64,
    mask: 'full',
    mode: 'override',
    prio: Prio.Basic,
    blendIn: 0.04,
    blendOut: 0.14,
    keys: [
      [0, null, null],
      [0.08, 'aim', merge(NOCK, { thighL: [0, 0, 0.35 * side], thighR: [0, 0, 0.35 * side], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0], tail0: [0, 0.7 * side, 0], tail1: [0, 0.4 * side, 0] }), 'out'],
      [0.16, 'aim', merge(DRAW, { chest: [-0.05, 0.55, 0.1 * side], tail0: [0, -0.5 * side, 0], tail1: [0, -0.4 * side, 0] }), 'out'],
      [C, 'aim', merge(DRAW, { chest: [-0.08, 0.55, 0.08 * side], tail0: [0, -0.6 * side, 0] }), 'hold'],
      [C + 0.03, 'aim', merge(FLING, { tail0: [0, 0.5 * side, 0], tail1: [0, 0.5 * side, 0] }), 'expoOut'],
      [C + 0.08, 'aim', merge(LOOSE, { tail0: [0, 0.4 * side, 0], tail1: [0, 0.4 * side, 0] }), 'inOut'],
      [C + 0.22, 'aim', { chest: [-0.05, 0.1, 0] }, 'inOut'],
      [0.64, IDLE, null, 'inOut'],
    ],
    root: {
      side: [[0, 0], [0.07, 0.14 * side, 'in'], [0.15, 0.3 * side, 'out'], [C, 0.3 * side], [C + 0.08, 0.3 * side], [0.64, 0, 'inOut']],
      up: [[0, 0], [0.07, 0.26, 'out'], [0.15, 0, 'in'], [0.64, 0]],
      roll: [[0, 0], [0.07, -0.03 * side, 'out'], [0.17, 0.02 * side, 'out'], [C + 0.1, 0, 'inOut'], [0.64, 0]],
      fwd: [[0, 0], [C, 0], [C + 0.06, -0.08, 'expoOut'], [0.64, 0, 'inOut']],
    },
    markers: { coil: 0.04, step: 0.15, contact: C, end: 0.64 },
    warp: [['contact', 'release']],
    cues: [[0.15, 'footstep'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'loose']],
    cancel: 'afterContact',
  };
}

/** Basic C: a deep crouch shot (sy 0.7), then a spring back up. */
const basicC: ClipDef = {
  id: 'sage.basicC',
  len: 0.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.05,
  blendOut: 0.14,
  keys: [
    [0, null, null],
    [0.12, 'aim', merge(NOCK, CROUCH, { chest: [0.22, 0.25, 0], head: [-0.25, 0, 0] }), 'out'],
    [C - 0.03, 'aim', merge(DRAW, CROUCH, { chest: [0.14, 0.5, 0], head: [-0.22, -0.3, 0.14] }), 'inOut'],
    [C, 'aim', merge(DRAW, CROUCH, { chest: [0.12, 0.52, 0], head: [-0.22, -0.3, 0.14] }), 'hold'],
    [C + 0.03, 'aim', merge(FLING, CROUCH, { chest: [0.0, 0.3, 0] }), 'expoOut'],
    [C + 0.08, 'aim', merge(LOOSE, CROUCH, { chest: [0.0, 0.25, 0] }), 'inOut'],
    [C + 0.22, 'aim', { chest: [-0.05, 0, 0], kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0] }, 'out'],
    [0.7, IDLE, null, 'inOut'],
  ],
  root: {
    sy: [[0, 1], [0.12, 0.7, 'out'], [C, 0.7], [C + 0.05, 0.84, 'expoOut'], [C + 0.2, 1.1, 'out'], [0.7, 1, 'inOut']],
    up: [[0, 0], [C + 0.08, 0], [C + 0.2, 0.2, 'out'], [C + 0.32, 0, 'in'], [0.7, 0]],
    // the spring back up carries the return: the root comes forward while the feet are off the ground
    fwd: [[0, 0], [C, 0.04], [C + 0.06, -0.12, 'expoOut'], [C + 0.1, -0.12], [C + 0.32, 0, 'inOut'], [0.7, 0]],
  },
  markers: { coil: 0.06, contact: C, end: 0.7 },
  warp: [['contact', 'release']],
  cues: [[0.12, 'dust'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'loose'], [C + 0.32, 'footstep']],
  cancel: 'afterContact',
};

/** Steady Paw (every 4th basic pierces 7 m): a knee-drop shot, back-foot slide, recoil skid, ears pinned. */
const steady: ClipDef = {
  id: 'sage.steady',
  len: 0.78,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.05,
  blendOut: 0.16,
  keys: [
    [0, null, null],
    [0.1, 'kneel', merge(KNEEL_AIM, { shoulderR: [-0.6, 0, 0.3], elbowR: [-0.8, 0, 0] }), 'out'],
    [C - 0.04, 'kneel', KNEEL_AIM, 'inOut'],
    [C, 'kneel', merge(KNEEL_AIM, { shoulderR: [-0.35, 0, 0.8] }), 'hold'],
    [C + 0.05, 'kneel', KNEEL_LOOSE, 'expoOut'],
    [C + 0.3, 'kneel', merge(KNEEL_AIM, { shoulderR: [0.1, 0, 0.6], elbowR: [-0.3, 0, 0] }), 'inOut'],
    // rise out of the kneel, then step: the back leg swings through under the root hop
    [0.67, IDLE, { chest: [0.06, 0, 0], thighR: [-0.5, 0, 0], kneeR: [0.85, 0, 0], thighL: [0.1, 0, 0] }, 'inOut'],
    [0.78, IDLE, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.1, 0.06, 'out'], [C, 0.04], [C + 0.07, -0.22, 'expoOut'], [0.6, -0.22], [0.74, 0, 'inOut'], [0.78, 0]],
    up: [[0, 0], [0.6, 0], [0.67, 0.06, 'out'], [0.74, 0, 'in'], [0.78, 0]],
    sy: [[0, 1], [0.08, 0.9, 'out'], [0.14, 1], [C, 1], [C + 0.04, 1.08, 'expoOut'], [C + 0.2, 1, 'inOut']],
  },
  markers: { coil: 0.06, drop: 0.1, contact: C, end: 0.78 },
  warp: [['contact', 'release']],
  cues: [['drop', 'dust'], ['drop', 'earsBack'], ['contact', 'earsBack'], ['contact', 'whoosh', 'M'], ['contact', 'fx', 'steady'], [C + 0.07, 'dust'], [0.74, 'footstep']],
  cancel: 'afterContact',
};

/** Shots since the last Steady Paw pierce, per entity id (skillfx/sage.ts counts the bolts and resyncs on a pierce). */
export const STEADY = new Int16Array(16);
const EVERY_NTH = HEROES.sage.passive.everyNth ?? 4;
/** The next basic is the pierce when the shots since the last one reach everyNth − 1 (never allocates). */
const basicPick = (ctx: MoveCtx): ClipDef | null => (ctx.id >= 0 && ctx.id < STEADY.length && STEADY[ctx.id] % EVERY_NTH === EVERY_NTH - 1 ? steady : null);

// ------------------------------------------------------------------------------------------------ Q

const FAN_HALF = 0.45;
/** The release shudder (rad) of the chest around square-on. */
const SHUDDER = 0.1;
/**
 * Every ability clip hands over (its blend-out starts, so LayerStack takes a lower-priority basic) by HANDOVER after
 * its cast: Sage weaves autos right after a cast, and a basic refused under a long ability tail would loose its arrow
 * with no draw and no release. The step-out keys sit inside the blend-out.
 */
const HANDOVER = 0.25;
const Q_OUT = 0.14;
const Q_LEN = PEEK + HANDOVER + Q_OUT;
/** Volley: a coil to the side, one square-on flat-bow release on the cast tick (the sim fires every arrow at once)
 *  with a ±0.1 rad shudder, a quick recoil hop back, a step forward out of the landing in the blend-out. */
const volley: ClipDef = {
  id: 'sage.q',
  len: Q_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: Q_OUT,
  keys: [
    [0, null, null],
    [PEEK * 0.5, 'aim', merge(DRAW, { chest: [-0.03, 0.5 + FAN_HALF * 0.45, 0], pawL: [0, 0, 1.3], shoulderL: [-0.25, 0, 0] }), 'out'],
    [PEEK, 'aim', merge(DRAW, { chest: [-0.05, 0.3, 0], pawL: [0, 0, 1.3], shoulderL: [-0.25, 0, 0] }), 'in'],
    [PEEK + 0.03, 'aim', merge(FLING, { chest: [-0.12, 0.18 + SHUDDER, 0], pawL: [0, 0, 1.3], shoulderL: [-0.3, 0, 0] }), 'expoOut'],
    [PEEK + 0.06, 'aim', merge(LOOSE, { chest: [-0.14, 0.18 - SHUDDER, 0], pawL: [0, 0, 1.3], shoulderL: [-0.3, 0, 0] }), 'inOut'],
    [PEEK + 0.08, 'aim', merge(LOOSE, { chest: [-0.14, 0.18, 0], pawL: [0, 0, 1.3], shoulderL: [-0.3, 0, 0] }), 'inOut'],
    [PEEK + 0.15, 'aim', { chest: [-0.3, 0, 0], head: [-0.25, 0, 0], thighL: [-0.7, 0, 0], kneeL: [1.0, 0, 0], thighR: [-0.2, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-0.6, 0, 0.3], shoulderR: [-0.3, 0, -0.6] }, 'out'],
    [PEEK + 0.23, 'aim', merge(CROUCH, { chest: [0.15, 0, 0] }), 'in'],
    [PEEK + 0.31, IDLE, { chest: [0.06, 0, 0], thighR: [-0.55, 0, 0], kneeR: [0.85, 0, 0], thighL: [0.12, 0, 0] }, 'inOut'],
    [Q_LEN, IDLE, null, 'inOut'],
  ],
  root: {
    // the recoil travels in the hop's air time; the return is a step (root hop, back leg through), not a glide
    fwd: [[0, 0], [PEEK, 0.02], [PEEK + 0.07, -0.02], [PEEK + 0.17, -0.26, 'out'], [PEEK + 0.23, -0.27], [PEEK + 0.35, 0, 'inOut'], [Q_LEN, 0]],
    up: [[0, 0], [PEEK + 0.07, 0], [PEEK + 0.14, 0.28, 'out'], [PEEK + 0.23, 0, 'in'], [PEEK + 0.26, 0], [PEEK + 0.31, 0.06, 'out'], [PEEK + 0.35, 0, 'in'], [Q_LEN, 0]],
    pitch: [[0, 0], [PEEK + 0.07, 0], [PEEK + 0.14, -0.05, 'out'], [PEEK + 0.23, 0.02, 'in'], [PEEK + 0.33, 0, 'inOut'], [Q_LEN, 0]],
  },
  markers: { coil: 0.02, contact: PEEK, shudder: PEEK + 0.03, hop: PEEK + 0.08, land: PEEK + 0.23, step: PEEK + 0.35, end: Q_LEN },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M'], ['shudder', 'whoosh', 'S'], ['hop', 'dust'], ['land', 'land'], ['land', 'dust'], ['step', 'footstep']],
  cancel: 'afterContact',
};

const L_OUT = 0.16;
const L_LEN = PEEK + HANDOVER + L_OUT;
/** Piercing Shot (level-6 branch): drops to one knee on the peek, bow vertical, a recoil skid back, then rises. */
const lance: ClipDef = {
  id: 'sage.qLance',
  len: L_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  blendOut: L_OUT,
  keys: [
    [0, null, null],
    [PEEK, 'kneel', merge(KNEEL_AIM, { shoulderR: [-0.3, 0, 0.9], elbowR: [-1.2, 0, 0] }), 'out'],
    [PEEK + 0.03, 'kneel', merge(KNEEL_LOOSE, { shoulderR: [0.5, 0, 1.45] }), 'expoOut'],
    [PEEK + 0.07, 'kneel', KNEEL_LOOSE, 'inOut'],
    [PEEK + 0.15, 'kneel', merge(KNEEL_LOOSE, { chest: [-0.36, 0.15, 0], head: [-0.55, 0, 0] }), 'out'],
    // rise out of the kneel, then step back up to the line: back leg swinging through under a root hop
    [PEEK + 0.28, IDLE, { chest: [0.08, 0, 0], thighR: [-0.55, 0, 0], kneeR: [0.9, 0, 0], thighL: [0.1, 0, 0] }, 'inOut'],
    [L_LEN, IDLE, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [PEEK, 0.04], [PEEK + 0.08, -0.28, 'expoOut'], [PEEK + 0.17, -0.28], [PEEK + 0.36, 0, 'inOut'], [L_LEN, 0]],
    up: [[0, 0], [PEEK + 0.18, 0], [PEEK + 0.27, 0.07, 'out'], [PEEK + 0.36, 0, 'in'], [L_LEN, 0]],
    sy: [[0, 1], [PEEK * 0.6, 0.88, 'out'], [PEEK, 0.94], [PEEK + 0.04, 1.08, 'expoOut'], [PEEK + 0.22, 1, 'inOut']],
  },
  markers: { coil: 0.02, contact: PEEK, skid: PEEK + 0.08, step: PEEK + 0.36, end: L_LEN },
  warp: [['contact', 'cast']],
  cues: [['coil', 'earsBack'], ['contact', 'whoosh', 'L'], ['contact', 'shake', 1], ['contact', 'punch', 0.02], ['skid', 'dust'], [PEEK + 0.17, 'dust'], ['step', 'footstep']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W

const W_OUT = 0.16;
const W_LEN = PEEK + HANDOVER + W_OUT;
/** The twirl ends by PEEK + 0.2: a W → E kite cross-fades the clip out, and a twirl still running then would unwind
 *  backwards over the E clip's blend-in (the fade scales the root yaw by the clip's weight). */
const SPIN_END = PEEK + 0.2;
/**
 * Sun Snare: kneeling underhand toss on the cast, a fast full twirl, landing pointed at the trap. The trap's arm
 * (15 t after the cast) is past the hand-over, so it is shown by the skill FX (the petals close, a flash and the arm
 * shock on onZone 'arm'), not by a body key: a long W tail would refuse the basics she weaves after the toss.
 */
const snare: ClipDef = {
  id: 'sage.w',
  len: W_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: W_OUT,
  keys: [
    [0, null, null],
    [PEEK, 'kneel', { chest: [0.25, 0.1, 0], head: [-0.4, 0, 0], shoulderR: [-1.5, 0, -0.1], elbowR: [-0.1, 0, 0], shoulderL: [-0.3, 0, 0.5] }, 'out'],
    [PEEK + 0.08, IDLE, { chest: [-0.12, 0, 0], head: [-0.2, 0, 0], shoulderR: [-0.4, 0, -1.2], shoulderL: [-0.4, 0, 1.2], thighL: [-0.4, 0, 0], kneeL: [0.6, 0, 0] }, 'out'],
    [SPIN_END - 0.02, IDLE, { chest: [-0.1, 0, 0], shoulderR: [-0.3, 0, -1.1], shoulderL: [-0.3, 0, 1.1] }, 'lin'],
    // the snap: lands pointing at the trap
    [SPIN_END + 0.06, IDLE, { chest: [-0.06, 0.2, 0], head: [-0.1, 0.25, 0], shoulderR: [-1.3, 0, -0.3], elbowR: [-0.2, 0, 0] }, 'backBig'],
    [W_LEN, IDLE, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [PEEK + 0.03, 0], [SPIN_END, 1, 'inOut'], [SPIN_END + 0.001, 0, 'step']],
    up: [[0, 0], [PEEK + 0.04, 0], [PEEK + 0.12, 0.24, 'out'], [SPIN_END, 0, 'in'], [W_LEN, 0]],
    sy: [[0, 1], [PEEK, 0.9, 'out'], [PEEK + 0.07, 1.06, 'out'], [PEEK + 0.14, 1, 'inOut']],
  },
  markers: { coil: 0.02, contact: PEEK, spin: PEEK + 0.03, snap: SPIN_END, end: W_LEN },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'S'], ['spin', 'whoosh', 'M'], ['snap', 'land']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ E

const E0 = 0.07;
const E1 = E0 + HOP_AIR;
/** Touch-down 70 ms (≈ 2 frames at 30 Hz) after the dash stops: she lands where the sim put her. */
const E2 = E1 + 0.07;
const E_OUT = 0.16;
/** Hands over right after the touch-down (≈ cast + 0.26 s): the landing crouch rises in the blend-out. */
const ELEN = E2 + 0.02 + E_OUT;
/** Apex 0.95 m at 45% of the dash, 0.25 m left when the dash stops. */
const E_APEX = E0 + HOP_AIR * 0.45;
/** Hop Back: backflip, 0.9 turn at a constant rate over the dash, the last 0.1 easing out in the 70 ms landing. */
const hop: ClipDef = {
  id: 'sage.e',
  len: ELEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  blendOut: E_OUT,
  keys: [
    [0, null, null],
    [E0, IDLE, { chest: [0.25, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], shoulderL: [0.4, 0, 0.3], shoulderR: [0.4, 0, -0.3] }, 'out'],
    [E0 + HOP_AIR * 0.35, IDLE, { chest: [-0.4, 0, 0], head: [-0.4, 0, 0], thighL: [-1.4, 0, 0], thighR: [-1.4, 0, 0], kneeL: [1.9, 0, 0], kneeR: [1.9, 0, 0], shoulderL: [-1.2, 0, 0.4], shoulderR: [-1.0, 0, -0.5] }, 'out'],
    [E0 + HOP_AIR * 0.7, 'aim', { chest: [-0.3, 0, 0], thighL: [-1.0, 0, 0], thighR: [-0.4, 0, 0], kneeL: [1.2, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-0.4, 0, 0] }, 'inOut'],
    [E1, IDLE, { chest: [0.1, 0, 0], thighL: [-0.8, 0, 0], thighR: [-0.8, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], shoulderL: [-0.8, 0, 0.6], shoulderR: [-0.6, 0, -0.8] }, 'inOut'],
    [E2, IDLE, merge(CROUCH, { chest: [0.35, 0, 0], head: [-0.3, 0, 0], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.3, 0, -1.1] }), 'in'],
    [ELEN, 'aim', merge(CROUCH, { chest: [0.2, 0.15, 0] }), 'out'],
  ],
  root: {
    // one continuous flip: a constant rate over the dash ('lin'), the last 0.1 turn easing out at about the same
    // rate; the full turn wraps to 0 right after the touch-down (a −1 held into the blend-out would unwind the flip)
    pitch: [[0, 0], [E0, 0], [E1, -0.9, 'lin'], [E2, -1, 'out'], [E2 + 0.001, 0, 'step']],
    up: [[0, 0], [E0, 0], [E_APEX, 0.95, 'out'], [E1, 0.25, 'in'], [E2, 0, 'out'], [ELEN, 0]],
    sy: [[0, 1], [E0 * 0.6, 0.8, 'out'], [E0 + 0.04, 1.12, 'out'], [E1, 1], [E2 + 0.01, 0.75, 'in'], [ELEN, 1, 'back']],
  },
  markers: { takeoff: E0, contact: E0, apex: E_APEX, land: E1, touch: E2, end: ELEN },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'dust'], ['takeoff', 'earsBack'], ['takeoff', 'whoosh', 'L'], ['takeoff', 'sfx', 'flip'], ['takeoff', 'ghost'], ['takeoff', 'fx', 'gust'], ['touch', 'land'], ['touch', 'dust'], ['touch', 'fx', 'skid']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ R

const R0 = 0;
const R1 = R0 + MOON_WIND;
const R_OUT = 0.16;
const R_LEN = R1 + HANDOVER + R_OUT;
/** Moonshot: windupStart → cast = kneel and plant, full draw with a 25° back lean, a dead-still hold; recoil on the
 *  cast, a rise and a step out of it in the blend-out. */
const moonshot: ClipDef = {
  id: 'sage.r',
  len: R_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.06,
  blendOut: R_OUT,
  keys: [
    [0, null, null],
    [MOON_WIND * 0.3, 'kneel', merge(KNEEL_AIM, { chest: [0.1, 0.2, 0], shoulderR: [-0.9, 0, 0.2], elbowR: [-1.4, 0, 0] }), 'backBig'],
    [MOON_WIND * 0.6, 'kneel', merge(KNEEL_AIM, { chest: [-0.25, 0.35, 0], shoulderR: [-0.1, 0, 0.9] }), 'inOut'],
    [MOON_WIND * 0.9, 'kneel', merge(KNEEL_AIM, { chest: [-0.44, 0.38, 0], head: [-0.35, -0.05, 0], shoulderL: [-1.35, 0, 0.3], shoulderR: [0.15, 0, 1.15], elbowR: [-1.3, 0, 0] }), 'out'],
    [R1, 'kneel', merge(KNEEL_AIM, { chest: [-0.45, 0.38, 0], head: [-0.36, -0.05, 0], shoulderL: [-1.36, 0, 0.3], shoulderR: [0.17, 0, 1.17], elbowR: [-1.32, 0, 0] }), 'hold'],
    [R1 + 0.05, 'kneel', merge(KNEEL_LOOSE, { chest: [-0.5, 0.1, 0], shoulderL: [-1.9, 0, 0.3], shoulderR: [0.8, 0, 1.4] }), 'expoOut'],
    [R1 + 0.17, 'kneel', merge(KNEEL_AIM, { chest: [-0.1, 0.2, 0], shoulderL: [-1.0, 0, 0.3], shoulderR: [0.2, 0, 0.6], elbowR: [-0.4, 0, 0] }), 'back'],
    // rise out of the kneel, then step: the back leg swings through under a root hop
    [R1 + 0.3, IDLE, { chest: [0.06, 0, 0], thighR: [-0.55, 0, 0], kneeR: [0.9, 0, 0], thighL: [0.1, 0, 0] }, 'inOut'],
    [R_LEN, IDLE, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [R1, 0], [R1 + 0.06, -0.28, 'expoOut'], [R1 + 0.2, -0.28], [R1 + 0.36, 0, 'inOut'], [R_LEN, 0]],
    up: [[0, 0], [R1 + 0.2, 0], [R1 + 0.28, 0.07, 'out'], [R1 + 0.36, 0, 'in'], [R_LEN, 0]],
    sy: [[0, 1], [MOON_WIND * 0.25, 0.86, 'out'], [MOON_WIND * 0.32, 0.95, 'inOut'], [R1, 0.95], [R1 + 0.04, 1.1, 'expoOut'], [R1 + 0.25, 1, 'inOut']],
  },
  markers: { coil: R0, plant: MOON_WIND * 0.3, charge1: MOON_WIND * 0.5, charge2: MOON_WIND * 0.9, contact: R1, step: R1 + 0.36, end: R_LEN },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [
    ['plant', 'dust'],
    ['plant', 'earsBack'],
    ['charge1', 'fx', 'charge1'],
    ['charge1', 'earsBack'],
    ['charge2', 'fx', 'charge2'],
    ['charge2', 'earsBack'],
    ['contact', 'earsBack'],
    ['contact', 'ghost'],
    ['contact', 'whoosh', 'L'],
    ['contact', 'shake', 3],
    ['contact', 'punch', 0.05],
    ['contact', 'dust'],
    ['step', 'footstep'],
  ],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ death, respawn, flair

/** Death: hit back, the bow arm flung up, a half-turn, falls on her back. */
const death: ClipDef = {
  id: 'sage.death',
  len: 1.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.12, IDLE, { chest: [-0.55, 0.3, 0.2], head: [-0.6, 0, 0], shoulderL: [-2.6, 0, 0.6], elbowL: [0.1, 0, 0], shoulderR: [-0.4, 0, -0.9], thighR: [0.4, 0, 0], kneeL: [0.3, 0, 0] }, 'expoOut'],
    [0.42, IDLE, { chest: [-0.3, -0.3, -0.15], head: [-0.3, 0, 0], shoulderL: [-1.6, 0, 1.2], shoulderR: [-0.6, 0, -1.0], thighL: [0.3, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] }, 'inOut'],
    // the knees buckle and she tips back: the fall has weight before the back hits (≈ 0.75 s)
    [0.6, IDLE, { chest: [-0.6, -0.3, -0.15], head: [-0.45, 0, 0], shoulderL: [-1.9, 0, 1.3], shoulderR: [-0.9, 0, -1.1], thighL: [-0.5, 0, 0], thighR: [-0.4, 0, 0], kneeL: [1.4, 0, 0], kneeR: [1.4, 0, 0] }, 'inOut'],
    [1.0, 'faint', null, 'out'],
  ],
  root: {
    fwd: [[0, 0], [0.12, -0.22, 'expoOut'], [0.42, -0.4, 'inOut'], [0.75, -0.5, 'in'], [1.0, -0.5]],
    yaw: [[0, 0], [0.14, 0], [0.44, 0.5, 'inOut'], [1.0, 0.5]],
    pitch: [[0, 0], [0.42, -0.03, 'inOut'], [0.6, -0.12, 'in'], [0.78, -0.04, 'out'], [1.0, 0, 'inOut']],
    up: [[0, 0], [0.16, 0.22, 'out'], [0.42, 0, 'in'], [1.0, 0]],
    sy: [[0, 1], [0.6, 0.94, 'inOut'], [0.76, 0.88, 'in'], [0.86, 1, 'out']],
  },
  markers: { contact: 0, buckle: 0.6, thud: 0.75, end: 1.0 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['contact', 'fx', 'reset'], ['thud', 'land'], ['thud', 'dust']],
  cancel: 'none',
};

/** Respawn: drop from 1.2 m into a crouch, then a bow flourish (raise and twirl). */
const respawn: ClipDef = {
  id: 'sage.respawn',
  len: 1.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, IDLE, { thighL: [-0.6, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-2.2, 0, 0.4], shoulderR: [-1.6, 0, -0.6] }],
    [0.32, IDLE, merge(CROUCH, { chest: [0.35, 0, 0], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.3, 0, -1.0] }), 'in'],
    [0.5, IDLE, merge(CROUCH, { chest: [0.25, 0, 0] }), 'out'],
    [0.72, 'aim', { chest: [-0.15, 0, 0], head: [-0.25, 0, 0], shoulderL: [-1.0, 0, 0] }, 'back'],
    [1.0, IDLE, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.32, 0, 'in'], [1.0, 0]],
    yaw: [[0, 0], [0.5, 0], [0.75, 1, 'inOut'], [0.751, 0, 'step']],
    // takeoff stretch only: the 'in' landing fires RootState's landKick, which does the squash
    sy: [[0, 1.12], [0.28, 1.08], [0.32, 1, 'in']],
  },
  markers: { land: 0.32, flourish: 0.5, end: 1.0 },
  warp: [],
  cues: [['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'respawn'], ['flourish', 'whoosh', 'M']],
  cancel: 'any',
};

/**
 * Victory: an arrow loosed straight up, a tucked spin jump while it climbs, and the catch. v3.9 (trailer review: the
 * backflip drew the winning hero upside down, face-down hood and dress up, which read as her falling over or being
 * knocked out at the moment of victory): the jump turns about the vertical axis, so she stays upright.
 */
const victory: ClipDef = {
  id: 'sage.victory',
  len: 2.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.25, 'aim', merge(CROUCH, { chest: [-0.6, 0, 0], head: [-0.7, 0, 0], shoulderL: [-2.4, 0, 0], shoulderR: [-2.2, 0, 0.3], elbowR: [-1.0, 0, 0] }), 'out'],
    [0.4, 'aim', { chest: [-0.6, 0, 0], head: [-0.7, 0, 0], shoulderL: [-2.6, 0, 0], shoulderR: [-1.6, 0, 1.0] }, 'expoOut'],
    [0.62, IDLE, merge(CROUCH, { chest: [0.3, 0, 0] }), 'inOut'],
    [0.85, IDLE, { chest: [-0.4, 0, 0], thighL: [-1.4, 0, 0], thighR: [-1.4, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0], shoulderL: [-1.2, 0, 0.4], shoulderR: [-1.2, 0, -0.4] }, 'out'],
    [1.12, IDLE, merge(CROUCH, { chest: [0.3, 0, 0] }), 'in'],
    [1.45, IDLE, { chest: [-0.2, 0, 0], head: [-0.6, 0, 0], shoulderR: [-2.8, 0, -0.2], elbowR: [-0.2, 0, 0] }, 'out'],
    [1.6, 'cheer', { head: [-0.2, 0, 0] }, 'back'],
    [2.1, 'cheer', null, 'hold'],
  ],
  root: {
    up: [[0, 0], [0.62, 0], [0.86, 1.0, 'out'], [1.1, 0, 'in'], [2.1, 0]],
    yaw: [[0, 0], [0.74, 0], [1.04, 1, 'inOut'], [1.041, 0, 'step']],
    // the landing squash is RootState's landKick (the 'in' landing), not a key
    sy: [[0, 1], [0.25, 0.86, 'out'], [0.4, 1.06, 'expoOut'], [0.6, 0.85], [0.66, 1.12, 'out'], [0.95, 1, 'inOut']],
  },
  markers: { loose: 0.4, takeoff: 0.64, land: 1.12, catch: 1.5, end: 2.1 },
  warp: [],
  cues: [['loose', 'whoosh', 'M'], ['loose', 'fx', 'skyArrow'], ['takeoff', 'sfx', 'flip'], ['land', 'land'], ['land', 'dust'], ['catch', 'sfx', 'tingParry']],
  cancel: 'any',
};

/** Emote: an arrow spun between the fingers, a hop with a full spin, a bow salute. */
const emote: ClipDef = {
  id: 'sage.emote',
  len: 1.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.2, IDLE, { shoulderR: [-1.4, 0, -0.2], elbowR: [-1.4, 0, 0], pawR: [0, 1.5, 0], head: [0.1, 0.2, 0] }, 'out'],
    [0.4, IDLE, { shoulderR: [-1.4, 0, -0.2], elbowR: [-1.4, 0, 0], pawR: [0, -1.5, 0], head: [0.1, 0.2, 0] }, 'inOut'],
    [0.6, IDLE, merge(CROUCH, { chest: [0.3, 0, 0] }), 'inOut'],
    [0.8, IDLE, { chest: [-0.2, 0, 0], shoulderL: [-0.6, 0, 1.4], shoulderR: [-0.6, 0, -1.4] }, 'out'],
    [1.0, 'aim', { chest: [-0.1, 0, 0], head: [-0.2, 0, 0] }, 'in'],
    [1.4, 'aim', null, 'hold'],
  ],
  root: {
    up: [[0, 0], [0.62, 0], [0.8, 0.45, 'out'], [0.98, 0, 'in'], [1.4, 0]],
    yaw: [[0, 0], [0.66, 0], [0.94, 1, 'inOut'], [0.941, 0, 'step']],
    // the landing squash is RootState's landKick (the 'in' landing), not a key
    sy: [[0, 1], [0.6, 0.85, 'out'], [0.66, 1.1], [0.88, 1, 'inOut']],
  },
  markers: { hop: 0.64, land: 0.98, end: 1.4 },
  warp: [],
  cues: [['hop', 'whoosh', 'M'], ['land', 'land']],
  calm: { yaw: 0.25 },
  cancel: 'any',
};

/** Idle: checks the string (a half draw and a pluck), ears swivelling. */
const idle: ClipDef = {
  id: 'sage.idle',
  len: 1.6,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [0.35, 'aim', merge(NOCK, { head: [0.15, -0.2, 0.1] }), 'inOut'],
    [0.7, 'aim', merge(DRAW, { head: [0.2, -0.25, 0.15] }), 'inOut'],
    [0.8, 'aim', merge(NOCK, { head: [0.2, -0.2, 0.1], earL: [0, 0, -0.4] }), 'expoOut'],
    [1.2, IDLE, { head: [-0.1, 0.2, 0], earR: [0, 0, 0.4] }, 'inOut'],
    [1.6, IDLE, null, 'inOut'],
  ],
  markers: { pluck: 0.8, end: 1.6 },
  warp: [],
  cues: [['pluck', 'sfx', 'tingParry']],
  cancel: 'any',
};

/** Fidget: sniffs the wind (head up, turning), ears swivelling independently. */
const sniff: ClipDef = {
  id: 'sage.sniff',
  len: 1.4,
  mask: 'head',
  mode: 'additive',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [0.3, null, { head: [-0.35, 0.35, 0], earL: [-0.4, 0, -0.3] }, 'inOut'],
    [0.6, null, { head: [-0.4, -0.35, 0], earR: [-0.4, 0, 0.3] }, 'inOut'],
    [0.75, null, { head: [-0.45, -0.3, 0.05] }, 'out'],
    [0.85, null, { head: [-0.38, -0.3, -0.05] }, 'out'],
    [1.4, null, null, 'inOut'],
  ],
  markers: {},
  warp: [],
};

/** Level up: a hop with the bow thrust up to the sky. */
const levelUp: ClipDef = {
  id: 'sage.levelUp',
  len: 0.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.1, IDLE, merge(CROUCH, { chest: [0.25, 0, 0] }), 'out'],
    [0.28, IDLE, { chest: [-0.25, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.7, 0, 0.1], shoulderR: [-0.4, 0, -1.2] }, 'out'],
    [0.55, IDLE, { chest: [-0.1, 0, 0], shoulderL: [-2.4, 0, 0.2] }, 'inOut'],
    [0.8, IDLE, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.1, 0], [0.28, 0.4, 'out'], [0.46, 0, 'in'], [0.8, 0]], sy: [[0, 1], [0.1, 0.84], [0.16, 1.1], [0.4, 1, 'inOut']] },
  markers: { end: 0.8 },
  warp: [],
  cues: [[0.46, 'land']],
  cancel: 'any',
};

/** Light bounding lope, bow held low (stride 1.1). */
const gait: GaitProfile = {
  ...DEFAULT_GAIT,
  stride: 1.1,
  bounce: 1.3,
  lean: 1.15,
  hipSway: 0.8,
  headBob: 0.85,
  arms: 'hold',
  variants: { ...DEFAULT_GAIT.variants, haste: { stride: 1.35, bounce: 1.6, lean: 2 } },
};

/** Every clip by name: tests and the dev capture harness reach the ones no slot exposes directly. */
export const SAGE_CLIPS = Object.freeze({ basicA, basicB: basicB('sage.basicB', 1), basicBL: basicB('sage.basicBL', -1), basicC, steady, volley, lance, snare, hop, moonshot, death, respawn, victory, emote, idle, sniff, levelUp });

export const MOVES: MoveSet = {
  hero: 'sage',
  stub: false,
  gait,
  springs: HERO_SPRINGS.sage,
  // A B C A BL C: the side hop alternates every combo cycle
  basic: [basicA, SAGE_CLIPS.basicB, basicC, basicA, SAGE_CLIPS.basicBL, basicC],
  basicPick,
  slots: {
    q: { cast: volley, branch: lance },
    w: { cast: snare },
    e: { cast: hop },
    r: { cast: moonshot },
  },
  idle,
  fidgets: [[sniff, 1]],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Clip-time spans the tests check against the sim (s). */
export const SAGE_SPANS = Object.freeze({ contact: C, period: PERIOD, hopAir: HOP_AIR, moonWind: MOON_WIND, snareArm: SNARE_ARM, peek: PEEK, handover: HANDOVER });
