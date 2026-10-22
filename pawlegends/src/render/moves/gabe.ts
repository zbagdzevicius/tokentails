/**
 * Gabė move set (ANIM-SPEC §14 "Gabė: Support, Wind, wings and heart float"). A light, airy dancer: every move reads
 * as a silhouette at gameplay zoom (arms spread as wings, tiptoe hops, pirouettes, a barrel roll, a blown kiss).
 *
 * Timing contract (all from timing.ts, never literals):
 * - basics: release at the 8 t windup (BASIC_CONTACT) on the bolt spawn; A blown kiss, B wing flick, C twirl toss.
 * - Q Heart Balloon: instant (contact = cast); the lob and its wing-flap hop land 0.22 s later, then the gait owns the
 *   legs (the pop at q.arm is the FX's beat: a held clap would freeze her legs for half a second while she walks).
 * - W Wing Wrap: instant (contact = cast); the cocoon, then a bloom pirouette that lands as the feather swirl reaches the
 *   wrapped ally (cast + 0.18 s, skillfx SWIRL_S).
 *
 * Post-contact tails stay short (≤ 0.25 s past the impact or landing): the stack never stops a full-mask clip when the
 * hero starts walking, so a long tail would slide her feet.
 * - E Chase the Wind: take-off on the cast, landing exactly 6 t later. The sim always dashes the full 4 m (Aim.Dir), so
 *   the clip is bound to the cast only: a short click never lands her early (the director's travelEnd is aim-clamped).
 * - R Under Her Spell: coil on windupStart, a one-turn twirl over the 15 t windup, the blown kiss on the cast.
 *
 * Whole-turn root rotations (twirls, the barrel roll) step back to 0 right after they complete (a turn is invisible),
 * so a clip's blend-out never unwinds a spin.
 */
import { BASIC_CONTACT, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import type { BoneName } from '../chars/skeleton';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveSet } from '../anim/types';

type D = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.gabe.slots;
/** Basic release (s): the 8 t windup. */
const C = BASIC_CONTACT;
/** Chase the Wind air time (s) at full dash. */
const E_AIR = T.e.dashTicks * TICK_S;
/** Under Her Spell windup (s). */
const R_WIND = T.r.windup * TICK_S;
/** The FK pose every key builds on (both arms free: no bow, no sword). */
const S = 'stand';
/** A whole-turn wrap: back to 0 one millisecond after the turn completes. */
const WRAP = 0.001;

// ------------------------------------------------------------------------------------------------ arm shapes

/** Arms spread as wings (shoulder z + opens the left arm, − the right). */
const wings = (up = -0.3, open = 1.5, el = 0): D => ({ shoulderL: [up, 0, open], shoulderR: [up, 0, -open], elbowL: [el, 0, 0], elbowR: [el, 0, 0] });
const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;

// ------------------------------------------------------------------------------------------------ basics

/** A: blown kiss. Paw to the lips on the coil, flung open on the release with a rise onto her toes, a happy wing flutter.
 * Upper-body mask (she kites on her own legs), so the root stays within a few centimetres: no levitation, no slide. */
const basicA: ClipDef = {
  id: 'gabe.basicA',
  len: C + 0.45,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, S, null],
    [C * 0.6, S, { shoulderR: [-1.35, 0, 0.35], elbowR: [-2.1, 0, 0], chest: [-0.18, 0.35, 0], head: [-0.12, 0.15, 0.12], shoulderL: [-0.2, 0, 0.55], elbowL: [-0.4, 0, 0] }, 'out'],
    [C, S, { shoulderR: [-1.7, 0, -0.45], elbowR: [0, 0, 0], chest: [0.45, -0.4, 0], head: [0.05, -0.1, -0.12], shoulderL: [0.35, 0, 0.95] }, 'expoIn'],
    [C + 0.12, S, { shoulderR: [-1.9, 0, -0.7], elbowR: [0.1, 0, 0], chest: [0.36, -0.45, 0], head: [0, -0.15, -0.15], shoulderL: [0.45, 0, 1.1] }, 'back'],
    [C + 0.22, S, merge(wings(-0.7, 1.45), { chest: [0.05, 0, 0], head: [-0.15, 0, 0.1] }), 'inOut'],
    [C + 0.3, S, merge(wings(-0.4, 0.95), { head: [-0.1, 0, -0.08] }), 'inOut'],
    [C + 0.38, S, merge(wings(-0.6, 1.3), { head: [-0.1, 0, 0.06] }), 'inOut'],
    [C + 0.45, S, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.6, -0.02], [C, 0.04, 'expoIn'], [C + 0.45, 0, 'inOut']],
    up: [[0, 0], [C * 0.6, 0], [C + 0.07, 0.05, 'out'], [C + 0.22, 0, 'in'], [C + 0.45, 0]],
    pitch: [[0, 0], [C * 0.6, -0.03], [C, 0.05, 'expoIn'], [C + 0.2, 0.03], [C + 0.45, 0, 'inOut']],
    sy: [[0, 1], [C * 0.6, 0.92, 'out'], [C, 1.08, 'expoIn'], [C + 0.2, 0.94], [C + 0.3, 1, 'back']],
  },
  markers: { coil: C * 0.6, contact: C, flutter: C + 0.22, end: C + 0.45 },
  warp: [['contact', 'release']],
  cues: [['contact', 'sfx', 'kiss'], ['contact', 'mouthOpen', 140], ['contact', 'whoosh', 'S'], ['flutter', 'sfx', 'flutter']],
  cancel: 'afterContact',
};

/** B: wing flick. A cross-body coil, then both wings snap open with a chest-and-head counter-twist (upper mask: the
 * twist lives on the chest and head, the root only sways a few centimetres). */
const basicB: ClipDef = {
  id: 'gabe.basicB',
  len: C + 0.42,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, S, null],
    [C * 0.62, S, { chest: [0.12, -0.85, 0], shoulderL: [-1.3, 0, -0.55], elbowL: [-1.1, 0, 0], shoulderR: [0.4, 0, -0.6], elbowR: [-0.6, 0, 0], head: [0.05, 0.45, 0] }, 'out'],
    [C, S, { chest: [0.15, 0.8, 0], shoulderL: [-0.9, 0, 1.75], elbowL: [0, 0, 0], shoulderR: [-0.5, 0, -1.4], elbowR: [0, 0, 0], head: [-0.1, -0.35, 0.1] }, 'expoIn'],
    [C + 0.12, S, { chest: [0.1, 0.95, 0], shoulderL: [-1.05, 0, 1.95], shoulderR: [-0.6, 0, -1.6], head: [-0.15, -0.4, 0.12] }, 'back'],
    [C + 0.26, S, merge(wings(-0.5, 0.9), { chest: [0, 0.2, 0] }), 'inOut'],
    [C + 0.42, S, null, 'inOut'],
  ],
  root: {
    side: [[0, 0], [C * 0.62, -0.02], [C, 0.04, 'expoIn'], [C + 0.42, 0, 'inOut']],
    roll: [[0, 0], [C * 0.62, 0.03], [C, -0.06, 'expoIn'], [C + 0.42, 0, 'inOut']],
    yaw: [[0, 0], [C * 0.62, -0.05], [C, 0.07, 'expoIn'], [C + 0.42, 0, 'inOut']],
    up: [[0, 0], [C * 0.62, 0], [C + 0.06, 0.05, 'out'], [C + 0.2, 0, 'in'], [C + 0.42, 0]],
    sy: [[0, 1], [C * 0.62, 0.93], [C, 1.06, 'expoIn'], [C + 0.18, 0.95], [C + 0.28, 1, 'back']],
  },
  markers: { coil: C * 0.62, contact: C, end: C + 0.42 },
  warp: [['contact', 'release']],
  cues: [['contact', 'sfx', 'flutter'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'bFlick']],
  cancel: 'afterContact',
};

/** C: twirl toss. A crouch, a hopping pirouette (1 turn, arms overhead), the heart thrown on the release. */
const basicC: ClipDef = {
  id: 'gabe.basicC',
  len: C + 0.48,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.05,
  keys: [
    [0, S, null],
    [C * 0.25, S, { chest: [0.2, 0, 0], shoulderL: [-0.9, 0, -0.35], shoulderR: [-0.9, 0, 0.35], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0], thighL: [-0.35, 0, 0], thighR: [-0.35, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0] }, 'out'],
    [C * 0.7, S, { chest: [-0.1, 0, 0], shoulderL: [-2.7, 0, 0.25], shoulderR: [-2.7, 0, -0.25], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], thighL: [-0.5, 0, 0.2], kneeL: [1.4, 0, 0], head: [-0.25, 0, 0] }, 'out'],
    [C, S, { chest: [0.28, -0.2, 0], shoulderR: [-2.0, 0, -0.35], elbowR: [0, 0, 0], shoulderL: [-0.4, 0, 1.3], thighR: [0.55, 0, 0], kneeR: [0.7, 0, 0], head: [-0.05, 0, 0.1] }, 'expoIn'],
    [C + 0.14, S, { chest: [0.36, -0.28, 0], shoulderR: [-2.15, 0, -0.55], shoulderL: [-0.3, 0, 1.45], thighR: [0.7, 0, 0], kneeR: [0.8, 0, 0], head: [0, 0, 0.14] }, 'back'],
    [C + 0.3, S, merge(wings(-0.6, 1.1), { kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0] }), 'inOut'],
    [C + 0.48, S, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [C * 0.25, 0], [C, -1, 'inOut'], [C + WRAP, 0, 'step'], [C + 0.48, 0]],
    up: [[0, 0], [C * 0.25, 0], [C * 0.7, 0.32, 'out'], [C + 0.06, 0.1, 'in'], [C + 0.16, 0, 'in'], [C + 0.48, 0]],
    sy: [[0, 1], [C * 0.25, 0.84, 'out'], [C * 0.5, 1.12, 'out'], [C + 0.14, 1], [C + 0.18, 0.86, 'in'], [C + 0.32, 1, 'back']],
    fwd: [[0, 0], [C, 0.1, 'expoIn'], [C + 0.48, 0, 'inOut']],
  },
  calm: { yaw: 0 },
  markers: { coil: C * 0.25, spin: C * 0.3, contact: C, land: C + 0.16, end: C + 0.48 },
  warp: [['contact', 'release']],
  cues: [['spin', 'whoosh', 'M'], ['spin', 'trailOn', 'pawR'], ['contact', 'sfx', 'kiss'], ['contact', 'fx', 'bToss'], ['land', 'land'], ['end', 'trailOff']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ Q Heart Balloon

const Q_C = 0.12;
const Q_LAND = Q_C + 0.22;
const Q_END = Q_LAND + 0.12;
/** Underhand lob with a wing-flap hop; the head follows the balloon up; a tiptoe landing. */
const q: ClipDef = {
  id: 'gabe.q',
  len: Q_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.1,
  keys: [
    [0, S, null],
    [0.05, S, { shoulderR: [0.95, 0, -0.2], elbowR: [-0.2, 0, 0], chest: [0.2, -0.3, 0], thighL: [-0.25, 0, 0], thighR: [-0.25, 0, 0], kneeL: [0.45, 0, 0], kneeR: [0.45, 0, 0], shoulderL: [-0.5, 0, 0.6], head: [0.05, 0, 0] }, 'out'],
    [Q_C, S, { shoulderR: [-2.1, 0, -0.25], elbowR: [0, 0, 0], chest: [-0.2, 0.15, 0], head: [-0.35, 0, 0], thighR: [0.35, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-0.4, 0, 1.25] }, 'expoIn'],
    [Q_C + 0.1, S, merge(wings(-0.85, 1.75), { head: [-0.55, 0, 0], chest: [-0.15, 0, 0], thighL: [-0.45, 0, 0], thighR: [-0.45, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] }), 'out'],
    [Q_C + 0.17, S, merge(wings(-0.15, 0.7), { head: [-0.5, 0, 0.05], thighL: [-0.2, 0, 0], thighR: [-0.2, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }), 'inOut'],
    [Q_LAND, S, merge(wings(-0.6, 1.4), { head: [-0.35, 0, 0], thighL: [-0.35, 0, 0], thighR: [-0.35, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], chest: [0.15, 0, 0] }), 'in'],
    [Q_END, S, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.05, -0.06], [Q_C, 0.1, 'expoIn'], [Q_LAND, 0, 'inOut'], [Q_END, 0]],
    up: [[0, 0], [Q_C, 0.05], [Q_C + 0.1, 0.4, 'out'], [Q_LAND, 0, 'in'], [Q_END, 0]],
    sy: [[0, 1], [0.05, 0.86, 'out'], [Q_C, 1.1, 'expoIn'], [Q_LAND - 0.03, 1], [Q_LAND + 0.03, 0.84, 'in'], [Q_END, 1, 'back']],
  },
  markers: { coil: 0.05, contact: Q_C, flap: Q_C + 0.1, land: Q_LAND, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'balloon'], ['contact', 'whoosh', 'S'], ['flap', 'sfx', 'flutter'], ['land', 'footstep']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Wing Wrap

const W_C = 0.06;
/** The feather swirl's flight to the wrapped ally (skillfx/gabe.ts SWIRL_S): the bloom opens as it arrives. */
const W_SWIRL = 0.18;
const W_COCOON = W_C + 0.09;
const W_BLOOM = W_C + W_SWIRL;
const W_SPIN = W_BLOOM + 0.16;
const W_END = W_SPIN + 0.12;
/** Wings sweep forward in an embrace, a quick cocoon curl, then a wing-spread leaping pirouette that blooms open as
 * the swirl lands on the ally (the shield's visible beat), a tiptoe landing. */
const w: ClipDef = {
  id: 'gabe.w',
  len: W_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.1,
  keys: [
    [0, S, null],
    [0.03, S, merge(wings(0.35, 1.6), { chest: [-0.2, 0, 0] }), 'out'],
    [W_C, S, { shoulderL: [-1.5, 0, -0.1], shoulderR: [-1.5, 0, 0.1], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], chest: [0.4, 0, 0], head: [0.1, 0, 0.12] }, 'expoIn'],
    [W_COCOON, S, { shoulderL: [-1.25, 0, -0.6], shoulderR: [-1.25, 0, 0.6], elbowL: [-2.1, 0, 0], elbowR: [-2.1, 0, 0], chest: [0.42, 0, 0], head: [0.38, 0, 0.05], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], kneeL: [0.95, 0, 0], kneeR: [0.95, 0, 0] }, 'out'],
    [W_BLOOM, S, merge(wings(-1.1, 2.0), { chest: [-0.32, 0, 0], head: [-0.45, 0, 0], thighR: [0.45, 0, 0], kneeR: [0.5, 0, 0] }), 'expoOut'],
    [W_BLOOM + 0.08, S, merge(wings(-0.95, 1.9), { chest: [-0.25, 0, 0], head: [-0.35, 0, 0], thighL: [-0.4, 0, 0.15], kneeL: [1.1, 0, 0] }), 'inOut'],
    [W_SPIN, S, merge(wings(-0.5, 1.2), { thighL: [-0.35, 0, 0], thighR: [-0.35, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0] }), 'in'],
    [W_END, S, null, 'inOut'],
  ],
  root: {
    sy: [[0, 1], [W_C, 0.96], [W_COCOON, 0.82, 'out'], [W_BLOOM, 1.14, 'expoOut'], [W_BLOOM + 0.1, 1, 'back'], [W_SPIN + 0.03, 0.86, 'in'], [W_END, 1, 'back']],
    up: [[0, 0], [W_COCOON, 0], [W_BLOOM + 0.07, 0.4, 'out'], [W_SPIN, 0, 'in'], [W_END, 0]],
    yaw: [[0, 0], [W_BLOOM - 0.02, 0], [W_SPIN, 1, 'inOut'], [W_SPIN + WRAP, 0, 'step'], [W_END, 0]],
    fwd: [[0, 0], [W_C, 0.1, 'expoIn'], [W_COCOON, 0.04], [W_SPIN, 0, 'inOut'], [W_END, 0]],
  },
  calm: { yaw: 0 },
  markers: { contact: W_C, cocoon: W_COCOON, bloom: W_BLOOM, land: W_SPIN, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'flutter'], ['bloom', 'sfx', 'kiss'], ['bloom', 'whoosh', 'M'], ['bloom', 'fx', 'wBloom'], ['land', 'land']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ E Chase the Wind

const E_T0 = 0.08;
const E_LAND = E_T0 + E_AIR;
const E_TADA = E_LAND + 0.14;
const E_END = E_LAND + 0.22;
/** A gliding leap, wings spread, one barrel roll over the 6 t flight, a tiptoe landing and a "ta-da". */
const e: ClipDef = {
  id: 'gabe.e',
  len: E_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, S, null],
    [E_T0, S, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.95, 0, 0], kneeR: [0.95, 0, 0], chest: [0.35, 0, 0], shoulderL: [0.6, 0, 0.5], shoulderR: [0.6, 0, -0.5] }, 'out'],
    [E_T0 + E_AIR * 0.25, S, merge(wings(-0.25, 1.65), { chest: [0.2, 0, 0], head: [-0.25, 0, 0], thighL: [0.55, 0, 0], thighR: [0.3, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.35, 0, 0] }), 'out'],
    [E_T0 + E_AIR * 0.6, S, merge(wings(-0.45, 1.75), { chest: [0.15, 0, 0], head: [-0.2, 0, 0], thighL: [0.45, 0, 0], thighR: [0.25, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.3, 0, 0] }), 'inOut'],
    [E_LAND - E_AIR * 0.1, S, merge(wings(-0.5, 1.4), { thighL: [-0.25, 0, 0], thighR: [-0.2, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.25, 0, 0] }), 'inOut'],
    [E_LAND, S, merge(wings(-0.6, 1.0), { thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], chest: [0.25, 0, 0] }), 'in'],
    [E_LAND + 0.07, S, merge(wings(-0.3, 0.8), { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], chest: [0.3, 0, 0] }), 'out'],
    [E_TADA, S, { shoulderL: [-2.5, 0, 0.6], shoulderR: [-2.5, 0, -0.6], chest: [-0.15, 0, 0], head: [-0.25, 0, 0.1], thighR: [0.35, 0, 0], kneeR: [0.55, 0, 0] }, 'back'],
    [E_END, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [E_T0, 0], [E_T0 + E_AIR * 0.5, 0.68, 'out'], [E_LAND, 0, 'in'], [E_END, 0]],
    roll: [[0, 0], [E_T0 + E_AIR * 0.12, 0], [E_LAND - E_AIR * 0.06, 1, 'inOut'], [E_LAND - E_AIR * 0.06 + WRAP, 0, 'step'], [E_END, 0]],
    pitch: [[0, 0], [E_T0, 0.04], [E_T0 + E_AIR * 0.5, 0.07], [E_LAND, 0.02], [E_LAND + 0.08, 0.03], [E_END, 0]],
    sy: [[0, 1], [E_T0, 0.78, 'out'], [E_T0 + 0.05, 1.16, 'out'], [E_LAND - 0.03, 1], [E_LAND + 0.03, 0.8, 'in'], [E_TADA, 1.06, 'back'], [E_END, 1]],
  },
  markers: { takeoff: E_T0, contact: E_T0, flap1: E_T0 + E_AIR * 0.3, flap2: E_T0 + E_AIR * 0.7, land: E_LAND, tada: E_TADA, end: E_END },
  // E always dashes the full 4 m in 6 t (sim/heroes/gabe.ts `dash(m, id, aimAngle, a.e.dash)`); the director predicts
  // travelEnd from the full length and snaps a wall-clipped dash to its landing.
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'dust'], ['takeoff', 'earsBack'], ['takeoff', 'whoosh', 'L'], ['takeoff', 'ghost'], ['flap1', 'sfx', 'flutter'], ['flap2', 'ghost'], ['land', 'land'], ['land', 'fx', 'eLand'], ['tada', 'sfx', 'kiss']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ R Under Her Spell

const R_END = R_WIND + 0.28;
/** A one-turn twirl on tiptoe over the windup, hearts gathered at the chest, then the blown kiss with a leg kick-up. */
const r: ClipDef = {
  id: 'gabe.r',
  len: R_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.05,
  blendOut: 0.12,
  keys: [
    [0, S, null],
    [R_WIND * 0.14, S, { shoulderL: [-2.6, 0, 0.4], shoulderR: [-2.6, 0, -0.4], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], head: [-0.25, 0, 0], thighL: [-0.3, 0, 0.2], kneeL: [1.2, 0, 0], chest: [-0.1, 0, 0] }, 'out'],
    [R_WIND * 0.6, S, { shoulderL: [-2.75, 0, 0.3], shoulderR: [-2.75, 0, -0.3], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0], head: [-0.3, 0, 0], thighL: [-0.35, 0, 0.2], kneeL: [1.3, 0, 0], chest: [-0.15, 0, 0] }, 'inOut'],
    [R_WIND * 0.86, S, { shoulderL: [-1.3, 0, -0.25], shoulderR: [-1.3, 0, 0.25], elbowL: [-1.5, 0, 0], elbowR: [-1.5, 0, 0], chest: [-0.2, 0.2, 0], head: [0.05, 0.2, 0.25] }, 'inOut'],
    [R_WIND, S, { hips: [0.12, 0, 0], chest: [0.42, -0.3, 0], shoulderR: [-1.75, 0, -0.5], elbowR: [0, 0, 0], shoulderL: [0.55, 0, 1.45], elbowL: [0, 0, 0], thighL: [0.95, 0, 0], kneeL: [1.2, 0, 0], thighR: [-0.1, 0, 0], head: [0.05, -0.15, -0.25] }, 'expoIn'],
    [R_WIND + 0.1, S, { hips: [0.16, 0, 0], chest: [0.5, -0.38, 0], shoulderR: [-1.95, 0, -0.7], shoulderL: [0.65, 0, 1.6], thighL: [1.05, 0, 0], kneeL: [1.3, 0, 0], head: [0.05, -0.2, -0.3] }, 'back'],
    [R_WIND + 0.18, S, { hips: [0.12, 0, 0], chest: [0.38, -0.28, 0], shoulderR: [-1.75, 0, -0.6], shoulderL: [0.5, 0, 1.45], thighL: [0.6, 0, 0], kneeL: [0.8, 0, 0], head: [0, -0.18, -0.25] }, 'inOut'],
    [R_END, S, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [R_WIND * 0.08, 0], [R_WIND * 0.84, 1, 'inOut'], [R_WIND * 0.84 + WRAP, 0, 'step'], [R_END, 0]],
    // the kiss lands with a little hop on the planted foot; no root travel (the tail is short, the gait takes over)
    up: [[0, 0], [R_WIND * 0.1, 0], [R_WIND * 0.4, 0.34, 'out'], [R_WIND * 0.84, 0.12, 'inOut'], [R_WIND, 0.02, 'in'], [R_WIND + 0.05, 0.09, 'out'], [R_WIND + 0.13, 0, 'in'], [R_END, 0]],
    sy: [[0, 1], [R_WIND * 0.08, 0.86, 'out'], [R_WIND * 0.3, 1.12, 'out'], [R_WIND * 0.84, 1], [R_WIND, 0.86, 'in'], [R_WIND + 0.1, 1.1, 'out'], [R_END, 1, 'inOut']],
  },
  calm: { yaw: 0 },
  markers: { coil: 0, gather: R_WIND * 0.6, contact: R_WIND, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'sfx', 'flutter'], [R_WIND * 0.1, 'whoosh', 'M'], ['gather', 'fx', 'rGather'], ['contact', 'blink'], ['contact', 'sfx', 'kiss'], ['contact', 'mouthOpen', 220], ['contact', 'shake', 2], ['contact', 'punch', 0.04], ['contact', 'ghost']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ death / respawn / emotes

/** Swoon: paw to the forehead, a fainting pirouette, wings fold as she sinks, feathers drift. */
const death: ClipDef = {
  id: 'gabe.death',
  len: 1.15,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, S, null],
    [0.14, S, { shoulderR: [-2.3, 0, 0.35], elbowR: [-1.9, 0, 0], head: [-0.45, 0, -0.25], chest: [-0.35, 0, 0.1], shoulderL: [0.1, 0, 1.2], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] }, 'expoOut'],
    [0.45, S, { shoulderR: [-2.2, 0, 0.3], elbowR: [-2.0, 0, 0], head: [-0.5, 0, -0.3], chest: [-0.3, 0, 0.15], shoulderL: [-0.4, 0, 1.6], kneeL: [0.6, 0, 0], kneeR: [0.5, 0, 0] }, 'inOut'],
    [0.75, S, { shoulderL: [-1.1, 0, -0.55], shoulderR: [-1.1, 0, 0.55], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0], head: [0.2, 0, 0.2], chest: [0.2, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'inOut'],
    [1.15, 'faint', null, 'in'],
  ],
  root: {
    yaw: [[0, 0], [0.16, 0], [0.46, 1, 'inOut'], [0.46 + WRAP, 0, 'step'], [1.15, 0]],
    up: [[0, 0], [0.14, 0], [0.3, 0.16, 'out'], [0.46, 0, 'in'], [1.15, 0]],
    fwd: [[0, 0], [0.14, -0.12, 'expoOut'], [0.75, -0.25, 'inOut'], [1.15, -0.4, 'out']],
    sy: [[0, 1], [0.46, 1], [0.52, 0.9], [0.6, 1], [1.1, 1], [1.15, 0.85, 'in']],
  },
  calm: { yaw: 0 },
  markers: { contact: 0, swoon: 0.14, fold: 0.75, end: 1.15 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['swoon', 'sfx', 'flutter'], ['fold', 'fx', 'feathers'], [1.15, 'land']],
  cancel: 'none',
};

/** Respawn: glides down from 1.2 m on beating wings, lands on tiptoe, curtsies. */
const respawn: ClipDef = {
  id: 'gabe.respawn',
  len: 1.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, S, merge(wings(-0.7, 1.75), { thighL: [0.15, 0, 0], thighR: [0.05, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.2, 0, 0], head: [-0.2, 0, 0] })],
    [0.14, S, merge(wings(0.05, 0.8), { thighL: [0.15, 0, 0], kneeL: [0.35, 0, 0], head: [-0.1, 0, 0] }), 'inOut'],
    [0.3, S, merge(wings(-0.75, 1.8), { thighL: [0.15, 0, 0], kneeL: [0.35, 0, 0], head: [-0.2, 0, 0] }), 'inOut'],
    [0.44, S, merge(wings(0.05, 0.8), { thighL: [-0.1, 0, 0], kneeL: [0.25, 0, 0] }), 'inOut'],
    [0.56, S, merge(wings(-0.5, 1.3), { thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], chest: [0.2, 0, 0] }), 'in'],
    [0.8, S, { shoulderL: [0.25, 0, 0.65], shoulderR: [0.25, 0, -0.65], chest: [0.32, 0, 0], head: [0.25, 0, 0.22], thighR: [0.5, 0, 0.3], kneeR: [0.7, 0, 0], kneeL: [0.85, 0, 0], thighL: [-0.3, 0, 0] }, 'out'],
    [1.0, S, { shoulderL: [0.2, 0, 0.6], shoulderR: [0.2, 0, -0.6], chest: [0.28, 0, 0], head: [0.2, 0, 0.2], thighR: [0.45, 0, 0.3], kneeR: [0.65, 0, 0], kneeL: [0.8, 0, 0], thighL: [-0.25, 0, 0] }, 'hold'],
    [1.2, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.14, 1.08, 'out'], [0.3, 0.96, 'inOut'], [0.44, 0.62, 'inOut'], [0.56, 0, 'in'], [1.2, 0]],
    sy: [[0, 1.08], [0.52, 1.05], [0.58, 0.76, 'in'], [0.72, 1.04, 'back'], [0.85, 0.92], [1.2, 1, 'inOut']],
  },
  markers: { land: 0.56, curtsy: 0.8, end: 1.2 },
  warp: [],
  cues: [[0, 'sfx', 'flutter'], [0.3, 'sfx', 'flutter'], ['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'respawnFx']],
  cancel: 'any',
};

/** Victory: a heart burst, a wing-spread spinning leap, then blown kisses to both sides. */
const victory: ClipDef = {
  id: 'gabe.victory',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, S, null],
    [0.15, S, { thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], shoulderL: [-1.2, 0, -0.5], shoulderR: [-1.2, 0, 0.5], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0], chest: [0.3, 0, 0] }, 'out'],
    [0.35, S, merge(wings(-1.2, 2.0), { head: [-0.4, 0, 0], chest: [-0.25, 0, 0], thighL: [-0.4, 0, 0.2], kneeL: [1.2, 0, 0] }), 'expoOut'],
    [0.62, S, merge(wings(-1.0, 1.9), { head: [-0.3, 0, 0] }), 'inOut'],
    [0.72, S, merge(wings(-0.5, 1.1), { kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }), 'in'],
    [0.95, S, { shoulderR: [-1.4, 0, 0.35], elbowR: [-2.1, 0, 0], chest: [-0.1, 0.4, 0], head: [-0.1, 0.25, 0.12] }, 'out'],
    [1.12, S, { shoulderR: [-1.8, 0, -0.6], elbowR: [0, 0, 0], shoulderL: [0.3, 0, 0.9], chest: [0.3, -0.4, 0], head: [0, -0.2, -0.15], thighL: [0.6, 0, 0], kneeL: [0.9, 0, 0] }, 'expoIn'],
    [1.35, S, { shoulderL: [-1.4, 0, -0.35], elbowL: [-2.1, 0, 0], chest: [-0.1, -0.4, 0], head: [-0.1, -0.25, -0.12] }, 'out'],
    [1.52, S, { shoulderL: [-1.8, 0, 0.6], elbowL: [0, 0, 0], shoulderR: [0.3, 0, -0.9], chest: [0.3, 0.4, 0], head: [0, 0.2, 0.15], thighR: [0.6, 0, 0], kneeR: [0.9, 0, 0] }, 'expoIn'],
    [1.75, S, merge(wings(-0.8, 1.5), { head: [-0.2, 0, 0.15] }), 'back'],
    [2.0, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.15, 0], [0.38, 0.55, 'out'], [0.62, 0, 'in'], [1.12, 0], [1.2, 0.1, 'out'], [1.32, 0, 'in'], [1.52, 0], [1.6, 0.1, 'out'], [1.72, 0, 'in'], [2.0, 0]],
    yaw: [[0, 0], [0.3, 0], [0.6, 1, 'inOut'], [0.6 + WRAP, 0, 'step'], [2.0, 0]],
    sy: [[0, 1], [0.15, 0.82, 'out'], [0.25, 1.15, 'out'], [0.6, 1], [0.65, 0.82, 'in'], [0.8, 1, 'back']],
  },
  calm: { yaw: 0 },
  markers: { contact: 0.35, kiss1: 1.12, kiss2: 1.52, end: 2.0 },
  warp: [],
  cues: [[0.3, 'fx', 'vBurst'], [0.3, 'sfx', 'flutter'], [0.62, 'land'], ['kiss1', 'sfx', 'kiss'], ['kiss2', 'sfx', 'kiss']],
  cancel: 'any',
};

/** Emote: a big wave over the head, a skip, a blown kiss. */
const emote: ClipDef = {
  id: 'gabe.emote',
  len: 1.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, S, null],
    [0.15, S, { shoulderR: [-2.6, 0, -0.6], elbowR: [-0.5, 0, 0], chest: [-0.1, 0, -0.08], head: [-0.15, 0, 0.12] }, 'out'],
    [0.3, S, { shoulderR: [-2.6, 0, 0.2], elbowR: [-0.5, 0, 0], chest: [-0.1, 0, 0.08], head: [-0.15, 0, -0.12] }, 'inOut'],
    [0.45, S, { shoulderR: [-2.6, 0, -0.6], elbowR: [-0.5, 0, 0], chest: [-0.1, 0, -0.08], head: [-0.15, 0, 0.12] }, 'inOut'],
    [0.6, S, { shoulderR: [-2.6, 0, 0.2], elbowR: [-0.5, 0, 0], chest: [-0.1, 0, 0.08], head: [-0.15, 0, -0.12] }, 'inOut'],
    [0.85, S, { shoulderR: [-1.35, 0, 0.35], elbowR: [-2.1, 0, 0], chest: [-0.15, 0.3, 0], head: [-0.1, 0.15, 0.12] }, 'out'],
    [1.0, S, { shoulderR: [-1.8, 0, -0.5], elbowR: [0, 0, 0], shoulderL: [0.35, 0, 1.0], chest: [0.3, -0.35, 0], thighL: [0.6, 0, 0], kneeL: [0.9, 0, 0] }, 'expoIn'],
    [1.25, S, merge(wings(-0.6, 1.3), {}), 'back'],
    [1.5, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.62, 0], [0.75, 0.22, 'out'], [0.88, 0, 'in'], [1.5, 0]],
    sy: [[0, 1], [0.62, 0.88], [0.7, 1.1], [0.88, 0.88, 'in'], [1.0, 1.05], [1.2, 1, 'back']],
  },
  markers: { contact: 1.0, end: 1.5 },
  warp: [],
  cues: [['contact', 'sfx', 'kiss'], ['contact', 'fx', 'emoteKiss']],
  cancel: 'any',
};

/** Idle: a light hover bob on her toes with slow wing breaths. */
const idle: ClipDef = {
  id: 'gabe.idle',
  len: 1.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, S, merge(wings(-0.1, 0.35), { head: [-0.05, 0, 0.06] })],
    [0.8, S, merge(wings(-0.25, 0.6), { head: [-0.1, 0, -0.04] }), 'inOut'],
    [1.6, S, merge(wings(-0.1, 0.35), { head: [-0.05, 0, 0.06] }), 'inOut'],
  ],
  root: { up: [[0, 0.02], [0.8, 0.07, 'inOut'], [1.6, 0.02, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: hugs her heart float, then tosses a little heart up and watches it pop. */
const fidgetHug: ClipDef = {
  id: 'gabe.fidgetHug',
  len: 1.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, S, null],
    [0.25, S, { shoulderL: [-1.2, 0, -0.55], shoulderR: [-1.2, 0, 0.55], elbowL: [-2.0, 0, 0], elbowR: [-2.0, 0, 0], head: [0.15, 0, 0.25], chest: [0.1, 0.15, 0] }, 'out'],
    [0.5, S, { shoulderL: [-1.2, 0, -0.55], shoulderR: [-1.2, 0, 0.55], elbowL: [-2.0, 0, 0], elbowR: [-2.0, 0, 0], head: [0.15, 0, -0.25], chest: [0.1, -0.15, 0] }, 'inOut'],
    [0.75, S, { shoulderL: [-1.2, 0, -0.55], shoulderR: [-1.2, 0, 0.55], elbowL: [-2.0, 0, 0], elbowR: [-2.0, 0, 0], head: [0.15, 0, 0.2], chest: [0.1, 0.1, 0] }, 'inOut'],
    [0.95, S, { shoulderR: [-2.7, 0, -0.2], elbowR: [0, 0, 0], head: [-0.4, 0, 0], chest: [-0.12, 0, 0] }, 'expoIn'],
    [1.3, S, { shoulderR: [-0.9, 0, -0.3], head: [-0.5, 0, 0.1], chest: [-0.12, 0, 0] }, 'out'],
    [1.6, S, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.9, 0], [1.0, 0.12, 'out'], [1.15, 0, 'in'], [1.6, 0]], sy: [[0, 1], [0.25, 0.94], [0.75, 0.94], [0.9, 1.06], [1.2, 1]] },
  markers: { toss: 0.95 },
  warp: [],
  cues: [[0.95, 'sfx', 'kiss'], [1.3, 'sfx', 'pop']],
  cancel: 'any',
};

/** Level up: a wing-flap jump with a quarter-turn wiggle. */
const levelUp: ClipDef = {
  id: 'gabe.levelUp',
  len: 0.75,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, S, null],
    [0.1, S, { thighL: [-0.35, 0, 0], thighR: [-0.35, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], shoulderL: [0.4, 0, 0.6], shoulderR: [0.4, 0, -0.6] }, 'out'],
    [0.28, S, merge(wings(-1.3, 2.0), { head: [-0.35, 0, 0], thighL: [-0.4, 0, 0.2], kneeL: [1.1, 0, 0] }), 'expoOut'],
    [0.4, S, merge(wings(-0.2, 0.8), {}), 'inOut'],
    [0.5, S, merge(wings(-1.1, 1.8), {}), 'inOut'],
    [0.75, S, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.1, 0], [0.3, 0.45, 'out'], [0.5, 0, 'in'], [0.75, 0]], sy: [[0, 1], [0.1, 0.82, 'out'], [0.2, 1.14], [0.48, 1], [0.52, 0.84, 'in'], [0.68, 1, 'back']] },
  markers: { contact: 0.28, end: 0.75 },
  warp: [],
  cues: [[0.25, 'sfx', 'flutter'], [0.5, 'land']],
  cancel: 'any',
};

const BASICS: readonly ClipDef[] = [basicA, basicB, basicC];

/** Skipping hop-run: a higher bounce and hip sway than the default, a light lean, a perky head bob. */
const gait: GaitProfile = { stride: 1.0, bounce: 1.9, lean: 0.8, hipSway: 1.35, headBob: 1.3, arms: 'flap', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'gabe',
  stub: false,
  gait,
  springs: HERO_SPRINGS.gabe,
  basic: BASICS,
  // A → B → C (the clock picks the combo index at swing start)
  basicPick: (ctx) => BASICS[ctx.comboIndex % 3],
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[fidgetHug, 1]],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Tests and the gallery: every authored clip. */
export const GABE_CLIPS: readonly ClipDef[] = [basicA, basicB, basicC, q, w, e, r, death, respawn, victory, emote, idle, fidgetHug, levelUp];
