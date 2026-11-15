/**
 * Dusty's bot casts (sim v31, build spec docs/plans/moba/ROSTER-V31.md §2.2 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI. Four Corks follows through
 * the brain's attack order.
 *
 * Fight: HIGH NOON at a foe below dustyNoonHpBp in range (never while a foe is on top of her); Lasso a foe on the line
 * within its range; Trick Shot the foe; Quick Draw away when a foe is within dustyDrawRange. Clear: Trick Shot a
 * minion with another beside it. Escape: Quick Draw away, then the Lasso.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, hits, pt } from '../casts';

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 3) && d <= a.r.range - RANGE_PAD && d > BOT_AI.dustyDrawRange && hpBp(w, foe) < BOT_AI.dustyNoonHpBp) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(3, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 2) && d <= BOT_AI.dustyDrawRange) {
    awayFrom(w, id, fx, fy, a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 1) && d <= a.w.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(1, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.reach) return cast(0, fx, fy, foe);
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  const q = abil(w, id).q;
  if (!canCast(w, id, 0) || w.kind[t] === Kind.Hero || distTo(w, id, t) > q.reach) return null;
  const tx = w.x[t];
  const ty = w.y[t];
  const n = collect(w, w.team[id], hits, (e, r) => e >= RANGE.minions && inRing(tx, ty, q.bounce, w.x[e], w.y[e], r));
  return n >= Math.max(need, 2) ? cast(0, tx, ty, t) : null;
}

export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 2)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 1) && distTo(w, id, foe) <= a.w.range - RANGE_PAD) return cast(1, w.x[foe], w.y[foe], NO_TARGET);
  return null;
}
