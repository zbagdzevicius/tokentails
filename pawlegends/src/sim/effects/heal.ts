/** `heal` (POC.md §4.4): instant, or over time (Snack Break; broken by hard CC, see status.ts `interrupt`). */
import { idiv } from '../fixed';
import type { World } from '../world';

/** Heal `id` by `amount`, capped at max HP. Returns the HP restored. */
export function heal(w: World, id: number, amount: number): number {
  if (w.alive[id] === 0 || amount <= 0) return 0;
  const before = w.hp[id];
  w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + amount);
  return w.hp[id] - before;
}

export function healOverTime(w: World, id: number, total: number, ticks: number): void {
  if (w.alive[id] === 0 || total <= 0 || ticks <= 0) return;
  w.healT[id] = ticks;
  w.healLeft[id] = total;
}

/** One tick of every heal over time: equal shares, the remainder on the last tick, so the total is exact. */
export function stepHeals(w: World, from: number, to: number): void {
  for (let id = from; id < to; id++) {
    if (w.healT[id] === 0 || w.alive[id] === 0) continue;
    const part = idiv(w.healLeft[id], w.healT[id]);
    heal(w, id, part);
    w.healLeft[id] -= part;
    w.healT[id]--;
  }
}
