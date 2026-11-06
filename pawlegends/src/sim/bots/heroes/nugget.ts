/**
 * Nugget's bot casts (sim v13, build spec docs/plans/moba/DOGS-V13.md §1.1 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI.
 *
 * Fight: Herding Time with 2+ enemy heroes in his ring, aimed at the nearest allied hero (herd them into the team);
 * Best Friend to a hurt ally with a foe on it; the Sploot to heal a hurt group, or when focused and low; Frisbee at a
 * foe on the line. Clear: a Frisbee through a pack. Escape: Best Friend to the ally farthest from the threat, else a
 * Sploot only with no foe in melee.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { HERO_RULES } from '../../../data/xp';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin } from '../../fixed';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inLine } from '../../effects';
import { canCast } from '../../heroes/kit';
import { nearestAlly } from '../../heroes/lambo';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, cast, distTo, foesNear, hits, hurtAlly, pt } from '../casts';

/** Allied heroes of `id` (him included) within `r` of him, and whether one of them is below `belowBp`. */
function groupHurt(w: World, id: number, r: number, belowBp: number): boolean {
  let n = 0;
  let hurt = false;
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    if (dist2(w.x[id], w.y[id], w.x[a], w.y[a]) > r * r) continue;
    n++;
    if (hpBp(w, a) < belowBp) hurt = true;
  }
  return n >= 2 && hurt;
}

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3) && foesNear(w, id, hx, hy, a.r.radius) >= BOT_AI.nuggetHerdFoes) {
    const ally = nearestAlly(w, id, BOT_AI.awareRange);
    return ally >= 0 ? cast(3, w.x[ally], w.y[ally], NO_TARGET) : cast(3, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 1)) {
    const ally = hurtAlly(w, id, a.w.range, BOT_AI.careHpBp);
    if (ally >= 0 && foesNear(w, id, w.x[ally], w.y[ally], BOT_AI.nuggetPeelRange) >= 1) return cast(1, w.x[ally], w.y[ally], NO_TARGET);
  }
  if (canCast(w, id, 2)) {
    const focused = w.target[foe] === id && hpBp(w, id) < BOT_AI.nuggetFocusHpBp;
    if (focused || groupHurt(w, id, a.e.radius, BOT_AI.nuggetSplootHpBp)) return cast(2, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  const hx = w.x[id];
  const hy = w.y[id];
  if (dist2(hx, hy, w.x[t], w.y[t]) > (q.range - RANGE_PAD) * (q.range - RANGE_PAD)) return null;
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const lx = hx + idiv(icos(dir) * q.range, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * q.range, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => inLine(hx, hy, lx, ly, q.width >> 1, w.x[e], w.y[e], r));
  return n >= need ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

/** The allied hero of `id` within `range` farthest from enemy `foe` and farther from it than he is, or −1. */
function safestAlly(w: World, id: number, foe: number, range: number): number {
  let best = -1;
  let bestD = dist2(w.x[id], w.y[id], w.x[foe], w.y[foe]);
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (a === id || w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    if (dist2(w.x[id], w.y[id], w.x[a], w.y[a]) > range * range) continue;
    const d = dist2(w.x[a], w.y[a], w.x[foe], w.y[foe]);
    if (d > bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, hx: number, hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 1)) {
    const ally = safestAlly(w, id, foe, a.w.range);
    return ally >= 0 ? cast(1, w.x[ally], w.y[ally], NO_TARGET) : cast(1, hx, hy, NO_TARGET);
  }
  if (canCast(w, id, 2) && distTo(w, id, foe) > HERO_RULES.meleeMaxRange) return cast(2, w.x[id], w.y[id], NO_TARGET);
  return null;
}
