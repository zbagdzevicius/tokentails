/**
 * Mochi's bot casts (sim v29, build spec docs/plans/moba/ROSTER-V29.md §2.1 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI.
 *
 * Fight: LULLABY with 2+ enemy heroes in her drowsy ring, or one beside a hurt friend (or her when focused); Cuddle
 * Bubble on a hurt or fighting ally (the one nearest the foe), else on herself when focused; Purr Wave when a friend
 * near her is slowed or hurt and chased; Pillow Toss at a foe in range. Clear: a pillow at the target. Escape: Purr
 * Wave, then the bubble on herself.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { dist2 } from '../../fixed';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, cast, distTo, foesNear, hurtAlly, pt } from '../casts';

/** The allied hero (not her) nearest enemy `foe` within `r` of her, or −1. */
function frontAlly(w: World, id: number, foe: number, r: number): number {
  let best = -1;
  let bestD = 0;
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (a === id || w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    if (dist2(w.x[id], w.y[id], w.x[a], w.y[a]) > r * r) continue;
    const d = dist2(w.x[a], w.y[a], w.x[foe], w.y[foe]);
    if (best < 0 || d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3)) {
    const n = foesNear(w, id, hx, hy, a.r.radius);
    const hurt = hurtAlly(w, id, a.r.allyRadius, BOT_AI.careHpBp) >= 0 || hpBp(w, id) < BOT_AI.careHpBp;
    if (n >= BOT_AI.mochiLullabyFoes || (n >= 1 && hurt)) return cast(3, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 1)) {
    const hurt = hurtAlly(w, id, a.w.range, BOT_AI.careHpBp);
    const front = hurt >= 0 ? hurt : frontAlly(w, id, foe, a.w.range);
    if (front >= 0 && distTo(w, front, foe) <= BOT_AI.mochiBubbleFoeRange) return cast(1, w.x[front], w.y[front], NO_TARGET);
    if (w.target[foe] === id && d <= BOT_AI.mochiBubbleFoeRange) return cast(1, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 2) && (w.slowT[id] > 0 || hurtAlly(w, id, a.e.radius, BOT_AI.careHpBp) >= 0) && d <= BOT_AI.mochiBubbleFoeRange) {
    return cast(2, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, w.x[foe], w.y[foe], p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

export function clear(w: World, id: number, t: number, _need: number): Command | null {
  if (!canCast(w, id, 0) || w.kind[t] === Kind.Minion) return null;
  return distTo(w, id, t) <= abil(w, id).q.range - RANGE_PAD ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

export function escape(w: World, id: number, _foe: number, _hx: number, _hy: number): Command | null {
  if (canCast(w, id, 2)) return cast(2, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 1)) return cast(1, w.x[id], w.y[id], NO_TARGET);
  return null;
}
