/** Bone masks (ANIM-SPEC §4.4): one weight per bone of the 28-bone rig, BONE_NAMES order. Read-only after load. */
import { BONE_INDEX, BONE_NAMES, type BoneName } from '../chars/skeleton';
import type { Mask } from './types';

export const BONES = BONE_NAMES.length;

function mask(names: readonly BoneName[], w = 1): Float32Array {
  const m = new Float32Array(BONES);
  for (const n of names) m[BONE_INDEX[n]] = w;
  return m;
}

const ARM_R_BONES: readonly BoneName[] = ['shoulderR', 'elbowR', 'pawR', 'weapon'];
const ARM_L_BONES: readonly BoneName[] = ['shoulderL', 'elbowL', 'pawL'];
const HEAD_BONES: readonly BoneName[] = ['head', 'mouth', 'earL', 'earR', 'eyeL', 'eyeR'];
const TAIL_BONES: readonly BoneName[] = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'];
const LEG_BONES: readonly BoneName[] = ['hips', 'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR'];

export const FULL = mask(BONE_NAMES);
/** Chest up: the gait keeps the legs, hips and body (an attack while walking). */
export const UPPER = mask(['chest', ...HEAD_BONES, ...ARM_L_BONES, ...ARM_R_BONES]);
export const LEGS = mask(LEG_BONES);
export const ARM_R = mask(ARM_R_BONES);
export const ARM_L = mask(ARM_L_BONES);
export const HEAD = mask(HEAD_BONES);
export const TAIL = mask(TAIL_BONES);

export const MASKS: Readonly<Record<Mask, Float32Array>> = Object.freeze({ full: FULL, upper: UPPER, legs: LEGS, armR: ARM_R, armL: ARM_L, head: HEAD, tail: TAIL });

/** Tail joint indices (tail0..tail5), so per-frame code never builds `tail${i}` strings. */
export const TAIL_INDEX: readonly number[] = Object.freeze(TAIL_BONES.map((n) => BONE_INDEX[n]));
