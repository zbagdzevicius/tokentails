/**
 * The FEEL side of the fun-plan sim contract (docs/plans/moba fun plan §0.2). The SIM lane adds these events to
 * `SimEvent` in src/sim/api.ts; until a build carries them they simply never arrive, and every consumer here
 * treats each one as optional. Once api.ts has them, `AnyEvent` collapses to `SimEvent` plus nothing new.
 * Render only: pure types and a guard, no DOM.
 */
import type { SimEvent } from '../sim/api';

export type PickupKind = 'frenzy' | 'snack';
export type XpReason = 'kill' | 'assist' | 'minion' | 'lastHit' | 'camp' | 'trickle' | 'pickup';

/** The §0.2 events as FEEL reads them (`tick` may be missing on older hosts; the reader keeps the last one). */
export type FunEvent =
  | { type: 'pickup'; tick?: number; id: number; kind: PickupKind; team: number }
  | { type: 'pickupSpawn'; tick?: number; index: number; kind: PickupKind; x: number; y: number }
  | { type: 'bounty'; tick?: number; id: number; value: number }
  | { type: 'shutdown'; tick?: number; killer: number; victim: number; value: number }
  | { type: 'comeback'; tick?: number; team: number }
  | { type: 'xp'; tick?: number; id: number; amount: number; reason: XpReason }
  | { type: 'firstBlood'; tick?: number; killer: number; victim: number }
  /** S8 "Nine Lives" and the rat camp buff (shape not pinned yet: `buff` or `kind` names it). */
  | { type: 'buff'; tick?: number; id: number; buff?: string; kind?: string; team?: number };

export type AnyEvent = SimEvent | FunEvent;

const FUN_TYPES = new Set(['pickup', 'pickupSpawn', 'bounty', 'shutdown', 'comeback', 'xp', 'firstBlood', 'buff']);

/** A sim event the fun plan added (narrowing helper; unknown types are neither). */
export function isFun(e: { type: string }): e is FunEvent {
  return FUN_TYPES.has(e.type);
}

/** The tick of any event, or `fallback` when it has none. */
export function tickOf(e: { tick?: number }, fallback: number): number {
  return typeof e.tick === 'number' && Number.isFinite(e.tick) ? e.tick : fallback;
}

/** "Nine Lives" buff (S8): the sim names it `nineLives` (or anything with "nine" in it). */
export function isNineLives(e: FunEvent): boolean {
  if (e.type !== 'buff') return false;
  const n = String(e.buff ?? e.kind ?? '').toLowerCase();
  return n.includes('nine');
}

/** Rat camp team buff (S10). */
export function isCampBuff(e: FunEvent): boolean {
  if (e.type !== 'buff') return false;
  const n = String(e.buff ?? e.kind ?? '').toLowerCase();
  return n === 'pack' || n.includes('camp') || n.includes('rat');
}
