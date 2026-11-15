/**
 * Nova's bot casts (sim v31, build spec docs/plans/moba/ROSTER-V31.md §2.1 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI.
 *
 * Fight: METEOR SHOWER on a foe below novaMeteorHpBp or with 2+ enemy heroes round it; Moon Hop away when a foe is
 * within novaHopRange; Starfall on the foe; Shooting Star along the line. Clear: Starfall on a pack. Escape: Moon Hop
 * away.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, type World } from '../../world';
import { collect, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 3) && d <= a.r.range) {
    if (hpBp(w, foe) < BOT_AI.novaMeteorHpBp || foesNear(w, id, fx, fy, a.r.radius) >= 2) return cast(3, fx, fy, NO_TARGET);
  }
  if (canCast(w, id, 2) && d <= BOT_AI.novaHopRange) {
    awayFrom(w, id, fx, fy, a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.range) return cast(0, fx, fy, NO_TARGET);
  if (canCast(w, id, 1) && d <= a.w.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(1, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  const a = abil(w, id);
  if (!canCast(w, id, 0) || distTo(w, id, t) > a.q.range) return null;
  const tx = w.x[t];
  const ty = w.y[t];
  const n = collect(w, w.team[id], hits, (e, r) => w.kind[e] !== Kind.Hero && inRing(tx, ty, a.q.radius, w.x[e], w.y[e], r));
  return n >= Math.max(need, 2) ? cast(0, tx, ty, NO_TARGET) : null;
}

export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  if (!canCast(w, id, 2)) return null;
  awayFrom(w, id, w.x[foe], w.y[foe], abil(w, id).e.dash);
  return cast(2, pt[0], pt[1], NO_TARGET);
}
