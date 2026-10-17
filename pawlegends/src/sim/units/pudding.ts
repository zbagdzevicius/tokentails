/**
 * Pudding, the shared objective (POC.md §5). Wild at the river from 5:00: he does not attack, every 4 s he does a
 * scared hop (0.8 s telegraph, then a 4 m knockback ring), and damage fills his calm meter (his HP while wild).
 * The team that lands the calming hit gets Pudding's Courage: he joins that team's next wave in the lane with the
 * most enemy structures left (tie: Sunny), walks with it, and breathes on the nearest enemy tower or core within 7 m
 * for 200 every 2 s. He leaves when that wave is gone or the enemy dealt him 3,000 damage (his escort HP), and comes
 * back wild 2:30 after he left.
 *
 * Events: `pudding` spawn (wild), hop (the telegraph starts; the ring lands PUDDING.hopTelegraph ticks later),
 * calmed (team = who calmed him), escort (he joined the wave), leave.
 */
import { LANES, PUDDING_SPOT, RADIUS, TOWER_SPOTS } from '../../data/map';
import { PUDDING, PUD_STATE } from '../../data/pudding';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import type { Team } from '../api';
import { dist2, idiv, iatan2, isqrt, moveToward } from '../fixed';
import { LANE_PATHS } from '../map/lanes';
import type { MatchHandle } from '../state';
import { G, Kind, NEVER, RANGE, TEAM_NEUTRAL, UnitState, type World } from '../world';
import { clearStatus } from '../effects/status';
import { knockback } from '../effects/knockback';
import { dealDamage } from '../combat/damage';
import { radiusOf } from './kinds';

const out = new Int32Array(3);
const P = RANGE.pudding;

/** Match start: the slot exists (away) so the snapshot kind is right; the first spawn is at TIMELINE.pudding. */
export function initPudding(w: World): void {
  w.kind[P] = Kind.Pudding;
  w.team[P] = TEAM_NEUTRAL;
  w.alive[P] = 0;
  w.globals[G.PudState] = PUD_STATE.Away;
  w.globals[G.PudAt] = TIMELINE.pudding;
  w.globals[G.PudTeam] = TEAM_NEUTRAL;
}

function place(w: World, team: number, hp: number, x: number, y: number): void {
  w.alive[P] = 1;
  w.team[P] = team;
  w.hp[P] = hp;
  w.maxHp[P] = hp;
  w.armour[P] = 0;
  w.shield[P] = 0;
  w.x[P] = x;
  w.y[P] = y;
  w.moveX[P] = x;
  w.moveY[P] = y;
  w.moveCarry[P] = 0;
  w.state[P] = UnitState.Idle;
  w.target[P] = -1;
  w.lastHitBy[P] = -1;
  w.hurtTick[P] = NEVER;
  w.buffs[P] = 0;
  clearStatus(w, P);
}

/** Enemy structures still standing in `lane`, for `team`'s escort. */
function enemyStructuresIn(w: World, team: number, lane: number): number {
  const enemy = 1 - team;
  let n = 0;
  for (let k = 0; k < TOWER_SPOTS.length; k++) {
    if (LANES.indexOf(TOWER_SPOTS[k].lane) === lane && w.alive[RANGE.towers + enemy * TOWER_SPOTS.length + k] === 1) n++;
  }
  return n;
}

/** Step 3. Spawns, the hop, and the escort's wave check. `waveSpawned` = a wave spawned this tick. */
export function stepPuddingTimeline(m: MatchHandle, waveSpawned: boolean): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const state = w.globals[G.PudState];
  if (state === PUD_STATE.Away) {
    if (tick < w.globals[G.PudAt]) return;
    place(w, TEAM_NEUTRAL, PUDDING.calm, PUDDING_SPOT.x, PUDDING_SPOT.y);
    w.globals[G.PudState] = PUD_STATE.Wild;
    w.globals[G.PudAt] = tick + PUDDING.hopEvery;
    w.globals[G.PudHop] = 0;
    w.globals[G.PudSpawns]++;
    m.events.push({ type: 'pudding', tick, what: 'spawn' });
    return;
  }
  if (state === PUD_STATE.Wild) {
    if (w.globals[G.PudHop] > 0 && --w.globals[G.PudHop] === 0) hop(m);
    if (tick >= w.globals[G.PudAt]) {
      w.globals[G.PudAt] = tick + PUDDING.hopEvery;
      w.globals[G.PudHop] = PUDDING.hopTelegraph;
      m.events.push({ type: 'pudding', tick, what: 'hop' });
    }
    return;
  }
  if (state === PUD_STATE.Waiting) {
    if (!waveSpawned) return;
    const team = w.globals[G.PudTeam];
    let lane = 0;
    for (let l = 1; l < LANES.length; l++) if (enemyStructuresIn(w, team, l) > enemyStructuresIn(w, team, lane)) lane = l;
    const path = LANE_PATHS[team][lane];
    const dx = path.x[1] - path.x[0];
    const dy = path.y[1] - path.y[0];
    const len = isqrt(dx * dx + dy * dy);
    const along = PUDDING.escortSpawnOffset;
    place(w, team, PUDDING.escortHp, path.x[0] + idiv(dx * along, len), path.y[0] + idiv(dy * along, len));
    w.waypoint[P] = 1;
    w.lane[P] = lane;
    w.facing[P] = iatan2(dy, dx);
    w.globals[G.PudLane] = lane;
    w.globals[G.PudWave] = w.globals[G.Wave];
    w.globals[G.PudState] = PUD_STATE.Escort;
    w.globals[G.PudBreath] = PUDDING.escortBreathEvery;
    m.events.push({ type: 'pudding', tick, what: 'escort', team: team as Team });
    return;
  }
  // Escort: leaves when his wave is gone.
  for (let id = RANGE.minions; id < RANGE.towers; id++) {
    if (w.alive[id] === 1 && w.team[id] === w.team[P] && w.wave[id] === w.globals[G.PudWave]) return;
  }
  leave(m);
}

/** The scared hop lands: everything that can be displaced within the ring is pushed out. */
function hop(m: MatchHandle): void {
  const w = m.world;
  for (let id = 0; id < RANGE.pudding; id++) {
    if (w.alive[id] === 0 || (w.kind[id] !== Kind.Hero && w.kind[id] !== Kind.Minion && w.kind[id] !== Kind.Camp)) continue;
    const r = PUDDING.hopRadius + radiusOf(w, id);
    if (dist2(w.x[id], w.y[id], w.x[P], w.y[P]) > r * r) continue;
    knockback(m, id, w.x[P], w.y[P], PUDDING.hopKnockback, w.facing[id]);
  }
}

function leave(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  w.alive[P] = 0;
  w.hp[P] = 0;
  w.team[P] = TEAM_NEUTRAL;
  w.globals[G.PudState] = PUD_STATE.Away;
  w.globals[G.PudAt] = tick + PUDDING.respawn;
  w.globals[G.PudTeam] = TEAM_NEUTRAL;
  m.events.push({ type: 'pudding', tick, what: 'leave' });
}

/**
 * Step 7: Pudding at 0 HP. Wild: calmed by the team of whoever landed the last hit (he leaves the map until that
 * team's next wave). Escort: the enemy dealt him his escort HP, so he leaves.
 */
export function onPuddingDown(m: MatchHandle): void {
  const w = m.world;
  if (w.globals[G.PudState] === PUD_STATE.Escort) {
    leave(m);
    return;
  }
  const by = w.lastHitBy[P];
  const team = by >= 0 && w.team[by] < 2 ? w.team[by] : TEAM_NEUTRAL;
  w.alive[P] = 0;
  w.hp[P] = 0;
  w.globals[G.PudHop] = 0;
  if (team === TEAM_NEUTRAL) {
    // Nobody to reward (cannot happen with today's damage sources): treat it as a leave.
    leave(m);
    return;
  }
  w.globals[G.PudState] = PUD_STATE.Waiting;
  w.globals[G.PudTeam] = team;
  m.events.push({ type: 'pudding', tick: w.globals[G.Tick], what: 'calmed', team: team as Team });
}

/** Nearest standing enemy structure within breath range of the escort, or −1. */
function breathTarget(w: World): number {
  let best = -1;
  let bestD = 0;
  for (let id = RANGE.towers; id < RANGE.fountains; id++) {
    if (w.alive[id] === 0 || w.team[id] === w.team[P]) continue;
    const r = PUDDING.escortBreathRange + radiusOf(w, id);
    const d = dist2(w.x[P], w.y[P], w.x[id], w.y[id]);
    if (d > r * r) continue;
    if (best < 0 || d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** Step 4: the escort walks his lane and stops to breathe on the first enemy structure in range. */
export function stepPudding(m: MatchHandle): void {
  const w = m.world;
  if (w.globals[G.PudState] !== PUD_STATE.Escort || w.alive[P] === 0) return;
  if (w.globals[G.PudBreath] > 0) w.globals[G.PudBreath]--;
  const t = breathTarget(w);
  if (t >= 0) {
    w.facing[P] = iatan2(w.y[t] - w.y[P], w.x[t] - w.x[P]);
    w.state[P] = UnitState.Attacking;
    if (w.globals[G.PudBreath] === 0) {
      w.globals[G.PudBreath] = PUDDING.escortBreathEvery;
      dealDamage(m, P, w.team[P], Kind.Pudding, t, PUDDING.escortBreathDamage, 'ability');
    }
    return;
  }
  const path = LANE_PATHS[w.team[P]][w.lane[P]];
  let wp = w.waypoint[P];
  if (wp >= path.length) return;
  if (dist2(w.x[P], w.y[P], path.x[wp], path.y[wp]) <= RADIUS.minion * RADIUS.minion && wp < path.length - 1) wp++;
  w.waypoint[P] = wp;
  const tx = path.x[wp];
  const ty = path.y[wp];
  if (tx === w.x[P] && ty === w.y[P]) return;
  w.facing[P] = iatan2(ty - w.y[P], tx - w.x[P]);
  moveToward(w.x[P], w.y[P], tx, ty, PUDDING.escortSpeed, w.moveCarry[P], TICK_HZ, out);
  w.x[P] = out[0];
  w.y[P] = out[1];
  w.moveCarry[P] = out[2];
  w.state[P] = UnitState.Moving;
}
