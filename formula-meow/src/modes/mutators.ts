/**
 * Wild Card rules for Single race (ITERATION-4.md F11): which mutators a class offers, and the "Surprise me" deal.
 * The mutator table and its labels live in `core/app/race-labels.ts` (the shell's HUD tag, the grid banner and the
 * Daily Cup read the same names).
 */
import type { RaceClass } from '../types';
import { MUTATORS, type MutatorDef } from '../core/app/race-labels';

export { MUTATORS, type MutatorDef };

/** The Wild Card pick: none, one mutator (by id), or a surprise dealt at the start. */
export type WildPick = 'none' | 'surprise' | MutatorDef['id'];

export const WILD_PICKS: readonly WildPick[] = ['none', ...MUTATORS.map((m) => m.id), 'surprise'];

/**
 * Offered at this sim class. Every mutator is open from 50cc: the 72-race harness (mutators.test.ts, SIM_VERSION 11)
 * put the average-player bot on the podium in 79-89 % of 50cc races with each item mutator (none: 83 %; Cucumbers
 * Only 86 %), so none needs holding back. `minCls` stays for a mutator that ever does.
 */
export function mutatorAllowed(bit: number, cls: RaceClass): boolean {
  const m = MUTATORS.find((x) => x.bit === bit);
  return !!m && cls >= m.minCls;
}

export function mutatorById(id: string): MutatorDef | undefined {
  return MUTATORS.find((m) => m.id === id);
}

/**
 * The modifier bits of a Wild Card pick at a class. "Surprise me" deals one allowed mutator with `rand` (0..1); a
 * pick the class does not allow (a remembered Cucumbers Only after dropping to 50cc) races without one.
 */
export function wildModifiers(pick: WildPick, cls: RaceClass, rand: () => number = Math.random): number {
  if (pick === 'none') return 0;
  if (pick === 'surprise') {
    const pool = MUTATORS.filter((m) => cls >= m.minCls);
    return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]?.bit ?? 0;
  }
  const m = mutatorById(pick);
  return m && cls >= m.minCls ? m.bit : 0;
}

export function isWildPick(v: unknown): v is WildPick {
  return typeof v === 'string' && (WILD_PICKS as readonly string[]).includes(v);
}
