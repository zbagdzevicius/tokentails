/**
 * Stilts's bot casts (sim v11, build spec docs/plans/moba/CATS-V11.md §2.4 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports (aimed, awayFrom, foesNear,
 * hurtAlly, allyNear, cast, distTo, hits, pt, RANGE_PAD); tuning numbers live in data/bots.ts BOT_AI.
 *
 * Fight: Ear Swivel first (a hidden foe near, or a commit), High Leap onto a low foe or to set up a pounce, Swat-Swat
 * on a foe in the line, Zoomies to finish a low foe with help near or in a 1v1. Otherwise, while Stride is building,
 * she orbits her target at BOT_AI.stiltsOrbit (a move command; the brain's attack order follows once Stride is full,
 * and the kit's auto-pounce closes the gap). The orbit side is fixed per slot, so she never stands still to drain it.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, Op, type Command } from '../../api';
import { ANGLE_STEPS, iatan2, icos, idiv, isin, TRIG_ONE } from '../../fixed';
import type { Rng } from '../../rng';
import { Kind, RANGE, type World } from '../../world';
import { collect, inLine, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { nearestAlly } from '../../heroes/lambo';
import { strideFull } from '../../heroes/stilts';
import { abil } from '../../heroes/talents';
import { attackRange, radiusOf } from '../../units/kinds';
import { hpBp, seenEnemy } from '../sense';
import { aimed, allyNear, awayFrom, cast, distTo, foesNear, hits, pt, RANGE_PAD } from '../casts';

/** Is an enemy hero hidden from her team (brush, stealth) within `r` of her? */
function hiddenFoeNear(w: World, id: number, r: number): boolean {
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.alive[e] === 0 || w.kind[e] !== Kind.Hero || w.team[e] === w.team[id] || seenEnemy(w, w.team[id], e)) continue;
    if (inRing(w.x[id], w.y[id], r, w.x[e], w.y[e], radiusOf(w, e))) return true;
  }
  return false;
}

/** A move to the orbit point: BOT_AI.stiltsOrbit from `foe`, an eighth of a turn round from where she stands. */
function orbit(w: World, id: number, foe: number): Command {
  const side = (id & 1) === 0 ? 1 : -1;
  const a = iatan2(w.y[id] - w.y[foe], w.x[id] - w.x[foe]) + side * (ANGLE_STEPS >> 3);
  const x = w.x[foe] + idiv(icos(a) * BOT_AI.stiltsOrbit, TRIG_ONE);
  const y = w.y[foe] + idiv(isin(a) * BOT_AI.stiltsOrbit, TRIG_ONE);
  return { op: Op.Move, x, y };
}

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const commit = hpBp(w, foe) <= BOT_AI.stiltsCommitHpBp;
  const melee = attackRange(w, id) + RANGE_PAD;
  if (canCast(w, id, 1) && (hiddenFoeNear(w, id, a.w.radius) || (commit && d <= melee + a.q.dash))) return cast(1, w.x[id], w.y[id], NO_TARGET);
  if (canCast(w, id, 3) && hpBp(w, foe) <= BOT_AI.stiltsZoomiesHpBp && d <= BOT_AI.stiltsZoomiesRange) {
    const alone = foesNear(w, id, w.x[id], w.y[id], BOT_AI.awareRange) === 1 && nearestAlly(w, id, BOT_AI.awareRange) < 0;
    if (alone || allyNear(w, id, foe)) return cast(3, w.x[id], w.y[id], NO_TARGET);
  }
  if (canCast(w, id, 0) && d <= a.q.dash && (commit || (!strideFull(w, id) && d > melee))) return cast(0, fx, fy, NO_TARGET);
  if (canCast(w, id, 2) && d <= a.e.range + RANGE_PAD) {
    aimed(w, id, fx, fy, p.aimErrorSteps, rng, Math.max(d, BOT_AI.holdMelee));
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (!commit && !strideFull(w, id) && d <= BOT_AI.stiltsOrbit + melee) return orbit(w, id, foe);
  return null;
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. Swat-Swat only. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  if (!canCast(w, id, 2)) return null;
  const e = abil(w, id).e;
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const bx = hx + idiv(icos(dir) * e.range, TRIG_ONE);
  const by = hy + idiv(isin(dir) * e.range, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (u, r) => inLine(hx, hy, bx, by, e.width >> 1, w.x[u], w.y[u], r));
  return n >= need ? cast(2, w.x[t], w.y[t], NO_TARGET) : null;
}

/** Escape from enemy hero `foe`: High Leap straight away from it (untargetable in the air), then Zoomies when hurt. */
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 0)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.q.dash);
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 3) && hpBp(w, id) < BOT_AI.blinkOutHpBp) return cast(3, w.x[id], w.y[id], NO_TARGET);
  return null;
}
