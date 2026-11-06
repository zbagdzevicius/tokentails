/**
 * Howler's bot casts (sim v13, build spec docs/plans/moba/DOGS-V13.md §1.5 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI. Zoomie Brain's empowered basic follows through the brain's attack order.
 *
 * Fight: THE SCREAM on 2+ foes in the cone (or one low foe close); Talk Back when crowded or focused and hurt; Derp
 * Dash in with a friend near or on a low foe; AWOO at a foe in reach. Clear: AWOO into a pack. Escape: Derp Dash away.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { iatan2 } from '../../fixed';
import type { Rng } from '../../rng';
import type { World } from '../../world';
import { collect, inCone } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, allyNear, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3) && d <= a.r.range) {
    const dir = iatan2(fy - hy, fx - hx);
    const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, a.r.range, a.r.arc, w.x[e], w.y[e], r), true);
    if (n >= BOT_AI.howlerScreamFoes || (hpBp(w, foe) < BOT_AI.howlerScreamHpBp && d <= BOT_AI.howlerScreamReach)) return cast(3, fx, fy, NO_TARGET);
  }
  if (canCast(w, id, 2)) {
    const crowd = foesNear(w, id, hx, hy, BOT_AI.howlerTalkRange) >= 2;
    const focused = w.target[foe] === id && d <= BOT_AI.howlerTalkRange && hpBp(w, id) < BOT_AI.howlerTalkHpBp;
    if (crowd || focused) return cast(2, hx, hy, NO_TARGET);
  }
  const reach = attackRange(w, id) + RANGE_PAD;
  if (canCast(w, id, 1) && d > reach && d <= a.w.dash + reach && (allyNear(w, id, foe) || hpBp(w, foe) < BOT_AI.howlerEngageHpBp)) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, a.w.dash);
    return cast(1, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.range + RANGE_PAD) return cast(0, fx, fy, NO_TARGET);
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, q.range, q.arc, w.x[e], w.y[e], r));
  return n >= need ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  if (canCast(w, id, 1)) {
    awayFrom(w, id, w.x[foe], w.y[foe], abil(w, id).w.dash);
    return cast(1, pt[0], pt[1], NO_TARGET);
  }
  return null;
}
