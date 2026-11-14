/**
 * Ziggy's bot casts (sim v29, build spec docs/plans/moba/ROSTER-V29.md §2.2 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI. Static Step follows through
 * the brain's attack order (a basic after a dash).
 *
 * Fight: ZIGZAG STORM on a foe below ziggyStormHpBp or with 2+ enemy heroes round it (never into an untanked enemy
 * tower unless it is about to fall); Spark Swipe with a foe in its ring; Zig into the foe (the recasts follow it);
 * Tail Flick when hurt and focused. Clear: Zig through a pack. Escape: Tail Flick away, then Zig away.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, iatan2, icos, idiv, isin } from '../../fixed';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inLine } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp, untankedThreat } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 3) && d <= a.r.reach) {
    const tower = untankedThreat(w, w.team[id], fx, fy, 0) >= 0 && hpBp(w, foe) >= BOT_AI.executeHpBp;
    if (!tower && (hpBp(w, foe) < BOT_AI.ziggyStormHpBp || foesNear(w, id, fx, fy, a.r.range) >= 2)) return cast(3, fx, fy, foe);
  }
  if (canCast(w, id, 1) && d <= a.w.radius) return cast(1, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 2) && w.target[foe] === id && hpBp(w, id) < BOT_AI.ziggyFlickHpBp) {
    awayFrom(w, id, fx, fy, a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  const reach = attackRange(w, id) + RANGE_PAD;
  if (canCast(w, id, 0) && d <= a.q.dash + reach) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, a.q.dash);
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  if (distTo(w, id, t) > q.dash) return null;
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const lx = hx + idiv(icos(dir) * q.dash, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * q.dash, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => e >= RANGE.minions && w.kind[e] !== Kind.Hero && inLine(hx, hy, lx, ly, q.width >> 1, w.x[e], w.y[e], r));
  return n >= Math.max(need, 2) ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 2)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 0)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.q.dash);
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}
