/**
 * Duchess's bot casts (sim v11, build spec docs/plans/moba/CATS-V11.md §2.3 "Bot"), called from ../casts.ts. Each
 * function returns one cast command, or null. Disdain decides the target: Fluff Puff and Not Amused go at the enemy
 * hero carrying the most stacks (ties: nearest, then lowest id), so the third hit lands a Snub. Royal Decree is the
 * peel and the team-fight button; Cushion Glide keeps her away from melee foes and is her escape.
 */
import { BOT_AI, type BotParams } from '../../../data/bots';
import { NO_TARGET, type Command } from '../../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin, isqrt } from '../../fixed';
import type { Rng } from '../../rng';
import { ENTITY_CAP, RANGE, type World } from '../../world';
import { collect, inCone, inLine, stacksOf } from '../../effects';
import { canCast } from '../../heroes/kit';
import { abil } from '../../heroes/talents';
import { attackRange } from '../../units/kinds';
import { hpBp, seenEnemy } from '../sense';
import { RANGE_PAD, aimed, awayFrom, cast, distTo, foesNear, hits, pt } from '../casts';

/** Candidate aim points for the densest Fluff Puff line (`hits` is reused by the count). */
const cands = new Int32Array(ENTITY_CAP);

/** The seen enemy hero within `r` with the most Disdain; ties: nearest, then lowest id. −1 when none. */
export function disdainTarget(w: World, id: number, r: number): number {
  let best = -1;
  let bestS = 0;
  let bestD = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (!seenEnemy(w, w.team[id], e)) continue;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (d > r * r) continue;
    const s = stacksOf(w, e);
    if (best < 0 || s > bestS || (s === bestS && d < bestD)) {
      best = e;
      bestS = s;
      bestD = d;
    }
  }
  return best;
}

/** A seen enemy hero on 2+ Disdain (one hit from a Snub) within `r`? */
function nearSnub(w: World, id: number, r: number): boolean {
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (seenEnemy(w, w.team[id], e) && stacksOf(w, e) >= 2 && dist2(w.x[id], w.y[id], w.x[e], w.y[e]) <= r * r) return true;
  }
  return false;
}

/** Fight casts at enemy hero `foe` (visible, aware). */
export function fight(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 3)) {
    const r = a.r.radius;
    if (foesNear(w, id, hx, hy, r) >= 2 || d <= BOT_AI.duchessPeelRange || nearSnub(w, id, r)) return cast(3, hx, hy, NO_TARGET);
  }
  // Keep her spacing from a melee foe (only those: a ranged foe out-trades a glide).
  if (canCast(w, id, 2) && d < BOT_AI.duchessSpacing && attackRange(w, foe) < BOT_AI.duchessSpacing) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  const t = disdainTarget(w, id, a.q.range);
  const tgt = t >= 0 ? t : foe;
  const td = distTo(w, id, tgt);
  if (canCast(w, id, 1) && td <= a.w.range) return cast(1, w.x[tgt], w.y[tgt], NO_TARGET);
  if (canCast(w, id, 0) && td <= a.q.range - RANGE_PAD) {
    aimed(w, id, w.x[tgt], w.y[tgt], p.aimErrorSteps, rng, Math.max(td, BOT_AI.holdRanged));
    return cast(0, pt[0], pt[1], NO_TARGET);
  }
  return null;
}

/** Units of her team's abilities on the Fluff Puff line from her toward (tx, ty), as far as it flies. */
function lineCount(w: World, id: number, tx: number, ty: number, range: number, half: number): number {
  const hx = w.x[id];
  const hy = w.y[id];
  const dir = iatan2(ty - hy, tx - hx);
  const lx = hx + idiv(icos(dir) * range, TRIG_ONE);
  const ly = hy + idiv(isin(dir) * range, TRIG_ONE);
  return collect(w, w.team[id], hits, (e, r) => inLine(hx, hy, lx, ly, half, w.x[e], w.y[e], r));
}

/** Clear casts on non-hero target `t` (a minion pack, a rat, Pudding); `need` units must be covered. */
export function clear(w: World, id: number, t: number, need: number): Command | null {
  const a = abil(w, id);
  const hx = w.x[id];
  const hy = w.y[id];
  if (canCast(w, id, 1) && isqrt(dist2(hx, hy, w.x[t], w.y[t])) <= a.w.range) {
    const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
    const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, a.w.range, a.w.arc, w.x[e], w.y[e], r));
    // A wave needs one more than the usual clear count (3); a lone rat or Pudding is worth it alone.
    if (n >= need + 1 || (need === 1 && n >= 1)) return cast(1, w.x[t], w.y[t], NO_TARGET);
  }
  if (!canCast(w, id, 0) || isqrt(dist2(hx, hy, w.x[t], w.y[t])) > a.q.range - RANGE_PAD) return null;
  // The densest line: through each unit in reach of the shot (ascending id; ties keep the first).
  const half = a.q.width >> 1;
  const k = collect(w, w.team[id], cands, (e, r) => dist2(hx, hy, w.x[e], w.y[e]) <= (a.q.range + r) * (a.q.range + r));
  let best = t;
  let bestN = lineCount(w, id, w.x[t], w.y[t], a.q.range, half);
  for (let i = 0; i < k; i++) {
    const e = cands[i];
    if (e < RANGE.minions || e === t) continue;
    const n = lineCount(w, id, w.x[e], w.y[e], a.q.range, half);
    if (n > bestN) {
      best = e;
      bestN = n;
    }
  }
  return bestN >= need ? cast(0, w.x[best], w.y[best], NO_TARGET) : null;
}

/** Escape from enemy hero `foe` toward home (hx, hy); null falls through to the defensive Paw Trick. */
export function escape(w: World, id: number, foe: number, _hx: number, _hy: number): Command | null {
  const a = abil(w, id);
  if (canCast(w, id, 2)) {
    awayFrom(w, id, w.x[foe], w.y[foe], a.e.dash);
    return cast(2, pt[0], pt[1], NO_TARGET);
  }
  if (canCast(w, id, 3) && distTo(w, id, foe) <= BOT_AI.duchessPeelRange && hpBp(w, id) < BOT_AI.blinkOutHpBp) return cast(3, w.x[id], w.y[id], NO_TARGET);
  return null;
}
