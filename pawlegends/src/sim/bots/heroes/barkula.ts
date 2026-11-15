/**
 * Barkula's bot casts (sim v31, build spec docs/plans/moba/ROSTER-V31.md §2.3 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI.
 *
 * Fight: RED MOON on barkulaMoonFoes enemy heroes in its ring (or one below barkulaMoonHpBp); Bat Swarm with a foe
 * within its ring; Mist Form when slowed or hurt below barkulaMistHpBp and focused; Bat Bite on the line. Clear: Bat
 * Swarm in a pack, else Bat Bite. Escape: Mist Form.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, type World } from '../../world';
import { collect, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, cast, distTo, foesNear, hits, pt } from '../casts';

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3)) {
    const n = foesNear(w, id, hx, hy, a.r.radius);
    if (n >= BOT_AI.barkulaMoonFoes || (n >= 1 && hpBp(w, foe) < BOT_AI.barkulaMoonHpBp && d <= a.r.radius)) return cast(3, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 1) && d <= a.w.radius + RANGE_PAD) return cast(1, hx, hy, NO_TARGET);
  if (canCast(w, id, 2) && w.target[foe] === id && (w.slowT[id] > 0 || hpBp(w, id) < BOT_AI.barkulaMistHpBp)) return cast(2, hx, hy, NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, w.x[foe], w.y[foe], p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  const a = abil(w, id);
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 1)) {
    const n = collect(w, w.team[id], hits, (e, r) => w.kind[e] !== Kind.Hero && inRing(hx, hy, a.w.radius, w.x[e], w.y[e], r));
    if (n >= Math.max(need, 3)) return cast(1, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 0) && need === 1 && distTo(w, id, t) <= a.q.range - RANGE_PAD) return cast(0, w.x[t], w.y[t], NO_TARGET);
  return null;
}

export function escape(w: World, id: number, _foe: number, _hx: number, _hy: number): Command | null {
  return canCast(w, id, 2) ? cast(2, w.x[id], w.y[id], NO_TARGET) : null;
}
