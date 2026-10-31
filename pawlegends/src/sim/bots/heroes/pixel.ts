/**
 * Pixel's bot casts (sim v11, build spec docs/plans/moba/CATS-V11.md §2.2 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports (aimed, awayFrom, foesNear,
 * hurtAlly, allyNear, cast, distTo, hits, pt, RANGE_PAD); tuning numbers live in data/bots.ts BOT_AI.
 *
 * She plants and shoots: Cap Cannon at the foe, the Laser Pointer from a safe distance (bot movement keeps facing the
 * target, so the beam tracks it), BOXBOT MK II when a fight is on and she is healthy, Duck and Cover against a melee
 * diver when she is low.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { MINION_KINDS } from '../../../data/minions';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, iatan2, icos, idiv, isin } from '../../fixed';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import type { Rng } from '../../rng';
import { attackRange } from '../../units/kinds';
import { Kind, type World } from '../../world';
import { collect, inLine } from '../../effects';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, cast, distTo, foesNear, hits, pt } from '../casts';

/** Is enemy hero `foe` a melee hero standing within Duck and Cover's melee reach of her? */
function meleeOn(w: World, id: number, foe: number): boolean {
  const reach = abil(w, id).e.meleeRange;
  return attackRange(w, foe) <= reach && distTo(w, id, foe) <= reach + RANGE_PAD;
}

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 2) && hpBp(w, id) < BOT_AI.blinkOutHpBp && meleeOn(w, id, foe)) return cast(2, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 3) && hpBp(w, id) > BOT_AI.pixelBoxbotHpBp && foesNear(w, id, w.x[id], w.y[id], BOT_AI.pixelBoxbotRange) >= 1) return cast(3, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  // The beam slows her 60%: only with nobody inside pixelBeamSafe and the foe between pixelBeamMin and the beam's reach.
  if (canCast(w, id, 1) && d >= BOT_AI.pixelBeamMin && d <= a.w.range - RANGE_PAD && foesNear(w, id, w.x[id], w.y[id], BOT_AI.pixelBeamSafe) === 0) {
    return cast(1, fx, fy, NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  const a = abil(w, id);
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 1)) {
    // Laser Pointer down the line through `t`: 3 or more (the wave's `need`) on it.
    const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
    const lx = hx + idiv(icos(dir) * a.w.range, TRIG_ONE);
    const ly = hy + idiv(isin(dir) * a.w.range, TRIG_ONE);
    const n = collect(w, w.team[id], hits, (e, r) => inLine(hx, hy, lx, ly, a.w.width >> 1, w.x[e], w.y[e], r));
    if (n >= Math.max(need, 3) && foesNear(w, id, hx, hy, BOT_AI.pixelBeamSafe) === 0) return cast(1, w.x[t], w.y[t], NO_TARGET);
  }
  // Cap Cannon at a siege minion, a camp rat or Pudding.
  const big = need === 1 || (w.kind[t] === Kind.Minion && MINION_KINDS[w.sub[t]] === 'siege');
  if (big && canCast(w, id, 0) && distTo(w, id, t) <= a.q.range - RANGE_PAD) return cast(0, w.x[t], w.y[t], NO_TARGET);
  return null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick, then the walk home. */
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  if (canCast(w, id, 2) && meleeOn(w, id, foe)) return cast(2, w.x[id], w.y[id], NO_TARGET);
  return null;
}
