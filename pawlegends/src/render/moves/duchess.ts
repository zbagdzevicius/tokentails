/**
 * Duchess move set (sim v11; build spec docs/plans/moba/CATS-V11.md §2.3 "Moves and VFX"). A vain Persian who never
 * walks: she floats on her cushion (render/chars/heroes/duchess.ts wears it at shin height, so the legs never show and
 * the clips key the upper body and the root). Every move is a snub: the nose goes up, the paw flicks, the chin turns
 * away, and only the ult brings her down off her dignity with a stamp.
 *
 * Timing contract (all from timing.ts and her hero data, never literals):
 * - basics: release at the 8 t windup (BASIC_CONTACT) on the bolt spawn ("hmph" puff bolts); A a paw flick with the
 *   chin up, B a back-hand comb flick. Upper mask: the root stays within a few centimetres (she kites on her own glide).
 * - Q Fluff Puff: instant (contact = cast), a two-paw shove with a cheek puff, a soft bob back onto the cushion.
 * - W Not Amused: the snooty turn-away on windupStart, the glare snaps round on the cast (the cone hits there).
 * - E Cushion Glide: take-off on the cast, the landing bound to travelEnd at her own glide speed (abil e.speed, slower
 *   than the shared dash speed): travelTicks(e.dash, e.speed) after the cast.
 * - R Royal Decree: she rises over the windup with the comb raised like a sceptre, then the stamp on the cast.
 *
 * Whole-turn root rotations step back to 0 right after they complete, so a blend-out never unwinds a spin.
 */
import { BASIC_CONTACT, HERO_SPRINGS } from '../anim/common';
import type { BoneName } from '../chars/skeleton';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveSet } from '../anim/types';
import { DEFAULT_GAIT } from '../anim/common';

type D = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.duchess.slots;
/** Basic release (s): the 8 t windup. */
const C = BASIC_CONTACT;
/** Cushion Glide flight (ticks, s) at her own glide speed (slotTimingFrom reads the slot's `speed` for a dash). */
export const E_TICKS = T.e.dashTicks;
const E_AIR = E_TICKS * TICK_S;
/** Not Amused and Royal Decree windups (s). */
const W_WIND = T.w.windup * TICK_S;
const R_WIND = T.r.windup * TICK_S;
/** Every key builds on her FK stand (both paws free). */
const S = 'stand';
/** A whole-turn wrap: back to 0 one millisecond after the turn completes. */
const WRAP = 0.001;

const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;
/** Chin up, eyes half shut, face turned to her left (`side` −1: to her right): the snub. */
const snub = (side = 1, k = 1): D => ({ head: [-0.4 * k, 0.55 * side * k, 0.12 * side * k], chest: [-0.12 * k, 0.2 * side * k, 0] });
/** Paws on her hips (akimbo): elbows out. */
const akimbo: D = { shoulderL: [0.15, 0, 0.75], shoulderR: [0.15, 0, -0.75], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

/** A: "hmph". The chin goes up and away while the right paw flicks a puff of fur at them. */
const basicA: ClipDef = {
  id: 'duchess.basicA',
  len: C + 0.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, S, null],
    [C * 0.6, S, merge(snub(1, 0.6), { shoulderR: [-0.6, 0, 0.5], elbowR: [-1.9, 0, 0] }), 'out'],
    [C, S, merge(snub(1, 1), { shoulderR: [-1.5, 0, -0.35], elbowR: [-0.1, 0, 0] }), 'expoIn'],
    [C + 0.14, S, merge(snub(1, 1.05), { shoulderR: [-1.6, 0, -0.5], elbowR: [0, 0, 0] }), 'back'],
    [C + 0.28, S, merge(snub(1, 0.5), { shoulderR: [-0.4, 0, -0.2] }), 'inOut'],
    [C + 0.4, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [C * 0.6, 0.02], [C + 0.06, 0.05, 'out'], [C + 0.4, 0, 'inOut']],
    pitch: [[0, 0], [C * 0.6, -0.02], [C, 0.02, 'expoIn'], [C + 0.4, 0, 'inOut']],
    sy: [[0, 1], [C * 0.6, 1.05, 'out'], [C, 0.95, 'expoIn'], [C + 0.2, 1.02], [C + 0.4, 1, 'inOut']],
  },
  markers: { coil: C * 0.6, contact: C, end: C + 0.4 },
  warp: [['contact', 'release']],
  cues: [['contact', 'sfx', 'pop'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'd:puff']],
  cancel: 'afterContact',
};

/** B: a back-hand flick with the silver comb, the face turned the other way. */
const basicB: ClipDef = {
  id: 'duchess.basicB',
  len: C + 0.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.06,
  keys: [
    [0, S, null],
    [C * 0.6, S, merge(snub(-1, 0.5), { chest: [0, 0.6, 0], shoulderR: [-1.2, 0, 0.9], elbowR: [-1.4, 0, 0] }), 'out'],
    [C, S, merge(snub(-1, 1), { chest: [0, -0.45, 0], shoulderR: [-1.3, 0, -1.2], elbowR: [-0.2, 0, 0] }), 'expoIn'],
    [C + 0.14, S, merge(snub(-1, 1), { chest: [0, -0.55, 0], shoulderR: [-1.25, 0, -1.4], elbowR: [0, 0, 0] }), 'back'],
    [C + 0.4, S, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [C * 0.6, 0.03], [C, -0.04, 'expoIn'], [C + 0.4, 0, 'inOut']],
    up: [[0, 0], [C, 0.03, 'expoIn'], [C + 0.4, 0, 'inOut']],
  },
  markers: { coil: C * 0.6, contact: C, end: C + 0.4 },
  warp: [['contact', 'release']],
  cues: [['contact', 'sfx', 'pop'], ['contact', 'whoosh', 'S']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ Q Fluff Puff

const Q_C = 0.1;
const Q_LAND = Q_C + 0.22;
const Q_END = Q_LAND + 0.12;
/** Both paws gather the fluff at her chest, then shove the ball out with a cheek puff; she bobs back onto the cushion. */
const q: ClipDef = {
  id: 'duchess.q',
  len: Q_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.1,
  keys: [
    [0, S, null],
    [0.05, S, { shoulderL: [-0.9, 0, -0.5], shoulderR: [-0.9, 0, 0.5], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0], chest: [-0.2, 0, 0], head: [0.1, 0, 0] }, 'out'],
    [Q_C, S, { shoulderL: [-1.5, 0, -0.1], shoulderR: [-1.5, 0, 0.1], elbowL: [0, 0, 0], elbowR: [0, 0, 0], chest: [0.3, 0, 0], head: [-0.15, 0, 0] }, 'expoIn'],
    [Q_C + 0.1, S, { shoulderL: [-1.55, 0, -0.05], shoulderR: [-1.55, 0, 0.05], chest: [0.35, 0, 0], head: [-0.2, 0, 0] }, 'back'],
    [Q_LAND, S, merge(snub(1, 0.6), { shoulderL: [-0.3, 0, 0.3], shoulderR: [-0.3, 0, -0.3] }), 'inOut'],
    [Q_END, S, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [0.05, -0.05], [Q_C, 0.08, 'expoIn'], [Q_LAND, 0, 'inOut'], [Q_END, 0]],
    up: [[0, 0], [Q_C, 0.04], [Q_C + 0.1, 0.12, 'out'], [Q_LAND, 0, 'in'], [Q_END, 0]],
    sy: [[0, 1], [0.05, 0.9, 'out'], [Q_C, 1.08, 'expoIn'], [Q_LAND, 0.92, 'in'], [Q_END, 1, 'back']],
  },
  markers: { coil: 0.05, contact: Q_C, land: Q_LAND, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'balloon'], ['contact', 'whoosh', 'M'], ['contact', 'mouthOpen', 160], ['land', 'footstep']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Not Amused

const W_LAND = W_WIND + 0.2;
const W_END = W_LAND + 0.12;
/** The windup: she turns her nose up and away. The cast: the glare snaps round at them, paws on her hips. */
const w: ClipDef = {
  id: 'duchess.w',
  len: W_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.05,
  blendOut: 0.1,
  keys: [
    [0, S, null],
    [W_WIND * 0.4, S, merge(snub(1, 1.1), akimbo), 'out'],
    [W_WIND * 0.85, S, merge(snub(1, 1.25), akimbo), 'inOut'],
    [W_WIND, S, merge(akimbo, { head: [0.15, -0.05, 0], chest: [0.25, -0.1, 0] }), 'expoIn'],
    [W_WIND + 0.08, S, merge(akimbo, { head: [0.22, -0.05, 0], chest: [0.3, -0.1, 0] }), 'back'],
    [W_LAND, S, merge(akimbo, { head: [0.05, 0, 0], chest: [0.1, 0, 0] }), 'inOut'],
    [W_END, S, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [W_WIND * 0.4, 0.05, 'out'], [W_WIND * 0.85, 0.06], [W_WIND, -0.02, 'expoIn'], [W_END, 0, 'inOut']],
    up: [[0, 0], [W_WIND * 0.85, 0.1, 'inOut'], [W_WIND, 0.02, 'expoIn'], [W_LAND, 0, 'inOut'], [W_END, 0]],
    sy: [[0, 1], [W_WIND * 0.85, 1.06], [W_WIND, 0.9, 'expoIn'], [W_LAND, 1, 'back'], [W_END, 1]],
  },
  markers: { coil: 0, contact: W_WIND, land: W_LAND, end: W_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'sfx', 'flutter'], ['contact', 'sfx', 'zap'], ['contact', 'blink'], ['contact', 'shake', 1]],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ E Cushion Glide

const E_T0 = 0.05;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.2;
/** She leans back on the cushion, paws folded, and glides: a float up, a soft settle and a cushion bounce on landing. */
const e: ClipDef = {
  id: 'duchess.e',
  len: E_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, S, null],
    [E_T0, S, { chest: [-0.2, 0, 0], head: [-0.25, 0, 0], shoulderL: [-0.7, 0, -0.45], shoulderR: [-0.7, 0, 0.45], elbowL: [-1.7, 0, 0], elbowR: [-1.7, 0, 0] }, 'out'],
    [E_T0 + E_AIR * 0.5, S, merge(snub(1, 0.8), { chest: [-0.3, 0, 0], shoulderL: [-0.7, 0, -0.45], shoulderR: [-0.7, 0, 0.45], elbowL: [-1.7, 0, 0], elbowR: [-1.7, 0, 0] }), 'inOut'],
    [E_LAND, S, merge(snub(1, 0.5), { chest: [0.15, 0, 0] }), 'in'],
    [E_LAND + 0.1, S, { chest: [-0.05, 0, 0], head: [-0.15, 0, 0] }, 'back'],
    [E_END, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [E_T0, 0.05], [E_T0 + E_AIR * 0.5, 0.3, 'out'], [E_LAND, 0, 'in'], [E_END, 0]],
    pitch: [[0, 0], [E_T0, -0.03], [E_T0 + E_AIR * 0.5, -0.04], [E_LAND, 0.02], [E_END, 0, 'inOut']],
    sy: [[0, 1], [E_T0, 0.9, 'out'], [E_T0 + 0.06, 1.06], [E_LAND - 0.02, 1], [E_LAND + 0.04, 0.84, 'in'], [E_END, 1, 'back']],
  },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  // Cushion Glide always glides the full 4 m (Aim.Dir); the landing follows the glide's progress (travelEnd)
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'L'], ['takeoff', 'ghost'], ['takeoff', 'fx', 'd:fur'], ['land', 'land'], ['land', 'fx', 'd:fur']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ R Royal Decree

const R_END = R_WIND + 0.28;
/** She rises on the cushion over the windup, the comb raised like a sceptre, and stamps the decree on the cast. */
const r: ClipDef = {
  id: 'duchess.r',
  len: R_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.05,
  blendOut: 0.12,
  keys: [
    [0, S, null],
    [R_WIND * 0.3, S, merge(snub(1, 0.6), { shoulderR: [-2.7, 0, -0.3], elbowR: [-0.3, 0, 0], shoulderL: [0.1, 0, 0.7], elbowL: [-1.5, 0, 0] }), 'out'],
    [R_WIND * 0.8, S, merge(snub(1, 1), { shoulderR: [-2.9, 0, -0.2], elbowR: [-0.1, 0, 0], shoulderL: [0.15, 0, 0.75], elbowL: [-1.6, 0, 0], chest: [-0.25, 0.1, 0] }), 'inOut'],
    [R_WIND, S, { shoulderR: [-1.2, 0, -1.3], elbowR: [0, 0, 0], shoulderL: [-1.2, 0, 1.3], elbowL: [0, 0, 0], chest: [0.35, 0, 0], head: [0.1, 0, 0] }, 'expoIn'],
    [R_WIND + 0.1, S, { shoulderR: [-1.3, 0, -1.45], shoulderL: [-1.3, 0, 1.45], chest: [0.4, 0, 0], head: [0.05, 0, 0] }, 'back'],
    [R_END, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [R_WIND * 0.2, 0.05], [R_WIND * 0.8, 0.55, 'out'], [R_WIND, 0, 'expoIn'], [R_WIND + 0.06, 0.06, 'out'], [R_WIND + 0.14, 0, 'in'], [R_END, 0]],
    sy: [[0, 1], [R_WIND * 0.2, 0.88, 'out'], [R_WIND * 0.5, 1.1, 'out'], [R_WIND * 0.9, 1.04], [R_WIND + 0.02, 0.78, 'in'], [R_WIND + 0.14, 1.06, 'back'], [R_END, 1, 'inOut']],
  },
  markers: { coil: 0, rise: R_WIND * 0.8, contact: R_WIND, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'sfx', 'flutter'], ['rise', 'fx', 'd:crown'], ['contact', 'sfx', 'gong'], ['contact', 'mouthOpen', 220], ['contact', 'shake', 2], ['contact', 'punch', 0.04], ['contact', 'dustRing']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ death / respawn / emotes

/** A swoon: the paw to the brow, a slow topple off the cushion's edge, the plume last. */
const death: ClipDef = {
  id: 'duchess.death',
  len: 1.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, S, null],
    [0.16, S, { shoulderR: [-2.4, 0, 0.3], elbowR: [-2.0, 0, 0], head: [-0.5, 0, -0.3], chest: [-0.3, 0, 0.15], shoulderL: [0.1, 0, 1.0] }, 'expoOut'],
    [0.55, S, { shoulderR: [-2.3, 0, 0.3], elbowR: [-2.0, 0, 0], head: [-0.55, 0, -0.35], chest: [-0.35, 0, 0.2], shoulderL: [-0.3, 0, 1.4] }, 'inOut'],
    [1.1, 'faint', null, 'in'],
  ],
  root: {
    up: [[0, 0], [0.16, 0.12, 'out'], [0.55, 0.1], [1.1, 0, 'in']],
    side: [[0, 0], [0.55, 0.05], [1.1, 0.35, 'in']],
    sy: [[0, 1], [0.16, 1.05], [1.0, 1], [1.1, 0.85, 'in']],
  },
  markers: { contact: 0, swoon: 0.16, end: 1.1 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['swoon', 'sfx', 'pop'], [1.1, 'land'], [1.1, 'fx', 'd:fur']],
  cancel: 'none',
};

/** Respawn: she floats down from a metre up, settles onto the cushion and smooths her fur. */
const respawn: ClipDef = {
  id: 'duchess.respawn',
  len: 1.1,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, S, merge(snub(1, 0.8), akimbo)],
    [0.55, S, merge(snub(1, 0.6), akimbo), 'inOut'],
    [0.7, S, { chest: [0.2, 0, 0], head: [0.1, 0, 0] }, 'in'],
    [0.9, 'groom', null, 'out'],
    [1.1, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.0], [0.55, 0.25, 'inOut'], [0.7, 0, 'in'], [1.1, 0]],
    sy: [[0, 1], [0.66, 1], [0.74, 0.82, 'in'], [0.9, 1.04, 'back'], [1.1, 1, 'inOut']],
  },
  markers: { land: 0.7, end: 1.1 },
  warp: [],
  cues: [['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'd:fur']],
  cancel: 'any',
};

/** Victory: a rising twirl on the cushion, then a slow royal wave with the chin high. */
const victory: ClipDef = {
  id: 'duchess.victory',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, S, null],
    [0.25, S, merge(snub(1, 0.8), akimbo), 'out'],
    [0.85, S, merge(snub(1, 1), akimbo), 'inOut'],
    [1.1, S, merge(snub(-1, 0.7), { shoulderR: [-2.5, 0, -0.5], elbowR: [-0.6, 0, 0] }), 'inOut'],
    [1.4, S, merge(snub(-1, 0.7), { shoulderR: [-2.5, 0, 0.1], elbowR: [-0.6, 0, 0] }), 'inOut'],
    [1.7, S, merge(snub(-1, 0.7), { shoulderR: [-2.5, 0, -0.5], elbowR: [-0.6, 0, 0] }), 'inOut'],
    [2.0, S, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.25, 0.3, 'out'], [0.85, 0.3], [1.1, 0.05, 'inOut'], [2.0, 0]],
    yaw: [[0, 0], [0.25, 0], [0.55, 0.5, 'in'], [0.85, 1, 'out'], [0.85 + WRAP, 0, 'step'], [2.0, 0]],
  },
  calm: { yaw: 0 },
  markers: { contact: 0.25, end: 2.0 },
  warp: [],
  cues: [[0.25, 'fx', 'd:crown'], [0.25, 'sfx', 'flutter']],
  cancel: 'any',
};

/** Emote: the full "hmph": the chin up, a paw flick, the head turned away, held. */
const emote: ClipDef = {
  id: 'duchess.emote',
  len: 1.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, S, null],
    [0.2, S, merge(snub(1, 1.2), { shoulderR: [-1.4, 0, -0.3] }), 'out'],
    [1.1, S, merge(snub(1, 1.25), akimbo), 'inOut'],
    [1.4, S, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.2, 0.08, 'out'], [1.1, 0.08], [1.4, 0, 'inOut']], sy: [[0, 1], [0.2, 1.06, 'out'], [1.1, 1.04], [1.4, 1, 'inOut']] },
  markers: { contact: 0.2, end: 1.4 },
  warp: [],
  cues: [['contact', 'sfx', 'pop'], ['contact', 'fx', 'd:puff']],
  cancel: 'any',
};

/** Idle: the float. The cushion bobs a few centimetres on a slow breath, her chin drifts. */
const idle: ClipDef = {
  id: 'duchess.idle',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, S, { head: [-0.12, 0.08, 0.04] }],
    [1.0, S, { head: [-0.18, -0.08, -0.04], chest: [-0.05, 0, 0] }, 'inOut'],
    [2.0, S, { head: [-0.12, 0.08, 0.04] }, 'inOut'],
  ],
  root: { up: [[0, 0.04], [1.0, 0.11, 'inOut'], [2.0, 0.04, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: she combs her ruff with the silver comb and admires the result. */
const fidgetComb: ClipDef = {
  id: 'duchess.fidgetComb',
  len: 1.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, S, null],
    [0.3, 'groom', null, 'out'],
    [0.6, 'groom', { head: [0.3, 0.3, 0.15] }, 'inOut'],
    [0.9, 'groom', { head: [0.22, -0.1, 0.05] }, 'inOut'],
    [1.2, 'groom', { head: [0.3, 0.3, 0.15] }, 'inOut'],
    [1.5, S, snub(1, 0.8), 'inOut'],
    [1.8, S, null, 'inOut'],
  ],
  root: { up: [[0, 0.04], [0.9, 0.08, 'inOut'], [1.8, 0.04, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Level up: a pleased rise and a little bounce on the cushion. */
const levelUp: ClipDef = {
  id: 'duchess.levelUp',
  len: 0.75,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, S, null],
    [0.25, S, merge(snub(1, 0.9), akimbo), 'out'],
    [0.5, S, merge(snub(1, 0.6), akimbo), 'inOut'],
    [0.75, S, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.25, 0.35, 'out'], [0.5, 0, 'in'], [0.75, 0]], sy: [[0, 1], [0.08, 0.86, 'out'], [0.25, 1.1], [0.52, 0.86, 'in'], [0.68, 1, 'back']] },
  markers: { contact: 0.25, end: 0.75 },
  warp: [],
  cues: [[0.5, 'land']],
  cancel: 'any',
};

const BASICS: readonly ClipDef[] = [basicA, basicB];

/** The glide: almost no stride (the legs are inside the cushion), a slow float bob, a regal lean back, paws held. */
const gait: GaitProfile = { stride: 0.3, bounce: 0.7, lean: -0.4, hipSway: 0.25, headBob: 0.35, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'duchess',
  stub: false,
  gait,
  springs: HERO_SPRINGS.duchess,
  basic: BASICS,
  // A → B (the clock picks the combo index at swing start)
  basicPick: (ctx) => BASICS[ctx.comboIndex % 2],
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[fidgetComb, 1]],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Tests and the gallery: every authored clip. */
export const DUCHESS_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, death, respawn, victory, emote, idle, fidgetComb, levelUp];
