/**
 * L-DJ pure motion logic: two-bone IK, beat curves and the per-frame pose of the DJ kitten.
 * No three.js scene objects here (only Vector3 math), so it is unit tested in node.
 *
 * Spaces:
 * - "deck space": world position relative to the booth top centre (`world.boothTop`). The decks,
 *   platters and mixer live here, so a hand on a deck stays on the deck when the body sways.
 * - "body space": the DJ body group (hips pivot, unscaled kitten units; the root scales by djScale).
 */
import { Vector3 } from 'three';
import { LAYOUT } from '../config';
import type { BeatInfo } from '../types';

// ---------------------------------------------------------------------------------------------
// Rig constants (kitten units, before LAYOUT.djScale)
// ---------------------------------------------------------------------------------------------
export const RIG = Object.freeze({
  upperArm: 0.25,
  foreArm: 0.25,
  /** Shoulders in body space; R is the DJ's own right hand (world −X, the viewer's left). */
  shoulderR: Object.freeze([-0.16, 0.28, 0.06] as const),
  shoulderL: Object.freeze([0.16, 0.28, 0.06] as const),
});

/** Deck-space anchors (metres from the booth top centre). The decks sit towards the DJ (−Z). */
export const DECK = Object.freeze({
  centerZ: -0.22,
  platterX: 0.47,
  platterR: 0.2,
  surfaceY: 0.07,
  /** Where each hand rests on its platter (inner-back edge). */
  handPlatterR: Object.freeze([-0.38, 0.12, -0.26] as const),
  handPlatterL: Object.freeze([0.38, 0.12, -0.26] as const),
  /** Channel faders on the mixer. */
  faderR: Object.freeze([-0.07, 0.11, -0.2] as const),
  faderL: Object.freeze([0.07, 0.11, -0.2] as const),
  /** Crossfader travel (x) at the mixer front. */
  xfaderZ: -0.06,
  xfaderTravel: 0.07,
});

// ---------------------------------------------------------------------------------------------
// Two-bone IK
// ---------------------------------------------------------------------------------------------
const _d = new Vector3();
const _p = new Vector3();

/**
 * Analytic two-bone IK. Writes the elbow and the reached end point. The end equals `target` when it
 * is within reach; otherwise it lies on the shoulder→target line at full (or minimum) reach.
 * `pole` hints where the elbow bends to (any direction not parallel to the arm).
 */
export function solveTwoBone(
  shoulder: Vector3,
  target: Vector3,
  a: number,
  b: number,
  pole: Vector3,
  outElbow: Vector3,
  outEnd: Vector3,
): void {
  _d.subVectors(target, shoulder);
  let len = _d.length();
  if (len < 1e-6) {
    _d.set(0, -1, 0);
    len = 1e-6;
  } else {
    _d.divideScalar(len);
  }
  const minLen = Math.abs(a - b) + 1e-4;
  const maxLen = a + b - 1e-4;
  len = Math.min(maxLen, Math.max(minLen, len));
  outEnd.copy(shoulder).addScaledVector(_d, len);

  const cosA = Math.min(1, Math.max(-1, (a * a + len * len - b * b) / (2 * a * len)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) {
    // Pole parallel to the arm: pick any perpendicular.
    _p.set(_d.y, -_d.x, 0);
    if (_p.lengthSq() < 1e-8) _p.set(0, _d.z, -_d.y);
  }
  _p.normalize();
  outElbow.copy(shoulder).addScaledVector(_d, a * cosA).addScaledVector(_p, a * sinA);
}

// ---------------------------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------------------------
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Overshoot ease-out (back). */
export const easeOutBack = (x: number, s = 1.9) => {
  const t = clamp01(x) - 1;
  return 1 + t * t * ((s + 1) * t + s);
};
/** Elastic pop for the speech bubble (0 → 1 with a wobble). */
export const easeOutElastic = (x: number) => {
  const t = clamp01(x);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/**
 * Head nod on the kick: snaps down fast right after the kick (peak 1 at phase 0.12), then floats
 * back up through the rest of the beat. Exactly 0 at phase 0 so beats join without a jump.
 */
export function nodCurve(phase: number): number {
  const p = phase - Math.floor(phase);
  if (p < 0.12) return smooth(p / 0.12);
  const r = 1 - (p - 0.12) / 0.88;
  return r * r * (3 - 2 * r);
}

/**
 * Sword envelope over its 2-bar hold, p in 0..1: overshooting raise in the first 7%, hold, lower in
 * the last 12%. Returns 0 outside 0..1.
 */
export function swordEnvelope(p: number): number {
  if (p < 0 || p > 1) return 0;
  if (p < 0.07) return easeOutBack(p / 0.07);
  if (p > 0.88) return 1 - smooth((p - 0.88) / 0.12);
  return 1;
}

// ---------------------------------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------------------------------
export interface HandPose {
  /** Target in deck space (used with weight 1 − w). */
  deck: Vector3;
  /** Target in body space (used with weight w). */
  body: Vector3;
  /** 0 = on the decks, 1 = free in the air. */
  w: number;
}

/** Body rise with the sword up: +0.25 m in the world (kitten units are scaled by LAYOUT.djScale). */
export const SWORD_RISE = 0.25 / LAYOUT.djScale;

export type EyeMode = 'open' | 'happy' | 'wide';

export interface DjPose {
  /** Body bob (kitten units, +up), forward lean (rad), twist (rad, yaw), sway (rad, roll). */
  bob: number;
  lean: number;
  twist: number;
  sway: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** Ear wiggle (rad) */
  ear: number;
  tail: number;
  eyes: EyeMode;
  /** 0..1 mouth open */
  mouth: number;
  right: HandPose;
  left: HandPose;
  /** Platter scratch displacement for the right deck (rad offset). */
  scratch: number;
  /** Crossfader position −1..1. */
  xfader: number;
  /** 0..1 sword visibility/raise. */
  sword: number;
}

export interface PoseInput {
  beat: BeatInfo;
  /** Seconds (frame time). */
  time: number;
  /** 0..1 progress through the sword hold, or < 0 when no sword. */
  swordP: number;
  /** Unit direction from the pointing shoulder to the point target (body space), or null. */
  pointDir: Vector3 | null;
  /** Point with the left paw (target on the DJ's left, +X); default the right. */
  pointLeft?: boolean;
  /** 0..1 strength of the point gesture. */
  pointK: number;
  /** Yaw (rad) the head turns towards while pointing. */
  pointYaw: number;
}

export function createPose(): DjPose {
  return {
    bob: 0,
    lean: 0,
    twist: 0,
    sway: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    ear: 0,
    tail: 0,
    eyes: 'open',
    mouth: 0,
    right: { deck: new Vector3(), body: new Vector3(), w: 0 },
    left: { deck: new Vector3(), body: new Vector3(), w: 0 },
    scratch: 0,
    xfader: 0,
    sword: 0,
  };
}

const set3 = (v: Vector3, a: readonly number[]) => v.set(a[0], a[1], a[2]);

/**
 * The DJ's whole-body choreography for this instant. Pure: same input, same pose.
 * - intro/groove: nods on the kick, right paw scratches the record on the offbeat, left paw rides the mixer.
 * - build (or viewer hold): both paws on the faders, crouching and shaking more as the build rises.
 * - drop: head-bang; with the sword up the right paw holds it overhead and the left fist pumps.
 * - breakdown: blissful sway, eyes closed (happy), left paw waving in the air.
 * - point: the right arm reaches towards the new cat and the head turns to it.
 */
export function computePose(input: PoseInput, out: DjPose): DjPose {
  const { beat, time } = input;
  const section = beat.held ? 'build' : beat.section;
  const nod = nodCurve(beat.phase);
  const energy = beat.held ? Math.max(beat.energy, 0.75) : beat.energy;
  const barPhase = (beat.beatInBar + beat.phase) / 4;
  const sword = swordEnvelope(input.swordP);
  const beatTwo = Math.floor(beat.beat) % 2 === 0 ? 1 : -1;

  // ---- defaults: groove ----
  let nodAmp = 0.14 + 0.12 * energy;
  out.bob = -0.025 * nod * (0.6 + energy);
  out.lean = 0.12 + 0.05 * nod;
  out.twist = 0.08 * Math.sin(barPhase * Math.PI * 2);
  out.sway = 0.05 * Math.sin(beat.beat * Math.PI * 0.5);
  out.headRoll = 0.08 * Math.sin(beat.beat * Math.PI * 0.5);
  out.headYaw = 0.1 * Math.sin(barPhase * Math.PI * 2 + 0.6);
  out.headPitch = 0;
  out.eyes = 'open';
  out.mouth = 0;
  out.ear = 0.12 * beat.kick;
  out.tail = 0.5 * Math.sin(time * 2.2) + 0.2 * beat.kick;

  // Right paw: scratch back and forth on the offbeat (records go wicka-wicka).
  const scratch = Math.sin((beat.beat + 0.5) * Math.PI * 2) * (0.5 + 0.5 * energy);
  set3(out.right.deck, DECK.handPlatterR);
  out.right.deck.z += 0.06 * scratch;
  out.right.deck.y += 0.015 * Math.max(0, -scratch);
  out.right.w = 0;
  out.scratch = 0.9 * scratch;

  // Left paw: rides the mixer, nudging the crossfader every other beat.
  const xf = Math.sin(beat.beat * Math.PI * 0.5);
  out.left.deck.set(DECK.xfaderTravel * xf + 0.06, DECK.faderL[1], DECK.xfaderZ - 0.06);
  out.left.w = 0;
  out.xfader = xf;

  out.right.body.set(RIG.shoulderR[0] - 0.1, 0.62, 0.15);
  out.left.body.set(RIG.shoulderL[0] + 0.12, 0.62, 0.15);

  if (section === 'intro') {
    nodAmp *= 0.7;
    out.lean = 0.1;
    set3(out.left.deck, DECK.handPlatterL);
  } else if (section === 'build') {
    const p = beat.held ? Math.min(1, 0.5 + 0.5 * energy) : beat.sectionProgress;
    const shake = (0.01 + 0.03 * p) * Math.sin(time * 55);
    nodAmp = 0.1 + 0.18 * p;
    out.bob = -0.04 - 0.05 * p + shake;
    out.lean = 0.2 + 0.12 * p;
    out.headYaw = 0;
    out.headRoll = shake * 2;
    // Both paws on the channel faders; push them up as the build rises.
    set3(out.right.deck, DECK.faderR);
    set3(out.left.deck, DECK.faderL);
    out.right.deck.z += 0.05 * p + shake;
    out.left.deck.z += 0.05 * p - shake;
    out.scratch = 0;
    out.xfader = 0;
    out.ear = -0.25 * p + 0.1 * beat.kick;
    out.tail = 0.9 * Math.sin(time * 9) * p;
  } else if (section === 'drop') {
    nodAmp = 0.34;
    out.bob = -0.05 * nod;
    out.lean = 0.16 + 0.1 * nod;
    out.headRoll = 0.16 * beatTwo * nod;
    out.mouth = 0.6 + 0.4 * beat.kick;
    out.eyes = 'wide';
    out.ear = 0.3 * beat.kick;
    out.tail = 1.1 * Math.sin(time * 6);
  } else if (section === 'breakdown') {
    nodAmp = 0.06;
    out.bob = 0.01 * Math.sin(time * 1.4);
    out.lean = 0.06;
    out.sway = 0.12 * Math.sin(barPhase * Math.PI * 2);
    out.headRoll = 0.18 * Math.sin(barPhase * Math.PI * 2);
    out.headYaw = 0;
    out.eyes = 'happy';
    out.scratch = 0;
    // Left paw waves in the air, lighter-style.
    out.left.body.set(0.3 + 0.1 * Math.sin(barPhase * Math.PI * 2), 0.66, 0.16);
    out.left.w = 1;
    out.tail = 0.4 * Math.sin(time * 1.3);
  }

  // Sword: right paw overhead, pumping on the kick; left fist pumps.
  if (sword > 0) {
    out.right.body.set(-0.2, 0.66 + 0.035 * beat.kick, 0.12);
    out.right.w = Math.min(1, sword);
    out.left.body.set(0.27, 0.5 + 0.12 * beat.kick, 0.22);
    out.left.w = Math.max(out.left.w, Math.min(1, sword));
    out.headPitch = -0.12 * sword;
    // Stand up tall with the sword (reference: upright, sword straight overhead).
    out.bob += SWORD_RISE * sword;
    out.lean *= 1 - 0.6 * sword;
    out.eyes = 'wide';
    out.mouth = Math.max(out.mouth, 0.8);
    out.scratch = 0;
  }
  out.sword = sword;

  // Point at a new cat: right arm reaches out, head and body turn.
  if (input.pointDir && input.pointK > 0 && sword <= 0) {
    const k = input.pointK;
    const sh = input.pointLeft ? RIG.shoulderL : RIG.shoulderR;
    const hand = input.pointLeft ? out.left : out.right;
    hand.body.set(sh[0], sh[1], sh[2]).addScaledVector(input.pointDir, 0.49);
    hand.w = k;
    out.headYaw = out.headYaw * (1 - k) + input.pointYaw * k;
    out.twist = out.twist * (1 - k) + input.pointYaw * 0.35 * k;
    out.mouth = Math.max(out.mouth, 0.7 * k);
    out.eyes = 'wide';
    nodAmp *= 1 - 0.6 * k;
  }

  out.headPitch += nodAmp * nod;
  return out;
}
