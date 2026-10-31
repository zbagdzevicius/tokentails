/**
 * Meatball's bot casts (sim v11, build spec docs/plans/moba/CATS-V11.md §2.1 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports (aimed, awayFrom, foesNear,
 * hurtAlly, allyNear, cast, distTo, hits, pt, RANGE_PAD); tuning numbers live in data/bots.ts BOT_AI.
 *
 * Fight: Unstoppable Chonk into a group with a friend near (or after a low foe), Big Brother to peel for a hurt ally,
 * Loaf Mode when crowded or dived, Bowling Roll through a foe on the line. Clear: a roll through a big pack only.
 * Escape: Chonk cleanses a root, else hop to the friend farthest from the threat, else roll away.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin } from '../../fixed';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inLine } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, allyNear, awayFrom, cast, distTo, foesNear, hits, hurtAlly, pt } from '../casts';

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const hx = w.x[id];
  const hy = w.y[id];
  // R: a brawl with a friend there (2+ enemy heroes close), or chasing down a weak foe.
  if (canCast(w, id, 3)) {
    const brawl = allyNear(w, id, foe) && foesNear(w, id, hx, hy, BOT_AI.meatballChonkRange) >= 2;
    const chase = hpBp(w, foe) <= BOT_AI.meatballChaseHpBp && d <= BOT_AI.meatballChaseRange;
    if (brawl || chase) return cast(3, hx, hy, NO_TARGET);
  }
  // E: peel for the most hurt ally in reach when an enemy hero is on top of it.
  if (canCast(w, id, 2)) {
    const ally = hurtAlly(w, id, a.e.range, BOT_AI.careHpBp);
    if (ally >= 0 && foesNear(w, id, w.x[ally], w.y[ally], BOT_AI.meatballPeelRange) >= 1) return cast(2, w.x[ally], w.y[ally], NO_TARGET);
  }
  // W: crowded, or the foe is diving him.
  if (canCast(w, id, 1)) {
    const crowd = foesNear(w, id, hx, hy, a.w.radius) >= BOT_AI.meatballLoafFoes;
    const dived = w.target[foe] === id && d <= a.w.radius;
    if (crowd || dived) return cast(1, hx, hy, NO_TARGET);
  }
  // Q: a roll through the foe on the 6 m line.
  if (canCast(w, id, 0) && d <= a.q.dash + RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, a.q.dash);
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  // Bowling Roll through a wave only, and only a big one (one more than the usual wave-clear count).
  if (w.kind[t] !== Kind.Minion || !canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  const hx = w.x[id];
  const hy = w.y[id];
  if (dist2(hx, hy, w.x[t], w.y[t]) > q.dash * q.dash) return null;
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const lx = hx + idiv(icos(dir) * q.dash, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * q.dash, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => w.kind[e] === Kind.Minion && inLine(hx, hy, lx, ly, q.touch, w.x[e], w.y[e], r));
  return n >= need + 1 ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
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
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  // Chonk cleanses a root (a stun stops every cast, Chonk included).
  if (canCast(w, id, 3) && w.rootT[id] > 0) return cast(3, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 2)) {
    const ally = safestAlly(w, id, foe, a.e.range);
    if (ally >= 0) return cast(2, w.x[ally], w.y[ally], NO_TARGET);
  }
  if (canCast(w, id, 0)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.q.dash);
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}
