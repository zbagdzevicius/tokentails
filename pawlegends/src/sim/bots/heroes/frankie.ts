/**
 * Frankie's bot casts (sim v15, build spec docs/plans/moba/DOGS-V15.md §1.2 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI. Ketchup and Mustard follows through the brain's attack order (a bite after a skill).
 *
 * Fight: FOOTLONG! on a low foe in reach with no other foe in the way (or a stunned foe); Dig onto a hurt foe or a
 * clump with a friend near (never under an enemy tower unless the foe is about to fall); Weenie Roll into the foe.
 * Clear: the roll through a pack. Escape: Bun Hop away, else Dig toward home.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, iatan2, icos, idiv, isin } from '../../fixed';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inLine } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp, untankedThreat } from '../sense';
import { RANGE_PAD, aimed, allyNear, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';

/** Is any enemy hero other than `foe` closer along the line to it (FOOTLONG would grab that one)? */
function blocked(w: World, id: number, foe: number, width: number): boolean {
  const hx = w.x[id];
  const hy = w.y[id];
  const d = distTo(w, id, foe);
  const n = collect(w, w.team[id], hits, (e, r) => e !== foe && inLine(hx, hy, w.x[foe], w.y[foe], width >> 1, w.x[e], w.y[e], r), true);
  for (let i = 0; i < n; i++) if (distTo(w, id, hits[i]) < d) return true;
  return false;
}

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 3) && d <= a.r.range - RANGE_PAD && (hpBp(w, foe) < BOT_AI.frankieFootlongHpBp || w.stunT[foe] > 0) && !blocked(w, id, foe, a.r.width)) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, RANGE_PAD));
    return cast(3, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 1) && d <= a.w.range) {
    const low = hpBp(w, foe) < BOT_AI.frankieDigHpBp;
    const clump = foesNear(w, id, fx, fy, a.w.radius) >= 2;
    const backed = allyNear(w, id, foe) || foesNear(w, id, fx, fy, BOT_AI.frankieDiveAllyRange) <= 1;
    const tower = untankedThreat(w, w.team[id], fx, fy, 0) >= 0 && hpBp(w, foe) >= BOT_AI.executeHpBp;
    if ((low || clump) && backed && !tower) return cast(1, fx, fy, NO_TARGET);
  }
  const reach = attackRange(w, id) + RANGE_PAD;
  if (canCast(w, id, 0) && d <= a.q.dash + reach) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, a.q.dash);
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 0)) return null;
  const q = abil(w, id).q;
  if (distTo(w, id, t) > q.dash) return null;
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const lx = hx + idiv(icos(dir) * q.dash, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * q.dash, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => e >= RANGE.minions && w.kind[e] !== Kind.Hero && inLine(hx, hy, lx, ly, q.width >> 1, w.x[e], w.y[e], r));
  return n >= Math.max(need, 3) ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, hx: number, hy: number): Command | null {
  if (canCast(w, id, 2)) {
    awayFrom(w, id, w.x[foe], w.y[foe], abil(w, id).e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 1)) {
    const r = abil(w, id).w.range;
    const dir = iatan2(hy - w.y[id], hx - w.x[id]);
    return cast(1, w.x[id] + idiv(icos(dir) * r, TRIG_ONE), w.y[id] + idiv(isin(dir) * r, TRIG_ONE), NO_TARGET);
  }
  return null;
}
