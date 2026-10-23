/**
 * Avietė's move set (ANIM-SPEC §14 "Avietė: Assassin, Electric, claws and spark orbs"). Render only.
 *
 * Silhouette first: every move is a root-motion shape that reads at 45 px. A jab / cross / spinning back-kick basic
 * combo, a flying knee when Charged (Shy, Then Shiny), Q a tornado swipe, W a wet-cat shake, E a blink that collapses
 * her to a line and lands in a spinning crouch (the return pops out of the line into a backflip), R an axe kick that
 * arrives in the air on the victim and rebounds in a backflip. Timings come from SIM_TIMING (no tick literals):
 * basics contact at the 8 t windup, every Q/W/E/R is instant, so contact binds to `cast` and the weight goes into
 * the follow-through (§4.2 rule 7).
 *
 * Live Wire's return has no `recasts` count in the data (only a 60 t `recastWindow`), so the director's recast path
 * never picks it: `slots.e.pick` does, from `AVI_STATE` (the window opened by E or R, kept by skillfx/aviete.ts on the
 * render clock). `pick` and `basicPick` never allocate.
 */
import { BASIC_CONTACT, DEFAULT_GAIT, HERO_SPRINGS } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type BoneDelta, type ClipDef, type GaitProfile, type Key, type MoveCtx, type MoveSet, type ScalarKey } from '../anim/types';
import type { BoneName } from '../chars/skeleton';

type D = Partial<Record<BoneName, BoneDelta>>;

const T = SIM_TIMING.aviete;
/** Basic contact (s): the 8 t windup. */
const C = BASIC_CONTACT;
/** Basic period (s); a basic clip ends before the next swing starts (period − windup after its contact). */
export const AVI_PERIOD_S = T.period * TICK_S;
/** Live Wire's return window (s), from the data. */
export const AVI_WIRE_S = T.slots.e.recastWindow * TICK_S;
/** W haste (s): the sprint posture holds this long. */
export const AVI_HASTE_S = T.slots.w.duration * TICK_S;

// ------------------------------------------------------------------------------------------------ shared render state

const N = 16;
/**
 * Per-entity render state shared with skillfx/aviete.ts (entity ids < 16, like the director). `clock` is the render
 * clock in seconds (advanced by SKILL_FX.update); `wireUntil` the end of an open Live Wire / Short Circuit return;
 * `isReturn` what `pick` chose for the E cast being played; `charged` a Charged swing or cast waiting for its hit.
 */
export const AVI_STATE = {
  clock: 0,
  wireUntil: new Float64Array(N),
  isReturn: new Uint8Array(N),
  charged: new Uint8Array(N),
  /** 1 while her basic's likely target (the enemy her facing points at within reach) is a hero; kept by skillfx. */
  swingHero: new Uint8Array(N),
  /** ids seen (pick / basicPick / markers): skillfx tracks their positions for the blink endpoints. */
  seen: new Uint8Array(N),
};
/** Slack (s) for the peek: pick runs ≈ 1.6 ticks before the cast fires. */
const PEEK_SLACK = 0.12;

const note = (id: number): boolean => {
  if (id < 0 || id >= N) return false;
  AVI_STATE.seen[id] = 1;
  return true;
};

// ------------------------------------------------------------------------------------------------ helpers

/** Pose keys on her own stance (clawReady, the null first key) with bone deltas. */
const k = (t: number, d: D | null, e?: Key[3], pose: string | null = null): Key => [t, pose, d, e];
const s = (...ks: ScalarKey[]): readonly ScalarKey[] => ks;
const CROUCH: D = { body: [0.22, 0, 0], chest: [0.3, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], kneeL: [1.05, 0, 0], kneeR: [1.05, 0, 0] };
/** A post-contact landing crouch: less chest lean than CROUCH, so her head stays out of the victim's body. */
const CROUCH_LO: D = { ...CROUCH, body: [0.14, 0, 0], chest: [0.2, 0, 0] };
const TUCK: D = { chest: [0.5, 0, 0], head: [0.3, 0, 0], thighL: [-1.45, 0, 0], thighR: [-1.45, 0, 0], kneeL: [1.9, 0, 0], kneeR: [1.9, 0, 0], shoulderL: [-0.9, 0, 0.45], shoulderR: [-0.9, 0, -0.45] };
/** The blink "line": legs straight together, arms straight up, chin up (the root squeezes her to 0.45 × 1.45). */
const LINE: D = { chest: [-0.12, 0, 0], head: [-0.3, 0, 0], thighL: [0, 0, -0.06], thighR: [0, 0, 0.06], kneeL: [0, 0, 0], kneeR: [0, 0, 0], shoulderL: [-2.9, 0, 0.12], shoulderR: [-2.9, 0, -0.12], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], earL: [-0.6, 0, 0], earR: [-0.6, 0, 0] };
/** Ears pinned back (blinks, dashes). */
const EARS_BACK: D = { earL: [-0.75, 0, -0.2], earR: [-0.75, 0, 0.2] };
const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;

// ------------------------------------------------------------------------------------------------ basics

/** A: left jab. The chest turns right so the left shoulder drives through; a short lunge. */
const basicA: ClipDef = {
  id: 'aviete.basicA',
  len: C + 0.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    k(0, null),
    k(C * 0.62, { chest: [0.05, 0.45, 0], hips: [0, 0.2, 0], shoulderL: [0.45, 0, 0.15], elbowL: [-0.7, 0, 0], shoulderR: [-0.25, 0, 0], thighR: [0.15, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0] }, 'out'),
    k(C, { chest: [0.25, -0.55, 0], hips: [0, -0.25, 0], head: [0.05, -0.25, 0], shoulderL: [-1.6, 0, -0.15], elbowL: [0.9, 0, 0], shoulderR: [0.2, 0, 0], thighL: [-0.55, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.35, 0, 0] }, 'expoIn'),
    k(C + 0.1, { chest: [0.2, -0.5, 0], hips: [0, -0.22, 0], shoulderL: [-1.4, 0, -0.1], elbowL: [0.5, 0, 0], thighL: [-0.5, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.3, 0, 0] }, 'out'),
    // the recovery step: the lead foot lifts and comes home while the lunge returns (no planted foot slides)
    k(C + 0.19, { chest: [0.1, -0.25, 0], hips: [0, -0.1, 0], shoulderL: [-0.5, 0, 0.1], elbowL: [-0.6, 0, 0], thighL: [-0.45, 0, 0], kneeL: [0.85, 0, 0], thighR: [0.1, 0, 0], kneeR: [0.2, 0, 0] }, 'out'),
    k(C + 0.27, { chest: [0.06, -0.1, 0], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] }, 'in'),
    k(C + 0.4, null, 'inOut'),
  ],
  root: {
    fwd: s([0, 0], [C * 0.62, -0.06, 'out'], [C, 0.24, 'expoIn'], [C + 0.1, 0.2, 'out'], [C + 0.25, 0, 'out'], [C + 0.4, 0]),
    up: s([0, 0], [C + 0.1, 0], [C + 0.18, 0.03, 'out'], [C + 0.26, 0, 'in'], [C + 0.4, 0]),
    sy: s([0, 1], [C * 0.62, 0.9, 'out'], [C, 1.07, 'expoIn'], [C + 0.16, 1, 'out']),
  },
  lockFeet: true,
  markers: { coil: 0.02, contact: C, end: C + 0.4 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'trailOn', 'pawL'], ['contact', 'whoosh', 'S'], [C + 0.16, 'trailOff']],
  cancel: 'afterContact',
};

/** B: right cross, bigger: the hips and chest turn left through the punch, the rear leg drives. */
const basicB: ClipDef = {
  id: 'aviete.basicB',
  len: C + 0.42,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    k(0, null),
    k(C * 0.62, { chest: [0.05, -0.6, 0], hips: [0, -0.25, 0], shoulderR: [0.5, 0, -0.15], elbowR: [-0.8, 0, 0], shoulderL: [-0.4, 0, 0.2], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'out'),
    k(C, { chest: [0.3, 0.75, 0], hips: [0, 0.35, 0], head: [0.05, 0.3, 0], shoulderR: [-1.65, 0, 0.15], elbowR: [0.95, 0, 0], shoulderL: [0.3, 0, 0.3], thighL: [-0.6, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.45, 0, 0], kneeR: [0.2, 0, 0] }, 'expoIn'),
    k(C + 0.12, { chest: [0.25, 0.85, 0], hips: [0, 0.4, 0], shoulderR: [-1.45, 0, 0.25], elbowR: [0.6, 0, 0], thighL: [-0.55, 0, 0], kneeL: [0.45, 0, 0], thighR: [0.4, 0, 0] }, 'out'),
    // the recovery step: the lead foot lifts and comes home while the lunge returns
    k(C + 0.21, { chest: [0.12, 0.35, 0], hips: [0, 0.15, 0], shoulderR: [-0.5, 0, -0.1], elbowR: [-0.7, 0, 0], thighL: [-0.45, 0, 0], kneeL: [0.9, 0, 0], thighR: [0.1, 0, 0], kneeR: [0.2, 0, 0] }, 'out'),
    k(C + 0.29, { chest: [0.06, 0.12, 0], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] }, 'in'),
    k(C + 0.42, null, 'inOut'),
  ],
  root: {
    fwd: s([0, 0], [C * 0.62, -0.08, 'out'], [C, 0.28, 'expoIn'], [C + 0.12, 0.22, 'out'], [C + 0.27, 0, 'out'], [C + 0.42, 0]),
    up: s([0, 0], [C + 0.12, 0], [C + 0.2, 0.035, 'out'], [C + 0.28, 0, 'in'], [C + 0.42, 0]),
    sy: s([0, 1], [C * 0.62, 0.88, 'out'], [C, 1.08, 'expoIn'], [C + 0.16, 1, 'out']),
  },
  lockFeet: true,
  markers: { coil: 0.02, contact: C, end: C + 0.42 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'trailOn', 'pawR'], ['contact', 'whoosh', 'M'], [C + 0.18, 'trailOff']],
  cancel: 'afterContact',
};

/**
 * C: spinning back-kick. The turn reaches a half turn exactly on the contact ('inOut', so it reads across frames): her
 * back is to the victim, the right leg shot straight out behind her (heel first, foot flexed), the chest folded the
 * other way for balance and the head looking over the shoulder. The second half of the turn finishes in the
 * follow-through (C → C + 0.18), then the whole turn snaps to 0. A 0.28 m hop carries it.
 */
const basicC: ClipDef = {
  id: 'aviete.basicC',
  len: C + 0.46,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    k(0, null),
    k(0.06, merge(CROUCH, { chest: [0.25, 0.35, 0], shoulderL: [-0.3, 0, 0.6], shoulderR: [-0.3, 0, -0.6] }), 'out'),
    k(0.17, { chest: [-0.1, -0.2, 0.15], thighR: [-1.0, 0, -0.25], kneeR: [1.7, 0, 0], thighL: [-0.25, 0, 0], kneeL: [0.35, 0, 0], shoulderL: [-0.6, 0, 1.15], shoulderR: [-0.6, 0, -1.15], tail0: [0.3, 0.6, 0] }, 'inOut'),
    // contact: back to the target, the heel driven straight back into it (thigh pitched behind her, knee locked)
    k(C, { body: [0.2, 0, 0], chest: [0.45, 0, 0.15], head: [-0.35, 0.95, 0.1], thighR: [1.45, 0, -0.08], kneeR: [0, 0, 0], footR: [-0.55, 0, 0], thighL: [-0.35, 0, 0], kneeL: [0.55, 0, 0], shoulderL: [-0.2, 0, 1.25], shoulderR: [0.3, 0, -1.2], tail0: [-0.5, -0.4, 0] }, 'expoIn'),
    k(C + 0.08, { body: [0.16, 0, 0], chest: [0.4, 0, 0.12], head: [-0.3, 0.7, 0.08], thighR: [1.3, 0, -0.08], kneeR: [0.05, 0, 0], footR: [-0.4, 0, 0], thighL: [-0.35, 0, 0], kneeL: [0.55, 0, 0], shoulderL: [-0.2, 0, 1.2], shoulderR: [0.3, 0, -1.1] }, 'out'),
    k(C + 0.22, { chest: [0.15, 0, 0], thighR: [-0.4, 0, 0], kneeR: [1.1, 0, 0], kneeL: [0.6, 0, 0], thighL: [-0.3, 0, 0] }, 'inOut'),
    k(C + 0.46, null, 'inOut'),
  ],
  root: {
    // half a turn on the contact (back to the target), the rest in the follow-through; the whole turn then snaps to 0
    yaw: s([0, 0], [0.05, 0], [C, -0.5, 'inOut'], [C + 0.18, -1, 'inOut'], [C + 0.181, 0, 'step'], [C + 0.46, 0]),
    up: s([0, 0], [0.06, 0], [0.17, 0.28, 'out'], [C, 0.18, 'inOut'], [C + 0.2, 0, 'in'], [C + 0.46, 0]),
    // the hop's drift comes home before the landing (C + 0.2), so no planted foot slides
    fwd: s([0, 0], [C, 0.16, 'in'], [C + 0.18, 0, 'out'], [C + 0.46, 0]),
    sy: s([0, 1], [0.06, 0.84, 'out'], [0.12, 1.08], [C + 0.19, 1], [C + 0.22, 0.8, 'in'], [C + 0.36, 1, 'back']),
  },
  lockFeet: true,
  markers: { coil: 0.02, contact: C, land: C + 0.2, end: C + 0.46 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'whoosh', 'M'], [0.06, 'trailOn', 'footR'], ['contact', 'smear'], ['contact', 'fx', 'kickSpark'], ['land', 'land'], [C + 0.24, 'trailOff']],
  cancel: 'afterContact',
};

/**
 * Charged (Shy, Then Shiny): a muay-thai flying knee. A crouch that compresses down (not toward the victim), a 0.45 m
 * spring with the knee already chambered and the rear leg trailing, then on the contact the torso leans back and the
 * arms pull down so the knee is her forward-most point; she rebounds off it in the air and lands crouched in place.
 */
const charged: ClipDef = {
  id: 'aviete.charged',
  len: C + 0.46,
  mask: 'full',
  mode: 'override',
  prio: Prio.Basic,
  keys: [
    k(0, null),
    k(0.09, merge(CROUCH, { body: [0.15, 0, 0], chest: [0.12, 0, 0], shoulderL: [0.7, 0, 0.35], shoulderR: [0.7, 0, -0.35] }, EARS_BACK), 'out'),
    k(0.18, { chest: [-0.15, 0, 0], head: [-0.2, 0, 0], thighL: [0.7, 0, 0], kneeL: [0.7, 0, 0], thighR: [-1.6, 0, 0], kneeR: [2.0, 0, 0], shoulderL: [-2.1, 0, 0.45], shoulderR: [-2.1, 0, -0.45] }, 'out'),
    k(C, { chest: [-0.25, 0, 0], head: [-0.2, 0, 0], thighR: [-1.8, 0, 0], kneeR: [2.2, 0, 0], thighL: [0.65, 0, 0], kneeL: [0.8, 0, 0], shoulderL: [0.6, 0, 0.4], shoulderR: [0.6, 0, -0.4], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0] }, 'expoIn'),
    k(C + 0.08, { chest: [-0.2, 0, 0], head: [-0.15, 0, 0], thighR: [-1.6, 0, 0], kneeR: [2.0, 0, 0], thighL: [0.5, 0, 0], kneeL: [0.8, 0, 0], shoulderL: [0.55, 0, 0.4], shoulderR: [0.55, 0, -0.4], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0] }, 'out'),
    k(C + 0.18, CROUCH_LO, 'in'),
    k(C + 0.46, null, 'inOut'),
  ],
  root: {
    up: s([0, 0], [0.09, 0], [0.2, 0.45, 'out'], [C, 0.3, 'inOut'], [C + 0.16, 0, 'in'], [C + 0.46, 0]),
    pitch: s([0, 0], [0.09, 0], [C, -0.06, 'in'], [C + 0.16, 0, 'out'], [C + 0.46, 0]),
    // she rebounds off the knee in the air: the drift is home by the landing, so the crouch never slides
    fwd: s([0, 0], [0.09, -0.06, 'out'], [C, 0.28, 'expoIn'], [C + 0.15, 0, 'out'], [C + 0.46, 0]),
    sy: s([0, 1], [0.09, 0.78, 'out'], [0.14, 1.12, 'out'], [C + 0.15, 1], [C + 0.18, 0.76, 'in'], [C + 0.34, 1, 'back']),
  },
  lockFeet: true,
  markers: { coil: 0.02, contact: C, land: C + 0.16, end: C + 0.46 },
  warp: [['contact', 'contact']],
  cues: [['coil', 'earsBack'], [0.09, 'whoosh', 'M'], [0.09, 'trailOn', 'kneeR'], ['contact', 'freeze', 60], ['contact', 'shake', 1], ['contact', 'sfx', 'zap'], ['contact', 'fx', 'chargedHit'], ['land', 'land'], [C + 0.2, 'trailOff']],
  cancel: 'afterContact',
};

const BASICS: readonly ClipDef[] = [basicA, basicB, basicC];

/**
 * Charged → the flying knee, but only when the swing is at an enemy hero: the sim consumes the charge (and stuns) on
 * a hero only, so a Charged swing at a minion or a tower is a plain basic. `swingHero` is the render's read of the
 * swing target (skillfx/aviete.ts update: the enemy her facing points at within reach). Never allocates.
 */
function basicPick(ctx: MoveCtx): ClipDef | null {
  if (!note(ctx.id)) return null;
  AVI_STATE.charged[ctx.id] = ctx.charged ? 1 : 0;
  return ctx.charged && AVI_STATE.swingHero[ctx.id] === 1 ? charged : null;
}

// ------------------------------------------------------------------------------------------------ Q Spark Swipe

/**
 * Instant cone. The peek is the coil: a 0.12 turn back with the claws drawn wide, whipping round into the contact.
 * On the contact she faces the aim with the lead claw fully extended into the cone and the body leaning in, and HOLDS
 * that facing for 3 frames (the frames the damage number appears on). Then the follow-through spins one full
 * clockwise tornado turn ('inOut', to QC + 0.28) in a 0.32 m hop and lands crouched with the claws low. The turn
 * snaps back to 0 as it completes (a whole turn is invisible).
 */
const QC = 0.06;
/** The landing after the tornado turn (the turn ends at QC + 0.28). */
const Q_LAND = 0.34;
/** The swipe at contact: facing the aim, the lead claw fully out into the cone, the body leaning in. */
const Q_HIT: D = { body: [0.12, 0, 0], chest: [0.25, -0.5, 0], head: [-0.15, 0.2, 0], thighL: [-0.55, 0, 0], kneeL: [0.7, 0, 0], thighR: [0.3, 0, 0], kneeR: [0.2, 0, 0], shoulderR: [-1.5, 0, -0.3], elbowR: [0, 0, 0], shoulderL: [0.35, 0, 0.9], elbowL: [-0.5, 0, 0] };
const q: ClipDef = {
  id: 'aviete.q',
  len: 0.66,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.03,
  keys: [
    k(0, null),
    k(0.03, { chest: [0.15, 0.35, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], shoulderR: [-0.4, 0, -1.2], elbowR: [0.5, 0, 0], shoulderL: [-0.4, 0, 1.1] }, 'out'),
    k(QC, Q_HIT, 'expoIn'),
    // the contact pose held (3 frames) while the claw drives on through the cone
    k(QC + 0.05, merge(Q_HIT, { chest: [0.25, -0.55, 0], shoulderR: [-1.4, 0, -0.55] }), 'out'),
    k(0.18, { body: [0.06, 0, 0], chest: [0.12, -0.35, 0], thighL: [-0.6, 0, 0], kneeL: [1.0, 0, 0], thighR: [-0.1, 0, 0], kneeR: [0.5, 0, 0], shoulderR: [-0.6, 0, -1.4], elbowR: [0.3, 0, 0], shoulderL: [-0.2, 0, 1.4], elbowL: [0.4, 0, 0] }, 'inOut'),
    k(0.26, { chest: [0.05, -0.3, 0], thighL: [-0.7, 0, 0], kneeL: [1.2, 0, 0], thighR: [-0.25, 0, 0], kneeR: [0.7, 0, 0], shoulderR: [-0.2, 0, -1.5], elbowR: [0.6, 0, 0], shoulderL: [-0.2, 0, 1.5], elbowL: [0.6, 0, 0] }, 'lin'),
    k(Q_LAND + 0.02, merge(CROUCH, { chest: [0.45, 0, 0], shoulderR: [0.25, 0, -0.9], shoulderL: [0.25, 0, 0.9] }), 'in'),
    k(Q_LAND + 0.12, merge(CROUCH, { chest: [0.42, 0, 0], shoulderR: [0.25, 0, -0.85], shoulderL: [0.25, 0, 0.85] }), 'hold'),
    k(0.66, null, 'inOut'),
  ],
  root: {
    yaw: s([0, 0], [0.03, 0.12, 'out'], [QC, 0, 'in'], [QC + 0.05, -0.04, 'out'], [QC + 0.28, -1, 'inOut'], [QC + 0.281, 0, 'step'], [0.66, 0]),
    up: s([0, 0], [0.03, 0.04], [QC + 0.05, 0.12, 'out'], [0.2, 0.32, 'out'], [Q_LAND, 0, 'in'], [0.66, 0]),
    sy: s([0, 1], [0.03, 0.88], [0.08, 1.1, 'out'], [Q_LAND - 0.01, 0.98], [Q_LAND + 0.02, 0.78, 'in'], [0.54, 1, 'back']),
  },
  markers: { coil: 0.01, contact: QC, land: Q_LAND, end: 0.66 },
  warp: [['contact', 'cast']],
  cues: [['coil', 'trailOn', 'pawR'], ['coil', 'earsBack'], ['contact', 'whoosh', 'L'], ['contact', 'sfx', 'crackle'], ['contact', 'ghost'], ['contact', 'shake', 1], [QC + 0.26, 'trailOff'], ['land', 'land']],
  cancel: 'afterContact',
};

// ------------------------------------------------------------------------------------------------ W Shiny Coat

/** The wet-cat shake: a hunch on the cast, then a 12 Hz head / chest / roll shake decaying over 0.36 s, the coat
 * puffed 1.08, and a proud chest-out pop that sheds the sparks. Upper mask: she keeps running. */
const WC = 0.05;
const wKeys: Key[] = [k(0, null), k(WC, merge({ chest: [0.3, 0, 0], head: [0.25, 0, 0], shoulderL: [0.35, 0, 0.45], shoulderR: [0.35, 0, -0.45] }, EARS_BACK), 'out')];
const wRoll: ScalarKey[] = [[0, 0], [WC, 0]];
const SHAKES = 9;
const SHAKE_DT = 1 / 24; // half a 12 Hz period
for (let i = 0; i < SHAKES; i++) {
  const t = WC + 0.04 + i * SHAKE_DT;
  const a = 1 - i / SHAKES;
  const sgn = i % 2 ? -1 : 1;
  wKeys.push(k(t, { chest: [0.2, 0.18 * sgn * a, 0.22 * sgn * a], head: [0.15, 0.55 * sgn * a, 0.25 * sgn * a], earL: [-0.3 * a, 0, (0.3 + 0.5 * a) * sgn], earR: [-0.3 * a, 0, (0.3 + 0.5 * a) * sgn], shoulderL: [0.1, 0, 0.6 + 0.3 * a], shoulderR: [0.1, 0, -0.6 - 0.3 * a] }, 'inOut'));
  wRoll.push([t, 0.035 * sgn * a, 'inOut']);
}
const W_SHINE = WC + 0.04 + SHAKES * SHAKE_DT + 0.04;
wKeys.push(k(W_SHINE, { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-0.6, 0, 1.35], shoulderR: [-0.6, 0, -1.35], earL: [0.2, 0, 0.3], earR: [0.2, 0, -0.3] }, 'back'));
wKeys.push(k(W_SHINE + 0.16, { chest: [-0.25, 0, 0], head: [-0.3, 0, 0], shoulderL: [-0.55, 0, 1.3], shoulderR: [-0.55, 0, -1.3] }, 'hold'));
wKeys.push(k(W_SHINE + 0.36, null, 'inOut'));
wRoll.push([W_SHINE - 0.02, 0], [W_SHINE + 0.36, 0]);
const w: ClipDef = {
  id: 'aviete.w',
  len: W_SHINE + 0.36,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.04,
  keys: wKeys,
  root: {
    roll: wRoll,
    sx: s([0, 1], [WC, 0.96], [WC + 0.06, 1.08, 'out'], [W_SHINE, 1.06], [W_SHINE + 0.36, 1, 'inOut']),
    sy: s([0, 1], [WC, 0.92], [WC + 0.06, 1.05, 'out'], [W_SHINE, 1.04], [W_SHINE + 0.08, 1.08, 'back'], [W_SHINE + 0.36, 1, 'inOut']),
  },
  calm: { roll: 0.3 },
  markers: { coil: 0.01, contact: WC, shine: W_SHINE, end: W_SHINE + 0.36 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'sfx', 'crackle'], ['contact', 'fx', 'shed'], [WC + 0.04 + 3 * SHAKE_DT, 'fx', 'shed'], [WC + 0.04 + 6 * SHAKE_DT, 'fx', 'shed'], ['shine', 'fx', 'shine'], ['shine', 'sfx', 'zap']],
  cancel: 'afterContact',
};

/**
 * While hasted there is no hold clip: the gait's haste variant (stride 1.4, lean 2.8) carries the sprint, so the arms
 * and chest keep moving with the run and a standing hasted Avietė stands normally. Haste over: a small shake-off from
 * whatever pose she is in (the null first key), so it never pops into a lean after a swing.
 */
const wEnd: ClipDef = {
  id: 'aviete.wEnd',
  len: 0.36,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  keys: [
    k(0, null),
    k(0.07, { chest: [0.08, 0.12, 0.08], head: [0.05, 0.3, 0.12], earL: [-0.2, 0, -0.45], earR: [-0.2, 0, -0.45] }, 'inOut'),
    k(0.14, { chest: [0.06, -0.12, -0.08], head: [0.05, -0.3, -0.12], earL: [-0.2, 0, 0.45], earR: [-0.2, 0, 0.45] }, 'inOut'),
    k(0.21, { chest: [-0.06, 0.05, 0.03], head: [-0.08, 0.12, 0.05] }, 'inOut'),
    k(0.36, null, 'inOut'),
  ],
  markers: { contact: 0 },
  warp: [],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ E Live Wire

/**
 * The blink: 2 frames of crouch-squash on the peek, then she collapses to a vertical line (0.45 × 1.45, arms up)
 * across the snap (the interpolation teleports ≥ 3.5 m one tick before the cast fires, so the line spans
 * contact − 40 ms … contact + 15 ms), arrives stretched, squashes with an overshoot and lands in a spinning crouch.
 */
const EC = 0.06;
/** The three-point landing: right knee down, the right paw planted beside it, torso upright, head up. */
const E_KNEEL: D = { body: [0, 0, 0], chest: [0.1, 0, 0], head: [-0.2, 0, 0], thighL: [-0.75, 0, 0], kneeL: [1.25, 0, 0], thighR: [0.45, 0, 0], kneeR: [1.5, 0, 0], shoulderR: [0.15, 0, -0.42], elbowR: [0, 0, 0], shoulderL: [-0.6, 0, 0.5], elbowL: [0, 0, 0] };
const blinkIn: Key[] = [k(0, null), k(0.018, merge(CROUCH, { body: [0.28, 0, 0], shoulderL: [0.5, 0, 0.25], shoulderR: [0.5, 0, -0.25] }, EARS_BACK), 'out'), k(0.034, LINE, 'expoIn'), k(EC + 0.015, LINE, 'hold')];
const blinkSx: ScalarKey[] = [[0, 1], [0.018, 1.18, 'out'], [0.034, 0.45, 'expoIn'], [EC + 0.015, 0.45]];
const blinkSy: ScalarKey[] = [[0, 1], [0.018, 0.74, 'out'], [0.034, 1.45, 'expoIn'], [EC + 0.015, 1.45]];
const eOut: ClipDef = {
  id: 'aviete.e',
  len: 0.68,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.02,
  keys: [
    ...blinkIn,
    // the spin: a tight, upright crouch with the arms in (a clean spinning silhouette)
    k(0.12, merge(CROUCH, { body: [0, 0, 0], chest: [0.06, 0, 0], shoulderL: [-0.2, 0, 0.55], shoulderR: [-0.2, 0, -0.55], elbowL: [-1.2, 0, 0], elbowR: [-1.2, 0, 0] }, EARS_BACK), 'out'),
    k(0.2, merge(CROUCH, { body: [0, 0, 0], chest: [0.06, 0, 0], shoulderL: [-0.2, 0, 0.7], shoulderR: [-0.2, 0, -0.6], elbowL: [-0.9, 0, 0], elbowR: [-1.1, 0, 0] }, EARS_BACK), 'inOut'),
    // after the spin: the ninja three-point landing, torso up (one knee down, the support paw beside that knee)
    k(0.3, E_KNEEL, 'inOut'),
    k(0.42, merge(E_KNEEL, { chest: [0.08, 0, 0] }), 'hold'),
    k(0.68, null, 'inOut'),
  ],
  root: {
    sx: s(...blinkSx, [0.11, 1.24, 'out'], [0.2, 0.95, 'inOut'], [0.3, 1]),
    sy: s(...blinkSy, [0.11, 0.7, 'out'], [0.2, 1.02, 'inOut'], [0.3, 0.94], [0.45, 0.94], [0.62, 1, 'inOut']),
    up: s([0, 0], [0.034, 0.12, 'out'], [EC + 0.015, 0.16], [0.11, 0, 'in'], [0.68, 0]),
    yaw: s([0, 0], [EC + 0.015, 0], [0.2, 1, 'out'], [0.201, 0, 'step'], [0.68, 0]),
  },
  markers: { coil: 0.004, contact: EC, land: 0.11, end: 0.68 },
  warp: [['contact', 'cast']],
  cues: [['coil', 'ghost'], ['coil', 'earsBack'], ['contact', 'sfx', 'zap'], ['land', 'dust'], ['land', 'fx', 'wireTo'], [0.12, 'whoosh', 'S']],
  cancel: 'afterContact',
};

/** Live Wire's return (and Short Circuit's way back): out of the line straight into a backflip (0.9 m, 0.3 s). */
const eBack: ClipDef = {
  id: 'aviete.eBack',
  len: 0.68,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.02,
  keys: [
    ...blinkIn,
    k(0.14, TUCK, 'out'),
    k(0.3, merge(TUCK, { chest: [0.3, 0, 0], thighL: [-0.9, 0, 0], thighR: [-0.9, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0] }), 'inOut'),
    k(0.37, merge(CROUCH_LO, { shoulderL: [-0.4, 0, 1.1], shoulderR: [-0.4, 0, -1.1] }), 'in'),
    k(0.68, null, 'back'),
  ],
  root: {
    sx: s(...blinkSx, [0.12, 1, 'out']),
    sy: s(...blinkSy, [0.12, 1.05, 'out'], [0.35, 1], [0.39, 0.74, 'in'], [0.55, 1, 'back']),
    pitch: s([0, 0], [EC + 0.015, 0], [0.37, -1, 'inOut'], [0.371, 0, 'step'], [0.68, 0]),
    up: s([0, 0], [0.034, 0.12, 'out'], [EC + 0.015, 0.2], [0.21, 0.9, 'out'], [0.37, 0, 'in'], [0.68, 0]),
  },
  markers: { coil: 0.004, contact: EC, land: 0.37, end: 0.68 },
  warp: [['contact', 'cast']],
  cues: [['coil', 'ghost'], ['contact', 'sfx', 'zap'], ['contact', 'whoosh', 'M'], ['land', 'land'], ['land', 'dust']],
  cancel: 'afterContact',
};

/** E: the return when a Live Wire / Short Circuit window is open (render clock), else the blink out. */
function ePick(ctx: MoveCtx): ClipDef {
  if (!note(ctx.id)) return eOut;
  const until = AVI_STATE.wireUntil[ctx.id];
  const back = until > 0 && AVI_STATE.clock <= until + PEEK_SLACK;
  AVI_STATE.isReturn[ctx.id] = back ? 1 : 0;
  return back ? eBack : eOut;
}

// ------------------------------------------------------------------------------------------------ R Short Circuit

/**
 * The peek is the coil and the chamber at the origin (a crouch, the line squeeze of the blink, only 0.1 m up: the
 * squeeze sells the vanish). The teleport lands one tick before the cast; she rises 0.95 m beside the victim with the
 * leg still high, and on the cast tick (contact: smear, trail on) the heel chops DOWN, reaching the victim one tick
 * later (AXE_DOWN at RC + 1 tick: freeze, shake, punch and the heel's ground ring land there). She rebounds into a
 * backflip away (pitch −1, fwd −0.3 m at its peak, home before the landing so the crouch never slides) and lands
 * upright, chest up and the root tipped slightly back (the kit lands her 1 m from the victim's centre).
 */
const RC = 0.07;
/** The heel reaches the victim one sim tick after the contact. */
const R_HEEL = RC + TICK_S;
const R_FLIP = RC + 0.075;
const R_LAND = 0.5;
/** The chopped-down axe kick (the contact pose). */
const AXE_DOWN: D = { body: [0.06, 0, 0], chest: [0.35, 0, 0], head: [0.05, 0, 0], thighR: [-0.85, 0, 0], kneeR: [0.05, 0, 0], footR: [0.6, 0, 0], thighL: [0.35, 0, 0], kneeL: [0.7, 0, 0], shoulderL: [0.45, 0, 0.95], shoulderR: [0.45, 0, -0.95], tail0: [-0.4, 0, 0] };
/** The chamber: the right leg kicked high, arms up and wide. */
const R_CHAMBER: D = { chest: [-0.4, 0, 0], head: [-0.2, 0, 0], thighR: [-2.35, 0, 0], kneeR: [0, 0, 0], thighL: [0.45, 0, 0], kneeL: [0.95, 0, 0], shoulderL: [-1.3, 0, 1.3], shoulderR: [-1.3, 0, -1.3], tail0: [0.5, 0, 0] };
/** The landing crouch: knees deep, torso upright (chest back, head up), so her head stays clear of a victim 1 m away. */
const R_CROUCH: D = { ...CROUCH, body: [-0.04, 0, 0], chest: [-0.06, 0, 0], head: [-0.15, 0, 0] };
const r: ClipDef = {
  id: 'aviete.r',
  len: 0.95,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ult,
  blendIn: 0.02,
  keys: [
    k(0, null),
    k(0.03, merge(CROUCH, { body: [0.3, 0, 0], chest: [0.4, 0, 0], shoulderL: [0.8, 0, 0.3], shoulderR: [0.8, 0, -0.3] }, EARS_BACK), 'out'),
    // the chamber, through the snap: the leg high, arms up and wide
    k(0.055, R_CHAMBER, 'out'),
    // contact: arrived in the air, the leg still high and the chop starting
    k(RC, merge(R_CHAMBER, { chest: [-0.25, 0, 0], thighR: [-1.9, 0, 0], shoulderL: [-1.0, 0, 1.2], shoulderR: [-1.0, 0, -1.2] }), 'out'),
    // one tick later the heel is down on the victim
    k(R_HEEL, AXE_DOWN, 'expoIn'),
    k(R_FLIP, merge(AXE_DOWN, { chest: [0.42, 0, 0], thighR: [-0.6, 0, 0], footR: [0.7, 0, 0] }), 'out'),
    k(0.22, TUCK, 'out'),
    k(0.42, merge(TUCK, { thighL: [-0.8, 0, 0], thighR: [-0.8, 0, 0], kneeL: [1.1, 0, 0], kneeR: [1.1, 0, 0] }), 'inOut'),
    k(R_LAND, merge(R_CROUCH, { shoulderR: [0.3, 0, -0.4], shoulderL: [-0.35, 0, 1.15] }), 'in'),
    k(0.66, merge(R_CROUCH, { chest: [-0.02, 0, 0], shoulderR: [0.3, 0, -0.4], shoulderL: [-0.35, 0, 1.1] }), 'hold'),
    k(0.95, null, 'inOut'),
  ],
  root: {
    // 0.1 m at the origin (the line squeeze), the 0.95 m only after the snap to the victim (contact − 1 tick)
    up: s([0, 0], [0.03, 0], [0.04, 0.1, 'out'], [RC, 0.95, 'out'], [R_FLIP, 0.85, 'out'], [0.28, 1.1, 'out'], [R_LAND, 0, 'in'], [0.95, 0]),
    // the backflip snaps back to 0 the instant it completes (a whole turn is invisible), so the fade-out never unflips;
    // she lands tipped slightly back (away from the victim) and rights herself over the hold
    pitch: s([0, 0], [R_FLIP, 0], [0.47, -1, 'inOut'], [0.471, 0, 'step'], [R_LAND + 0.05, -0.025, 'out'], [0.66, -0.025], [0.95, 0, 'inOut']),
    fwd: s([0, 0], [R_FLIP, 0], [0.3, -0.3, 'out'], [R_LAND - 0.02, 0, 'inOut'], [0.95, 0]),
    sy: s([0, 1], [0.03, 0.74, 'out'], [0.045, 1.12, 'out'], [RC, 1.04, 'out'], [R_HEEL, 0.95, 'expoIn'], [R_FLIP, 0.92], [0.24, 1.04], [R_LAND - 0.02, 1], [R_LAND + 0.02, 0.74, 'in'], [0.68, 1, 'back']),
  },
  lockFeet: true,
  markers: { coil: 0.004, contact: RC, heel: R_HEEL, land: R_LAND, end: 0.95 },
  warp: [['contact', 'cast']],
  cues: [
    ['coil', 'ghost'],
    ['coil', 'earsBack'],
    [0.03, 'whoosh', 'L'],
    ['contact', 'trailOn', 'footR'],
    ['contact', 'smear'],
    ['contact', 'sfx', 'zap'],
    ['heel', 'freeze', 100],
    ['heel', 'shake', 3],
    ['heel', 'punch', 0.05],
    ['heel', 'fx', 'heel'],
    ['contact', 'mouthOpen', 250],
    [0.24, 'ghost'],
    [0.3, 'trailOff'],
    ['land', 'land'],
    ['land', 'dust'],
  ],
  cancel: 'none',
};

// ------------------------------------------------------------------------------------------------ idle, emotes, end

/** Idle flavour: a long cat stretch (play bow with a yawn, then up on the toes, arms high), sparks off the tail. */
const idle: ClipDef = {
  id: 'aviete.idle',
  len: 2.4,
  mask: 'full',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.25,
  blendOut: 0.3,
  keys: [
    k(0, null),
    k(0.6, { body: [0.2, 0, 0], chest: [0.7, 0, 0], head: [-0.6, 0, 0], shoulderL: [-1.7, 0, 0.2], shoulderR: [-1.7, 0, -0.2], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], thighL: [0.15, 0, 0], thighR: [0.15, 0, 0], tail0: [-0.7, 0, 0], tail1: [-0.3, 0, 0] }, 'inOut'),
    k(1.25, { body: [0.2, 0, 0], chest: [0.75, 0, 0], head: [-0.65, 0.15, 0], shoulderL: [-1.75, 0, 0.2], shoulderR: [-1.75, 0, -0.2], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], thighL: [0.15, 0, 0], thighR: [0.15, 0, 0], tail0: [-0.8, 0, 0], tail1: [-0.4, 0, 0] }, 'inOut'),
    k(1.7, { chest: [-0.4, 0, 0], head: [-0.5, 0, 0], shoulderL: [-2.7, 0, 0.35], shoulderR: [-2.7, 0, -0.35], elbowL: [0.5, 0, 0], elbowR: [0.5, 0, 0], footL: [0.4, 0, 0], footR: [0.4, 0, 0], earL: [0.2, 0, 0], earR: [0.2, 0, 0] }, 'inOut'),
    k(1.95, { chest: [-0.35, 0, 0], head: [-0.45, 0, 0], shoulderL: [-2.6, 0, 0.35], shoulderR: [-2.6, 0, -0.35], elbowL: [0.5, 0, 0], elbowR: [0.5, 0, 0] }, 'hold'),
    k(2.4, null, 'inOut'),
  ],
  // no root fwd: both feet stay planted through the bow and the stretch (the hips push back through the body pitch)
  root: { sy: s([0, 1], [0.6, 0.86], [1.25, 0.85], [1.7, 1.08], [1.95, 1.06], [2.4, 1]), up: s([0, 0], [1.7, 0.05], [1.95, 0.05], [2.4, 0]) },
  lockFeet: true,
  markers: { contact: 0.6, end: 2.4 },
  warp: [],
  cues: [[0.65, 'mouthOpen', 450], [1.7, 'fx', 'tailSpark']],
  cancel: 'any',
};

/** Shy fidget: paws up over the face, a peek to one side, then she shakes it off. */
const shy: ClipDef = {
  id: 'aviete.shy',
  len: 1.5,
  mask: 'upper',
  mode: 'override',
  prio: Prio.Idle,
  blendIn: 0.15,
  keys: [
    k(0, null),
    k(0.25, { chest: [0.2, 0, 0], head: [0.35, 0, 0], shoulderL: [-2.1, 0, -0.35], shoulderR: [-2.1, 0, 0.35], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0], earL: [-0.6, 0, -0.3], earR: [-0.6, 0, 0.3] }, 'out'),
    k(0.7, { chest: [0.2, 0.25, 0], head: [0.2, 0.45, 0.15], shoulderL: [-2.1, 0, -0.35], shoulderR: [-1.2, 0, 0.3], elbowL: [-1.4, 0, 0], elbowR: [-0.9, 0, 0], earL: [-0.4, 0, -0.3], earR: [-0.2, 0, 0.3] }, 'inOut'),
    k(1.0, { chest: [0.15, 0.25, 0], head: [0.2, 0.45, 0.15], shoulderL: [-2.1, 0, -0.35], shoulderR: [-1.2, 0, 0.3], elbowL: [-1.4, 0, 0], elbowR: [-0.9, 0, 0] }, 'hold'),
    k(1.5, null, 'inOut'),
  ],
  markers: { contact: 0.25, end: 1.5 },
  warp: [],
  cancel: 'any',
};

/** Victory: a double backflip (1.15 m) landing in a pose, one claw high, hip popped, sparks. */
const victory: ClipDef = {
  id: 'aviete.victory',
  len: 2.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.08,
  keys: [
    k(0, null),
    k(0.12, merge(CROUCH, { shoulderL: [0.7, 0, 0.3], shoulderR: [0.7, 0, -0.3] }), 'out'),
    k(0.26, TUCK, 'out'),
    k(0.66, TUCK, 'lin'),
    k(0.8, merge(CROUCH, { shoulderL: [-1.2, 0, 1.2], shoulderR: [-1.2, 0, -1.2] }), 'in'),
    k(1.0, { chest: [-0.2, 0.35, 0.12], head: [-0.25, 0.35, 0.18], hips: [0, 0, 0.12], shoulderR: [-2.6, 0, -0.25], elbowR: [0.4, 0, 0], shoulderL: [0.25, 0, 0.7], elbowL: [-0.8, 0, 0], thighL: [-0.35, 0.2, 0.12], kneeL: [0.45, 0, 0], footL: [0.4, 0, 0], tail0: [-0.3, 0.6, 0] }, 'back'),
    k(1.85, { chest: [-0.22, 0.35, 0.12], head: [-0.25, 0.4, 0.18], hips: [0, 0, 0.12], shoulderR: [-2.6, 0, -0.25], elbowR: [0.4, 0, 0], shoulderL: [0.25, 0, 0.7], elbowL: [-0.8, 0, 0], thighL: [-0.35, 0.2, 0.12], kneeL: [0.45, 0, 0], footL: [0.4, 0, 0], tail0: [-0.3, 0.6, 0] }, 'hold'),
    k(2.0, null, 'inOut'),
  ],
  root: {
    pitch: s([0, 0], [0.12, 0], [0.8, -2, 'inOut'], [0.801, 0, 'step'], [2.0, 0]),
    up: s([0, 0], [0.12, 0], [0.46, 1.15, 'out'], [0.8, 0, 'in'], [2.0, 0]),
    sy: s([0, 1], [0.12, 0.75, 'out'], [0.2, 1.12], [0.78, 1], [0.84, 0.72, 'in'], [1.0, 1.06, 'back'], [1.2, 1]),
  },
  markers: { contact: 0.12, land: 0.8, end: 2.0 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L'], ['land', 'land'], ['land', 'dustRing'], [1.0, 'fx', 'victorySpark'], [1.0, 'sfx', 'crackle']],
  cancel: 'any',
};

/** Emote: hides behind her paws, then pops out with a hop, arms wide, a spark burst ("shy, then shiny"). */
const emote: ClipDef = {
  id: 'aviete.emote',
  len: 1.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.1,
  keys: [
    k(0, null),
    k(0.25, merge(CROUCH, { head: [0.35, 0, 0], shoulderL: [-2.1, 0, -0.35], shoulderR: [-2.1, 0, 0.35], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0], earL: [-0.6, 0, -0.3], earR: [-0.6, 0, 0.3] }), 'out'),
    k(0.7, merge(CROUCH, { head: [0.3, 0, 0], shoulderL: [-2.1, 0, -0.35], shoulderR: [-2.1, 0, 0.35], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0], earL: [-0.6, 0, -0.3], earR: [-0.6, 0, 0.3] }), 'hold'),
    k(0.9, { chest: [-0.35, 0, 0], head: [-0.4, 0, 0], shoulderL: [-0.7, 0, 1.5], shoulderR: [-0.7, 0, -1.5], thighL: [0.2, 0, 0.1], thighR: [0.2, 0, -0.1], earL: [0.3, 0, 0.3], earR: [0.3, 0, -0.3] }, 'backBig'),
    k(1.25, { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-0.7, 0, 1.45], shoulderR: [-0.7, 0, -1.45] }, 'hold'),
    k(1.6, null, 'inOut'),
  ],
  root: { up: s([0, 0], [0.7, 0], [0.9, 0.45, 'out'], [1.1, 0, 'in'], [1.6, 0]), sy: s([0, 1], [0.25, 0.8, 'out'], [0.7, 0.78], [0.8, 1.15, 'out'], [1.1, 1], [1.14, 0.8, 'in'], [1.3, 1, 'back']) },
  markers: { contact: 0.8, land: 1.1, end: 1.6 },
  warp: [['contact', 'cast']],
  cues: [['contact', 'fx', 'victorySpark'], ['contact', 'sfx', 'crackle'], ['land', 'land']],
  cancel: 'any',
};

/** Level up: a spark hop with one spin, arms high. */
const levelUp: ClipDef = {
  id: 'aviete.levelUp',
  len: 0.7,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0.05,
  keys: [k(0, null), k(0.1, CROUCH, 'out'), k(0.3, { chest: [-0.3, 0, 0], head: [-0.35, 0, 0], shoulderL: [-2.5, 0, 0.4], shoulderR: [-2.5, 0, -0.4], thighL: [-0.3, 0, 0], kneeL: [0.8, 0, 0] }, 'out'), k(0.46, CROUCH, 'in'), k(0.7, null, 'back')],
  root: { up: s([0, 0], [0.1, 0], [0.28, 0.5, 'out'], [0.46, 0, 'in'], [0.7, 0]), yaw: s([0, 0], [0.1, 0], [0.4, 1, 'inOut'], [0.401, 0, 'step'], [0.7, 0]), sy: s([0, 1], [0.1, 0.8, 'out'], [0.16, 1.1], [0.46, 0.8, 'in'], [0.62, 1, 'back']) },
  markers: { contact: 0.1, land: 0.46, end: 0.7 },
  warp: [],
  cues: [[0.12, 'fx', 'shine'], [0.46, 'land']],
  cancel: 'any',
};

/** Death: electrocuted (a 12 Hz stiff shake for 0.3 s, arms and legs splayed), a stiff fall onto her side, a fizzle. */
const deathKeys: Key[] = [k(0, null)];
const deathSide: ScalarKey[] = [[0, 0]];
const ZAP: D = { chest: [-0.35, 0, 0], head: [-0.45, 0, 0], shoulderL: [-0.7, 0, 1.55], shoulderR: [-0.7, 0, -1.55], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], thighL: [0.05, 0, 0.35], thighR: [0.05, 0, -0.35], kneeL: [0, 0, 0], kneeR: [0, 0, 0], earL: [0.4, 0, 0.3], earR: [0.4, 0, -0.3], tail0: [-0.9, 0, 0], tail1: [-0.3, 0, 0] };
for (let i = 0; i < 8; i++) {
  const t = 0.03 + i * SHAKE_DT;
  const sg = i % 2 ? -1 : 1;
  deathKeys.push(k(t, merge(ZAP, { chest: [-0.35, 0.12 * sg, 0.1 * sg], head: [-0.45, 0.25 * sg, 0.15 * sg] }), i === 0 ? 'expoOut' : 'inOut'));
  deathSide.push([t, 0.04 * sg, 'inOut']);
}
const D_FALL = 0.03 + 8 * SHAKE_DT;
deathSide.push([D_FALL, 0]);
deathKeys.push(k(D_FALL + 0.08, ZAP, 'inOut'), k(D_FALL + 0.42, null, 'in', 'faint'), k(1.15, null, 'hold'));
const death: ClipDef = {
  id: 'aviete.death',
  len: 1.15,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.03,
  blendOut: 0.3,
  keys: deathKeys,
  root: {
    side: deathSide,
    fwd: s([0, 0], [D_FALL, -0.05], [D_FALL + 0.42, -0.4, 'in'], [1.15, -0.45]),
    up: s([0, 0], [0.03, 0.12, 'expoOut'], [D_FALL, 0.08], [D_FALL + 0.2, 0, 'in'], [1.15, 0]),
    sy: s([0, 1], [0.03, 1.1, 'expoOut'], [D_FALL, 1.06], [D_FALL + 0.42, 1, 'in'], [D_FALL + 0.47, 0.82, 'in'], [D_FALL + 0.62, 1, 'back']),
  },
  markers: { contact: 0, fall: D_FALL, end: 1.15 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], ['contact', 'sfx', 'zap'], ['contact', 'mouthOpen', 320], [0.04, 'fx', 'deathZap'], [0.2, 'fx', 'deathZap'], [D_FALL + 0.42, 'land'], [D_FALL + 0.55, 'fx', 'fizzle']],
  cancel: 'none',
};

/** Respawn: drops from 1.2 m spinning in a tuck, a lightning strike, a three-point landing, then up into her stance. */
const respawn: ClipDef = {
  id: 'aviete.respawn',
  len: 1.0,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    k(0, TUCK),
    // the spinning ball stays tucked through the bolt and most of the drop, then opens for the landing
    k(0.2, TUCK, 'hold'),
    k(0.3, { thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], shoulderL: [-2.2, 0, 0.4], shoulderR: [-2.2, 0, -0.4] }, 'inOut'),
    k(0.36, { body: [0.3, 0, 0], chest: [0.55, 0, 0], head: [-0.4, 0, 0], thighL: [-0.95, 0, 0], kneeL: [1.45, 0, 0], thighR: [0.6, 0, 0], kneeR: [1.55, 0, 0], shoulderR: [-0.15, 0, -0.15], elbowR: [0.4, 0, 0], shoulderL: [-0.6, 0, 1.45] }, 'in'),
    k(0.66, { body: [0.3, 0, 0], chest: [0.5, 0, 0], head: [-0.4, 0, 0], thighL: [-0.95, 0, 0], kneeL: [1.45, 0, 0], thighR: [0.6, 0, 0], kneeR: [1.55, 0, 0], shoulderR: [-0.15, 0, -0.15], elbowR: [0.4, 0, 0], shoulderL: [-0.6, 0, 1.4] }, 'hold'),
    k(1.0, null, 'inOut'),
  ],
  root: { up: s([0, 1.2], [0.36, 0, 'in'], [1.0, 0]), yaw: s([0, 0], [0.04, 0], [0.32, 1, 'lin'], [0.321, 0, 'step'], [1.0, 0]), sy: s([0, 1.08], [0.34, 1.1], [0.38, 0.7, 'in'], [0.58, 1, 'back']) },
  markers: { land: 0.36, end: 1.0 },
  warp: [],
  cues: [[0.01, 'fx', 'respawnBolt'], ['land', 'land'], ['land', 'dustRing'], ['land', 'fx', 'respawnLand']],
  cancel: 'any',
};

// ------------------------------------------------------------------------------------------------ gait

/** A light, springy ninja sprint: long low strides, arms swept back, more bounce; haste leans further in. */
const gait: GaitProfile = {
  ...DEFAULT_GAIT,
  stride: 1.12,
  bounce: 1.35,
  lean: 1.9,
  hipSway: 0.6,
  headBob: 0.7,
  arms: 'trail',
  variants: { ...DEFAULT_GAIT.variants, haste: { stride: 1.4, bounce: 1.5, lean: 2.8 }, sneak: { stride: 0.9, bounce: 0.3, lean: 3 } },
};

export const MOVES: MoveSet = {
  hero: 'aviete',
  stub: false,
  gait,
  springs: HERO_SPRINGS.aviete,
  basic: BASICS,
  basicPick,
  slots: {
    q: { cast: q },
    w: { cast: w, end: wEnd },
    e: { cast: eOut, recasts: [eBack], pick: ePick },
    r: { cast: r },
  },
  idle,
  fidgets: [[shy, 1]],
  victory,
  emote,
  death,
  respawn,
  levelUp,
};

/** Every clip in the set (tests, gallery). */
export const AVI_CLIPS: readonly ClipDef[] = [basicA, basicB, basicC, charged, q, w, wEnd, eOut, eBack, r, idle, shy, victory, emote, levelUp, death, respawn];
