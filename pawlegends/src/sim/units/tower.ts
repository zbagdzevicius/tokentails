/**
 * Towers and cores (POC.md §5 tower rules; §4.3 step 8). Each tick a structure keeps a valid target or picks a new
 * one: the nearest enemy minion in range, else the nearest enemy hero in range. The hero-aggro rule (a hero that
 * damages an allied hero in range) forces the target in `dealDamage`. Shots are homing bolts; the ramp counts
 * consecutive shots at the same hero.
 */
import { PROJECTILE_KIND, TOWERS } from '../../data/towers';
import { dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { Buff, G, Kind, RANGE, type World } from '../world';
import { coverDisc } from '../map/grid';
import { grantXp } from '../progression/levels';
import { fireBolt, inAttackRange, structureShot } from '../combat/attack';
import { attackEvery, isInvulnerable, radiusOf, targetable } from './kinds';

/** Nearest targetable enemy of `kind` in range of structure `id`, or −1 (ties: lowest id). */
function nearestInRange(w: World, id: number, from: number, to: number): number {
  let best = -1;
  let bestD = 0;
  for (let e = from; e < to; e++) {
    if (w.alive[e] === 0 || w.team[e] === w.team[id] || w.team[e] > 1) continue;
    if (!inAttackRange(w, id, e) || !targetable(w, e, w.team[id])) continue;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (best < 0 || d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function chooseTarget(w: World, id: number): number {
  const cur = w.target[id];
  if (cur >= 0 && targetable(w, cur, w.team[id]) && inAttackRange(w, id, cur)) {
    // A forced hero target holds; an unforced hero target yields to a minion as soon as one is in range.
    if (w.forced[id] === 1 || w.kind[cur] === Kind.Minion) return cur;
    const minion = nearestInRange(w, id, RANGE.minions, RANGE.towers);
    return minion >= 0 ? minion : cur;
  }
  w.forced[id] = 0;
  const minion = nearestInRange(w, id, RANGE.minions, RANGE.towers);
  if (minion >= 0) return minion;
  return nearestInRange(w, id, RANGE.heroes, RANGE.minions);
}

/** Step 8: structures choose targets and shoot. Also refreshes the Invulnerable flag the snapshot shows. */
export function stepStructures(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.towers; id < RANGE.fountains; id++) {
    if (w.alive[id] === 0) continue;
    if (isInvulnerable(w, id)) w.buffs[id] |= Buff.Invulnerable;
    else w.buffs[id] &= ~Buff.Invulnerable;
    if (w.attackTimer[id] > 0) w.attackTimer[id]--;
    const t = chooseTarget(w, id);
    w.target[id] = t;
    // Lock-on (v4): a new hero target is marked first and shot only after TOWERS.lockOnTicks.
    if (t >= 0 && w.kind[t] === Kind.Hero) {
      if (w.lockId[id] !== t) {
        w.lockId[id] = t;
        w.lockT[id] = TOWERS.lockOnTicks;
        m.events.push({ type: 'windup', tick: w.globals[G.Tick], src: id, slot: 4, x: w.x[t], y: w.y[t], ticks: TOWERS.lockOnTicks });
      }
    } else {
      w.lockId[id] = -1;
      w.lockT[id] = 0;
    }
    if (w.lockT[id] > 0) {
      w.lockT[id]--;
      continue;
    }
    if (t < 0 || w.attackTimer[id] > 0) continue;
    // Ramp: consecutive shots at the same hero.
    if (w.kind[t] === Kind.Hero && w.shotAt[id] === t) w.streak[id]++;
    else w.streak[id] = 0;
    w.shotAt[id] = t;
    fireBolt(w, id, t, structureShot(w, id, t), TOWERS.projectile, w.kind[id] === Kind.Core ? PROJECTILE_KIND.core : PROJECTILE_KIND.tower);
    w.attackTimer[id] = attackEvery(w, id);
  }
}

/** Block the nav cells of every standing structure (match start). */
export function coverStructures(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.towers; id < RANGE.fountains; id++) {
    if (w.alive[id] === 1) coverDisc(m.grid, w.x[id], w.y[id], radiusOf(w, id), 1);
  }
}

/** A tower or core fell: free its nav cells, count it, announce it. */
export function onStructureDestroyed(m: MatchHandle, id: number): void {
  const w = m.world;
  coverDisc(m.grid, w.x[id], w.y[id], radiusOf(w, id), -1);
  w.buffs[id] = 0;
  if (w.kind[id] === Kind.Tower) {
    const by = 1 - w.team[id];
    w.globals[by === 0 ? G.Towers0 : G.Towers1]++;
    m.events.push({ type: 'tower', tick: w.globals[G.Tick], id, destroyedBy: by === 0 ? 0 : 1 });
    for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === by) grantXp(m, h, TOWERS.teamXp, 'tower');
  }
}
