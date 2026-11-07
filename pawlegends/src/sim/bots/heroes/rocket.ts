/**
 * Rocket's bot casts (sim v15, build spec docs/plans/moba/DOGS-V15.md §1.1 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI.
 *
 * Fight: ZOOM… ZZZ when the sprint line passes 2+ foes (or one low foe) and does not end under an enemy tower (he naps
 * where he stops); Photo Finish away from a foe on top of him; SQUIRREL! on a foe diving him or close; Lure Shot on
 * the line. Clear: Lure Shot through a pack toward a hero. Escape: Photo Finish away, then SQUIRREL! on the chaser.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, iatan2, icos, idiv, isin } from '../../fixed';
import type { Rng } from '../../rng';
import type { World } from '../../world';
import { collect, inLine } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp, untankedThreat } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, hits, nearestFoe, pt } from '../casts';

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3) && d <= a.r.dash) {
    const dir = iatan2(fy - hy, fx - hx);
    const ex = hx + idiv(icos(dir) * a.r.dash, TRIG_ONE);
    const ey = hy + idiv(isin(dir) * a.r.dash, TRIG_ONE);
    const n = collect(w, w.team[id], hits, (e, r) => inLine(hx, hy, ex, ey, a.r.width >> 1, w.x[e], w.y[e], r), true);
    const worth = n >= BOT_AI.rocketSprintFoes || (n >= 1 && hpBp(w, foe) < BOT_AI.rocketSprintHpBp);
    if (worth && untankedThreat(w, w.team[id], ex, ey, 0) < 0) return cast(3, fx, fy, NO_TARGET);
  }
  if (canCast(w, id, 1) && d <= BOT_AI.rocketPeelRange) {
    awayFrom(w, id, fx, fy, a.w.dash);
    return cast(1, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 2) && d <= BOT_AI.rocketSquirrelRange) return cast(2, fx, fy, NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t`: Lure Shot only when an enemy hero stands behind the pack. */
export function clear(w: World, id: number, t: number, _need: number): Command | null {
  if (!canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  const foe = nearestFoe(w, id, q.range);
  if (foe < 0) return null;
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(w.y[foe] - hy, w.x[foe] - hx);
  const lx = hx + idiv(icos(dir) * q.range, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * q.range, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => e === t && inLine(hx, hy, lx, ly, q.width >> 1, w.x[e], w.y[e], r));
  return n > 0 ? cast(0, w.x[foe], w.y[foe], NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  if (canCast(w, id, 1)) {
    awayFrom(w, id, w.x[foe], w.y[foe], abil(w, id).w.dash);
    return cast(1, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 2) && distTo(w, id, foe) <= abil(w, id).e.range) return cast(2, w.x[foe], w.y[foe], NO_TARGET);
  return null;
}
