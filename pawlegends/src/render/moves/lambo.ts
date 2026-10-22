/**
 * Lambo move set (ANIM-SPEC §14 "Lambo"): a big soft Maine tank with a pot-lid shield on the LEFT arm, an empty right
 * paw (the tuna hand) and a string of fairy lights. Heavy, jolly and bouncy: every move leads with the belly.
 *
 * Silhouette first (§0): a hero is ≈45 px tall on Low, so the reads are root height (the shadow separates), whole-body
 * spins, the belly-down pancake and big squashes, not wrists.
 *
 * Sim binding (numbers from anim/timing.ts, never literals):
 * - basics: swing start → contact on the melee hit at the 8 t windup (period 30 t); A pot-lid bonk, B belly bump,
 *   C spinning two-paw belly slam (a 1-turn hop spin, ≤ 0.3 s, landing on the contact);
 * - Q Tuna Toss: instant skillshot, contact = cast (release), the weight in the follow-through: a 1-turn discus
 *   pivot and a wobble (upper mask: walking on after the throw keeps the gait legs);
 * - W Big Hug: instant, contact = cast: self-hug squeeze, arms burst open, happy twirl bounce (upper mask);
 * - E Belly Flop: take-off on the cast, progress-driven arc onto travelEnd (apex 1.6 m, the one clip allowed above
 *   1.2 m), belly-down spread-eagle in the air, flat on the ground by travelEnd, deepest squash on the ring tick
 *   (travelEnd + FLOP_RING_DELAY); the ring itself is skillfx's, bound to the sim landing;
 * - R Tangled Lights: one whole-turn spin over the 15 t windup (windupStart → cast) that overshoots and settles, the
 *   haul (body tipped back) on the cast while the victims slide in over the 6 t pull, then a planted stomp;
 * - victory: belly drum then a belly flop on the spot; death: deflate, tip onto his back, paws up; respawn: drops
 *   belly-first from the sky and pops up with a belly drum.
 *
 * Joints (common.ts conventions): thigh x < 0 forward, knee x > 0 bends, shoulder x < 0 raises the arm forward,
 * chest y + twists left, chest / hips x > 0 lean forward, head x < 0 lifts the chin. Root yaw + turns left.
 */
import type { BoneName } from '../chars/skeleton';
import { BASIC_CONTACT, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { DASH_SPEED, FLOP_RING_DELAY, KNOCK_TICKS, SIM_TIMING, TICK_S, travelTicks } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet, type ScalarKey } from '../anim/types';

const T = SIM_TIMING.lambo;
const C = BASIC_CONTACT;
/** Belly Flop: nominal air time (the full 5 m hop), the ring one tick after the landing. */
const E_AIR = T.slots.e.dashTicks * TICK_S;
const RING_DELAY = FLOP_RING_DELAY * TICK_S;
/** Tangled Lights windup (s) and the pull (the sim's knockback ticks). */
const R_WIND = T.slots.r.windup * TICK_S;
const PULL = KNOCK_TICKS * TICK_S;
/** Instant casts: the ≈53 ms peek coil, then the strike on the cast tick. */
const CAST_C = 0.1;

/** Arms flung wide (the hug burst, the spin). */
const WIDE = { shoulderL: [-0.5, 0, 1.25], shoulderR: [-0.5, 0, -1.25], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] } as const;
/** Belly-down spread-eagle: hips pitched flat, legs straight out behind, arms wide forward, chin up. */
const SPLAY = {
  hips: [1.3, 0, 0],
  chest: [0.15, 0, 0],
  head: [-0.75, 0, 0],
  thighL: [0.35, 0, 0.35],
  thighR: [0.35, 0, -0.35],
  kneeL: [0.15, 0, 0],
  kneeR: [0.15, 0, 0],
  shoulderL: [-1.5, 0, 1.0],
  shoulderR: [-1.5, 0, -1.0],
  elbowL: [-0.1, 0, 0],
  elbowR: [-0.1, 0, 0],
  tail0: [-0.6, 0, 0],
} as const;
/** Paws on the belly (drum, rub). */
const BELLY_L = { shoulderL: [-0.55, 0, -0.35], elbowL: [-1.2, 0, 0] } as const;
const BELLY_R = { shoulderR: [-0.55, 0, 0.35], elbowR: [-1.2, 0, 0] } as const;

/**
 * Whole-turn spins end by snapping the yaw to 0 (the same facing) just before the clip's blend-out: the stack fades a
 * root channel by scaling it, so a clip that ended on 2 turns would visibly unwind backwards over its blend-out.
 */
const BLEND_OUT = 0.12;
const unwind = (len: number, turns: number): ScalarKey[] => [
  [len - BLEND_OUT - 0.02, turns],
  [len - BLEND_OUT - 0.01, 0, 'step'],
  [len, 0],
];

// ------------------------------------------------------------------------------------------------ basics

/**
 * A: pot-lid bonk. The shield arm cocks high and over in a little hop, then bonks down and forward as he lands in a
 * lunge: the lead (left) foot plants far ahead and the rear leg extends back so its foot lands where it stood. The root
 * travel happens in the air (the hop) or over the planted rear leg (the thigh tracks the root), and the lead foot
 * steps back on the recovery: no foot slides (feet.ts does not pin them; the keys do).
 */
const basicA: ClipDef = {
  id: 'lambo.basicA',
  len: C + 0.36,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.7, null, { chest: [-0.18, -0.8, 0], shoulderL: [-2.3, 0, 0.5], elbowL: [-0.9, 0, 0], head: [-0.15, 0, 0], thighL: [-0.3, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.3, 0, 0] }, 'out'],
    [C, null, { chest: [0.55, 0.7, 0], shoulderL: [-1.0, 0, -0.35], elbowL: [-0.15, 0, 0], head: [0.15, 0, 0], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.44, 0, 0] }, 'expoIn'],
    [C + 0.1, null, { chest: [0.65, 0.8, 0], shoulderL: [-0.85, 0, -0.45], elbowL: [-0.1, 0, 0], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.44, 0, 0] }, 'back'],
    // the step back: the lead foot lifts and comes home while the rear thigh rides the root back
    [C + 0.24, null, { chest: [0.25, 0.3, 0], shoulderL: [-0.6, 0, -0.2], thighL: [-0.6, 0, 0], kneeL: [1.5, 0, 0], thighR: [0.2, 0, 0] }, 'out'],
    [C + 0.36, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.7, -0.1, 'out'], [C, 0.24, 'expoIn'], [C + 0.1, 0.24], [C + 0.24, 0.11, 'out'], [C + 0.36, 0, 'inOut']],
    up: [[0, 0], [C * 0.7, 0.1, 'out'], [C, 0, 'expoIn']],
    roll: [[0, 0], [C * 0.7, 0.012, 'out'], [C, -0.006, 'expoIn'], [C + 0.3, 0, 'inOut']],
    sy: [[0, 1], [C * 0.7, 1.1, 'out'], [C, 0.8, 'expoIn'], [C + 0.14, 1.06, 'out'], [C + 0.3, 1, 'inOut']],
  },
  markers: { coil: 0.04, contact: C, end: C + 0.36 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'trailOn', 'pawL'], ['contact', 'whoosh', 'S'], ['contact', 'sfx', 'clang'], [C + 0.2, 'trailOff']],
  cancel: 'afterContact',
};

/**
 * B: belly bump. Hops back with the arms thrown behind, then lands in a lunge and shoves the belly through the target:
 * lead foot planted ahead, rear leg extended so its foot lands where it stood, then the lead foot steps home.
 */
const basicB: ClipDef = {
  id: 'lambo.basicB',
  len: C + 0.38,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.72, null, { chest: [-0.75, 0, 0], head: [0.25, 0, 0], shoulderL: [0.9, 0, 0.3], shoulderR: [0.9, 0, -0.3], thighL: [-0.3, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.35, 0, 0] }, 'out'],
    [C, null, { chest: [-0.75, 0, 0], head: [-0.3, 0, 0], shoulderL: [0.5, 0, 0.9], shoulderR: [0.5, 0, -0.9], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.48, 0, 0] }, 'expoIn'],
    [C + 0.12, null, { chest: [-0.55, 0, 0], head: [-0.2, 0, 0], shoulderL: [0.3, 0, 0.7], shoulderR: [0.3, 0, -0.7], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.48, 0, 0] }, 'back'],
    [C + 0.26, null, { chest: [-0.2, 0, 0], shoulderL: [0.1, 0, 0.35], shoulderR: [0.1, 0, -0.35], thighL: [-0.6, 0, 0], kneeL: [1.5, 0, 0], thighR: [0.18, 0, 0] }, 'out'],
    [C + 0.38, null, null, 'inOut'],
  ],
  root: {
    fwd: [[0, 0], [C * 0.72, -0.16, 'out'], [C, 0.26, 'expoIn'], [C + 0.12, 0.26], [C + 0.26, 0.1, 'out'], [C + 0.38, 0, 'inOut']],
    up: [[0, 0], [C * 0.5, 0.16, 'out'], [C, 0, 'in']],
    pitch: [[0, 0], [C * 0.72, -0.03, 'out'], [C, 0, 'expoIn']],
    sx: [[0, 1], [C * 0.72, 0.88, 'out'], [C, 1.26, 'expoIn'], [C + 0.1, 0.95, 'out'], [C + 0.26, 1.03, 'inOut'], [C + 0.38, 1, 'inOut']],
  },
  markers: { coil: 0.04, contact: C, end: C + 0.38 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'whoosh', 'S'], ['contact', 'sfx', 'bodyThud']],
  cancel: 'afterContact',
};

/**
 * C: spinning two-paw belly slam. Both paws go overhead in a crouch, a hop with one full yaw turn (left, so the shield
 * leads), and the slam lands on the contact with a squash; the root yaw ends on the whole turn.
 */
const basicC: ClipDef = {
  id: 'lambo.basicC',
  len: C + 0.42,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    [0, null, null],
    [C * 0.32, null, { chest: [-0.2, 0, 0], shoulderL: [-2.6, 0, 0.3], shoulderR: [-2.6, 0, -0.3], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'out'],
    [C * 0.7, null, { chest: [-0.3, 0, 0], head: [-0.3, 0, 0], shoulderL: [-2.9, 0, 0.2], shoulderR: [-2.9, 0, -0.2], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0] }, 'out'],
    [C, null, { chest: [0.7, 0, 0], hips: [0.25, 0, 0], head: [0.25, 0, 0], shoulderL: [-0.7, 0, 0.1], shoulderR: [-0.7, 0, -0.1], elbowL: [0, 0, 0], elbowR: [0, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0] }, 'expoIn'],
    [C + 0.16, null, { chest: [0.55, 0, 0], hips: [0.15, 0, 0], shoulderL: [-0.6, 0, 0.3], shoulderR: [-0.6, 0, -0.3], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'back'],
    [C + 0.42, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [C * 0.3, 0], [C, 1, 'inOut'], ...unwind(C + 0.42, 1)],
    up: [[0, 0], [C * 0.3, 0], [C * 0.68, 0.55, 'out'], [C, 0, 'expoIn'], [C + 0.42, 0]],
    sy: [[0, 1], [C * 0.3, 0.76, 'out'], [C * 0.45, 1.18, 'out'], [C * 0.85, 1.05], [C, 0.62, 'expoIn'], [C + 0.18, 1.05, 'back'], [C + 0.32, 1, 'inOut']],
  },
  markers: { coil: 0.04, contact: C, end: C + 0.42 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'trailOn', 'pawR'], [C * 0.3, 'whoosh', 'M'], ['contact', 'sfx', 'bodyThud'], ['contact', 'dust'], ['contact', 'shake', 1], ['contact', 'fx', 'slamC'], [C + 0.2, 'trailOff']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

const BASICS: readonly ClipDef[] = [basicA, basicB, basicC];

/**
 * Render clock (s) shared with skillfx/lambo.ts, which advances it in SKILL_FX.update.
 */
export const LAMBO_STATE = { clock: 0 };

/** Clears the shared clock (tests). */
export function resetLamboMoves(): void {
  LAMBO_STATE.clock = 0;
}

/** The combo swing: BasicClock picks the index when the swing starts (A, B, C, A…; A again after a 1.5 s pause). */
function basicPick(ctx: MoveCtx): ClipDef | null {
  return BASICS[ctx.comboIndex % BASICS.length];
}

// ------------------------------------------------------------------------------------------------ Q Tuna Toss

/**
 * Sidearm hurl from the empty right paw: arm cocked back and out on the peek, chest and arm untwist through the
 * release on the cast tick, then momentum carries him round one full discus pivot (≤ 0.3 s) and a wobble.
 *
 * Upper mask: the legs stay the gait's (the sim does not lock him after an instant cast, so a Lambo who walks on
 * right after the throw runs on his own legs instead of gliding mid-hop); no hop, the pivot is a grounded spin.
 */
const qCast: ClipDef = {
  id: 'lambo.q',
  len: CAST_C + 0.55,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: [
    [0, null, null],
    [CAST_C * 0.7, null, { chest: [-0.2, 1.5, 0], shoulderR: [0.7, 0, -1.4], elbowR: [-1.4, 0, 0], shoulderL: [-0.6, 0, 0.6], head: [-0.1, -0.4, 0] }, 'out'],
    [CAST_C, null, { chest: [0.45, -1.5, 0], shoulderR: [-1.6, 0, 0.5], elbowR: [0, 0, 0], shoulderL: [0.4, 0, 0.5], head: [0.1, 0.3, 0] }, 'expoIn'],
    [CAST_C + 0.14, null, { chest: [0.25, -0.8, 0], shoulderR: [-0.9, 0, 1.1], shoulderL: [-0.4, 0, 1.2] }, 'out'],
    [CAST_C + 0.3, null, { chest: [-0.1, 0, 0.15], shoulderR: [-0.5, 0, -1.2], shoulderL: [-0.5, 0, 1.2] }, 'inOut'],
    [CAST_C + 0.42, null, { chest: [0, 0, -0.12], shoulderR: [-0.3, 0, -0.9], shoulderL: [-0.3, 0, 0.9] }, 'inOut'],
    [CAST_C + 0.55, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [CAST_C, 0], [CAST_C + 0.28, -1, 'out'], ...unwind(CAST_C + 0.55, -1)],
    roll: [[0, 0], [CAST_C + 0.26, 0], [CAST_C + 0.34, 0.035, 'out'], [CAST_C + 0.42, -0.025, 'inOut'], [CAST_C + 0.5, 0.01, 'inOut'], [CAST_C + 0.55, 0, 'inOut']],
    sy: [[0, 1], [CAST_C * 0.7, 0.9, 'out'], [CAST_C, 1.1, 'expoIn'], [CAST_C + 0.26, 1.02], [CAST_C + 0.32, 0.88, 'in'], [CAST_C + 0.45, 1, 'back']],
  },
  markers: { coil: 0.02, contact: CAST_C, end: CAST_C + 0.55 },
  warp: [['contact', 'cast']],
  cues: [['coil', 'trailOn', 'pawR'], ['contact', 'whoosh', 'M'], ['contact', 'shake', 1], [CAST_C + 0.28, 'trailOff']],
  calm: { yaw: 0, roll: 1 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Big Hug

/**
 * Self-hug squeeze on the cast (the shields land on that tick), arms burst wide, then a happy twirl bounce. Upper
 * mask (the legs stay the gait's, so walking off right after the hug never glides mid-twirl); the bounce is a small
 * root hop the legs ride.
 */
const wCast: ClipDef = {
  id: 'lambo.w',
  len: CAST_C + 0.8,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: [
    [0, null, null],
    [CAST_C, 'hug', { chest: [0.2, 0, 0], head: [0.1, 0, 0], shoulderL: [0.15, 0, -0.45], shoulderR: [0.15, 0, 0.45], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0] }, 'expoIn'],
    [CAST_C + 0.2, null, { chest: [0.3, 0.15, 0], head: [0.2, 0.25, 0.15], shoulderL: [0.2, 0, -0.5], shoulderR: [0.2, 0, 0.5], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] }, 'inOut'],
    [CAST_C + 0.32, 'cheer', { chest: [-0.35, 0, 0], head: [-0.4, 0, 0], ...WIDE, tail0: [-0.5, 0, 0] }, 'backBig'],
    [CAST_C + 0.6, null, { chest: [0.1, 0, 0], head: [-0.2, 0, 0], ...WIDE }, 'inOut'],
    [CAST_C + 0.8, null, null, 'inOut'],
  ],
  root: {
    sx: [[0, 1], [CAST_C, 1.22, 'expoIn'], [CAST_C + 0.1, 1.14, 'inOut'], [CAST_C + 0.2, 1.24, 'inOut'], [CAST_C + 0.32, 0.92, 'out'], [CAST_C + 0.46, 1, 'inOut']],
    sy: [[0, 1], [CAST_C, 0.84, 'expoIn'], [CAST_C + 0.1, 0.9, 'inOut'], [CAST_C + 0.2, 0.82, 'inOut'], [CAST_C + 0.32, 1.12, 'out'], [CAST_C + 0.44, 1.06], [CAST_C + 0.58, 0.86, 'in'], [CAST_C + 0.72, 1, 'back']],
    up: [[0, 0], [CAST_C + 0.32, 0], [CAST_C + 0.45, 0.32, 'out'], [CAST_C + 0.58, 0, 'in'], [CAST_C + 0.8, 0]],
    yaw: [[0, 0], [CAST_C + 0.32, 0], [CAST_C + 0.58, 1, 'inOut'], ...unwind(CAST_C + 0.8, 1)],
  },
  markers: { contact: CAST_C, burst: CAST_C + 0.32, land: CAST_C + 0.58, end: CAST_C + 0.8 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'lightsJingle'], ['contact', 'mouthOpen', 250], ['burst', 'whoosh', 'M'], ['burst', 'shake', 1], ['land', 'land']],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ E Belly Flop

const E0 = CAST_C;
const E1 = E0 + E_AIR;
const SPLAT = E1 + RING_DELAY;
type Pose = Partial<Record<BoneName, BoneDelta>>;
/** Every delta of `p` scaled by `s` (build time only). */
const scaled = (p: Pose, s: number): Pose => {
  const o: Pose = {};
  for (const [b, d] of Object.entries(p) as [BoneName, BoneDelta][]) o[b] = [d[0] * s, d[1] * s, d[2] * s];
  return o;
};
/**
 * Squash take-off on the cast, a big progress-driven arc into the belly-down spread-eagle, touch down flat on the
 * ground just before travelEnd (so whatever the hit-stop of the ring hit freezes is the pancake, never a mid-air
 * pose), the deepest squash (0.55 high, 1.32 long) on the ring tick, then a rebound bounce.
 *
 * `k` = the hop's share of the full 5 m (its travel ticks over the 8 t max, ≥ 0.25): the sim hop is min(aim, 5 m) and
 * the warp maps the air onto the real travel, so a short flop gets a lower apex (1.6·k m) and a partial spread-eagle
 * instead of squeezing the full 1.6 m rise into 50 ms.
 */
function bellyFlop(k: number, id: string): ClipDef {
  const air = 0.35 + 0.65 * k;
  return {
    id,
    len: SPLAT + 0.62,
    mask: 'full',
    mode: 'override',
    prio: Prio.Ability,
    blendIn: 0.03,
    keys: [
      [0, null, null],
      [E0 * 0.75, null, { chest: [0.45, 0, 0], hips: [0.2, 0, 0], head: [-0.2, 0, 0], shoulderL: [1.0, 0, 0.3], shoulderR: [1.0, 0, -0.3], thighL: [-0.7, 0, 0], thighR: [-0.7, 0, 0], kneeL: [1.3, 0, 0], kneeR: [1.3, 0, 0] }, 'out'],
      [E0, null, { chest: [-0.2, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.7, 0, 0.35], shoulderR: [-2.7, 0, -0.35], thighL: [0.15, 0, 0], thighR: [0.15, 0, 0], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], tail0: [0.4, 0, 0] }, 'expoOut'],
      [E0 + E_AIR * 0.42, null, scaled(SPLAY, air), 'inOut'],
      [E1 - E_AIR * 0.12, null, scaled({ ...SPLAY, hips: [1.45, 0, 0], head: [-0.9, 0, 0], shoulderL: [-1.7, 0, 1.3], shoulderR: [-1.7, 0, -1.3] }, air), 'inOut'],
      // touch-down on travelEnd is already the pancake (flat on the ground): the hit-stop of the ring hit holds this
      [E1, null, { ...SPLAY, hips: [1.5, 0, 0], head: [-0.55, 0, 0], shoulderL: [-1.5, 0, 1.55], shoulderR: [-1.5, 0, -1.55], thighL: [0.4, 0, 0.55], thighR: [0.4, 0, -0.55] }, 'in'],
      [SPLAT, null, { ...SPLAY, hips: [1.5, 0, 0], head: [-0.5, 0, 0], shoulderL: [-1.45, 0, 1.6], shoulderR: [-1.45, 0, -1.6], thighL: [0.4, 0, 0.6], thighR: [0.4, 0, -0.6] }, 'out'],
      [SPLAT + 0.09, null, { ...SPLAY, hips: [1.5, 0, 0], head: [-0.5, 0, 0], shoulderL: [-1.45, 0, 1.6], shoulderR: [-1.45, 0, -1.6], thighL: [0.4, 0, 0.6], thighR: [0.4, 0, -0.6] }, 'hold'],
      [SPLAT + 0.26, null, { hips: [0.5, 0, 0], chest: [0.3, 0, 0], head: [-0.3, 0, 0], ...WIDE, kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'],
      [SPLAT + 0.42, null, { chest: [0.2, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'in'],
      [SPLAT + 0.62, null, null, 'back'],
    ],
    root: {
      up: [[0, 0], [E0, 0], [E0 + E_AIR * 0.45, 1.6 * k, 'out'], [E1 - E_AIR * 0.06, 0, 'in'], [SPLAT, 0], [SPLAT + 0.09, 0], [SPLAT + 0.24, 0.3, 'out'], [SPLAT + 0.4, 0, 'in'], [SPLAT + 0.62, 0]],
      sy: [[0, 1], [E0 * 0.75, 0.74, 'out'], [E0 + 0.03, 1 + 0.22 * air, 'expoOut'], [E0 + E_AIR * 0.5, 1.0, 'inOut'], [E1 - E_AIR * 0.06, 0.88, 'in'], [E1, 0.62, 'expoIn'], [SPLAT, 0.55, 'out'], [SPLAT + 0.09, 0.58], [SPLAT + 0.24, 1.12, 'out'], [SPLAT + 0.4, 0.82, 'in'], [SPLAT + 0.58, 1, 'back']],
      sx: [[0, 1], [E1 - E_AIR * 0.06, 1.0], [E1, 1.26, 'expoIn'], [SPLAT, 1.32, 'out'], [SPLAT + 0.09, 1.28], [SPLAT + 0.24, 0.92, 'out'], [SPLAT + 0.4, 1.1, 'in'], [SPLAT + 0.58, 1, 'inOut']],
    },
    markers: { coil: 0.02, takeoff: E0, contact: E0, land: E1, splat: SPLAT, rebound: SPLAT + 0.4, end: SPLAT + 0.62 },
    warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
    // the ring, crater, shake and punch are skillfx's, bound to the sim's landing (its slot-2 hit, or the landing tick
    // when nobody is in the ring), never to this clip's time: a hop ended by a stun or fear lands nothing (a skid).
    // No freeze cue: the ring's own hit-stop holds the pancake.
    cues: [
      ['takeoff', 'dust'],
      ['takeoff', 'earsBack'],
      ['takeoff', 'whoosh', 'L'],
      ['takeoff', 'sfx', 'flip'],
      ['land', 'dust'],
      ['land', 'sfx', 'bodyThud'],
      ['rebound', 'land'],
    ],
    // no cast can start in the air (the sim's canCast refuses while dashing); once landed, Q / W may cut the rebound
    cancel: 'afterContact',
  };
}
/** Full 5 m hop (the default and the one the tests and gallery name). */
const eCast = bellyFlop(1, 'lambo.e');
/** Shorter hops, k = 0.25 … 0.875 in eighths (index = 8k − 2). */
const E_SHORT: readonly ClipDef[] = [0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((k) => bellyFlop(k, `lambo.e${Math.round(k * 8)}`));
const E_DASH_TICKS = T.slots.e.dashTicks;
/** The hop for the aimed distance (MoveCtx.aimDist, the director's): its travel ticks over the full hop's. */
function pickE(ctx: MoveCtx): ClipDef {
  const d = ctx.aimDist;
  if (d === undefined || !(d > 0.001)) return eCast;
  const ticks = travelTicks(Math.min(d * 1000, T.slots.e.dashMm), DASH_SPEED);
  const k = Math.max(0.25, Math.min(1, ticks / E_DASH_TICKS));
  const i = Math.round(k * 8) - 2;
  return i >= E_SHORT.length ? eCast : E_SHORT[i];
}

// ------------------------------------------------------------------------------------------------ R Tangled Lights

const R1 = R_WIND;
/** Windup spin overshoot past square on the cast (turns, ≈ 13°). */
const R_OVER = 0.036;
/** The haul's root pitch tips the feet forward about the belly: the root slides back this much so they stay put. */
const R_PITCH_FWD = 0.12;
/**
 * windupStart → cast: arms flung out, one whole turn ('inOut': fastest mid-windup, ≈ 3 turns/s, 0.1 turn a frame at
 * 30 fps, so it reads instead of aliasing) that overshoots 13° past square on the cast tick and settles back in 3
 * frames (a windup spin locked to the sim windup, §9 rule 6). Cast: the whole body tips back (root pitch −0.07 turn
 * plus the chest) and hauls hand over hand for the 6 t pull, then plants with a stomp. cancel afterContact: once the
 * lights are out a new cast may cut the haul tail.
 */
const rCast: ClipDef = {
  id: 'lambo.r',
  len: R1 + 0.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.05,
  keys: [
    [0, null, null],
    [0.08, null, { chest: [0.25, 0, 0], ...WIDE, kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], thighL: [-0.25, 0, 0], thighR: [-0.25, 0, 0] }, 'out'],
    [R1 * 0.55, null, { chest: [-0.1, 0, 0.1], head: [-0.2, 0, 0], shoulderL: [-0.7, 0, 1.45], shoulderR: [-0.7, 0, -1.45], elbowL: [0, 0, 0], elbowR: [0, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0] }, 'inOut'],
    [R1 - 0.04, null, { chest: [-0.25, 0, 0.15], head: [-0.35, 0, 0], shoulderL: [-0.9, 0, 1.55], shoulderR: [-0.9, 0, -1.55], elbowL: [0, 0, 0], elbowR: [0, 0, 0], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] }, 'inOut'],
    // the haul: the lean lives in the chest (hips square, so the legs stay on the ground); the right heel digs in
    // behind on the first tug, the left foot stays braced ahead and both thighs ride the root back (no sliding)
    [R1, null, { chest: [-0.75, 0, 0], head: [-0.5, 0, 0], shoulderL: [-1.5, 0, 0.3], shoulderR: [-1.5, 0, -0.3], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [-0.35, 0, 0], kneeL: [0.2, 0, 0], thighR: [0.3, 0, 0], kneeR: [0.6, 0, 0] }, 'expoIn'],
    [R1 + PULL * 0.35, null, { chest: [-0.8, 0.45, 0], head: [-0.35, 0, 0], shoulderL: [-1.6, 0, 0.3], elbowL: [-0.1, 0, 0], shoulderR: [0.6, 0, -0.5], elbowR: [-1.5, 0, 0], thighL: [-0.55, 0, 0], kneeL: [0.2, 0, 0], thighR: [0.5, 0, 0], kneeR: [0, 0, 0] }, 'out'],
    [R1 + PULL * 0.7, null, { chest: [-0.8, -0.45, 0], head: [-0.35, 0, 0], shoulderR: [-1.6, 0, -0.3], elbowR: [-0.1, 0, 0], shoulderL: [0.6, 0, 0.5], elbowL: [-1.5, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.2, 0, 0], thighR: [0.42, 0, 0] }, 'inOut'],
    [R1 + PULL, null, { chest: [-0.7, 0, 0], head: [-0.3, 0, 0], shoulderL: [0.7, 0, 0.4], shoulderR: [0.7, 0, -0.4], elbowL: [-1.5, 0, 0], elbowR: [-1.5, 0, 0], thighL: [-0.62, 0, 0], kneeL: [0.2, 0, 0], thighR: [0.38, 0, 0] }, 'inOut'],
    [R1 + PULL + 0.16, null, { chest: [0.35, 0, 0], head: [0.1, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0] }, 'expoIn'],
    [R1 + 0.7, null, null, 'inOut'],
  ],
  root: {
    yaw: [[0, 0], [0.06, 0], [R1, 1 + R_OVER, 'inOut'], [R1 + 0.1, 1, 'out'], ...unwind(R1 + 0.7, 1)],
    pitch: [[0, 0], [R1 - 0.04, 0], [R1, -0.07, 'expoIn'], [R1 + PULL, -0.075, 'inOut'], [R1 + PULL + 0.16, 0.02, 'expoIn'], [R1 + PULL + 0.3, 0, 'inOut']],
    fwd: [[0, 0], [R1 - 0.04, 0], [R1, -R_PITCH_FWD, 'expoIn'], [R1 + PULL * 0.35, -R_PITCH_FWD - 0.06, 'out'], [R1 + PULL * 0.7, -R_PITCH_FWD - 0.1, 'inOut'], [R1 + PULL, -R_PITCH_FWD - 0.12, 'inOut'], [R1 + PULL + 0.16, -0.05, 'in'], [R1 + 0.7, 0, 'inOut']],
    up: [[0, 0], [R1 + PULL, 0], [R1 + PULL + 0.07, 0.16, 'out'], [R1 + PULL + 0.16, 0, 'in']],
    sy: [[0, 1], [0.08, 0.88, 'out'], [R1 * 0.6, 1.0, 'inOut'], [R1 - 0.03, 1.06], [R1, 1.12, 'expoIn'], [R1 + PULL, 1.02, 'inOut'], [R1 + PULL + 0.16, 0.74, 'expoIn'], [R1 + PULL + 0.34, 1.04, 'back'], [R1 + 0.6, 1, 'inOut']],
  },
  markers: { coil: 0, spin: R1 * 0.5, contact: R1, tug1: R1 + PULL * 0.35, tug2: R1 + PULL * 0.7, plant: R1 + PULL + 0.16, end: R1 + 0.7 },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [
    ['coil', 'sfx', 'lightsJingle'],
    ['coil', 'trailOn', 'pawR'],
    ['spin', 'whoosh', 'M'],
    ['contact', 'trailOff'],
    ['contact', 'whoosh', 'L'],
    ['contact', 'mouthOpen', 320],
    ['contact', 'ghost'],
    ['contact', 'shake', 3],
    ['contact', 'punch', 0.05],
    ['tug1', 'sfx', 'chain'],
    ['tug2', 'sfx', 'chain'],
    ['plant', 'sfx', 'bodyThud'],
    ['plant', 'dust'],
    ['plant', 'shake', 1],
  ],
  calm: { yaw: 0 },
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ idle, emotes, death

/** Idle: a slow contented belly rub with a breath (loops). */
const idle: ClipDef = {
  id: 'lambo.idle',
  len: 2.4,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.3,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.6, null, { chest: [-0.06, 0, 0], head: [-0.12, 0.15, 0.08], ...BELLY_R, shoulderR: [-0.6, 0, 0.45] }, 'inOut'],
    [1.2, null, { chest: [-0.1, 0, 0], head: [-0.18, -0.1, 0.05], ...BELLY_R, shoulderR: [-0.45, 0, 0.25] }, 'inOut'],
    [1.8, null, { chest: [-0.06, 0, 0], head: [-0.12, 0.15, 0.08], ...BELLY_R, shoulderR: [-0.6, 0, 0.45] }, 'inOut'],
    [2.4, null, null, 'inOut'],
  ],
  root: { sx: [[0, 1], [1.2, 1.05, 'inOut'], [2.4, 1, 'inOut']], sy: [[0, 1], [1.2, 1.03, 'inOut'], [2.4, 1, 'inOut']] },
  markers: { end: 2.4 },
  warp: [],
  cancel: 'any',
};

/** Fidget: a huge yawn, arms stretched up, mouth open, a little sway. */
const yawn: ClipDef = {
  id: 'lambo.yawn',
  len: 1.6,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.2,
  blendOut: 0.25,
  keys: [
    [0, null, null],
    [0.45, null, { chest: [-0.4, 0, 0], head: [-0.6, 0, 0], shoulderL: [-2.8, 0, 0.5], shoulderR: [-2.8, 0, -0.5], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0], earL: [0.3, 0, -0.3], earR: [0.3, 0, 0.3] }, 'inOut'],
    [1.0, null, { chest: [-0.45, 0, 0.1], head: [-0.65, 0, 0.1], shoulderL: [-2.9, 0, 0.6], shoulderR: [-2.9, 0, -0.6], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] }, 'inOut'],
    [1.6, null, null, 'inOut'],
  ],
  root: { sy: [[0, 1], [0.45, 1.08, 'inOut'], [1.0, 1.1], [1.35, 0.94, 'inOut'], [1.6, 1, 'inOut']] },
  markers: { end: 1.6 },
  warp: [],
  cues: [[0.4, 'mouthOpen', 600]],
  cancel: 'any',
};

/** Fidget: drums the belly twice and nods. */
const drumFidget: ClipDef = {
  id: 'lambo.drum',
  len: 1.0,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.12,
  keys: [
    [0, null, null],
    [0.15, null, { ...BELLY_L, ...BELLY_R, shoulderL: [-0.85, 0, -0.25], head: [-0.15, 0, 0] }, 'out'],
    [0.3, null, { ...BELLY_L, ...BELLY_R, shoulderR: [-0.85, 0, 0.25], head: [0.05, 0, 0] }, 'inOut'],
    [0.45, null, { ...BELLY_L, ...BELLY_R, shoulderL: [-0.85, 0, -0.25], head: [-0.15, 0, 0] }, 'inOut'],
    [0.6, null, { ...BELLY_L, ...BELLY_R, shoulderR: [-0.85, 0, 0.25], head: [0.05, 0, 0] }, 'inOut'],
    [1.0, null, null, 'inOut'],
  ],
  root: { sx: [[0, 1], [0.3, 1.08], [0.38, 1], [0.6, 1.08], [0.68, 1], [1.0, 1]], sy: [[0, 1], [0.3, 0.93], [0.38, 1], [0.6, 0.93], [0.68, 1], [1.0, 1]] },
  markers: { end: 1.0 },
  warp: [],
  cues: [[0.3, 'sfx', 'drum'], [0.6, 'sfx', 'drum']],
  cancel: 'any',
};

/** Victory: a belly drum, a hop and a belly flop on the spot, a roll back up into a cheer. */
const VD = 0.75;
const victory: ClipDef = {
  id: 'lambo.victory',
  len: VD + 1.45,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.15,
  keys: [
    [0, null, null],
    [0.15, null, { ...BELLY_L, ...BELLY_R, shoulderL: [-0.85, 0, -0.25], head: [-0.3, 0, 0] }, 'out'],
    [0.3, null, { ...BELLY_L, ...BELLY_R, shoulderR: [-0.85, 0, 0.25], head: [-0.2, 0, 0] }, 'inOut'],
    [0.45, null, { ...BELLY_L, ...BELLY_R, shoulderL: [-0.85, 0, -0.25], head: [-0.3, 0, 0] }, 'inOut'],
    [0.6, null, { ...BELLY_L, ...BELLY_R, shoulderR: [-0.85, 0, 0.25], head: [-0.2, 0, 0] }, 'inOut'],
    [VD, null, { chest: [0.4, 0, 0], ...WIDE, shoulderL: [1.0, 0, 0.3], shoulderR: [1.0, 0, -0.3], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0], thighL: [-0.7, 0, 0], thighR: [-0.7, 0, 0] }, 'out'],
    [VD + 0.2, null, SPLAY, 'inOut'],
    [VD + 0.4, null, { ...SPLAY, hips: [1.5, 0, 0], shoulderL: [-1.5, 0, 1.55], shoulderR: [-1.5, 0, -1.55], thighL: [0.4, 0, 0.55], thighR: [0.4, 0, -0.55] }, 'in'],
    [VD + 0.62, null, { ...SPLAY, hips: [1.5, 0, 0], shoulderL: [-1.5, 0, 1.55], shoulderR: [-1.5, 0, -1.55], thighL: [0.4, 0, 0.55], thighR: [0.4, 0, -0.55] }, 'hold'],
    [VD + 0.85, null, { chest: [0.3, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0] }, 'out'],
    [VD + 1.1, 'cheer', { chest: [-0.2, 0, 0], head: [-0.35, 0, 0], ...WIDE, shoulderL: [-2.6, 0, 0.7], shoulderR: [-2.6, 0, -0.7] }, 'backBig'],
    [VD + 1.45, null, null, 'hold'],
  ],
  root: {
    up: [[0, 0], [VD, 0], [VD + 0.2, 1.0, 'out'], [VD + 0.4, 0, 'in'], [VD + 0.62, 0], [VD + 0.85, 0], [VD + 1.0, 0.45, 'out'], [VD + 1.14, 0, 'in'], [VD + 1.45, 0]],
    yaw: [[0, 0], [VD + 0.85, 0], [VD + 1.12, 1, 'inOut'], ...unwind(VD + 1.45, 1)],
    sy: [[0, 1], [0.3, 0.93], [0.36, 1], [0.6, 0.93], [0.66, 1], [VD, 0.74, 'out'], [VD + 0.05, 1.2, 'expoOut'], [VD + 0.36, 0.95], [VD + 0.4, 0.55, 'expoIn'], [VD + 0.62, 0.6], [VD + 0.85, 0.8, 'out'], [VD + 0.9, 1.15, 'out'], [VD + 1.14, 0.85, 'in'], [VD + 1.3, 1, 'back']],
    sx: [[0, 1], [VD + 0.36, 1], [VD + 0.4, 1.3, 'expoIn'], [VD + 0.62, 1.26], [VD + 0.85, 1, 'out']],
  },
  markers: { contact: VD + 0.4, end: VD + 1.45 },
  warp: [],
  cues: [[0.3, 'sfx', 'drum'], [0.6, 'sfx', 'drum'], [VD, 'whoosh', 'M'], [VD + 0.4, 'sfx', 'bodyThud'], [VD + 0.4, 'dustRing'], [VD + 0.4, 'fx', 'starBurst'], [VD + 1.14, 'land']],
  calm: { yaw: 0 },
  cancel: 'any',
};

/** Emote: a big two-paw wave over the head, waddling side to side, then a little hop. */
const emote: ClipDef = {
  id: 'lambo.emote',
  len: 1.5,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.12,
  keys: [
    [0, null, null],
    [0.2, 'wave', { shoulderR: [-0.45, 0, -1.95], elbowR: [-0.75, 0, 0], chest: [-0.1, 0, 0.12], head: [-0.2, 0, 0.12] }, 'out'],
    [0.45, null, { shoulderR: [-0.45, 0, -2.25], elbowR: [-0.4, 0, 0], chest: [-0.1, 0, -0.12], head: [-0.2, 0, -0.12] }, 'inOut'],
    [0.7, null, { shoulderR: [-0.45, 0, -1.95], elbowR: [-0.75, 0, 0], chest: [-0.1, 0, 0.12], head: [-0.2, 0, 0.12] }, 'inOut'],
    [0.95, null, { shoulderR: [-0.45, 0, -2.25], elbowR: [-0.4, 0, 0], chest: [-0.1, 0, -0.12], head: [-0.2, 0, -0.12] }, 'inOut'],
    [1.15, null, { kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'inOut'],
    [1.5, null, null, 'back'],
  ],
  root: {
    roll: [[0, 0], [0.2, 0.025, 'out'], [0.45, -0.025, 'inOut'], [0.7, 0.025, 'inOut'], [0.95, -0.025, 'inOut'], [1.15, 0, 'inOut']],
    up: [[0, 0], [1.15, 0], [1.28, 0.3, 'out'], [1.42, 0, 'in']],
    sy: [[0, 1], [1.15, 0.82, 'out'], [1.22, 1.12, 'out'], [1.42, 0.9, 'in'], [1.5, 1, 'back']],
  },
  markers: { end: 1.5 },
  warp: [],
  cues: [[0.2, 'sfx', 'lightsJingle'], [1.42, 'land']],
  cancel: 'any',
};

/** Level up: a quick double belly drum and a star hop. */
const levelUp: ClipDef = {
  id: 'lambo.levelUp',
  len: 0.85,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  keys: [
    [0, null, null],
    [0.12, null, { ...BELLY_L, ...BELLY_R, shoulderL: [-0.85, 0, -0.25] }, 'out'],
    [0.24, null, { ...BELLY_L, ...BELLY_R, shoulderR: [-0.85, 0, 0.25] }, 'inOut'],
    [0.46, 'cheer', { ...WIDE, shoulderL: [-2.6, 0, 0.7], shoulderR: [-2.6, 0, -0.7], head: [-0.35, 0, 0] }, 'backBig'],
    [0.85, null, null, 'inOut'],
  ],
  root: { up: [[0, 0], [0.3, 0], [0.46, 0.4, 'out'], [0.62, 0, 'in']], sy: [[0, 1], [0.24, 0.9], [0.3, 0.8, 'out'], [0.36, 1.15, 'out'], [0.62, 0.82, 'in'], [0.78, 1, 'back']] },
  markers: { end: 0.85 },
  warp: [],
  cues: [[0.12, 'sfx', 'drum'], [0.24, 'sfx', 'drum'], [0.62, 'land']],
  cancel: 'any',
};

/** Death length (s): the pose holds until heroView hides the sunk body (2.6 s); the blend-out starts after that. */
const DEATH_LEN = 2.65;
const DEAD_POSE = { body: [-1.45, 0, 0], chest: [0.1, 0, 0], head: [0.3, 0.3, 0], thighL: [-1.3, 0, 0.35], thighR: [-1.3, 0, -0.35], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], shoulderL: [-2.5, 0, 0.6], shoulderR: [-2.5, 0, -0.6], elbowL: [-0.7, 0, 0], elbowR: [-0.7, 0, 0], earL: [0.5, 0, -0.5], earR: [0.5, 0, 0.5] } as const;
/**
 * Death: deflates (squash, slump), wobbles, then tips over backwards like a sack (body pivot at the feet) onto his
 * back, paws in the air, a last twitch.
 */
const death: ClipDef = {
  id: 'lambo.death',
  len: DEATH_LEN,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.05,
  keys: [
    [0, null, null],
    [0.12, null, { chest: [-0.45, 0.2, 0.15], head: [-0.55, 0, 0], thighR: [0.3, 0, 0], kneeL: [0.3, 0, 0], earL: [0.4, 0, -0.4], earR: [0.4, 0, 0.4] }, 'expoOut'],
    [0.42, null, { chest: [0.55, 0, 0], head: [0.5, 0, 0], shoulderL: [0.3, 0, 0.1], shoulderR: [0.3, 0, -0.1], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], earL: [0.5, 0, -0.5], earR: [0.5, 0, 0.5] }, 'inOut'],
    [0.8, null, { body: [-1.45, 0, 0], chest: [0.1, 0, 0], head: [0.3, 0, 0], thighL: [-1.2, 0, 0.3], thighR: [-1.2, 0, -0.3], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-2.3, 0, 0.5], shoulderR: [-2.3, 0, -0.5], elbowL: [-0.8, 0, 0], elbowR: [-0.8, 0, 0], earL: [0.5, 0, -0.5], earR: [0.5, 0, 0.5] }, 'in'],
    [0.95, null, { body: [-1.38, 0, 0], chest: [0.1, 0, 0], head: [0.25, 0, 0], thighL: [-1.4, 0, 0.35], thighR: [-1.4, 0, -0.35], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], shoulderL: [-2.6, 0, 0.6], shoulderR: [-2.6, 0, -0.6], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], earL: [0.5, 0, -0.5], earR: [0.5, 0, 0.5] }, 'out'],
    [1.2, null, DEAD_POSE, 'inOut'],
    // held on his back, paws up, until the body has sunk out of sight (heroView: sink from 1.2 s): never a blend back
    [DEATH_LEN, null, DEAD_POSE, 'hold'],
  ],
  root: {
    sy: [[0, 1], [0.12, 0.84, 'expoOut'], [0.3, 0.8], [0.42, 0.86, 'inOut'], [0.78, 1], [0.82, 0.8, 'in'], [0.95, 1, 'back'], [DEATH_LEN, 1]],
    sx: [[0, 1], [0.12, 1.1, 'expoOut'], [0.42, 1.08], [0.78, 1], [DEATH_LEN, 1]],
    // the tip pivots at the feet, so the root eases forward while he falls: the body lies over his hitbox
    fwd: [[0, 0], [0.12, -0.12, 'expoOut'], [0.42, -0.05, 'inOut'], [0.8, 0.3, 'inOut'], [DEATH_LEN, 0.3]],
  },
  markers: { contact: 0, flop: 0.8, end: DEATH_LEN },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], [0.12, 'mouthOpen', 300], ['flop', 'land'], ['flop', 'sfx', 'bodyThud'], ['flop', 'fx', 'deathStars']],
  cancel: 'none',
};

/** Respawn: drops belly-first out of the sky, pancakes, pops up and drums his belly. */
const respawn: ClipDef = {
  id: 'lambo.respawn',
  len: 1.25,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, SPLAY],
    [0.3, null, { ...SPLAY, hips: [1.45, 0, 0], shoulderL: [-1.6, 0, 1.4], shoulderR: [-1.6, 0, -1.4] }, 'in'],
    [0.36, null, { ...SPLAY, hips: [1.5, 0, 0], shoulderL: [-1.5, 0, 1.6], shoulderR: [-1.5, 0, -1.6], thighL: [0.4, 0, 0.6], thighR: [0.4, 0, -0.6] }, 'in'],
    [0.46, null, { ...SPLAY, hips: [1.5, 0, 0], shoulderL: [-1.5, 0, 1.6], shoulderR: [-1.5, 0, -1.6], thighL: [0.4, 0, 0.6], thighR: [0.4, 0, -0.6] }, 'hold'],
    [0.62, null, { chest: [0.2, 0, 0], ...WIDE, kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'out'],
    [0.8, null, { ...BELLY_L, ...BELLY_R, shoulderL: [-0.85, 0, -0.25], head: [-0.3, 0, 0] }, 'inOut'],
    [0.95, null, { ...BELLY_L, ...BELLY_R, shoulderR: [-0.85, 0, 0.25], head: [-0.2, 0, 0] }, 'inOut'],
    [1.25, null, null, 'inOut'],
  ],
  root: {
    up: [[0, 1.2], [0.36, 0, 'in'], [0.46, 0], [0.56, 0.3, 'out'], [0.7, 0, 'in'], [1.25, 0]],
    sy: [[0, 1.1], [0.32, 1.0], [0.36, 0.55, 'expoIn'], [0.46, 0.6], [0.56, 1.14, 'out'], [0.7, 0.85, 'in'], [0.8, 0.94], [0.86, 1.0], [0.95, 0.93], [1.0, 1.0], [1.25, 1]],
    sx: [[0, 1], [0.32, 1.0], [0.36, 1.32, 'expoIn'], [0.46, 1.28], [0.56, 0.94, 'out'], [0.7, 1.06, 'in'], [1.25, 1, 'inOut']],
  },
  markers: { land: 0.36, end: 1.25 },
  warp: [],
  cues: [['land', 'sfx', 'bodyThud'], ['land', 'dustRing'], ['land', 'fx', 'starBurst'], [0.7, 'land'], [0.8, 'sfx', 'drum'], [0.95, 'sfx', 'drum']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ gait, set

/** Jolly heavy waddle: short strides, a big bounce, a double hip sway, little lean, arms held out. */
const GAIT: GaitProfile = {
  stride: 0.9,
  bounce: 1.45,
  lean: 0.55,
  hipSway: 2.1,
  headBob: 1.25,
  arms: 'out',
  variants: { ...DEFAULT_GAIT.variants, haste: { stride: 1.15, bounce: 1.9, lean: 1.2, hipSway: 1.6 } },
};

export const MOVES: MoveSet = {
  hero: 'lambo',
  stub: false,
  gait: GAIT,
  springs: HERO_SPRINGS.lambo,
  basic: BASICS,
  basicPick,
  slots: {
    q: { cast: qCast },
    w: { cast: wCast },
    e: { cast: eCast, pick: pickE },
    r: { cast: rCast },
  },
  idle,
  fidgets: [
    [drumFidget, 2],
    [yawn, 1],
  ],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Every authored clip (tests: compile, caps, timing). */
export const LAMBO_CLIPS: readonly ClipDef[] = [basicA, basicB, basicC, qCast, wCast, eCast, ...E_SHORT, rCast, idle, yawn, drumFidget, victory, emote, levelUp, death, respawn];
/** Nominal Belly Flop air time (s) and the splat delay after travelEnd (s). */
export { E_AIR as FLOP_AIR, RING_DELAY as FLOP_SPLAT_DELAY, pickE as pickBellyFlop };
