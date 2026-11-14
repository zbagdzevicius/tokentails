/**
 * Champ's bot casts (sim v29, build spec docs/plans/moba/ROSTER-V29.md §2.4 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI. One-Two follows through the
 * brain's attack order.
 *
 * Fight: KNOCKOUT! a foe below champKoHpBp in reach (never into an untanked enemy tower unless it is about to fall);
 * Bob and Weave in when the foe is out of reach; Haymaker a foe in its cone; Rope-a-Dope when focused. Clear: the
 * Haymaker on a pack. Escape: Bob and Weave away, then Rope-a-Dope.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { iatan2 } from '../../fixed';
import type { Rng } from '../../rng';
import { type World } from '../../world';
import { collect, inCone } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp, untankedThreat } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, hits, pt } from '../casts';

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const tower = untankedThreat(w, w.team[id], fx, fy, 0) >= 0 && hpBp(w, foe) >= BOT_AI.executeHpBp;
  if (canCast(w, id, 3) && d <= a.r.reach + RANGE_PAD && hpBp(w, foe) < BOT_AI.champKoHpBp && !tower) return cast(3, fx, fy, foe);
  if (canCast(w, id, 1) && w.target[foe] === id && hpBp(w, id) < BOT_AI.champGuardHpBp) return cast(1, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range) return cast(0, fx, fy, NO_TARGET);
  const reach = attackRange(w, id) + RANGE_PAD;
  if (canCast(w, id, 2) && d > reach && d <= a.e.dash + reach && !tower) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.min(a.e.dash, d));
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  const hx = w.x[id];
  const hy = w.y[id];
  if (distTo(w, id, t) > q.range) return null;
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, q.range, q.arc, w.x[e], w.y[e], r));
  return n >= need ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 2)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 1)) return cast(1, w.x[id], w.y[id], NO_TARGET);
  return null;
}
