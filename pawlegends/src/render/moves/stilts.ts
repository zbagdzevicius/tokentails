/**
 * Stilts's move set (sim v11; build spec docs/plans/moba/CATS-V11.md §2.4 "Moves and VFX"). Render only.
 *
 * All legs and ears: a long bounding gait (Zoomies' haste stretches it into a flat-out sprint), two quick claw swipes
 * as her basic combo, and the pounce (Long Stride at full: a short arc onto the victim with both claws raking down
 * on the contact). Q High Leap is a tall arc that takes off on the cast and lands on the sim's travel end; W Ear
 * Swivel turns the ears and the head side to side (the sonar ring is the FX); E Swat-Swat is two claw arcs, the
 * second exactly the kit's `gap` ticks after the first; R Zoomies is a butt-wiggle crouch that bursts into the sprint.
 * Timings come from SIM_TIMING and the hero data (no tick literals): basics contact at the 8 t windup, every cast is
 * instant (contact on the cast tick).
 *
 * The pounce pick reads the snapshot: Stride (`resource`, own team only) at full, or Zoomies (`form`, both teams: every
 * attack is a pounce then). `basicPick` notes it in STILTS_STATE so skillfx/stilts.ts draws the claw streaks on that
 * hit. Picks never allocate.
 */
import { BASIC_CONTACT, COMMON, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S, abilNumbers } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type Key, type MoveCtx, type MoveSet, type ScalarKey } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

type D = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.stilts;
/** Basic contact (s): the 8 t windup. */
const C = BASIC_CONTACT;
/** Basic period (s); a basic clip ends before the next swing starts. */
export const STILTS_PERIOD_S = T.period * TICK_S;
/** Swat-Swat: the second swat lands this long (s) after the first (the kit's `gap`). */
export const STILTS_SWAT_GAP_S = (abilNumbers('stilts', 'e').gap ?? 8) * TICK_S;
/** High Leap's air time (s) over its full reach at its own leap speed (the kit's `dash` / `speed`). */
export const STILTS_LEAP_S = T.slots.q.dashTicks * TICK_S;
/** Zoomies (s), from the data. */
export const STILTS_ZOOMIES_S = T.slots.r.duration * TICK_S;
/** Long Stride's full bar (the snapshot's resource reads 0..max). */
export const STRIDE_MAX = abilNumbers('stilts', 'passive').max ?? 100;

// ------------------------------------------------------------------------------------------------ shared render state

const N = 16;
/** Per-entity render state shared with skillfx/stilts.ts (ids < 16, like the director). */
export const STILTS_STATE = {
  /** 1 when the basic being played is a pounce (skillfx draws the claw streaks on its hit). */
  pounce: new Uint8Array(N),
  /** Stride (0..max) and Zoomies as the last pick saw them. */
  stride: new Uint8Array(N),
  zoom: new Uint8Array(N),
};

const isPounce = (ctx: MoveCtx): boolean => ctx.form === true || ctx.resource >= STRIDE_MAX;

// ------------------------------------------------------------------------------------------------ helpers

const k = (t: number, d: D | null, e?: Key[3], pose: string | null = null): Key => [t, pose, d, e];
const s = (...ks: ScalarKey[]): readonly ScalarKey[] => ks;
const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;
const CROUCH: D = { body: [0.2, 0, 0], chest: [0.3, 0, 0], thighL: [-0.65, 0, 0], thighR: [-0.65, 0, 0], kneeL: [1.1, 0, 0], kneeR: [1.1, 0, 0] };
/** Ears pinned back (leaps, the sprint). */
const EARS_BACK: D = { earL: [-0.7, 0, -0.2], earR: [-0.7, 0, 0.2] };
/** Ears pricked straight up and forward (listening). */
const EARS_UP: D = { earL: [0.25, 0, 0.15], earR: [0.25, 0, -0.15] };
/** Both paws raised high, claws out (the pounce and the leap's descent). */
const CLAWS_UP: D = { shoulderL: [-2.5, 0, 0.35], shoulderR: [-2.5, 0, -0.35], elbowL: [0.3, 0, 0], elbowR: [0.3, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

/** A swipe with one paw (side +1: right paw, −1: left): a hip turn, the paw raked across on the contact. */
function swipe(id: string, side: 1 | -1): ClipDef {
  const sh = side > 0 ? 'shoulderR' : 'shoulderL';
  const el = side > 0 ? 'elbowR' : 'elbowL';
  const len = C + 0.38;
  return {
    id,
    len,
    mask: 'full',
    mode: 'override',
    prio: Prio.Basic,
    keys: [
      k(0, null),
      k(C * 0.6, { chest: [0.05, 0.5 * side, 0], hips: [0, 0.2 * side, 0], [sh]: [-1.9, 0, -0.5 * side], [el]: [-0.6, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], ...EARS_BACK }, 'out'),
      k(C, { chest: [0.28, -0.6 * side, 0], hips: [0, -0.28 * side, 0], head: [0.05, -0.2 * side, 0], [sh]: [-1.1, 0, 0.9 * side], [el]: [0.1, 0, 0], thighL: [-0.45, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.3, 0, 0] }, 'expoIn'),
      k(C + 0.1, { chest: [0.22, -0.7 * side, 0], hips: [0, -0.3 * side, 0], [sh]: [-0.7, 0, 1.0 * side], thighL: [-0.4, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.25, 0, 0] }, 'out'),
      k(C + 0.22, { chest: [0.08, -0.25 * side, 0], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] }, 'inOut'),
      k(len, null, 'inOut'),
    ],
    root: {
      fwd: s([0, 0], [C * 0.6, -0.05, 'out'], [C, 0.2, 'expoIn'], [C + 0.1, 0.16, 'out'], [C + 0.26, 0, 'out'], [len, 0]),
      sy: s([0, 1], [C * 0.6, 0.92, 'out'], [C, 1.06, 'expoIn'], [C + 0.16, 1, 'out']),
    },
    lockFeet: true,
    markers: { coil: 0.02, contact: C, end: len },
    warp: [['contact', 'contact']],
    cues: [['coil', 'trailOn', side > 0 ? 'pawR' : 'pawL'], ['contact', 'whoosh', 'S'], [C + 0.14, 'trailOff']],
    cancel: 'afterContact',
  };
}

const basicA = swipe('stilts.basicA', 1);
const basicB = swipe('stilts.basicB', -1);
const BASICS: readonly ClipDef[] = [basicA, basicB];

/**
 * The pounce: the sim dashed her into reach just before this swing, so the clip is a short hop in place: a crouch,
 * a 0.55 m arc with both claws high, then both paws rake down on the contact as she lands, ears pinned.
 */
const PL = C + 0.06;
const pounce: ClipDef = {
  id: 'stilts.pounce',
  len: C + 0.46,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    k(0, null),
    k(0.06, merge(CROUCH, EARS_BACK, { shoulderL: [0.5, 0, 0.3], shoulderR: [0.5, 0, -0.3] }), 'out'),
    k(0.17, merge(CLAWS_UP, EARS_BACK, { chest: [-0.2, 0, 0], head: [-0.15, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.5, 0, 0], kneeL: [1.2, 0, 0], kneeR: [0.9, 0, 0] }), 'out'),
    k(C, merge(EARS_BACK, { body: [0.15, 0, 0], chest: [0.55, 0, 0], head: [-0.1, 0, 0], shoulderL: [-0.9, 0, 0.25], shoulderR: [-0.9, 0, -0.25], elbowL: [0.2, 0, 0], elbowR: [0.2, 0, 0], thighL: [-0.7, 0, 0], thighR: [-0.4, 0, 0], kneeL: [1.0, 0, 0], kneeR: [0.8, 0, 0] }), 'expoIn'),
    k(PL + 0.06, merge(CROUCH, { shoulderL: [-0.5, 0, 0.3], shoulderR: [-0.5, 0, -0.3] }), 'in'),
    k(C + 0.46, null, 'inOut'),
  ],
  root: {
    up: s([0, 0], [0.06, 0], [0.17, 0.55, 'out'], [PL, 0, 'in'], [C + 0.46, 0]),
    pitch: s([0, 0], [0.06, 0], [0.17, -0.03], [C, 0.05, 'in'], [PL + 0.08, 0, 'out'], [C + 0.46, 0]),
    fwd: s([0, 0], [0.06, -0.06, 'out'], [C, 0.24, 'expoIn'], [PL + 0.1, 0, 'out'], [C + 0.46, 0]),
    sy: s([0, 1], [0.06, 0.78, 'out'], [0.12, 1.14, 'out'], [PL, 1], [PL + 0.03, 0.78, 'in'], [PL + 0.2, 1, 'back']),
  },
  lockFeet: true,
  markers: { coil: 0.02, contact: C, land: PL, end: C + 0.46 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'earsBack'], [0.06, 'whoosh', 'M'], [0.06, 'trailOn', 'pawR'], ['contact', 'smear'], ['contact', 'freeze', 60], ['contact', 'shake', 1], ['contact', 'fx', 'pounce'], ['land', 'land'], ['land', 'dust'], [C + 0.2, 'trailOff']],
  cancel: 'afterContact',
};

/** Long Stride at full (or Zoomies): the pounce. Never allocates. */
function basicPick(ctx: MoveCtx): ClipDef | null {
  const p = isPounce(ctx);
  if (ctx.id >= 0 && ctx.id < N) {
    STILTS_STATE.pounce[ctx.id] = p ? 1 : 0;
    STILTS_STATE.stride[ctx.id] = Math.max(0, Math.min(255, ctx.resource | 0));
    STILTS_STATE.zoom[ctx.id] = ctx.form === true ? 1 : 0;
  }
  return p ? pounce : null;
}

// ------------------------------------------------------------------------------------------------ Q High Leap

/**
 * A tall arc: a deep crouch on the cast, take-off with the legs trailing and the ears pinned, the claws coming up
 * over the apex, and a crouched landing with the paws down on the sim's travel end (the landing hit).
 */
const QT = 0.05;
const QL = QT + STILTS_LEAP_S;
const q: ClipDef = {
  id: 'stilts.q',
  len: QL + 0.3,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    k(0, null),
    k(QT, merge(CROUCH, EARS_BACK, { shoulderL: [0.6, 0, 0.3], shoulderR: [0.6, 0, -0.3] }), 'out'),
    k(QT + STILTS_LEAP_S * 0.3, merge(EARS_BACK, { chest: [-0.25, 0, 0], head: [-0.3, 0, 0], thighL: [0.5, 0, 0], thighR: [0.7, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-1.8, 0, 0.6], shoulderR: [-1.8, 0, -0.6], tail0: [0.5, 0, 0] }), 'out'),
    k(QT + STILTS_LEAP_S * 0.7, merge(CLAWS_UP, { chest: [0.2, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0] }), 'inOut'),
    k(QL, merge(CROUCH, { shoulderL: [-0.3, 0, 0.5], shoulderR: [-0.3, 0, -0.5] }), 'in'),
    k(QL + 0.12, merge(CROUCH, { chest: [0.25, 0, 0], shoulderL: [-0.3, 0, 0.45], shoulderR: [-0.3, 0, -0.45] }), 'hold'),
    k(QL + 0.3, null, 'inOut'),
  ],
  root: {
    up: s([0, 0], [QT, 0], [QT + STILTS_LEAP_S * 0.5, 1.2, 'out'], [QL, 0, 'in'], [QL + 0.3, 0]),
    pitch: s([0, 0], [QT, 0], [QT + STILTS_LEAP_S * 0.3, -0.04, 'out'], [QL - 0.04, 0.04, 'inOut'], [QL + 0.12, 0, 'out'], [QL + 0.3, 0]),
    sy: s([0, 1], [QT, 0.76, 'out'], [QT + 0.06, 1.16, 'out'], [QL - 0.04, 1], [QL + 0.02, 0.74, 'in'], [QL + 0.2, 1, 'back']),
  },
  markers: { coil: 0.01, takeoff: QT, contact: QT, land: QL, end: QL + 0.3 },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'dust'], ['takeoff', 'earsBack'], ['takeoff', 'whoosh', 'L'], ['takeoff', 'ghost'], ['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'leapLand']],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ W Ear Swivel

/** Radar ears: they swivel out and back, the head scanning left and right, then prick up (the `ping` sends the ring). */
const WC = 0.05;
const w: ClipDef = {
  id: 'stilts.w',
  len: 0.85,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: [
    k(0, null),
    k(WC, { head: [-0.15, 0, 0], ...EARS_UP }, 'out'),
    k(0.2, { head: [-0.1, 0.55, 0.12], chest: [0, 0.15, 0], earL: [0.1, 0.9, 0.3], earR: [0.1, 0.9, -0.1] }, 'inOut'),
    k(0.4, { head: [-0.1, -0.55, -0.12], chest: [0, -0.15, 0], earL: [0.1, -0.9, 0.1], earR: [0.1, -0.9, -0.3] }, 'inOut'),
    k(0.55, { head: [-0.2, 0, 0], ...EARS_UP }, 'inOut'),
    k(0.65, { head: [-0.22, 0, 0], earL: [0.35, 0, 0.1], earR: [0.35, 0, -0.1] }, 'hold'),
    k(0.85, null, 'inOut'),
  ],
  root: { sy: s([0, 1], [WC, 1.04, 'out'], [0.55, 1.03], [0.62, 1.07, 'back'], [0.85, 1, 'inOut']) },
  markers: { coil: 0.01, contact: WC, ping: 0.55, end: 0.85 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'fx', 'ears'], ['ping', 'fx', 'ping'], ['ping', 'sfx', 'ping']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ E Swat-Swat

/** Two quick swats: right paw on the cast, left paw `gap` ticks later (the `swat2` marker), a step in on each. */
const EC = 0.04;
const E2 = EC + STILTS_SWAT_GAP_S;
const SWAT_R: D = { chest: [0.3, -0.55, 0], hips: [0, -0.25, 0], shoulderR: [-1.2, 0, 0.9], elbowR: [0.1, 0, 0], thighL: [-0.45, 0, 0], kneeL: [0.4, 0, 0], ...EARS_BACK };
const SWAT_L: D = { chest: [0.3, 0.55, 0], hips: [0, 0.25, 0], shoulderL: [-1.2, 0, -0.9], elbowL: [0.1, 0, 0], shoulderR: [-0.5, 0, 0.6], thighR: [-0.45, 0, 0], kneeR: [0.4, 0, 0], ...EARS_BACK };
const e: ClipDef = {
  id: 'stilts.e',
  len: E2 + 0.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.02,
  keys: [
    k(0, { chest: [0.05, 0.4, 0], shoulderR: [-1.9, 0, -0.5], elbowR: [-0.5, 0, 0] }),
    k(EC, SWAT_R, 'expoIn'),
    k(E2 - 0.08, { chest: [0.1, -0.3, 0], shoulderR: [-0.6, 0, 0.8], shoulderL: [-1.9, 0, 0.5], elbowL: [-0.5, 0, 0] }, 'out'),
    k(E2, SWAT_L, 'expoIn'),
    k(E2 + 0.1, merge(SWAT_L, { chest: [0.25, 0.65, 0], shoulderL: [-0.8, 0, -1.0] }), 'out'),
    k(E2 + 0.4, null, 'inOut'),
  ],
  root: {
    fwd: s([0, 0], [EC, 0.18, 'expoIn'], [E2 - 0.06, 0.1, 'out'], [E2, 0.26, 'expoIn'], [E2 + 0.25, 0, 'out'], [E2 + 0.4, 0]),
    sy: s([0, 1], [EC, 1.06, 'expoIn'], [E2 - 0.06, 0.94], [E2, 1.07, 'expoIn'], [E2 + 0.2, 1, 'out']),
  },
  lockFeet: true,
  markers: { contact: EC, swat2: E2, end: E2 + 0.4 },
  warp: [['contact', 'cast']],
  cues: [[0, 'trailOn', 'pawR'], ['contact', 'whoosh', 'S'], ['contact', 'fx', 'swat1'], [E2 - 0.1, 'trailOn', 'pawL'], ['swat2', 'whoosh', 'M'], ['swat2', 'fx', 'swat2'], ['swat2', 'smear'], [E2 + 0.14, 'trailOff']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ R Zoomies

/** The butt-wiggle: a deep crouch, the hips waggling twice, then the burst (the gait's haste sprint carries the rest). */
const RC = 0.06;
const r: ClipDef = {
  id: 'stilts.r',
  len: 0.62,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.03,
  keys: [
    k(0, null),
    k(RC, merge(CROUCH, EARS_BACK, { chest: [0.55, 0, 0], head: [-0.45, 0, 0], shoulderL: [0.4, 0, 0.2], shoulderR: [0.4, 0, -0.2], tail0: [-0.6, 0, 0] }), 'out'),
    k(0.14, merge(CROUCH, EARS_BACK, { chest: [0.55, 0, 0], head: [-0.45, 0, 0], hips: [0, 0.35, 0.15], tail0: [-0.6, 0.6, 0] }), 'inOut'),
    k(0.22, merge(CROUCH, EARS_BACK, { chest: [0.55, 0, 0], head: [-0.45, 0, 0], hips: [0, -0.35, -0.15], tail0: [-0.6, -0.6, 0] }), 'inOut'),
    k(0.3, merge(CROUCH, EARS_BACK, { chest: [0.6, 0, 0], head: [-0.5, 0, 0], tail0: [-0.7, 0, 0] }), 'inOut'),
    k(0.38, merge(EARS_BACK, { chest: [0.7, 0, 0], head: [-0.55, 0, 0], thighL: [-1.2, 0, 0], kneeL: [0.6, 0, 0], thighR: [0.8, 0, 0], kneeR: [0.4, 0, 0], shoulderL: [0.9, 0, 0.2], shoulderR: [-1.0, 0, -0.2] }), 'expoOut'),
    k(0.62, null, 'inOut'),
  ],
  root: {
    up: s([0, 0], [0.3, 0], [0.4, 0.25, 'out'], [0.52, 0, 'in'], [0.62, 0]),
    fwd: s([0, 0], [0.3, -0.08, 'out'], [0.42, 0.22, 'expoOut'], [0.62, 0, 'inOut']),
    sx: s([0, 1], [0.3, 1.06], [0.4, 0.9, 'expoOut'], [0.62, 1, 'inOut']),
    sy: s([0, 1], [RC, 0.8, 'out'], [0.3, 0.78], [0.4, 1.16, 'expoOut'], [0.62, 1, 'inOut']),
  },
  markers: { coil: 0.01, contact: RC, burst: 0.38, end: 0.62 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 250], ['burst', 'whoosh', 'L'], ['burst', 'ghost'], ['burst', 'dust'], ['burst', 'fx', 'burst'], ['burst', 'shake', 1]],
  cancel: 'afterContact',
};

/**
 * Zoomies held for the window: an eager sprinter's hunch (ears pinned, chest low, arms swept back) with a quick
 * on-the-toes bounce, so she reads as wound up even standing still. Upper body only: the gait's haste sprint keeps the
 * legs; a basic (the pounce) interrupts it and the director resumes it after.
 */
const rHold: ClipDef = {
  id: 'stilts.rHold',
  len: 0.36,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.1,
  keys: [
    k(0, merge(EARS_BACK, { chest: [0.42, 0, 0], head: [-0.35, 0, 0], shoulderL: [0.7, 0, 0.25], shoulderR: [0.7, 0, -0.25], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0] })),
    k(0.18, merge(EARS_BACK, { chest: [0.5, 0.06, 0], head: [-0.42, 0, 0], shoulderL: [0.85, 0, 0.25], shoulderR: [0.85, 0, -0.25], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0] }), 'inOut'),
    k(0.36, merge(EARS_BACK, { chest: [0.42, 0, 0], head: [-0.35, 0, 0], shoulderL: [0.7, 0, 0.25], shoulderR: [0.7, 0, -0.25], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0] }), 'inOut'),
  ],
  root: {
    up: s([0, 0], [0.09, 0.07, 'out'], [0.18, 0, 'in'], [0.27, 0.05, 'out'], [0.36, 0, 'in']),
    sy: s([0, 0.96], [0.09, 1.04, 'out'], [0.18, 0.95, 'in'], [0.27, 1.03, 'out'], [0.36, 0.96, 'in']),
  },
  markers: {},
  warp: [],
  // her afterimages: a ghost twice a loop (every 0.18 s, its own life), left behind wherever she runs
  cues: [[0.01, 'ghost'], [0.19, 'ghost']],
  cancel: 'any',
};

/** Zoomies over: she skids to a stop and pants (from whatever pose she is in). */
const rEnd: ClipDef = {
  id: 'stilts.rEnd',
  len: 0.5,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  keys: [
    k(0, null),
    k(0.12, { chest: [0.3, 0, 0], head: [0.1, 0, 0], earL: [-0.3, 0, -0.2], earR: [-0.3, 0, 0.2] }, 'out'),
    k(0.24, { chest: [0.22, 0, 0], head: [-0.05, 0, 0] }, 'inOut'),
    k(0.36, { chest: [0.3, 0, 0], head: [0.05, 0, 0] }, 'inOut'),
    k(0.5, null, 'inOut'),
  ],
  markers: { contact: 0 },
  warp: [],
  cues: [[0.05, 'dust'], [0.12, 'mouthOpen', 300]],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ idle, emotes, end

/** Idle flavour: the radar ears sweep one way then the other, then she rises up on her toes to look over. */
const idle: ClipDef = {
  id: 'stilts.idle',
  len: 2.2,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.25,
  blendOut: 0.3,
  keys: [
    k(0, null),
    k(0.5, { head: [0, 0.35, 0.05], earL: [0, 0.8, 0.2], earR: [0, 0.8, 0] }, 'inOut'),
    k(0.95, { head: [0, -0.35, -0.05], earL: [0, -0.8, 0], earR: [0, -0.8, -0.2] }, 'inOut'),
    k(1.4, { head: [-0.25, 0, 0], chest: [-0.1, 0, 0], footL: [0.45, 0, 0], footR: [0.45, 0, 0], ...EARS_UP }, 'inOut'),
    k(1.75, { head: [-0.28, 0, 0], chest: [-0.1, 0, 0], footL: [0.45, 0, 0], footR: [0.45, 0, 0], ...EARS_UP }, 'hold'),
    k(2.2, null, 'inOut'),
  ],
  root: { up: s([0, 0], [1.2, 0], [1.4, 0.07, 'out'], [1.75, 0.07], [2.2, 0, 'inOut']), sy: s([0, 1], [1.4, 1.05], [1.75, 1.05], [2.2, 1]) },
  lockFeet: true,
  markers: { contact: 0.5, end: 2.2 },
  warp: [],
  cancel: 'any',
};

/** Fidget: a long, long stretch (play bow, the tail high), then a big yawn. */
const stretch: ClipDef = {
  id: 'stilts.stretch',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.2,
  keys: [
    k(0, null),
    k(0.55, { body: [0.25, 0, 0], chest: [0.75, 0, 0], head: [-0.65, 0, 0], shoulderL: [-1.8, 0, 0.2], shoulderR: [-1.8, 0, -0.2], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], tail0: [-0.8, 0, 0] }, 'inOut'),
    k(1.2, { body: [0.25, 0, 0], chest: [0.8, 0, 0], head: [-0.7, 0, 0], shoulderL: [-1.85, 0, 0.2], shoulderR: [-1.85, 0, -0.2], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], tail0: [-0.9, 0, 0] }, 'hold'),
    k(1.5, { head: [-0.4, 0, 0], ...EARS_BACK }, 'inOut'),
    k(2.0, null, 'inOut'),
  ],
  root: { sy: s([0, 1], [0.55, 0.85], [1.2, 0.84], [1.5, 1.04], [2.0, 1]) },
  lockFeet: true,
  markers: { contact: 0.55, end: 2.0 },
  warp: [],
  cues: [[1.45, 'mouthOpen', 450]],
  cancel: 'any',
};

/** Victory: a zoomie lap in place (two spins in a hop), then up on her toes with both paws high, ears up. */
const victory: ClipDef = {
  id: 'stilts.victory',
  len: 1.8,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  keys: [
    k(0, null),
    k(0.1, merge(CROUCH, EARS_BACK), 'out'),
    k(0.3, merge(EARS_BACK, { chest: [0.3, 0, 0], thighL: [-1.0, 0, 0], kneeL: [1.2, 0, 0], thighR: [-0.6, 0, 0], kneeR: [1.0, 0, 0] }), 'out'),
    k(0.66, merge(CROUCH, { shoulderL: [-1.0, 0, 1.0], shoulderR: [-1.0, 0, -1.0] }), 'in'),
    k(0.9, { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.7, 0, 0.35], shoulderR: [-2.7, 0, -0.35], footL: [0.45, 0, 0], footR: [0.45, 0, 0], ...EARS_UP }, 'back'),
    k(1.6, { chest: [-0.32, 0, 0], head: [-0.4, 0, 0], shoulderL: [-2.7, 0, 0.35], shoulderR: [-2.7, 0, -0.35], footL: [0.45, 0, 0], footR: [0.45, 0, 0], ...EARS_UP }, 'hold'),
    k(1.8, null, 'inOut'),
  ],
  root: {
    yaw: s([0, 0], [0.1, 0], [0.38, 1, 'inOut'], [0.381, 0, 'step'], [0.66, 1, 'inOut'], [0.661, 0, 'step'], [1.8, 0]),
    up: s([0, 0], [0.1, 0], [0.38, 0.8, 'out'], [0.66, 0, 'in'], [0.9, 0.08, 'out'], [1.6, 0.08], [1.8, 0]),
    sy: s([0, 1], [0.1, 0.78, 'out'], [0.2, 1.1], [0.64, 1], [0.7, 0.78, 'in'], [0.9, 1.08, 'back'], [1.2, 1.04], [1.8, 1]),
  },
  markers: { contact: 0.1, land: 0.66, end: 1.8 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L'], [0.2, 'ghost'], ['land', 'land'], ['land', 'dustRing'], [0.9, 'fx', 'burst']],
  cancel: 'any',
};

/** Emote: the ears swivel round like radar dishes, then a cheeky high hop with a paw wave. */
const emote: ClipDef = {
  id: 'stilts.emote',
  len: 1.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.1,
  keys: [
    k(0, null),
    k(0.25, { head: [0, 0.3, 0.1], earL: [0, 1.0, 0.3], earR: [0, -1.0, -0.3] }, 'inOut'),
    k(0.5, { head: [0, -0.3, -0.1], earL: [0, -1.0, 0.3], earR: [0, 1.0, -0.3] }, 'inOut'),
    k(0.65, merge(CROUCH, EARS_UP), 'inOut'),
    k(0.85, { chest: [-0.25, 0, 0], head: [-0.3, 0, 0], shoulderR: [-2.6, 0, -0.3], elbowR: [0.5, 0, 0], thighL: [-0.6, 0, 0], kneeL: [1.0, 0, 0], ...EARS_UP }, 'out'),
    k(1.0, { chest: [-0.2, 0, 0], shoulderR: [-2.5, 0, -0.7], elbowR: [0.3, 0, 0] }, 'inOut'),
    k(1.15, { chest: [-0.2, 0, 0], shoulderR: [-2.5, 0, 0.1], elbowR: [0.3, 0, 0] }, 'inOut'),
    k(1.4, null, 'inOut'),
  ],
  root: { up: s([0, 0], [0.65, 0], [0.85, 0.5, 'out'], [1.05, 0, 'in'], [1.4, 0]), sy: s([0, 1], [0.65, 0.82, 'out'], [0.75, 1.12], [1.03, 1], [1.07, 0.84, 'in'], [1.25, 1, 'back']) },
  markers: { contact: 0.65, land: 1.05, end: 1.4 },
  warp: [['contact', 'cast']],
  cues: [['land', 'land']],
  cancel: 'any',
};

/** Level up: a stretched-out hop with one spin, ears up. */
const levelUp: ClipDef = {
  id: 'stilts.levelUp',
  len: 0.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.05,
  keys: [k(0, null), k(0.1, CROUCH, 'out'), k(0.3, { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.5, 0, 0.4], shoulderR: [-2.5, 0, -0.4], ...EARS_UP }, 'out'), k(0.46, CROUCH, 'in'), k(0.7, null, 'back')],
  root: { up: s([0, 0], [0.1, 0], [0.28, 0.55, 'out'], [0.46, 0, 'in'], [0.7, 0]), yaw: s([0, 0], [0.1, 0], [0.4, 1, 'inOut'], [0.401, 0, 'step'], [0.7, 0]), sy: s([0, 1], [0.1, 0.8, 'out'], [0.16, 1.12], [0.46, 0.8, 'in'], [0.62, 1, 'back']) },
  markers: { contact: 0.1, land: 0.46, end: 0.7 },
  warp: [],
  cues: [[0.46, 'land']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ gait

/** A long bounding stride (more air, a forward lean, arms trailing); Zoomies' haste flattens it into a sprint. */
const gait: GaitProfile = {
  ...DEFAULT_GAIT,
  stride: 1.3,
  bounce: 1.6,
  lean: 1.6,
  hipSway: 0.5,
  headBob: 0.8,
  arms: 'trail',
  variants: { ...DEFAULT_GAIT.variants, haste: { stride: 1.65, bounce: 1.9, lean: 3.4, hipSway: 0.3 }, sneak: { stride: 1.05, bounce: 0.35, lean: 2.8 } },
};

export const MOVES: MoveSet = {
  hero: 'stilts',
  stub: false,
  gait,
  springs: HERO_SPRINGS.stilts,
  basic: BASICS,
  basicPick,
  slots: {
    q: { cast: q },
    w: { cast: w },
    e: { cast: e },
    r: { cast: r, hold: rHold, end: rEnd },
  },
  idle,
  fidgets: [[stretch, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp,
};

/** Every clip in the set (tests, gallery). */
export const STILTS_CLIPS: readonly ClipDef[] = [basicA, basicB, pounce, q, w, e, r, rHold, rEnd, idle, stretch, victory, emote, levelUp];

/** Clear the shared render state (tests, gallery restarts). */
export function resetStiltsMoves(): void {
  STILTS_STATE.pounce.fill(0);
  STILTS_STATE.stride.fill(0);
  STILTS_STATE.zoom.fill(0);
}
