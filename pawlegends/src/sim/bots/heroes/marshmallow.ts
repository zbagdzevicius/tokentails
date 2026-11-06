/**
 * Marshmallow's bot casts (sim v13, build spec docs/plans/moba/DOGS-V13.md §1.2 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Build on the helpers casts.ts exports; tuning numbers live in
 * data/bots.ts BOT_AI.
 *
 * Fight: Belly Slide away from a melee foe on top of her; SNOW DAY! on a cluster, or on a slowed foe that is low; the
 * Snow Patch on the foe; the Snowball on the line. Clear: a Snow Patch on a pack. Escape: the slide away.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { HERO_RULES } from '../../../data/xp';
import { NO_TARGET, type Command } from '../../api';
import type { Rng } from '../../rng';
import { Kind, type World } from '../../world';
import { collect, inRing } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';

/** Is enemy hero `foe` a melee hero within marshPeelRange of her? */
const meleeOn = (w: World, id: number, foe: number): boolean => attackRange(w, foe) <= HERO_RULES.meleeMaxRange && distTo(w, id, foe) <= BOT_AI.marshPeelRange;

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  if (canCast(w, id, 2) && meleeOn(w, id, foe)) {
    awayFrom(w, id, fx, fy, a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 3) && d <= a.r.range) {
    const cluster = foesNear(w, id, fx, fy, a.r.radius) >= BOT_AI.marshSnowFoes;
    const pinned = hpBp(w, foe) < BOT_AI.marshPinnedHpBp && w.slowT[foe] > 0;
    if (cluster || pinned) return cast(3, fx, fy, NO_TARGET);
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
  if (!canCast(w, id, 1)) return null;
  const p = abil(w, id).w;
  if (distTo(w, id, t) > p.range) return null;
  const tx = w.x[t];
  const ty = w.y[t];
  const n = collect(w, w.team[id], hits, (e, r) => w.kind[e] !== Kind.Hero && inRing(tx, ty, p.radius, w.x[e], w.y[e], r));
  return n >= need ? cast(1, tx, ty, NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, _foe: number, hx: number, hy: number): Command | null {
  if (canCast(w, id, 2)) return cast(2, hx, hy, NO_TARGET);
  return null;
}
