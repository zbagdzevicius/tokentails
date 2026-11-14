/**
 * Biscuit's bot casts (sim v29, build spec docs/plans/moba/ROSTER-V29.md §2.3 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI. Good Boy follows through the
 * brain's attack order.
 *
 * Fight: WALKIES! with 2+ enemy heroes in his ring, or one low one; Fetch! a foe on a clear line (the ball stops at
 * the first unit) with an ally near to follow up, or a low foe, and only while he does not stand in reach of an untanked
 * enemy tower (the catch lands the foe beside him); Tail Wag a foe in his ring off a hurt friend, off him when hurt, or
 * on two foes; Stubborn when he is slowed or rooted and focused (a
 * cleanse; the escape path uses it too). Clear: Tail Wag a pack. Escape: Stubborn when
 * slowed or rooted, then Tail Wag.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { type World } from '../../world';
import { collect, inLine, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { nearestAlly } from '../../heroes/lambo';
import { abil } from '../../heroes/talents';
import { hpBp, untankedThreat } from '../sense';
import { RANGE_PAD, aimed, cast, distTo, foesNear, hits, hurtAlly, pt } from '../casts';

/** Is any unit other than `foe` on the line to it (the ball stops at the first unit)? */
function blocked(w: World, id: number, foe: number, width: number): boolean {
  const hx = w.x[id];
  const hy = w.y[id];
  const d = distTo(w, id, foe);
  const n = collect(w, w.team[id], hits, (e, r) => e !== foe && inLine(hx, hy, w.x[foe], w.y[foe], width >> 1, w.x[e], w.y[e], r));
  for (let i = 0; i < n; i++) if (distTo(w, id, hits[i]) < d) return true;
  return false;
}

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3)) {
    const n = foesNear(w, id, hx, hy, a.r.radius);
    if (n >= BOT_AI.biscuitWalkiesFoes || (n >= 1 && d <= a.r.radius && hpBp(w, foe) < BOT_AI.biscuitWalkiesHpBp)) return cast(3, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD && d > BOT_AI.biscuitFetchMin && !blocked(w, id, foe, a.q.width)) {
    const backed = nearestAlly(w, id, BOT_AI.biscuitFetchAllyRange) >= 0 || hpBp(w, foe) < BOT_AI.biscuitFetchHpBp;
    const safe = untankedThreat(w, w.team[id], hx, hy, 0) < 0;
    if (backed && safe) {
      aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
      return cast(0, pt[0], pt[1], NO_TARGET);
    }
  }
  if (canCast(w, id, 1) && inRing(hx, hy, a.w.radius, fx, fy, 0)) {
    const peel = hurtAlly(w, id, a.w.radius + RANGE_PAD, BOT_AI.careHpBp) >= 0 || hpBp(w, id) < BOT_AI.careHpBp;
    if (peel || foesNear(w, id, hx, hy, a.w.radius) >= 2) return cast(1, hx, hy, NO_TARGET);
  }
  // Stubborn is a cleanse: a slow or root while the foe is on him (a confirm window that also cast it whenever he was
  // hurt and focused cost him 9 points; ROSTER-V29.md §4)
  if (canCast(w, id, 2) && (w.stunT[id] > 0 || w.rootT[id] > 0 || w.slowT[id] > 0) && w.target[foe] === id) return cast(2, hx, hy, NO_TARGET);
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 1)) return null;
  const r = abil(w, id).w.radius;
  const hx = w.x[id];
  const hy = w.y[id];
  if (!inRing(hx, hy, r, w.x[t], w.y[t], 0)) return null;
  const n = collect(w, w.team[id], hits, (e, er) => inRing(hx, hy, r, w.x[e], w.y[e], er));
  return n >= Math.max(need, 3) ? cast(1, hx, hy, NO_TARGET) : null;
}

export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 2) && (w.slowT[id] > 0 || w.rootT[id] > 0)) return cast(2, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 1) && distTo(w, id, foe) <= a.w.radius) return cast(1, w.x[id], w.y[id], NO_TARGET);
  return null;
}
