/**
 * Meatball's bot casts (sim v11, build spec docs/plans/moba/CATS-V11.md §2.1 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports (aimed, awayFrom, foesNear,
 * hurtAlly, allyNear, cast, distTo, hits, pt, RANGE_PAD); tuning numbers live in data/bots.ts BOT_AI.
 *
 * Phase 0 scaffold: no casts yet.
 */
import type { BotParams } from '../../../data/bots';
import type { Command } from '../../api';
import type { Rng } from '../../rng';
import type { World } from '../../world';

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(_w: World, _id: number, _foe: number, _p: BotParams, _rng: Rng): Command | null {
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(_w: World, _id: number, _t: number, _need: number): Command | null {
  return null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(_w: World, _id: number, _foe: number, _hx: number, _hy: number): Command | null {
  return null;
}
