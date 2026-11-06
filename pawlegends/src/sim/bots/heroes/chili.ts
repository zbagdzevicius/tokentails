/**
 * Chili's bot casts (sim v13, build spec docs/plans/moba/DOGS-V13.md §1.4 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI.
 *
 * Fight: Purse Mode when a foe would burst him; BIG DOG ENERGY on Rage with a fight on, or on a low foe in range;
 * Tiny Zoomies away from a melee foe; Yap Yap Yap on the line. Clear: the yaps through a pack. Escape: Zoomies home,
 * else the purse with a foe close.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { HERO_RULES } from '../../../data/xp';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, iatan2, icos, idiv, isin } from '../../fixed';
import type { Rng } from '../../rng';
import type { World } from '../../world';
import { collect, inLine } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';


/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 2) && d <= BOT_AI.chiliClose) {
    const hp = hpBp(w, id);
    if (hp < BOT_AI.chiliPurseHpBp || (hp < BOT_AI.chiliFocusHpBp && w.target[foe] === id)) return cast(2, w.x[id], w.y[id], NO_TARGET);
  }
  if (canCast(w, id, 3)) {
    const brawl = w.kValor[id] >= BOT_AI.chiliBigRage && foesNear(w, id, w.x[id], w.y[id], BOT_AI.chiliBrawlRange) >= 2;
    const finish = hpBp(w, foe) < BOT_AI.chiliFinishHpBp && d <= attackRange(w, id) + RANGE_PAD;
    if (brawl || finish) return cast(3, w.x[id], w.y[id], NO_TARGET);
  }
  if (canCast(w, id, 1) && attackRange(w, foe) <= HERO_RULES.meleeMaxRange && d <= BOT_AI.chiliZoomRange) {
    awayFrom(w, id, fx, fy, a.w.dash);
    return cast(1, pt[0], pt[1], NO_TARGET);
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
  if (distTo(w, id, t) > q.range - RANGE_PAD) return null;
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  const lx = hx + idiv(icos(dir) * q.range, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * q.range, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => inLine(hx, hy, lx, ly, q.width >> 1, w.x[e], w.y[e], r));
  return n >= Math.max(need, 3) || need === 1 ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, hx: number, hy: number): Command | null {
  if (canCast(w, id, 1)) return cast(1, hx, hy, NO_TARGET);
  if (canCast(w, id, 2) && distTo(w, id, foe) <= BOT_AI.chiliClose) return cast(2, w.x[id], w.y[id], NO_TARGET);
  return null;
}
