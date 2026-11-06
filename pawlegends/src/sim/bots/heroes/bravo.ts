/**
 * Bravo's bot casts (sim v14, build spec docs/plans/moba/DOGS-V13.md §1.3 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI. The flop is passive.
 *
 * Fight: ENCORE! with 2+ foes in his ring and a friend near (or on one low foe with a friend near); Center Stage when
 * crowded or dived; Stage Dive onto the foe; Crocodile Tears at the foe. Clear: a Stage Dive into a pack after level
 * 6. Escape: Stage Dive toward home.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, type World } from '../../world';
import { collect, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, allyNear, cast, distTo, foesNear, hits, pt } from '../casts';

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3) && allyNear(w, id, foe)) {
    const n = foesNear(w, id, hx, hy, a.r.radius);
    if (n >= BOT_AI.bravoEncoreFoes || (n >= 1 && d <= a.r.radius && hpBp(w, foe) <= BOT_AI.bravoEncoreHpBp)) return cast(3, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 1)) {
    const crowd = foesNear(w, id, hx, hy, a.w.radius) >= BOT_AI.bravoStageFoes;
    const dived = w.target[foe] === id && d <= a.w.radius;
    if (crowd || dived) return cast(1, hx, hy, NO_TARGET);
  }
  // Stage Dive engages: not when he is the one about to drop.
  if (canCast(w, id, 2) && hpBp(w, id) > BOT_AI.bravoDiveHpBp && d > a.e.radius && d <= a.e.dash + a.e.radius) return cast(2, fx, fy, NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdMelee));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (w.level[id] < 6 || w.kind[t] !== Kind.Minion || !canCast(w, id, 2)) return null;
  const e = abil(w, id).e;
  if (distTo(w, id, t) > e.dash) return null;
  const tx = w.x[t];
  const ty = w.y[t];
  const n = collect(w, w.team[id], hits, (v, r) => inRing(tx, ty, e.radius, w.x[v], w.y[v], r));
  return n >= Math.max(need, 3) ? cast(2, tx, ty, NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, _foe: number, hx: number, hy: number): Command | null {
  if (canCast(w, id, 2)) return cast(2, hx, hy, NO_TARGET);
  return null;
}
