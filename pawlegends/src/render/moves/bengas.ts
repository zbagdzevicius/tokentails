/**
 * Bengas move set (ANIM-SPEC §14 "Bengas"): the theatre cat. Fire mage with a toasting-fork baton and a flower crown;
 * everything he does is a performance: flicks and pirouettes for basics, a tennis serve into a pirouette for Burnt
 * Toast, a spin-in vogue that freezes on the stun, a grand jeté for Camellia Hop, a bow and a curtain raise for
 * Curtains Up! and one conductor's downbeat on every stage pulse.
 *
 * Every sim-bound number comes from anim/timing.ts (no literals): basics contact at the 8 t windup on the bolt
 * (`release`), W's spin fills exactly the 9 t windup (`windupStart` → `cast`), E's leap is driven by the dash progress
 * (`cast` → `travelEnd`, 6 t / 7 t with Long Hop), R's curtain raise ends on the zone arm (+18 t) and the conducting
 * loop is phased so each downbeat lands on a pulse (+15 t each). Render only.
 *
 * Turns end where they started: every root spin or flip snaps to the equivalent angle near 0 (a zero-length key) as
 * soon as it is complete and the clip is at full weight, so a blend-out or a cancel never unwinds a reverse turn.
 * Instant casts (Q, R, E) have no lead before the cast tick, so their identity reads after contact: Q whips through
 * and keeps the toss paw up as the serve's echo, R starts on the flourish pose.
 *
 * Feet stay planted: the stationary basics and Q move the root at most 0.04 m (there is no foot lock), so the lunge
 * comes from the chest lean and a front-thigh step; the death stagger is a real step back with no root glide.
 *
 * Joint conventions (anim/common.ts): thigh x < 0 swings the leg forward, knee x > 0 bends it, shoulder x < 0 raises
 * the arm forward / up (z: L + / R − out to the side), chest y + twists to his left, chest x > 0 leans forward,
 * head x < 0 lifts the chin. Root: fwd / side / up m, yaw / pitch / roll turns (pitch + = front flip).
 */
import { BASIC_CONTACT, COMMON, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

type Pose = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.bengas.slots;
const C = BASIC_CONTACT;
/** W: the spin-in fills the sim windup exactly (contact = the stun tick). */
export const W_WINDUP_S = T.w.windup * TICK_S;
/** E: nominal air time (the leap is progress-driven; Long Hop's 7 t just plays it slower). */
export const E_AIR_S = T.e.dashTicks * TICK_S;
/** R: the zone arm (first pulse) and the pulse period. */
export const R_ARM_S = T.r.arm * TICK_S;
export const R_EVERY_S = T.r.every * TICK_S;

// ------------------------------------------------------------------------------------------------ shared poses

/** Conductor's ready: baton raised in front, left paw up and open. */
const READY: Pose = { shoulderR: [-1.5, 0, -0.25], elbowR: [-0.9, 0, 0], shoulderL: [-1.2, 0, 0.45], elbowL: [-0.8, 0, 0], chest: [-0.05, 0, 0] };
/** Upbeat: both arms high and spread wide (a V that reads from behind too), chin up. */
const UPBEAT: Pose = { shoulderR: [-2.7, 0, -0.9], elbowR: [-0.3, 0, 0], shoulderL: [-2.5, 0, 0.9], elbowL: [-0.3, 0, 0], chest: [-0.25, 0, 0], head: [-0.25, 0, 0] };
/** Downbeat: arms snap down and out past the body, chest over. */
const DOWNBEAT: Pose = { shoulderR: [-0.9, 0, -0.55], elbowR: [-0.1, 0, 0], shoulderL: [-0.85, 0, 0.5], elbowL: [-0.1, 0, 0], chest: [0.4, 0, 0], head: [0.15, 0, 0] };
/**
 * Theatre bow: a bend at the waist on a straight standing leg (never a collapse: the big chibi head stays above the
 * belly), only the back foot pointed, the baton arm swept out to the side, the left paw on the belly.
 */
const BOW: Pose = {
  chest: [0.35, 0, 0],
  head: [0.1, 0, 0],
  hips: [0, 0, 0],
  shoulderR: [-0.3, 0, -1.5],
  elbowR: [-0.2, 0, 0],
  shoulderL: [0.2, 0, 0.25],
  elbowL: [-1.7, 0, 0],
  thighR: [0.35, 0, 0],
  kneeR: [0.3, 0, 0],
  footR: [0.35, 0, 0],
  thighL: [0, 0, 0],
  kneeL: [0, 0, 0],
};
/** The bow's held key (a touch deeper). */
const BOW_HOLD: Pose = { ...BOW, chest: [0.4, 0, 0] };
/**
 * Vogue (Striking Pose): left arm straight up and out to the side (clear of the big head, so it reads at gameplay
 * distance), baton hand on the hip, a hard hip pop against a counter-rolled chest, a wide stance, chin up and turned.
 */
const VOGUE: Pose = {
  hips: [0, 0.35, 0.3],
  chest: [-0.2, -0.3, -0.25],
  head: [-0.3, -0.4, 0.25],
  shoulderL: [-2.9, 0, 1.1],
  elbowL: [-0.2, 0, 0],
  shoulderR: [0.15, 0, -0.75],
  elbowR: [-1.9, 0, 0],
  thighL: [-0.1, 0.2, 0.15],
  thighR: [-0.4, -0.3, -0.4],
  kneeR: [0.7, 0, 0],
  footR: [0.4, 0, 0],
};
/** Passé tuck for spins: one knee up, arms close. */
const TUCK: Pose = { chest: [0.05, 0.35, 0], shoulderR: [-0.5, 0, 1.1], elbowR: [-1.7, 0, 0], shoulderL: [-0.5, 0, -0.6], elbowL: [-1.6, 0, 0], thighR: [-0.65, 0, 0], kneeR: [1.4, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics (ranged: release at 8 t)

/** A: forehand baton flick (an ember flicked off the fork tip). */
const basicA: ClipDef = {
  id: 'bengas.basicA',
  len: 0.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.62, null, { chest: [-0.05, -0.8, 0], hips: [0, -0.3, 0], head: [0, 0.35, 0], shoulderR: [-0.7, 0, -1.3], elbowR: [-1.4, 0, 0], shoulderL: [-0.6, 0, 0.6], thighR: [0.25, 0, 0], kneeL: [0.25, 0, 0] }, 'out'],
    [C, null, { chest: [0.38, 0.45, 0], hips: [0, 0.2, 0], head: [-0.05, -0.1, 0], shoulderR: [-1.6, 0, -0.65], elbowR: [0, 0, 0], shoulderL: [-0.4, 0, 0.9], thighL: [-0.5, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.3, 0, 0] }, 'expoIn'],
    [C + 0.1, null, { chest: [0.4, 0.7, 0], hips: [0, 0.25, 0], shoulderR: [-1.3, 0, -0.15], elbowR: [-0.2, 0, 0], shoulderL: [-0.3, 0, 1.0], thighL: [-0.45, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.3, 0, 0] }, 'back'],
    [0.8, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.62, -0.02], [C, 0.04, 'expoIn'], [0.8, 0, 'inOut']],
    sy: [[0, 1], [C * 0.62, 0.92, 'out'], [C, 1.07, 'expoIn'], [C + 0.16, 1, 'out']],
  },
  markers: { coil: 0.05, contact: C, end: 0.8 },
  warp: [['contact', 'release']],
  cues: [['coil', 'trailOn', 'pawR'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'b:flick'], [0.6, 'trailOff']],
  cancel: 'afterContact',
};

/** B: pirouette into a backhand flick (one full turn, facing the target again on the release). */
const basicB: ClipDef = {
  id: 'bengas.basicB',
  len: 0.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [0.08, null, TUCK, 'out'],
    [0.2, null, { ...TUCK, shoulderL: [-0.9, 0, 1.2], elbowL: [-0.4, 0, 0], shoulderR: [-0.9, 0, 1.0], elbowR: [-1.1, 0, 0] }, 'lin'],
    [C, null, { chest: [0.18, -0.55, 0], hips: [0, -0.2, 0], head: [0, -0.2, 0], shoulderR: [-1.6, 0, -0.75], elbowR: [0, 0, 0], shoulderL: [-0.4, 0, 0.9], thighL: [-0.2, 0, 0], kneeL: [0.3, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [0.2, -0.75, 0], hips: [0, -0.25, 0], shoulderR: [-1.3, 0, -1.15], elbowR: [-0.1, 0, 0], shoulderL: [-0.3, 0, 0.8] }, 'back'],
    [0.8, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [0.05, 0], [C - 0.015, 1, 'inOut'], [C - 0.015, 0], [0.8, 0]],
    up: [[0, 0], [0.06, 0], [0.15, 0.2, 'out'], [C, 0, 'in'], [0.8, 0]],
    sy: [[0, 1], [0.05, 0.9], [0.12, 1.1, 'out'], [C - 0.02, 0.96, 'in'], [C + 0.15, 1, 'back']],
  },
  markers: { coil: 0.05, contact: C, end: 0.8 },
  warp: [['contact', 'release']],
  cues: [['coil', 'trailOn', 'pawR'], [0.06, 'whoosh', 'S'], ['contact', 'whoosh', 'M'], ['contact', 'fx', 'b:flick'], [0.6, 'trailOff']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

/** C: two-handed conductor's downbeat off a little hop. */
const basicC: ClipDef = {
  id: 'bengas.basicC',
  len: 0.85,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.65, null, { ...UPBEAT, kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0], thighL: [-0.2, 0, 0], thighR: [0.2, 0, 0] }, 'out'],
    [C, null, { ...DOWNBEAT, chest: [0.6, 0, 0], thighL: [-0.75, 0, 0], thighR: [-0.3, 0, 0], kneeL: [1.0, 0, 0], kneeR: [0.8, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { ...DOWNBEAT, chest: [0.62, 0, 0], shoulderR: [-0.75, 0, -0.6], shoulderL: [-0.7, 0, 0.55], thighL: [-0.7, 0, 0], thighR: [-0.28, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.75, 0, 0] }, 'out'],
    [0.85, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.06, 0], [C * 0.62, 0.32, 'out'], [C, 0, 'expoIn'], [0.85, 0]],
    fwd: [[0, 0], [C, 0.04, 'expoIn'], [0.85, 0, 'inOut']],
    sy: [[0, 1], [0.05, 0.86], [0.12, 1.12, 'out'], [C - 0.02, 1.04], [C + 0.03, 0.76, 'expoIn'], [C + 0.22, 1, 'back']],
  },
  markers: { coil: 0.05, contact: C, end: 0.85 },
  warp: [['contact', 'release']],
  cues: [['coil', 'trailOn', 'pawR'], ['contact', 'whoosh', 'M'], ['contact', 'land'], ['contact', 'fx', 'b:downbeat'], [0.65, 'trailOff']],
  cancel: 'afterContact',
};

/** Passive Hot Toast (a basic on a crowd-controlled hero): the flick, then a fire twirl on the follow-through. */
const basicHot: ClipDef = {
  id: 'bengas.basicHot',
  len: 0.85,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.62, null, { chest: [-0.1, -0.8, 0], hips: [0, -0.3, 0], shoulderR: [-0.7, 0, -1.3], elbowR: [-1.4, 0, 0], shoulderL: [-0.6, 0, 0.6], thighR: [0.25, 0, 0] }, 'out'],
    [C, null, { chest: [0.4, 0.45, 0], hips: [0, 0.2, 0], shoulderR: [-1.6, 0, -0.65], elbowR: [0, 0, 0], shoulderL: [-0.4, 0, 0.9], thighL: [-0.5, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.3, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [-0.15, 0, 0], head: [-0.3, 0, 0], shoulderR: [-2.9, 0, -0.1], elbowR: [-0.2, 0, 0], shoulderL: [-1.0, 0, 1.2], thighR: [-0.65, 0, 0], kneeR: [1.4, 0, 0] }, 'out'],
    [C + 0.36, null, { chest: [-0.1, 0, 0], head: [-0.25, 0, 0], shoulderR: [-2.8, 0, 0.2], elbowR: [-0.3, 0, 0], shoulderL: [-1.1, 0, 1.2], thighR: [-0.6, 0, 0], kneeR: [1.3, 0, 0] }, 'lin'],
    [0.85, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C, 0.04, 'expoIn'], [0.85, 0, 'inOut']],
    yaw: [[0, 0], [C + 0.06, 0], [C + 0.32, 1, 'inOut'], [C + 0.32, 0], [0.85, 0]],
    up: [[0, 0], [C + 0.08, 0], [C + 0.2, 0.15, 'out'], [C + 0.34, 0, 'in'], [0.85, 0]],
    sy: [[0, 1], [C * 0.62, 0.92, 'out'], [C, 1.07, 'expoIn'], [C + 0.34, 0.9, 'in'], [C + 0.5, 1, 'back']],
  },
  markers: { coil: 0.05, contact: C, end: 0.85 },
  warp: [['contact', 'release']],
  cues: [['coil', 'trailOn', 'pawR'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'b:flick'], [C + 0.1, 'fx', 'b:hot'], [C + 0.1, 'sfx', 'fwoomp'], [0.7, 'trailOff']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ Q Burnt Toast (instant skillshot)

/**
 * Tennis serve, impact-first: the cast has no lead (an instant cast binds contact to the cast tick, so a coil would be
 * skipped or snapped), so the clip opens on the whip (baton high and out, the toss paw still up as the serve's echo),
 * whips through across the body with the back leg kicking up behind, recoils into a passé and pirouettes once.
 */
const Q_C = 0.03;
const Q_SPIN = Q_C + 0.2;
const Q_LAND = Q_C + 0.46;
const q: ClipDef = {
  id: 'bengas.q',
  len: 0.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: [
    [0, null, null],
    [Q_C, null, { chest: [0.5, 0.55, 0], hips: [0, 0.3, 0], head: [0.05, -0.2, 0], shoulderL: [-2.6, 0, 0.35], elbowL: [-0.2, 0, 0], shoulderR: [-2.3, 0, -0.6], elbowR: [0, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.55, 0, 0], thighR: [0.4, 0, 0] }, 'expoIn'],
    [Q_C + 0.08, null, { chest: [0.72, 0.85, 0], head: [0.15, -0.1, 0], shoulderR: [-0.6, 0, 0.9], elbowR: [-0.2, 0, 0], shoulderL: [-1.9, 0, 0.8], elbowL: [-0.3, 0, 0], thighR: [0.85, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.3, 0, 0], kneeL: [0.35, 0, 0] }, 'out'],
    [Q_SPIN, null, { chest: [-0.15, 0.2, 0], head: [-0.2, 0, 0], shoulderR: [-1.6, 0, -1.1], elbowR: [-0.3, 0, 0], shoulderL: [-1.5, 0, 1.0], elbowL: [-0.3, 0, 0], thighR: [-0.7, 0, 0], kneeR: [1.4, 0, 0] }, 'back'],
    [Q_LAND - 0.04, null, { chest: [-0.1, 0, 0], head: [-0.15, 0, 0], shoulderR: [-1.4, 0, -1.2], elbowR: [-0.3, 0, 0], shoulderL: [-1.4, 0, 1.2], elbowL: [-0.3, 0, 0], thighR: [-0.75, 0, 0], kneeR: [1.4, 0, 0] }, 'lin'],
    [Q_LAND + 0.08, null, { kneeL: [0.45, 0, 0], kneeR: [0.45, 0, 0], thighL: [-0.2, 0, 0], thighR: [-0.2, 0, 0], shoulderR: [-0.7, 0, -0.7], shoulderL: [-0.6, 0, 0.7] }, 'in'],
    [0.8, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [Q_C, 0.03, 'expoIn'], [Q_C + 0.12, 0.04, 'out'], [Q_LAND, 0.01], [0.8, 0, 'inOut']],
    yaw: [[0, 0], [Q_SPIN, 0], [Q_LAND, 1, 'inOut'], [Q_LAND, 0], [0.8, 0]],
    up: [[0, 0], [Q_SPIN - 0.02, 0], [Q_SPIN + 0.1, 0.16, 'out'], [Q_LAND, 0, 'in'], [0.8, 0]],
    sy: [[0, 1], [Q_C, 0.94, 'expoIn'], [Q_C + 0.08, 1.08, 'out'], [Q_SPIN, 0.96], [Q_LAND, 0.88, 'in'], [Q_LAND + 0.14, 1, 'back']],
  },
  markers: { coil: 0, contact: Q_C, spin: Q_SPIN, land: Q_LAND, end: 0.8 },
  warp: [['contact', 'cast']],
  cues: [
    ['coil', 'trailOn', 'pawR'],
    ['contact', 'whoosh', 'M'],
    ['contact', 'smear'],
    ['contact', 'shake', 1],
    ['spin', 'whoosh', 'S'],
    ['land', 'footstep'],
    [0.6, 'trailOff'],
  ],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Striking Pose (9 t windup)

/** Spin-in: exactly one turn over the windup, freezing in a vogue on the stun tick; the stillness is the effect. */
const W_HOLD = 0.42;
const w: ClipDef = {
  id: 'bengas.w',
  len: W_WINDUP_S + W_HOLD + 0.38,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  keys: [
    [0, null, null],
    [W_WINDUP_S * 0.2, null, { ...TUCK, chest: [0.15, 0.4, 0] }, 'out'],
    [W_WINDUP_S * 0.75, null, { ...TUCK, shoulderL: [-0.9, 0, 0.5], shoulderR: [-0.9, 0, 0.6], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0] }, 'lin'],
    [W_WINDUP_S, null, VOGUE, 'expoOut'],
    [W_WINDUP_S + W_HOLD, null, { ...VOGUE, head: [-0.32, -0.42, 0.27] }, 'lin'],
    [W_WINDUP_S + W_HOLD + 0.38, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [W_WINDUP_S * 0.08, 0], [W_WINDUP_S, 1, 'inOut'], [W_WINDUP_S, 0], [W_WINDUP_S + W_HOLD + 0.38, 0]],
    up: [[0, 0], [W_WINDUP_S * 0.15, 0], [W_WINDUP_S * 0.55, 0.2, 'out'], [W_WINDUP_S, 0, 'in'], [W_WINDUP_S + W_HOLD + 0.38, 0]],
    // a 2-frame stretch pop on the stun tick, then the pose held tall
    sy: [[0, 1], [W_WINDUP_S * 0.12, 0.88], [W_WINDUP_S * 0.45, 1.1, 'out'], [W_WINDUP_S - 0.02, 0.98], [W_WINDUP_S, 1.18, 'expoOut'], [W_WINDUP_S + 2 / 60, 1.1], [W_WINDUP_S + W_HOLD, 1.1], [W_WINDUP_S + W_HOLD + 0.2, 1, 'inOut']],
    roll: [[0, 0], [W_WINDUP_S, 0], [W_WINDUP_S + 0.06, 0.04, 'out'], [W_WINDUP_S + W_HOLD, 0.04], [W_WINDUP_S + W_HOLD + 0.25, 0, 'inOut']],
  },
  markers: { coil: 0, contact: W_WINDUP_S, end: W_WINDUP_S + W_HOLD + 0.38 },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'whoosh', 'M'], ['coil', 'earsBack'], ['contact', 'freeze', 90], ['contact', 'shake', 1], ['contact', 'punch', 0.03], ['contact', 'sfx', 'pop']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ E Camellia Hop (dash, progress-driven)

/**
 * Grand jeté (split at the apex, arms up) and a quick plié curtsy on the landing. The sim hands control back on the
 * landing (plus +20% haste), so the full-body clip ends 0.2 s after it: a short land-only dip that a standing hero
 * shows and a running one blends straight out of (no legs frozen while the root travels), and any cast may cut it
 * from the landing on (`contact` = land).
 */
const E_T0 = 0.06;
const E_T1 = E_T0 + E_AIR_S;
export const E_LEN = E_T1 + 0.2;
/**
 * Curtsy: deep enough to read at gameplay scale: the front knee well bent, the back leg crossed behind, the chest
 * dipped and the arms out wide (with the root squashed to 0.78 on the landing). No twirl: he lands in the curtsy and
 * blends straight into the run.
 */
const CURTSY: Pose = { thighL: [-0.6, 0, 0], kneeL: [1.3, 0, 0], thighR: [0.55, 0.3, 0], kneeR: [1.3, 0, 0], chest: [0.25, 0, 0], head: [0.05, 0, 0], shoulderL: [-0.3, 0, 1.5], shoulderR: [-0.3, 0, -1.5], elbowL: [-0.15, 0, 0], elbowR: [-0.15, 0, 0] };
const e: ClipDef = {
  id: 'bengas.e',
  len: E_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  blendOut: 0.1,
  keys: [
    [0, null, null],
    [E_T0, null, { kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.3, 0, 0], chest: [0.15, 0, 0], shoulderL: [-0.3, 0, 0.4], shoulderR: [-0.3, 0, -0.4] }, 'out'],
    [E_T0 + E_AIR_S * 0.5, null, { thighL: [-1.45, 0, 0], kneeL: [0, 0, 0], thighR: [1.25, 0, 0], kneeR: [0.15, 0, 0], footL: [0.3, 0, 0], footR: [0.4, 0, 0], shoulderL: [-2.6, 0, 0.5], shoulderR: [-2.3, 0, -0.9], elbowL: [-0.2, 0, 0], elbowR: [-0.1, 0, 0], chest: [-0.2, 0, 0], head: [-0.3, 0, 0] }, 'out'],
    [E_T1 - 0.03, null, { thighL: [-0.9, 0, 0], kneeL: [0.2, 0, 0], thighR: [0.7, 0, 0], kneeR: [0.3, 0, 0], shoulderL: [-2.3, 0, 0.6], shoulderR: [-2.0, 0, -0.8], chest: [-0.1, 0, 0] }, 'inOut'],
    [E_T1 + 0.06, null, CURTSY, 'in'],
    [E_T1 + 0.12, null, { ...CURTSY, chest: [0.22, 0, 0] }, 'out'],
    [E_LEN, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [E_T0, 0], [E_T0 + E_AIR_S * 0.5, 0.85, 'out'], [E_T1, 0, 'in'], [E_LEN, 0]],
    pitch: [[0, 0], [E_T0 + E_AIR_S * 0.5, -0.03], [E_T1, 0], [E_LEN, 0]],
    sy: [[0, 1], [E_T0, 0.8, 'out'], [E_T0 + 0.05, 1.15, 'out'], [E_T1 - 0.03, 1.02], [E_T1 + 0.03, 0.78, 'in'], [E_T1 + 0.12, 0.84], [E_LEN, 1, 'inOut']],
  },
  markers: { takeoff: E_T0, land: E_T1, contact: E_T1, end: E_LEN },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [
    ['takeoff', 'whoosh', 'M'],
    ['takeoff', 'dust'],
    ['takeoff', 'ghost'],
    ['takeoff', 'earsBack'],
    ['takeoff', 'trailOn', 'footL'],
    ['land', 'land'],
    ['land', 'fx', 'b:petals'],
    [E_T1 + 0.1, 'trailOff'],
  ],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ R Curtains Up! (zone: arm 18 t, pulse every 15 t)

/** Cast clip: flourish on the peek, deep bow on the cast, the baton raises the curtain until the arm, downbeat on it. */
const R_C = 0.1;
const R_ARM = R_C + R_ARM_S;
export const R_LEN = R_ARM + 0.3;
const R_OUT = 0.12;
const r: ClipDef = {
  id: 'bengas.r',
  len: R_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendOut: R_OUT,
  keys: [
    [0, null, null],
    [R_C, null, { shoulderR: [-1.6, 0, -1.4], elbowR: [-0.2, 0, 0], shoulderL: [-0.6, 0, 0.6], chest: [-0.2, 0.25, 0], head: [-0.25, 0, 0], thighR: [0.4, 0, 0], kneeR: [0.3, 0, 0] }, 'out'],
    [R_C + 0.22, null, BOW, 'inOut'],
    [R_C + 0.3, null, BOW_HOLD, 'lin'],
    [R_ARM - 0.06, null, { ...UPBEAT, shoulderR: [-2.95, 0, -0.15], chest: [-0.35, 0, 0], head: [-0.45, 0, 0] }, 'inOut'],
    [R_ARM, null, { ...DOWNBEAT, kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'expoIn'],
    [R_LEN, null, READY, 'inOut'],
  ],
  root: {
    up: [[0, 0], [R_C + 0.3, 0], [R_ARM - 0.06, 0.2, 'out'], [R_ARM, 0, 'expoIn'], [R_LEN, 0]],
    sy: [[0, 1], [R_C, 1.06], [R_C + 0.22, 0.98], [R_C + 0.3, 0.98], [R_ARM - 0.06, 1.12], [R_ARM + 0.02, 0.82, 'expoIn'], [R_ARM + 0.18, 1, 'back']],
  },
  markers: { coil: 0.02, contact: R_C, bow: R_C + 0.22, arm: R_ARM, end: R_LEN },
  warp: [['contact', 'cast'], ['arm', 'zoneArm']],
  cues: [
    ['contact', 'whoosh', 'L'],
    ['bow', 'whoosh', 'S'],
    ['arm', 'fx', 'b:beat'],
    ['arm', 'shake', 2],
    ['arm', 'punch', 0.05],
    ['arm', 'dustRing'],
  ],
  cancel: 'afterContact',
};

/**
 * The conducting loop (upper body, so he can walk). Its downbeat is warped onto the sim's second pulse (the `pulse`
 * anchor = cast + arm + every) and then loops at the pulse period, so every downbeat lands on a pulse wherever the
 * hold starts (a cast clip cut short by a walk starts it early: the lead-in just plays slower). HOLD_BEAT is the
 * nominal phase for a hold that starts as the cast clip blends out (R_LEN − R_OUT clip seconds after the cast
 * marker's R_C).
 */
export const HOLD_START_S = R_LEN - R_OUT - R_C;
export const HOLD_BEAT = (((R_ARM_S + R_EVERY_S - HOLD_START_S) % R_EVERY_S) + R_EVERY_S) % R_EVERY_S;
const B = HOLD_BEAT;
const rHold: ClipDef = {
  id: 'bengas.r.hold',
  len: R_EVERY_S,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  keys: [
    [0, null, READY],
    [B - 0.13, null, UPBEAT, 'inOut'],
    [B, null, DOWNBEAT, 'expoIn'],
    [B + 0.07, null, { ...DOWNBEAT, chest: [0.45, 0, 0], shoulderR: [-0.75, 0, -0.6], shoulderL: [-0.7, 0, 0.55] }, 'out'],
    [R_EVERY_S, null, READY, 'inOut'],
  ],
  markers: { beat: B },
  warp: [['beat', 'pulse']],
  cues: [['beat', 'fx', 'b:beat']],
  cancel: 'any',
};

/**
 * Stage end (stateEnd = cast + duration): the zone pulses at cast + arm + k·every and lives arm + duration, so the
 * final pulse lands (arm − every) = 3 t after stateEnd and the curtains close arm = 18 t after it. The clip picks up
 * from the hold's upbeat, gives that final downbeat, and bows as the curtains close (upper body: he may walk).
 */
const R_END_BEAT = (T.r.arm - T.r.every) * TICK_S;
export const R_END_BOW = R_ARM_S;
const R_END_LEN = R_END_BOW + 0.65;
const rEnd: ClipDef = {
  id: 'bengas.r.end',
  len: R_END_LEN,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, UPBEAT],
    [R_END_BEAT, null, DOWNBEAT, 'expoIn'],
    [R_END_BEAT + 0.1, null, { ...DOWNBEAT, chest: [0.45, 0, 0] }, 'out'],
    [R_END_BOW - 0.22, null, READY, 'inOut'],
    [R_END_BOW, null, BOW, 'inOut'],
    [R_END_BOW + 0.3, null, BOW_HOLD, 'lin'],
    [R_END_LEN, null, null, 'inOut'],
  ],
  root: {
    sy: [[0, 1], [R_END_BEAT, 0.88, 'expoIn'], [R_END_BEAT + 0.15, 1, 'back'], [R_END_BOW, 0.98], [R_END_BOW + 0.3, 0.98], [R_END_LEN - 0.1, 1, 'inOut']],
  },
  markers: { contact: 0, beat: R_END_BEAT, bow: R_END_BOW, end: R_END_LEN },
  warp: [['contact', 'stateEnd']],
  cues: [['beat', 'fx', 'b:beat'], ['bow', 'whoosh', 'S'], ['bow', 'fx', 'b:bow']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ death, respawn, flavour

/**
 * Death: paw to the forehead, one quick dying turn (0.28 s, snapped to 0 once round, so the fade never unwinds it)
 * with one stagger step back (the right leg swings back and plants at 0.4 s), then the collapse with no root
 * translation (no foot glide); a rose drops.
 */
const death: ClipDef = {
  id: 'bengas.death',
  len: 1.3,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.15, null, { shoulderL: [-2.3, 0, -0.5], elbowL: [-2.1, 0, 0], chest: [-0.4, 0, 0.1], head: [-0.55, 0, 0.15], shoulderR: [-0.4, 0, -1.4], elbowR: [-0.2, 0, 0], thighR: [0.3, 0, 0], kneeL: [0.3, 0, 0] }, 'expoOut'],
    [0.28, null, { shoulderL: [-2.3, 0, -0.5], elbowL: [-2.1, 0, 0], chest: [-0.45, 0, 0.12], head: [-0.6, 0, 0.2], shoulderR: [-0.5, 0, -1.5], elbowR: [-0.2, 0, 0], thighR: [0.65, 0, 0], kneeR: [0.5, 0, 0], kneeL: [0.35, 0, 0] }, 'out'],
    [0.4, null, { shoulderL: [-2.3, 0, -0.5], elbowL: [-2.1, 0, 0], chest: [-0.5, 0, 0.12], head: [-0.6, 0, 0.2], shoulderR: [-0.6, 0, -1.5], elbowR: [-0.2, 0, 0], thighR: [0.45, 0, 0], kneeR: [0.15, 0, 0], thighL: [-0.15, 0, 0], kneeL: [0.4, 0, 0] }, 'in'],
    [0.75, null, { shoulderL: [-2.0, 0, -0.3], elbowL: [-1.8, 0, 0], shoulderR: [-1.2, 0, -1.4], chest: [-0.2, 0, 0.25], head: [-0.2, 0, 0.3], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.45, 0, 0], thighR: [-0.45, 0, 0] }, 'inOut'],
    [1.3, 'faint', null, 'in'],
  ],
  root: {
    yaw: [[0, 0], [0.22, 0], [0.5, 1, 'inOut'], [0.5, 0], [1.3, 0]],
    sy: [[0, 1], [0.15, 1.06], [0.75, 0.94], [1.25, 1], [1.3, 0.85, 'in']],
  },
  markers: { contact: 0, rose: 0.95, end: 1.3 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['contact', 'mouthOpen', 300], [0.3, 'whoosh', 'M'], ['rose', 'fx', 'b:rose'], [1.3, 'land']],
  calm: { yaw: 0 },
  cancel: 'none',
};

/** Respawn: drops from the flies with a twirl into the spotlight, lands, takes a bow. */
const respawn: ClipDef = {
  id: 'bengas.respawn',
  len: 1.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-2.4, 0, 0.4], shoulderR: [-2.4, 0, -0.4] }],
    [0.35, null, { kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], body: [0.15, 0, 0], shoulderL: [-0.3, 0, 0.9], shoulderR: [-0.3, 0, -0.9] }, 'in'],
    [0.62, null, BOW, 'inOut'],
    [0.85, null, BOW_HOLD, 'lin'],
    [1.1, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.35, 0, 'in'], [1.1, 0]],
    yaw: [[0, 0], [0.3, 1, 'out'], [0.3, 0], [1.1, 0]],
    sy: [[0, 1.15], [0.33, 1.1], [0.37, 0.7, 'in'], [0.55, 1, 'back']],
  },
  markers: { land: 0.35, bow: 0.62, end: 1.1 },
  warp: [],
  cues: [['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'b:spot'], ['bow', 'whoosh', 'S']],
  calm: { yaw: 0 },
  cancel: 'any',
};

/** Victory: a backflip, a deep bow with the baton sweep, then flowers tossed to the crowd. */
const victory: ClipDef = {
  id: 'bengas.victory',
  len: 2.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.12, null, { kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], thighL: [-0.45, 0, 0], thighR: [-0.45, 0, 0], shoulderL: [0.3, 0, 0.3], shoulderR: [0.3, 0, -0.3], chest: [0.3, 0, 0] }, 'out'],
    [0.26, null, { thighL: [-1.4, 0, 0], thighR: [-1.4, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0], shoulderL: [-2.6, 0, 0.5], shoulderR: [-2.6, 0, -0.5], chest: [-0.3, 0, 0], head: [-0.4, 0, 0] }, 'out'],
    [0.46, null, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-1.6, 0, 1.0], shoulderR: [-1.6, 0, -1.0] }, 'in'],
    [0.62, null, { kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2] }, 'back'],
    [0.95, null, BOW, 'inOut'],
    [1.15, null, BOW_HOLD, 'lin'],
    [1.35, null, { ...UPBEAT, shoulderL: [-2.9, 0, 0.6], elbowL: [-0.1, 0, 0], shoulderR: [-1.6, 0, -1.2] }, 'out'],
    [1.75, null, { ...UPBEAT, shoulderL: [-2.8, 0, 0.7], elbowL: [-0.2, 0, 0], shoulderR: [-1.6, 0, -1.25] }, 'lin'],
    [2.1, null, null, 'inOut'],
  ],
  root: {
    pitch: [[0, 0], [0.12, 0], [0.46, -1, 'inOut'], [0.46, 0], [2.1, 0]],
    up: [[0, 0], [0.12, 0], [0.29, 0.95, 'out'], [0.46, 0, 'in'], [1.3, 0], [1.38, 0.12, 'out'], [1.5, 0, 'in'], [2.1, 0]],
    sy: [[0, 1], [0.12, 0.8, 'out'], [0.18, 1.12, 'out'], [0.44, 1], [0.48, 0.74, 'in'], [0.66, 1, 'back'], [1.3, 0.92], [1.38, 1.08], [1.5, 0.9, 'in'], [1.65, 1, 'back']],
  },
  markers: { takeoff: 0.12, land: 0.46, bow: 0.95, toss: 1.38, end: 2.1 },
  warp: [],
  cues: [['takeoff', 'whoosh', 'L'], ['land', 'land'], ['land', 'dust'], ['bow', 'whoosh', 'S'], ['toss', 'fx', 'b:bouquet'], ['toss', 'sfx', 'pop']],
  cancel: 'any',
};

/** Emote: a twirl that lands in the vogue, held for the photographers. */
const emote: ClipDef = {
  id: 'bengas.emote',
  len: 1.3,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.08, null, TUCK, 'out'],
    [0.28, null, VOGUE, 'expoOut'],
    [0.95, null, { ...VOGUE, head: [-0.35, -0.45, 0.3] }, 'lin'],
    [1.3, null, null, 'inOut'],
  ],
  root: { yaw: [[0, 0], [0.04, 0], [0.28, 1, 'inOut'], [0.28, 0], [1.3, 0]], up: [[0, 0], [0.06, 0], [0.16, 0.15, 'out'], [0.28, 0, 'in'], [1.3, 0]], sy: [[0, 1], [0.05, 0.9], [0.14, 1.08], [0.28, 1.1, 'expoOut'], [0.95, 1.05], [1.2, 1, 'inOut']] },
  markers: { contact: 0.28, end: 1.3 },
  warp: [],
  cues: [[0.04, 'whoosh', 'S'], ['contact', 'fx', 'b:flash'], ['contact', 'sfx', 'pop']],
  calm: { yaw: 0 },
  cancel: 'any',
};

/** Idle: the conductor at rest, baton up, a slow breath through the arms. */
const idle: ClipDef = {
  id: 'bengas.idle',
  len: 2.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, { shoulderR: [-1.1, 0, -0.2], elbowR: [-1.1, 0, 0], chest: [-0.06, 0, 0], head: [-0.06, 0, 0] }],
    [1.2, null, { shoulderR: [-1.2, 0, -0.25], elbowR: [-1.15, 0, 0], chest: [-0.1, 0.05, 0], head: [-0.1, 0.1, 0] }, 'inOut'],
    [2.4, null, { shoulderR: [-1.1, 0, -0.2], elbowR: [-1.1, 0, 0], chest: [-0.06, 0, 0], head: [-0.06, 0, 0] }, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: straightens the flower crown with the left paw. */
const fidgetCrown: ClipDef = {
  id: 'bengas.fidgetCrown',
  len: 1.2,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [0.3, null, { shoulderL: [-2.5, 0, 0.2], elbowL: [-2.0, 0, 0], head: [-0.15, 0, -0.15] }, 'out'],
    [0.5, null, { shoulderL: [-2.6, 0, 0.1], elbowL: [-2.1, 0, 0], head: [-0.15, 0, 0.1] }, 'inOut'],
    [0.7, null, { shoulderL: [-2.5, 0, 0.2], elbowL: [-2.0, 0, 0], head: [-0.2, 0, -0.05] }, 'inOut'],
    [1.2, null, null, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: a fingertip flame admired on the left paw. */
const fidgetFlame: ClipDef = {
  id: 'bengas.fidgetFlame',
  len: 1.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [0.3, null, { shoulderL: [-1.7, 0, 0.3], elbowL: [-1.4, 0, 0], head: [0.15, 0.3, 0] }, 'out'],
    [1.0, null, { shoulderL: [-1.75, 0, 0.32], elbowL: [-1.45, 0, 0], head: [0.2, 0.35, 0.1] }, 'inOut'],
    [1.4, null, null, 'inOut'],
  ],
  markers: { flame: 0.3 },
  warp: [],
  cues: [['flame', 'fx', 'b:flame'], ['flame', 'sfx', 'sizzle']],
  cancel: 'any',
};

/** Fidget: a quick bow to the audience. */
const fidgetBow: ClipDef = {
  id: 'bengas.fidgetBow',
  len: 1.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [[0, null, null], [0.35, null, BOW, 'inOut'], [0.6, null, BOW, 'lin'], [1.1, null, null, 'inOut']],
  root: { sy: [[0, 1], [0.35, 0.98], [0.6, 0.98], [1.1, 1, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Level up: a hop into the vogue. */
const levelUp: ClipDef = {
  id: 'bengas.levelUp',
  len: 0.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [[0, null, null], [0.1, null, { kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'], [0.3, null, VOGUE, 'expoOut'], [0.55, null, VOGUE, 'lin'], [0.8, null, null, 'inOut']],
  root: { up: [[0, 0], [0.1, 0], [0.2, 0.3, 'out'], [0.3, 0, 'in'], [0.8, 0]], sy: [[0, 1], [0.1, 0.85], [0.16, 1.1], [0.3, 0.82, 'in'], [0.45, 1, 'back']] },
  markers: { contact: 0.3, end: 0.8 },
  warp: [],
  cues: [['contact', 'land'], ['contact', 'fx', 'b:flash']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ the set

/** Prancing stage trot: chest up (negative lean), high bouncy steps, hips swinging. */
const GAIT: GaitProfile = { ...DEFAULT_GAIT, stride: 1.05, bounce: 1.6, lean: -0.35, hipSway: 1.4, headBob: 0.7, arms: 'out' };

const BASICS: readonly ClipDef[] = [basicA, basicB, basicC];

/** Hot Toast: a basic on a crowd-controlled hero gets the fire twirl (no allocation). */
const basicPick = (ctx: MoveCtx): ClipDef | null => (ctx.targetCc ? basicHot : null);

export const MOVES: MoveSet = {
  hero: 'bengas',
  stub: false,
  gait: GAIT,
  springs: HERO_SPRINGS.bengas,
  basic: BASICS,
  basicPick,
  slots: {
    q: { cast: q },
    w: { cast: w },
    e: { cast: e },
    r: { cast: r, hold: rHold, end: rEnd },
  },
  idle,
  fidgets: [
    [fidgetCrown, 3],
    [fidgetFlame, 2],
    [fidgetBow, 2],
  ],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Tests and the capture: every clip of the set by name. */
export const BENGAS_CLIPS = Object.freeze({ basicA, basicB, basicC, basicHot, q, w, e, r, rHold, rEnd, death, respawn, victory, emote, idle, fidgetCrown, fidgetFlame, fidgetBow, levelUp, recall: COMMON.recall });
