/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §1.4, §2.1, §2.2): how bots use the Kibble Cannon, the Boing Beds and the Mega
 * Yarn Balls. Pure reads of the world (no RNG): each function writes a point into `out` and says whether to act.
 *
 * - Cannon, carrier: fire at the nearest enemy hero it sees 6 to 14 m away, at where that hero is now (no lead: bots
 *   never dodge either, so a moving human can sidestep the shot), unless a parrying Clem stands in the lane. With
 *   under 3 s of fuse left: at the nearest enemy tower in range, else straight ahead. Rookie's enemy bots spare the
 *   human (DifficultyRules.spareHuman).
 * - Cannon on the ground: a bot goes for it when it is its team's nearest living hero to it (a human counts, so a bot
 *   leaves it to a nearer human) or within CANNON_BOT.grabRange, above CANNON_BOT.grabHpBp HP.
 * - Yarn: a bot within YARN.botRange of a resting ball walks into it when an enemy hero or minion stands within
 *   YARN.botAim beyond it, along the bot's approach (the kick goes away from the kicker).
 * - Beds: a bot within BOING.botRange of a bed whose landing is BOING.botGain nearer its current goal walks onto it.
 */
import { BOING, CANNON, CANNON_BOT, YARN } from '../../data/fun';
import { TIMELINE } from '../../data/timeline';
import { BP_ONE, dist2, idiv, isqrt } from '../fixed';
import { EFFECTS } from '../../data/effects';
import { cellOfTeam, walkable } from '../map/grid';
import type { MatchHandle } from '../state';
import { CANNON_STATE, G, Kind, Order, RANGE, TEAM_NEUTRAL, YARN_STATE, YF, type World } from '../world';
import { rulesOf } from '../rules';
import { isHumanSlot } from '../humans';
import { alongLine } from '../effects/line';
import { parryOpen } from '../heroes/clem';
import { cannonData, carries } from '../units/cannon';
import { yarnAt, yarnCount } from '../units/yarn';
import { bedCount, bedOf } from '../units/boing';
import { isInvulnerable, radiusOf, targetable } from '../units/kinds';

/** Does an enemy Clem with an open parry stand in the lane from `id` to (x, y)? */
function parryInLane(w: World, id: number, x: number, y: number): boolean {
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.team[e] === w.team[id] || w.alive[e] === 0 || !parryOpen(w, e)) continue;
    if (alongLine(w.x[id], w.y[id], x, y, CANNON.radius, w.x[e], w.y[e], CANNON.radius) >= 0) return true;
  }
  return false;
}

/**
 * Would bot `id`'s kibble reach (x, y)? Not if a wall cell lies on the way (sampled every EFFECTS.wallStep, as
 * combat/funshot.ts stops it) or an enemy structure's footprint does (the kibble stops there too).
 */
function clearShot(m: MatchHandle, id: number, x: number, y: number): boolean {
  const w = m.world;
  const ax = w.x[id];
  const ay = w.y[id];
  const team = w.team[id];
  const n = idiv(isqrt(dist2(ax, ay, x, y)), EFFECTS.wallStep) + 1;
  for (let k = 1; k <= n; k++) {
    if (!walkable(m.grid, cellOfTeam(ax + idiv((x - ax) * k, n), ay + idiv((y - ay) * k, n), team))) return false;
  }
  for (let s = RANGE.towers; s < RANGE.fountains; s++) {
    if (w.alive[s] === 0 || w.team[s] === team || w.team[s] >= TEAM_NEUTRAL) continue;
    if (alongLine(ax, ay, x, y, CANNON.radius, w.x[s], w.y[s], radiusOf(w, s)) >= 0) return false;
  }
  return true;
}

/** The carrier's shot: true with the aim point in `out`. */
export function cannonShot(m: MatchHandle, id: number, out: Int32Array): boolean {
  const w = m.world;
  if (!carries(w, id) || w.globals[G.CannonWind] > 0) return false;
  const team = w.team[id];
  const spare = rulesOf(m).spareHuman > 0 && team !== w.team[0];
  const lo = CANNON_BOT.fireMin * CANNON_BOT.fireMin;
  const hi = CANNON_BOT.fireMax * CANNON_BOT.fireMax;
  let best = -1;
  let bestD = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.kind[e] !== Kind.Hero || !targetable(w, e, team) || (spare && isHumanSlot(w, e))) continue;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (d < lo || d > hi || (best >= 0 && d >= bestD) || parryInLane(w, id, w.x[e], w.y[e])) continue;
    if (!clearShot(m, id, w.x[e], w.y[e])) continue;
    best = e;
    bestD = d;
  }
  if (best >= 0) {
    out[0] = w.x[best];
    out[1] = w.y[best];
    return true;
  }
  if (w.globals[G.CannonFuse] > CANNON_BOT.dumpFuse) return false;
  const range = cannonData(w).range;
  let tower = -1;
  for (let s = RANGE.towers; s < RANGE.fountains; s++) {
    if (w.alive[s] === 0 || w.team[s] === team || isInvulnerable(w, s)) continue;
    const d = dist2(w.x[id], w.y[id], w.x[s], w.y[s]);
    if (d > range * range) continue;
    if (tower < 0 || d < bestD) {
      tower = s;
      bestD = d;
    }
  }
  out[0] = tower >= 0 ? w.x[tower] : w.x[id];
  out[1] = tower >= 0 ? w.y[tower] : w.y[id];
  return true;
}

/** Should bot `id` go for the cannon on the ground? The spot in `out`. */
export function cannonGrab(w: World, id: number, out: Int32Array): boolean {
  if (w.globals[G.CannonState] !== CANNON_STATE.Ground || w.hp[id] * BP_ONE < w.maxHp[id] * CANNON_BOT.grabHpBp) return false;
  const x = w.globals[G.CannonX];
  const y = w.globals[G.CannonY];
  const mine = dist2(w.x[id], w.y[id], x, y);
  let nearest = true;
  for (let e = RANGE.heroes; e < RANGE.minions && nearest; e++) {
    if (e === id || w.team[e] !== w.team[id] || w.alive[e] === 0) continue;
    const d = dist2(w.x[e], w.y[e], x, y);
    if (d < mine || (d === mine && e < id)) nearest = false;
  }
  if (!nearest && mine > CANNON_BOT.grabRange * CANNON_BOT.grabRange) return false;
  out[0] = x;
  out[1] = y;
  return true;
}

/** Should bot `id` kick a yarn ball? Writes the ball's spot (walk into it) to `out`. */
export function yarnKick(w: World, id: number, out: Int32Array): boolean {
  const team = w.team[id];
  const r2 = YARN.botRange * YARN.botRange;
  const aim2 = YARN.botAim * YARN.botAim;
  for (let b = 0; b < yarnCount(w); b++) {
    if (w.globals[yarnAt(b, YF.State)] !== YARN_STATE.Rest || w.globals[yarnAt(b, YF.T)] > 0) continue;
    const bx = w.globals[yarnAt(b, YF.X)];
    const by = w.globals[yarnAt(b, YF.Y)];
    if (dist2(w.x[id], w.y[id], bx, by) > r2) continue;
    // The kick direction: from the bot to the ball.
    const kx = bx - w.x[id];
    const ky = by - w.y[id];
    const kl = Math.max(1, isqrt(kx * kx + ky * ky));
    for (let e = RANGE.heroes; e < RANGE.towers; e++) {
      if (w.kind[e] !== Kind.Hero && w.kind[e] !== Kind.Minion) continue;
      if (!targetable(w, e, team)) continue;
      const tx = w.x[e] - bx;
      const ty = w.y[e] - by;
      const t2 = tx * tx + ty * ty;
      if (t2 > aim2 || t2 === 0) continue;
      const tl = isqrt(t2);
      // cos(kick, target) ≥ botCosBp / BP_ONE
      if ((kx * tx + ky * ty) * BP_ONE < YARN.botCosBp * kl * tl) continue;
      out[0] = bx;
      out[1] = by;
      return true;
    }
  }
  return false;
}

const bed = new Int32Array(4);

/** Should bot `id` (with a move or attack-move order) take a bed toward its goal? The bed's spot in `out`. */
export function bedHop(w: World, id: number, out: Int32Array): boolean {
  if (w.boingT[id] > 0 || (w.order[id] !== Order.Move && w.order[id] !== Order.AttackMove)) return false;
  if (w.globals[G.Tick] < TIMELINE.barrierDrop) return false;
  const gx = w.moveX[id];
  const gy = w.moveY[id];
  const here = isqrt(dist2(w.x[id], w.y[id], gx, gy));
  const r2 = BOING.botRange * BOING.botRange;
  for (let i = 0; i < bedCount(w); i++) {
    bedOf(w, i, bed);
    if (dist2(w.x[id], w.y[id], bed[0], bed[1]) > r2) continue;
    if (isqrt(dist2(bed[2], bed[3], gx, gy)) + BOING.botGain > here) continue;
    out[0] = bed[0];
    out[1] = bed[1];
    return true;
  }
  return false;
}

/**
 * Is bot `id` already walking onto a bed or into a resting yarn ball it chose (its move goal is one, within reach)? Then
 * it keeps going instead of taking a lane order that would turn it away.
 */
export function funCommitted(w: World, id: number): boolean {
  if (w.order[id] !== Order.Move) return false;
  const gx = w.moveX[id];
  const gy = w.moveY[id];
  const near = BOING.botRange * BOING.botRange;
  if (dist2(w.x[id], w.y[id], gx, gy) > near) return false;
  for (let i = 0; i < bedCount(w); i++) {
    bedOf(w, i, bed);
    if (gx === bed[0] && gy === bed[1] && w.boingT[id] === 0) return true;
  }
  for (let b = 0; b < yarnCount(w); b++) {
    if (w.globals[yarnAt(b, YF.State)] === YARN_STATE.Rest && gx === w.globals[yarnAt(b, YF.X)] && gy === w.globals[yarnAt(b, YF.Y)]) return true;
  }
  return false;
}
