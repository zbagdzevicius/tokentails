/**
 * Lane minions (POC.md §7.1). Waves spawn by the timeline (`spawnWave`); each tick a minion keeps or picks a target
 * (enemy minion, else a vulnerable structure, else a hero, within MINION_AI.acquireRange edge to edge), swings when
 * in range, otherwise walks its lane path. Same-team minions push apart so a wave spreads out instead of stacking.
 */
import { LANES, MAP } from '../../data/map';
import { DIFFICULTY_RULES, RALLY_LEVEL_BP } from '../../data/bots';
import { HUMAN_SLOT, teamOfSlot } from '../api';
import { COMEBACK, MINIONS, MINION_AI, MINION_KINDS, WAVE, type MinionKind } from '../../data/minions';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import { applyBp, clamp, dist2, idiv, isqrt, iatan2, moveToward } from '../fixed';
import { LANE_PATHS } from '../map/lanes';
import type { MatchHandle } from '../state';
import { FM, G, Kind, NEVER, RANGE, UnitState, allocMinion, type World } from '../world';
import { clearStatus } from '../effects/status';
import { fleeStep } from '../effects/fear';
import { stepForced } from '../effects/dash';
import { inAttackRange, startAttack } from '../combat/attack';
import { isStructure, moveSpeed, radiusOf, targetable } from './kinds';

const out = new Int32Array(3);

/**
 * Spawn one wave for both teams in both lanes. The team that takes the lower ids alternates every wave, starting
 * from a seeded side, so no side wins the ascending-id ties (targeting, separation) for the whole match.
 */
export function spawnWave(m: MatchHandle, withSiege: boolean): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const minutes = idiv(tick, TIMELINE.minute);
  const first = (w.globals[G.Wave] + m.config.seed) & 1;
  for (let k2 = 0; k2 < 2; k2++) {
    const team = k2 ^ first;
    // Underdog waves (v4): a siege and +20% HP while the team's comeback lasts.
    const boost = w.globals[team === 0 ? G.Comeback0 : G.Comeback1] > 0;
    // Rally (DifficultyRules.rallyBp): the human's team's minions carry their bonus (whole %) in `level`.
    const rally = team === teamOfSlot(HUMAN_SLOT) ? w.globals[G.Rally] : 0;
    const rallyBp = rally * DIFFICULTY_RULES[m.config.difficulty].rallyBp;
    const order: MinionKind[] = [];
    for (let i = 0; i < WAVE.melee; i++) order.push('melee');
    for (let i = 0; i < WAVE.ranged; i++) order.push('ranged');
    if (withSiege || (boost && COMEBACK.siege)) for (let i = 0; i < WAVE.siege; i++) order.push('siege');
    for (let lane = 0; lane < LANES.length; lane++) {
      const path = LANE_PATHS[team][lane];
      const ax = path.x[0];
      const ay = path.y[0];
      const dx = path.x[1] - ax;
      const dy = path.y[1] - ay;
      const len = isqrt(dx * dx + dy * dy);
      for (let k = 0; k < order.length; k++) {
        const id = allocMinion(w);
        if (id < 0) break; // cap reached: the rest of this wave does not spawn
        const kind = order[k];
        const data = MINIONS[kind];
        const along = Math.max(0, MINION_AI.spawnOffset - k * MINION_AI.spacing);
        const hp = data.hp + applyBp(data.hp, WAVE.hpGrowthBpPerMinute * minutes + (boost ? COMEBACK.hpBp : 0) + rallyBp);
        w.kind[id] = Kind.Minion;
        w.team[id] = team;
        w.alive[id] = 1;
        w.sub[id] = MINION_KINDS.indexOf(kind);
        w.lane[id] = lane;
        w.wave[id] = w.globals[G.Wave];
        w.waypoint[id] = 1;
        w.level[id] = Math.min(0xff, idiv(rallyBp, RALLY_LEVEL_BP));
        w.state[id] = UnitState.Moving;
        w.facing[id] = iatan2(dy, dx);
        w.buffs[id] = 0;
        w.x[id] = ax + idiv(dx * along, len);
        w.y[id] = ay + idiv(dy * along, len);
        w.hp[id] = hp;
        w.maxHp[id] = hp;
        w.shield[id] = 0;
        w.armour[id] = data.armour;
        w.xp[id] = 0;
        w.moveCarry[id] = 0;
        w.moveX[id] = path.x[1];
        w.moveY[id] = path.y[1];
        w.target[id] = -1;
        w.attackTimer[id] = 0;
        w.windup[id] = 0;
        w.timer[id] = 0;
        w.lastHitBy[id] = -1;
        w.hurtTick[id] = NEVER;
        clearStatus(w, id);
      }
    }
  }
}

/**
 * Step 3, before a wave spawns: a team 2+ structures or 6+ takedowns behind starts its underdog waves (COMEBACK),
 * unless it did within COMEBACK.cooldown. Then a wave's spawn spends one of each boosted team's waves.
 */
export function checkComeback(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const enemyToo = DIFFICULTY_RULES[m.config.difficulty].enemyComeback;
  for (let team = 0; team < 2; team++) {
    if (team !== teamOfSlot(HUMAN_SLOT) && !enemyToo) continue;
    const left = team === 0 ? G.Comeback0 : G.Comeback1;
    const at = team === 0 ? G.ComebackAt0 : G.ComebackAt1;
    if (w.globals[left] > 0 || tick - w.globals[at] < COMEBACK.cooldown) continue;
    const towersBehind = w.globals[team === 0 ? G.Towers1 : G.Towers0] - w.globals[team === 0 ? G.Towers0 : G.Towers1];
    const killsBehind = w.globals[team === 0 ? G.Kills1 : G.Kills0] - w.globals[team === 0 ? G.Kills0 : G.Kills1];
    if (towersBehind < COMEBACK.structuresBehind && killsBehind < COMEBACK.takedownsBehind) continue;
    w.globals[left] = COMEBACK.waves;
    w.globals[at] = tick;
    m.events.push({ type: 'comeback', tick, team: team as 0 | 1 });
  }
}

/** After a wave spawned: each boosted team used one of its underdog waves. */
export function spendComeback(w: World): void {
  if (w.globals[G.Comeback0] > 0) w.globals[G.Comeback0]--;
  if (w.globals[G.Comeback1] > 0) w.globals[G.Comeback1]--;
}

/** Target class: 0 minion, 1 structure, 2 hero; lower wins. */
function classOf(w: World, e: number): number {
  if (w.kind[e] === Kind.Minion) return 0;
  return isStructure(w, e) ? 1 : 2;
}

/**
 * Best target within MINION_AI.acquireRange edge to edge: lowest class, then nearest. Within a class the radius is
 * the same for minions and heroes, so squared centre distance orders them; structures (two radii) compare by edge
 * distance.
 */
function acquire(w: World, id: number): number {
  const team = w.team[id];
  const x = w.x[id];
  const y = w.y[id];
  let best = -1;
  let bestClass = 3;
  let bestKey = 0;
  for (let e = 0; e < RANGE.fountains; e++) {
    if (w.alive[e] === 0 || w.team[e] === team || w.team[e] > 1) continue;
    const dx = w.x[e] - x;
    const dy = w.y[e] - y;
    const d2 = dx * dx + dy * dy;
    const reach = MINION_AI.acquireRange + radiusOf(w, e);
    if (d2 > reach * reach) continue;
    const c = classOf(w, e);
    if (c > bestClass || !targetable(w, e, team)) continue;
    const key = c === 1 ? isqrt(d2) - radiusOf(w, e) : d2;
    if (c < bestClass || key < bestKey) {
      best = e;
      bestClass = c;
      bestKey = key;
    }
  }
  return best;
}

function keepTarget(w: World, id: number): boolean {
  const t = w.target[id];
  if (t < 0 || !targetable(w, t, w.team[id])) return false;
  const reach = MINION_AI.acquireRange + MINION_AI.leash + radiusOf(w, t);
  return dist2(w.x[id], w.y[id], w.x[t], w.y[t]) <= reach * reach;
}

/** Step 4 for minions: targeting, swing start, lane walking. */
export function stepMinions(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let id = RANGE.minions; id < RANGE.towers; id++) {
    if (w.alive[id] === 0) continue;
    // Retarget on a stagger (by id) or when the target is gone.
    const stale = !keepTarget(w, id);
    if (stale || (tick + id) % MINION_AI.retargetEvery === 0) {
      const next = acquire(w, id);
      const cur = stale ? -1 : w.target[id];
      // Keep swinging at the current target when it is in range and not a worse class than the best one.
      if (cur >= 0 && next >= 0 && inAttackRange(w, id, cur) && classOf(w, cur) <= classOf(w, next)) w.target[id] = cur;
      else w.target[id] = next;
    }
    // CC: knocked back, stunned, feared.
    if (w.fmKind[id] !== FM.None) {
      stepForced(w, id);
      w.state[id] = UnitState.Moving;
      continue;
    }
    if (w.stunT[id] > 0) {
      w.state[id] = UnitState.Idle;
      continue;
    }
    if (w.fearT[id] > 0) {
      fleeStep(w, m.grid, id);
      w.state[id] = UnitState.Moving;
      continue;
    }
    if (w.windup[id] > 0) continue; // mid-swing: stand
    const t = w.target[id];
    if (t >= 0 && inAttackRange(w, id, t)) {
      w.facing[id] = iatan2(w.y[t] - w.y[id], w.x[t] - w.x[id]);
      if (!startAttack(w, id, t)) w.state[id] = UnitState.Attacking;
      continue;
    }
    // Walk: toward the target, else along the lane.
    let tx: number;
    let ty: number;
    if (t >= 0) {
      tx = w.x[t];
      ty = w.y[t];
    } else {
      const path = LANE_PATHS[w.team[id]][w.lane[id]];
      let wp = w.waypoint[id];
      while (wp < path.length - 1) {
        const dw = dist2(w.x[id], w.y[id], path.x[wp], path.y[wp]);
        const reach = MINION_AI.waypointReach;
        // Reached, or already closer to the next point than this one is (chased past it).
        const dn = dist2(w.x[id], w.y[id], path.x[wp + 1], path.y[wp + 1]);
        const seg = dist2(path.x[wp], path.y[wp], path.x[wp + 1], path.y[wp + 1]);
        if (dw <= reach * reach || dn < seg) wp++;
        else break;
      }
      w.waypoint[id] = wp;
      tx = path.x[wp];
      ty = path.y[wp];
    }
    w.moveX[id] = tx;
    w.moveY[id] = ty;
    if ((tx === w.x[id] && ty === w.y[id]) || w.rootT[id] > 0) {
      w.state[id] = UnitState.Idle;
      continue;
    }
    w.facing[id] = iatan2(ty - w.y[id], tx - w.x[id]);
    moveToward(w.x[id], w.y[id], tx, ty, moveSpeed(w, id), w.moveCarry[id], TICK_HZ, out);
    w.x[id] = out[0];
    w.y[id] = out[1];
    w.moveCarry[id] = out[2];
    w.state[id] = UnitState.Moving;
  }
  separate(w);
}

/** Same-team minions closer than MINION_AI.separation push apart, half each (pairs in ascending id order). */
function separate(w: World): void {
  const s = MINION_AI.separation;
  const s2 = s * s;
  for (let a = RANGE.minions; a < RANGE.towers; a++) {
    if (w.alive[a] === 0) continue;
    for (let b = a + 1; b < RANGE.towers; b++) {
      if (w.alive[b] === 0 || w.team[b] !== w.team[a]) continue;
      let dx = w.x[b] - w.x[a];
      let dy = w.y[b] - w.y[a];
      const d2 = dx * dx + dy * dy;
      if (d2 >= s2) continue;
      let d = isqrt(d2);
      if (d === 0) {
        // Exactly stacked: split along y, the higher id upward.
        dx = 0;
        dy = 1;
        d = 1;
      }
      const push = idiv(s - d, 2);
      const px = idiv(dx * push, d);
      const py = idiv(dy * push, d);
      w.x[a] = clamp(w.x[a] - px, 0, MAP.width);
      w.y[a] = clamp(w.y[a] - py, 0, MAP.height);
      w.x[b] = clamp(w.x[b] + px, 0, MAP.width);
      w.y[b] = clamp(w.y[b] + py, 0, MAP.height);
    }
  }
}
