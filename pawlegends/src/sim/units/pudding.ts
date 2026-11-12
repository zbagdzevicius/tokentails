/**
 * Pudding, the shared objective (POC.md §5). Wild at the river from 5:00: he does not attack, every 4 s he does a
 * scared hop (0.8 s telegraph, then a 4 m knockback ring), and damage fills his calm meter (his HP while wild).
 * The team that lands the calming hit gets Pudding's Courage: he joins that team's next wave in the lane with the
 * most enemy structures left (sim v16, MAP-GAPS B13: tie, the lane whose outermost enemy structure has less HP; tie, a
 * seeded draw; chosen on the calm tick), walks with it, and breathes on the nearest enemy tower or core within 7 m
 * for 200 every 2 s. He leaves when that wave is gone or the enemy dealt him 3,000 damage (his escort HP), and comes
 * back wild 2:30 after he left.
 *
 * Events: `pudding` spawn (wild), hop (the telegraph starts; the ring lands PUDDING.hopTelegraph ticks later),
 * calmed (team = who calmed him), escort (he joined the wave), leave.
 */
import { LANES, PUDDING_SPOT, RADIUS, TOWER_SPOTS } from '../../data/map';
import { grantFish } from '../progression/fish';
import { FISH } from '../../data/fish';
import { PUDDING, PUD_STATE } from '../../data/pudding';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import type { Team } from '../api';
import { dist2, idiv, iatan2, isqrt, moveToward } from '../fixed';
import { LANE_PATHS } from '../map/lanes';
import type { MatchHandle } from '../state';
import { grantSugarRush } from './sugar';
import { G, Kind, NEVER, RANGE, TEAM_NEUTRAL, UnitState, type World } from '../world';
import { clearStatus } from '../effects/status';
import { knockback } from '../effects/knockback';
import { dealDamage } from '../combat/damage';
import { radiusOf } from './kinds';
import { Rng } from '../rng';

const out = new Int32Array(3);

/** Match start: the slot exists (away) so the snapshot kind is right; the first spawn is at TIMELINE.pudding. */
export function initPudding(w: World): void {
  w.kind[RANGE.pudding] = Kind.Pudding;
  w.team[RANGE.pudding] = TEAM_NEUTRAL;
  w.alive[RANGE.pudding] = 0;
  w.globals[G.PudState] = PUD_STATE.Away;
  w.globals[G.PudAt] = TIMELINE.pudding;
  w.globals[G.PudTeam] = TEAM_NEUTRAL;
}

function place(w: World, team: number, hp: number, x: number, y: number): void {
  w.alive[RANGE.pudding] = 1;
  w.team[RANGE.pudding] = team;
  w.hp[RANGE.pudding] = hp;
  w.maxHp[RANGE.pudding] = hp;
  w.armour[RANGE.pudding] = 0;
  w.shield[RANGE.pudding] = 0;
  w.x[RANGE.pudding] = x;
  w.y[RANGE.pudding] = y;
  w.moveX[RANGE.pudding] = x;
  w.moveY[RANGE.pudding] = y;
  w.moveCarry[RANGE.pudding] = 0;
  w.state[RANGE.pudding] = UnitState.Idle;
  w.target[RANGE.pudding] = -1;
  w.lastHitBy[RANGE.pudding] = -1;
  w.hurtTick[RANGE.pudding] = NEVER;
  w.buffs[RANGE.pudding] = 0;
  clearStatus(w, RANGE.pudding);
}

/** Enemy structures still standing in `lane`, for `team`'s escort. */
function enemyStructuresIn(w: World, team: number, lane: number): number {
  const enemy = 1 - team;
  let n = 0;
  for (let k = 0; k < TOWER_SPOTS.length; k++) {
    if (LANES.indexOf(TOWER_SPOTS[k].lane!) === lane && w.alive[RANGE.towers + enemy * TOWER_SPOTS.length + k] === 1) n++;
  }
  return n;
}

/** HP of `team`'s enemy's outermost standing structure in `lane` (the core once both towers fell). */
function outermostEnemyHp(w: World, team: number, lane: number): number {
  const base = RANGE.towers + (1 - team) * TOWER_SPOTS.length;
  for (let pass = 0; pass < 2; pass++) {
    const tier = pass === 0 ? 'outer' : 'inner';
    for (let k = 0; k < TOWER_SPOTS.length; k++) {
      if (LANES.indexOf(TOWER_SPOTS[k].lane!) === lane && TOWER_SPOTS[k].tier === tier && w.alive[base + k] === 1) return w.hp[base + k];
    }
  }
  return w.hp[RANGE.cores + 1 - team];
}

/**
 * Sim v16 (MAP-GAPS B13): the escort lane, chosen on the calm tick: the lane with the most enemy structures left;
 * tie, the one whose outermost enemy structure has less HP; tie, a draw from its own fork of the seed (one per
 * spawn), so the match stream never shifts and no side always gets Sunny.
 */
function escortLane(m: MatchHandle, team: number): number {
  const w = m.world;
  // Sim v19 (Hearthwood, MAP-5V5.md §1.7): the lane where the enemy has the fewest towers standing (a push that
  // finishes something); ties: Yarn Road, then Fenceline, then Gutterway.
  if (LANES.length > 2) {
    let best = 1;
    let bestN = enemyStructuresIn(w, team, 1);
    for (let l = 0; l < LANES.length; l++) {
      const n = enemyStructuresIn(w, team, l);
      if (n < bestN) {
        best = l;
        bestN = n;
      }
    }
    return best;
  }
  const a = enemyStructuresIn(w, team, 0);
  const b = enemyStructuresIn(w, team, 1);
  if (a !== b) return a > b ? 0 : 1;
  const ha = outermostEnemyHp(w, team, 0);
  const hb = outermostEnemyHp(w, team, 1);
  if (ha !== hb) return ha < hb ? 0 : 1;
  return new Rng(m.config.seed >>> 0).fork(`pudlane:${w.globals[G.PudSpawns]}`).int(LANES.length);
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
    if (w.mg.length > 0) m.events.push({ type: 'objectiveSpawn', tick, kind: 'pudding' });
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
    const lane = w.globals[G.PudLane];
    const path = LANE_PATHS[team][lane];
    const dx = path.x[1] - path.x[0];
    const dy = path.y[1] - path.y[0];
    const len = isqrt(dx * dx + dy * dy);
    const along = PUDDING.escortSpawnOffset;
    place(w, team, PUDDING.escortHp, path.x[0] + idiv(dx * along, len), path.y[0] + idiv(dy * along, len));
    w.waypoint[RANGE.pudding] = 1;
    w.lane[RANGE.pudding] = lane;
    w.facing[RANGE.pudding] = iatan2(dy, dx);
    w.globals[G.PudWave] = w.globals[G.Wave];
    w.globals[G.PudState] = PUD_STATE.Escort;
    w.globals[G.PudBreath] = PUDDING.escortBreathEvery;
    m.events.push({ type: 'pudding', tick, what: 'escort', team: team as Team });
    return;
  }
  // Escort: leaves when his wave is gone.
  for (let id = RANGE.minions; id < RANGE.towers; id++) {
    if (w.alive[id] === 1 && w.team[id] === w.team[RANGE.pudding] && w.wave[id] === w.globals[G.PudWave]) return;
  }
  leave(m);
}

/** The scared hop lands: everything that can be displaced within the ring is pushed out. */
function hop(m: MatchHandle): void {
  const w = m.world;
  for (let id = 0; id < RANGE.pudding; id++) {
    if (w.alive[id] === 0 || (w.kind[id] !== Kind.Hero && w.kind[id] !== Kind.Minion && w.kind[id] !== Kind.Camp)) continue;
    const r = PUDDING.hopRadius + radiusOf(w, id);
    if (dist2(w.x[id], w.y[id], w.x[RANGE.pudding], w.y[RANGE.pudding]) > r * r) continue;
    knockback(m, id, w.x[RANGE.pudding], w.y[RANGE.pudding], PUDDING.hopKnockback, w.facing[id]);
  }
}

function leave(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  w.alive[RANGE.pudding] = 0;
  w.hp[RANGE.pudding] = 0;
  w.team[RANGE.pudding] = TEAM_NEUTRAL;
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
  const by = w.lastHitBy[RANGE.pudding];
  const team = by >= 0 && w.team[by] < 2 ? w.team[by] : TEAM_NEUTRAL;
  w.alive[RANGE.pudding] = 0;
  w.hp[RANGE.pudding] = 0;
  w.globals[G.PudHop] = 0;
  if (team === TEAM_NEUTRAL) {
    // Nobody to reward (cannot happen with today's damage sources): treat it as a leave.
    leave(m);
    return;
  }
  w.globals[G.PudState] = PUD_STATE.Waiting;
  w.globals[G.PudTeam] = team;
  w.globals[G.PudLane] = escortLane(m, team);
  m.events.push({ type: 'pudding', tick: w.globals[G.Tick], what: 'calmed', team: team as Team });
  if (w.mg.length > 0) m.events.push({ type: 'objective', tick: w.globals[G.Tick], kind: 'pudding', team: team as Team, slot: by >= 0 && by < RANGE.minions ? by : -1 });
  // Sim v12: every hero of the calming team gets FISH.pudding.
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.kind[h] === Kind.Hero && w.team[h] === team) grantFish(m, h, FISH.pudding, 'pudding');
  // Sim v22 (Hearthwood): and Sugar Rush.
  grantSugarRush(m, team);
}

/** Nearest standing enemy structure within breath range of the escort, or −1. */
function breathTarget(w: World): number {
  let best = -1;
  let bestD = 0;
  for (let id = RANGE.towers; id < RANGE.fountains; id++) {
    if (w.alive[id] === 0 || w.team[id] === w.team[RANGE.pudding]) continue;
    const r = PUDDING.escortBreathRange + radiusOf(w, id);
    const d = dist2(w.x[RANGE.pudding], w.y[RANGE.pudding], w.x[id], w.y[id]);
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
  if (w.globals[G.PudState] !== PUD_STATE.Escort || w.alive[RANGE.pudding] === 0) return;
  if (w.globals[G.PudBreath] > 0) w.globals[G.PudBreath]--;
  const t = breathTarget(w);
  if (t >= 0) {
    w.facing[RANGE.pudding] = iatan2(w.y[t] - w.y[RANGE.pudding], w.x[t] - w.x[RANGE.pudding]);
    w.state[RANGE.pudding] = UnitState.Attacking;
    if (w.globals[G.PudBreath] === 0) {
      w.globals[G.PudBreath] = PUDDING.escortBreathEvery;
      dealDamage(m, RANGE.pudding, w.team[RANGE.pudding], Kind.Pudding, t, PUDDING.escortBreathDamage, 'ability');
    }
    return;
  }
  const path = LANE_PATHS[w.team[RANGE.pudding]][w.lane[RANGE.pudding]];
  let wp = w.waypoint[RANGE.pudding];
  if (wp >= path.length) return;
  if (dist2(w.x[RANGE.pudding], w.y[RANGE.pudding], path.x[wp], path.y[wp]) <= RADIUS.minion * RADIUS.minion && wp < path.length - 1) wp++;
  w.waypoint[RANGE.pudding] = wp;
  const tx = path.x[wp];
  const ty = path.y[wp];
  if (tx === w.x[RANGE.pudding] && ty === w.y[RANGE.pudding]) return;
  w.facing[RANGE.pudding] = iatan2(ty - w.y[RANGE.pudding], tx - w.x[RANGE.pudding]);
  moveToward(w.x[RANGE.pudding], w.y[RANGE.pudding], tx, ty, PUDDING.escortSpeed, w.moveCarry[RANGE.pudding], TICK_HZ, out);
  w.x[RANGE.pudding] = out[0];
  w.y[RANGE.pudding] = out[1];
  w.moveCarry[RANGE.pudding] = out[2];
  w.state[RANGE.pudding] = UnitState.Moving;
}
