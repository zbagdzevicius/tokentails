/**
 * Shared authoring helpers for the sim v13 dogs' move sets (moves/nugget, marshmallow, bravo, chili, howler): a clip
 * builder with the house defaults, a delta merge, and the gallop leg cycle the dash clips share. Plain data, render
 * only. Joint conventions are common.ts's (thigh x < 0 forward, knee x > 0 bends, shoulder x < 0 raises the arm,
 * chest / hips x > 0 lean forward, head x < 0 lifts the chin; root yaw / pitch / roll in turns, sx / sy factors).
 */
import type { BoneName } from '../chars/skeleton';
import { Prio, type BoneDelta, type ClipDef, type Key, type ScalarKey } from '../anim/types';

export type D = Partial<Record<BoneName, BoneDelta>>;

export const merge = (...ds: D[]): D => Object.assign({}, ...ds) as D;

/** A whole-turn wrap: back to 0 one millisecond after a turn completes (a turn is invisible; a blend never unwinds it). */
export const WRAP = 0.001;

/** A clip with the house defaults (full mask, override, no warp, cancel any). */
export function mk(
  id: string,
  len: number,
  prio: Prio,
  keys: readonly Key[],
  o: Partial<Omit<ClipDef, 'id' | 'len' | 'prio' | 'keys'>> = {},
): ClipDef {
  return { mask: 'full', mode: 'override', markers: {}, warp: [], cancel: 'any', ...o, id, len, prio, keys };
}

/** Scalar keys: [t, v, ease?] tuples. */
export const sk = (...k: ScalarKey[]): readonly ScalarKey[] => k;

/** One gallop leg pose (A / B alternate): the scrabbling legs of a little dog running flat out. */
export const GALLOP_A: D = { thighL: [-1.0, 0, 0], kneeL: [0.9, 0, 0], thighR: [0.7, 0, 0], kneeR: [0.4, 0, 0], shoulderL: [0.6, 0, 0], shoulderR: [-1.0, 0, 0] };
export const GALLOP_B: D = { thighL: [0.7, 0, 0], kneeL: [0.4, 0, 0], thighR: [-1.0, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-1.0, 0, 0], shoulderR: [0.6, 0, 0] };

/** `n` alternating gallop keys from t0 to t1 on top of `base` (a dash's legs). */
export function gallopKeys(t0: number, t1: number, n: number, base: D): Key[] {
  const out: Key[] = [];
  for (let i = 0; i <= n; i++) out.push([t0 + ((t1 - t0) * i) / n, null, merge(base, i % 2 ? GALLOP_B : GALLOP_A), 'inOut']);
  return out;
}
