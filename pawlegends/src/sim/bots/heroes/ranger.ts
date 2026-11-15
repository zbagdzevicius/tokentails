/**
 * Ranger's bot casts (sim v31, build spec docs/plans/moba/ROSTER-V31.md §2.4 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Tuning numbers live in data/bots.ts BOT_AI. Camouflage is passive.
 *
 * Fight: LONG SHOT on a foe below rangerShotHpBp in reach with no other enemy hero within rangerShotSafe of him; Warning
 * Bark at a foe on top of him; Tracer Ball along the line. Clear: Tracer Ball only at a lone target. Escape: Bush Dive
 * away, then the bark.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, type World } from '../../world';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, foesNear, pt } from '../casts';

export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 3) && d <= a.r.reach && hpBp(w, foe) < BOT_AI.rangerShotHpBp && foesNear(w, id, w.x[id], w.y[id], BOT_AI.rangerShotSafe) === 0) {
    return cast(3, fx, fy, foe);
  }
  if (canCast(w, id, 1) && d <= a.w.range) return cast(1, fx, fy, NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 0) || need > 1 || w.kind[t] === Kind.Minion) return null;
  return distTo(w, id, t) <= abil(w, id).q.range - RANGE_PAD ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 2)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 1) && distTo(w, id, foe) <= a.w.range) return cast(1, w.x[foe], w.y[foe], NO_TARGET);
  return null;
}
