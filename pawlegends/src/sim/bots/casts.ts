// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/companions/abilityAim.js (integer rewrite, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * Ability use for bots (POC.md §7.2): an integer port of the `planAbility()` idea in
 * swordcat/src/companions/abilityAim.js. A slot is cast when its shape covers a target: the foe in a fight, a
 * minion pack or a camp/Pudding when clearing, the way home when escaping. Skillshots carry a seeded aim error.
 * Each function returns one cast command, or null.
 */
import { BOT_AI, type BotParams } from '../../data/bots';
import { HERO_IDS } from '../../data/heroes';
import { RADIUS } from '../../data/map';
import { TRICKS, TRICK_IDS } from '../../data/tricks';
import { NO_TARGET, Op, type CastSlot, type Command } from '../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin, isqrt } from '../fixed';
import type { Rng } from '../rng';
import { ENTITY_CAP, Kind, RANGE, type World } from '../world';
import { collect, inCone, inLine, inRing } from '../effects';
import { canCast, TRICK_SLOT } from '../heroes/kit';
import { attackRange } from '../units/kinds';
import { abil } from '../heroes/talents';
import { fountainX, fountainY, hpBp, seenEnemy } from './sense';

const hits = new Int32Array(ENTITY_CAP);
/** Extra slack (mm) on close-range ability checks: a hero radius. */
const RANGE_PAD = RADIUS.hero;
const pt = new Int32Array(2);

/** A point `dist` from hero `id` toward (tx, ty), turned by a seeded error of ± `err` steps. */
function aimed(w: World, id: number, tx: number, ty: number, err: number, rng: Rng, dist: number): void {
  let a = iatan2(ty - w.y[id], tx - w.x[id]);
  if (err > 0) a += rng.range(-err, err);
  pt[0] = w.x[id] + idiv(icos(a) * dist, TRIG_ONE);
  pt[1] = w.y[id] + idiv(isin(a) * dist, TRIG_ONE);
}

const cast = (slot: number, x: number, y: number, id: number): Command =>
  slot === TRICK_SLOT ? { op: Op.Trick, x, y } : { op: Op.Cast, slot: slot as CastSlot, x, y, id };

const distTo = (w: World, a: number, b: number): number => isqrt(dist2(w.x[a], w.y[a], w.x[b], w.y[b]));

/**
 * Hard (TrickUse 'offensive'): Pounce onto a foe below BOT_AI.finishHpBp just out of reach, Hiss when the foe stands
 * inside its radius and the bot is the healthier one. Null otherwise.
 */
export function offenseTrick(w: World, id: number, foe: number, p: BotParams): Command | null {
  if (p.trick !== 'offensive' || !canCast(w, id, TRICK_SLOT)) return null;
  const d = distTo(w, id, foe);
  switch (TRICK_IDS[w.trick[id]]) {
    case 'pounce':
      return hpBp(w, foe) <= BOT_AI.finishHpBp && d > attackRange(w, id) + RANGE_PAD && d <= TRICKS.pounce.blink + attackRange(w, id) ? cast(TRICK_SLOT, w.x[foe], w.y[foe], NO_TARGET) : null;
    case 'hiss':
      return d <= TRICKS.hiss.radius && hpBp(w, id) > hpBp(w, foe) ? cast(TRICK_SLOT, w.x[id], w.y[id], NO_TARGET) : null;
    default:
      return null;
  }
}

/** Fight casts at enemy hero `foe` (visible, aware). Ultimates first, then the rest. */
export function fightCast(w: World, id: number, foe: number, p: BotParams, rng: Rng): Command | null {
  const trick = offenseTrick(w, id, foe, p);
  if (trick) return trick;
  const a = abil(w, id);
  const d = distTo(w, id, foe);
  const fx = w.x[foe];
  const fy = w.y[foe];
  const err = p.aimErrorSteps;
  const low = hpBp(w, foe) <= BOT_AI.executeHpBp;
  switch (HERO_IDS[w.sub[id]]) {
    case 'clem':
      if (canCast(w, id, 3) && d <= a.q.range + BOT_AI.holdMelee) return cast(3, w.x[id], w.y[id], NO_TARGET);
      if (canCast(w, id, 0) && d <= a.q.range + RANGE_PAD) return cast(0, fx, fy, foe);
      if (canCast(w, id, 2) && d > a.q.range + RANGE_PAD && d <= a.e.dash + a.q.range) return cast(2, fx, fy, NO_TARGET);
      if (canCast(w, id, 1) && d <= a.q.range * 2 && hpBp(w, id) < BOT_AI.objectiveHpBp + BOT_AI.waveClearHpBp) return cast(1, fx, fy, NO_TARGET);
      return null;
    case 'sage':
      if (canCast(w, id, 2) && d <= BOT_AI.kiteRange && w.kind[foe] === Kind.Hero && HERO_IDS[w.sub[foe]] !== 'sage') return cast(2, fx, fy, NO_TARGET);
      if (canCast(w, id, 3) && low && d <= BOT_AI.awareRange) {
        aimed(w, id, fx, fy, err, rng, Math.max(d, BOT_AI.holdRanged));
        return cast(3, pt[0], pt[1], NO_TARGET);
      }
      if (canCast(w, id, 0) && d <= a.q.range - RANGE_PAD) {
        aimed(w, id, fx, fy, err, rng, Math.max(d, BOT_AI.holdMelee));
        return cast(0, pt[0], pt[1], NO_TARGET);
      }
      if (canCast(w, id, 1) && d <= a.w.range) return cast(1, fx, fy, NO_TARGET);
      return null;
    case 'brutus':
      if (canCast(w, id, 3) && d <= a.r.range) return cast(3, fx, fy, foe);
      if (canCast(w, id, 2) && d > a.q.radius && d <= a.e.dash) {
        aimed(w, id, fx, fy, err, rng, a.e.dash);
        return cast(2, pt[0], pt[1], NO_TARGET);
      }
      if (canCast(w, id, 0) && d <= a.q.radius) return cast(0, w.x[id], w.y[id], NO_TARGET);
      if (canCast(w, id, 1) && d <= BOT_AI.engageRange) return cast(1, fx, fy, NO_TARGET);
      return null;
    default:
      // Cacklejaw
      if (canCast(w, id, 3) && low && d <= a.r.range) return cast(3, w.x[id], w.y[id], NO_TARGET);
      if (canCast(w, id, 0) && d <= a.q.dash) {
        aimed(w, id, fx, fy, err, rng, a.q.dash);
        return cast(0, pt[0], pt[1], NO_TARGET);
      }
      if (canCast(w, id, 1) && d <= a.w.range) return cast(1, fx, fy, NO_TARGET);
      if (canCast(w, id, 2) && d > a.w.range * 2 && d <= BOT_AI.engageRange) return cast(2, w.x[id], w.y[id], NO_TARGET);
      return null;
  }
}

/** Clear casts on non-hero targets near `t` (a minion pack, a rat, Pudding). */
export function clearCast(w: World, id: number, t: number): Command | null {
  if (hpBp(w, id) < BOT_AI.waveClearHpBp) return null;
  const a = abil(w, id);
  const team = w.team[id];
  const hx = w.x[id];
  const hy = w.y[id];
  const need = w.kind[t] === Kind.Minion ? BOT_AI.waveClearMin : 1;
  const dir = iatan2(w.y[t] - hy, w.x[t] - hx);
  switch (HERO_IDS[w.sub[id]]) {
    case 'clem': {
      if (!canCast(w, id, 0)) return null;
      const n = collect(w, team, hits, (e, r) => inCone(hx, hy, dir, a.q.range, a.q.arc, w.x[e], w.y[e], r));
      return n >= need ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
    }
    case 'sage': {
      if (!canCast(w, id, 0)) return null;
      const n = collect(w, team, hits, (e, r) => inCone(hx, hy, dir, a.q.range, a.q.arc, w.x[e], w.y[e], r));
      return n >= need + 1 || (need === 1 && n >= 1) ? cast(0, w.x[t], w.y[t], NO_TARGET) : null;
    }
    case 'brutus': {
      if (!canCast(w, id, 0)) return null;
      const n = collect(w, team, hits, (e, r) => inRing(hx, hy, a.q.radius, w.x[e], w.y[e], r));
      return n >= need ? cast(0, hx, hy, NO_TARGET) : null;
    }
    default: {
      if (!canCast(w, id, 0)) return null;
      const d = isqrt(dist2(hx, hy, w.x[t], w.y[t]));
      if (d > a.q.dash) return null;
      const bx = w.x[t];
      const by = w.y[t];
      const n = collect(w, team, hits, (e, r) => inLine(hx, hy, bx, by, a.q.width >> 1, w.x[e], w.y[e], r));
      return n >= need ? cast(0, bx, by, NO_TARGET) : null;
    }
  }
}

/** Nearest enemy hero `id` can see within `r`, or −1. */
export function nearestFoe(w: World, id: number, r: number): number {
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (!seenEnemy(w, w.team[id], e)) continue;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (d > r * r) continue;
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Escape while retreating from enemy hero `foe`: a mobility ability toward home, then a defensive Paw Trick. */
export function escapeCast(w: World, id: number, foe: number, p: BotParams): Command | null {
  const team = w.team[id];
  const hx = fountainX(team);
  const hy = fountainY();
  const d = distTo(w, id, foe);
  switch (HERO_IDS[w.sub[id]]) {
    case 'clem':
      if (canCast(w, id, 2)) return cast(2, hx, hy, NO_TARGET);
      break;
    case 'sage':
      if (canCast(w, id, 2)) return cast(2, w.x[foe], w.y[foe], NO_TARGET);
      if (canCast(w, id, 1) && d <= abil(w, id).w.range) return cast(1, w.x[foe], w.y[foe], NO_TARGET);
      break;
    case 'brutus':
      if (canCast(w, id, 0) && d <= abil(w, id).q.radius) return cast(0, w.x[id], w.y[id], NO_TARGET);
      if (canCast(w, id, 2)) return cast(2, hx, hy, NO_TARGET);
      break;
    default:
      if (canCast(w, id, 1) && d <= abil(w, id).w.range) return cast(1, w.x[foe], w.y[foe], NO_TARGET);
      if (canCast(w, id, 2)) return cast(2, w.x[id], w.y[id], NO_TARGET);
      break;
  }
  if (p.trick === 'never' || !canCast(w, id, TRICK_SLOT)) return null;
  switch (TRICK_IDS[w.trick[id]]) {
    case 'pounce':
      return cast(TRICK_SLOT, hx, hy, NO_TARGET);
    case 'hiss':
      return d <= TRICKS.hiss.radius ? cast(TRICK_SLOT, w.x[id], w.y[id], NO_TARGET) : null;
    default:
      return null;
  }
}

/** Snack Break when hurt and nobody is near (defensive only). */
export function snackCast(w: World, id: number, p: BotParams): Command | null {
  if (p.trick === 'never' || TRICK_IDS[w.trick[id]] !== 'snack' || !canCast(w, id, TRICK_SLOT)) return null;
  if (hpBp(w, id) >= BOT_AI.snackHpBp || nearestFoe(w, id, BOT_AI.trickThreat) >= 0) return null;
  return cast(TRICK_SLOT, w.x[id], w.y[id], NO_TARGET);
}
