/**
 * Domino's bot casts (sim v15, build spec docs/plans/moba/DOGS-V15.md §1.3 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI.
 *
 * Fight: Big Shake on a foe on top of him; CONNECT THE DOTS! on 2+ Spotted foes in range, one fully Spotted foe that
 * is hurt, or one Spotted foe the hit would finish; Splatter on the foe; Spot Shot on the line. Clear: Splatter on a
 * pack, else Spot Shot. Escape: Big Shake with anything close.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inRing } from '../../effects';
import { canCast, lvl } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, cast, distTo, hits, pt } from '../casts';

/** Spotted enemy heroes within `r` of him. */
function spotted(w: World, id: number, r: number): number {
  let n = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.alive[e] === 0 || w.kind[e] !== Kind.Hero || w.team[e] === w.team[id] || w.dotN[e] === 0) continue;
    if (distTo(w, id, e) <= r) n++;
  }
  return n;
}

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 2) && d <= BOT_AI.dominoShakeRange) return cast(2, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 3) && d <= a.r.range) {
    const many = spotted(w, id, a.r.range) >= BOT_AI.dominoDotsMin;
    const full = w.dotN[foe] >= a.passive.max && hpBp(w, foe) < BOT_AI.dominoDotsHpBp;
    const kill = w.dotN[foe] > 0 && w.hp[foe] <= lvl(w, id, a.r.dmg, a.r.dmgPerLevel) + a.r.perDot * w.dotN[foe];
    if (many || full || kill) return cast(3, w.x[id], w.y[id], NO_TARGET);
  }
  if (canCast(w, id, 1) && d <= a.w.range) return cast(1, fx, fy, NO_TARGET);
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, t);
  const tx = w.x[t];
  const ty = w.y[t];
  if (canCast(w, id, 1) && d <= a.w.range) {
    const n = collect(w, w.team[id], hits, (e, r) => w.kind[e] !== Kind.Hero && inRing(tx, ty, a.w.radius, w.x[e], w.y[e], r));
    if (n >= Math.max(need, 3)) return cast(1, tx, ty, NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD && need === 1) return cast(0, tx, ty, NO_TARGET);
  return null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  if (canCast(w, id, 2) && distTo(w, id, foe) <= BOT_AI.dominoShakeRange) return cast(2, w.x[id], w.y[id], NO_TARGET);
  return null;
}
