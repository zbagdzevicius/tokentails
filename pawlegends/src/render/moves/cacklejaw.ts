/**
 * Cacklejaw move set (ANIM-SPEC §14 "Cacklejaw: Assassin, Dark, claw gauntlets"). A hunched hyena-cat that laughs at
 * everything: low raking claws, a corkscrew Jeer Slash with a somersault recast, a pointing Gloat that ends in a belly
 * laugh, a spinning dive into Bush Slink, and Pack Hunt's howl, all-fours bound, spinning maul and backflip.
 *
 * Every number that meets the sim comes from anim/timing.ts (SIM_TIMING, BASIC_CONTACT, TICK_S):
 * - basics: contact at the 8 t windup, swing start on the BasicClock; C spins from the swing start and reaches its
 *   270° point on the contact;
 * - Q: take-off on the cast tick, landing on travelEnd (progress-driven: the corkscrew / somersault ends on the dash's
 *   last tick, Long Jeer included);
 * - W / E: instant casts, impact-led (the weight is in the follow-through);
 * - R: the howl snap on the cast tick over a lunge, all-fours bounds for the hunt's sim life (30 t), the maul (`onHit`)
 *   starts on the hit itself (no homingEnd guess: the hit lands 2–30 t after the cast).
 *
 * Plain data, render only. Silhouette first: at ≈45 px tall only root motion, torso arcs and big limb shapes read.
 */
import { BASIC_CONTACT, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type Cue, type GaitProfile, type Key, type MoveCtx, type MoveSet } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

/** BuffFlag.Stealth (sim/api), kept local so this chunk carries no sim import. */
const STEALTH = 1 << 0;

const T = SIM_TIMING.cacklejaw;
const C = BASIC_CONTACT;
/** Q dash flight (s) at base range (the warp is progress-driven, so Long Jeer's 9 t needs no second clip). */
const Q_AIR = T.slots.q.dashTicks * TICK_S;
/** R: the sim hunt's lifetime (s): travelTicks(2 × range, speed) = 30 t (sim/heroes/cacklejaw.ts cast). */
const R_LIFE = travelTicks(T.slots.r.projRange * 2, T.slots.r.projSpeed) * TICK_S;
/** W: the fear (s) the laugh never outlasts. */
const W_FEAR = (abilNumbers('cacklejaw', 'w').fear ?? 24) * TICK_S;

type Pose = Partial<Record<BoneName, BoneDelta>>;

// ------------------------------------------------------------------------------------------------ basics

/** The striking arm's bones and the sign that swings it OUT to its own side (z), for side +1 (right) / −1 (left). */
const armOf = (s: number) =>
  s > 0 ? ({ sh: 'shoulderR', el: 'elbowR', osh: 'shoulderL', oel: 'elbowL', out: -1, lead: 'thighL', leadK: 'kneeL', back: 'thighR' } as const) : ({ sh: 'shoulderL', el: 'elbowL', osh: 'shoulderR', oel: 'elbowR', out: 1, lead: 'thighR', leadK: 'kneeR', back: 'thighL' } as const);

/**
 * One rake: the claw cocked high and out behind the shoulder (chest coiled away), then ripped down and across the
 * body on the contact with a lunge, overshooting past the far hip. `flank` (Pack Flank): a longer overshoot, a cackling
 * head tilt and a heavier freeze.
 */
function rake(id: string, s: 1 | -1, flank = false): ClipDef {
  const a = armOf(s);
  const o = a.out;
  const coil = C * 0.62;
  const over = flank ? 0.16 : 0.1;
  const len = C + (flank ? 0.46 : 0.36);
  const k = (p: Pose): Pose => p;
  const keys: Key[] = [
    [0, null, null],
    [coil, null, k({ chest: [-0.12, -0.75 * s, 0.1 * s], hips: [0, -0.3 * s, 0], head: [-0.2, 0.25 * s, 0], [a.sh]: [-2.5, 0, 0.75 * o], [a.el]: [-0.7, 0, 0], [a.osh]: [-0.9, 0, -0.2 * o], [a.oel]: [-0.8, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0] }), 'out'],
    [C, null, k({ chest: [0.42, 0.8 * s, -0.1 * s], hips: [0, 0.35 * s, 0], head: [0.1, -0.15 * s, 0], [a.sh]: [-0.75, 0, -0.85 * o], [a.el]: [0.05, 0, 0], [a.osh]: [0.4, 0, 0.3 * o], [a.lead]: [-0.6, 0, 0], [a.leadK]: [0.7, 0, 0], [a.back]: [0.35, 0, 0] }), 'expoIn'],
    [C + over, null, k({ chest: [0.5, 1.0 * s, -0.15 * s], hips: [0, 0.42 * s, 0], head: flank ? [-0.35, -0.2 * s, 0.45 * s] : [0.15, -0.2 * s, 0], [a.sh]: [-0.25, 0, -1.15 * o], [a.el]: [0.1, 0, 0], [a.osh]: [0.5, 0, 0.35 * o], [a.lead]: [-0.55, 0, 0], [a.leadK]: [0.65, 0, 0], [a.back]: [0.3, 0, 0] }), 'back'],
    ...(flank ? ([[C + 0.3, null, k({ chest: [-0.15, 0.3 * s, 0], head: [-0.5, 0, 0.4 * s], [a.sh]: [-0.6, 0, 0.6 * o], [a.osh]: [-0.6, 0, -0.6 * o] }), 'inOut']] as Key[]) : []),
    [len, null, null, 'inOut'],
  ];
  const cues: Cue[] = [
    [coil * 0.5, 'trailOn', s > 0 ? 'pawR' : 'pawL'],
    ['contact', 'whoosh', flank ? 'L' : 'M'],
    [C + over + 0.04, 'trailOff'],
  ];
  if (flank) cues.push(['contact', 'freeze', 60], ['contact', 'mouthOpen', 300], ['contact', 'fx', 'flank']);
  return {
    id,
    len,
    mask: 'full',
    mode: 'override',
    prio: Prio.Basic,
    blendIn: 0.05,
    blendOut: 0.14,
    keys,
    root: {
      fwd: [[0, 0], [coil, -0.05, 'out'], [C, 0.2, 'expoIn'], [C + over, 0.24, 'out'], [len, 0, 'inOut']],
      // the lunge comes back in a cocky skip (airborne), never as a slide on planted feet
      up: [[0, 0], [C + over, 0], [C + over + (len - C - over) * 0.5, 0.1, 'out'], [len, 0, 'in']],
      sy: [[0, 1], [coil, 0.9, 'out'], [C, 1.08, 'expoIn'], [C + 0.12, 1, 'out']],
      roll: [[0, 0], [coil, -0.02 * s, 'out'], [C, 0.03 * s, 'expoIn'], [len, 0, 'inOut']],
    },
    markers: { coil, contact: C, end: len },
    warp: [['contact', 'contact']],
    cues,
    lockFeet: true,
    cancel: 'afterContact',
  };
}

/**
 * C: the 360° spin double rake. The spin starts on the swing start and passes its 270° point on the contact, both
 * claws flung wide, a hop at mid-spin and a squash on the landing.
 */
function spinRake(id: string, flank = false): ClipDef {
  const len = C + (flank ? 0.5 : 0.42);
  // both claws flung flat and long (they must clear the victim's silhouette), the torso leaning into the turn
  const wide: Pose = { chest: [0.25, 0, 0.12], head: [-0.15, 0, 0.1], shoulderL: [-1.6, 0, 1.5], shoulderR: [-1.6, 0, -1.5], elbowL: [0, 0, 0], elbowR: [0, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], thighL: [-0.3, 0, 0.2], thighR: [-0.3, 0, -0.2] };
  const cues: Cue[] = [
    [0.03, 'trailOn', 'pawR'],
    [0.08, 'whoosh', 'S'],
    ['contact', 'whoosh', 'L'],
    ['contact', 'fx', 'spin'],
    [C + 0.12, 'trailOff'],
    [C + 0.1, 'land'],
  ];
  if (flank) cues.push(['contact', 'freeze', 60], ['contact', 'mouthOpen', 300], ['contact', 'fx', 'flank']);
  return {
    id,
    len,
    mask: 'full',
    mode: 'override',
    prio: Prio.Basic,
    blendIn: 0.04,
    blendOut: 0.14,
    keys: [
      [0, null, null],
      [0.07, null, { chest: [0.3, 0.6, 0], shoulderL: [-0.6, 0, -0.3], shoulderR: [-0.6, 0, 0.3], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0] }, 'out'],
      [C * 0.7, null, wide, 'out'],
      [C, null, { ...wide, chest: [0.45, -0.3, 0.1], shoulderL: [-1.3, 0, 1.2], shoulderR: [-1.3, 0, -1.2] }, 'expoIn'],
      [C + 0.12, null, { chest: [0.35, -0.4, 0], shoulderL: [-0.4, 0, 0.5], shoulderR: [-0.4, 0, -0.5], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0] }, 'out'],
      ...(flank ? ([[C + 0.32, null, { chest: [-0.2, 0, 0], head: [-0.55, 0, 0.4], shoulderL: [-0.5, 0, 1.0], shoulderR: [-0.5, 0, -1.0] }, 'inOut']] as Key[]) : []),
      [len, null, null, 'inOut'],
    ],
    root: {
      // one full turn: 270° on the contact (spec §14), the last quarter done by the landing (C + 0.1): no skid
      yaw: [[0, 0], [0.05, 0.02, 'in'], [C, -0.75, 'lin'], [C + 0.1, -1, 'out'], [len, -1]],
      up: [[0, 0], [0.07, 0], [C * 0.65, 0.4, 'out'], [C + 0.1, 0, 'in'], [len, 0]],
      // the whole body banks into the spin and rights itself on the landing
      roll: [[0, 0], [0.07, 0], [C * 0.65, 0.06, 'out'], [C + 0.1, 0, 'inOut']],
      sy: [[0, 1], [0.07, 0.85, 'out'], [0.14, 1.1, 'out'], [C + 0.08, 1.02], [C + 0.11, 0.8, 'in'], [C + 0.26, 1, 'back']],
    },
    markers: { coil: 0.07, contact: C, end: len },
    warp: [['contact', 'contact']],
    cues,
    calm: { yaw: 0, up: 0.5 },
    lockFeet: true,
    cancel: 'afterContact',
  };
}

/**
 * Ambush pounce (the first hit out of Bush Slink): a deep crouch, a leap (0.55 m apex) with both claws high, both claws
 * slammed down on the contact as the paws land, a squash, then a cackle.
 */
const pounce: ClipDef = {
  id: 'cacklejaw.pounce',
  len: C + 0.42,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  blendIn: 0.04,
  blendOut: 0.14,
  keys: [
    [0, null, null],
    [0.08, null, { body: [0.25, 0, 0], chest: [0.4, 0, 0], head: [-0.4, 0, 0], kneeL: [1.3, 0, 0], kneeR: [1.3, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], shoulderL: [0.4, 0, 0.3], shoulderR: [0.4, 0, -0.3] }, 'out'],
    [0.17, null, { body: [-0.1, 0, 0], chest: [-0.25, 0, 0], head: [-0.3, 0, 0], thighL: [-0.4, 0, 0], thighR: [0.4, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-2.7, 0, 0.35], shoulderR: [-2.7, 0, -0.35], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] }, 'out'],
    [C, null, { body: [0.3, 0, 0], chest: [0.6, 0, 0], head: [0.1, 0, 0], thighL: [-1.0, 0, 0], thighR: [-0.8, 0, 0], kneeL: [1.4, 0, 0], kneeR: [1.3, 0, 0], shoulderL: [-0.5, 0, 0.25], shoulderR: [-0.5, 0, -0.25] }, 'expoIn'],
    [C + 0.12, null, { body: [0.2, 0, 0], chest: [0.45, 0, 0], head: [-0.2, 0, 0.2], kneeL: [1.1, 0, 0], kneeR: [1.1, 0, 0], thighL: [-0.8, 0, 0], thighR: [-0.7, 0, 0], shoulderL: [-0.3, 0, 0.4], shoulderR: [-0.3, 0, -0.4] }, 'out'],
    [C + 0.27, null, { chest: [-0.2, 0, 0], head: [-0.55, 0, 0.35], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.6, 0, -0.9], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }, 'out'],
    [C + 0.42, null, null, 'inOut'],
  ],
  root: {
    // the leap, then a cackling hop back off the victim: the 0.28 m comes back only while airborne (no moonwalk)
    up: [[0, 0], [0.08, 0], [0.17, 0.55, 'out'], [C, 0, 'in'], [C + 0.14, 0], [C + 0.22, 0.2, 'out'], [C + 0.32, 0, 'in'], [C + 0.42, 0]],
    fwd: [[0, 0], [0.08, -0.08, 'out'], [C, 0.28, 'in'], [C + 0.14, 0.28], [C + 0.32, 0, 'inOut'], [C + 0.42, 0]],
    pitch: [[0, 0], [0.08, 0.02], [0.17, -0.04, 'out'], [C, 0.06, 'in'], [C + 0.2, 0, 'out']],
    sy: [[0, 1], [0.08, 0.78, 'out'], [0.13, 1.15, 'out'], [C - 0.02, 1.04], [C, 0.7, 'expoIn'], [C + 0.14, 0.92, 'out'], [C + 0.2, 1.06, 'out'], [C + 0.31, 1], [C + 0.34, 0.88, 'in'], [C + 0.42, 1, 'back']],
  },
  markers: { coil: 0.08, takeoff: 0.08, contact: C, end: C + 0.42 },
  warp: [['contact', 'contact']],
  cues: [
    [0.08, 'whoosh', 'M'],
    [0.08, 'earsBack'],
    [0.09, 'ghost'],
    [0.12, 'trailOn', 'pawR'],
    ['contact', 'land'],
    ['contact', 'dust'],
    ['contact', 'freeze', 60],
    ['contact', 'fx', 'pounce'],
    [C + 0.1, 'trailOff'],
    [C + 0.2, 'mouthOpen', 250],
    [C + 0.32, 'land'],
  ],
  calm: { up: 0.5 },
  lockFeet: true,
  cancel: 'afterContact',
};

const basicA = rake('cacklejaw.basicA', -1);
const basicB = rake('cacklejaw.basicB', 1);
const basicC = spinRake('cacklejaw.basicC');
const FLANK: readonly ClipDef[] = [rake('cacklejaw.flankA', -1, true), rake('cacklejaw.flankB', 1, true), spinRake('cacklejaw.flankC', true)];

/** Out of stealth: the pounce; Pack Flank (target turned away): the heavier rake of the same combo step. No allocation. */
function basicPick(ctx: MoveCtx): ClipDef | null {
  if (ctx.stealthed) return pounce;
  if (ctx.targetBehind) return FLANK[ctx.comboIndex % 3];
  return null;
}

// ------------------------------------------------------------------------------------------------ Q Jeer Slash

const Q0 = 0.06;
const Q1 = Q0 + Q_AIR;
/** The corkscrew / somersault overruns the landing by this much, so one turn takes 0.3 s (never a 12-frame pop). */
const Q_OVER = 0.3 - Q_AIR;

/** Q1: a low corkscrew sprint: pitched far forward, one barrel roll driven by the dash progress, claws trailing. */
const q1: ClipDef = {
  id: 'cacklejaw.q',
  len: Q1 + 0.42,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.16,
  keys: [
    [0, null, null],
    [Q0, null, { body: [0.35, 0, 0], chest: [0.5, 0, 0], head: [-0.6, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.4, 0, 0], shoulderL: [0.9, 0, 0.5], shoulderR: [0.9, 0, -0.5] }, 'out'],
    [Q0 + Q_AIR * 0.5, null, { body: [0.55, 0, 0], chest: [0.55, 0, 0], head: [-0.7, 0, 0], thighL: [-1.2, 0, 0], thighR: [0.6, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.2, 0, 0], shoulderL: [1.3, 0, 0.7], shoulderR: [1.3, 0, -0.7], elbowL: [0.4, 0, 0], elbowR: [0.4, 0, 0] }, 'lin'],
    [Q1, null, { body: [0.3, 0, 0], chest: [0.45, -0.6, 0], head: [-0.4, 0.4, 0], thighL: [-1.2, 0, 0.3], kneeL: [1.0, 0, 0], thighR: [0.5, 0, -0.3], kneeR: [1.4, 0, 0], shoulderL: [-0.9, 0, 1.4], shoulderR: [-0.6, 0, -1.4] }, 'out'],
    [Q1 + 0.14, null, { body: [0.15, 0, 0], chest: [0.25, -0.5, 0.15], head: [-0.45, 0.6, 0.35], thighL: [-0.7, 0, 0.3], kneeL: [0.8, 0, 0], thighR: [0.3, 0, -0.3], kneeR: [0.9, 0, 0], shoulderL: [-0.8, 0, 1.2], shoulderR: [-0.5, 0, -1.2] }, 'back'],
    [Q1 + 0.42, null, null, 'inOut'],
  ],
  root: {
    // one barrel roll over 0.3 s: the dash (0.2 s) plus 0.1 s of overrun into the follow-through
    roll: [[0, 0], [Q0, 0], [Q1 + Q_OVER, -1, 'inOut'], [Q1 + 0.42, -1]],
    up: [[0, 0], [Q0, 0], [Q0 + Q_AIR * 0.5, 0.3, 'out'], [Q1, 0, 'in'], [Q1 + 0.42, 0]],
    sy: [[0, 1], [Q0, 0.8, 'out'], [Q0 + 0.05, 1.08], [Q1 - 0.02, 1], [Q1 + 0.02, 0.76, 'in'], [Q1 + 0.2, 1, 'back']],
    yaw: [[0, 0], [Q1, 0], [Q1 + 0.12, 0.08, 'out'], [Q1 + 0.42, 0, 'inOut']],
  },
  markers: { takeoff: Q0, contact: Q0, land: Q1, end: Q1 + 0.42 },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [
    ['takeoff', 'whoosh', 'L'],
    ['takeoff', 'earsBack'],
    ['takeoff', 'dust'],
    ['takeoff', 'ghost'],
    ['takeoff', 'trailOn', 'pawL'],
    [Q0 + Q_AIR * 0.5, 'ghost'],
    ['land', 'land'],
    ['land', 'dust'],
    ['land', 'trailOff'],
    ['land', 'fx', 'qLand'],
    [Q1 + 0.1, 'mouthOpen', 260],
  ],
  calm: { roll: 0, up: 0.5 },
  cancel: 'afterContact',
};

/** Q2 (recast, hero hit): a front somersault back along the new dash, both claws cutting an X on the landing, a cackle. */
const q2: ClipDef = {
  id: 'cacklejaw.q2',
  len: Q1 + 0.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.16,
  keys: [
    [0, null, null],
    [Q0, null, { body: [0.2, 0, 0], chest: [0.3, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0], shoulderL: [-2.6, 0, 0.3], shoulderR: [-2.6, 0, -0.3] }, 'out'],
    [Q0 + Q_AIR * 0.35, null, { chest: [0.8, 0, 0], head: [0.5, 0, 0], thighL: [-1.9, 0, 0], thighR: [-1.9, 0, 0], kneeL: [2.1, 0, 0], kneeR: [2.1, 0, 0], shoulderL: [-1.2, 0, 0.3], shoulderR: [-1.2, 0, -0.3], elbowL: [-1.2, 0, 0], elbowR: [-1.2, 0, 0] }, 'out'],
    [Q0 + Q_AIR * 0.8, null, { chest: [0.4, 0, 0], thighL: [-0.8, 0, 0], thighR: [-0.8, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], shoulderL: [-2.4, 0, 0.9], shoulderR: [-2.4, 0, -0.9] }, 'inOut'],
    [Q1, null, { body: [0.25, 0, 0], chest: [0.55, 0, 0], head: [0.1, 0, 0], thighL: [-0.9, 0, 0.2], thighR: [-0.7, 0, -0.2], kneeL: [1.3, 0, 0], kneeR: [1.3, 0, 0], shoulderL: [-0.5, 0, -0.5], shoulderR: [-0.5, 0, 0.5] }, 'expoIn'],
    [Q1 + 0.16, null, { body: [0.05, 0, 0], chest: [-0.35, 0, 0], head: [-0.75, 0, 0.2], thighL: [-0.4, 0, 0.2], thighR: [-0.3, 0, -0.2], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-0.9, 0, 1.4], shoulderR: [-0.9, 0, -1.4] }, 'back'],
    [Q1 + 0.32, null, { chest: [-0.2, 0, 0], head: [-0.5, 0, -0.2], shoulderL: [-0.7, 0, 1.2], shoulderR: [-0.7, 0, -1.2] }, 'inOut'],
    [Q1 + 0.5, null, null, 'inOut'],
  ],
  root: {
    pitch: [[0, 0], [Q0, 0], [Q1 + Q_OVER, 1, 'inOut'], [Q1 + 0.5, 1]],
    up: [[0, 0], [Q0, 0], [Q0 + Q_AIR * 0.5, 0.6, 'out'], [Q1, 0, 'in'], [Q1 + 0.5, 0]],
    sy: [[0, 1], [Q0, 0.78, 'out'], [Q0 + 0.05, 1.12], [Q1 - 0.02, 1], [Q1 + 0.02, 0.7, 'in'], [Q1 + 0.2, 1, 'back']],
  },
  markers: { takeoff: Q0, contact: Q0, land: Q1, end: Q1 + 0.5 },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [
    ['takeoff', 'sfx', 'flip'],
    ['takeoff', 'earsBack'],
    ['takeoff', 'ghost'],
    ['takeoff', 'trailOn', 'pawR'],
    [Q0 + Q_AIR * 0.5, 'ghost'],
    ['land', 'land'],
    ['land', 'dustRing'],
    ['land', 'trailOff'],
    ['land', 'fx', 'q2Land'],
    ['land', 'whoosh', 'M'],
    [Q1 + 0.1, 'mouthOpen', 380],
  ],
  calm: { pitch: 0, up: 0.5 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Gloat

/** Laughter pumps: the chest and head bob back at ≈8 Hz while the arms stay flung wide. */
function laughKeys(t0: number, t1: number): Key[] {
  const out: Key[] = [];
  const step = 1 / 16;
  let i = 0;
  for (let t = t0; t < t1 - 1e-6; t += step, i++) {
    const a = i % 2 === 0;
    const fade = 1 - (t - t0) / (t1 - t0) * 0.5;
    out.push([t, null, { chest: [(a ? -0.5 : -0.3) * fade, 0, 0], head: [(a ? -0.75 : -0.45) * fade, 0, a ? 0.12 : -0.12], shoulderL: [-0.5, 0, a ? 1.45 : 1.25], shoulderR: [-0.5, 0, a ? -1.45 : -1.25], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], earL: [-0.4, 0, 0], earR: [-0.4, 0, 0] }, 'inOut']);
  }
  return out;
}

const W_C = 0.06;
const W_LEN = Math.min(W_FEAR, 0.78);
/** Gloat: a mocking point straight at the cone on the cast, then a thrown-back belly laugh (upper body: he can walk). */
const w: ClipDef = {
  id: 'cacklejaw.w',
  len: W_LEN,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.16,
  keys: [
    [0, null, null],
    [W_C * 0.7, null, { chest: [0.3, 0.35, 0], head: [0.2, 0, 0], shoulderR: [0.3, 0, -0.2], elbowR: [-1.4, 0, 0], shoulderL: [0.2, 0, 0.2] }, 'out'],
    // the point: the arm thrown up and out beside the head (never into the victim's body), the chest turned to the aim
    [W_C, null, { chest: [0.2, -0.3, 0], head: [-0.2, -0.2, 0], shoulderR: [-2.05, 0, -0.35], elbowR: [0.05, 0, 0], shoulderL: [0.1, 0, 0.9], elbowL: [-1.6, 0, 0] }, 'expoIn'],
    [W_C + 0.12, null, { chest: [0.15, -0.35, 0], head: [-0.35, -0.25, 0.15], shoulderR: [-2.1, 0, -0.4], elbowR: [0, 0, 0], shoulderL: [0.1, 0, 0.9], elbowL: [-1.6, 0, 0] }, 'hold'],
    ...laughKeys(W_C + 0.22, W_LEN - 0.14),
    [W_LEN, null, null, 'inOut'],
  ],
  root: {
    sy: [[0, 1], [W_C * 0.7, 0.92, 'out'], [W_C, 1.08, 'expoIn'], [W_C + 0.15, 1], [W_C + 0.3, 1.05], [W_C + 0.42, 0.98], [W_C + 0.54, 1.04], [W_LEN, 1, 'inOut']],
    // a jeering hop forward on the point, then the whole body rocks back with the belly laugh
    up: [[0, 0], [W_C, 0.14, 'out'], [W_C + 0.14, 0, 'in'], [W_LEN, 0]],
    pitch: [[0, 0], [W_C, 0.02, 'out'], [W_C + 0.22, -0.055, 'out'], [W_LEN - 0.14, -0.04, 'inOut'], [W_LEN, 0, 'inOut']],
  },
  markers: { coil: W_C * 0.7, contact: W_C, end: W_LEN },
  warp: [['contact', 'cast']],
  cues: [
    ['contact', 'whoosh', 'S'],
    ['contact', 'mouthOpen', 520],
    ['contact', 'fx', 'wPoint'],
    [W_C + 0.22, 'earsBack'],
  ],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ E Bush Slink

const E_C = 0.05;
const E_SPIN = 0.25;
/** Bush Slink: one fast turn diving into a low crouch, claws tucked under the chin. */
const e: ClipDef = {
  id: 'cacklejaw.e',
  len: E_C + E_SPIN + 0.22,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  blendOut: 0.18,
  keys: [
    [0, null, null],
    [E_C, null, { chest: [-0.1, 0.4, 0], head: [-0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], shoulderL: [-1.0, 0, -0.2], shoulderR: [-1.0, 0, 0.2], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0] }, 'out'],
    [E_C + E_SPIN * 0.5, null, { chest: [0.3, 0, 0], head: [0.1, 0, 0], thighL: [-1.3, 0, 0], thighR: [-1.3, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0], shoulderL: [-0.5, 0, -0.4], shoulderR: [-0.5, 0, 0.4], elbowL: [-2.0, 0, 0], elbowR: [-2.0, 0, 0] }, 'out'],
    [E_C + E_SPIN, null, { body: [0.35, 0, 0], chest: [0.55, 0, 0], head: [-0.65, 0, 0], thighL: [-1.4, 0, 0.15], thighR: [-1.2, 0, -0.15], kneeL: [2.0, 0, 0], kneeR: [1.9, 0, 0], shoulderL: [-1.3, 0, -0.1], shoulderR: [-1.3, 0, 0.1], elbowL: [-1.7, 0, 0], elbowR: [-1.7, 0, 0] }, 'in'],
    [E_C + E_SPIN + 0.22, null, { body: [0.25, 0, 0], chest: [0.45, 0, 0], head: [-0.5, 0, 0], thighL: [-1.0, 0, 0.1], thighR: [-0.9, 0, -0.1], kneeL: [1.4, 0, 0], kneeR: [1.3, 0, 0], shoulderL: [-1.1, 0, -0.1], shoulderR: [-1.1, 0, 0.1], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0] }, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [E_C, 0], [E_C + E_SPIN, 1, 'inOut'], [E_C + E_SPIN + 0.22, 1]],
    up: [[0, 0], [E_C, 0], [E_C + E_SPIN * 0.45, 0.35, 'out'], [E_C + E_SPIN, 0, 'in'], [E_C + E_SPIN + 0.22, 0]],
    sy: [[0, 1], [E_C, 0.86, 'out'], [E_C + 0.08, 1.12], [E_C + E_SPIN - 0.02, 0.95], [E_C + E_SPIN + 0.03, 0.72, 'in'], [E_C + E_SPIN + 0.22, 0.86, 'back']],
  },
  markers: { contact: E_C, dive: E_C + E_SPIN, end: E_C + E_SPIN + 0.22 },
  warp: [['contact', 'cast']],
  cues: [
    ['contact', 'whoosh', 'M'],
    ['contact', 'earsBack'],
    ['contact', 'fx', 'eSpin'],
    ['dive', 'land'],
    ['dive', 'fx', 'eDive'],
  ],
  calm: { yaw: 0, up: 0.5 },
  cancel: 'any',
};

/** While slinking: hunched over, claws tucked up, a slow sly bob (upper body; the sneak gait keeps the legs). */
const eHold: ClipDef = {
  id: 'cacklejaw.eHold',
  len: 0.9,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.18,
  blendOut: 0.2,
  keys: [
    [0, null, { chest: [0.55, 0.12, 0], head: [-0.6, -0.15, 0], shoulderL: [-1.2, 0, -0.1], shoulderR: [-1.2, 0, 0.1], elbowL: [-1.7, 0, 0], elbowR: [-1.7, 0, 0], earL: [0.4, 0, -0.2], earR: [0.4, 0, 0.2] }],
    [0.45, null, { chest: [0.6, -0.12, 0], head: [-0.55, 0.15, 0], shoulderL: [-1.3, 0, -0.1], shoulderR: [-1.1, 0, 0.1], elbowL: [-1.8, 0, 0], elbowR: [-1.6, 0, 0], earL: [0.4, 0, -0.2], earR: [0.4, 0, 0.2] }, 'inOut'],
    [0.9, null, { chest: [0.55, 0.12, 0], head: [-0.6, -0.15, 0], shoulderL: [-1.2, 0, -0.1], shoulderR: [-1.2, 0, 0.1], elbowL: [-1.7, 0, 0], elbowR: [-1.7, 0, 0], earL: [0.4, 0, -0.2], earR: [0.4, 0, 0.2] }, 'inOut'],
  ],
  root: { sy: [[0, 0.88], [0.45, 0.85, 'inOut'], [0.9, 0.88, 'inOut']] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Stealth ends: he pops up out of the crouch, claws flared, chin up ("ta-da"). */
const eEnd: ClipDef = {
  id: 'cacklejaw.eEnd',
  len: 0.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.06,
  blendOut: 0.16,
  keys: [
    [0, null, { chest: [0.5, 0, 0], head: [-0.5, 0, 0], kneeL: [1.3, 0, 0], kneeR: [1.3, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], shoulderL: [-1.1, 0, 0], shoulderR: [-1.1, 0, 0], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0] }],
    [0.16, null, { chest: [-0.25, 0, 0], head: [-0.4, 0, 0.2], shoulderL: [-2.4, 0, 0.8], shoulderR: [-2.4, 0, -0.8], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] }, 'out'],
    [0.5, null, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.16, 0.25, 'out'], [0.3, 0, 'in'], [0.5, 0]], sy: [[0, 0.85], [0.1, 1.12, 'out'], [0.3, 0.9, 'in'], [0.45, 1, 'back']] },
  markers: { contact: 0, end: 0.5 },
  warp: [['contact', 'stateEnd']],
  cues: [[0.02, 'whoosh', 'S'], [0.3, 'land']],
  calm: { up: 0.5 },
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ R Pack Hunt

const R_C = 0.04;
/** The bound starts here; the hunt can hit from the second tick on (a victim already in reach). */
const B0 = 0.1;
/** Bounds run to the sim hunt's lifetime (R_LIFE), so a far or fleeing victim is still chased on all fours. */
const B_END = R_C + R_LIFE;
const BOUND_S = 0.15;
const BOUNDS = Math.max(1, Math.round((B_END - B0) / BOUND_S));
const R_LEN = B_END + 0.22;
/** All-fours: chest pitched 1.2 rad, the arms as forelegs. `reach` alternates the fore / hind pairs of a bound. */
const fours = (reach: boolean): Pose =>
  reach
    ? { body: [0.55, 0, 0], chest: [0.7, 0, 0], head: [-0.95, 0, 0], shoulderL: [-1.5, 0, 0.15], shoulderR: [-1.5, 0, -0.15], elbowL: [0.2, 0, 0], elbowR: [0.2, 0, 0], thighL: [0.4, 0, 0], thighR: [0.45, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0], earL: [0.6, 0, -0.3], earR: [0.6, 0, 0.3] }
    : { body: [0.6, 0, 0], chest: [0.65, 0, 0], head: [-0.9, 0, 0], shoulderL: [-0.4, 0, 0.15], shoulderR: [-0.4, 0, -0.15], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], thighL: [-1.4, 0, 0], thighR: [-1.3, 0, 0], kneeL: [1.6, 0, 0], kneeR: [1.6, 0, 0], earL: [0.6, 0, -0.3], earR: [0.6, 0, 0.3] };

function boundKeys(t0: number, t1: number, n: number): Key[] {
  const out: Key[] = [];
  const span = (t1 - t0) / n;
  for (let i = 0; i < n; i++) {
    out.push([t0 + span * i + span * 0.5, null, fours(true), 'out']);
    out.push([t0 + span * (i + 1), null, fours(false), 'inOut']);
  }
  return out;
}

function boundUp(t0: number, t1: number, n: number, h: number): [number, number, ('out' | 'in')?][] {
  const out: [number, number, ('out' | 'in')?][] = [];
  const span = (t1 - t0) / n;
  for (let i = 0; i < n; i++) {
    out.push([t0 + span * i + span * 0.45, h, 'out']);
    out.push([t0 + span * (i + 1), 0, 'in']);
  }
  return out;
}

function boundSy(t0: number, t1: number, n: number): [number, number, ('out' | 'in')?][] {
  const out: [number, number, ('out' | 'in')?][] = [];
  const span = (t1 - t0) / n;
  for (let i = 0; i < n; i++) {
    out.push([t0 + span * i + span * 0.3, 1.1, 'out']);
    out.push([t0 + span * (i + 1), 0.86, 'in']);
  }
  return out;
}

/**
 * Pack Hunt. The sim hunt moves at 24 m/s from the cast tick and lands the hit the tick he is in reach (often 2–5 t
 * later), so the body is never upright while the root travels: the howl is a 40 ms snap thrown over a forward lunge,
 * then all-fours bounds (0.15 s each) for the hunt's whole sim life (30 t). The hit cuts it at once: the maul
 * (`onHit`) is the landing. Nothing is predicted, so nothing lands early or late.
 */
const r: ClipDef = {
  id: 'cacklejaw.r',
  len: R_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.04,
  blendOut: 0.16,
  keys: [
    [0, null, null],
    // the howl, already lunging: head thrown back, claws flung wide behind, the body pitched into the run
    [R_C, null, { body: [0.45, 0, 0], chest: [-0.15, 0, 0], head: [-1.0, 0, 0], shoulderL: [0.5, 0, 1.2], shoulderR: [0.5, 0, -1.2], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], thighL: [-0.9, 0, 0], kneeL: [1.0, 0, 0], thighR: [0.4, 0, 0], kneeR: [0.5, 0, 0], earL: [-0.4, 0, 0], earR: [-0.4, 0, 0] }, 'expoOut'],
    [B0, null, fours(false), 'in'],
    ...boundKeys(B0, B_END, BOUNDS),
    [R_LEN, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [B0, 0], ...boundUp(B0, B_END, BOUNDS, 0.35), [R_LEN, 0]],
    sy: [[0, 1], [R_C, 0.88, 'out'], [B0, 0.9], ...boundSy(B0, B_END, BOUNDS), [R_LEN, 1, 'back']],
  },
  markers: { contact: R_C, howl: R_C, bound: B0, end: R_LEN },
  // the mark resolves on the cast tick; everything after is time-driven at the hunt's own pace
  warp: [['contact', 'cast']],
  cues: [
    ['howl', 'mouthOpen', 260],
    ['howl', 'sfx', 'gong'],
    ['howl', 'shake', 2],
    ['howl', 'fx', 'howl'],
    ['bound', 'earsBack'],
    ['bound', 'whoosh', 'L'],
    ['bound', 'ghost'],
    [B0 + BOUND_S * 2, 'ghost'],
    [B0 + BOUND_S * 4, 'ghost'],
    [B_END, 'land'],
  ],
  cancel: 'any',
};

const M_A = 0.04;
const M_SPIN = M_A + 0.3;
const M_FLIP0 = M_SPIN + 0.04;
const M_FLIP1 = M_FLIP0 + 0.3;
const M_LEN = M_FLIP1 + 0.36;
/**
 * The maul, on the hit itself (he is at sim reach, ≈1.6–2.2 m off the victim): claws cocked high for one frame, a
 * lunge to the root cap (0.3 m) with the slam, a corkscrew rake in the air (one roll over 300 ms), a backflip off the
 * victim (300 ms) that carries the root back to 0 while airborne, and a cackle on the landing.
 */
const maul: ClipDef = {
  id: 'cacklejaw.rMaul',
  len: M_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.07,
  blendOut: 0.16,
  keys: [
    // anticipation: both claws cocked over the head
    [0, null, { body: [0.3, 0, 0], chest: [-0.1, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.7, 0, 0.5], shoulderR: [-2.7, 0, -0.5], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.5, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.0, 0, 0] }],
    [M_A, null, { body: [0.4, 0, 0], chest: [0.7, 0, 0], head: [0.2, 0, 0], thighL: [-1.0, 0, 0], thighR: [-0.7, 0, 0], kneeL: [1.4, 0, 0], kneeR: [1.3, 0, 0], shoulderL: [-0.4, 0, -0.3], shoulderR: [-0.4, 0, 0.3] }, 'expoIn'],
    [M_A + 0.08, null, { body: [0.3, 0, 0], chest: [0.5, 0.4, 0], head: [-0.2, 0, 0], shoulderL: [-1.5, 0, 1.5], shoulderR: [-1.5, 0, -1.5], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [-0.6, 0, 0.3], thighR: [-0.6, 0, -0.3], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] }, 'out'],
    [M_SPIN, null, { body: [0.2, 0, 0], chest: [0.45, -0.4, 0], head: [-0.2, 0, 0], shoulderL: [-1.3, 0, 1.5], shoulderR: [-1.3, 0, -1.5], thighL: [-0.7, 0, 0.3], thighR: [-0.7, 0, -0.3], kneeL: [1.1, 0, 0], kneeR: [1.1, 0, 0] }, 'lin'],
    [M_FLIP0, null, { body: [0.1, 0, 0], chest: [0.1, 0, 0], kneeL: [1.3, 0, 0], kneeR: [1.3, 0, 0], thighL: [-0.8, 0, 0], thighR: [-0.8, 0, 0], shoulderL: [0.3, 0, 0.5], shoulderR: [0.3, 0, -0.5] }, 'out'],
    [M_FLIP0 + 0.12, null, { chest: [0.6, 0, 0], head: [0.4, 0, 0], thighL: [-1.9, 0, 0], thighR: [-1.9, 0, 0], kneeL: [2.1, 0, 0], kneeR: [2.1, 0, 0], shoulderL: [-1.0, 0, 0.4], shoulderR: [-1.0, 0, -0.4], elbowL: [-1.3, 0, 0], elbowR: [-1.3, 0, 0] }, 'out'],
    [M_FLIP1, null, { body: [0.2, 0, 0], chest: [0.3, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0], shoulderL: [-0.8, 0, 0.9], shoulderR: [-0.8, 0, -0.9] }, 'in'],
    [M_FLIP1 + 0.14, null, { chest: [-0.45, 0, 0], head: [-0.8, 0, 0.25], shoulderL: [-0.7, 0, 1.4], shoulderR: [-0.7, 0, -1.4], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0] }, 'back'],
    [M_FLIP1 + 0.24, null, { chest: [-0.3, 0, 0], head: [-0.55, 0, -0.25], shoulderL: [-0.7, 0, 1.25], shoulderR: [-0.7, 0, -1.25] }, 'inOut'],
    [M_LEN, null, null, 'inOut'],
  ],
  root: {
    roll: [[0, 0], [M_A, 0], [M_SPIN, 1, 'inOut'], [M_LEN, 1]],
    pitch: [[0, 0], [M_FLIP0, 0], [M_FLIP1, -1, 'inOut'], [M_LEN, -1]],
    up: [[0, 0], [M_A, 0], [M_A + 0.12, 0.35, 'out'], [M_SPIN, 0.08, 'in'], [M_FLIP0, 0], [M_FLIP0 + 0.14, 1.0, 'out'], [M_FLIP1, 0, 'in'], [M_LEN, 0]],
    // the lunge closes the reach gap on the slam; the backflip carries it back, airborne, so the feet never skid
    fwd: [[0, 0], [M_A, 0.3, 'out'], [M_FLIP0, 0.3], [M_FLIP1, 0, 'inOut'], [M_LEN, 0]],
    sy: [[0, 0.9], [M_A, 0.72, 'expoIn'], [M_A + 0.08, 1.05, 'out'], [M_FLIP0 - 0.02, 1], [M_FLIP0, 0.8, 'in'], [M_FLIP0 + 0.06, 1.12, 'out'], [M_FLIP1 - 0.02, 1], [M_FLIP1 + 0.02, 0.72, 'in'], [M_FLIP1 + 0.2, 1, 'back']],
  },
  markers: { contact: 0, slam: M_A, spin: M_A, flip: M_FLIP0, land: M_FLIP1, end: M_LEN },
  warp: [['contact', 'contact']],
  cues: [
    ['contact', 'freeze', 100],
    ['contact', 'shake', 3],
    ['contact', 'punch', 0.05],
    ['contact', 'sfx', 'bodyThud'],
    ['spin', 'trailOn', 'pawR'],
    ['spin', 'whoosh', 'L'],
    ['spin', 'ghost'],
    [M_SPIN, 'trailOff'],
    ['flip', 'sfx', 'flip'],
    ['flip', 'ghost'],
    ['land', 'land'],
    ['land', 'dust'],
    ['land', 'mouthOpen', 420],
    ['land', 'fx', 'cackle'],
  ],
  calm: { roll: 0, pitch: 0, up: 0.5 },
  lockFeet: true,
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ gait, idle, fidgets, emotes

/** Hunched skulking lope (≈20° lean, long stride); a long, low, belly-to-the-grass sneak in stealth. */
const GAIT: GaitProfile = {
  ...DEFAULT_GAIT,
  stride: 1.2,
  bounce: 1.35,
  lean: 2.3,
  hipSway: 0.8,
  headBob: 1.3,
  arms: 'trail',
  variants: {
    ...DEFAULT_GAIT.variants,
    sneak: { stride: 1.25, bounce: 0.3, lean: 2.6, headBob: 0.4 },
    gallop: { stride: 1.6, bounce: 2.4, lean: 2.2, hipSway: 0.4 },
    haste: { stride: 1.3, bounce: 1.3, lean: 1.4 },
  },
};

/** Idle: weight rocks foot to foot while the claws flex open and shut. */
const idle: ClipDef = {
  id: 'cacklejaw.idle',
  len: 2.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.3,
  blendOut: 0.3,
  keys: [
    [0, null, { hips: [0, 0, 0.04], chest: [0.05, 0.1, 0] }],
    [0.6, null, { hips: [0, 0, 0.06], chest: [0.08, 0.15, 0], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] }, 'inOut'],
    [1.2, null, { hips: [0, 0, -0.04], chest: [0.05, -0.1, 0] }, 'inOut'],
    [1.8, null, { hips: [0, 0, -0.06], chest: [0.08, -0.15, 0], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] }, 'inOut'],
    [2.4, null, { hips: [0, 0, 0.04], chest: [0.05, 0.1, 0] }, 'inOut'],
  ],
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: the knuckle crack: paws pressed together in front, a shoulder roll, a crack and a smug shake out. */
const knuckles: ClipDef = {
  id: 'cacklejaw.knuckles',
  len: 1.3,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.15,
  blendOut: 0.2,
  keys: [
    [0, null, null],
    [0.25, null, { chest: [0.25, 0, 0], head: [0.2, 0, 0], shoulderL: [-1.1, 0, -0.5], shoulderR: [-1.1, 0, 0.5], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0] }, 'inOut'],
    [0.45, null, { chest: [0.15, 0, 0], head: [0.25, 0, 0], shoulderL: [-1.3, 0, -0.6], shoulderR: [-1.3, 0, 0.6], elbowL: [-1.1, 0, 0], elbowR: [-1.1, 0, 0] }, 'inOut'],
    [0.5, null, { chest: [0.3, 0, 0], head: [0.3, 0, 0], shoulderL: [-1.0, 0, -0.5], shoulderR: [-1.0, 0, 0.5], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0] }, 'expoIn'],
    [0.75, null, { chest: [-0.15, 0.25, 0], head: [-0.35, 0.3, 0.2], shoulderL: [-0.3, 0, 0.9], shoulderR: [-0.3, 0, -0.9], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0] }, 'back'],
    [0.95, null, { chest: [-0.1, -0.2, 0], head: [-0.25, -0.2, -0.15], shoulderL: [-0.4, 0, 0.75], shoulderR: [-0.4, 0, -0.75] }, 'inOut'],
    [1.3, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.5, 0.96, 'in'], [0.6, 1.04, 'out'], [0.8, 1, 'inOut']] },
  markers: { crack: 0.5 },
  warp: [],
  cues: [[0.5, 'sfx', 'clang']],
  cancel: 'any',
};

/** Fidget: a snicker: a paw over the muzzle, the shoulders bobbing with held-in laughter. */
const snicker: ClipDef = {
  id: 'cacklejaw.snicker',
  len: 1.2,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.15,
  blendOut: 0.2,
  keys: [
    [0, null, null],
    [0.2, null, { chest: [0.35, 0.3, 0], head: [0.35, 0.3, 0.2], shoulderR: [-1.6, 0, 0.7], elbowR: [-1.9, 0, 0], shoulderL: [0.1, 0, 0.3] }, 'out'],
    ...[0.3, 0.42, 0.54, 0.66, 0.78, 0.9].map((t, i): Key => [t, null, { chest: [i % 2 ? 0.25 : 0.45, 0.3, 0], head: [i % 2 ? 0.25 : 0.45, 0.3, 0.2], shoulderR: [-1.6, 0, 0.7], elbowR: [-1.9, 0, 0], shoulderL: [i % 2 ? 0.0 : 0.2, 0, 0.3] }, 'inOut']),
    [1.2, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.3, 0.97], [0.42, 1.02], [0.54, 0.97], [0.66, 1.02], [0.78, 0.97], [0.9, 1.0], [1.2, 1]] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** Fidget: an ear scratch with the hind foot, balanced on one leg, head tipped into it. */
const scratch: ClipDef = {
  id: 'cacklejaw.scratch',
  len: 1.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.18,
  blendOut: 0.22,
  keys: [
    [0, null, null],
    [0.3, null, { body: [0, 0, -0.18], chest: [0.15, 0, -0.2], head: [0.25, 0, -0.45], thighR: [-1.9, 0, -0.5], kneeR: [2.2, 0, 0], footR: [0.6, 0, 0], kneeL: [0.35, 0, 0], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.3, 0, -0.6] }, 'out'],
    ...[0.42, 0.54, 0.66, 0.78, 0.9, 1.02].map((t, i): Key => [t, null, { body: [0, 0, -0.18], chest: [0.15, 0, -0.2], head: [0.25, 0, -0.45], thighR: [i % 2 ? -1.9 : -2.15, 0, -0.5], kneeR: [i % 2 ? 2.2 : 1.9, 0, 0], footR: [0.6, 0, 0], kneeL: [0.35, 0, 0], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.3, 0, -0.6], earR: [0.5, 0, 0] }, 'inOut']),
    [1.4, null, null, 'inOut'],
  ],
  root: { side: [[0, 0], [0.3, 0.05, 'out'], [1.1, 0.05], [1.4, 0, 'inOut']], sy: [[0, 1], [0.3, 0.95], [1.1, 0.95], [1.4, 1]] },
  markers: {},
  warp: [],
  cancel: 'any',
};

/** On his back, legs in the air: shared by the victory laugh and the death (the pose rises from a sit and tips back). */
const onBack = (kick: number, arms: Pose = {}): Pose => ({
  body: [-1.25, 0, 0],
  chest: [-0.15, 0, 0],
  head: [0.35, 0, 0],
  thighL: [-1.6 + kick, 0, 0.25],
  thighR: [-1.6 - kick, 0, -0.25],
  kneeL: [0.6 + kick, 0, 0],
  kneeR: [0.6 - kick, 0, 0],
  ...arms,
});

/** Victory: a backflip into a sit, then he rolls onto his back laughing, legs kicking, and springs back up. */
const victory: ClipDef = {
  id: 'cacklejaw.victory',
  len: 2.3,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  blendOut: 0.25,
  keys: [
    [0, null, null],
    [0.1, null, { kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], shoulderL: [0.5, 0, 0.3], shoulderR: [0.5, 0, -0.3] }, 'out'],
    [0.26, null, { chest: [0.6, 0, 0], head: [0.4, 0, 0], thighL: [-1.9, 0, 0], thighR: [-1.9, 0, 0], kneeL: [2.1, 0, 0], kneeR: [2.1, 0, 0], shoulderL: [-1.0, 0, 0.4], shoulderR: [-1.0, 0, -0.4], elbowL: [-1.3, 0, 0], elbowR: [-1.3, 0, 0] }, 'out'],
    [0.46, 'sit', { chest: [0.2, 0, 0] }, 'in'],
    [0.62, 'sit', onBack(0.3, { shoulderL: [-0.8, 0, -0.6], shoulderR: [-0.8, 0, 0.6], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0] }), 'inOut'],
    ...[0.76, 0.9, 1.04, 1.18, 1.32, 1.46].map((t, i): Key => [t, 'sit', onBack(i % 2 ? 0.45 : -0.45, { head: [i % 2 ? 0.15 : 0.45, 0, i % 2 ? 0.25 : -0.25], shoulderL: [-0.8, 0, -0.6], shoulderR: [-0.8, 0, 0.6], elbowL: [-1.8, 0, 0], elbowR: [-1.8, 0, 0] }), 'inOut']),
    [1.7, 'sit', { chest: [0.3, 0, 0], head: [-0.4, 0, 0], shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6] }, 'inOut'],
    [1.95, 'clawReady', { shoulderL: [-2.6, 0, 0.7], shoulderR: [-2.6, 0, -0.7], head: [-0.45, 0, 0] }, 'out'],
    [2.3, null, null, 'inOut'],
  ],
  root: {
    pitch: [[0, 0], [0.1, 0], [0.4, -1, 'inOut'], [2.3, -1]],
    up: [[0, 0], [0.1, 0], [0.26, 0.95, 'out'], [0.46, 0, 'in'], [1.7, 0], [1.85, 0.3, 'out'], [2.0, 0, 'in'], [2.3, 0]],
    sy: [[0, 1], [0.1, 0.8, 'out'], [0.16, 1.12], [0.44, 1], [0.48, 0.75, 'in'], [0.62, 1, 'back'], [1.7, 1], [1.75, 0.85], [1.85, 1.1, 'out'], [2.02, 0.8, 'in'], [2.2, 1, 'back']],
  },
  markers: { contact: 0.1, end: 2.3 },
  warp: [],
  cues: [[0.1, 'sfx', 'flip'], [0.46, 'land'], [0.62, 'mouthOpen', 900], [2.0, 'land'], [2.0, 'dust']],
  calm: { pitch: 0, up: 0.5 },
  cancel: 'any',
};

/** Emote: the jeer: a side-to-side mocking hop, a full spin and a two-claw point-and-laugh. */
const emote: ClipDef = {
  id: 'cacklejaw.emote',
  len: 1.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  blendOut: 0.2,
  keys: [
    [0, null, null],
    [0.15, null, { chest: [0, 0.4, 0.25], head: [-0.2, 0.5, 0.3], shoulderL: [-0.4, 0, 1.3], shoulderR: [-2.5, 0, -0.3], kneeL: [0.4, 0, 0] }, 'out'],
    [0.35, null, { chest: [0, -0.4, -0.25], head: [-0.2, -0.5, -0.3], shoulderR: [-0.4, 0, -1.3], shoulderL: [-2.5, 0, 0.3], kneeR: [0.4, 0, 0] }, 'inOut'],
    [0.55, null, { chest: [0, 0.4, 0.25], head: [-0.2, 0.5, 0.3], shoulderL: [-0.4, 0, 1.3], shoulderR: [-2.5, 0, -0.3], kneeL: [0.4, 0, 0] }, 'inOut'],
    [0.7, null, { chest: [0.3, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], shoulderL: [-0.6, 0, -0.3], shoulderR: [-0.6, 0, 0.3], elbowL: [-1.5, 0, 0], elbowR: [-1.5, 0, 0] }, 'inOut'],
    [0.95, null, { chest: [0.1, 0, 0], shoulderL: [-1.2, 0, 1.4], shoulderR: [-1.2, 0, -1.4] }, 'out'],
    [1.12, null, { chest: [0.3, 0, 0], head: [-0.1, 0, 0], shoulderL: [-1.6, 0, 0.1], shoulderR: [-1.6, 0, -0.1], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [-0.5, 0, 0], kneeL: [0.5, 0, 0] }, 'expoIn'],
    [1.3, null, { chest: [-0.45, 0, 0], head: [-0.8, 0, 0.25], shoulderL: [-0.5, 0, 1.4], shoulderR: [-0.5, 0, -1.4] }, 'back'],
    [1.6, null, null, 'inOut'],
  ],
  root: {
    side: [[0, 0], [0.15, 0.15, 'out'], [0.35, -0.15, 'inOut'], [0.55, 0.15, 'inOut'], [0.7, 0, 'inOut'], [1.6, 0]],
    up: [[0, 0], [0.08, 0.18, 'out'], [0.15, 0, 'in'], [0.25, 0.18, 'out'], [0.35, 0, 'in'], [0.45, 0.18, 'out'], [0.55, 0, 'in'], [0.7, 0], [0.82, 0.45, 'out'], [0.95, 0, 'in'], [1.6, 0]],
    yaw: [[0, 0], [0.7, 0], [0.95, 1, 'inOut'], [1.6, 1]],
    sy: [[0, 1], [0.7, 0.8, 'inOut'], [0.76, 1.12, 'out'], [0.93, 1], [0.97, 0.8, 'in'], [1.12, 1.05, 'out'], [1.3, 1, 'inOut']],
  },
  markers: { contact: 1.12, end: 1.6 },
  warp: [],
  cues: [[0.7, 'whoosh', 'M'], [0.95, 'land'], [1.12, 'mouthOpen', 450]],
  calm: { yaw: 0, up: 0.5 },
  cancel: 'any',
};

/** Death: a stagger, a full spin out, a flop onto his back, claws up; the body bounces once and goes still. */
const death: ClipDef = {
  id: 'cacklejaw.death',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.5,
  keys: [
    [0, null, null],
    [0.12, null, { chest: [-0.55, 0.3, 0.2], head: [-0.7, 0.2, 0], shoulderL: [-0.6, 0, 1.2], shoulderR: [-0.2, 0, -0.9], thighR: [0.4, 0, 0], kneeL: [0.4, 0, 0] }, 'expoOut'],
    [0.3, null, { chest: [0.3, -0.3, -0.2], head: [0.3, 0, 0.3], shoulderL: [-1.4, 0, 1.4], shoulderR: [-1.4, 0, -1.4], kneeL: [0.6, 0, 0], kneeR: [0.3, 0, 0] }, 'inOut'],
    [0.55, null, { chest: [-0.3, 0.2, 0.3], head: [-0.5, 0, -0.3], shoulderL: [-1.8, 0, 1.0], shoulderR: [-1.0, 0, -1.6], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], thighL: [-0.4, 0, 0] }, 'inOut'],
    [0.78, 'sit', onBack(0.15, { shoulderL: [-2.6, 0, 0.5], shoulderR: [-2.6, 0, -0.5], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] }), 'in'],
    [0.95, 'sit', onBack(-0.1, { shoulderL: [-2.4, 0, 0.7], shoulderR: [-2.4, 0, -0.7], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0], head: [0.2, 0, 0.3] }), 'out'],
    [1.25, 'sit', onBack(0, { shoulderL: [-2.5, 0, 0.6], shoulderR: [-2.5, 0, -0.6], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], head: [0.25, 0, 0.45], earL: [0.5, 0, -0.4], earR: [0.5, 0, 0.4] }), 'inOut'],
    [2.0, null, null, 'hold'],
  ],
  root: {
    fwd: [[0, 0], [0.12, -0.25, 'expoOut'], [0.55, -0.4, 'inOut'], [0.78, -0.5, 'in'], [2.0, -0.5]],
    yaw: [[0, 0], [0.22, 0], [0.5, 1, 'inOut'], [2.0, 1]],
    up: [[0, 0], [0.2, 0.15, 'out'], [0.55, 0.1], [0.78, 0, 'in'], [0.88, 0.12, 'out'], [0.98, 0, 'in'], [2.0, 0]],
    sy: [[0, 1], [0.76, 1], [0.8, 0.82, 'in'], [0.95, 1, 'back']],
  },
  markers: { contact: 0, end: 2.0 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], [0.15, 'whoosh', 'M'], [0.78, 'sfx', 'bodyThud'], [0.8, 'dust']],
  calm: { yaw: 0 },
  cancel: 'none',
};

/** Respawn: dropped from the sky in a front flip, a three-point landing (one claw on the grass), a sneer. */
const respawn: ClipDef = {
  id: 'cacklejaw.respawn',
  len: 1.05,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, { chest: [0.6, 0, 0], head: [0.4, 0, 0], thighL: [-1.9, 0, 0], thighR: [-1.9, 0, 0], kneeL: [2.1, 0, 0], kneeR: [2.1, 0, 0], shoulderL: [-1.0, 0, 0.4], shoulderR: [-1.0, 0, -0.4], elbowL: [-1.3, 0, 0], elbowR: [-1.3, 0, 0] }],
    [0.3, null, { chest: [0.3, 0, 0], thighL: [-0.7, 0, 0], thighR: [-0.7, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], shoulderL: [-2.2, 0, 0.6], shoulderR: [-2.2, 0, -0.6] }, 'out'],
    [0.38, null, { body: [0.35, 0, 0], chest: [0.75, 0, 0], head: [-0.5, 0, 0], thighL: [-1.5, 0, 0.2], thighR: [0.2, 0, -0.2], kneeL: [1.9, 0, 0], kneeR: [2.0, 0, 0], shoulderR: [-1.1, 0, 0.1], elbowR: [0.1, 0, 0], shoulderL: [-0.2, 0, 1.3] }, 'in'],
    [0.7, null, { body: [0.3, 0, 0], chest: [0.65, 0, 0], head: [-0.55, 0.2, 0.15], thighL: [-1.4, 0, 0.2], thighR: [0.15, 0, -0.2], kneeL: [1.8, 0, 0], kneeR: [1.9, 0, 0], shoulderR: [-1.1, 0, 0.1], shoulderL: [-0.2, 0, 1.3] }, 'hold'],
    [0.85, null, { chest: [-0.2, 0, 0], head: [-0.5, -0.2, 0.2], shoulderL: [-0.4, 0, 1.0], shoulderR: [-0.4, 0, -1.0] }, 'out'],
    [1.05, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.38, 0, 'in'], [1.05, 0]],
    pitch: [[0, 0], [0.3, 1, 'out'], [1.05, 1]],
    sy: [[0, 1.12], [0.36, 1.1], [0.4, 0.68, 'in'], [0.6, 1, 'back'], [0.7, 1], [0.78, 1.1, 'out'], [0.95, 1, 'inOut']],
  },
  markers: { land: 0.38, end: 1.05 },
  warp: [],
  cues: [[0.02, 'sfx', 'flip'], ['land', 'land'], ['land', 'dustRing'], [0.8, 'mouthOpen', 300]],
  calm: { pitch: 0 },
  cancel: 'any',
};

/** Level up: a crouch, a spinning hop with the claws flung up, a squash. */
const levelUp: ClipDef = {
  id: 'cacklejaw.levelUp',
  len: 0.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.06,
  blendOut: 0.18,
  keys: [
    [0, null, null],
    [0.1, null, { kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], chest: [0.3, 0, 0], shoulderL: [0.3, 0, 0.3], shoulderR: [0.3, 0, -0.3] }, 'out'],
    [0.3, null, { chest: [-0.3, 0, 0], head: [-0.5, 0, 0], shoulderL: [-2.7, 0, 0.5], shoulderR: [-2.7, 0, -0.5], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] }, 'out'],
    [0.7, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 0], [0.1, 0], [0.3, 0.5, 'out'], [0.48, 0, 'in'], [0.7, 0]],
    yaw: [[0, 0], [0.16, 0], [0.45, 1, 'inOut'], [0.7, 1]],
    sy: [[0, 1], [0.1, 0.8, 'out'], [0.18, 1.12], [0.46, 1], [0.5, 0.78, 'in'], [0.66, 1, 'back']],
  },
  markers: { contact: 0.1, end: 0.7 },
  warp: [],
  cues: [[0.1, 'whoosh', 'M'], [0.48, 'land']],
  calm: { yaw: 0, up: 0.5 },
  cancel: 'any',
};

export const MOVES: MoveSet = {
  hero: 'cacklejaw',
  stub: false,
  gait: GAIT,
  springs: HERO_SPRINGS.cacklejaw,
  basic: [basicA, basicB, basicC],
  basicPick,
  slots: {
    q: { cast: q1, recasts: [q2] },
    w: { cast: w },
    // the slink lasts while Stealth is up (brush extends it, an attack breaks it): the director ends the state on the
    // Stealth bit's falling edge (endOnBuff), not on cast + 90 t
    e: { cast: e, hold: eHold, end: eEnd, endOnBuff: STEALTH },
    r: { cast: r, onHit: maul },
  },
  idle,
  fidgets: [
    [knuckles, 2],
    [snicker, 2],
    [scratch, 1],
  ],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Clips reached only through basicPick / slot extras (the gallery capture and the tests look them up here). */
export const EXTRA: Readonly<Record<string, ClipDef>> = Object.freeze({ pounce, flankA: FLANK[0], flankB: FLANK[1], flankC: FLANK[2], flank: FLANK[0], eHold, eEnd, maul, q2 });

