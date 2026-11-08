/**
 * Meatball move set (sim v11; build spec docs/plans/moba/CATS-V11.md §2.1 "Moves and VFX", ANIM-SPEC §14 brief to come).
 * MoveCtx.form / MoveCtx.channel carry the snapshot's alternate-state bits.
 *
 * A round orange bouncer: every move leads with the belly and reads as a silhouette at gameplay zoom (the ball, the
 * loaf, the hop to a friend). The ball pose (head tucked, paws and legs pulled in) is the one his rolls share.
 *
 * Sim binding (numbers from anim/timing.ts, never literals):
 * - basics: swing start → contact on the melee hit at the 8 t windup (period 34 t); A belly bump, B double paw
 *   slap, C hip check with a one-turn hop spin (≤ 0.3 s, landing on the contact);
 * - Q Bowling Roll: take-off on the cast, a tucked ball whirling 2 whole yaw turns over the 9 t dash, unrolled by
 *   travelEnd (Hungry Roll's longer dash warps onto the same anchor);
 * - W Loaf Mode: drops into a loaf on the cast (instant), a breathing loaf held for the 60 t root (`hold`), a stretch
 *   on stateEnd (`end`);
 * - E Big Brother: a belly-first hop on the cast; the dash length depends on where the ally stands, so the clip binds
 *   to the cast only (a 6 t nominal air, his solo hop), then a wide guard stance over the friend;
 * - R Unstoppable Chonk: curls into a ball and swells to 1.15 on the cast, whirls as a ball for the 120 t state
 *   (`hold`, looping whole yaw turns that wrap to 0), pops out on stateEnd.
 *
 * The ball stays upright and whirls on the spot (yaw) instead of tumbling end over end (pitch): he is a chibi, not
 * a sphere, so a tumble showed him lying on his side with the bandana's mantle standing up like a plate through him.
 * Upright, the tucked pose, the swell and the spin read as a round ball from every side (verification round 2).
 *
 * Whole-turn root rotations step back to 0 right after they complete (a turn is invisible), so a blend-out never
 * unwinds a spin. Joints (common.ts conventions): thigh x < 0 forward, knee x > 0 bends, shoulder x < 0 raises the
 * arm forward, chest / hips x > 0 lean forward, head x < 0 lifts the chin.
 */
import { BASIC_CONTACT, COMMON, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import type { BoneName } from '../chars/skeleton';
import { SIM_TIMING, TICK_S, travelTicks, DASH_SPEED, abilNumbers } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';

type D = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.meatball;
/** Basic contact (s): the 8 t windup. */
const C = BASIC_CONTACT;
/** Bowling Roll air time (s) at the base 6 m. */
const Q_AIR = T.slots.q.dashTicks * TICK_S;
/** Big Brother's nominal hop (s): his solo 4 m hop at dash speed (a hop to a friend is about as long). */
const E_AIR = travelTicks(abilNumbers('meatball', 'e').soloDash ?? 4000, DASH_SPEED) * TICK_S;
/** A whole-turn wrap: back to 0 one millisecond after the turn completes. */
const WRAP = 0.001;
/** Chonk swell (root sx / sy). */
const SWELL = 1.15;
/** One Chonk ball turn (s) while the state holds. */
const SPIN = 0.36;

const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;

/** The ball: chin sunk into the chest, paws hugging the belly, knees up to it, the stub tail curled under. Upright and
 * symmetric front to back (a forward lean wobbled in the whirl). */
const BALL: D = {
  chest: [0.2, 0, 0],
  head: [0.75, 0, 0],
  shoulderL: [-0.7, 0, -0.75],
  shoulderR: [-0.7, 0, 0.75],
  elbowL: [-2.0, 0, 0],
  elbowR: [-2.0, 0, 0],
  thighL: [-1.3, 0, 0.1],
  thighR: [-1.3, 0, -0.1],
  kneeL: [2.0, 0, 0],
  kneeR: [2.0, 0, 0],
  earL: [-0.4, 0, -0.2],
  earR: [-0.4, 0, 0.2],
  tail0: [0.6, 0, 0],
};
/** The loaf: paws tucked under the chest, hind legs folded flat, chin resting forward, eyes half shut. */
const LOAF: D = {
  hips: [0.15, 0, 0],
  chest: [0.25, 0, 0],
  head: [0.18, 0, 0],
  shoulderL: [0.35, 0, -0.25],
  shoulderR: [0.35, 0, 0.25],
  elbowL: [-1.9, 0, 0],
  elbowR: [-1.9, 0, 0],
  thighL: [-1.45, 0, 0.25],
  thighR: [-1.45, 0, -0.25],
  kneeL: [2.3, 0, 0],
  kneeR: [2.3, 0, 0],
  tail0: [0.4, 0.5, 0],
};
/** Arms out wide over a friend: the guard. */
const GUARD: D = { shoulderL: [-0.9, 0, 1.3], shoulderR: [-0.9, 0, -1.3], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], chest: [-0.1, 0, 0], thighL: [-0.3, 0, 0.25], thighR: [-0.3, 0, -0.25], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

/** A: belly bump. Leans back on the coil, then drives the belly through the target with a squash and a wobble. */
const basicA: ClipDef = {
  id: 'meatball.basicA',
  len: C + 0.38,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.7, null, { chest: [-0.6, 0, 0], head: [0.2, 0, 0], shoulderL: [0.8, 0, 0.4], shoulderR: [0.8, 0, -0.4], thighL: [-0.3, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [C, null, { chest: [-0.5, 0, 0], head: [-0.25, 0, 0], shoulderL: [0.5, 0, 1.0], shoulderR: [0.5, 0, -1.0], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.45, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [-0.35, 0, 0], head: [-0.15, 0, 0], shoulderL: [0.3, 0, 0.8], shoulderR: [0.3, 0, -0.8], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.45, 0, 0] }, 'back'],
    [C + 0.26, null, { chest: [-0.1, 0, 0], thighL: [-0.6, 0, 0], kneeL: [1.4, 0, 0], thighR: [0.15, 0, 0] }, 'out'],
    [C + 0.38, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.7, -0.14, 'out'], [C, 0.26, 'expoIn'], [C + 0.12, 0.26], [C + 0.26, 0.1, 'out'], [C + 0.38, 0, 'inOut']],
    up: [[0, 0], [C * 0.5, 0.12, 'out'], [C, 0, 'in']],
    sx: [[0, 1], [C * 0.7, 0.9, 'out'], [C, 1.24, 'expoIn'], [C + 0.1, 0.96, 'out'], [C + 0.26, 1.03, 'inOut'], [C + 0.38, 1, 'inOut']],
  },
  markers: { coil: 0.04, contact: C, end: C + 0.38 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'whoosh', 'S'], ['contact', 'sfx', 'bodyThud']],
  cancel: 'afterContact',
};

/** B: double paw slap. Both paws up, then slapped down together in front with a stomp. */
const basicB: ClipDef = {
  id: 'meatball.basicB',
  len: C + 0.34,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.6, null, { chest: [-0.3, 0, 0], head: [-0.2, 0, 0], shoulderL: [-2.5, 0, 0.35], shoulderR: [-2.5, 0, -0.35], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [C, null, { chest: [0.5, 0, 0], head: [0.15, 0, 0], shoulderL: [-1.1, 0, 0.1], shoulderR: [-1.1, 0, -0.1], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [-0.4, 0, 0], kneeL: [0.6, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [0.55, 0, 0], shoulderL: [-0.9, 0, 0.2], shoulderR: [-0.9, 0, -0.2], thighL: [-0.4, 0, 0], kneeL: [0.6, 0, 0] }, 'back'],
    [C + 0.34, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.6, -0.05], [C, 0.14, 'expoIn'], [C + 0.34, 0, 'inOut']],
    up: [[0, 0], [C * 0.6, 0.1, 'out'], [C, 0, 'in']],
    sy: [[0, 1], [C * 0.6, 1.1, 'out'], [C, 0.82, 'expoIn'], [C + 0.14, 1.04, 'back'], [C + 0.3, 1, 'inOut']],
  },
  markers: { coil: 0.04, contact: C, end: C + 0.34 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'trailOn', 'pawR'], ['contact', 'whoosh', 'S'], ['contact', 'sfx', 'bodyThud'], ['contact', 'dust'], [C + 0.2, 'trailOff']],
  cancel: 'afterContact',
};

/** C: hip check. A crouch, a hop with one whole yaw turn, and the hip lands on the contact with a squash. */
const basicC: ClipDef = {
  id: 'meatball.basicC',
  len: C + 0.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.3, null, { chest: [0.2, 0, 0], shoulderL: [-0.5, 0, 0.9], shoulderR: [-0.5, 0, -0.9], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'out'],
    [C * 0.7, null, { chest: [-0.1, 0, 0.2], hips: [0, 0, 0.3], shoulderL: [-0.3, 0, 1.4], shoulderR: [-0.3, 0, -1.4], thighL: [-0.6, 0, 0], kneeL: [1.0, 0, 0] }, 'out'],
    [C, null, { chest: [0.1, 0, -0.3], hips: [0, 0, -0.4], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2], thighR: [-0.5, 0, 0], kneeR: [0.8, 0, 0] }, 'expoIn'],
    [C + 0.16, null, { chest: [0.05, 0, -0.2], hips: [0, 0, -0.25], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }, 'back'],
    [C + 0.4, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [C * 0.3, 0], [C, 1, 'inOut'], [C + WRAP, 0, 'step'], [C + 0.4, 0]],
    up: [[0, 0], [C * 0.3, 0], [C * 0.7, 0.4, 'out'], [C, 0, 'expoIn'], [C + 0.4, 0]],
    sy: [[0, 1], [C * 0.3, 0.8, 'out'], [C * 0.5, 1.12, 'out'], [C, 0.7, 'expoIn'], [C + 0.18, 1.04, 'back'], [C + 0.32, 1, 'inOut']],
  },
  calm: { yaw: 0 },
  markers: { coil: 0.04, contact: C, end: C + 0.4 },
  warp: [['contact', 'contact']],
  cues: [[C * 0.3, 'whoosh', 'M'], ['contact', 'sfx', 'bodyThud'], ['contact', 'dust'], ['contact', 'shake', 1]],
  cancel: 'afterContact',
};

const BASICS: readonly ClipDef[] = [basicA, basicB, basicC];

/** The combo swing: BasicClock picks the index when the swing starts (A, B, C, A…). */
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Bowling Roll

const Q_T0 = 0.06;
const Q_LAND = Q_T0 + Q_AIR;
const Q_END = Q_LAND + 0.2;
/** Tuck on the cast, two whole whirls along the dash, unroll by travelEnd with a bounce. */
const q: ClipDef = {
  id: 'meatball.q',
  len: Q_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, null, null],
    [Q_T0, null, BALL, 'out'],
    [Q_LAND - 0.04, null, BALL, 'hold'],
    [Q_LAND, null, merge(GUARD, { chest: [0.2, 0, 0] }), 'out'],
    [Q_END, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [Q_T0, 0], [Q_LAND - 0.04, 2, 'lin'], [Q_LAND - 0.04 + WRAP, 0, 'step'], [Q_END, 0]],
    up: [[0, 0], [Q_T0, 0.05, 'out'], [Q_T0 + Q_AIR * 0.3, 0.18, 'out'], [Q_T0 + Q_AIR * 0.6, 0.04, 'in'], [Q_LAND, 0.1, 'out'], [Q_LAND + 0.1, 0, 'in'], [Q_END, 0]],
    // pawlegends feel (skills-2): a hard squash on take-off (1.2 / 0.8), a ball stretch in the air, a squash on the unroll
    sy: [[0, 1], [Q_T0, 0.8, 'out'], [Q_T0 + 0.07, 0.92, 'back'], [Q_LAND - 0.04, 0.88], [Q_LAND, 0.78, 'in'], [Q_LAND + 0.06, 1.1, 'out'], [Q_LAND + 0.13, 0.92, 'in'], [Q_END, 1, 'back']],
    sx: [[0, 1], [Q_T0, 1.2, 'out'], [Q_T0 + 0.07, 1.08, 'back'], [Q_LAND - 0.04, 1.08], [Q_LAND, 1.22, 'in'], [Q_LAND + 0.06, 0.94, 'out'], [Q_END, 1, 'inOut']],
  },
  calm: { yaw: 0 },
  markers: { takeoff: Q_T0, contact: Q_T0, land: Q_LAND, end: Q_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'earsBack'], ['takeoff', 'whoosh', 'L'], ['takeoff', 'trailOn', 'body'], ['takeoff', 'dust'], ['land', 'trailOff'], ['land', 'land'], ['land', 'dust']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ W Loaf Mode

const W_C = 0.12;
/** Plop: a little hop and he lands flat as a loaf on the cast tick (contact). */
const w: ClipDef = {
  id: 'meatball.w',
  len: W_C + 0.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: [
    [0, null, null],
    [W_C * 0.5, null, { thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6] }, 'out'],
    [W_C, null, LOAF, 'in'],
    [W_C + 0.2, null, LOAF, 'hold'],
  ],
  root: {
    up: [[0, 0], [W_C * 0.5, 0.22, 'out'], [W_C, 0, 'in'], [W_C + 0.2, 0]],
    sy: [[0, 1], [W_C * 0.5, 1.08], [W_C, 0.7, 'in'], [W_C + 0.1, 0.84, 'back'], [W_C + 0.2, 0.82]],
    sx: [[0, 1], [W_C, 1.18, 'in'], [W_C + 0.1, 1.1, 'back'], [W_C + 0.2, 1.1]],
  },
  markers: { coil: W_C * 0.5, contact: W_C, end: W_C + 0.2 },
  // sim v17: the Loaf winds up 0.3 s (the hop's rise holds over it)
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'land'], ['contact', 'dustRing'], ['contact', 'sfx', 'bodyThud'], ['contact', 'fx', 'loafZzz']],
  cancel: 'none',
};

/** The held loaf: slow breaths (a squash in and out), the tail flicking. Loops until stateEnd. */
const wHold: ClipDef = {
  id: 'meatball.wHold',
  len: 1.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.08,
  keys: [
    [0, null, LOAF],
    [0.6, null, merge(LOAF, { head: [0.24, 0, 0.05], tail0: [0.4, -0.3, 0] }), 'inOut'],
    [1.2, null, LOAF, 'inOut'],
  ],
  root: { sy: [[0, 0.82], [0.6, 0.86, 'inOut'], [1.2, 0.82, 'inOut']], sx: [[0, 1.1], [0.6, 1.08, 'inOut'], [1.2, 1.1, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Out of the loaf: a big stretch (front paws forward, rump up), then back on his feet. */
const wEnd: ClipDef = {
  id: 'meatball.wEnd',
  len: 0.45,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.05,
  keys: [
    [0, null, LOAF],
    [0.2, null, { chest: [0.6, 0, 0], head: [-0.3, 0, 0], shoulderL: [-1.6, 0, 0.2], shoulderR: [-1.6, 0, -0.2], thighL: [0.2, 0, 0], thighR: [0.2, 0, 0] }, 'out'],
    [0.45, null, null, 'inOut'],
  ],
  root: { sy: [[0, 0.82], [0.2, 1.06, 'out'], [0.45, 1, 'inOut']], sx: [[0, 1.1], [0.2, 0.96, 'out'], [0.45, 1, 'inOut']] },
  markers: { contact: 0.2, end: 0.45 },
  warp: [['contact', 'stateEnd']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ E Big Brother

const E_T0 = 0.06;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.24;
/** Belly-first hop to the friend with the arms thrown wide, lands in the guard stance with a stomp. */
const e: ClipDef = {
  id: 'meatball.e',
  len: E_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    [0, null, null],
    [E_T0, null, { thighL: [-0.45, 0, 0], thighR: [-0.45, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], chest: [0.3, 0, 0], shoulderL: [0.6, 0, 0.4], shoulderR: [0.6, 0, -0.4] }, 'out'],
    [E_T0 + E_AIR * 0.5, null, { chest: [-0.2, 0, 0], head: [-0.3, 0, 0], shoulderL: [-1.6, 0, 1.0], shoulderR: [-1.6, 0, -1.0], thighL: [0.3, 0, 0], thighR: [0.3, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [E_LAND, null, GUARD, 'in'],
    [E_LAND + 0.12, null, merge(GUARD, { chest: [-0.2, 0, 0], head: [-0.25, 0, 0] }), 'out'],
    [E_END, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [E_T0, 0], [E_T0 + E_AIR * 0.5, 0.75, 'out'], [E_LAND, 0, 'in'], [E_END, 0]],
    pitch: [[0, 0], [E_T0 + E_AIR * 0.5, 0.05], [E_LAND, 0], [E_END, 0]],
    sy: [[0, 1], [E_T0, 0.8, 'out'], [E_T0 + 0.05, 1.12, 'out'], [E_LAND - 0.02, 1], [E_LAND + 0.04, 0.74, 'in'], [E_LAND + 0.16, 1.05, 'back'], [E_END, 1]],
  },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  // the hop length depends on where the friend stands (sim: up to 6 m, or 4 m alone): bound to the cast only
  warp: [['takeoff', 'cast']],
  cues: [['takeoff', 'dust'], ['takeoff', 'whoosh', 'M'], ['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'guardLand']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ R Unstoppable Chonk

const R_C = 0.16;
/** A puff-up: chest out, arms flexed, a hop, then curled into the swollen ball on the cast. */
const r: ClipDef = {
  id: 'meatball.r',
  len: R_C + 0.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.04,
  keys: [
    [0, null, null],
    [R_C * 0.5, null, { chest: [-0.4, 0, 0], head: [-0.4, 0, 0], shoulderL: [-0.4, 0, 1.4], shoulderR: [-0.4, 0, -1.4], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'out'],
    [R_C, null, BALL, 'in'],
    [R_C + 0.2, null, BALL, 'hold'],
  ],
  root: {
    up: [[0, 0], [R_C * 0.5, 0.35, 'out'], [R_C, 0, 'in'], [R_C + 0.2, 0]],
    sx: [[0, 1], [R_C * 0.5, 0.92], [R_C, SWELL * 1.08, 'in'], [R_C + 0.2, SWELL, 'back']],
    sy: [[0, 1], [R_C * 0.5, 1.12], [R_C, SWELL * 0.9, 'in'], [R_C + 0.2, SWELL, 'back']],
  },
  markers: { coil: R_C * 0.5, contact: R_C, end: R_C + 0.2 },
  warp: [['contact', 'cast']],
  cues: [['coil', 'mouthOpen', 160], ['contact', 'sfx', 'bodyThud'], ['contact', 'shake', 2], ['contact', 'punch', 0.04], ['contact', 'dustRing'], ['contact', 'fx', 'chonkSwell']],
  cancel: 'none',
};

/** The whirling ball for the state: one whole yaw turn per SPIN, swollen, wrapping to 0 at the loop seam. */
const rHold: ClipDef = {
  id: 'meatball.rHold',
  len: SPIN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.06,
  keys: [[0, null, BALL], [SPIN, null, BALL, 'hold']],
  root: {
    yaw: [[0, 0], [SPIN - WRAP, 1, 'lin'], [SPIN, 0, 'step']],
    up: [[0, 0.04], [SPIN * 0.5, 0.1, 'inOut'], [SPIN, 0.04, 'inOut']],
    sx: [[0, SWELL], [SPIN, SWELL]],
    sy: [[0, SWELL], [SPIN, SWELL]],
  },
  calm: { yaw: 0 },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Pop out of the ball: limbs flung wide, a shrink back to size, a proud chest puff. */
const rEnd: ClipDef = {
  id: 'meatball.rEnd',
  len: 0.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.04,
  keys: [
    [0, null, BALL],
    [0.14, null, { shoulderL: [-1.0, 0, 1.5], shoulderR: [-1.0, 0, -1.5], thighL: [-0.3, 0, 0.4], thighR: [-0.3, 0, -0.4], head: [-0.3, 0, 0], chest: [-0.2, 0, 0] }, 'expoOut'],
    [0.3, null, { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-0.2, 0, 0.7], shoulderR: [-0.2, 0, -0.7] }, 'inOut'],
    [0.5, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.14, 0.3, 'out'], [0.3, 0, 'in'], [0.5, 0]],
    sx: [[0, SWELL], [0.14, 1.05, 'out'], [0.3, 0.96], [0.5, 1, 'inOut']],
    sy: [[0, SWELL], [0.14, 1.1, 'out'], [0.3, 0.86, 'in'], [0.5, 1, 'back']],
  },
  markers: { contact: 0.14, end: 0.5 },
  warp: [['contact', 'stateEnd']],
  cues: [['contact', 'whoosh', 'S'], [0.3, 'land']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ idle / emotes / death

/** Idle: sitting like a loaf of bread, big slow belly breaths. */
const idle: ClipDef = {
  id: 'meatball.idle',
  len: 1.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, { head: [0.04, 0, 0.04] }],
    [0.9, null, { head: [-0.04, 0, -0.04], chest: [-0.06, 0, 0] }, 'inOut'],
    [1.8, null, { head: [0.04, 0, 0.04] }, 'inOut'],
  ],
  root: { sx: [[0, 1], [0.9, 1.04, 'inOut'], [1.8, 1, 'inOut']], sy: [[0, 1], [0.9, 0.97, 'inOut'], [1.8, 1, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: a belly rub and a huge yawn. */
const yawn: ClipDef = {
  id: 'meatball.yawn',
  len: 1.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  keys: [
    [0, null, null],
    [0.3, null, { shoulderL: [-0.55, 0, -0.35], elbowL: [-1.2, 0, 0], shoulderR: [-0.55, 0, 0.35], elbowR: [-1.2, 0, 0] }, 'out'],
    [0.6, null, { shoulderL: [-0.6, 0, -0.2], elbowL: [-1.3, 0, 0], shoulderR: [-0.5, 0, 0.45], elbowR: [-1.1, 0, 0] }, 'inOut'],
    [0.95, null, { head: [-0.55, 0, 0], chest: [-0.25, 0, 0], shoulderL: [-2.4, 0, 0.5], shoulderR: [-2.4, 0, -0.5] }, 'out'],
    [1.3, null, { head: [-0.5, 0, 0.1], chest: [-0.2, 0, 0], shoulderL: [-2.3, 0, 0.5], shoulderR: [-2.3, 0, -0.5] }, 'hold'],
    [1.6, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.95, 1.08, 'out'], [1.3, 1.06], [1.6, 1, 'inOut']] },
  markers: { yawn: 0.95 },
  warp: [],
  cues: [[0.95, 'mouthOpen', 380], [0.95, 'sfx', 'yawn']],
  cancel: 'any',
};

/** Victory: a belly drum, then a spin and a sit-down plop. */
const victory: ClipDef = {
  id: 'meatball.victory',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.15, null, { shoulderL: [-0.6, 0, -0.3], elbowL: [-1.3, 0, 0], shoulderR: [-0.3, 0, 0.3], elbowR: [-0.9, 0, 0] }, 'out'],
    [0.3, null, { shoulderL: [-0.3, 0, -0.3], elbowL: [-0.9, 0, 0], shoulderR: [-0.6, 0, 0.3], elbowR: [-1.3, 0, 0] }, 'inOut'],
    [0.45, null, { shoulderL: [-0.6, 0, -0.3], elbowL: [-1.3, 0, 0], shoulderR: [-0.3, 0, 0.3], elbowR: [-0.9, 0, 0] }, 'inOut'],
    [0.6, null, { shoulderL: [-0.3, 0, -0.3], elbowL: [-0.9, 0, 0], shoulderR: [-0.6, 0, 0.3], elbowR: [-1.3, 0, 0] }, 'inOut'],
    [0.95, null, merge(GUARD, { head: [-0.35, 0, 0] }), 'out'],
    [1.25, null, { shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6], head: [-0.4, 0, 0] }, 'expoOut'],
    [1.65, null, null, 'inOut'],
    [2.0, null, null, 'hold'],
  ],
  root: {
    up: [[0, 0], [0.7, 0], [0.95, 0.5, 'out'], [1.15, 0, 'in'], [2.0, 0]],
    yaw: [[0, 0], [0.75, 0], [1.05, 1, 'inOut'], [1.05 + WRAP, 0, 'step'], [2.0, 0]],
    sy: [[0, 1], [0.15, 0.96], [0.3, 1.03], [0.45, 0.96], [0.6, 1.03], [1.15, 1], [1.2, 0.76, 'in'], [1.4, 1.06, 'back'], [1.65, 1, 'inOut']],
  },
  calm: { yaw: 0 },
  markers: { contact: 1.15, end: 2.0 },
  warp: [],
  cues: [[0.15, 'sfx', 'bodyThud'], [0.45, 'sfx', 'bodyThud'], [1.15, 'land'], [1.15, 'dustRing']],
  cancel: 'any',
};

/** Emote: a belly jiggle and a thumbs-up flex. */
const emote: ClipDef = {
  id: 'meatball.emote',
  len: 1.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  keys: [
    [0, null, null],
    [0.2, null, { chest: [0, 0.3, 0], hips: [0, -0.3, 0] }, 'inOut'],
    [0.4, null, { chest: [0, -0.3, 0], hips: [0, 0.3, 0] }, 'inOut'],
    [0.6, null, { chest: [0, 0.3, 0], hips: [0, -0.3, 0] }, 'inOut'],
    [0.85, null, { shoulderR: [-1.4, 0, -0.6], elbowR: [-1.9, 0, 0], shoulderL: [-1.4, 0, 0.6], elbowL: [-1.9, 0, 0], chest: [-0.25, 0, 0], head: [-0.3, 0, 0] }, 'expoOut'],
    [1.15, null, { shoulderR: [-1.4, 0, -0.6], elbowR: [-2.0, 0, 0], shoulderL: [-1.4, 0, 0.6], elbowL: [-2.0, 0, 0], chest: [-0.3, 0, 0], head: [-0.35, 0, 0] }, 'hold'],
    [1.4, null, null, 'inOut'],
  ],
  root: { sx: [[0, 1], [0.2, 1.06], [0.4, 0.96], [0.6, 1.06], [0.85, 1, 'inOut'], [1.4, 1]], sy: [[0, 1], [0.85, 1.08, 'out'], [1.4, 1, 'inOut']] },
  markers: { contact: 0.85, end: 1.4 },
  warp: [],
  cues: [[0.85, 'sfx', 'bodyThud']],
  cancel: 'any',
};

/** Death: wobbles, tips back onto his round back with the paws up, a Zzz instead of a soul. */
const death: ClipDef = {
  id: 'meatball.death',
  len: 1.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.14, null, { chest: [-0.4, 0.2, 0.15], head: [-0.5, 0, 0], shoulderL: [-0.6, 0, 1.0], shoulderR: [-0.6, 0, -1.0] }, 'expoOut'],
    [0.5, null, { chest: [-0.6, 0, 0], head: [-0.4, 0, 0], shoulderL: [-2.6, 0, 0.5], shoulderR: [-2.6, 0, -0.5], thighL: [-1.4, 0, 0.2], thighR: [-1.4, 0, -0.2], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'inOut'],
    [1.0, 'faint', null, 'in'],
  ],
  root: {
    fwd: [[0, 0], [0.14, -0.2, 'expoOut'], [0.5, -0.4, 'inOut'], [1.0, -0.45, 'out']],
    roll: [[0, 0], [0.14, 0.03], [0.3, -0.03], [0.5, 0, 'inOut'], [1.0, 0]],
    sy: [[0, 1], [0.5, 0.92], [0.96, 1], [1.0, 0.85, 'in']],
  },
  markers: { contact: 0, flop: 0.5, end: 1.0 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['flop', 'land'], ['flop', 'fx', 'deathZzz']],
  cancel: 'none',
};

/** Waddle: short steps, a big hip sway and bounce, arms held out from the belly. */
const gait: GaitProfile = { stride: 0.75, bounce: 1.4, lean: 0.3, hipSway: 2.0, headBob: 0.8, arms: 'out', variants: DEFAULT_GAIT.variants };

// ------------------------------------------------------------------------------------------------ respawn (feel pass)

/**
 * pawlegends feel (skills-2): Meatball's own respawn. He drops in tucked as a ball and bounces three times like one,
 * squashing on every landing (1.3 / 0.7, then smaller), and pops out of the ball on the last bounce. Render only; the
 * drop stays under the 1.2 m clip cap. Markers `mbBounce` / `mbLand` throw dust from his skill FX.
 */
const RS_B1 = 0.26;
const RS_B2 = 0.5;
const RS_B3 = 0.68;
const RS_END = 1.0;
const respawn: ClipDef = {
  id: 'meatball.respawn',
  len: RS_END,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, BALL],
    [RS_B2, null, BALL, 'hold'],
    [RS_B3, null, merge(GUARD, { chest: [-0.2, 0, 0], head: [-0.25, 0, 0] }), 'back'],
    [RS_END, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [RS_B1, 0, 'in'], [RS_B1 + 0.12, 0.55, 'out'], [RS_B2, 0, 'in'], [RS_B2 + 0.09, 0.22, 'out'], [RS_B3, 0, 'in'], [RS_END, 0]],
    sy: [[0, 1.12], [RS_B1 - 0.02, 1.12], [RS_B1, 0.7, 'in'], [RS_B1 + 0.07, 1.12, 'out'], [RS_B2 - 0.02, 1.06], [RS_B2, 0.8, 'in'], [RS_B2 + 0.06, 1.06, 'out'], [RS_B3, 0.88, 'in'], [RS_B3 + 0.1, 1.08, 'back'], [RS_END, 1, 'inOut']],
    sx: [[0, 0.92], [RS_B1 - 0.02, 0.92], [RS_B1, 1.3, 'in'], [RS_B1 + 0.07, 0.92, 'out'], [RS_B2 - 0.02, 0.96], [RS_B2, 1.2, 'in'], [RS_B2 + 0.06, 0.96, 'out'], [RS_B3, 1.12, 'in'], [RS_B3 + 0.1, 0.96, 'back'], [RS_END, 1, 'inOut']],
    yaw: [[0, 0], [RS_B1, 0], [RS_B1 + SPIN * 0.9, 1, 'lin'], [RS_B1 + SPIN * 0.9 + WRAP, 0, 'step'], [RS_END, 0]],
  },
  calm: { yaw: 0 },
  markers: { b1: RS_B1, b2: RS_B2, land: RS_B3, end: RS_END },
  warp: [],
  cues: [['b1', 'land'], ['b1', 'fx', 'mbBounce'], ['b2', 'fx', 'mbBounce'], ['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'mbLand'], ['land', 'earsBack']],
  cancel: 'any',
};

export const MOVES: MoveSet = {
  hero: 'meatball',
  stub: false,
  gait,
  springs: HERO_SPRINGS.meatball,
  basic: BASICS,
  basicPick,
  slots: {
    q: { cast: q },
    w: { cast: w, hold: wHold, end: wEnd },
    e: { cast: e },
    r: { cast: r, hold: rHold, end: rEnd },
  },
  idle,
  fidgets: [[yawn, 1]],
  victory,
  emote,
  death,
  respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const MEATBALL_CLIPS: readonly ClipDef[] = [basicA, basicB, basicC, q, w, wHold, wEnd, e, r, rHold, rEnd, idle, yawn, victory, emote, death, respawn];
