/**
 * Sim v11 `stack` (primitive 19): a count held by the VICTIM hero (Duchess's Disdain), not by the caster, so it needs
 * no kit array. A stack lasts `ttl` ticks from its last refresh; consuming it at `max` starts a lockout during which
 * no stack can be added. The timers tick in `tickStatus` and clear in `clearStatus` (death, respawn).
 */
import { RANGE, type World } from '../world';

/**
 * Add `n` stacks to hero `victim` (capped at `max`) and refresh their `ttl`. Nothing happens during a lockout or on a
 * non-hero. Returns true when the count is at `max` after the add (the caller consumes it and fires its payoff).
 */
export function addStack(w: World, victim: number, n: number, max: number, ttl: number): boolean {
  if (victim < RANGE.heroes || victim >= RANGE.minions || w.alive[victim] === 0) return false;
  if (n <= 0 || max <= 0 || w.mkLock[victim] > 0) return false;
  w.mkStack[victim] = Math.min(max, w.mkStack[victim] + n);
  w.mkT[victim] = Math.max(1, ttl);
  return w.mkStack[victim] >= max;
}

/** Clear hero `victim`'s stacks and lock new ones out for `lockout` ticks. */
export function consumeStack(w: World, victim: number, lockout: number): void {
  if (victim < RANGE.heroes || victim >= RANGE.minions) return;
  w.mkStack[victim] = 0;
  w.mkT[victim] = 0;
  w.mkLock[victim] = Math.max(0, lockout);
}

/** Hero `victim`'s stack count (0 when none). */
export const stacksOf = (w: World, victim: number): number => (victim >= RANGE.heroes && victim < RANGE.minions ? w.mkStack[victim] : 0);

/** Per tick (tickStatus): stack timers and lockouts count down; an expired stack resets. */
export function tickStacks(w: World, id: number): void {
  if (w.mkT[id] > 0 && --w.mkT[id] === 0) w.mkStack[id] = 0;
  if (w.mkLock[id] > 0) w.mkLock[id]--;
}

/** Death and respawn (clearStatus): no stacks, no lockout. */
export function clearStacks(w: World, id: number): void {
  w.mkStack[id] = 0;
  w.mkT[id] = 0;
  w.mkLock[id] = 0;
}
